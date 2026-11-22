import { describe, expect, it } from 'vitest';

import { MemoryKeyValueStore } from '../storage/keyValueStore';
import { KeyValueWorkspaceRepository, WORKSPACE_STORAGE_KEY } from '../storage/keyValueWorkspaceRepository';
import { WORKSPACE_MIGRATIONS, migrate } from '../storage/migrations';
import { createBackup, parseBackup, serializeBackup } from '../storage/backup';
import { FIXED_NOW, makeBug, makeNote, makeProject, makeSnippet, makeTag, makeTask, makeWorkspace, sequentialIds } from '../test/fixtures';
import { EMPTY_FILTERS, filterItems, getFilterOptions, type ListFilters } from './filters';
import { analyzeImport, applyImport } from './import';
import { WORKSPACE_SCHEMA_VERSION, bugInputSchema, workspaceSchema } from './models';
import { buildSearchIndex, search } from './search';
import { sortItems } from './sorting';
import { deleteTag } from './tags';
import { deleteWithUndo, restoreDeletion } from './undo';
import { addBug, deleteBug, deleteProject, findEntity, getProjectContents, isWorkspaceEmpty, setBugStatus, updateBug } from './workspace';

const context = () => ({ now: FIXED_NOW, createId: sequentialIds() });
const later = { now: new Date('2026-02-01T00:00:00.000Z') };
const bugInput = (fields: Record<string, unknown> = {}) =>
  bugInputSchema.parse({ title: 'Crash on save', description: 'Steps: open, save.', projectId: '', priority: 'high', ...fields });

describe('bug operations', () => {
  it('creates a bug with status open, created date and optional due date', () => {
    const workspace = makeWorkspace({ projects: [makeProject()] });
    const next = addBug(workspace, bugInput({ projectId: 'project-1', dueDate: '2026-01-20' }), context());
    expect(next.bugs).toEqual([
      {
        id: 'id-1',
        createdAt: FIXED_NOW.toISOString(),
        updatedAt: FIXED_NOW.toISOString(),
        title: 'Crash on save',
        description: 'Steps: open, save.',
        projectId: 'project-1',
        status: 'open',
        priority: 'high',
        dueDate: '2026-01-20',
        resolvedAt: null,
        tagIds: [],
        favorite: false,
      },
    ]);
    expect(workspaceSchema.safeParse(next).success).toBe(true);
  });

  it('drops a project reference that does not exist', () => {
    expect(addBug(makeWorkspace(), bugInput({ projectId: 'missing' }), context()).bugs[0]?.projectId).toBeNull();
  });

  it('edits, changes the status of and deletes a bug', () => {
    const workspace = makeWorkspace({ bugs: [makeBug()] });
    const edited = updateBug(workspace, 'bug-1', bugInput({ title: 'Renamed', status: 'in_progress', priority: 'critical' }), later);
    expect(edited.bugs[0]).toMatchObject({ title: 'Renamed', status: 'in_progress', priority: 'critical', createdAt: FIXED_NOW.toISOString(), updatedAt: later.now.toISOString() });
    const fixed = setBugStatus(edited, 'bug-1', 'fixed', later);
    expect(fixed.bugs[0]?.status).toBe('fixed');
    // Fixed bugs stay in the list.
    expect(fixed.bugs).toHaveLength(1);
    expect(deleteBug(fixed, 'bug-1').bugs).toEqual([]);
  });

  it('accepts every status and priority from the spec', () => {
    for (const status of ['open', 'in_progress', 'fixed', 'closed']) expect(bugInputSchema.safeParse({ title: 'A', description: '', projectId: '', priority: 'low', status }).success).toBe(true);
    for (const priority of ['low', 'medium', 'high', 'critical']) expect(bugInputSchema.safeParse({ title: 'A', description: '', projectId: '', priority }).success).toBe(true);
    expect(bugInputSchema.safeParse({ title: 'A', description: '', projectId: '', priority: 'urgent' }).success).toBe(false);
    expect(bugInputSchema.safeParse({ title: '', description: '', projectId: '', priority: 'low' }).success).toBe(false);
  });

  it('belongs to projects: shown in their contents, unlinked or deleted with them', () => {
    const workspace = makeWorkspace({ projects: [makeProject()], bugs: [makeBug({ projectId: 'project-1' }), makeBug({ id: 'bug-2' })] });
    expect(getProjectContents(workspace, 'project-1').bugs.map((bug) => bug.id)).toEqual(['bug-1']);
    expect(deleteProject(workspace, 'project-1', { deleteContents: false }, later).bugs.map((bug) => bug.projectId)).toEqual([null, null]);
    expect(deleteProject(workspace, 'project-1', { deleteContents: true }, later).bugs.map((bug) => bug.id)).toEqual(['bug-2']);
    expect(findEntity(workspace, 'bug', 'bug-2')?.id).toBe('bug-2');
    expect(isWorkspaceEmpty(makeWorkspace({ bugs: [makeBug()] }))).toBe(false);
  });

  it('loses a deleted tag', () => {
    const workspace = makeWorkspace({ tags: [makeTag()], bugs: [makeBug({ tagIds: ['tag-1'] })] });
    expect(deleteTag(workspace, 'tag-1').bugs[0]?.tagIds).toEqual([]);
  });
});

describe('bug filters, sorting and search', () => {
  const workspace = makeWorkspace({
    projects: [makeProject()],
    bugs: [
      makeBug({ id: 'b1', title: 'Beta crash', status: 'open', priority: 'low', createdAt: '2026-01-02T00:00:00.000Z', dueDate: '2026-01-10' }),
      makeBug({ id: 'b2', title: 'Alpha freeze', status: 'fixed', priority: 'critical', createdAt: '2026-01-03T00:00:00.000Z', projectId: 'project-1' }),
      makeBug({ id: 'b3', title: 'Gamma lag', status: 'in_progress', priority: 'high', createdAt: '2026-01-01T00:00:00.000Z', dueDate: '2026-01-15' }),
    ],
  });
  const filters = (values: ListFilters['values']): ListFilters => ({ ...EMPTY_FILTERS, values });
  const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);
  const today = '2026-01-15';

  it('filters by status, priority, due date and project', () => {
    expect(ids(filterItems(workspace, 'bug', filters({ status: ['fixed'] }), { today }))).toEqual(['b2']);
    expect(ids(filterItems(workspace, 'bug', filters({ priority: ['high', 'low'] }), { today }))).toEqual(['b1', 'b3']);
    expect(ids(filterItems(workspace, 'bug', filters({ due: ['overdue'] }), { today }))).toEqual(['b1']);
    expect(ids(filterItems(workspace, 'bug', filters({ due: ['today'] }), { today }))).toEqual(['b3']);
    expect(ids(filterItems(workspace, 'bug', filters({ project: ['project-1'] }), { today }))).toEqual(['b2']);
  });

  it('offers the bug statuses and priorities as filter options', () => {
    const options = getFilterOptions(workspace, 'bug', EMPTY_FILTERS, today);
    expect(options.status?.map((option) => option.value)).toEqual(['open', 'in_progress', 'fixed', 'closed']);
    expect(options.priority?.map((option) => option.value)).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('sorts by name, created date and priority', () => {
    expect(ids(sortItems(workspace.bugs, 'bug', 'name-asc'))).toEqual(['b2', 'b1', 'b3']);
    expect(ids(sortItems(workspace.bugs, 'bug', 'created-desc'))).toEqual(['b2', 'b1', 'b3']);
    expect(ids(sortItems(workspace.bugs, 'bug', 'priority'))).toEqual(['b2', 'b3', 'b1']);
    expect(ids(sortItems(workspace.bugs, 'bug', 'status'))).toEqual(['b1', 'b3', 'b2']);
    expect(ids(sortItems(workspace.bugs, 'bug', 'due-asc'))).toEqual(['b1', 'b3', 'b2']);
  });

  it('finds bugs by title and description, with their project', () => {
    const results = search(buildSearchIndex(workspace), 'freeze');
    expect(results.groups[0]).toMatchObject({ type: 'bug', results: [{ id: 'b2', projectName: 'Obby Rush' }] });
    const byText = search(buildSearchIndex(makeWorkspace({ bugs: [makeBug({ description: 'Happens after respawn' })] })), 'respawn');
    expect(byText.groups[0]?.results[0]?.id).toBe('bug-1');
  });
});

describe('bug undo', () => {
  it('restores a deleted bug at its old place', () => {
    const workspace = makeWorkspace({ bugs: [makeBug({ id: 'b1' }), makeBug({ id: 'b2' })] });
    const { workspace: deleted, record } = deleteWithUndo(workspace, 'bug', 'b1', { deleteContents: false, now: later.now });
    expect(deleted.bugs.map((bug) => bug.id)).toEqual(['b2']);
    if (!record) throw new Error('expected a record');
    expect(restoreDeletion(deleted, record)).toEqual(workspace);
  });

  it('restores the bugs of a deleted project', () => {
    const workspace = makeWorkspace({ projects: [makeProject()], bugs: [makeBug({ projectId: 'project-1' })] });
    const { workspace: deleted, record } = deleteWithUndo(workspace, 'project', 'project-1', { deleteContents: true, now: later.now });
    expect(deleted.bugs).toEqual([]);
    if (!record) throw new Error('expected a record');
    expect(restoreDeletion(deleted, record)).toEqual(workspace);
  });
});

describe('data format v5', () => {
  const v4 = {
    schemaVersion: 4,
    projects: [makeProject()],
    tasks: [{ ...makeTask({ projectId: 'project-1' }), dueDate: undefined }],
    notes: [makeNote()],
    snippets: [makeSnippet()],
    tags: [],
  };

  it('upgrades v4: tasks get no due date, the bug list starts empty, nothing is lost', () => {
    const result = migrate(v4, WORKSPACE_SCHEMA_VERSION, WORKSPACE_MIGRATIONS);
    expect(result.ok).toBe(true);
    const parsed = workspaceSchema.parse(result.ok ? result.value.data : null);
    expect(parsed).toEqual(makeWorkspace({ projects: [makeProject()], tasks: [makeTask({ projectId: 'project-1' })], notes: [makeNote()], snippets: [makeSnippet()] }));
  });

  it('keeps due dates and bugs that are already there', () => {
    const result = migrate({ ...v4, tasks: [makeTask({ dueDate: '2026-01-20' })], bugs: [makeBug()] }, WORKSPACE_SCHEMA_VERSION, WORKSPACE_MIGRATIONS);
    const parsed = workspaceSchema.parse(result.ok ? result.value.data : null);
    expect(parsed.tasks[0]?.dueDate).toBe('2026-01-20');
    expect(parsed.bugs).toEqual([makeBug()]);
  });

  it('turns a broken stored due date into no due date instead of failing to load', () => {
    const workspace = { ...makeWorkspace({ tasks: [makeTask()] }), tasks: [{ ...makeTask(), dueDate: 'next week' }] };
    expect(workspaceSchema.parse(workspace).tasks[0]?.dueDate).toBeNull();
  });

  it('loads stored v4 data and writes v5 back', async () => {
    const store = new MemoryKeyValueStore({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(v4) });
    const repository = new KeyValueWorkspaceRepository({ store, events: null });
    const result = await repository.load();
    expect(result).toMatchObject({ ok: true, value: { migratedFrom: 4 } });
    const stored = JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '{}') as { schemaVersion: number; bugs: unknown[]; tasks: Array<{ dueDate: unknown }> };
    expect(stored.schemaVersion).toBe(5);
    expect(stored.bugs).toEqual([]);
    expect(stored.tasks[0]?.dueDate).toBeNull();
  });

  it('upgrades the oldest format (v1) through every step to v5', () => {
    const v1 = { schemaVersion: 1, projects: [], tasks: [{ ...makeTask(), tagIds: undefined, favorite: undefined, dueDate: undefined }], notes: [], snippets: [] };
    const result = migrate(v1, WORKSPACE_SCHEMA_VERSION, WORKSPACE_MIGRATIONS);
    expect(workspaceSchema.parse(result.ok ? result.value.data : null).tasks).toEqual([makeTask()]);
  });
});

describe('backup and import with bugs and due dates', () => {
  const workspace = makeWorkspace({
    projects: [makeProject()],
    tasks: [makeTask({ dueDate: '2026-01-20' })],
    bugs: [makeBug({ projectId: 'project-1', priority: 'critical', dueDate: '2026-01-18' })],
  });

  it('exports and re-imports bugs and due dates unchanged', () => {
    const text = serializeBackup(createBackup(workspace, FIXED_NOW));
    const parsed = parseBackup(text);
    expect(parsed.ok && parsed.value.workspace).toEqual(workspace);
  });

  it('clears a bug’s reference to a project that is not in the file', () => {
    const text = serializeBackup(createBackup({ ...workspace, projects: [] }, FIXED_NOW));
    const parsed = parseBackup(text);
    expect(parsed.ok && parsed.value.workspace.bugs[0]?.projectId).toBeNull();
    expect(parsed.ok && parsed.value.clearedReferences).toBe(1);
  });

  it('imports a v4 backup (before bugs existed)', () => {
    const v4 = { format: 'void-backup', formatVersion: 1, exportedAt: FIXED_NOW.toISOString(), workspace: { schemaVersion: 4, projects: [], tasks: [], notes: [], snippets: [], tags: [] } };
    const parsed = parseBackup(JSON.stringify(v4));
    expect(parsed.ok && parsed.value.workspace.bugs).toEqual([]);
    expect(parsed.ok && parsed.value.sourceSchemaVersion).toBe(4);
  });

  it('merges imported bugs', () => {
    const current = makeWorkspace({ bugs: [makeBug({ id: 'mine' })] });
    const imported = makeWorkspace({ bugs: [makeBug({ id: 'theirs', title: 'Other bug' })] });
    expect(analyzeImport(current, imported).bugs).toMatchObject({ total: 1, added: 1 });
    const { workspace: merged, stats } = applyImport(current, imported, { kind: 'merge', conflicts: 'keep-current' }, context());
    expect(merged.bugs.map((bug) => bug.id).sort()).toEqual(['mine', 'theirs']);
    expect(stats).toBeDefined();
  });
});
