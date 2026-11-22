import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { addDays, toDayKey } from '../domain/dueDates';
import type { Workspace } from '../domain/models';
import { FIRST_CHECK_DELAY_MS } from '../features/notifications/ReminderScheduler';
import { WORKSPACE_STORAGE_KEY } from '../storage/keyValueWorkspaceRepository';
import { MemoryKeyValueStore } from '../storage/keyValueStore';
import { PREFERENCES_STORAGE_KEY, SENT_REMINDERS_STORAGE_KEY } from '../storage/preferences';
import { makeBug, makeProject, makeTask, makeWorkspace } from '../test/fixtures';
import { renderApp } from '../test/renderApp';

const today = () => toDayKey(new Date());

function storeWith(workspace: Workspace, extra: Record<string, string> = {}) {
  return new MemoryKeyValueStore({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(workspace), ...extra });
}

function stored(store: MemoryKeyValueStore): Workspace {
  return JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '{}') as Workspace;
}

afterEach(() => {
  vi.useRealTimers();
  delete window.voidDesktop;
});

describe('due dates in the app', () => {
  it('creates a task with a due date and shows it in the list', async () => {
    const user = userEvent.setup();
    const store = storeWith(makeWorkspace({ tasks: [makeTask({ id: 'other', title: 'Other task' })] }));
    renderApp({ store, route: '/tasks' });
    await user.click(await screen.findByRole('button', { name: /new task/i }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Title'), 'Ship demo');
    fireEvent.change(within(dialog).getByLabelText(/due date/i), { target: { value: today() } });
    await user.click(within(dialog).getByRole('button', { name: 'Create task' }));

    expect(await screen.findByText('Due today')).toBeInTheDocument();
    expect(stored(store).tasks.find((task) => task.title === 'Ship demo')?.dueDate).toBe(today());
  });

  it('marks overdue tasks, but never done ones', async () => {
    const store = storeWith(
      makeWorkspace({
        tasks: [
          makeTask({ id: 'late', title: 'Late task', dueDate: addDays(today(), -2) }),
          makeTask({ id: 'done', title: 'Finished task', status: 'done', dueDate: addDays(today(), -2) }),
        ],
      }),
    );
    renderApp({ store, route: '/tasks' });
    expect(await screen.findByText('Overdue by 2 days')).toBeInTheDocument();
    expect(screen.getAllByText(/Overdue by/)).toHaveLength(1);
  });

  it('shows overdue, today and upcoming tasks on the dashboard', async () => {
    const store = storeWith(
      makeWorkspace({
        tasks: [
          makeTask({ id: 'a', title: 'Overdue one', dueDate: addDays(today(), -1) }),
          makeTask({ id: 'b', title: 'Today one', dueDate: today() }),
          makeTask({ id: 'c', title: 'Soon one', dueDate: addDays(today(), 3) }),
          makeTask({ id: 'd', title: 'Far one', dueDate: addDays(today(), 30) }),
        ],
      }),
    );
    renderApp({ store });
    const overdue = await screen.findByRole('region', { name: /overdue/i });
    expect(within(overdue).getByText('Overdue one')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /today/i })).getByText('Today one')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: /next 7 days/i })).getByText('Soon one')).toBeInTheDocument();
    for (const region of screen.getAllByRole('region')) expect(within(region).queryByText('Far one')).not.toBeInTheDocument();
  });

  it('filters tasks by due date', async () => {
    const user = userEvent.setup();
    const store = storeWith(
      makeWorkspace({
        tasks: [makeTask({ id: 'a', title: 'Overdue one', dueDate: addDays(today(), -1) }), makeTask({ id: 'b', title: 'No date one' })],
      }),
    );
    renderApp({ store, route: '/tasks' });
    await user.click(await screen.findByRole('button', { name: /^filters/i }));
    const panel = screen.getByRole('group', { name: 'Task filters' });
    await user.click(within(panel).getByRole('button', { name: 'No due date (1)' }));
    expect(screen.getByText('No date one')).toBeInTheDocument();
    expect(screen.queryByText('Overdue one')).not.toBeInTheDocument();
  });
});

describe('bug tracking', () => {
  it('starts empty and creates a bug with priority, project and status', async () => {
    const user = userEvent.setup();
    const store = storeWith(makeWorkspace({ projects: [makeProject()] }));
    renderApp({ store, route: '/bugs' });
    expect(await screen.findByText('No bugs yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New bug' }));
    const dialog = screen.getByRole('dialog', { name: 'New bug' });
    await user.type(within(dialog).getByLabelText('Title'), 'Camera clips through walls');
    await user.selectOptions(within(dialog).getByLabelText(/^project/i), 'project-1');
    await user.selectOptions(within(dialog).getByLabelText('Priority'), 'critical');
    await user.click(within(dialog).getByRole('button', { name: 'Create bug' }));

    expect(await screen.findByText('Camera clips through walls')).toBeInTheDocument();
    expect(stored(store).bugs).toMatchObject([{ title: 'Camera clips through walls', projectId: 'project-1', priority: 'critical', status: 'open' }]);
  });

  it('changes the status in place and keeps fixed bugs visible', async () => {
    const user = userEvent.setup();
    const store = storeWith(makeWorkspace({ bugs: [makeBug({ title: 'Lag spike' })] }));
    renderApp({ store, route: '/bugs' });
    await user.selectOptions(await screen.findByLabelText('Status of Lag spike'), 'fixed');
    expect(screen.getByText('Lag spike')).toBeInTheDocument();
    expect(stored(store).bugs[0]?.status).toBe('fixed');
  });

  it('deletes a bug and can undo it', async () => {
    const user = userEvent.setup();
    const store = storeWith(makeWorkspace({ bugs: [makeBug({ title: 'Lag spike' })] }));
    renderApp({ store, route: '/bugs' });
    await user.click(await screen.findByRole('button', { name: 'Delete Lag spike' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete/i }));
    expect(stored(store).bugs).toEqual([]);
    const toast = (await screen.findByText(/“Lag spike” deleted/)).closest('[role="status"]');
    if (!(toast instanceof HTMLElement)) throw new Error('no toast');
    await user.click(within(toast).getByRole('button', { name: 'Undo' }));
    expect(await screen.findByText('Lag spike')).toBeInTheDocument();
    expect(stored(store).bugs).toHaveLength(1);
  });

  it('shows bugs on their project page', async () => {
    const store = storeWith(makeWorkspace({ projects: [makeProject()], bugs: [makeBug({ title: 'Lag spike', projectId: 'project-1' })] }));
    renderApp({ store, route: '/projects/project-1' });
    expect(await screen.findByLabelText('Status of Lag spike')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add bug/i })).toBeInTheDocument();
  });
});

describe('developer tools', () => {
  it('opens with Ctrl+Shift+D and adds and removes only test data', async () => {
    const user = userEvent.setup();
    const real = makeWorkspace({ tasks: [makeTask({ id: 'real', title: 'Real task' })], bugs: [makeBug({ id: 'real-bug' })] });
    const store = storeWith(real);
    renderApp({ store });
    await screen.findByText('Real task');
    await user.keyboard('{Control>}{Shift>}D{/Shift}{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Developer tools' });

    await user.click(within(dialog).getByRole('button', { name: 'Generate test data' }));
    expect(await screen.findByText('Test data added.')).toBeInTheDocument();
    const withTests = stored(store);
    expect(withTests.tasks.length).toBeGreaterThan(1);
    expect(withTests.tasks.filter((task) => task.id !== 'real').every((task) => task.title.startsWith('[Test] '))).toBe(true);

    // Removing asks first.
    await user.click(within(dialog).getByRole('button', { name: 'Remove test data' }));
    await user.click(within(dialog).getByRole('button', { name: /^Remove \d+ test items$/ }));
    expect(await screen.findByText(/test items removed\./)).toBeInTheDocument();
    expect(stored(store)).toMatchObject({ tasks: real.tasks, bugs: real.bugs, projects: [], notes: [], snippets: [] });
  });

  it('opens from the settings page and shows test messages', async () => {
    const user = userEvent.setup();
    renderApp({ store: storeWith(makeWorkspace({ projects: [makeProject()] })), route: '/settings' });
    await user.click(await screen.findByRole('button', { name: 'Developer tools' }));
    const dialog = await screen.findByRole('dialog', { name: 'Developer tools' });
    await user.click(within(dialog).getByRole('button', { name: 'Warning' }));
    expect(await screen.findByText('Test: this is a warning.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Due today' }));
    expect(await screen.findByText(/Test task “Due today” added\./)).toBeInTheDocument();
  });

  it('sends test notifications through the desktop bridge', async () => {
    const user = userEvent.setup();
    const notify = vi.fn(async () => true);
    window.voidDesktop = { isDesktop: true, notify, setKeepInTray: vi.fn() };
    renderApp({ store: storeWith(makeWorkspace({ projects: [makeProject()] })), route: '/settings' });
    await user.click(await screen.findByRole('button', { name: 'Developer tools' }));
    const dialog = await screen.findByRole('dialog', { name: 'Developer tools' });
    const group = within(dialog).getByRole('heading', { name: 'Test notifications' }).closest('section');
    if (!(group instanceof HTMLElement)) throw new Error('no group');
    for (const button of within(group).getAllByRole('button')) await user.click(button);
    expect(notify).toHaveBeenCalledTimes(3);
  });
});

describe('reminders', () => {
  const dueToday = () => makeWorkspace({ tasks: [makeTask({ id: 'a', title: 'Ship it', dueDate: today(), updatedAt: '2020-01-01T00:00:00.000Z' })] });
  // Reminder time at midnight, so the test does not depend on the clock.
  const early = JSON.stringify({ notifications: { enabled: true, tasks: true, bugs: true, time: '00:00', leadDays: 1 }, keepInTray: false });

  async function settle() {
    await act(async () => {});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FIRST_CHECK_DELAY_MS + 100);
    });
  }

  it('shows a due reminder once and remembers it across restarts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const notify = vi.fn(async () => true);
    window.voidDesktop = { isDesktop: true, notify, setKeepInTray: vi.fn() };
    const store = storeWith(dueToday(), { [PREFERENCES_STORAGE_KEY]: early });

    const first = renderApp({ store });
    await screen.findAllByText('Ship it');
    await settle();
    expect(notify).toHaveBeenCalledWith({ title: 'Task due today', body: '“Ship it”' });
    expect(Object.keys(JSON.parse(store.getItem(SENT_REMINDERS_STORAGE_KEY) ?? '{}'))).toEqual([`today:task:a:${today()}`]);
    first.unmount();

    renderApp({ store });
    await screen.findAllByText('Ship it');
    await settle();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when notifications are turned off', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const notify = vi.fn(async () => true);
    window.voidDesktop = { isDesktop: true, notify, setKeepInTray: vi.fn() };
    const off = JSON.stringify({ notifications: { enabled: false, tasks: true, bugs: true, time: '00:00', leadDays: 1 }, keepInTray: false });
    renderApp({ store: storeWith(dueToday(), { [PREFERENCES_STORAGE_KEY]: off }) });
    await screen.findAllByText('Ship it');
    await settle();
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not use up reminders where notifications cannot be shown', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const store = storeWith(dueToday(), { [PREFERENCES_STORAGE_KEY]: early });
    renderApp({ store });
    await screen.findAllByText('Ship it');
    await settle();
    expect(store.getItem(SENT_REMINDERS_STORAGE_KEY)).toBeNull();
  });

  it('saves the notification settings and tells the desktop app about tray mode', async () => {
    const user = userEvent.setup();
    const setKeepInTray = vi.fn();
    window.voidDesktop = { isDesktop: true, notify: vi.fn(async () => true), setKeepInTray };
    const store = storeWith(makeWorkspace({ projects: [makeProject()] }));
    renderApp({ store, route: '/settings' });

    await user.click(await screen.findByRole('switch', { name: /bug reminders/i }));
    await user.click(screen.getByRole('switch', { name: /keep running in the notification area/i }));
    const saved = JSON.parse(store.getItem(PREFERENCES_STORAGE_KEY) ?? '{}') as { notifications: { bugs: boolean }; keepInTray: boolean };
    expect(saved.notifications.bugs).toBe(false);
    expect(saved.keepInTray).toBe(true);
    expect(setKeepInTray).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByRole('switch', { name: /desktop notifications/i }));
    expect(screen.getByRole('switch', { name: /task reminders/i })).toBeDisabled();
  });

  it('offers tray mode only in the desktop app', async () => {
    renderApp({ store: storeWith(makeWorkspace({ projects: [makeProject()] })), route: '/settings' });
    expect(await screen.findByRole('switch', { name: /keep running in the notification area/i })).toBeDisabled();
    // Notifications and Discord both say so.
    expect(screen.getAllByText('Desktop app only').length).toBeGreaterThanOrEqual(1);
  });
});
