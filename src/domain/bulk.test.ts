import { describe, expect, it } from 'vitest';

import { makeBug, makeProject, makeTag, makeTask, makeWorkspace } from '../test/fixtures';
import { bulkEditBugs, bulkEditTasks, restoreBulkEdit } from './bulk';
import { deleteManyWithUndo, restoreDeletion } from './undo';

const LATER = new Date('2026-02-01T12:00:00.000Z');

const workspace = () =>
  makeWorkspace({
    tags: [makeTag({ id: 'tag-1' })],
    projects: [makeProject({ id: 'project-1' }), makeProject({ id: 'project-2', name: 'Studio site' })],
    tasks: [
      makeTask({ id: 'task-1', title: 'One', tagIds: ['tag-1'] }),
      makeTask({ id: 'task-2', title: 'Two', status: 'done' }),
      makeTask({ id: 'task-3', title: 'Three', projectId: 'project-1' }),
      makeTask({ id: 'task-4', title: 'Four' }),
      makeTask({ id: 'task-5', title: 'Five' }),
    ],
    bugs: [makeBug({ id: 'bug-1', title: 'A' }), makeBug({ id: 'bug-2', title: 'B', priority: 'low' }), makeBug({ id: 'bug-3', title: 'C' })],
  });

describe('bulk edits', () => {
  it('marks several tasks as done and only stamps the ones that changed', () => {
    const { workspace: next, record } = bulkEditTasks(workspace(), ['task-1', 'task-2', 'task-4'], { status: 'done' }, LATER);
    expect(next.tasks.map((task) => task.status)).toEqual(['done', 'done', 'todo', 'done', 'todo']);
    expect(next.tasks[0]?.updatedAt).toBe(LATER.toISOString());
    expect(next.tasks[1]?.updatedAt).not.toBe(LATER.toISOString());
    expect(record?.previous.map((task) => task.id)).toEqual(['task-1', 'task-4']);
  });

  it('returns no record when nothing changes', () => {
    const before = workspace();
    const result = bulkEditTasks(before, ['task-2'], { status: 'done' }, LATER);
    expect(result.record).toBeNull();
    expect(result.workspace).toBe(before);
  });

  it('changes priority and project of several bugs', () => {
    const byPriority = bulkEditBugs(workspace(), ['bug-1', 'bug-2'], { priority: 'critical' }, LATER);
    expect(byPriority.workspace.bugs.map((bug) => bug.priority)).toEqual(['critical', 'critical', 'high']);
    const byProject = bulkEditBugs(byPriority.workspace, ['bug-2', 'bug-3'], { projectId: 'project-2' }, LATER);
    expect(byProject.workspace.bugs.map((bug) => bug.projectId)).toEqual([null, 'project-2', 'project-2']);
  });

  it('refuses a project that does not exist', () => {
    const before = workspace();
    expect(bulkEditTasks(before, ['task-1'], { projectId: 'gone' }, LATER)).toEqual({ workspace: before, record: null });
  });

  it('can be undone, also after unrelated changes', () => {
    const before = workspace();
    const { workspace: edited, record } = bulkEditTasks(before, ['task-1', 'task-3', 'task-5'], { priority: 'high' }, LATER);
    if (!record) throw new Error('expected a record');
    // Meanwhile another task is renamed: the undo must keep that.
    const meanwhile = { ...edited, tasks: edited.tasks.map((task) => (task.id === 'task-4' ? { ...task, title: 'Four!' } : task)) };
    const restored = restoreBulkEdit(meanwhile, record);
    expect(restored.tasks.map((task) => task.priority)).toEqual(['medium', 'medium', 'medium', 'medium', 'medium']);
    expect(restored.tasks[3]?.title).toBe('Four!');
    expect(restoreBulkEdit(edited, record)).toEqual(before);
  });

  it('cleans up references that disappeared before the undo', () => {
    const { workspace: edited, record } = bulkEditTasks(workspace(), ['task-1', 'task-3'], { projectId: 'project-2' }, LATER);
    if (!record) throw new Error('expected a record');
    const withoutProjectAndTag = { ...edited, tags: [], projects: edited.projects.filter((project) => project.id !== 'project-1') };
    const restored = restoreBulkEdit(withoutProjectAndTag, record);
    expect(restored.tasks.find((task) => task.id === 'task-3')?.projectId).toBeNull();
    expect(restored.tasks.find((task) => task.id === 'task-1')?.tagIds).toEqual([]);
  });

  it('leaves items deleted in the meantime deleted', () => {
    const { workspace: edited, record } = bulkEditBugs(workspace(), ['bug-1', 'bug-3'], { status: 'fixed' }, LATER);
    if (!record) throw new Error('expected a record');
    const restored = restoreBulkEdit({ ...edited, bugs: edited.bugs.filter((bug) => bug.id !== 'bug-3') }, record);
    expect(restored.bugs.map((bug) => [bug.id, bug.status])).toEqual([
      ['bug-1', 'open'],
      ['bug-2', 'open'],
    ]);
  });
});

describe('deleting several items at once', () => {
  it('deletes the selected tasks and restores all of them in place with one record', () => {
    const before = workspace();
    const { workspace: next, record } = deleteManyWithUndo(before, 'task', ['task-1', 'task-2', 'task-4', 'missing']);
    expect(next.tasks.map((task) => task.id)).toEqual(['task-3', 'task-5']);
    expect(record?.count).toBe(3);
    if (!record) throw new Error('expected a record');
    expect(restoreDeletion(next, record)).toEqual(before);
  });

  it('restores bulk-deleted bugs next to bugs created afterwards', () => {
    const before = workspace();
    const { workspace: next, record } = deleteManyWithUndo(before, 'bug', ['bug-1', 'bug-3']);
    if (!record) throw new Error('expected a record');
    const withNew = { ...next, bugs: [makeBug({ id: 'bug-new', title: 'New' }), ...next.bugs] };
    expect(restoreDeletion(withNew, record).bugs.map((bug) => bug.id)).toEqual(['bug-1', 'bug-new', 'bug-2', 'bug-3']);
  });

  it('returns no record when none of the ids exist', () => {
    const before = workspace();
    expect(deleteManyWithUndo(before, 'task', ['nope'])).toEqual({ workspace: before, record: null });
  });
});
