import { describe, expect, it } from 'vitest';

import type { Tag } from './models';
import { FIXED_NOW, makeNote, makeProject, makeTag, makeTask, makeWorkspace, sequentialIds } from '../test/fixtures';
import { analyzeImport, applyImport } from './import';

const context = () => ({ now: FIXED_NOW, createId: sequentialIds('new') });

const current = makeWorkspace({
  projects: [makeProject()],
  tasks: [makeTask({ projectId: 'project-1' })],
  notes: [makeNote()],
});

const imported = makeWorkspace({
  // Same id, different content: a conflict.
  projects: [makeProject({ name: 'Obby Rush (laptop)' })],
  tasks: [
    // Identical to the current one: never imported twice.
    makeTask({ projectId: 'project-1' }),
    makeTask({ id: 'task-2', title: 'New task', projectId: 'project-1' }),
  ],
  notes: [],
});

describe('analyzeImport', () => {
  it('counts new, identical and conflicting items per type', () => {
    expect(analyzeImport(current, imported)).toEqual({
      projects: { total: 1, added: 0, identical: 0, conflicting: 1 },
      tasks: { total: 2, added: 1, identical: 1, conflicting: 0 },
      notes: { total: 0, added: 0, identical: 0, conflicting: 0 },
      snippets: { total: 0, added: 0, identical: 0, conflicting: 0 },
      bugs: { total: 0, added: 0, identical: 0, conflicting: 0 },
      tags: { total: 0, added: 0, identical: 0, conflicting: 0 },
    });
  });

  it('treats items with a different key order as identical', () => {
    const reordered = JSON.parse(JSON.stringify(current.notes[0], ['title', 'favorite', 'tagIds', 'projectId', 'id', 'content', 'updatedAt', 'createdAt']));
    expect(analyzeImport(current, makeWorkspace({ notes: [reordered] })).notes.identical).toBe(1);
  });
});

describe('applyImport', () => {
  it('merges and keeps the current version of conflicting items', () => {
    const { workspace, stats } = applyImport(current, imported, { kind: 'merge', conflicts: 'keep-current' }, context());
    expect(workspace.projects).toEqual(current.projects);
    expect(workspace.tasks.map((t) => t.id)).toEqual(['task-2', 'task-1']);
    expect(workspace.notes).toEqual(current.notes);
    expect(stats).toEqual({ added: 1, replaced: 0, copied: 0, skipped: 2, removed: 0, tagsAdded: 0, tagsUpdated: 0 });
  });

  it('merges and uses the imported version of conflicting items', () => {
    const { workspace, stats } = applyImport(current, imported, { kind: 'merge', conflicts: 'use-imported' }, context());
    expect(workspace.projects).toEqual([makeProject({ name: 'Obby Rush (laptop)' })]);
    expect(stats).toMatchObject({ added: 1, replaced: 1, skipped: 1 });
  });

  it('keeps both versions with new ids and moves references to the copy', () => {
    const { workspace, stats } = applyImport(current, imported, { kind: 'merge', conflicts: 'keep-both' }, context());
    expect(workspace.projects.map((p) => [p.id, p.name])).toEqual([
      ['new-1', 'Obby Rush (laptop)'],
      ['project-1', 'Obby Rush'],
    ]);
    // New imported tasks belong to the imported copy of the project; the identical task is not duplicated.
    expect(workspace.tasks.map((t) => [t.id, t.projectId])).toEqual([
      ['task-2', 'new-1'],
      ['task-1', 'project-1'],
    ]);
    expect(stats).toEqual({ added: 1, replaced: 0, copied: 1, skipped: 1, removed: 0, tagsAdded: 0, tagsUpdated: 0 });
  });

  it('replaces everything in replace mode', () => {
    const { workspace, stats } = applyImport(current, imported, { kind: 'replace' }, context());
    expect(workspace).toBe(imported);
    expect(stats).toMatchObject({ added: 3, removed: 3 });
  });

  it('never mutates its inputs', () => {
    const before = JSON.stringify(current);
    applyImport(current, imported, { kind: 'merge', conflicts: 'use-imported' }, context());
    expect(JSON.stringify(current)).toBe(before);
  });
});

describe('importing tags', () => {
  const tag = (id: string, name: string, color: Tag['color'] = null) => makeTag({ id, name, color });
  const mine = makeWorkspace({ tags: [tag('t-ui', 'UI', 'violet')], tasks: [makeTask({ tagIds: ['t-ui'] })] });

  it('reuses an existing tag with the same name instead of adding a second one', () => {
    const file = makeWorkspace({ tags: [tag('t-other', 'ui', 'red')], tasks: [makeTask({ id: 'task-9', tagIds: ['t-other'] })] });
    expect(analyzeImport(mine, file).tags).toEqual({ total: 1, added: 0, identical: 1, conflicting: 0 });
    const { workspace, stats } = applyImport(mine, file, { kind: 'merge', conflicts: 'keep-current' }, context());
    expect(workspace.tags).toEqual(mine.tags);
    expect(workspace.tasks.find((t) => t.id === 'task-9')?.tagIds).toEqual(['t-ui']);
    expect(stats.tagsAdded).toBe(0);
  });

  it('adds new tags and keeps their assignments', () => {
    const file = makeWorkspace({ tags: [tag('t-perf', 'Performance')], notes: [makeNote({ id: 'note-9', tagIds: ['t-perf'] })] });
    const { workspace, stats } = applyImport(mine, file, { kind: 'merge', conflicts: 'keep-current' }, context());
    expect(workspace.tags.map((t) => t.name)).toEqual(['UI', 'Performance']);
    expect(workspace.notes[0]?.tagIds).toEqual(['t-perf']);
    expect(stats.tagsAdded).toBe(1);
  });

  it('follows the conflict policy for a tag with the same id but other content', () => {
    const file = makeWorkspace({ tags: [tag('t-ui', 'Interface', 'teal')], tasks: [makeTask({ id: 'task-9', tagIds: ['t-ui'] })] });
    expect(analyzeImport(mine, file).tags.conflicting).toBe(1);

    const kept = applyImport(mine, file, { kind: 'merge', conflicts: 'keep-current' }, context()).workspace;
    expect(kept.tags).toEqual(mine.tags);

    const used = applyImport(mine, file, { kind: 'merge', conflicts: 'use-imported' }, context());
    expect(used.workspace.tags).toEqual([tag('t-ui', 'Interface', 'teal')]);
    expect(used.stats.tagsUpdated).toBe(1);

    // "Keep both": the file's tag becomes a copy, and the file's items follow it.
    const both = applyImport(mine, file, { kind: 'merge', conflicts: 'keep-both' }, context()).workspace;
    expect(both.tags.map((t) => [t.id, t.name])).toEqual([
      ['t-ui', 'UI'],
      ['new-1', 'Interface'],
    ]);
    expect(both.tasks.find((t) => t.id === 'task-9')?.tagIds).toEqual(['new-1']);
    expect(both.tasks.find((t) => t.id === 'task-1')?.tagIds).toEqual(['t-ui']);
  });

  it('never creates two tags with the same name, whatever the policy', () => {
    const current = makeWorkspace({ tags: [tag('t-ui', 'UI'), tag('t-bug', 'Bug')] });
    // Same id as "UI", but renamed to the name of another existing tag.
    const file = makeWorkspace({ tags: [tag('t-ui', 'bug')], tasks: [makeTask({ id: 'task-9', tagIds: ['t-ui'] })] });
    for (const conflicts of ['keep-current', 'use-imported', 'keep-both'] as const) {
      const { workspace } = applyImport(current, file, { kind: 'merge', conflicts }, context());
      const names = workspace.tags.map((t) => t.name.toLowerCase());
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('replaces tags together with everything else in replace mode', () => {
    const file = makeWorkspace({ tags: [tag('t-x', 'X')] });
    const { workspace, stats } = applyImport(mine, file, { kind: 'replace' }, context());
    expect(workspace.tags).toEqual(file.tags);
    expect(stats.tagsAdded).toBe(1);
  });
});
