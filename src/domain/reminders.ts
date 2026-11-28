import { addDays, daysBetween, formatDueDate, isFinished, toDayKey } from './dueDates';
import { isValidDueDate, type Bug, type Task, type Workspace } from './models';
import { t, tn } from '../i18n/translate';

/**
 * Pure reminder logic for desktop notifications. Nothing here sends anything
 * or touches storage: it decides *which* reminders are due right now, given
 * the settings and the keys of reminders that were already sent.
 *
 * Every reminder has a stable key such as `today:task:<id>:2026-11-24`.
 * Once a key is recorded as sent, that reminder never fires again, across
 * restarts too. Changing the due date creates new keys, so a moved deadline
 * is reminded again, which is what you want.
 */

export const REMINDER_LEAD_DAYS = [0, 1, 2, 3, 7] as const;
export type ReminderLeadDays = (typeof REMINDER_LEAD_DAYS)[number];

export interface ReminderSettings {
  /** Master switch for all desktop notifications. */
  enabled: boolean;
  /** Due date reminders for tasks. */
  tasks: boolean;
  /** Due date reminders for bugs, plus one reminder per open critical bug. */
  bugs: boolean;
  /** Local time of day (`HH:MM`) from which the day's reminders are shown. */
  time: string;
  /** Days before the due date for the "coming up" reminder; 0 turns it off. */
  leadDays: ReminderLeadDays;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = { enabled: true, tasks: true, bugs: true, time: '09:00', leadDays: 1 };

export const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ReminderKind = 'overdue' | 'today' | 'upcoming' | 'critical';

export interface Reminder {
  key: string;
  kind: ReminderKind;
  type: 'task' | 'bug';
  id: string;
  title: string;
  dueDate: string | null;
}

/** Today's reminder time as a moment in local time. */
export function reminderMoment(settings: Pick<ReminderSettings, 'time'>, now: Date): Date {
  const time = REMINDER_TIME_PATTERN.test(settings.time) ? settings.time : DEFAULT_REMINDER_SETTINGS.time;
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
}

/** True once the local clock has reached the configured reminder time today. */
export function isReminderTimeReached(settings: Pick<ReminderSettings, 'time'>, now: Date): boolean {
  return now.getTime() >= reminderMoment(settings, now).getTime();
}

export function reminderKey(kind: ReminderKind, type: 'task' | 'bug', id: string, dueDate: string | null): string {
  return dueDate === null ? `${kind}:${type}:${id}` : `${kind}:${type}:${id}:${dueDate}`;
}

const KIND_ORDER: Record<ReminderKind, number> = { overdue: 0, critical: 1, today: 2, upcoming: 3 };

/**
 * The reminders that should be shown now and have not been shown before.
 * Finished items (done tasks, fixed or closed bugs) never remind, and nothing
 * is returned while notifications are off or before the reminder time.
 *
 * An item created or edited after today's reminder time is not reminded
 * today: you just looked at it. It is reminded at the next reminder time if
 * it still needs attention (e.g. "due today" becomes "overdue" tomorrow).
 */
export function getDueReminders(
  workspace: Pick<Workspace, 'tasks' | 'bugs'>,
  settings: ReminderSettings,
  now: Date,
  alreadySent: ReadonlySet<string>,
): Reminder[] {
  if (!settings.enabled || !isReminderTimeReached(settings, now)) return [];
  const today = toDayKey(now);
  const moment = reminderMoment(settings, now).getTime();
  const reminders: Reminder[] = [];

  const consider = (type: 'task' | 'bug', item: Task | Bug) => {
    if (isFinished(item)) return;
    if (Date.parse(item.updatedAt) >= moment) return;
    if (type === 'bug' && item.priority === 'critical') {
      const key = reminderKey('critical', 'bug', item.id, null);
      if (!alreadySent.has(key)) reminders.push({ key, kind: 'critical', type, id: item.id, title: item.title, dueDate: item.dueDate });
    }
    if (!isValidDueDate(item.dueDate)) return;
    const days = daysBetween(today, item.dueDate);
    let kind: ReminderKind | null = null;
    if (days < 0) kind = 'overdue';
    else if (days === 0) kind = 'today';
    else if (settings.leadDays > 0 && days <= settings.leadDays) kind = 'upcoming';
    if (kind === null) return;
    const key = reminderKey(kind, type, item.id, item.dueDate);
    if (!alreadySent.has(key)) reminders.push({ key, kind, type, id: item.id, title: item.title, dueDate: item.dueDate });
  };

  if (settings.tasks) for (const task of workspace.tasks) consider('task', task);
  if (settings.bugs) for (const bug of workspace.bugs) consider('bug', bug);

  return reminders.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
}

export interface NotificationMessage {
  title: string;
  body: string;
}

/** More reminders than this at once are combined into one summary instead of a burst of toasts. */
export const MAX_SEPARATE_NOTIFICATIONS = 3;

function describe(reminder: Reminder, today: string): NotificationMessage {
  const task = reminder.type === 'task';
  const due = reminder.dueDate;
  const quoted = t('“{title}”', { title: reminder.title });
  switch (reminder.kind) {
    case 'overdue':
      return {
        title: task ? t('Task overdue') : t('Bug overdue'),
        body: due ? t('“{title}” was due {date}.', { title: reminder.title, date: formatDueDate(due, today) }) : t('“{title}” was due earlier.', { title: reminder.title }),
      };
    case 'today':
      return { title: task ? t('Task due today') : t('Bug due today'), body: quoted };
    case 'upcoming': {
      const days = due ? daysBetween(today, due) : 0;
      const title = days === 1 ? (task ? t('Task due tomorrow') : t('Bug due tomorrow')) : t(task ? 'Task due in {count} days' : 'Bug due in {count} days', { count: days });
      return { title, body: `${quoted}${due ? ` · ${formatDueDate(due, today)}` : ''}` };
    }
    case 'critical':
      return { title: t('Critical bug open'), body: t('“{title}” is still unresolved.', { title: reminder.title }) };
  }
}

/** Turns reminders into the notifications to show: one each, or a single summary for many. */
export function toNotifications(reminders: readonly Reminder[], now: Date): NotificationMessage[] {
  const today = toDayKey(now);
  if (reminders.length <= MAX_SEPARATE_NOTIFICATIONS) return reminders.map((reminder) => describe(reminder, today));
  const count = (kind: ReminderKind) => reminders.filter((reminder) => reminder.kind === kind).length;
  const parts = [
    count('overdue') > 0 && t('{count} overdue', { count: count('overdue') }),
    count('today') > 0 && t('{count} due today', { count: count('today') }),
    count('upcoming') > 0 && t('{count} coming up', { count: count('upcoming') }),
    count('critical') > 0 && tn('{count} critical bug|{count} critical bugs', count('critical')),
  ].filter(Boolean);
  const names = reminders.slice(0, 3).map((reminder) => t('“{title}”', { title: reminder.title })).join(', ');
  const body = reminders.length > 3 ? t('{parts}: {names} and more.', { parts: parts.join(', '), names }) : t('{parts}: {names}.', { parts: parts.join(', '), names });
  return [{ title: t('{count} reminders in VOID', { count: reminders.length }), body }];
}

/* ---------- The log of reminders that were already sent ---------- */

/** Reminder key → ISO time it was sent. */
export type SentLog = Record<string, string>;

/** Entries older than this are dropped; their due dates are long past and can never repeat. */
export const SENT_LOG_RETENTION_DAYS = 120;
export const MAX_SENT_LOG_ENTRIES = 2000;

export function recordSent(log: SentLog, keys: readonly string[], now: Date): SentLog {
  const next: SentLog = { ...log };
  const iso = now.toISOString();
  for (const key of keys) next[key] = iso;
  return pruneSentLog(next, now);
}

/** Keeps the log small: drops old entries and, if still too large, the oldest ones. */
export function pruneSentLog(log: SentLog, now: Date): SentLog {
  const cutoff = addDays(toDayKey(now), -SENT_LOG_RETENTION_DAYS);
  const entries = Object.entries(log).filter(([, sentAt]) => typeof sentAt === 'string' && !Number.isNaN(Date.parse(sentAt)) && toDayKey(new Date(sentAt)) >= cutoff);
  entries.sort((a, b) => b[1].localeCompare(a[1]));
  return Object.fromEntries(entries.slice(0, MAX_SENT_LOG_ENTRIES));
}
