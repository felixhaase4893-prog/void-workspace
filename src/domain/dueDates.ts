import { isValidDueDate, type Bug, type Task, type Workspace } from './models';

/**
 * Due dates are calendar days (`YYYY-MM-DD`) in the user's local time zone.
 * All comparisons work on those day keys, never on timestamps, so "today" is
 * always the user's today, independent of UTC offsets and daylight saving time.
 */

/** How many days ahead count as "upcoming" (tomorrow up to and including this many days from today). */
export const UPCOMING_DAYS = 7;

/** The local calendar day of `date` as `YYYY-MM-DD`. */
export function toDayKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayNumber(key: string): number {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** `key` moved by `days` calendar days (negative moves back). */
export function addDays(key: string, days: number): string {
  const date = new Date((dayNumber(key) + days) * 86_400_000);
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** Calendar days from `from` to `to`: 1 for tomorrow, -1 for yesterday. */
export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

/** Done tasks and fixed or closed bugs are finished: they are never overdue and never remind. */
export function isFinished(item: { status: string }): boolean {
  return item.status === 'done' || item.status === 'fixed' || item.status === 'closed';
}

export type DueState = 'overdue' | 'today' | 'upcoming' | 'later' | 'none' | 'finished';

/** Where an item stands relative to `today`. Items without a (valid) due date are `none`. */
export function getDueState(item: { dueDate?: string | null; status: string }, today: string): DueState {
  const due = item.dueDate;
  if (!isValidDueDate(due)) return 'none';
  if (isFinished(item)) return 'finished';
  const days = daysBetween(today, due);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days <= UPCOMING_DAYS) return 'upcoming';
  return 'later';
}

const weekdayFormatter = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullFormatter = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "Mon, Dec 7" (or "Dec 7, 2027" in another year), without any time zone shift. */
export function formatDueDate(key: string, today: string): string {
  const date = new Date(dayNumber(key) * 86_400_000);
  return key.slice(0, 4) === today.slice(0, 4) ? weekdayFormatter.format(date) : fullFormatter.format(date);
}

/** A short, human label: "Due today", "Due tomorrow", "Overdue by 3 days", "Due in 5 days", "Due Mon, Dec 7". */
export function describeDue(key: string, today: string): string {
  const days = daysBetween(today, key);
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days === -1) return 'Overdue by 1 day';
  if (days < 0) return `Overdue by ${-days} days`;
  if (days <= UPCOMING_DAYS) return `Due in ${days} days`;
  return `Due ${formatDueDate(key, today)}`;
}

export interface DueOverview {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
}

/** Open tasks that are overdue, due today or due within the next week, each list soonest first. */
export function getDueOverview(workspace: Pick<Workspace, 'tasks'>, today: string): DueOverview {
  const overview: DueOverview = { overdue: [], today: [], upcoming: [] };
  for (const task of workspace.tasks) {
    const state = getDueState(task, today);
    if (state === 'overdue' || state === 'today' || state === 'upcoming') overview[state].push(task);
  }
  const byDate = (a: Task, b: Task) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
  overview.overdue.sort(byDate);
  overview.today.sort(byDate);
  overview.upcoming.sort(byDate);
  return overview;
}

/** Open, dated items of both kinds; used by reminders. */
export type DueItem = { type: 'task'; item: Task } | { type: 'bug'; item: Bug };
