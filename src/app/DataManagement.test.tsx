import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Workspace } from '../domain/models';
import type * as DownloadModule from '../lib/download';
import { createBackup, serializeBackup } from '../storage/backup';
import { WORKSPACE_STORAGE_KEY } from '../storage/keyValueWorkspaceRepository';
import { MemoryKeyValueStore } from '../storage/keyValueStore';
import { FIXED_NOW, makeNote, makeProject, makeSnippet, makeTask, makeWorkspace } from '../test/fixtures';
import { renderApp } from '../test/renderApp';

const downloads = vi.hoisted(() => [] as Array<{ fileName: string; content: string }>);

vi.mock('../lib/download', async (importOriginal) => ({
  ...(await importOriginal<typeof DownloadModule>()),
  downloadTextFile: (fileName: string, content: string) => downloads.push({ fileName, content }),
}));

beforeEach(() => {
  downloads.length = 0;
});

function storeWith(workspace: Workspace) {
  return new MemoryKeyValueStore({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(workspace) });
}

function stored(store: MemoryKeyValueStore): Workspace {
  return JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '{}') as Workspace;
}

const mainNav = () => screen.getByRole('navigation', { name: 'Main' });

const fullWorkspace = () =>
  makeWorkspace({
    projects: [makeProject({ technologies: ['Luau'], links: [{ label: 'Repo', url: 'https://github.com/a/b' }] })],
    tasks: [makeTask({ projectId: 'project-1' }), makeTask({ id: 'task-2', title: 'Write devlog' })],
    notes: [makeNote({ projectId: 'project-1' })],
    snippets: [makeSnippet({ projectId: 'project-1' })],
  });

describe('editing', () => {
  it('edits a project with prefilled values, persists it and updates the dashboard', async () => {
    const user = userEvent.setup();
    const store = storeWith(fullWorkspace());
    const { unmount } = renderApp({ store, route: '/projects' });

    await user.click(await screen.findByRole('button', { name: 'Edit Obby Rush' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit project' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Obby Rush');
    expect(within(dialog).getByLabelText(/technologies/i)).toHaveValue('Luau');
    expect(within(dialog).getByLabelText(/links/i)).toHaveValue('Repo | https://github.com/a/b');

    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'Obby Rush 2');
    await user.type(within(dialog).getByLabelText(/technologies/i), ', Rojo');
    await user.selectOptions(within(dialog).getByLabelText('Status'), 'paused');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Project updated.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Obby Rush 2' })).toBeInTheDocument();
    expect(stored(store).projects[0]).toMatchObject({ id: 'project-1', name: 'Obby Rush 2', status: 'paused', technologies: ['Luau', 'Rojo'] });

    // Survives a restart and shows up on the dashboard.
    unmount();
    renderApp({ store });
    expect(await screen.findByRole('link', { name: 'Obby Rush 2' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Workspace summary' })).getByText('Active projects').closest('div')).toHaveTextContent('0');
  });

  it('shows validation errors when editing and saves nothing', async () => {
    const user = userEvent.setup();
    const store = storeWith(fullWorkspace());
    renderApp({ store, route: '/projects' });

    await user.click(await screen.findByRole('button', { name: 'Edit Obby Rush' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit project' });
    await user.clear(within(dialog).getByLabelText(/links/i));
    await user.type(within(dialog).getByLabelText(/links/i), 'not a link');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(within(dialog).getByText(/links must be full http\(s\) urls/i)).toBeInTheDocument();
    expect(stored(store)).toEqual(fullWorkspace());
  });

  it('edits tasks, notes and snippets', async () => {
    const user = userEvent.setup();
    const store = storeWith(fullWorkspace());
    renderApp({ store, route: '/tasks' });

    await user.click(await screen.findByRole('button', { name: 'Edit Write devlog' }));
    let dialog = screen.getByRole('dialog', { name: 'Edit task' });
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Write devlog');
    await user.selectOptions(within(dialog).getByLabelText('Status'), 'in_progress');
    await user.selectOptions(within(dialog).getByLabelText('Priority'), 'high');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(stored(store).tasks[1]).toMatchObject({ status: 'in_progress', priority: 'high' });
    expect(screen.getByText('In progress')).toBeInTheDocument();

    await user.click(within(mainNav()).getByRole('link', { name: 'Notes' }));
    await user.click(screen.getByRole('button', { name: 'Edit Save system' }));
    dialog = screen.getByRole('dialog', { name: 'Edit note' });
    expect(within(dialog).getByLabelText(/content/i)).toHaveValue('Use DataStore2.');
    await user.type(within(dialog).getByLabelText(/content/i), ' Or ProfileService.');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(stored(store).notes[0]?.content).toBe('Use DataStore2. Or ProfileService.');
    expect(screen.getByText('Use DataStore2. Or ProfileService.')).toBeInTheDocument();

    await user.click(within(mainNav()).getByRole('link', { name: 'Snippet Vault' }));
    await user.click(screen.getByRole('button', { name: 'Edit Debounce' }));
    dialog = screen.getByRole('dialog', { name: 'Edit snippet' });
    await user.clear(within(dialog).getByLabelText('Language'));
    await user.type(within(dialog).getByLabelText('Language'), 'Luau');
    await user.selectOptions(within(dialog).getByLabelText(/project/i), '');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(stored(store).snippets[0]).toMatchObject({ language: 'Luau', projectId: null });
  });
});

describe('deleting', () => {
  it('asks before deleting a task and updates lists and dashboard', async () => {
    const user = userEvent.setup();
    const store = storeWith(fullWorkspace());
    renderApp({ store, route: '/tasks' });

    await user.click(await screen.findByRole('button', { name: 'Delete Write devlog' }));
    let dialog = screen.getByRole('dialog', { name: 'Delete task?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Write devlog')).toBeInTheDocument();
    expect(stored(store).tasks).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Delete Write devlog' }));
    dialog = screen.getByRole('dialog', { name: 'Delete task?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete task' }));
    expect(screen.queryByText('Write devlog')).not.toBeInTheDocument();
    expect(screen.getByText('Task “Write devlog” deleted.')).toBeInTheDocument();
    expect(stored(store).tasks.map((task) => task.id)).toEqual(['task-1']);

    await user.click(within(mainNav()).getByRole('link', { name: 'Dashboard' }));
    expect(within(screen.getByRole('region', { name: 'Workspace summary' })).getByText('Open tasks').closest('div')).toHaveTextContent('1');
  });

  it('deletes notes and snippets after confirmation', async () => {
    const user = userEvent.setup();
    const store = storeWith(fullWorkspace());
    renderApp({ store, route: '/notes' });

    await user.click(await screen.findByRole('button', { name: 'Delete Save system' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete note' }));
    expect(screen.getByRole('heading', { name: 'No notes yet' })).toBeInTheDocument();

    await user.click(within(mainNav()).getByRole('link', { name: 'Snippet Vault' }));
    await user.click(screen.getByRole('button', { name: 'Delete Debounce' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete snippet' }));
    expect(stored(store)).toMatchObject({ notes: [], snippets: [] });
  });

  it('deletes a project from its detail page, keeps its contents and goes back to the list', async () => {
    const user = userEvent.setup();
    const store = storeWith(fullWorkspace());
    renderApp({ store, route: '/projects/project-1' });

    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete project?' });
    expect(within(dialog).getByText('This project contains 1 task, 1 note, 1 snippet.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No projects yet' })).toBeInTheDocument();
    const data = stored(store);
    expect(data.projects).toEqual([]);
    expect(data.tasks.map((task) => task.projectId)).toEqual([null, null]);
    expect(data.notes[0]?.projectId).toBeNull();
  });

  it('can delete a project together with its contents', async () => {
    const user = userEvent.setup();
    const store = storeWith(fullWorkspace());
    renderApp({ store, route: '/projects' });

    await user.click(await screen.findByRole('button', { name: 'Delete Obby Rush' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete project?' });
    await user.click(within(dialog).getByLabelText('Delete them as well'));
    await user.click(within(dialog).getByRole('button', { name: 'Delete project' }));
    expect(stored(store)).toMatchObject({ projects: [], notes: [], snippets: [], tasks: [{ id: 'task-2' }] });
  });
});

describe('project detail page', () => {
  it('shows details and related items, and toggles tasks there', async () => {
    const user = userEvent.setup();
    const store = storeWith(fullWorkspace());
    renderApp({ store, route: '/projects' });

    await user.click(await screen.findByRole('link', { name: 'Obby Rush' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Obby Rush' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Technologies' })).getByText('Luau')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Repo' })).toHaveAttribute('href', 'https://github.com/a/b');
    expect(screen.getByRole('checkbox', { name: /fix jump buffering/i })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Recent changes' })).getByText('Fix jump buffering')).toBeInTheDocument();
    expect(screen.queryByText('Write devlog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Save system' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Debounce' })).toBeInTheDocument();
    expect(within(mainNav()).getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('checkbox', { name: /fix jump buffering/i }));
    expect(stored(store).tasks[0]?.status).toBe('done');
  });

  it('shows an empty state and creates items that belong to the project', async () => {
    const user = userEvent.setup();
    const store = storeWith(makeWorkspace({ projects: [makeProject()] }));
    renderApp({ store, route: '/projects/project-1' });

    expect(await screen.findByRole('heading', { name: 'Nothing in this project yet' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    const dialog = screen.getByRole('dialog', { name: 'New task' });
    expect(within(dialog).getByLabelText(/project/i)).toHaveValue('project-1');
    await user.type(within(dialog).getByLabelText('Title'), 'Add checkpoints');
    await user.click(within(dialog).getByRole('button', { name: 'Create task' }));

    expect(screen.getByRole('checkbox', { name: /add checkpoints/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Nothing in this project yet' })).not.toBeInTheDocument();
    expect(stored(store).tasks[0]).toMatchObject({ title: 'Add checkpoints', projectId: 'project-1' });

    await user.click(screen.getByRole('button', { name: 'Add snippet' }));
    const snippetDialog = screen.getByRole('dialog', { name: 'New snippet' });
    expect(within(snippetDialog).getByLabelText(/project/i)).toHaveValue('project-1');
  });

  it('handles unknown projects', async () => {
    renderApp({ route: '/projects/missing' });
    expect(await screen.findByRole('heading', { name: 'Project not found' })).toBeInTheDocument();
  });
});

describe('export and import', () => {
  it('exports a versioned file that contains the current data', async () => {
    const user = userEvent.setup();
    const workspace = fullWorkspace();
    renderApp({ store: storeWith(workspace), route: '/settings' });

    await user.click(await screen.findByRole('button', { name: 'Export JSON' }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.fileName).toMatch(/^void-backup-.*\.json$/);
    const file = JSON.parse(downloads[0]?.content ?? '{}');
    expect(file).toMatchObject({ format: 'void-backup', formatVersion: 1 });
    expect(file.workspace).toEqual(workspace);
  });

  async function chooseFile(content: string, name = 'backup.json') {
    const user = userEvent.setup();
    await user.upload(await screen.findByLabelText('Backup file to import'), new File([content], name, { type: 'application/json' }));
    return user;
  }

  it('merges a backup after showing a summary, without duplicating existing items', async () => {
    const store = storeWith(fullWorkspace());
    renderApp({ store, route: '/settings' });
    const incoming = makeWorkspace({
      projects: [makeProject()],
      tasks: [makeTask({ id: 'task-9', title: 'From laptop' })],
      notes: [makeNote({ projectId: 'project-1' })],
    });
    const user = await chooseFile(serializeBackup(createBackup(incoming, FIXED_NOW)));

    const dialog = await screen.findByRole('dialog', { name: 'Import backup' });
    expect(within(dialog).getByText('backup.json')).toBeInTheDocument();
    const tasksRow = within(dialog).getByRole('row', { name: /tasks/i });
    expect(within(tasksRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['1', '1', '0', '0']);
    expect(stored(store)).toEqual(fullWorkspace());

    await user.click(within(dialog).getByRole('button', { name: 'Import' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/import complete: 1 added/i)).toBeInTheDocument();
    const data = stored(store);
    expect(data.tasks.map((task) => task.id)).toEqual(['task-9', 'task-1', 'task-2']);
    expect(data.projects).toHaveLength(1);
    expect(data.notes).toHaveLength(1);
  });

  it('asks how to resolve id conflicts', async () => {
    const store = storeWith(fullWorkspace());
    renderApp({ store, route: '/settings' });
    const incoming = makeWorkspace({ projects: [makeProject({ name: 'Renamed elsewhere' })] });
    const user = await chooseFile(serializeBackup(createBackup(incoming, FIXED_NOW)));

    const dialog = await screen.findByRole('dialog', { name: 'Import backup' });
    expect(within(dialog).getByText('1 item exists in both, with different content')).toBeInTheDocument();
    await user.click(within(dialog).getByLabelText(/use the version from the file/i));
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));
    expect(stored(store).projects[0]?.name).toBe('Renamed elsewhere');
  });

  it('requires explicit confirmation to replace all data', async () => {
    const store = storeWith(fullWorkspace());
    renderApp({ store, route: '/settings' });
    const incoming = makeWorkspace({ notes: [makeNote({ id: 'only-note' })] });
    const user = await chooseFile(serializeBackup(createBackup(incoming, FIXED_NOW)));

    const dialog = await screen.findByRole('dialog', { name: 'Import backup' });
    await user.click(within(dialog).getByLabelText(/replace all my current data/i));
    expect(within(dialog).getByText('This deletes your 5 current items.')).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Replace all data' });
    expect(confirm).toBeDisabled();

    await user.click(within(dialog).getByRole('button', { name: 'Export current data' }));
    expect(downloads).toHaveLength(1);

    await user.click(within(dialog).getByLabelText(/i understand/i));
    await user.click(confirm);
    expect(stored(store)).toEqual(incoming);
  });

  it('rejects invalid files and leaves the data unchanged', async () => {
    const store = storeWith(fullWorkspace());
    renderApp({ store, route: '/settings' });

    await chooseFile('{"not":"a backup"}', 'random.json');
    expect(await screen.findByText('This file cannot be imported')).toBeInTheDocument();
    expect(screen.getByText(/this file is not a void backup/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const broken = JSON.stringify({ format: 'void-backup', formatVersion: 1, exportedAt: FIXED_NOW.toISOString(), workspace: { schemaVersion: 2, projects: 'nope' } });
    await chooseFile(broken, 'broken.json');
    expect(await screen.findByText(/data void does not accept/i)).toBeInTheDocument();

    await chooseFile('{{{', 'garbage.json');
    expect(await screen.findByText(/not valid json/i)).toBeInTheDocument();
    expect(stored(store)).toEqual(fullWorkspace());
  });

  it('keeps the previous data when saving the import fails', async () => {
    const store = storeWith(fullWorkspace());
    renderApp({ store, route: '/settings' });
    await screen.findByRole('button', { name: 'Import JSON' });
    const original = store.getItem(WORKSPACE_STORAGE_KEY);
    store.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };

    const incoming = makeWorkspace({ tasks: [makeTask({ id: 'task-9', title: 'From laptop' })] });
    const user = await chooseFile(serializeBackup(createBackup(incoming, FIXED_NOW)));
    const dialog = await screen.findByRole('dialog', { name: 'Import backup' });
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(within(dialog).getByText('The import failed. Your existing data was not changed.')).toBeInTheDocument();
    expect(store.getItem(WORKSPACE_STORAGE_KEY)).toBe(original);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await user.click(within(mainNav()).getByRole('link', { name: 'Tasks' }));
    expect(screen.queryByText('From laptop')).not.toBeInTheDocument();
  });
});
