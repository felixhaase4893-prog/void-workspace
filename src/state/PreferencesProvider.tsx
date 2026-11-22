import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import type { Preferences, PreferencesRepository } from '../storage/preferences';
import { PreferencesContext, type PreferencesContextValue } from './preferencesContext';

/** Loads the app preferences once (a tiny synchronous read) and saves every change right away. */
export function PreferencesProvider({ repository, children }: { repository: PreferencesRepository; children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => repository.load());
  const latest = useRef(preferences);

  const updatePreferences = useCallback(
    (update: (current: Preferences) => Preferences) => {
      const next = update(latest.current);
      latest.current = next;
      setPreferences(next);
      return repository.save(next);
    },
    [repository],
  );

  const value = useMemo<PreferencesContextValue>(() => ({ preferences, updatePreferences, repository }), [preferences, updatePreferences, repository]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
