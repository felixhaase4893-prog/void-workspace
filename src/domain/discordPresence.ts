/**
 * Discord Rich Presence, page side. The page only decides *which* of three
 * fixed activities applies; the text itself lives in the desktop shell
 * (electron/discordPresence.cjs), so no content of the workspace can ever be
 * sent to Discord. The texts are repeated here only to show them in Settings.
 */

export const PRESENCE_ACTIVITIES = ['idle', 'project', 'code-tester'] as const;
export type PresenceActivity = (typeof PRESENCE_ACTIVITIES)[number];

export const PRESENCE_STATUS_TEXT: Readonly<Record<PresenceActivity, string>> = {
  idle: 'Using VOID',
  project: 'Working on a project',
  'code-tester': 'testing a code',
};

export type PresenceConnection = 'disabled' | 'not-configured' | 'connecting' | 'connected' | 'unavailable' | 'error';

export interface PresenceState {
  enabled: boolean;
  showElapsed: boolean;
  status: PresenceConnection;
  message: string;
  activity: PresenceActivity;
  statusText: string;
}

export interface DiscordSettings {
  enabled: boolean;
  /** Show "elapsed" time since VOID was opened. */
  showElapsed: boolean;
}

export const DEFAULT_DISCORD_SETTINGS: DiscordSettings = { enabled: true, showElapsed: true };

/** Which activity a page stands for. Only the route decides; never what is shown on it. */
export function activityForPath(pathname: string): PresenceActivity {
  if (pathname === '/code-tester' || pathname.startsWith('/code-tester/')) return 'code-tester';
  if (pathname === '/projects' || pathname.startsWith('/projects/')) return 'project';
  return 'idle';
}

export interface ConnectionDescription {
  label: string;
  tone: 'success' | 'accent' | 'warning' | 'danger' | 'neutral';
  detail: string;
}

/** What the Settings page says about the connection. */
export function describeConnection(status: PresenceConnection | 'browser'): ConnectionDescription {
  switch (status) {
    case 'connected':
      return { label: 'Connected', tone: 'success', detail: 'Your status is visible in Discord.' };
    case 'connecting':
      return { label: 'Connecting…', tone: 'accent', detail: 'Looking for the Discord desktop app.' };
    case 'unavailable':
      return {
        label: 'Discord not running',
        tone: 'warning',
        detail: 'Discord desktop is not open. VOID connects on its own as soon as it is; everything else works as usual.',
      };
    case 'error':
      return { label: 'Not accepted', tone: 'danger', detail: 'Discord did not accept the connection. Rich Presence stays off until VOID is restarted.' };
    case 'not-configured':
      return { label: 'Not set up', tone: 'warning', detail: 'This build of VOID has no Discord application ID, so Rich Presence is not available.' };
    case 'browser':
      return { label: 'Desktop app only', tone: 'neutral', detail: 'Rich Presence needs the VOID desktop app and the Discord desktop app on the same PC.' };
    case 'disabled':
    default:
      return { label: 'Off', tone: 'neutral', detail: 'Nothing is shared with Discord.' };
  }
}
