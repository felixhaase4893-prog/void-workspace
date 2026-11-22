import { describe, expect, it } from 'vitest';

import { makeBug, makeNote, makeProject, makeSnippet, makeTag, makeTask, makeWorkspace, sequentialIds } from '../test/fixtures';
import { getDueState, toDayKey } from './dueDates';
import { workspaceSchema, type Workspace } from './models';
import { TEST_TITLE_PREFIX, addDueDateTestTask, addTestData, countTestData, isTestId, removeTestData } from './testData';

const NOW = new Date(2026, 0, 15, 10, 0);
const context = () => ({ now: NOW, createId: sequentialIds('gen') });

function realWorkspace(): Workspace {
  return makeWorkspace({
    tags: [makeTag({ id: 'tag-1' })],
    projects: [makeProject({ id: 'project-1', tagIds: ['tag-1'] })],
    tasks: [makeTask({ id: 'task-1', projectId: 'project-1' })],
    bugs: [makeBug({ id: 'bug-1' })],
    notes: [makeNote({ id: 'note-1' })],
    snippets: [makeSnippet({ id: 'snippet-1' })],
  });
}

describe('test data', () => {
  it('adds a marked, valid set of every kind next to the real data', () => {
    const real = realWorkspace();
    const next = addTestData(real, context());
    expect(workspaceSchema.safeParse(next).success).toBe(true);
    const counts = countTestData(next);
    expect(counts.projects).toBe(1);
    expect(counts.tasks).toBeGreaterThanOrEqual(4);
    expect(counts.bugs).toBeGreaterThanOrEqual(3);
    expect(counts.notes).toBeGreaterThanOrEqual(1);
    expect(counts.snippets).toBeGreaterThanOrEqual(1);
    for (const item of [...next.tasks, ...next.bugs, ...next.notes, ...next.snippets].filter((entry) => isTestId(entry.id))) {
      expect(item.title.startsWith(TEST_TITLE_PREFIX)).toBe(true);
    }
    // Real items are untouched, in the same order, behind or before the new ones.
    expect(next.tasks.filter((item) => !isTestId(item.id))).toEqual(real.tasks);
    expect(next.bugs.filter((item) => !isTestId(item.id))).toEqual(real.bugs);
    expect(next.projects.filter((item) => !isTestId(item.id))).toEqual(real.projects);
    expect(next.tags).toEqual(real.tags);
  });

  it('covers overdue, today, upcoming, undated and finished items', () => {
    const next = addTestData(makeWorkspace(), context());
    const states = new Set(next.tasks.map((task) => getDueState(task, toDayKey(NOW))));
    for (const state of ['overdue', 'today', 'upcoming', 'none', 'finished']) expect(states).toContain(state);
    expect(next.bugs.some((bug) => bug.priority === 'critical' && bug.status === 'open')).toBe(true);
    expect(next.bugs.some((bug) => bug.status === 'fixed')).toBe(true);
  });

  it('never reuses ids of real items, even when generated twice', () => {
    const once = addTestData(realWorkspace(), context());
    const twice = addTestData(once, { now: NOW, createId: sequentialIds('again') });
    const ids = [...twice.projects, ...twice.tasks, ...twice.bugs, ...twice.notes, ...twice.snippets].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('adds single due date test tasks', () => {
    const today = toDayKey(NOW);
    const states = (['today', 'tomorrow', 'overdue', 'week'] as const).map((which) => {
      const next = addDueDateTestTask(makeWorkspace(), which, context());
      const [task] = next.tasks;
      expect(task && isTestId(task.id)).toBe(true);
      return task ? getDueState(task, today) : null;
    });
    expect(states).toEqual(['today', 'upcoming', 'overdue', 'upcoming']);
  });

  it('removes only test data and leaves the real data exactly as it was', () => {
    const real = realWorkspace();
    const withTests = addDueDateTestTask(addTestData(real, context()), 'overdue', context());
    const cleaned = removeTestData(withTests);
    expect(countTestData(cleaned).total).toBe(0);
    expect(cleaned).toEqual(real);
  });

  it('keeps real items that were moved into a test project, without the project', () => {
    const withTests = addTestData(realWorkspace(), context());
    const testProject = withTests.projects.find((project) => isTestId(project.id));
    if (!testProject) throw new Error('expected a test project');
    const moved = { ...withTests, tasks: withTests.tasks.map((task) => (task.id === 'task-1' ? { ...task, projectId: testProject.id } : task)) };
    const cleaned = removeTestData(moved);
    expect(cleaned.tasks.find((task) => task.id === 'task-1')).toMatchObject({ projectId: null });
  });

  it('does nothing when there is no test data', () => {
    const real = realWorkspace();
    expect(removeTestData(real)).toEqual(real);
    expect(countTestData(real).total).toBe(0);
  });
});
