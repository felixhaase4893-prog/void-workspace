import { describe, expect, it } from 'vitest';

import { makeBug, makeNote, makeProject, makeTask, makeWorkspace } from '../test/fixtures';
import { getProjectOverview, taskProgress } from './projectOverview';

const TODAY = '2026-01-15';

function tasks(total: number, done: number) {
  return Array.from({ length: total }, (_, index) =>
    makeTask({ id: `task-${index}`, projectId: 'project-1', status: index < done ? 'done' : index === done ? 'in_progress' : 'todo' }),
  );
}

describe('taskProgress', () => {
  it('is the share of done tasks, rounded down', () => {
    expect(taskProgress({ total: 10, done: 6 })).toBe(60);
    expect(taskProgress({ total: 3, done: 2 })).toBe(66);
    expect(taskProgress({ total: 3, done: 3 })).toBe(100);
    expect(taskProgress({ total: 200, done: 199 })).toBe(99);
  });

  it('is null for a project without tasks instead of pretending 0 %', () => {
    expect(taskProgress({ total: 0, done: 0 })).toBeNull();
  });
});

describe('getProjectOverview', () => {
  it('counts tasks and bugs of the project only', () => {
    const workspace = makeWorkspace({
      projects: [makeProject()],
      tasks: [...tasks(10, 6), makeTask({ id: 'other', projectId: null, status: 'done' })],
      bugs: [
        makeBug({ id: 'b1', projectId: 'project-1', status: 'open' }),
        makeBug({ id: 'b2', projectId: 'project-1', status: 'in_progress' }),
        makeBug({ id: 'b3', projectId: 'project-1', status: 'fixed' }),
        makeBug({ id: 'b4', projectId: 'project-1', status: 'closed' }),
        makeBug({ id: 'b5', projectId: null, status: 'open' }),
      ],
    });
    const overview = getProjectOverview(workspace, 'project-1', TODAY);
    expect(overview?.tasks).toEqual({ total: 10, open: 4, inProgress: 1, done: 6 });
    expect(overview?.progress).toBe(60);
    expect(overview?.bugs).toEqual({ total: 4, open: 2, closed: 2 });
  });

  it('shows no progress for an empty project', () => {
    const overview = getProjectOverview(makeWorkspace({ projects: [makeProject()] }), 'project-1', TODAY);
    expect(overview?.progress).toBeNull();
    expect(overview?.deadlines).toEqual([]);
    expect(overview?.recent.map((item) => item.type)).toEqual(['project']);
  });

  it('lists unfinished dated items, overdue first, and counts overdue ones', () => {
    const workspace = makeWorkspace({
      projects: [makeProject()],
      tasks: [
        makeTask({ id: 'later', title: 'Later', projectId: 'project-1', dueDate: '2026-01-20' }),
        makeTask({ id: 'late', title: 'Late', projectId: 'project-1', dueDate: '2026-01-10' }),
        makeTask({ id: 'finished', title: 'Finished', projectId: 'project-1', dueDate: '2026-01-11', status: 'done' }),
        makeTask({ id: 'undated', title: 'Undated', projectId: 'project-1' }),
      ],
      bugs: [makeBug({ id: 'soon', title: 'Soon', projectId: 'project-1', dueDate: '2026-01-16' })],
    });
    const overview = getProjectOverview(workspace, 'project-1', TODAY);
    expect(overview?.deadlines.map((entry) => entry.item.title)).toEqual(['Late', 'Soon', 'Later']);
    expect(overview?.overdue).toBe(1);
  });

  it('lists the latest changes across the project, newest first and limited', () => {
    const workspace = makeWorkspace({
      projects: [makeProject({ updatedAt: '2026-01-01T00:00:00.000Z' })],
      tasks: [makeTask({ projectId: 'project-1', updatedAt: '2026-01-05T00:00:00.000Z' })],
      bugs: [makeBug({ projectId: 'project-1', updatedAt: '2026-01-07T00:00:00.000Z' })],
      notes: [makeNote({ projectId: 'project-1', updatedAt: '2026-01-06T00:00:00.000Z' })],
    });
    const overview = getProjectOverview(workspace, 'project-1', TODAY, 3);
    expect(overview?.recent.map((item) => item.type)).toEqual(['bug', 'note', 'task']);
  });

  it('returns null for an unknown project', () => {
    expect(getProjectOverview(makeWorkspace(), 'missing', TODAY)).toBeNull();
  });
});
