import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

const workspace = () =>
  makeWorkspace({
    tags: [makeTag({ id: 'tag-1', name: 'Gameplay' })],
    projects: [makeProject({ id: 'project-1', name: 'Obby Rush', tagIds: ['tag-1'] })],
    tasks: [
      makeTask({ id: 'task-1', title: 'Fix jump buffering', projectId: 'project-1', tagIds: ['tag-1'] }),
      makeTask({ id: 'task-2', title: 'Write devlog' }),
      makeTask({ id: 'task-3', title: 'Record trailer' }),
    ],
    notes: [makeNote({ id: 'note-1', title: 'Save system', projectId: 'project-1' }), makeNote({ id: 'note-2', title: 'Ideas' })],
    snippets: [makeSnippet({ id: 'snippet-1', title: 'Debounce', projectId: 'project-1' })],
  });

async function deleteItem(user: ReturnType<typeof userEvent.setup>, title: string, confirmLabel: string) {
  await user.click(await screen.findByRole('button', { name: `Delete ${title}` }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: confirmLabel }));
}

function undoButtonFor(message: string) {
  const toast = screen.getByText(message).closest('[role="status"]');
  if (!(toast instanceof HTMLElement)) throw new Error(`No toast for ${message}`);
  return within(toast).getByRole('button', { name: 'Undo' });
}

/** Lets pending effects (which start the toast timers) run, then moves the fake clock. */
async function advance(ms: number) {
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('undo after delete', () => {
  it('offers Undo in the delete dialog text', async () => {
    const user = userEvent.setup();
    renderApp({ store: storeWith(workspace()), route: '/tasks' });
    await user.click(await screen.findByRole('button', { name: 'Delete Write devlog' }));
    expect(screen.getByRole('dialog', { name: 'Delete task?' })).toHaveTextContent('You can undo this for a few seconds afterwards.');
  });

  it('restores a deleted task, saves it and puts it back in place', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store, route: '/tasks' });

    await deleteItem(user, 'Write devlog', 'Delete task');
    expect(stored(store).tasks.map((task) => task.id)).toEqual(['task-1', 'task-3']);

    await user.click(undoButtonFor('Task “Write devlog” deleted.'));
    expect(await screen.findByText('Task “Write devlog” restored.')).toBeInTheDocument();
    expect(screen.getByText('Write devlog')).toBeInTheDocument();
    expect(stored(store)).toEqual(workspace());
  });

  it('restores a deleted note', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store, route: '/notes' });

    await deleteItem(user, 'Ideas', 'Delete note');
    expect(stored(store).notes).toHaveLength(1);
    await user.click(undoButtonFor('Note “Ideas” deleted.'));
    expect(await screen.findByRole('heading', { name: 'Ideas' })).toBeInTheDocument();
    expect(stored(store)).toEqual(workspace());
  });

  it('restores a deleted snippet', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store, route: '/snippets' });

    await deleteItem(user, 'Debounce', 'Delete snippet');
    expect(stored(store).snippets).toEqual([]);
    await user.click(undoButtonFor('Snippet “Debounce” deleted.'));
    expect(await screen.findByRole('heading', { name: 'Debounce' })).toBeInTheDocument();
    expect(stored(store)).toEqual(workspace());
  });

  it('restores a project together with the contents that were deleted with it', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store, route: '/projects' });

    await user.click(await screen.findByRole('button', { name: 'Delete Obby Rush' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete project?' });
    await user.click(within(dialog).getByLabelText('Delete them as well'));
    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }));
    expect(stored(store)).toMatchObject({ projects: [], notes: [{ id: 'note-2' }], snippets: [] });
    expect(stored(store).tasks.map((task) => task.id)).toEqual(['task-2', 'task-3']);

    await user.click(undoButtonFor('Project “Obby Rush” deleted.'));
    expect(await screen.findByRole('link', { name: 'Obby Rush' })).toBeInTheDocument();
    expect(stored(store)).toEqual(workspace());
  });

  it('re-links kept contents when a project deleted without them is restored', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store, route: '/projects' });

    await deleteItem(user, 'Obby Rush', 'Delete project');
    expect(stored(store).tasks.find((task) => task.id === 'task-1')?.projectId).toBeNull();

    await user.click(undoButtonFor('Project “Obby Rush” deleted.'));
    await screen.findByText('Project “Obby Rush” restored.');
    expect(stored(store)).toEqual(workspace());
  });

  it('keeps every item when several deletions are undone in any order', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store, route: '/tasks' });

    await deleteItem(user, 'Write devlog', 'Delete task');
    await deleteItem(user, 'Record trailer', 'Delete task');
    await deleteItem(user, 'Fix jump buffering', 'Delete task');
    expect(stored(store).tasks).toEqual([]);

    await user.click(undoButtonFor('Task “Record trailer” deleted.'));
    await user.click(undoButtonFor('Task “Write devlog” deleted.'));
    expect(stored(store).tasks.map((task) => task.id)).toEqual(['task-2', 'task-3']);
    await user.click(undoButtonFor('Task “Fix jump buffering” deleted.'));

    expect(stored(store)).toEqual(workspace());
  });

  it('only undoes the chosen deletion', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store, route: '/tasks' });

    await deleteItem(user, 'Write devlog', 'Delete task');
    await deleteItem(user, 'Record trailer', 'Delete task');
    await user.click(undoButtonFor('Task “Write devlog” deleted.'));

    expect(stored(store).tasks.map((task) => task.id)).toEqual(['task-1', 'task-2']);
    expect(screen.queryByText('Record trailer')).not.toBeInTheDocument();
  });

  it('makes the deletion final once the toast has expired', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const store = storeWith(workspace());
    const { unmount } = renderApp({ store, route: '/notes' });

    await deleteItem(user, 'Ideas', 'Delete note');
    expect(undoButtonFor('Note “Ideas” deleted.')).toBeInTheDocument();

    await advance(9000);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
    expect(stored(store).notes.map((note) => note.id)).toEqual(['note-1']);

    // Also after a restart: no trash, nothing comes back.
    unmount();
    renderApp({ store, route: '/notes' });
    expect(await screen.findByRole('heading', { name: 'Save system' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ideas' })).not.toBeInTheDocument();
  });

  it('keeps the Undo button while the pointer rests on the toast', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderApp({ store: storeWith(workspace()), route: '/notes' });

    await deleteItem(user, 'Ideas', 'Delete note');
    await user.hover(undoButtonFor('Note “Ideas” deleted.'));
    await advance(20_000);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();

    await user.unhover(screen.getByRole('button', { name: 'Undo' }));
    await user.click(document.body);
    await advance(9000);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });
});
