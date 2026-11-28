import type { DiscordSettings, PresenceActivity, PresenceState } from '../domain/discordPresence';
import type { OptimizerApi } from '../domain/optimizer/service';

/**
 * The small, explicit bridge the Electron shell exposes to the page
 * (electron/preload.cjs). In a normal browser it does not exist, and VOID
 * falls back to the web Notification API where possible.
 */
export interface DesktopBridge {
  readonly isDesktop: true;
  /** Shows a native Windows notification. Resolves to false if the system refused. */
  notify(message: { title: string; body: string }): Promise<boolean>;
  /** Closing the window then hides VOID to the notification area instead of quitting. */
  setKeepInTray(enabled: boolean): void;
  /** Discord Rich Presence (VOID 4.3). Missing in older desktop builds. */
  discord?: DiscordBridge;
  /** PC Optimizer backend (read-only scan, preview, dry run). Missing in older desktop builds. */
  optimizer?: OptimizerApi & { openTarget?: (id: string) => Promise<boolean> };
}

/**
 * Discord Rich Presence in the desktop shell. The page only passes on/off
 * switches and one of three activity names; the shell owns the texts.
 */
export interface DiscordBridge {
  configure(settings: DiscordSettings): Promise<PresenceState>;
  setActivity(activity: PresenceActivity): void;
  reconnect(): Promise<PresenceState>;
  getState(): Promise<PresenceState>;
  /** Returns a function that stops listening. */
  onStateChange(listener: (state: PresenceState) => void): () => void;
}

declare global {
  interface Window {
    voidDesktop?: DesktopBridge;
  }
}

export function getDesktopBridge(): DesktopBridge | null {
  return typeof window !== 'undefined' && window.voidDesktop?.isDesktop === true ? window.voidDesktop : null;
}

export function getDiscordBridge(): DiscordBridge | null {
  return getDesktopBridge()?.discord ?? null;
}

export type NotificationSupport = 'desktop' | 'browser' | 'browser-blocked' | 'unsupported';

export function getNotificationSupport(): NotificationSupport {
  if (getDesktopBridge()) return 'desktop';
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return 'unsupported';
  return window.Notification.permission === 'denied' ? 'browser-blocked' : 'browser';
}

/**
 * True when a reminder can be shown without asking: in the desktop app, or in a
 * browser that already allowed notifications. Otherwise reminders are not
 * marked as sent, so they are not lost.
 */
export function canNotifyAutomatically(): boolean {
  if (getDesktopBridge()) return true;
  return typeof window !== 'undefined' && typeof window.Notification !== 'undefined' && window.Notification.permission === 'granted';
}

/** Sends one notification through the desktop shell, or the browser as a fallback. Never throws. */
export async function sendNotification(message: { title: string; body: string }): Promise<boolean> {
  try {
    const bridge = getDesktopBridge();
    if (bridge) return await bridge.notify(message);
    if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return false;
    if (window.Notification.permission === 'default') await window.Notification.requestPermission();
    if (window.Notification.permission !== 'granted') return false;
    new window.Notification(message.title, { body: message.body, icon: '/icon.png' });
    return true;
  } catch {
    return false;
  }
}
