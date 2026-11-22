import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DevToolsContext, isDevToolsShortcut, type DevToolsContextValue } from './devToolsContext';

// Only loaded when someone actually opens the developer tools.
const DevToolsDialog = lazy(() => import('./DevToolsDialog').then((module) => ({ default: module.DevToolsDialog })));

/** Owns the small developer tools dialog and its Ctrl+Shift+D shortcut. */
export function DevToolsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openDevTools = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !isDevToolsShortcut(event)) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo<DevToolsContextValue>(() => ({ openDevTools }), [openDevTools]);
  return (
    <DevToolsContext.Provider value={value}>
      {children}
      {open && (
        <Suspense fallback={null}>
          <DevToolsDialog onClose={close} />
        </Suspense>
      )}
    </DevToolsContext.Provider>
  );
}
