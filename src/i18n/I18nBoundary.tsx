import { Fragment, useEffect, type ReactNode } from 'react';

import { usePreferences } from '../state/preferencesContext';
import type { Preferences } from '../storage/preferences';
import { detectLanguage, languageInfo, type Language } from './languages';
import { setLanguage } from './translate';

/** The chosen language, or the system/browser language when none was chosen yet (English if unsupported). */
export function resolveLanguage(preferences: Pick<Preferences, 'language'>): Language {
  return preferences.language ?? detectLanguage(typeof navigator === 'undefined' ? undefined : navigator.languages);
}

export function useLanguage(): Language {
  return resolveLanguage(usePreferences().preferences);
}

/**
 * Makes the chosen language active before anything below renders, and keeps
 * <html lang> in sync for screen readers and fonts.
 */
export function I18nBoundary({ children }: { children: ReactNode }) {
  const language = useLanguage();
  setLanguage(language);
  useEffect(() => {
    document.documentElement.lang = languageInfo(language).locale;
  }, [language]);
  return children;
}

/**
 * Re-mounts the pages when the language changes, so every label, including
 * ones computed once on mount, shows up in the new language. It sits below the
 * providers, so the workspace, filters and unsaved Code Tester code survive.
 */
export function RemountOnLanguageChange({ children }: { children: ReactNode }) {
  return <Fragment key={useLanguage()}>{children}</Fragment>;
}
