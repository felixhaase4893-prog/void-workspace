import { describe, expect, it } from 'vitest';

import { makeBug, makeTask, makeWorkspace } from '../test/fixtures';
import { isResolvedBugStatus, stampMilestones } from './milestones';

const NOW = new Date('2026-03-01T12:00:00.000Z');

describe('stampMilestones', () => {
  it('stamps a task that becomes done and clears the stamp when it is reopened', () => {
    const before = makeWorkspace({ tasks: [makeTask({ status: 'in_progress' })] });
    const done = stampMilestones(before, { ...before, tasks: [makeTask({ status: 'done' })] }, NOW);
    expect(done.tasks[0]?.completedAt).toBe(NOW.toISOString());

    const reopened = stampMilestones(done, { ...done, tasks: [{ ...done.tasks[0]!, status: 'todo' }] }, new Date('2026-03-02T00:00:00.000Z'));
    expect(reopened.tasks[0]?.completedAt).toBeNull();
  });

  it('keeps the original time while a task stays done, and keeps unknown times unknown', () => {
    const stamped = makeTask({ status: 'done', completedAt: '2026-02-01T00:00:00.000Z' });
    const legacy = makeTask({ id: 'task-2', status: 'done', completedAt: null });
    const before = makeWorkspace({ tasks: [stamped, legacy] });
    const after = stampMilestones(before, { ...before, tasks: [{ ...stamped, title: 'Renamed' }, { ...legacy, title: 'Renamed too' }] }, NOW);
    expect(after.tasks[0]?.completedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(after.tasks[1]?.completedAt).toBeNull();
  });

  it('gives a new item that is already done its own updatedAt (e.g. restored by undo)', () => {
    const before = makeWorkspace();
    const created = makeTask({ status: 'done', updatedAt: '2026-02-10T08:00:00.000Z' });
    expect(stampMilestones(before, { ...before, tasks: [created] }, NOW).tasks[0]?.completedAt).toBe('2026-02-10T08:00:00.000Z');
  });

  it('stamps bugs that become fixed or closed', () => {
    const before = makeWorkspace({ bugs: [makeBug({ status: 'open' }), makeBug({ id: 'bug-2', status: 'in_progress' })] });
    const after = stampMilestones(before, { ...before, bugs: [makeBug({ status: 'fixed' }), makeBug({ id: 'bug-2', status: 'in_progress' })] }, NOW);
    expect(after.bugs[0]?.resolvedAt).toBe(NOW.toISOString());
    expect(after.bugs[1]?.resolvedAt).toBeNull();
    // fixed → closed is still resolved: the first time stays.
    const closed = stampMilestones(after, { ...after, bugs: [{ ...after.bugs[0]!, status: 'closed' }, after.bugs[1]!] }, new Date('2026-04-01T00:00:00.000Z'));
    expect(closed.bugs[0]?.resolvedAt).toBe(NOW.toISOString());
  });

  it('returns the same workspace when nothing needs a stamp', () => {
    const before = makeWorkspace({ tasks: [makeTask()] });
    const next = { ...before, notes: [] };
    expect(stampMilestones(before, next, NOW)).toBe(next);
  });

  it('knows which bug statuses count as resolved', () => {
    expect(isResolvedBugStatus('fixed')).toBe(true);
    expect(isResolvedBugStatus('closed')).toBe(true);
    expect(isResolvedBugStatus('open')).toBe(false);
    expect(isResolvedBugStatus('in_progress')).toBe(false);
  });
});
