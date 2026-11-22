import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Workspace } from '../domain/models';
import { WORKSPACE_STORAGE_KEY } from '../storage/keyValueWorkspaceRepository';
import { MemoryKeyValueStore } from '../storage/keyValueStore';
import { PREFERENCES_STORAGE_KEY, SEARCH_HISTORY_STORAGE_KEY } from '../storage/preferences';
import { makeBug, makeNote, makeProject, makeSnippet, makeTask, makeWorkspace } from '../test/fixtures';
import { renderApp } from '../test/renderApp';

function storeWith(workspace: Workspace) {
  return new MemoryKeyValueStore({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(workspace) });
}

function stored(store: MemoryKeyValueStore): Workspace {
  return JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '{}') as Workspace;
}

const workspace = () =>
  makeWorkspace({
    projects: [makeProject({ id: 'project-1', name: 'Obby Rush' }), makeProject({ id: 'project-2', name: 'Studio site', kind: 'web' })],
    tasks: [
      makeTask({ id: 'task-1', title: 'Fix jump buffering', projectId: 'project-1' }),
      makeTask({ id: 'task-2', title: 'Write devlog' }),
      makeTask({ id: 'task-3', title: 'Record trailer' }),
    ],
    bugs: [makeBug({ id: 'bug-1', title: 'Player falls through floor' }), makeBug({ id: 'bug-2', title: 'Coins vanish', priority: 'low' })],
    notes: [makeNote({ id: 'note-1', title: 'Save system' })],
    snippets: [makeSnippet({ id: 'snippet-1', title: 'Debounce' })],
  });

function toastFor(message: string) {
  const toast = screen.getByText(message).closest('[role="status"]');
  if (!(toast instanceof HTMLElement)) throw new Error(`No toast for ${message}`);
  return toast;
}

async function openQuickAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Control>}n{/Control}');
  return screen.findByRole('dialog', { name: 'Quick add' });
}

describe('Quick Add', () => {
  it('creates a task with Ctrl+N and Enter, with project and priority', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store });
    const dialog = await openQuickAdd(user);

    expect(within(dialog).getByRole('radio', { name: /Task/ })).toHaveAttribute('aria-checked', 'true');
    await user.selectOptions(within(dialog).getByLabelText(/Project/), 'project-1');
    await user.selectOptions(within(dialog).getByLabelText('Priority'), 'high');
    await user.type(within(dialog).getByLabelText('Title'), 'Ship the demo{Enter}');

    expect(await screen.findByText('Task “Ship the demo” created.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Quick add' })).not.toBeInTheDocument();
    expect(stored(store).tasks[0]).toMatchObject({ title: 'Ship the demo', projectId: 'project-1', priority: 'high', status: 'todo' });
  });

  it('creates projects, notes, snippets and bugs, switching type with the mouse and with Alt+number', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store });

    let dialog = await openQuickAdd(user);
    await user.click(within(dialog).getByRole('radio', { name: /Project/ }));
    await user.selectOptions(within(dialog).getByLabelText('Type'), 'game');
    await user.type(within(dialog).getByLabelText('Name'), 'Space Miner{Enter}');
    expect(await screen.findByText('Project “Space Miner” created.')).toBeInTheDocument();

    dialog = await openQuickAdd(user);
    // The type used last is remembered.
    expect(within(dialog).getByRole('radio', { name: /Project/ })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Alt>}3{/Alt}');
    expect(within(dialog).getByRole('radio', { name: /Note/ })).toHaveAttribute('aria-checked', 'true');
    await user.type(within(dialog).getByLabelText('Title'), 'Shader ideas');
    await user.type(within(dialog).getByLabelText(/Content/), 'Use **dithering**');
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByText('Note “Shader ideas” created.')).toBeInTheDocument();

    dialog = await openQuickAdd(user);
    await user.keyboard('{Alt>}4{/Alt}');
    await user.type(within(dialog).getByLabelText('Title'), 'Clamp');
    await user.type(within(dialog).getByLabelText('Language'), 'Luau');
    await user.type(within(dialog).getByLabelText('Code'), 'return math.clamp(x, 0, 1)');
    await user.click(within(dialog).getByRole('button', { name: 'Create snippet' }));
    expect(await screen.findByText('Snippet “Clamp” created.')).toBeInTheDocument();

    dialog = await openQuickAdd(user);
    await user.keyboard('{Alt>}5{/Alt}');
    await user.selectOptions(within(dialog).getByLabelText('Priority'), 'critical');
    await user.type(within(dialog).getByLabelText('Title'), 'Save file corrupts{Enter}');
    expect(await screen.findByText('Bug “Save file corrupts” created.')).toBeInTheDocument();

    const saved = stored(store);
    expect(saved.projects[0]).toMatchObject({ name: 'Space Miner', kind: 'game', status: 'active' });
    expect(saved.notes[0]).toMatchObject({ title: 'Shader ideas', content: 'Use **dithering**' });
    expect(saved.snippets[0]).toMatchObject({ title: 'Clamp', language: 'Luau', code: 'return math.clamp(x, 0, 1)' });
    expect(saved.bugs[0]).toMatchObject({ title: 'Save file corrupts', priority: 'critical', status: 'open' });
  });

  it('shows the same validation as the full forms and creates nothing', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store });
    const dialog = await openQuickAdd(user);
    await user.keyboard('{Alt>}4{/Alt}');
    await user.type(within(dialog).getByLabelText('Title'), 'Empty snippet{Enter}');
    expect(within(dialog).getByText('Language is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('Code is required.')).toBeInTheDocument();
    expect(stored(store).snippets).toHaveLength(1);
  });

  it('keeps the palette open for the next item with Shift+Enter', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store });
    const dialog = await openQuickAdd(user);
    await user.type(within(dialog).getByLabelText('Title'), 'First{Shift>}{Enter}{/Shift}');
    await screen.findByText('Task “First” created.');
    expect(within(dialog).getByLabelText('Title')).toHaveValue('');
    expect(within(dialog).getByLabelText('Title')).toHaveFocus();
    await user.type(within(dialog).getByLabelText('Title'), 'Second{Enter}');
    await screen.findByText('Task “Second” created.');
    expect(stored(store).tasks.slice(0, 2).map((task) => task.title)).toEqual(['Second', 'First']);
  });

  it('closes with Escape and continues in the full form with "More options"', async () => {
    const user = userEvent.setup();
    renderApp({ store: storeWith(workspace()) });
    await openQuickAdd(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Quick add' })).not.toBeInTheDocument();

    const dialog = await openQuickAdd(user);
    await user.type(within(dialog).getByLabelText('Title'), 'Needs details');
    await user.click(within(dialog).getByRole('button', { name: 'More options…' }));
    const full = await screen.findByRole('dialog', { name: 'New task' });
    expect(within(full).getByLabelText('Title')).toHaveValue('Needs details');
  });

  it('pre-selects the project when opened on a project page', async () => {
    const user = userEvent.setup();
    renderApp({ store: storeWith(workspace()), route: '/projects/project-2' });
    await screen.findByRole('heading', { name: 'Studio site' });
    const dialog = await openQuickAdd(user);
    expect(within(dialog).getByLabelText(/Project/)).toHaveValue('project-2');
  });

  it('leaves Ctrl+K to the search and does not stack on top of other dialogs', async () => {
    const user = userEvent.setup();
    renderApp({ store: storeWith(workspace()) });
    await screen.findByRole('heading', { name: /Good/ });
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog', { name: 'Search' })).toBeInTheDocument();
    await user.keyboard('{Control>}n{/Control}');
    expect(screen.queryByRole('dialog', { name: 'Quick add' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await openQuickAdd(user);
    await user.keyboard('{Control>}k{/Control}');
    expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument();
  });

  it('opens from the sidebar button', async () => {
    const user = userEvent.setup();
    renderApp({ store: storeWith(workspace()) });
    await user.click((await screen.findAllByRole('button', { name: /Quick add/ }))[0] as HTMLElement);
    expect(screen.getByRole('dialog', { name: 'Quick add' })).toBeInTheDocument();
  });
});

describe('quick navigation', () => {
  it('jumps between the main pages with Ctrl+1 … Ctrl+7, also from a text field', async () => {
    const user = userEvent.setup();
    renderApp({ store: storeWith(workspace()) });
    await screen.findByRole('heading', { name: /Good/ });

    const steps: Array<[string, string]> = [
      ['2', 'Projects'],
      ['3', 'Tasks'],
      ['4', 'Notes'],
      ['5', 'Snippet Vault'],
      ['6', 'Bugs'],
      ['7', 'Settings'],
    ];
    for (const [digit, heading] of steps) {
      await user.keyboard(`{Control>}${digit}{/Control}`);
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    }
    await user.click(screen.getAllByRole('button', { name: /Search/ })[0] as HTMLElement);
    await user.keyboard('{Escape}');
    await user.keyboard('{Control>}1{/Control}');
    expect(await screen.findByRole('heading', { level: 1, name: /Good/ })).toBeInTheDocument();
  });

  it('does nothing while a dialog is open', async () => {
    const user = userEvent.setup();
    renderApp({ store: storeWith(workspace()), route: '/tasks' });
    await screen.findByRole('heading', { level: 1, name: 'Tasks' });
    await openQuickAdd(user);
    await user.keyboard('{Control>}2{/Control}');
    expect(screen.getByRole('heading', { level: 1, name: 'Tasks' })).toBeInTheDocument();
  });

  it('lists every shortcut in Settings', async () => {
    renderApp({ store: storeWith(workspace()), route: '/settings' });
    const section = await screen.findByRole('region', { name: 'Keyboard shortcuts' });
    expect(within(section).getByText('Quick add: create a task, project, note, snippet or bug')).toBeInTheDocument();
    expect(within(section).getByText('Go to Snippet Vault')).toBeInTheDocument();
  });
});

describe('dashboard customization', () => {
  it('hides and reorders cards and keeps the layout after a restart', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    const { unmount } = renderApp({ store });

    await user.click(await screen.findByRole('button', { name: 'Customize' }));
    const dialog = screen.getByRole('dialog', { name: 'Customize dashboard' });
    await user.click(within(dialog).getByRole('checkbox', { name: /Due soon/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Move Projects up' }));
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));

    expect(screen.queryByRole('heading', { name: 'Due soon' })).not.toBeInTheDocument();
    const headings = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
    expect(headings().indexOf('Projects')).toBeLessThan(headings().indexOf('Recently edited'));
    expect(JSON.parse(store.getItem(PREFERENCES_STORAGE_KEY) ?? '{}')).toMatchObject({ dashboard: { hidden: ['dueSoon'] } });

    unmount();
    renderApp({ store });
    await screen.findByRole('button', { name: 'Customize' });
    expect(screen.queryByRole('heading', { name: 'Due soon' })).not.toBeInTheDocument();
    expect(headings().indexOf('Projects')).toBeLessThan(headings().indexOf('Recently edited'));
  });

  it('restores the default layout', async () => {
    const user = userEvent.setup();
    renderApp({ store: storeWith(workspace()) });
    await user.click(await screen.findByRole('button', { name: 'Customize' }));
    const dialog = screen.getByRole('dialog', { name: 'Customize dashboard' });
    const restore = within(dialog).getByRole('button', { name: 'Restore default' });
    expect(restore).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /Recently edited/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Move Summary down' }));
    await user.click(restore);
    expect(within(dialog).getAllByRole('checkbox').every((box) => (box as HTMLInputElement).checked)).toBe(true);
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('heading', { name: 'Recently edited' })).toBeInTheDocument();
  });

  it('explains how to get cards back when all are hidden', async () => {
    const user = userEvent.setup();
    renderApp({ store: storeWith(workspace()) });
    await user.click(await screen.findByRole('button', { name: 'Customize' }));
    const dialog = screen.getByRole('dialog', { name: 'Customize dashboard' });
    for (const box of within(dialog).getAllByRole('checkbox')) await user.click(box);
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('heading', { name: 'All dashboard cards are hidden' })).toBeInTheDocument();
  });
});

describe('multi-select', () => {
  async function selectRows(user: ReturnType<typeof userEvent.setup>, titles: string[]) {
    await user.click(await screen.findByRole('button', { name: 'Select' }));
    for (const title of titles) await user.click(screen.getByRole('checkbox', { name: `Select “${title}”` }));
  }

  it('marks several tasks as done, and Undo brings their old state back', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store, route: '/tasks' });
    await selectRows(user, ['Fix jump buffering', 'Record trailer']);
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(stored(store).tasks.map((task) => task.status)).toEqual(['done', 'todo', 'done']);
    expect(screen.getByText('Select tasks')).toBeInTheDocument();

    await user.click(within(toastFor('2 tasks marked as done.')).getByRole('button', { name: 'Undo' }));
    await screen.findByText('Change to 2 tasks undone.');
    expect(stored(store)).toEqual(workspace());
  });

  it('selects a range with Shift and changes priority and project together', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store, route: '/tasks' });
    await user.click(await screen.findByRole('button', { name: 'Select' }));
    await user.click(screen.getByText('Fix jump buffering'));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByText('Record trailer'));
    await user.keyboard('{/Shift}');
    expect(screen.getByText('3 selected')).toBeInTheDocument();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Set priority' }), 'high');
    expect(stored(store).tasks.map((task) => task.priority)).toEqual(['high', 'high', 'high']);
    await user.click(screen.getByRole('checkbox', { name: /Select all shown tasks/ }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Move to project' }), 'project-2');
    expect(stored(store).tasks.map((task) => task.projectId)).toEqual(['project-2', 'project-2', 'project-2']);
    expect(screen.getByText('3 tasks moved to “Studio site”.')).toBeInTheDocument();
  });

  it('asks before deleting several tasks and restores all of them with one Undo', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store, route: '/tasks' });
    await selectRows(user, ['Fix jump buffering', 'Write devlog']);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete 2 tasks?' });
    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(stored(store).tasks).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete 2 tasks?' })).getByRole('button', { name: 'Delete 2 tasks' }));
    expect(stored(store).tasks.map((task) => task.id)).toEqual(['task-3']);
    expect(screen.queryByText('Write devlog')).not.toBeInTheDocument();

    await user.click(within(toastFor('2 tasks deleted.')).getByRole('button', { name: 'Undo' }));
    await screen.findByText('2 tasks restored.');
    expect(stored(store)).toEqual(workspace());
  });

  it('changes the status of several bugs and deletes them with undo', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store, route: '/bugs' });
    await selectRows(user, ['Player falls through floor', 'Coins vanish']);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Set status' }), 'fixed');
    expect(stored(store).bugs.map((bug) => bug.status)).toEqual(['fixed', 'fixed']);

    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete 2 bugs?' })).getByRole('button', { name: 'Delete 2 bugs' }));
    expect(stored(store).bugs).toEqual([]);
    await user.click(within(toastFor('2 bugs deleted.')).getByRole('button', { name: 'Undo' }));
    await screen.findByText('2 bugs restored.');
    expect(stored(store).bugs.map((bug) => bug.id)).toEqual(['bug-1', 'bug-2']);
  });

  it('only acts on rows that are shown and leaves selection mode with Escape', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store, route: '/tasks' });
    await selectRows(user, ['Fix jump buffering', 'Write devlog']);
    await user.type(screen.getByPlaceholderText(/Search tasks/), 'devlog');
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(stored(store).tasks.map((task) => task.status)).toEqual(['todo', 'done', 'todo']);

    await user.click(document.body);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Selected tasks' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mark “Write devlog” as not done' })).toBeInTheDocument();
  });
});

describe('search history', () => {
  async function searchAndOpen(user: ReturnType<typeof userEvent.setup>, query: string, result: string) {
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    await user.type(within(dialog).getByRole('combobox'), query);
    const options = await within(dialog).findAllByRole('option');
    const match = options.find((option) => option.textContent?.includes(result));
    if (!match) throw new Error(`No result ${result}`);
    await user.click(match);
  }

  it('remembers searches that opened a result and shows them next time', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store });
    await screen.findByRole('heading', { name: /Good/ });
    await searchAndOpen(user, 'devlog', 'Write devlog');
    await user.keyboard('{Escape}');
    await searchAndOpen(user, 'debounce', 'Debounce');
    await user.keyboard('{Escape}');

    expect(JSON.parse(store.getItem(SEARCH_HISTORY_STORAGE_KEY) ?? '[]')).toEqual(['debounce', 'devlog']);
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Search' });
    const history = within(dialog).getByRole('listbox', { name: 'Recent searches' });
    expect(within(history).getAllByRole('option').map((option) => option.textContent)).toEqual(['debounce', 'devlog']);

    // Arrow keys and Enter put a recent search back into the field.
    await user.keyboard('{ArrowDown}{Enter}');
    expect(within(dialog).getByRole('combobox')).toHaveValue('devlog');
    expect((await within(dialog).findAllByRole('option'))[0]).toHaveTextContent('Write devlog');
  });

  it('does not remember what was only typed', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store });
    await screen.findByRole('heading', { name: /Good/ });
    await user.keyboard('{Control>}k{/Control}');
    await user.type(within(await screen.findByRole('dialog', { name: 'Search' })).getByRole('combobox'), 'secret plans');
    await user.keyboard('{Escape}');
    expect(store.getItem(SEARCH_HISTORY_STORAGE_KEY)).toBeNull();
  });

  it('removes single entries and clears the whole history', async () => {
    const user = userEvent.setup();
    const store = new MemoryKeyValueStore({
      [WORKSPACE_STORAGE_KEY]: JSON.stringify(workspace()),
      [SEARCH_HISTORY_STORAGE_KEY]: JSON.stringify(['jump', 'save', 'coins']),
    });
    renderApp({ store });
    await screen.findByRole('heading', { name: /Good/ });
    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Search' });

    await user.click(within(dialog).getByRole('button', { name: 'Remove “save” from history' }));
    expect(JSON.parse(store.getItem(SEARCH_HISTORY_STORAGE_KEY) ?? '[]')).toEqual(['jump', 'coins']);
    expect(within(dialog).getByRole('combobox')).toHaveFocus();
    // Shift+Delete removes the highlighted entry.
    const highlighted = within(dialog).getByRole('option', { selected: true }).textContent ?? '';
    await user.keyboard('{Shift>}{Delete}{/Shift}');
    expect(JSON.parse(store.getItem(SEARCH_HISTORY_STORAGE_KEY) ?? '[]')).toEqual(['jump', 'coins'].filter((entry) => entry !== highlighted));

    await user.click(within(dialog).getByRole('button', { name: 'Clear history' }));
    expect(store.getItem(SEARCH_HISTORY_STORAGE_KEY)).toBeNull();
    expect(within(dialog).getByText('Search everything in VOID')).toBeInTheDocument();
  });

  it('can be switched off in Settings, which deletes the history', async () => {
    const user = userEvent.setup();
    const store = new MemoryKeyValueStore({
      [WORKSPACE_STORAGE_KEY]: JSON.stringify(workspace()),
      [SEARCH_HISTORY_STORAGE_KEY]: JSON.stringify(['jump']),
    });
    renderApp({ store, route: '/settings' });
    await user.click(await screen.findByRole('switch', { name: /Remember recent searches/ }));
    expect(store.getItem(SEARCH_HISTORY_STORAGE_KEY)).toBeNull();
    await user.click(document.body);

    await searchAndOpen(user, 'devlog', 'Write devlog');
    expect(store.getItem(SEARCH_HISTORY_STORAGE_KEY)).toBeNull();
  });
});

describe('empty states', () => {
  it('explains each empty list and offers to create the first item', async () => {
    for (const [route, title, button] of [
      ['/projects', 'No projects yet', 'New project'],
      ['/tasks', 'No tasks yet', 'New task'],
      ['/bugs', 'No bugs yet', 'New bug'],
      ['/notes', 'No notes yet', 'New note'],
      ['/snippets', 'Your vault is empty', 'New snippet'],
    ] as const) {
      const { unmount } = renderApp({ route });
      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: button })).toBeInTheDocument();
      expect(screen.getByText(/adds anything from any page/)).toBeInTheDocument();
      unmount();
    }
  });

  it('says when there are no open tasks left', async () => {
    renderApp({ store: storeWith(makeWorkspace({ tasks: [makeTask({ status: 'done' })] })), route: '/tasks' });
    expect(await screen.findByText('No open tasks. Everything on your list is done.')).toBeInTheDocument();
  });
});
