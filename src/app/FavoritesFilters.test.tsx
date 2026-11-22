import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Workspace } from '../domain/models';
import { WORKSPACE_STORAGE_KEY } from '../storage/keyValueWorkspaceRepository';
import { MemoryKeyValueStore } from '../storage/keyValueStore';
import { makeNote, makeProject, makeSnippet, makeTag, makeTask, makeWorkspace } from '../test/fixtures';
import { renderApp } from '../test/renderApp';

function storeWith(workspace: Workspace) {
  return new MemoryKeyValueStore({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(workspace) });
}

function stored(store: MemoryKeyValueStore): Workspace {
  return JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '{}') as Workspace;
}

const seeded = () =>
  storeWith(
    makeWorkspace({
      tags: [makeTag({ id: 'tag-roblox', name: 'Roblox' }), makeTag({ id: 'tag-ui', name: 'UI' })],
      projects: [
        makeProject({ id: 'void', name: 'VOID', kind: 'software', tagIds: ['tag-ui'] }),
        makeProject({ id: 'obby', name: 'Obby Rush', status: 'paused', tagIds: ['tag-roblox'] }),
      ],
      tasks: [
        makeTask({ id: 't1', title: 'Filter bar', projectId: 'void', status: 'in_progress', priority: 'high', tagIds: ['tag-roblox'] }),
        makeTask({ id: 't2', title: 'Spawn pads', projectId: 'void', status: 'in_progress', priority: 'high', tagIds: ['tag-roblox'] }),
        makeTask({ id: 't3', title: 'Jump buffer', projectId: 'obby', priority: 'low' }),
        makeTask({ id: 't4', title: 'Pay taxes', projectId: null, status: 'done' }),
      ],
      notes: [makeNote({ id: 'n1', title: 'Architecture', projectId: 'void', tagIds: ['tag-ui'] }), makeNote({ id: 'n2', title: 'Loose idea' })],
      snippets: [
        makeSnippet({ id: 's1', title: 'Debounce', language: 'TypeScript', projectId: 'void' }),
        makeSnippet({ id: 's2', title: 'Tween', language: 'Luau', projectId: 'obby' }),
      ],
    }),
  );

const listed = (container: HTMLElement = document.body) =>
  within(container)
    .queryAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);
const taskTitles = () => screen.queryAllByRole('checkbox').map((box) => box.getAttribute('aria-label')?.replace(/^Mark “(.*)” as .*$/, '$1'));
const activeChips = () =>
  within(screen.queryByRole('list', { name: 'Active filters' }) ?? document.createElement('div'))
    .queryAllByRole('listitem')
    .map((item) => item.textContent);

describe('favourites', () => {
  it.each([
    ['/projects', 'VOID', 'projects'],
    ['/tasks', 'Filter bar', 'tasks'],
    ['/notes', 'Architecture', 'notes'],
    ['/snippets', 'Debounce', 'snippets'],
  ] as const)('marks an item on %s as favourite and keeps it after a restart', async (route, title, key) => {
    const user = userEvent.setup();
    const store = seeded();
    const first = renderApp({ route, store });

    const star = await screen.findByRole('button', { name: `Add ${title} to favorites` });
    expect(star).toHaveAttribute('aria-pressed', 'false');
    await user.click(star);
    expect(screen.getByRole('button', { name: `Remove ${title} from favorites` })).toHaveAttribute('aria-pressed', 'true');
    const saved = stored(store)[key] as Array<{ favorite: boolean; updatedAt: string }>;
    expect(saved.map((item) => item.favorite)).toEqual(saved.map((_, index) => index === 0));
    first.unmount();

    renderApp({ route, store });
    const restored = await screen.findByRole('button', { name: `Remove ${title} from favorites` });
    await user.click(restored);
    expect(screen.getByRole('button', { name: `Add ${title} to favorites` })).toHaveAttribute('aria-pressed', 'false');
    expect((stored(store)[key] as Array<{ favorite: boolean }>).every((item) => !item.favorite)).toBe(true);
  });

  it('toggling the star on a project card does not open the project', async () => {
    const user = userEvent.setup();
    renderApp({ route: '/projects', store: seeded() });
    await user.click(await screen.findByRole('button', { name: 'Add VOID to favorites' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
  });

  it('shows and changes the favourite on the project detail page, in sync with the list', async () => {
    const user = userEvent.setup();
    const store = seeded();
    renderApp({ route: '/projects/void', store });
    const toggle = await screen.findByRole('button', { name: 'Add VOID to favorites' });
    expect(toggle).toHaveTextContent('Add to favorites');
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Remove VOID from favorites' })).toHaveTextContent('Favorite');
    // Contents of the project have their own stars.
    await user.click(screen.getByRole('button', { name: 'Add Spawn pads to favorites' }));
    expect(stored(store).tasks.find((task) => task.id === 't2')?.favorite).toBe(true);

    await user.click(screen.getByRole('link', { name: /all projects/i }));
    expect(screen.getByRole('button', { name: 'Remove VOID from favorites' })).toBeInTheDocument();
  });

  it('keeps the favourite when the item is edited', async () => {
    const user = userEvent.setup();
    const store = storeWith(makeWorkspace({ notes: [makeNote({ favorite: true })] }));
    renderApp({ route: '/notes', store });
    await user.click(await screen.findByRole('button', { name: 'Edit Save system' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit note' });
    const title = within(dialog).getByLabelText('Title');
    await user.clear(title);
    await user.type(title, 'Save system v2');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('button', { name: 'Remove Save system v2 from favorites' })).toBeInTheDocument();
    expect(stored(store).notes[0]).toMatchObject({ title: 'Save system v2', favorite: true });
  });

  it('removes the favourite together with a deleted item', async () => {
    const user = userEvent.setup();
    const store = storeWith(makeWorkspace({ snippets: [makeSnippet({ favorite: true }), makeSnippet({ id: 's2', title: 'Other' })] }));
    renderApp({ route: '/snippets', store });
    await user.click(await screen.findByRole('button', { name: 'Delete Debounce' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete/i }));
    expect(await screen.findByRole('button', { name: 'Add Other to favorites' })).toBeInTheDocument();
    expect(stored(store).snippets.map((snippet) => [snippet.id, snippet.favorite])).toEqual([['s2', false]]);
  });
});

describe('filters', () => {
  it('filters tasks with several criteria, shows chips and removes them one by one', async () => {
    const user = userEvent.setup();
    const store = seeded();
    const before = store.getItem(WORKSPACE_STORAGE_KEY);
    renderApp({ route: '/tasks', store });
    await screen.findByRole('heading', { level: 1, name: 'Tasks' });
    expect(screen.getByText('4 tasks')).toBeInTheDocument();

    const filtersButton = screen.getByRole('button', { name: /^filters/i });
    expect(filtersButton).toHaveAttribute('aria-expanded', 'false');
    await user.click(filtersButton);
    const panel = screen.getByRole('group', { name: 'Task filters' });
    await user.click(within(panel).getByRole('button', { name: 'In progress (2)' }));
    await user.click(within(panel).getByRole('button', { name: 'High (2)' }));
    await user.click(within(panel).getByRole('button', { name: 'VOID (2)' }));
    await user.click(within(panel).getByRole('button', { name: 'Roblox (2)' }));
    expect(taskTitles()).toEqual(['Filter bar', 'Spawn pads']);
    expect(screen.getByText('Showing 2 of 4 tasks')).toBeInTheDocument();
    expect(activeChips()).toEqual(['Status: In progress', 'Priority: High', 'Project: VOID', 'Tags: Roblox']);
    expect(filtersButton).toHaveTextContent('4');

    // Favourites only, combined with everything else (AND).
    await user.click(screen.getByRole('button', { name: 'Add Filter bar to favorites' }));
    await user.click(screen.getByRole('button', { name: 'Favorites only' }));
    expect(taskTitles()).toEqual(['Filter bar']);

    await user.click(screen.getByRole('button', { name: 'Remove filter Favorites only' }));
    await user.click(screen.getByRole('button', { name: 'Remove filter Priority: High' }));
    expect(taskTitles()).toEqual(['Filter bar', 'Spawn pads']);
    expect(within(panel).getByRole('button', { name: 'High (2)' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Reset all filters' }));
    expect(taskTitles()).toEqual(['Filter bar', 'Spawn pads', 'Jump buffer', 'Pay taxes']);
    expect(activeChips()).toEqual([]);
    // Filtering never changed the stored items (only the one favourite did).
    const after = stored(store);
    expect(after.tasks.map((task) => ({ ...task, favorite: false }))).toEqual((JSON.parse(before ?? '{}') as Workspace).tasks);
  });

  it('finds tasks without a project and distinguishes "no matches" from "no tasks"', async () => {
    const user = userEvent.setup();
    renderApp({ route: '/tasks', store: seeded() });
    await user.click(await screen.findByRole('button', { name: /^filters/i }));
    const panel = screen.getByRole('group', { name: 'Task filters' });
    await user.click(within(panel).getByRole('button', { name: 'No project (1)' }));
    expect(taskTitles()).toEqual(['Pay taxes']);

    await user.click(within(panel).getByRole('button', { name: 'Low (1)' }));
    expect(taskTitles()).toEqual([]);
    expect(screen.getByRole('heading', { name: 'No tasks match your filters' })).toBeInTheDocument();
    expect(screen.queryByText('No tasks yet')).not.toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Reset all filters' })[0]!);
    expect(taskTitles()).toHaveLength(4);
  });

  it('filters projects by status and tag, and keeps the filters while switching pages', async () => {
    const user = userEvent.setup();
    renderApp({ route: '/projects', store: seeded() });
    await user.click(await screen.findByRole('button', { name: /^filters/i }));
    const panel = screen.getByRole('group', { name: 'Project filters' });
    expect(within(panel).getByRole('button', { name: 'Archived (0)' })).toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'Paused (1)' }));
    expect(listed(screen.getByRole('main'))).toEqual(['Obby Rush']);

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Notes' }));
    expect(screen.getByText('2 notes')).toBeInTheDocument();
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Projects' }));
    expect(activeChips()).toEqual(['Status: Paused']);

    await user.click(screen.getByRole('button', { name: 'Remove filter Status: Paused' }));
    await user.click(screen.getByRole('button', { name: /^filters/i }));
    await user.click(within(screen.getByRole('group', { name: 'Project filters' })).getByRole('button', { name: 'UI (1)' }));
    expect(screen.getByText('Shows items with at least one of the selected tags.')).toBeInTheDocument();
    expect(listed(screen.getByRole('main'))).toEqual(['VOID']);
  });

  it('filters notes by project and tags, snippets by language and project', async () => {
    const user = userEvent.setup();
    renderApp({ route: '/notes', store: seeded() });
    await user.click(await screen.findByRole('button', { name: /^filters/i }));
    let panel = screen.getByRole('group', { name: 'Note filters' });
    await user.click(within(panel).getByRole('button', { name: 'No project (1)' }));
    expect(screen.getByRole('heading', { name: 'Loose idea' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Architecture' })).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'UI (1)' }));
    expect(screen.getByRole('heading', { name: 'No notes match your filters' })).toBeInTheDocument();

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Snippet Vault' }));
    await user.click(screen.getByRole('button', { name: /^filters/i }));
    panel = screen.getByRole('group', { name: 'Snippet filters' });
    await user.click(within(panel).getByRole('button', { name: 'Luau (1)' }));
    expect(screen.getByRole('heading', { name: 'Tween' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Debounce' })).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: 'VOID (1)' }));
    expect(screen.getByRole('heading', { name: 'No snippets match your filters' })).toBeInTheDocument();
  });

  it('combines the list search with filters and keeps Ctrl+K working', async () => {
    const user = userEvent.setup();
    renderApp({ route: '/tasks', store: seeded() });
    const search = await screen.findByRole('searchbox', { name: 'Search tasks' });
    await user.type(search, 'roblox');
    expect(taskTitles()).toEqual(['Filter bar', 'Spawn pads']);
    expect(activeChips()).toEqual(['Search: “roblox”']);
    await user.click(screen.getByRole('button', { name: /^filters/i }));
    await user.click(within(screen.getByRole('group', { name: 'Task filters' })).getByRole('button', { name: 'Done (1)' }));
    expect(taskTitles()).toEqual([]);

    await user.click(screen.getByRole('button', { name: 'Remove filter Search: “roblox”' }));
    expect(search).toHaveValue('');
    expect(taskTitles()).toEqual(['Pay taxes']);

    search.blur();
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByRole('dialog', { name: /search/i })).toBeInTheDocument();
  });
});
