import { createContext, useContext } from 'react';

import type { Preferences, PreferencesRepository } from '../storage/preferences';

export interface PreferencesContextValue {
  preferences: Preferences;
  /** Applies and saves a change. Returns false if it could not be saved (it still applies for this session). */
  updatePreferences(update: (current: Preferences) => Preferences): boolean;
  repository: PreferencesRepository;
}

export const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside <PreferencesProvider>.');
  return value;
}
