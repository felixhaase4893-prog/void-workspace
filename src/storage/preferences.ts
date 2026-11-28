import { z } from 'zod';

import { DEFAULT_REMINDER_SETTINGS, REMINDER_LEAD_DAYS, REMINDER_TIME_PATTERN, pruneSentLog, type ReminderSettings, type SentLog } from '../domain/reminders';
import { normalizeDashboardLayout, type DashboardLayout } from '../domain/dashboardLayout';
import { DEFAULT_DISCORD_SETTINGS, type DiscordSettings } from '../domain/discordPresence';
import { parseSearchHistory } from '../domain/searchHistory';
import { isLanguage, type Language } from '../i18n/languages';
import type { KeyValueStore } from './keyValueStore';

/**
 * App preferences that are not part of the workspace: notification settings,
 * tray mode, and the log of reminders that were already shown. They live next
 * to the workspace in the same local storage, under their own keys, so they
 * never mix with (or get exported as) projects and tasks.
 */

export const PREFERENCES_STORAGE_KEY = 'void:preferences';
export const SENT_REMINDERS_STORAGE_KEY = 'void:reminders-sent';
export const SEARCH_HISTORY_STORAGE_KEY = 'void:search-history';

export interface Preferences {
  notifications: ReminderSettings;
  /** Desktop only: closing the window keeps VOID running in the notification area. */
  keepInTray: boolean;
  /** Dashboard cards: order and hidden ones. Missing means the default layout. */
  dashboard?: DashboardLayout;
  /** Remember recent searches. Missing means on. */
  searchHistory?: boolean;
  /** Discord Rich Presence (4.3). Missing means the defaults (on, with elapsed time). */
  discord?: DiscordSettings;
  /** App language (4.5). Missing means the system language, or English if VOID does not speak it. */
  language?: Language;
}

/** The Discord settings with defaults filled in. */
export function getDiscordSettings(preferences: Preferences): DiscordSettings {
  return preferences.discord ?? DEFAULT_DISCORD_SETTINGS;
}

export const DEFAULT_PREFERENCES: Preferences = { notifications: DEFAULT_REMINDER_SETTINGS, keepInTray: false };

const d = DEFAULT_REMINDER_SETTINGS;
// Every field falls back to its default on its own, so one odd value never resets the rest.
const preferencesSchema = z.object({
  notifications: z
    .object({
      enabled: z.boolean().catch(d.enabled),
      tasks: z.boolean().catch(d.tasks),
      bugs: z.boolean().catch(d.bugs),
      time: z.string().regex(REMINDER_TIME_PATTERN).catch(d.time),
      leadDays: z
        .number()
        .refine((value): value is ReminderSettings['leadDays'] => (REMINDER_LEAD_DAYS as readonly number[]).includes(value))
        .catch(d.leadDays),
    })
    .catch(d),
  keepInTray: z.boolean().catch(false),
  // Added in the QoL update. Optional, so preferences saved by older versions load unchanged.
  dashboard: z.unknown().transform(normalizeDashboardLayout).optional(),
  searchHistory: z.boolean().optional().catch(undefined),
  // Added in 4.3, optional for the same reason.
  discord: z
    .object({
      enabled: z.boolean().catch(DEFAULT_DISCORD_SETTINGS.enabled),
      showElapsed: z.boolean().catch(DEFAULT_DISCORD_SETTINGS.showElapsed),
    })
    .optional()
    .catch(undefined),
  // Added in 4.5. An unknown code (e.g. from a newer version) falls back to the system language.
  language: z.string().refine(isLanguage).optional().catch(undefined),
});

function readJson(store: KeyValueStore, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export class PreferencesRepository {
  constructor(private readonly store: KeyValueStore) {}

  load(): Preferences {
    const parsed = preferencesSchema.safeParse(readJson(this.store, PREFERENCES_STORAGE_KEY) ?? {});
    return parsed.success ? (parsed.data as Preferences) : DEFAULT_PREFERENCES;
  }

  /** Returns false when the preferences could not be written (e.g. storage full). */
  save(preferences: Preferences): boolean {
    try {
      this.store.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
      return true;
    } catch {
      return false;
    }
  }

  loadSentLog(now: Date = new Date()): SentLog {
    const raw = readJson(this.store, SENT_REMINDERS_STORAGE_KEY);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    const log: SentLog = {};
    for (const [key, value] of Object.entries(raw)) if (typeof value === 'string') log[key] = value;
    return pruneSentLog(log, now);
  }

  loadSearchHistory(): string[] {
    return parseSearchHistory(readJson(this.store, SEARCH_HISTORY_STORAGE_KEY));
  }

  /** An empty list removes the stored entry completely. */
  saveSearchHistory(history: readonly string[]): boolean {
    try {
      if (history.length === 0) this.store.removeItem(SEARCH_HISTORY_STORAGE_KEY);
      else this.store.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(history));
      return true;
    } catch {
      return false;
    }
  }

  saveSentLog(log: SentLog): boolean {
    try {
      this.store.setItem(SENT_REMINDERS_STORAGE_KEY, JSON.stringify(log));
      return true;
    } catch {
      return false;
    }
  }
}
