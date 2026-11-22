import { describe, expect, it } from 'vitest';

import { makeBug, makeTask } from '../test/fixtures';
import { addDays, daysBetween, describeDue, formatDueDate, getDueOverview, getDueState, isFinished, toDayKey } from './dueDates';
import { isValidDueDate, taskInputSchema, bugInputSchema } from './models';

describe('day keys', () => {
  it('uses the local calendar day, not the UTC day', () => {
    // Local constructors: the same wall-clock day in every time zone the tests run in.
    expect(toDayKey(new Date(2026, 0, 15, 0, 5))).toBe('2026-01-15');
    expect(toDayKey(new Date(2026, 0, 15, 23, 55))).toBe('2026-01-15');
    expect(toDayKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('moves across months, years and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts calendar days independent of daylight saving time', () => {
    // Europe switches to summer time on 29 March 2026 and back on 25 October 2026.
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-01-15', '2026-01-14')).toBe(-1);
  });

  it('accepts only real calendar days', () => {
    expect(isValidDueDate('2026-02-28')).toBe(true);
    expect(isValidDueDate('2028-02-29')).toBe(true);
    expect(isValidDueDate('2026-02-29')).toBe(false);
    expect(isValidDueDate('2026-13-01')).toBe(false);
    expect(isValidDueDate('2026-1-5')).toBe(false);
    expect(isValidDueDate('2026-01-15T00:00')).toBe(false);
    expect(isValidDueDate(null)).toBe(false);
    expect(isValidDueDate(undefined)).toBe(false);
  });
});

describe('due state', () => {
  const today = '2026-01-15';

  it('classifies open items', () => {
    expect(getDueState(makeTask({ dueDate: '2026-01-14' }), today)).toBe('overdue');
    expect(getDueState(makeTask({ dueDate: '2026-01-15' }), today)).toBe('today');
    expect(getDueState(makeTask({ dueDate: '2026-01-16' }), today)).toBe('upcoming');
    expect(getDueState(makeTask({ dueDate: '2026-01-22' }), today)).toBe('upcoming');
    expect(getDueState(makeTask({ dueDate: '2026-01-23' }), today)).toBe('later');
    expect(getDueState(makeTask({ dueDate: null }), today)).toBe('none');
  });

  it('never treats done tasks or fixed and closed bugs as overdue', () => {
    expect(getDueState(makeTask({ status: 'done', dueDate: '2025-12-01' }), today)).toBe('finished');
    expect(getDueState(makeBug({ status: 'fixed', dueDate: '2025-12-01' }), today)).toBe('finished');
    expect(getDueState(makeBug({ status: 'closed', dueDate: '2025-12-01' }), today)).toBe('finished');
    expect(getDueState(makeBug({ status: 'in_progress', dueDate: '2025-12-01' }), today)).toBe('overdue');
    expect(isFinished({ status: 'in_progress' })).toBe(false);
  });

  it('treats an invalid stored date like no due date', () => {
    expect(getDueState({ status: 'todo', dueDate: 'tomorrow' }, today)).toBe('none');
  });
});

describe('labels', () => {
  const today = '2026-01-15';

  it('describes the distance to the due date', () => {
    expect(describeDue('2026-01-15', today)).toBe('Due today');
    expect(describeDue('2026-01-16', today)).toBe('Due tomorrow');
    expect(describeDue('2026-01-14', today)).toBe('Overdue by 1 day');
    expect(describeDue('2026-01-12', today)).toBe('Overdue by 3 days');
    expect(describeDue('2026-01-20', today)).toBe('Due in 5 days');
    expect(describeDue('2026-02-10', today)).toBe('Due Tue, Feb 10');
  });

  it('shows the year only for other years', () => {
    expect(formatDueDate('2026-03-07', today)).toBe('Sat, Mar 7');
    expect(formatDueDate('2027-03-07', today)).toBe('Mar 7, 2027');
  });
});

describe('due overview', () => {
  it('lists open tasks that are overdue, due today or due this week, soonest first', () => {
    const tasks = [
      makeTask({ id: 'later', dueDate: '2026-02-20' }),
      makeTask({ id: 'week-b', dueDate: '2026-01-20' }),
      makeTask({ id: 'overdue', dueDate: '2026-01-10' }),
      makeTask({ id: 'today', dueDate: '2026-01-15' }),
      makeTask({ id: 'week-a', dueDate: '2026-01-16' }),
      makeTask({ id: 'done', status: 'done', dueDate: '2026-01-01' }),
      makeTask({ id: 'undated' }),
    ];
    const overview = getDueOverview({ tasks }, '2026-01-15');
    expect(overview.overdue.map((task) => task.id)).toEqual(['overdue']);
    expect(overview.today.map((task) => task.id)).toEqual(['today']);
    expect(overview.upcoming.map((task) => task.id)).toEqual(['week-a', 'week-b']);
  });
});

describe('due date input', () => {
  it('is optional and turns an empty field into no due date', () => {
    expect(taskInputSchema.parse({ title: 'A', description: '', projectId: '', priority: 'low' }).dueDate).toBeNull();
    expect(taskInputSchema.parse({ title: 'A', description: '', projectId: '', priority: 'low', dueDate: '' }).dueDate).toBeNull();
    expect(taskInputSchema.parse({ title: 'A', description: '', projectId: '', priority: 'low', dueDate: '2026-01-20' }).dueDate).toBe('2026-01-20');
  });

  it('rejects impossible dates', () => {
    expect(taskInputSchema.safeParse({ title: 'A', description: '', projectId: '', priority: 'low', dueDate: '2026-02-30' }).success).toBe(false);
    expect(bugInputSchema.safeParse({ title: 'A', description: '', projectId: '', priority: 'low', dueDate: 'soon' }).success).toBe(false);
  });
});
