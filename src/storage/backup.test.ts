import { describe, expect, it } from 'vitest';

import { WORKSPACE_SCHEMA_VERSION } from '../domain/models';
import { FIXED_NOW, makeNote, makeProject, makeSnippet, makeTag, makeTask, makeWorkspace, withoutFavorite } from '../test/fixtures';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, MAX_BACKUP_BYTES, createBackup, parseBackup, serializeBackup } from './backup';

const workspace = makeWorkspace({
  projects: [makeProject({ technologies: ['Luau'], links: [{ label: 'Repo', url: 'https://github.com/a/b' }] })],
  tasks: [makeTask({ projectId: 'project-1' })],
  notes: [makeNote()],
  snippets: [makeSnippet({ projectId: 'project-1' })],
});

const envelope = (data: unknown, overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ format: BACKUP_FORMAT, formatVersion: BACKUP_FORMAT_VERSION, exportedAt: FIXED_NOW.toISOString(), workspace: data, ...overrides });

describe('backup export', () => {
  it('wraps the complete workspace in a versioned envelope', () => {
    const file = JSON.parse(serializeBackup(createBackup(workspace, FIXED_NOW)));
    expect(file).toEqual({
      format: 'void-backup',
      formatVersion: 1,
      exportedAt: FIXED_NOW.toISOString(),
      workspace: { ...workspace, schemaVersion: WORKSPACE_SCHEMA_VERSION },
    });
  });

  it('round-trips through parseBackup without losing anything', () => {
    const parsed = parseBackup(serializeBackup(createBackup(workspace, FIXED_NOW)));
    expect(parsed).toEqual({
      ok: true,
      value: { workspace, exportedAt: FIXED_NOW.toISOString(), sourceSchemaVersion: WORKSPACE_SCHEMA_VERSION, clearedReferences: 0, clearedTagReferences: 0, mergedTags: 0 },
    });
  });
});

describe('backup import validation', () => {
  it('rejects files that are not JSON', () => {
    expect(parseBackup('{oops')).toMatchObject({ ok: false, error: { kind: 'not-json' } });
  });

  it('rejects JSON that is not a VOID backup', () => {
    expect(parseBackup('[1,2,3]')).toMatchObject({ ok: false, error: { kind: 'wrong-format' } });
    expect(parseBackup('{"hello":"world"}')).toMatchObject({ ok: false, error: { kind: 'wrong-format' } });
    expect(parseBackup(envelope(workspace, { format: 'other-app' }))).toMatchObject({ ok: false, error: { kind: 'wrong-format' } });
  });

  it('rejects backups from a newer file format or data format', () => {
    expect(parseBackup(envelope(workspace, { formatVersion: BACKUP_FORMAT_VERSION + 1 }))).toMatchObject({
      ok: false,
      error: { kind: 'unsupported-version' },
    });
    expect(parseBackup(envelope({ ...workspace, schemaVersion: WORKSPACE_SCHEMA_VERSION + 1 }))).toMatchObject({
      ok: false,
      error: { kind: 'unsupported-version' },
    });
  });

  it('rejects a damaged envelope', () => {
    expect(parseBackup(envelope(workspace, { exportedAt: 'yesterday' }))).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  });

  it('rejects data that fails schema validation and names the problem', () => {
    const broken = { ...workspace, tasks: [{ ...makeTask(), priority: 'urgent' }] };
    const result = parseBackup(envelope(broken));
    expect(result.ok).toBe(false);
    if (result.ok || result.error.kind !== 'invalid') throw new Error('expected invalid');
    expect(result.error.issues[0]).toContain('tasks.0.priority');
  });

  it('rejects duplicate ids inside the file', () => {
    const duplicated = { ...workspace, notes: [makeNote(), makeNote({ title: 'Copy' })] };
    const result = parseBackup(envelope(duplicated));
    expect(result).toMatchObject({ ok: false, error: { kind: 'invalid', message: 'The backup contains duplicate entries.' } });
  });

  it('rejects files that are far too large', () => {
    expect(parseBackup(' '.repeat(MAX_BACKUP_BYTES + 1))).toMatchObject({ ok: false, error: { kind: 'too-large' } });
  });

  it('accepts plain v1 workspace exports from VOID 0.1 and migrates them', () => {
    const v1 = {
      schemaVersion: 1,
      projects: [{ ...makeProject(), technologies: undefined, links: undefined }],
      tasks: [],
      notes: [],
      snippets: [{ ...makeSnippet(), projectId: undefined }],
    };
    const result = parseBackup(JSON.stringify(v1));
    expect(result).toMatchObject({ ok: true, value: { exportedAt: null, sourceSchemaVersion: 1 } });
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.workspace.projects[0]).toMatchObject({ technologies: [], links: [] });
    expect(result.value.workspace.snippets[0]?.projectId).toBeNull();
  });

  it('clears references to projects that are missing from the file', () => {
    const orphaned = { ...workspace, projects: [], snippets: [] };
    const result = parseBackup(envelope(orphaned));
    expect(result).toMatchObject({ ok: true, value: { clearedReferences: 1 } });
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.workspace.tasks[0]?.projectId).toBeNull();
  });

  it('exports and re-imports tags and their assignments unchanged', () => {
    const withTags = { ...workspace, tags: [makeTag({ id: 't-ui', name: 'UI', color: 'violet' })], tasks: [makeTask({ tagIds: ['t-ui'] })] };
    const result = parseBackup(serializeBackup(createBackup(withTags, FIXED_NOW)));
    expect(result).toMatchObject({ ok: true, value: { workspace: withTags, clearedTagReferences: 0, mergedTags: 0 } });
  });

  it('upgrades v2 backups (before tags) and keeps every item', () => {
    const v2 = {
      schemaVersion: 2,
      projects: [{ ...makeProject(), tagIds: undefined }],
      tasks: [{ ...makeTask(), tagIds: undefined }],
      notes: [{ ...makeNote(), tagIds: undefined }],
      snippets: [{ ...makeSnippet(), tagIds: undefined }],
    };
    const result = parseBackup(envelope(v2));
    expect(result).toMatchObject({ ok: true, value: { sourceSchemaVersion: 2 } });
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.workspace).toEqual(
      makeWorkspace({ projects: [makeProject()], tasks: [makeTask()], notes: [makeNote()], snippets: [makeSnippet()] }),
    );
  });

  it('rejects duplicate tag ids and invalid tag definitions', () => {
    const duplicateIds = { ...workspace, tags: [makeTag(), makeTag({ name: 'Other' })] };
    expect(parseBackup(envelope(duplicateIds))).toMatchObject({ ok: false, error: { kind: 'invalid', message: 'The backup contains duplicate entries.' } });
    const emptyName = { ...workspace, tags: [makeTag({ name: '' })] };
    expect(parseBackup(envelope(emptyName))).toMatchObject({ ok: false, error: { kind: 'invalid' } });
    const notAList = { ...workspace, tags: 'Frontend' };
    expect(parseBackup(envelope(notAList))).toMatchObject({ ok: false, error: { kind: 'invalid' } });
  });

  it('merges tags with the same name and drops references to missing tags', () => {
    const file = {
      ...workspace,
      tags: [makeTag({ id: 't-a', name: 'Bug' }), makeTag({ id: 't-b', name: 'BUG' })],
      tasks: [makeTask({ tagIds: ['t-b', 'missing'] })],
    };
    const result = parseBackup(envelope(file));
    expect(result).toMatchObject({ ok: true, value: { mergedTags: 1, clearedTagReferences: 1 } });
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.workspace.tags.map((tag) => tag.id)).toEqual(['t-a']);
    expect(result.value.workspace.tasks[0]?.tagIds).toEqual(['t-a']);
  });

  it('exports and re-imports favourites of all four types', () => {
    const favorites = makeWorkspace({
      projects: [makeProject({ favorite: true })],
      tasks: [makeTask({ favorite: true }), makeTask({ id: 'task-2' })],
      notes: [makeNote({ favorite: true })],
      snippets: [makeSnippet({ favorite: true })],
    });
    const file = JSON.parse(serializeBackup(createBackup(favorites, FIXED_NOW)));
    expect(file.workspace.tasks.map((task: { favorite: boolean }) => task.favorite)).toEqual([true, false]);
    expect(parseBackup(serializeBackup(createBackup(favorites, FIXED_NOW)))).toMatchObject({ ok: true, value: { workspace: favorites } });
  });

  it('upgrades v3 backups (before favourites): nothing becomes a favourite', () => {
    const v3 = {
      ...workspace,
      schemaVersion: 3,
      projects: workspace.projects.map(withoutFavorite),
      notes: workspace.notes.map(withoutFavorite),
    };
    const result = parseBackup(envelope(v3));
    expect(result).toMatchObject({ ok: true, value: { sourceSchemaVersion: 3, workspace } });
  });

  it('keeps favourites from the file and ignores broken favourite values', () => {
    const file = { ...workspace, projects: [{ ...makeProject(), favorite: 'yes' }], notes: [makeNote({ favorite: true })] };
    const result = parseBackup(envelope(file));
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.workspace.projects[0]?.favorite).toBe(false);
    expect(result.value.workspace.notes[0]?.favorite).toBe(true);
  });
});
