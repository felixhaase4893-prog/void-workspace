import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Workspace } from '../domain/models';
import { WORKSPACE_STORAGE_KEY } from '../storage/keyValueWorkspaceRepository';
import { MemoryKeyValueStore } from '../storage/keyValueStore';
import { makeNote, makeProject, makeSnippet, makeTag, makeTask, makeWorkspace } from '../test/fixtures';
import { renderApp } from '../test/renderApp';

const at = (day: number) => `2026-01-${String(day).padStart(2, '0')}T10:00:00.000Z`;

function seeded() {
  const workspace: Workspace = makeWorkspace({
    tags: [makeTag({ id: 'tag-ui', name: 'UI' })],
    projects: [
      makeProject({ id: 'p-void', name: 'VOID', createdAt: at(3), updatedAt: at(3) }),
      makeProject({ id: 'p-obby', name: 'Obby Rush', createdAt: at(1), updatedAt: at(8) }),
      makeProject({ id: 'p-zen', name: 'Zen Garden', createdAt: at(2), updatedAt: at(2), favorite: true }),
    ],
    tasks: [
      makeTask({ id: 't1', title: 'Spawn pads', priority: 'low', status: 'todo', createdAt: at(4), tagIds: ['tag-ui'] }),
      makeTask({ id: 't2', title: 'Filter bar', priority: 'high', status: 'done', createdAt: at(3), tagIds: ['tag-ui'] }),
      makeTask({ id: 't3', title: 'Jump buffer', priority: 'medium', status: 'in_progress', createdAt: at(2), favorite: true }),
      makeTask({ id: 't4', title: 'Audio', priority: 'high', status: 'todo', createdAt: at(1), tagIds: ['tag-ui'], favorite: true }),
    ],
    notes: [makeNote({ id: 'n1', title: 'Zebra', createdAt: at(2) }), makeNote({ id: 'n2', title: 'Apple', createdAt: at(1) })],
    snippets: [makeSnippet({ id: 's1', title: 'Tween', createdAt: at(1) }), makeSnippet({ id: 's2', title: 'Debounce', createdAt: at(2) })],
  });
  return new MemoryKeyValueStore({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(workspace) });
}

const headings = () =>
  within(screen.getByRole('main'))
    .queryAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent)
    .filter((text) => text !== 'Not implemented yet');
const taskTitles = () => screen.queryAllByRole('checkbox').map((box) => box.getAttribute('aria-label')?.replace(/^Mark “(.*)” as .*$/, '$1'));
const sortSelect = (plural: string) => screen.getByRole('combobox', { name: `Sort ${plural}` });

describe('sorting', () => {
  it.each([
    ['/projects', 'projects', ['VOID', 'Obby Rush', 'Zen Garden'], ['Obby Rush', 'VOID', 'Zen Garden']],
    ['/notes', 'notes', ['Zebra', 'Apple'], ['Apple', 'Zebra']],
    ['/snippets', 'snippets', ['Tween', 'Debounce'], ['Debounce', 'Tween']],
  ] as const)('sorts %s by name and back to the default order', async (route, plural, initial, byName) => {
    const user = userEvent.setup();
    renderApp({ route, store: seeded() });
    const select = await screen.findByRole('combobox', { name: `Sort ${plural}` });
    expect(select).toHaveValue('default');
    expect(headings()).toEqual(initial);

    await user.selectOptions(select, 'name-asc');
    expect(headings()).toEqual(byName);
    await user.selectOptions(select, 'name-desc');
    expect(headings()).toEqual([...byName].reverse());
    await user.selectOptions(select, 'default');
    expect(headings()).toEqual(initial);
  });

  it('offers priority and status only on the tasks page', async () => {
    const user = userEvent.setup();
    renderApp({ route: '/tasks', store: seeded() });
    const select = await screen.findByRole('combobox', { name: 'Sort tasks' });
    expect(within(select).getByRole('option', { name: 'Priority: high to low' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Status: to do first' })).toBeInTheDocument();

    await user.selectOptions(select, 'priority');
    expect(taskTitles()).toEqual(['Filter bar', 'Audio', 'Jump buffer', 'Spawn pads']);
    await user.selectOptions(select, 'status');
    expect(taskTitles()).toEqual(['Spawn pads', 'Audio', 'Jump buffer', 'Filter bar']);

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Projects' }));
    const projectSort = sortSelect('projects');
    expect(within(projectSort).queryByRole('option', { name: 'Priority: high to low' })).not.toBeInTheDocument();
    await user.selectOptions(projectSort, 'updated-desc');
    expect(headings()).toEqual(['Obby Rush', 'VOID', 'Zen Garden']);
  });

  it('works together with search, tags, favourites and status filters without either resetting the other', async () => {
    const user = userEvent.setup();
    const store = seeded();
    const before = store.getItem(WORKSPACE_STORAGE_KEY);
    renderApp({ route: '/tasks', store });
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Sort tasks' }), 'name-asc');

    await user.click(screen.getByRole('button', { name: /^filters/i }));
    const panel = screen.getByRole('group', { name: 'Task filters' });
    await user.click(within(panel).getByRole('button', { name: 'UI (3)' }));
    expect(taskTitles()).toEqual(['Audio', 'Filter bar', 'Spawn pads']);
    await user.click(within(panel).getByRole('button', { name: 'To do (2)' }));
    expect(taskTitles()).toEqual(['Audio', 'Spawn pads']);

    // Changing the order keeps the filters.
    await user.selectOptions(sortSelect('tasks'), 'name-desc');
    expect(taskTitles()).toEqual(['Spawn pads', 'Audio']);
    expect(screen.getByText('Showing 2 of 4 tasks')).toBeInTheDocument();

    // Resetting the filters keeps the order.
    await user.click(screen.getAllByRole('button', { name: 'Reset all filters' })[0]!);
    expect(sortSelect('tasks')).toHaveValue('name-desc');
    expect(taskTitles()).toEqual(['Spawn pads', 'Jump buffer', 'Filter bar', 'Audio']);

    await user.click(screen.getByRole('button', { name: 'Favorites only' }));
    expect(taskTitles()).toEqual(['Jump buffer', 'Audio']);
    await user.click(screen.getByRole('button', { name: 'Favorites only' }));

    await user.type(screen.getByRole('searchbox', { name: 'Search tasks' }), 'bar');
    expect(taskTitles()).toEqual(['Filter bar']);

    // The order survives switching pages, and sorting never touched the stored data.
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Notes' }));
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Tasks' }));
    expect(sortSelect('tasks')).toHaveValue('name-desc');
    expect(store.getItem(WORKSPACE_STORAGE_KEY)).toBe(before);
  });
});
