import { useCallback, useState } from 'react';

import { addToSearchHistory, removeFromSearchHistory } from '../../domain/searchHistory';
import { usePreferences } from '../../state/preferencesContext';

/**
 * Recent searches on this device. A query is only remembered once a result
 * was opened for it, never while typing. Turning the history off deletes it.
 */
export function useSearchHistory() {
  const { preferences, updatePreferences, repository } = usePreferences();
  const enabled = preferences.searchHistory !== false;
  const [history, setHistory] = useState<string[]>(() => (enabled ? repository.loadSearchHistory() : []));

  const store = useCallback(
    (next: string[]) => {
      setHistory(next);
      repository.saveSearchHistory(next);
    },
    [repository],
  );

  const remember = useCallback(
    (query: string) => {
      if (!enabled) return;
      store(addToSearchHistory(repository.loadSearchHistory(), query));
    },
    [enabled, repository, store],
  );

  const remove = useCallback((query: string) => store(removeFromSearchHistory(history, query)), [history, store]);
  const clear = useCallback(() => store([]), [store]);

  const setEnabled = useCallback(
    (value: boolean) => {
      updatePreferences((current) => ({ ...current, searchHistory: value }));
      if (!value) store([]);
    },
    [updatePreferences, store],
  );

  return { enabled, history: enabled ? history : [], remember, remove, clear, setEnabled };
}
