import { useCallback } from 'react';

import { DEFAULT_DASHBOARD_LAYOUT, normalizeDashboardLayout, type DashboardLayout } from '../../domain/dashboardLayout';
import { usePreferences } from '../../state/preferencesContext';

/** The dashboard layout of this device, saved with the other preferences on every change. */
export function useDashboardLayout() {
  const { preferences, updatePreferences } = usePreferences();
  const layout = normalizeDashboardLayout(preferences.dashboard ?? DEFAULT_DASHBOARD_LAYOUT);
  /** Returns false if the change could not be saved (it still applies for this session). */
  const setLayout = useCallback(
    (update: (current: DashboardLayout) => DashboardLayout) =>
      updatePreferences((current) => ({ ...current, dashboard: update(normalizeDashboardLayout(current.dashboard ?? DEFAULT_DASHBOARD_LAYOUT)) })),
    [updatePreferences],
  );
  return { layout, setLayout };
}
