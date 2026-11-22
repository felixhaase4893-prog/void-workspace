import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { activityForPath, type PresenceState } from '../../domain/discordPresence';
import { getDiscordBridge } from '../../lib/desktop';
import { usePreferences } from '../../state/preferencesContext';
import { getDiscordSettings } from '../../storage/preferences';
import { DiscordPresenceContext, type DiscordPresenceContextValue } from './discordContext';

/**
 * Keeps Discord Rich Presence in line with the settings and the current page.
 * Only the route is looked at, and only an activity name is passed on: no
 * project names, code or other content. Does nothing outside the desktop app.
 */
export function DiscordPresenceProvider({ children }: { children: ReactNode }) {
  const bridge = getDiscordBridge();
  const { preferences } = usePreferences();
  const { enabled, showElapsed } = getDiscordSettings(preferences);
  const activity = activityForPath(useLocation().pathname);
  const [state, setState] = useState<PresenceState | null>(null);

  useEffect(() => {
    if (!bridge) return;
    return bridge.onStateChange(setState);
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    let current = true;
    bridge
      .configure({ enabled, showElapsed })
      .then((next) => {
        if (current && next) setState(next);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [bridge, enabled, showElapsed]);

  // The shell ignores repeats and bundles quick changes, so plain navigation is cheap.
  useEffect(() => {
    bridge?.setActivity(activity);
  }, [bridge, activity]);

  const reconnect = useCallback(() => {
    bridge
      ?.reconnect()
      .then((next) => {
        if (next) setState(next);
      })
      .catch(() => {});
  }, [bridge]);

  const value = useMemo<DiscordPresenceContextValue>(() => ({ available: bridge !== null, state, reconnect }), [bridge, state, reconnect]);
  return <DiscordPresenceContext.Provider value={value}>{children}</DiscordPresenceContext.Provider>;
}
