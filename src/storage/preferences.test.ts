import { describe, expect, it } from 'vitest';

import { DEFAULT_REMINDER_SETTINGS } from '../domain/reminders';
import { MemoryKeyValueStore, type KeyValueStore } from './keyValueStore';
import { DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY, PreferencesRepository, SENT_REMINDERS_STORAGE_KEY } from './preferences';

const NOW = new Date(2026, 0, 15, 10, 0);

describe('PreferencesRepository', () => {
  it('starts with the defaults: reminders on at 09:00, tray mode off', () => {
    const repository = new PreferencesRepository(new MemoryKeyValueStore());
    expect(repository.load()).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.notifications).toEqual(DEFAULT_REMINDER_SETTINGS);
    expect(DEFAULT_PREFERENCES.keepInTray).toBe(false);
  });

  it('saves and loads preferences', () => {
    const store = new MemoryKeyValueStore();
    const preferences = { notifications: { enabled: false, tasks: true, bugs: false, time: '18:30', leadDays: 3 as const }, keepInTray: true };
    expect(new PreferencesRepository(store).save(preferences)).toBe(true);
    expect(new PreferencesRepository(store).load()).toEqual(preferences);
  });

  it('replaces only the broken fields with defaults', () => {
    const store = new MemoryKeyValueStore({
      [PREFERENCES_STORAGE_KEY]: JSON.stringify({ notifications: { enabled: false, time: '25:00', leadDays: 5, tasks: 'yes' }, keepInTray: 1 }),
    });
    expect(new PreferencesRepository(store).load()).toEqual({
      notifications: { ...DEFAULT_REMINDER_SETTINGS, enabled: false },
      keepInTray: false,
    });
  });

  it('falls back to the defaults for corrupt JSON', () => {
    const store = new MemoryKeyValueStore({ [PREFERENCES_STORAGE_KEY]: '{oops' });
    expect(new PreferencesRepository(store).load()).toEqual(DEFAULT_PREFERENCES);
  });

  it('keeps the sent reminders across restarts and ignores invalid entries', () => {
    const store = new MemoryKeyValueStore();
    const sentAt = new Date(2026, 0, 15, 9, 0).toISOString();
    new PreferencesRepository(store).saveSentLog({ 'today:task:a:2026-01-15': sentAt });
    expect(new PreferencesRepository(store).loadSentLog(NOW)).toEqual({ 'today:task:a:2026-01-15': sentAt });

    store.setItem(SENT_REMINDERS_STORAGE_KEY, JSON.stringify({ good: sentAt, bad: 42 }));
    expect(new PreferencesRepository(store).loadSentLog(NOW)).toEqual({ good: sentAt });
    store.setItem(SENT_REMINDERS_STORAGE_KEY, '[1,2]');
    expect(new PreferencesRepository(store).loadSentLog(NOW)).toEqual({});
  });

  it('reports a failed write instead of throwing', () => {
    const full: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
    };
    const repository = new PreferencesRepository(full);
    expect(repository.save(DEFAULT_PREFERENCES)).toBe(false);
    expect(repository.saveSentLog({})).toBe(false);
  });

  it('uses its own keys and never touches the workspace data', () => {
    const store = new MemoryKeyValueStore({ 'void:workspace': '{"keep":true}' });
    new PreferencesRepository(store).save(DEFAULT_PREFERENCES);
    expect(store.getItem('void:workspace')).toBe('{"keep":true}');
  });
});
