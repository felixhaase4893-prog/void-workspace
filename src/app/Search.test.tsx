import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Workspace } from '../domain/models';
import { KeyValueWorkspaceRepository, WORKSPACE_STORAGE_KEY } from '../storage/keyValueWorkspaceRepository';
import { App } from './App';
import { MemoryKeyValueStore } from '../storage/keyValueStore';
import { makeNote, makeProject, makeSnippet, makeTask, makeWorkspace } from '../test/fixtures';
import { renderApp } from '../test/renderApp';

function storeWith(workspace: Workspace) {
  return new MemoryKeyValueStore({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(workspace) });
}

const seeded = () =>
  storeWith(
    makeWorkspace({
      projects: [makeProject({ id: 'p-obby', name: 'Obby Rush', technologies: ['Luau'] })],
      tasks: [makeTask({ id: 't-jump', title: 'Fix jump buffering', projectId: 'p-obby' })],
      notes: [makeNote({ id: 'n-save', title: 'Save system', content: 'Use DataStore2 with session locking.' })],
      snippets: [makeSnippet({ id: 's-debounce', title: 'Debounce', code: 'export const debounce = () => {};' })],
    }),
  );

const searchDialog = () => screen.getByRole('dialog', { name: 'Search' });
const searchInput = () => within(searchDialog()).getByRole('combobox');

async function openWithShortcut(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Control>}k{/Control}');
  return searchDialog();
}

describe('Global search', () => {
  it('opens with Ctrl+K, focuses the input and closes with Escape', async () => {
    const user = userEvent.setup();
    renderApp({ store: seeded() });
    await screen.findAllByRole('button', { name: /^search/i });

    await openWithShortcut(user);
    expect(searchInput()).toHaveFocus();
    expect(within(searchDialog()).getByText('Search everything in VOID')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument();
  });

  it('opens from the sidebar button and returns focus to it when closed', async () => {
    const user = userEvent.setup();
    renderApp({ store: seeded() });
    const [trigger] = await screen.findAllByRole('button', { name: /^search/i });
    await user.click(trigger!);
    expect(searchInput()).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('does not hijack Ctrl+K while typing in a form field', async () => {
    const user = userEvent.setup();
    renderApp({ store: seeded(), route: '/notes' });
    await user.click(await screen.findByRole('button', { name: /new note/i }));
    const dialog = screen.getByRole('dialog', { name: 'New note' });
    await user.click(within(dialog).getByLabelText('Title'));
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'New note' })).toBeInTheDocument();
  });

  it('registers only one shortcut listener across re-renders and repeated opens', async () => {
    const user = userEvent.setup();
    renderApp({ store: seeded() });
    await screen.findAllByRole('button', { name: /^search/i });
    for (let round = 0; round < 3; round += 1) {
      await openWithShortcut(user);
      expect(screen.getAllByRole('dialog', { name: 'Search' })).toHaveLength(1);
      await user.keyboard('{Escape}');
    }
    expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument();
  });

  it('shows a hint for whitespace-only input and a message when nothing matches', async () => {
    const user = userEvent.setup();
    renderApp({ store: seeded() });
    await screen.findAllByRole('button', { name: /^search/i });
    await openWithShortcut(user);

    await user.type(searchInput(), '   ');
    expect(await within(searchDialog()).findByText('Type a search term')).toBeInTheDocument();

    await user.clear(searchInput());
    await user.type(searchInput(), 'zzzz');
    expect(await within(searchDialog()).findByText('Nothing found')).toBeInTheDocument();
  });

  it('groups results by type and highlights the match', async () => {
    const user = userEvent.setup();
    renderApp({ store: seeded() });
    await screen.findAllByRole('button', { name: /^search/i });
    await openWithShortcut(user);
    await user.type(searchInput(), 'OBBY');

    const list = await within(searchDialog()).findByRole('listbox', { name: 'Search results' });
    const groups = within(list).getAllByRole('group');
    expect(groups.map((group) => group.getAttribute('aria-labelledby') && document.getElementById(group.getAttribute('aria-labelledby')!)?.textContent)).toEqual([
      expect.stringContaining('Projects'),
      expect.stringContaining('Tasks'),
    ]);
    const options = within(list).getAllByRole('option');
    expect(options[0]).toHaveTextContent('Obby Rush');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]?.querySelector('mark')).toHaveTextContent('Obby');
    expect(options[1]).toHaveTextContent('Fix jump buffering');
    expect(options[1]).toHaveTextContent('Task · Obby Rush');
  });

  it('opens a project detail page with the keyboard', async () => {
    const user = userEvent.setup();
    renderApp({ store: seeded() });
    await screen.findAllByRole('button', { name: /^search/i });
    await openWithShortcut(user);
    await user.type(searchInput(), 'obby');
    await within(searchDialog()).findAllByRole('option');

    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Obby Rush' })).toBeInTheDocument();
  });

  it('moves through results with the arrow keys and opens a task in its edit dialog', async () => {
    const user = userEvent.setup();
    renderApp({ store: seeded() });
    await screen.findAllByRole('button', { name: /^search/i });
    await openWithShortcut(user);
    await user.type(searchInput(), 'obby');
    const options = await within(searchDialog()).findAllByRole('option');

    await user.keyboard('{ArrowDown}');
    expect(searchInput()).toHaveAttribute('aria-activedescendant', options[1]!.id);
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');

    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeInTheDocument();
    const edit = screen.getByRole('dialog', { name: 'Edit task' });
    expect(within(edit).getByLabelText('Title')).toHaveValue('Fix jump buffering');
  });

  it('opens notes and snippets in their edit dialogs on click', async () => {
    const user = userEvent.setup();
    renderApp({ store: seeded() });
    await screen.findAllByRole('button', { name: /^search/i });

    await openWithShortcut(user);
    await user.type(searchInput(), 'locking');
    await user.click(await within(searchDialog()).findByRole('option', { name: /save system/i }));
    expect(screen.getByRole('heading', { level: 1, name: 'Notes' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog', { name: 'Edit note' })).getByLabelText('Title')).toHaveValue('Save system');
    await user.keyboard('{Escape}');

    await openWithShortcut(user);
    await user.type(searchInput(), 'debounce');
    await user.click(await within(searchDialog()).findByRole('option', { name: /debounce/i }));
    expect(screen.getByRole('heading', { level: 1, name: 'Snippet Vault' })).toBeInTheDocument();
    expect(within(screen.getByRole('dialog', { name: 'Edit snippet' })).getByLabelText('Title')).toHaveValue('Debounce');
  });

  it('drops results whose item was deleted in another window while searching', async () => {
    const user = userEvent.setup();
    const store = seeded();
    const events = new EventTarget();
    const repository = new KeyValueWorkspaceRepository({ store, events });
    render(
      <MemoryRouter>
        <App repository={repository} />
      </MemoryRouter>,
    );
    await screen.findAllByRole('button', { name: /^search/i });
    await openWithShortcut(user);
    await user.type(searchInput(), 'debounce');
    expect(await within(searchDialog()).findByRole('option', { name: /debounce/i })).toBeInTheDocument();

    const data = JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '{}') as Workspace;
    store.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ ...data, snippets: [] }));
    await act(async () => {
      events.dispatchEvent(new StorageEvent('storage', { key: WORKSPACE_STORAGE_KEY }));
    });

    expect(await within(searchDialog()).findByText('Nothing found')).toBeInTheDocument();
    expect(within(searchDialog()).queryByRole('option')).not.toBeInTheDocument();
  });
});
