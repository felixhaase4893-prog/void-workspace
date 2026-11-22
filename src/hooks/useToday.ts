import { useEffect, useState } from 'react';

import { toDayKey } from '../domain/dueDates';

/**
 * Today's local calendar day (`YYYY-MM-DD`). Updates itself shortly after
 * midnight and whenever the window becomes visible again, so "Due today" and
 * "Overdue" never go stale while VOID stays open overnight.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => toDayKey(new Date()));

  useEffect(() => {
    const refresh = () => setToday(toDayKey(new Date()));
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const timer = window.setTimeout(refresh, nextMidnight.getTime() - now.getTime());
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [today]);

  return today;
}
