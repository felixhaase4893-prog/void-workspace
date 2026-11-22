import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { activityForPath, describeConnection, type DiscordSettings, type PresenceActivity, type PresenceState } from '../domain/discordPresence';
import type { DesktopBridge, DiscordBridge } from '../lib/desktop';
import { MemoryKeyValueStore } from '../storage/keyValueStore';
import { PREFERENCES_STORAGE_KEY, PreferencesRepository } from '../storage/preferences';
import { WORKSPACE_STORAGE_KEY } from '../storage/keyValueWorkspaceRepository';
import { makeProject, makeWorkspace } from '../test/fixtures';
import { renderApp } from '../test/renderApp';

function fakeDiscord(initial: Partial<PresenceState> = {}) {
  let listener: ((state: PresenceState) => void) | null = null;
  const state: PresenceState = { enabled: false, showElapsed: true, status: 'disabled', message: '', activity: 'idle', statusText: 'Using VOID', ...initial };
  const activities: PresenceActivity[] = [];
  const configs: DiscordSettings[] = [];
  const bridge: DiscordBridge = {
    configure: vi.fn(async (settings: DiscordSettings) => {
      configs.push(settings);
      Object.assign(state, { enabled: settings.enabled, showElapsed: settings.showElapsed, status: settings.enabled ? (initial.status ?? 'connected') : 'disabled' });
      return { ...state };
    }),
    setActivity: vi.fn((activity: PresenceActivity) => {
      activities.push(activity);
    }),
    reconnect: vi.fn(async () => ({ ...state, status: 'connecting' as const })),
    getState: vi.fn(async () => ({ ...state })),
    onStateChange: vi.fn((next: (state: PresenceState) => void) => {
      listener = next;
      return () => {
        listener = null;
      };
    }),
  };
  const desktop: DesktopBridge = { isDesktop: true, notify: async () => true, setKeepInTray: () => {}, discord: bridge };
  window.voidDesktop = desktop;
  return { bridge, activities, configs, push: (next: Partial<PresenceState>) => act(() => listener?.({ ...state, ...next })) };
}

function storeWithProject() {
  return new MemoryKeyValueStore({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(makeWorkspace({ projects: [makeProject({ id: 'project-1', name: 'Top Secret Game' })] })) });
}

afterEach(() => {
  delete window.voidDesktop;
});

describe('Discord presence, page side', () => {
  it('maps only routes to activities', () => {
    expect(activityForPath('/')).toBe('idle');
    expect(activityForPath('/tasks')).toBe('idle');
    expect(activityForPath('/settings')).toBe('idle');
    expect(activityForPath('/projects')).toBe('project');
    expect(activityForPath('/projects/abc')).toBe('project');
    expect(activityForPath('/code-tester')).toBe('code-tester');
    expect(activityForPath('/projectsfoo')).toBe('idle');
  });

  it('has a readable message for every connection state', () => {
    for (const status of ['disabled', 'not-configured', 'connecting', 'connected', 'unavailable', 'error', 'browser'] as const) {
      const text = describeConnection(status);
      expect(text.label.length).toBeGreaterThan(0);
      expect(text.detail.length).toBeGreaterThan(0);
    }
  });

  it('turns on by default and follows the current area', async () => {
    const user = userEvent.setup();
    const discord = fakeDiscord();
    renderApp({ store: storeWithProject() });
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(discord.configs).toEqual([{ enabled: true, showElapsed: true }]));
    expect(discord.activities).toEqual(['idle']);

    await user.click(within(screen.getAllByRole('navigation')[0]!).getByRole('link', { name: /Projects/ }));
    await waitFor(() => expect(discord.activities.at(-1)).toBe('project'));
    await user.click(screen.getByRole('link', { name: /Top Secret Game/ }));
    await user.click(within(screen.getAllByRole('navigation')[0]!).getByRole('link', { name: /Code Tester/ }));
    await waitFor(() => expect(discord.activities.at(-1)).toBe('code-tester'));
    await user.click(within(screen.getAllByRole('navigation')[0]!).getByRole('link', { name: /Tasks/ }));
    await waitFor(() => expect(discord.activities.at(-1)).toBe('idle'));

    // Moving inside the project area sends nothing new, and no project name ever leaves the page.
    expect(discord.activities).toEqual(['idle', 'project', 'code-tester', 'idle']);
    const everything = JSON.stringify([vi.mocked(discord.bridge.setActivity).mock.calls, vi.mocked(discord.bridge.configure).mock.calls]);
    expect(everything).not.toContain('Top Secret Game');
    expect(everything).not.toContain('project-1');
  });

  it('can be switched off and on in Settings, saved locally', async () => {
    const user = userEvent.setup();
    const discord = fakeDiscord();
    const store = new MemoryKeyValueStore();
    renderApp({ store, route: '/settings' });
    const section = (await screen.findByRole('heading', { name: 'Discord' })).closest('section')!;
    const main = within(section).getByRole('switch', { name: /Discord Rich Presence/ });
    const elapsed = within(section).getByRole('switch', { name: /Show time used/ });
    expect(main).toBeChecked();
    await waitFor(() => expect(within(section).getByTestId('discord-connection')).toHaveTextContent('Connected'));
    expect(within(section).getByText('Using VOID', { selector: 'dd span' })).toBeInTheDocument();

    await user.click(elapsed);
    await waitFor(() => expect(discord.configs.at(-1)).toEqual({ enabled: true, showElapsed: false }));
    await user.click(main);
    await waitFor(() => expect(discord.configs.at(-1)).toEqual({ enabled: false, showElapsed: false }));
    expect(within(section).getByTestId('discord-connection')).toHaveTextContent('Off');
    expect(elapsed).toBeDisabled();
    expect(JSON.parse(store.getItem(PREFERENCES_STORAGE_KEY) ?? '{}')).toMatchObject({ discord: { enabled: false, showElapsed: false } });
  });

  it('starts switched off when the user turned it off before', async () => {
    const discord = fakeDiscord();
    const store = new MemoryKeyValueStore({ [PREFERENCES_STORAGE_KEY]: JSON.stringify({ discord: { enabled: false, showElapsed: true } }) });
    renderApp({ store });
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(discord.configs).toEqual([{ enabled: false, showElapsed: true }]));
  });

  it('explains when Discord is not running, offers a retry and updates live', async () => {
    const user = userEvent.setup();
    const discord = fakeDiscord({ status: 'unavailable' });
    renderApp({ route: '/settings' });
    const section = (await screen.findByRole('heading', { name: 'Discord' })).closest('section')!;
    await waitFor(() => expect(within(section).getByTestId('discord-connection')).toHaveTextContent('Discord not running'));
    expect(within(section).getByText(/everything else works as usual/)).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Retry now' }));
    expect(discord.bridge.reconnect).toHaveBeenCalledTimes(1);
    discord.push({ status: 'connected', activity: 'idle', statusText: 'Using VOID' });
    await waitFor(() => expect(within(section).getByTestId('discord-connection')).toHaveTextContent('Connected'));
  });

  it('says it needs the desktop app in a browser, and the rest of VOID works', async () => {
    renderApp({ route: '/settings' });
    const section = (await screen.findByRole('heading', { name: 'Discord' })).closest('section')!;
    expect(within(section).getByRole('switch', { name: /Discord Rich Presence/ })).toBeDisabled();
    expect(within(section).getByTestId('discord-connection')).toHaveTextContent('Desktop app only');
  });

  it('keeps working with an older desktop shell without Discord support', async () => {
    window.voidDesktop = { isDesktop: true, notify: async () => true, setKeepInTray: () => {} };
    renderApp({ route: '/settings' });
    const section = (await screen.findByRole('heading', { name: 'Discord' })).closest('section')!;
    expect(within(section).getByTestId('discord-connection')).toHaveTextContent('Desktop app only');
  });

  it('loads preferences without Discord settings, and repairs broken ones', () => {
    expect(new PreferencesRepository(new MemoryKeyValueStore({ [PREFERENCES_STORAGE_KEY]: JSON.stringify({ keepInTray: true }) })).load().discord).toBeUndefined();
    const broken = new PreferencesRepository(new MemoryKeyValueStore({ [PREFERENCES_STORAGE_KEY]: JSON.stringify({ discord: { enabled: 'yes', showElapsed: false } }) }));
    expect(broken.load().discord).toEqual({ enabled: true, showElapsed: false });
  });
});
