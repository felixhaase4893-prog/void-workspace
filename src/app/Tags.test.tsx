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
      tags: [makeTag({ id: 'tag-ui', name: 'UI', color: 'violet' }), makeTag({ id: 'tag-bug', name: 'Bug', color: 'red' })],
      projects: [makeProject({ tagIds: ['tag-ui'] })],
      tasks: [makeTask({ tagIds: ['tag-ui', 'tag-bug'] }), makeTask({ id: 'task-2', title: 'Write devlog', tagIds: ['tag-bug'] })],
      notes: [makeNote()],
      snippets: [makeSnippet()],
    }),
  );

const tagInput = (dialog: HTMLElement) => within(dialog).getByRole('combobox', { name: /tags/i });
const selectedTags = (dialog: HTMLElement) =>
  within(dialog)
    .queryAllByRole('button', { name: /^Remove tag / })
    .map((button) => button.getAttribute('aria-label')?.replace('Remove tag ', ''));
const tagsOf = (container: HTMLElement) =>
  within(container)
    .queryAllByRole('list', { name: 'Tags' })
    .flatMap((list) => within(list).getAllByRole('listitem').map((item) => item.textContent));

describe('tags in forms', () => {
  it('creates a new tag and picks an existing one with the keyboard, then saves both', async () => {
    const user = userEvent.setup();
    const store = seeded();
    const { unmount } = renderApp({ store, route: '/tasks' });

    await user.click(await screen.findByRole('button', { name: 'New task' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    await user.type(within(dialog).getByLabelText('Title'), 'Optimise draw calls');

    await user.type(tagInput(dialog), 'Performance');
    expect(within(dialog).getByRole('option', { name: /Create tag “Performance”/ })).toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(selectedTags(dialog)).toEqual(['Performance']);

    // An existing tag, found by a part of its name in another case, chosen with arrow keys.
    await user.type(tagInput(dialog), 'BUG');
    // The name exists already, so there is nothing to create.
    expect(within(dialog).queryByRole('option', { name: /Create tag/ })).not.toBeInTheDocument();
    await user.clear(tagInput(dialog));
    // The best match is highlighted first; the arrow keys move through the list (here: away and back).
    await user.type(tagInput(dialog), 'bu');
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    expect(selectedTags(dialog)).toEqual(['Performance', 'Bug']);

    await user.click(within(dialog).getByRole('button', { name: 'Create task' }));
    const data = stored(store);
    const performance = data.tags.find((tag) => tag.name === 'Performance');
    expect(performance).toBeDefined();
    expect(data.tasks[0]).toMatchObject({ title: 'Optimise draw calls', tagIds: [performance?.id, 'tag-bug'] });

    const row = screen.getByText('Optimise draw calls').closest('li') as HTMLElement;
    expect(tagsOf(row)).toEqual(['Performance', 'Bug']);

    // Still there after a restart.
    unmount();
    renderApp({ store, route: '/tasks' });
    const reloaded = (await screen.findByText('Optimise draw calls')).closest('li') as HTMLElement;
    expect(tagsOf(reloaded)).toEqual(['Performance', 'Bug']);
  });

  it('does not create the same tag twice and reuses existing tags typed in another case', async () => {
    const user = userEvent.setup();
    const store = seeded();
    renderApp({ store, route: '/notes' });

    await user.click(await screen.findByRole('button', { name: 'Edit Save system' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit note' });
    await user.type(tagInput(dialog), 'ui{Enter}');
    await user.type(tagInput(dialog), 'UI{Enter}');
    expect(selectedTags(dialog)).toEqual(['UI']);
    expect(within(dialog).getByText('“UI” is already added.')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(stored(store).tags).toHaveLength(2);
    expect(stored(store).notes[0]?.tagIds).toEqual(['tag-ui']);
  });

  it('removes and changes existing assignments when editing', async () => {
    const user = userEvent.setup();
    const store = seeded();
    renderApp({ store, route: '/tasks' });

    await user.click(await screen.findByRole('button', { name: 'Edit Fix jump buffering' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit task' });
    expect(selectedTags(dialog)).toEqual(['UI', 'Bug']);

    await user.click(within(dialog).getByRole('button', { name: 'Remove tag UI' }));
    // Backspace in the empty field removes the last tag.
    await user.click(tagInput(dialog));
    await user.keyboard('{Backspace}');
    expect(selectedTags(dialog)).toEqual([]);
    await user.type(tagInput(dialog), 'Later');

    // A typed name is kept when moving straight to "Save".
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    const data = stored(store);
    const later = data.tags.find((tag) => tag.name === 'Later');
    expect(data.tasks.find((task) => task.id === 'task-1')?.tagIds).toEqual([later?.id]);
    // Removing the tag from one item never deletes the tag itself.
    expect(data.tags.map((tag) => tag.name)).toEqual(['UI', 'Bug', 'Later']);
  });

  it('discards new tags when the form is cancelled', async () => {
    const user = userEvent.setup();
    const store = seeded();
    renderApp({ store, route: '/snippets' });

    await user.click(await screen.findByRole('button', { name: 'Edit Debounce' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit snippet' });
    await user.type(tagInput(dialog), 'Throwaway{Enter}');
    expect(selectedTags(dialog)).toEqual(['Throwaway']);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(stored(store).tags.map((tag) => tag.name)).toEqual(['UI', 'Bug']);
    expect(stored(store).snippets[0]?.tagIds).toEqual([]);
  });

  it('assigns tags to projects and shows them on cards and the detail page', async () => {
    const user = userEvent.setup();
    const store = seeded();
    renderApp({ store, route: '/projects' });

    await user.click(await screen.findByRole('button', { name: 'Edit Obby Rush' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit project' });
    await user.type(tagInput(dialog), 'Roblox{Enter}');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    const card = screen.getByRole('link', { name: 'Obby Rush' }).closest('li') as HTMLElement;
    expect(tagsOf(card)).toEqual(['UI', 'Roblox']);
    await user.click(screen.getByRole('link', { name: 'Obby Rush' }));
    expect(tagsOf(await screen.findByText('Last updated').then((label) => label.closest('dl') as HTMLElement))).toEqual(['UI', 'Roblox']);
  });

  it('shows an error for tag names that are too long', async () => {
    const user = userEvent.setup();
    renderApp({ store: seeded(), route: '/notes' });

    await user.click(await screen.findByRole('button', { name: 'Edit Save system' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit note' });
    await user.type(tagInput(dialog), `${'x'.repeat(41)}{Enter}`);
    expect(within(dialog).getByText('Tag names must be at most 40 characters.')).toBeInTheDocument();
    expect(selectedTags(dialog)).toEqual([]);
  });

  it('shows no empty tag area for items without tags', async () => {
    renderApp({ store: seeded(), route: '/notes' });
    const card = (await screen.findByText('Save system')).closest('div') as HTMLElement;
    expect(within(card.parentElement as HTMLElement).queryByRole('list', { name: 'Tags' })).not.toBeInTheDocument();
  });
});

describe('tag management in Settings', () => {
  const tagsSection = () => screen.getByRole('region', { name: 'Tags' });
  const loaded = () => screen.findByRole('region', { name: 'Tags' });

  it('shows an empty state and creates a tag with a colour', async () => {
    const user = userEvent.setup();
    const store = storeWith(makeWorkspace());
    renderApp({ store, route: '/settings' });

    expect(within(await loaded()).getByText('No tags yet')).toBeInTheDocument();
    await user.click(within(tagsSection()).getByRole('button', { name: 'New tag' }));
    const dialog = screen.getByRole('dialog', { name: 'New tag' });
    await user.type(within(dialog).getByLabelText('Name'), '  Game   Jam ');
    await user.click(within(dialog).getByRole('radio', { name: 'Teal' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create tag' }));

    expect(stored(store).tags).toEqual([expect.objectContaining({ name: 'Game Jam', color: 'teal' })]);
    expect(within(tagsSection()).getByText('Game Jam')).toBeInTheDocument();
    expect(within(tagsSection()).getByText('Not used yet')).toBeInTheDocument();
  });

  it('refuses empty and duplicate names', async () => {
    const user = userEvent.setup();
    renderApp({ store: seeded(), route: '/settings' });

    await user.click(within(await loaded()).getByRole('button', { name: 'New tag' }));
    const dialog = screen.getByRole('dialog', { name: 'New tag' });
    await user.type(within(dialog).getByLabelText('Name'), '   ');
    await user.click(within(dialog).getByRole('button', { name: 'Create tag' }));
    expect(within(dialog).getByText('Tag names cannot be empty.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Name'), 'bug');
    await user.click(within(dialog).getByRole('button', { name: 'Create tag' }));
    expect(within(dialog).getByText('A tag called “Bug” already exists.')).toBeInTheDocument();
  });

  it('shows usage counts per tag and content type', async () => {
    renderApp({ store: seeded(), route: '/settings' });
    expect(within(await loaded()).getByText('2 uses · 1 project, 1 task')).toBeInTheDocument();
    expect(within(tagsSection()).getByText('2 uses · 2 tasks')).toBeInTheDocument();
  });

  it('renames a tag and every item shows the new name', async () => {
    const user = userEvent.setup();
    const store = seeded();
    renderApp({ store, route: '/settings' });

    await user.click(within(await loaded()).getByRole('button', { name: 'Edit tag Bug' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit tag' });
    expect(within(dialog).getByText('Renaming keeps the tag on all 2 items.')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'Bugfix');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(stored(store).tags.find((tag) => tag.id === 'tag-bug')?.name).toBe('Bugfix');
    expect(stored(store).tasks.map((task) => task.tagIds)).toEqual([['tag-ui', 'tag-bug'], ['tag-bug']]);

    await user.click(screen.getAllByRole('link', { name: 'Tasks' })[0]!);
    expect(tagsOf(screen.getByText('Write devlog').closest('li') as HTMLElement)).toEqual(['Bugfix']);
  });

  it('asks before deleting a used tag and keeps the tagged items', async () => {
    const user = userEvent.setup();
    const store = seeded();
    renderApp({ store, route: '/settings' });

    await user.click(within(await loaded()).getByRole('button', { name: 'Delete tag UI' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete tag?' });
    expect(within(dialog).getByText('This tag is used 2 times: 1 project, 1 task.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Remove from 2 items and delete' }));

    const data = stored(store);
    expect(data.tags.map((tag) => tag.name)).toEqual(['Bug']);
    expect(data.projects).toHaveLength(1);
    expect(data.tasks).toHaveLength(2);
    expect(data.projects[0]?.tagIds).toEqual([]);
    expect(data.tasks[0]?.tagIds).toEqual(['tag-bug']);
    expect(screen.getByText('Tag “UI” deleted.')).toBeInTheDocument();
  });

  it('cancelling the delete dialog keeps the tag', async () => {
    const user = userEvent.setup();
    const store = seeded();
    renderApp({ store, route: '/settings' });
    await user.click(within(await loaded()).getByRole('button', { name: 'Delete tag UI' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Delete tag?' })).getByRole('button', { name: 'Cancel' }));
    expect(stored(store).tags).toHaveLength(2);
  });
});

describe('tags in global search', () => {
  it('finds items by tag name and follows renames right away', async () => {
    const user = userEvent.setup();
    renderApp({ store: seeded(), route: '/settings' });

    await user.click(within(await screen.findByRole('region', { name: 'Tags' })).getByRole('button', { name: 'Edit tag Bug' }));
    const edit = screen.getByRole('dialog', { name: 'Edit tag' });
    await user.clear(within(edit).getByLabelText('Name'));
    await user.type(within(edit).getByLabelText('Name'), 'Regression');
    await user.click(within(edit).getByRole('button', { name: 'Save changes' }));

    await user.keyboard('{Control>}k{/Control}');
    const dialog = screen.getByRole('dialog', { name: 'Search' });
    await user.type(within(dialog).getByRole('combobox'), 'regress');
    const options = within(dialog).getAllByRole('option');
    expect(options.map((option) => within(option).getByText(/Fix jump buffering|Write devlog/).textContent)).toEqual(['Fix jump buffering', 'Write devlog']);
    expect(tagsOf(options[1]!)).toEqual(['Regression']);

    await user.clear(within(dialog).getByRole('combobox'));
    await user.type(within(dialog).getByRole('combobox'), 'bug');
    expect(within(dialog).getByText('Nothing found')).toBeInTheDocument();
  });
});
