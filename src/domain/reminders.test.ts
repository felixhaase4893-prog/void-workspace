import { describe, expect, it } from 'vitest';

import { makeBug, makeTask } from '../test/fixtures';
import type { Bug, Task } from './models';
import {
  DEFAULT_REMINDER_SETTINGS,
  MAX_SENT_LOG_ENTRIES,
  getDueReminders,
  isReminderTimeReached,
  pruneSentLog,
  recordSent,
  reminderKey,
  toNotifications,
  type ReminderSettings,
} from './reminders';

// Local time, so the tests mean the same in every time zone: 15 Jan 2026, 10:00.
const NOW = new Date(2026, 0, 15, 10, 0);
// Edited long before today's reminder time.
const OLD = new Date(2026, 0, 1, 8, 0).toISOString();
const settings = (changes: Partial<ReminderSettings> = {}): ReminderSettings => ({ ...DEFAULT_REMINDER_SETTINGS, ...changes });
const task = (fields: Partial<Task>) => makeTask({ updatedAt: OLD, ...fields });
const bug = (fields: Partial<Bug>) => makeBug({ updatedAt: OLD, priority: 'medium', ...fields });
const keys = (tasks: Task[], bugs: Bug[] = [], options: Partial<ReminderSettings> = {}, sent: string[] = [], now = NOW) =>
  getDueReminders({ tasks, bugs }, settings(options), now, new Set(sent)).map((reminder) => reminder.key);

describe('due reminders', () => {
  it('reminds overdue, due today and soon due open tasks', () => {
    const tasks = [
      task({ id: 'a', dueDate: '2026-01-14' }),
      task({ id: 'b', dueDate: '2026-01-15' }),
      task({ id: 'c', dueDate: '2026-01-16' }),
      task({ id: 'd', dueDate: '2026-01-20' }),
      task({ id: 'e' }),
    ];
    expect(keys(tasks)).toEqual(['overdue:task:a:2026-01-14', 'today:task:b:2026-01-15', 'upcoming:task:c:2026-01-16']);
  });

  it('respects the early reminder setting', () => {
    const tasks = [task({ id: 'c', dueDate: '2026-01-16' }), task({ id: 'd', dueDate: '2026-01-18' })];
    expect(keys(tasks, [], { leadDays: 0 })).toEqual([]);
    expect(keys(tasks, [], { leadDays: 3 })).toEqual(['upcoming:task:c:2026-01-16', 'upcoming:task:d:2026-01-18']);
  });

  it('never reminds done tasks or fixed and closed bugs', () => {
    const tasks = [task({ id: 'a', status: 'done', dueDate: '2026-01-10' })];
    const bugs = [bug({ id: 'b', status: 'fixed', dueDate: '2026-01-10', priority: 'critical' }), bug({ id: 'c', status: 'closed', dueDate: '2026-01-15' })];
    expect(keys(tasks, bugs)).toEqual([]);
  });

  it('reminds each open critical bug once, plus its due date', () => {
    const bugs = [bug({ id: 'x', priority: 'critical' }), bug({ id: 'y', priority: 'critical', status: 'in_progress', dueDate: '2026-01-15' }), bug({ id: 'z', priority: 'high' })];
    expect(keys([], bugs)).toEqual(['critical:bug:x', 'critical:bug:y', 'today:bug:y:2026-01-15']);
  });

  it('shows nothing that was already sent (no duplicates after a restart)', () => {
    const tasks = [task({ id: 'a', dueDate: '2026-01-15' })];
    const first = keys(tasks);
    expect(first).toHaveLength(1);
    expect(keys(tasks, [], {}, first)).toEqual([]);
  });

  it('reminds again when the situation changes: a new due date or the day it becomes overdue', () => {
    const sent = ['today:task:a:2026-01-15'];
    expect(keys([task({ id: 'a', dueDate: '2026-01-15' })], [], {}, sent)).toEqual([]);
    expect(keys([task({ id: 'a', dueDate: '2026-01-15' })], [], {}, sent, new Date(2026, 0, 16, 10, 0))).toEqual(['overdue:task:a:2026-01-15']);
  });

  it('returns nothing while notifications or a kind of reminder are turned off', () => {
    const tasks = [task({ id: 'a', dueDate: '2026-01-15' })];
    const bugs = [bug({ id: 'b', priority: 'critical' })];
    expect(keys(tasks, bugs, { enabled: false })).toEqual([]);
    expect(keys(tasks, bugs, { tasks: false })).toEqual(['critical:bug:b']);
    expect(keys(tasks, bugs, { bugs: false })).toEqual(['today:task:a:2026-01-15']);
  });

  it('waits for the reminder time', () => {
    const tasks = [task({ id: 'a', dueDate: '2026-01-15' })];
    expect(keys(tasks, [], { time: '10:30' })).toEqual([]);
    expect(keys(tasks, [], { time: '10:00' })).toEqual(['today:task:a:2026-01-15']);
    expect(isReminderTimeReached({ time: '09:59' }, NOW)).toBe(true);
    expect(isReminderTimeReached({ time: '10:01' }, NOW)).toBe(false);
  });

  it('skips items created or edited after today’s reminder time', () => {
    const fresh = task({ id: 'a', dueDate: '2026-01-15', updatedAt: new Date(2026, 0, 15, 9, 30).toISOString() });
    expect(keys([fresh])).toEqual([]);
  });

  it('orders overdue first, then critical bugs, today and upcoming', () => {
    const tasks = [task({ id: 'u', dueDate: '2026-01-16' }), task({ id: 't', dueDate: '2026-01-15' }), task({ id: 'o', dueDate: '2026-01-01' })];
    const bugs = [bug({ id: 'c', priority: 'critical' })];
    expect(keys(tasks, bugs).map((key) => key.split(':')[0])).toEqual(['overdue', 'critical', 'today', 'upcoming']);
  });

  it('builds stable keys', () => {
    expect(reminderKey('today', 'task', 'a', '2026-01-15')).toBe('today:task:a:2026-01-15');
    expect(reminderKey('critical', 'bug', 'b', null)).toBe('critical:bug:b');
  });
});

describe('notification texts', () => {
  const remind = (tasks: Task[], bugs: Bug[] = []) => getDueReminders({ tasks, bugs }, settings({ leadDays: 7 }), NOW, new Set());

  it('shows up to three reminders separately', () => {
    const messages = toNotifications(remind([task({ title: 'Ship build', dueDate: '2026-01-15' }), task({ id: 'b', title: 'Old', dueDate: '2026-01-12' })], [bug({ title: 'Crash', priority: 'critical' })]), NOW);
    expect(messages).toEqual([
      { title: 'Task overdue', body: '“Old” was due Mon, Jan 12.' },
      { title: 'Critical bug open', body: '“Crash” is still unresolved.' },
      { title: 'Task due today', body: '“Ship build”' },
    ]);
  });

  it('names the days for upcoming items', () => {
    expect(toNotifications(remind([task({ title: 'A', dueDate: '2026-01-16' })]), NOW)[0]?.title).toBe('Task due tomorrow');
    expect(toNotifications(remind([task({ title: 'A', dueDate: '2026-01-18' })]), NOW)[0]?.title).toBe('Task due in 3 days');
  });

  it('combines many reminders into one summary', () => {
    const tasks = ['a', 'b', 'c', 'd', 'e'].map((id, index) => task({ id, title: id.toUpperCase(), dueDate: index < 2 ? '2026-01-10' : '2026-01-15' }));
    const messages = toNotifications(remind(tasks), NOW);
    expect(messages).toEqual([{ title: '5 reminders in VOID', body: '2 overdue, 3 due today: “A”, “B”, “C” and more.' }]);
  });
});

describe('sent log', () => {
  it('records keys with the time they were sent', () => {
    const log = recordSent({}, ['a', 'b'], NOW);
    expect(log).toEqual({ a: NOW.toISOString(), b: NOW.toISOString() });
  });

  it('drops old and invalid entries', () => {
    const log = { old: new Date(2025, 5, 1).toISOString(), recent: new Date(2026, 0, 10).toISOString(), broken: 'yesterday' };
    expect(pruneSentLog(log, NOW)).toEqual({ recent: log.recent });
  });

  it('keeps the newest entries when the log grows too large', () => {
    const log: Record<string, string> = {};
    for (let index = 0; index < MAX_SENT_LOG_ENTRIES + 10; index += 1) log[`key-${index}`] = new Date(NOW.getTime() - index * 1000).toISOString();
    const pruned = pruneSentLog(log, NOW);
    expect(Object.keys(pruned)).toHaveLength(MAX_SENT_LOG_ENTRIES);
    expect(pruned['key-0']).toBeDefined();
    expect(pruned[`key-${MAX_SENT_LOG_ENTRIES + 5}`]).toBeUndefined();
  });
});
