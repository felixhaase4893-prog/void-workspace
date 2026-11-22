import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { WORKSPACE_STORAGE_KEY } from '../storage/keyValueWorkspaceRepository';
import { MemoryKeyValueStore } from '../storage/keyValueStore';
import { makeProject, makeTask, makeWorkspace } from '../test/fixtures';
import { renderApp } from '../test/renderApp';

function storeWith(workspace: ReturnType<typeof makeWorkspace>) {
  return new MemoryKeyValueStore({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(workspace) });
}

const mainNav = () => screen.getByRole('navigation', { name: 'Main' });

describe('App', () => {
  it('renders the welcome state for a new user', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: /fill the void/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new snippet/i })).toBeInTheDocument();
  });

  it('navigates between all sections', async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: /fill the void/i });

    const sections: Array<[string, RegExp]> = [
      ['Projects', /^projects$/i],
      ['Tasks', /^tasks$/i],
      ['Notes', /^notes$/i],
      ['Snippet Vault', /^snippet vault$/i],
      ['Settings', /^settings$/i],
    ];
    for (const [link, heading] of sections) {
      await user.click(within(mainNav()).getByRole('link', { name: link }));
      expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
      expect(within(mainNav()).getByRole('link', { name: link })).toHaveAttribute('aria-current', 'page');
    }
    await user.click(within(mainNav()).getByRole('link', { name: 'Dashboard' }));
    expect(screen.getByRole('heading', { name: /fill the void/i })).toBeInTheDocument();
  });

  it('shows a not-found page for unknown routes', async () => {
    renderApp({ route: '/does-not-exist' });
    expect(await screen.findByText('Lost in the void')).toBeInTheDocument();
  });

  it('creates a project from the dashboard, persists it and shows it after a reload', async () => {
    const user = userEvent.setup();
    const { store, unmount } = renderApp();
    await user.click(await screen.findByRole('button', { name: /new project/i }));

    const dialog = screen.getByRole('dialog', { name: 'New project' });
    expect(within(dialog).getByLabelText('Name')).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));
    expect(within(dialog).getByText('Name is required.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toHaveFocus();

    await user.type(within(dialog).getByLabelText('Name'), 'Obby Rush');
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'roblox');
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Workspace summary' })).getByText('Active projects').closest('div')).toHaveTextContent('1');
    expect(JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '{}').projects[0].name).toBe('Obby Rush');

    unmount();
    renderApp({ store, route: '/projects' });
    expect(await screen.findByRole('heading', { name: 'Obby Rush' })).toBeInTheDocument();
  });

  it('closes dialogs with Escape', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: /new note/i }));
    expect(screen.getByRole('dialog', { name: 'New note' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows real counts on the dashboard and completes tasks', async () => {
    const user = userEvent.setup();
    const store = storeWith(
      makeWorkspace({
        projects: [makeProject()],
        tasks: [makeTask({ id: 'a', projectId: 'project-1' }), makeTask({ id: 'b', title: 'Write devlog' })],
      }),
    );
    renderApp({ store });
    const openTasks = await within(await screen.findByRole('region', { name: 'Workspace summary' })).findByText('Open tasks');
    expect(openTasks.closest('div')).toHaveTextContent('2');
    expect(screen.getByText('1 open · 0 done')).toBeInTheDocument();

    await user.click(within(mainNav()).getByRole('link', { name: 'Tasks' }));
    await user.click(screen.getByRole('checkbox', { name: /write devlog/i }));
    expect(screen.getByRole('checkbox', { name: /write devlog/i })).toHaveAttribute('aria-checked', 'true');

    expect(JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '{}').tasks[1].status).toBe('done');
  });

  it('offers recovery instead of discarding unreadable data', async () => {
    const user = userEvent.setup();
    const store = new MemoryKeyValueStore({ [WORKSPACE_STORAGE_KEY]: '{broken' });
    renderApp({ store });

    expect(await screen.findByRole('heading', { name: /could not open your saved data/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download raw data/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /start fresh/i }));
    expect(await screen.findByRole('heading', { name: /fill the void/i })).toBeInTheDocument();
    expect(store.getItem(WORKSPACE_STORAGE_KEY)).toBeNull();
  });

  it('warns when a change could not be saved', async () => {
    const user = userEvent.setup();
    const store = new MemoryKeyValueStore();
    store.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    renderApp({ store });
    await user.click(await screen.findByRole('button', { name: /new task/i }));
    await user.type(screen.getByLabelText('Title'), 'Ship it');
    await user.click(screen.getByRole('button', { name: 'Create task' }));

    expect(await screen.findByText('Your last change could not be saved')).toBeInTheDocument();
    expect(screen.getByText('Ship it')).toBeInTheDocument();
  });

  it('deletes all data after confirmation', async () => {
    const user = userEvent.setup();
    const store = storeWith(makeWorkspace({ projects: [makeProject()] }));
    renderApp({ store, route: '/settings' });

    await user.click(await screen.findByRole('button', { name: 'Delete all data' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete all data?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Delete everything' }));

    expect(store.getItem(WORKSPACE_STORAGE_KEY)).toBeNull();
    await user.click(within(mainNav()).getByRole('link', { name: 'Dashboard' }));
    expect(screen.getByRole('heading', { name: /fill the void/i })).toBeInTheDocument();
  });
});
