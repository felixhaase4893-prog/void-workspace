import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { NAVIGATION } from './navigation';

/** Keeps the tab title in sync with the current section. */
export function DocumentTitle() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Nested routes such as /projects/:id use their section's title.
    const item = NAVIGATION.find((entry) => (entry.to === '/' ? pathname === '/' : pathname === entry.to || pathname.startsWith(`${entry.to}/`)));
    document.title = item && item.to !== '/' ? `${item.label} · VOID` : 'VOID';
  }, [pathname]);
  return null;
}
