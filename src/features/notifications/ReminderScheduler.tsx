import { useEffect, useRef } from 'react';

import { getDueReminders, recordSent, toNotifications } from '../../domain/reminders';
import { canNotifyAutomatically, getDesktopBridge, sendNotification } from '../../lib/desktop';
import { usePreferences } from '../../state/preferencesContext';
import { useWorkspace } from '../../state/workspaceContext';

/** The first check waits until the app has settled, so reminders never slow down the start. */
export const FIRST_CHECK_DELAY_MS = 4000;
/** How often due reminders are checked while VOID runs (also minimized or in the tray). */
export const CHECK_INTERVAL_MS = 60_000;
/** After an edit, check again shortly (e.g. a task was marked done: its reminder must not fire). */
const CHANGE_DEBOUNCE_MS = 1500;

/**
 * Sends due date reminders as desktop notifications while VOID is running.
 * Which reminders are due is decided by domain/reminders.ts; the keys of sent
 * reminders are stored locally, so each one is shown at most once, also
 * across restarts. Renders nothing.
 */
export function ReminderScheduler() {
  const workspace = useWorkspace();
  const { preferences, repository } = usePreferences();
  const latest = useRef({ workspace, settings: preferences.notifications });
  const check = useRef<() => Promise<void>>(async () => {});
  const started = useRef(false);

  useEffect(() => {
    latest.current = { workspace, settings: preferences.notifications };
  }, [workspace, preferences.notifications]);

  // The desktop shell needs to know about tray mode before the window is closed.
  useEffect(() => {
    getDesktopBridge()?.setKeepInTray(preferences.keepInTray);
  }, [preferences.keepInTray]);

  useEffect(() => {
    let running = false;
    // Keys sent in this session, in case saving the log ever fails: still never twice per session.
    const sentThisSession = new Set<string>();
    check.current = async () => {
      if (running || !canNotifyAutomatically()) return;
      running = true;
      try {
        const now = new Date();
        const log = repository.loadSentLog(now);
        const alreadySent = new Set([...Object.keys(log), ...sentThisSession]);
        const reminders = getDueReminders(latest.current.workspace, latest.current.settings, now, alreadySent);
        if (reminders.length === 0) return;
        const keys = reminders.map((reminder) => reminder.key);
        // Recorded before sending: a crash halfway may skip a reminder, but can never repeat one.
        for (const key of keys) sentThisSession.add(key);
        repository.saveSentLog(recordSent(log, keys, now));
        for (const message of toNotifications(reminders, now)) await sendNotification(message);
      } finally {
        running = false;
      }
    };
    const first = window.setTimeout(() => {
      started.current = true;
      void check.current();
    }, FIRST_CHECK_DELAY_MS);
    const interval = window.setInterval(() => void check.current(), CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
      started.current = false;
    };
  }, [repository]);

  useEffect(() => {
    if (!started.current) return;
    const timer = window.setTimeout(() => void check.current(), CHANGE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [workspace, preferences.notifications]);

  return null;
}
