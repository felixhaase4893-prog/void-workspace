import { describe, expect, it } from 'vitest';

import { DEFAULT_DASHBOARD_LAYOUT } from '../domain/dashboardLayout';
import { MemoryKeyValueStore } from './keyValueStore';
import { DEFAULT_PREFERENCES, PREFERENCES_STORAGE_KEY, PreferencesRepository, SEARCH_HISTORY_STORAGE_KEY } from './preferences';

describe('preferences added in the QoL update', () => {
  it('loads preferences saved by older versions without the new fields', () => {
    const store = new MemoryKeyValueStore({ [PREFERENCES_STORAGE_KEY]: JSON.stringify(DEFAULT_PREFERENCES) });
    const loaded = new PreferencesRepository(store).load();
    expect(loaded.dashboard).toBeUndefined();
    expect(loaded.searchHistory).toBeUndefined();
  });

  it('keeps the dashboard layout and repairs broken ones', () => {
    const store = new MemoryKeyValueStore();
    const repository = new PreferencesRepository(store);
    const dashboard = { order: ['projects', 'stats', 'quickActions', 'dueSoon', 'recent'] as const, hidden: ['recent'] as const };
    repository.save({ ...DEFAULT_PREFERENCES, dashboard: { order: [...dashboard.order], hidden: [...dashboard.hidden] }, searchHistory: false });
    // Layouts saved before 4.2 get the new statistics card appended.
    expect(new PreferencesRepository(store).load()).toMatchObject({ dashboard: { order: [...dashboard.order, 'statistics'], hidden: dashboard.hidden }, searchHistory: false });

    store.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ dashboard: 'broken', searchHistory: 'yes' }));
    expect(new PreferencesRepository(store).load()).toMatchObject({ dashboard: DEFAULT_DASHBOARD_LAYOUT, searchHistory: undefined });
  });

  it('stores search history under its own key and removes it when cleared', () => {
    const store = new MemoryKeyValueStore();
    const repository = new PreferencesRepository(store);
    expect(repository.loadSearchHistory()).toEqual([]);
    repository.saveSearchHistory(['jump', 'save']);
    expect(new PreferencesRepository(store).loadSearchHistory()).toEqual(['jump', 'save']);
    repository.saveSearchHistory([]);
    expect(store.getItem(SEARCH_HISTORY_STORAGE_KEY)).toBeNull();
  });

  it('ignores a corrupt search history', () => {
    const store = new MemoryKeyValueStore({ [SEARCH_HISTORY_STORAGE_KEY]: '{oops' });
    expect(new PreferencesRepository(store).loadSearchHistory()).toEqual([]);
  });
});
