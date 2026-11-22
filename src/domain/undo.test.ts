import { describe, expect, it } from 'vitest';

import { FIXED_NOW, makeNote, makeProject, makeSnippet, makeTag, makeTask, makeWorkspace } from '../test/fixtures';
import { workspaceSchema, type Workspace } from './models';
import { deleteTag } from './tags';
import { deleteWithUndo, restoreDeletion } from './undo';
import { updateTask } from './workspace';

const LATER = new Date('2026-01-16T10:00:00.000Z');

function sampleWorkspace(): Workspace {
  return makeWorkspace({
    tags: [makeTag({ id: 'tag-1' }), makeTag({ id: 'tag-2', name: 'Backend' })],
    projects: [makeProject({ id: 'p1', name: 'Alpha', tagIds: ['tag-1'] }), makeProject({ id: 'p2', name: 'Beta' })],
    tasks: [
      makeTask({ id: 't1', title: 'One', projectId: 'p1', tagIds: ['tag-1', 'tag-2'] }),
      makeTask({ id: 't2', title: 'Two' }),
      makeTask({ id: 't3', title: 'Three', projectId: 'p1' }),
    ],
    notes: [makeNote({ id: 'n1', projectId: 'p1' }), makeNote({ id: 'n2', title: 'Other' })],
    snippets: [makeSnippet({ id: 's1', projectId: 'p1' }), makeSnippet({ id: 's2', title: 'Other' })],
  });
}

const del = (workspace: Workspace, type: Parameters<typeof deleteWithUndo>[1], id: string, deleteContents = false) => {
  const result = deleteWithUndo(workspace, type, id, { deleteContents, now: LATER });
  if (!result.record) throw new Error('expected a deletion record');
  return { workspace: result.workspace, record: result.record };
};

describe('deleteWithUndo / restoreDeletion', () => {
  it.each([
    ['task', 't2', 'tasks'],
    ['note', 'n2', 'notes'],
    ['snippet', 's2', 'snippets'],
    ['project', 'p2', 'projects'],
  ] as const)('restores a deleted %s exactly, at its old position', (type, id, key) => {
    const original = sampleWorkspace();
    const { workspace, record } = del(original, type, id);
    expect(workspace[key].some((item) => item.id === id)).toBe(false);
    expect(record).toMatchObject({ type, id });

    expect(restoreDeletion(workspace, record)).toEqual(original);
  });

  it('returns no record for an unknown id and leaves the workspace untouched', () => {
    const original = sampleWorkspace();
    const result = deleteWithUndo(original, 'task', 'missing', { deleteContents: false, now: LATER });
    expect(result.record).toBeNull();
    expect(result.workspace).toBe(original);
  });

  it('restores a project together with its deleted tasks, notes and snippets', () => {
    const original = sampleWorkspace();
    const { workspace, record } = del(original, 'project', 'p1', true);
    expect(workspace.tasks.map((task) => task.id)).toEqual(['t2']);
    expect(workspace.notes.map((note) => note.id)).toEqual(['n2']);
    expect(workspace.snippets.map((snippet) => snippet.id)).toEqual(['s2']);

    expect(restoreDeletion(workspace, record)).toEqual(original);
  });

  it('re-links kept contents to the restored project, with their old timestamps', () => {
    const original = sampleWorkspace();
    const { workspace, record } = del(original, 'project', 'p1', false);
    expect(workspace.tasks.find((task) => task.id === 't1')).toMatchObject({ projectId: null, updatedAt: LATER.toISOString() });

    const restored = restoreDeletion(workspace, record);
    expect(restored).toEqual(original);
    expect(restored.tasks.find((task) => task.id === 't1')?.updatedAt).toBe(FIXED_NOW.toISOString());
  });

  it('keeps every deletion when several are undone in any order', () => {
    const original = sampleWorkspace();
    const first = del(original, 'task', 't1');
    const second = del(first.workspace, 'note', 'n2');
    const third = del(second.workspace, 'snippet', 's1');
    const fourth = del(third.workspace, 'task', 't3');
    expect(fourth.workspace.tasks.map((task) => task.id)).toEqual(['t2']);

    // Undo out of order: the first deletion, then the last, then the middle ones.
    let current = restoreDeletion(fourth.workspace, first.record);
    current = restoreDeletion(current, fourth.record);
    current = restoreDeletion(current, third.record);
    current = restoreDeletion(current, second.record);
    expect(current).toEqual(original);
  });

  it('only undoes its own deletion; later deletions stay deleted', () => {
    const original = sampleWorkspace();
    const first = del(original, 'task', 't1');
    const second = del(first.workspace, 'task', 't2');

    const current = restoreDeletion(second.workspace, first.record);
    expect(current.tasks.map((task) => task.id)).toEqual(['t1', 't3']);
  });

  it('does not overwrite changes made after the deletion', () => {
    const original = sampleWorkspace();
    const { workspace, record } = del(original, 'note', 'n1');
    const edited = updateTask(workspace, 't2', { title: 'Two (edited)', description: '', projectId: null, status: 'done', priority: 'high', tags: [] }, { now: LATER });

    const restored = restoreDeletion(edited, record);
    expect(restored.tasks.find((task) => task.id === 't2')).toMatchObject({ title: 'Two (edited)', status: 'done' });
    expect(restored.notes.map((note) => note.id)).toEqual(['n1', 'n2']);
  });

  it('is safe to apply twice (no duplicates)', () => {
    const original = sampleWorkspace();
    const { workspace, record } = del(original, 'project', 'p1', true);
    const once = restoreDeletion(workspace, record);
    expect(restoreDeletion(once, record)).toEqual(original);
  });

  it('drops tags that were deleted in the meantime and stays a valid workspace', () => {
    const original = sampleWorkspace();
    const { workspace, record } = del(original, 'task', 't1');
    const withoutTag = deleteTag(workspace, 'tag-2');

    const restored = restoreDeletion(withoutTag, record);
    expect(restored.tasks.find((task) => task.id === 't1')?.tagIds).toEqual(['tag-1']);
    expect(() => workspaceSchema.parse(restored)).not.toThrow();
  });

  it('restores an item without its project if that project was deleted in the meantime', () => {
    const original = sampleWorkspace();
    const taskDeletion = del(original, 'task', 't3');
    const projectDeletion = del(taskDeletion.workspace, 'project', 'p1', true);

    const restored = restoreDeletion(projectDeletion.workspace, taskDeletion.record);
    expect(restored.tasks.find((task) => task.id === 't3')?.projectId).toBeNull();
    expect(() => workspaceSchema.parse(restored)).not.toThrow();

    // Undoing the project afterwards brings the link back.
    const both = restoreDeletion(restored, projectDeletion.record);
    expect(both.projects.map((project) => project.id)).toEqual(['p1', 'p2']);
    expect(both.tasks.find((task) => task.id === 't1')?.projectId).toBe('p1');
  });

  it('does not re-link a kept item that was moved to another project meanwhile', () => {
    const original = sampleWorkspace();
    const { workspace, record } = del(original, 'project', 'p1', false);
    const moved = updateTask(workspace, 't1', { title: 'One', description: '', projectId: 'p2', status: 'todo', priority: 'medium', tags: [] }, { now: LATER });

    const restored = restoreDeletion(moved, record);
    expect(restored.tasks.find((task) => task.id === 't1')?.projectId).toBe('p2');
    expect(restored.tasks.find((task) => task.id === 't3')?.projectId).toBe('p1');
  });
});
