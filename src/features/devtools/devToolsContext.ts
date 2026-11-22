import { createContext, useContext } from 'react';

export interface DevToolsContextValue {
  openDevTools: () => void;
}

export const DevToolsContext = createContext<DevToolsContextValue | null>(null);

export function useDevTools(): DevToolsContextValue {
  const value = useContext(DevToolsContext);
  if (!value) throw new Error('useDevTools must be used inside <DevToolsProvider>.');
  return value;
}

export const DEV_TOOLS_SHORTCUT_LABEL = 'Ctrl Shift D';

/** Ctrl+Shift+D (or ⌘⇧D), without Alt and not while composing text. */
export function isDevToolsShortcut(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && !event.isComposing && event.key.toLowerCase() === 'd';
}
