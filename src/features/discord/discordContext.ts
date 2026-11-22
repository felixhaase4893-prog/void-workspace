import { createContext, useContext } from 'react';

import type { PresenceState } from '../../domain/discordPresence';

export interface DiscordPresenceContextValue {
  /** False in a browser or an older desktop build: Rich Presence cannot work there. */
  available: boolean;
  /** Last state reported by the desktop shell, null until the first answer. */
  state: PresenceState | null;
  reconnect(): void;
}

export const DiscordPresenceContext = createContext<DiscordPresenceContextValue>({ available: false, state: null, reconnect: () => {} });

export function useDiscordPresence(): DiscordPresenceContextValue {
  return useContext(DiscordPresenceContext);
}
