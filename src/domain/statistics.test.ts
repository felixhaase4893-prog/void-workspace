import { describe, expect, it } from 'vitest';

import { makeBug, makeProject, makeTask, makeWorkspace } from '../test/fixtures';
import { computeStatistics, hasActivity, makeBuckets } from './statistics';

// Noon UTC keeps the local day stable in any test time zone.
const at = (day: string) => `${day}T12:00:00.000Z`;
const TODAY = '2026-01-15';

describe('makeBuckets', () => {
  it('uses days up to a month, weeks up to half a year and months beyond', () => {
    const days = makeBuckets('2026-01-09', '2026-01-15');
    expect(days.size).toBe('day');
    expect(days.buckets).toHaveLength(7);

    const weeks = makeBuckets('2025-10-18', '2026-01-15');
    expect(weeks.size).toBe('week');
    expect(weeks.buckets[0]?.start).toBe('2025-10-18');
    expect(weeks.buckets.at(-1)?.end).toBe('2026-01-15');

    const months = makeBuckets('2025-03-20', '2026-01-15');
    expect(months.size).toBe('month');
    expect(months.buckets[0]?.start).toBe('2025-03-20');
    expect(months.buckets.at(-1)).toMatchObject({ start: '2026-01-01', end: '2026-01-15' });
    expect(months.buckets).toHaveLength(11);
  });
});

describe('computeStatistics', () => {
  const workspace = makeWorkspace({
    projects: [
      makeProject({ id: 'p1', name: 'Alpha' }),
      makeProject({ id: 'p2', name: 'Beta', status: 'paused' }),
      makeProject({ id: 'p3', name: 'Gamma', status: 'archived' }),
    ],
    tasks: [
      makeTask({ id: 't1', projectId: 'p1', createdAt: at('2026-01-14'), status: 'todo' }),
      makeTask({ id: 't2', projectId: 'p1', createdAt: at('2026-01-02'), status: 'done', completedAt: at('2026-01-13') }),
      makeTask({ id: 't3', projectId: 'p1', createdAt: at('2025-11-01'), status: 'done', completedAt: at('2025-12-01') }),
      makeTask({ id: 't4', projectId: null, createdAt: at('2025-10-01'), status: 'done', completedAt: null }),
      makeTask({ id: 't5', projectId: 'p2', createdAt: at('2026-01-10'), status: 'in_progress' }),
    ],
    bugs: [
      makeBug({ id: 'b1', projectId: 'p1', createdAt: at('2026-01-12'), status: 'open' }),
      makeBug({ id: 'b2', projectId: 'p1', createdAt: at('2026-01-11'), status: 'fixed', resolvedAt: at('2026-01-15') }),
      makeBug({ id: 'b3', projectId: null, createdAt: at('2025-06-01'), status: 'closed', resolvedAt: null }),
    ],
  });

  it('counts current totals independent of the period', () => {
    const stats = computeStatistics(workspace, '7d', TODAY);
    expect(stats.tasks).toMatchObject({ total: 5, open: 2, inProgress: 1, done: 3, completedUnknownDate: 1 });
    expect(stats.bugs).toMatchObject({ total: 3, open: 1, closed: 2, closedUnknownDate: 1 });
    expect(stats.projects).toMatchObject({ active: 1, paused: 1, archived: 1 });
  });

  it('counts what happened in the last 7 days and puts it in the right day', () => {
    const stats = computeStatistics(workspace, '7d', TODAY);
    expect(stats.from).toBe('2026-01-09');
    expect(stats.tasks).toMatchObject({ createdInRange: 2, completedInRange: 1 });
    expect(stats.bugs).toMatchObject({ reportedInRange: 2, closedInRange: 1 });
    expect(stats.buckets).toHaveLength(7);
    expect(stats.buckets.find((bucket) => bucket.start === '2026-01-13')?.tasksCompleted).toBe(1);
    expect(stats.buckets.find((bucket) => bucket.start === '2026-01-15')?.bugsClosed).toBe(1);
    expect(stats.buckets.reduce((sum, bucket) => sum + bucket.tasksCreated, 0)).toBe(2);
  });

  it('widens the counts with the period', () => {
    expect(computeStatistics(workspace, '30d', TODAY).tasks.createdInRange).toBe(3);
    expect(computeStatistics(workspace, '90d', TODAY).tasks).toMatchObject({ createdInRange: 4, completedInRange: 2 });
    const all = computeStatistics(workspace, 'all', TODAY);
    expect(all.from).toBe('2025-06-01');
    expect(all.bucketSize).toBe('month');
    expect(all.tasks).toMatchObject({ createdInRange: 5, completedInRange: 2 });
    expect(all.bugs.reportedInRange).toBe(3);
  });

  it('compares active and paused projects, most tasks first', () => {
    const list = computeStatistics(workspace, 'all', TODAY).projects.list;
    expect(list.map((project) => project.name)).toEqual(['Alpha', 'Beta']);
    expect(list[0]).toMatchObject({ totalTasks: 3, doneTasks: 2, progress: 66, openBugs: 1 });
    expect(list[1]).toMatchObject({ totalTasks: 1, doneTasks: 0, progress: 0 });
  });

  it('handles an empty workspace without inventing anything', () => {
    const empty = computeStatistics(makeWorkspace(), 'all', TODAY);
    expect(empty.from).toBeNull();
    expect(empty.buckets).toEqual([]);
    expect(hasActivity(empty, 'tasks')).toBe(false);
    const week = computeStatistics(makeWorkspace(), '7d', TODAY);
    expect(week.buckets).toHaveLength(7);
    expect(hasActivity(week, 'bugs')).toBe(false);
  });

  it('ignores items dated in the future', () => {
    const future = makeWorkspace({ tasks: [makeTask({ createdAt: at('2026-02-01') })] });
    const stats = computeStatistics(future, 'all', TODAY);
    expect(stats.from).toBe(TODAY);
    expect(stats.tasks.createdInRange).toBe(0);
  });
});
