import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Workspace } from '../domain/models';
import { WORKSPACE_STORAGE_KEY } from '../storage/keyValueWorkspaceRepository';
import { MemoryKeyValueStore } from '../storage/keyValueStore';
import { makeBug, makeProject, makeSnippet, makeTask, makeWorkspace } from '../test/fixtures';
import { renderApp } from '../test/renderApp';

function storeWith(workspace: Workspace) {
  return new MemoryKeyValueStore({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(workspace) });
}

function stored(store: MemoryKeyValueStore): Workspace {
  return JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '{}') as Workspace;
}

const BROKEN_JS = ['function total(items) {', '  if (items == null) return 0;', '  var sum = 0;', '  for (const item of items) { sum += item.price;', '  return sum;', '}'].join('\n');

const workspace = () =>
  makeWorkspace({
    projects: [makeProject({ id: 'project-1', name: 'Obby Rush' })],
    snippets: [makeSnippet({ id: 'snippet-1', title: 'Sum helper', language: 'JavaScript', code: BROKEN_JS })],
  });

async function openCodeTester(user: ReturnType<typeof userEvent.setup>, store: MemoryKeyValueStore, code?: string) {
  renderApp({ store, route: '/code-tester' });
  await screen.findByRole('heading', { name: 'Code Tester', level: 1 }, { timeout: 10_000 });
  if (code !== undefined) {
    await navigator.clipboard.writeText(code);
    await user.click(screen.getByRole('button', { name: 'Paste from clipboard' }));
    await screen.findByText(/^Not saved\./);
  }
}

const count = (category: string) => screen.getByTestId(`count-${category}`).textContent;

describe('Code Tester', () => {
  it('starts as an empty scratch editor with every language to choose from', async () => {
    const user = userEvent.setup();
    await openCodeTester(user, storeWith(workspace()));
    const language = screen.getByLabelText('Language');
    expect(within(language).getAllByRole('option').length).toBeGreaterThanOrEqual(25);
    expect(screen.getByText('Scratch')).toBeInTheDocument();
    expect(screen.getByText('1 / 2,000 lines')).toBeInTheDocument();
    expect(screen.getByText('No analysis yet')).toBeInTheDocument();
  });

  it('finds a missing bracket with Quick Scan, filters findings and leaves the code unchanged', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    await openCodeTester(user, store, BROKEN_JS);
    expect(screen.getByText('6 / 2,000 lines')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Quick Scan' }));
    const findings = await screen.findByRole('list', { name: 'Findings' });
    expect(Number(count('error'))).toBeGreaterThanOrEqual(1);
    expect(within(findings).getAllByRole('button', { name: /^Error on line \d+:/ }).length).toBeGreaterThanOrEqual(1);

    // Hiding errors removes them from the list.
    await user.click(screen.getByRole('button', { name: /Errors/ }));
    expect(screen.queryByRole('button', { name: /^Error on line/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Errors/ }));
    expect(screen.getAllByRole('button', { name: /^Error on line/ }).length).toBeGreaterThanOrEqual(1);

    // Clicking a finding is allowed at any time and does not change the code.
    await user.click(screen.getAllByRole('button', { name: /^Error on line/ })[0]!);
    expect(screen.getByText('6 / 2,000 lines')).toBeInTheDocument();
    expect(stored(store).snippets).toHaveLength(1);
  });

  it('runs the TypeScript-based Deep Scan for JavaScript', async () => {
    const user = userEvent.setup();
    const code = ['const limit = 5;', 'let value = 1;', 'if (value == "1") { console.log(value); }', 'limit = 6;'].join('\n');
    await openCodeTester(user, storeWith(workspace()), code);
    await user.selectOptions(screen.getByLabelText('Language'), 'javascript');
    await user.click(screen.getByRole('button', { name: 'Deep Scan' }));
    const findings = await screen.findByRole('list', { name: 'Findings' }, { timeout: 15_000 });
    expect(within(findings).getByText(/Assignment to a constant/i)).toBeInTheDocument();
    expect(within(findings).getByText(/Loose equality/i)).toBeInTheDocument();
  }, 30_000);

  it('reports clean code honestly and says that analysis is not available for some languages', async () => {
    const user = userEvent.setup();
    await openCodeTester(user, storeWith(workspace()), '{"name": "void", "version": 4}');
    await user.selectOptions(screen.getByLabelText('Language'), 'json');
    await user.click(screen.getByRole('button', { name: 'Deep Scan' }));
    expect(await screen.findByText('No problems found')).toBeInTheDocument();
    expect(screen.getByText('A clean static analysis does not prove that the code runs correctly.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Language'), 'toml');
    expect(screen.getByRole('button', { name: 'Quick Scan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Deep Scan' })).toBeDisabled();
  });

  it('refuses code longer than 2,000 lines', async () => {
    const user = userEvent.setup();
    await openCodeTester(user, storeWith(workspace()));
    await navigator.clipboard.writeText(Array.from({ length: 2001 }, (_, index) => `line ${index}`).join('\n'));
    await user.click(screen.getByRole('button', { name: 'Paste from clipboard' }));
    expect(await screen.findByText('The Code Tester holds up to 2,000 lines. That change was not applied.')).toBeInTheDocument();
    expect(screen.getByText('1 / 2,000 lines')).toBeInTheDocument();
  });

  it('previews formatting, applies it only on confirm and can restore the original', async () => {
    const user = userEvent.setup();
    const messy = 'const  a={b:1,c:[1,2,3]}\n';
    await openCodeTester(user, storeWith(workspace()), messy);
    await user.selectOptions(screen.getByLabelText('Language'), 'javascript');

    await user.click(screen.getByRole('button', { name: 'Format' }));
    const dialog = await screen.findByRole('dialog', { name: 'Format code' });
    await within(dialog).findByRole('button', { name: 'Apply formatting' }, { timeout: 15_000 });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Restore original' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Format' }));
    const again = await screen.findByRole('dialog', { name: 'Format code' });
    await user.click(await within(again).findByRole('button', { name: 'Apply formatting' }, { timeout: 15_000 }));
    const restore = await screen.findByRole('button', { name: 'Restore original' });
    await user.click(restore);
    expect(screen.queryByRole('button', { name: 'Restore original' })).not.toBeInTheDocument();
  }, 30_000);

  it('says clearly when a language cannot be formatted', async () => {
    const user = userEvent.setup();
    await openCodeTester(user, storeWith(workspace()), 'print("hi")');
    await user.selectOptions(screen.getByLabelText('Language'), 'python');
    await user.click(screen.getByRole('button', { name: 'Format' }));
    const dialog = await screen.findByRole('dialog', { name: 'Format code' });
    expect(await within(dialog).findByText('Formatting is not available')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Apply formatting' })).not.toBeInTheDocument();
  });

  it('saves scratch code as a new snippet linked to a project', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    await openCodeTester(user, store, 'SELECT id FROM users;');
    await user.selectOptions(screen.getByLabelText('Language'), 'sql');

    await user.click(screen.getByRole('button', { name: 'Save…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Save code' });
    await user.type(within(dialog).getByLabelText('Title'), 'User ids');
    await user.selectOptions(within(dialog).getByLabelText(/Project/), 'project-1');
    await user.click(within(dialog).getByRole('button', { name: 'Save snippet' }));

    expect(await screen.findByText('Saved as a new snippet.')).toBeInTheDocument();
    await waitFor(() => expect(stored(store).snippets).toHaveLength(2));
    expect(stored(store).snippets.find((snippet) => snippet.title === 'User ids')).toMatchObject({ code: 'SELECT id FROM users;', language: 'SQL', projectId: 'project-1' });
    expect(screen.getByText('Snippet')).toBeInTheDocument();
    expect(screen.getByText('· Saved')).toBeInTheDocument();
  });

  it('opens a snippet from the vault and saves changes back into it', async () => {
    const user = userEvent.setup();
    const store = storeWith(workspace());
    renderApp({ store, route: '/snippets' });
    await user.click(await screen.findByRole('link', { name: 'Open Sum helper in the Code Tester' }));
    expect(await screen.findByText('Sum helper')).toBeInTheDocument();
    expect(screen.getByLabelText('Language')).toHaveValue('javascript');
    expect(screen.getByText('6 / 2,000 lines')).toBeInTheDocument();

    await navigator.clipboard.writeText('const fixed = true;');
    await user.click(screen.getByRole('button', { name: 'Paste from clipboard' }));
    expect(await screen.findByText('· Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved to “Sum helper”.')).toBeInTheDocument();
    await waitFor(() => expect(stored(store).snippets[0]?.code).toBe('const fixed = true;'));
  });

  it('keeps unsaved scratch code while moving around the app, and warns about it', async () => {
    const user = userEvent.setup();
    await openCodeTester(user, storeWith(workspace()), 'let kept = 1;');
    await user.click(screen.getByRole('link', { name: /Dashboard/ }));
    expect(await screen.findByText('Your Code Tester code is not saved. It stays there until you close VOID.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: /Code Tester/ }));
    expect(await screen.findByText('1 / 2,000 lines')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear editor' }));
    const confirm = await screen.findByRole('dialog', { name: 'Clear the editor?' });
    await user.click(within(confirm).getByRole('button', { name: 'Clear code' }));
    expect(screen.getByText('1 / 2,000 lines')).toBeInTheDocument();
  });
});

describe('Project overview', () => {
  it('shows progress, counts and deadlines of a project', async () => {
    const tasks = Array.from({ length: 10 }, (_, index) =>
      makeTask({ id: `task-${index}`, title: `Task ${index}`, projectId: 'project-1', status: index < 6 ? 'done' : 'todo', dueDate: index === 9 ? '2099-01-01' : null }),
    );
    const store = storeWith(
      makeWorkspace({
        projects: [makeProject({ id: 'project-1', name: 'Obby Rush' })],
        tasks,
        bugs: [makeBug({ id: 'bug-1', projectId: 'project-1', status: 'open' }), makeBug({ id: 'bug-2', projectId: 'project-1', status: 'fixed' })],
      }),
    );
    renderApp({ store, route: '/projects/project-1' });
    expect(await screen.findByRole('progressbar', { name: 'Project progress' })).toHaveAttribute('aria-valuenow', '60');
    expect(screen.getByText('60%')).toBeInTheDocument();
    expect(screen.getByText('6 of 10 tasks done')).toBeInTheDocument();
    const deadlines = screen.getByRole('list', { name: 'Upcoming deadlines' });
    expect(within(deadlines).getByText('Task 9')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Recent changes' })).toBeInTheDocument();
  });

  it('shows no fake progress for a project without tasks', async () => {
    renderApp({ store: storeWith(makeWorkspace({ projects: [makeProject({ id: 'project-1' })] })), route: '/projects/project-1' });
    expect(await screen.findByText(/^No tasks yet\./)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'Project progress' })).not.toBeInTheDocument();
    expect(screen.getByText('No open tasks or bugs with a due date.')).toBeInTheDocument();
  });
});

describe('Statistics', () => {
  it('shows an empty state without data', async () => {
    renderApp({ store: storeWith(makeWorkspace()), route: '/statistics' });
    expect(await screen.findByText('No data yet')).toBeInTheDocument();
  });

  it('counts real data, switches periods and updates live when a task is completed', async () => {
    const user = userEvent.setup();
    const now = new Date().toISOString();
    const store = storeWith(
      makeWorkspace({
        projects: [makeProject({ id: 'project-1', name: 'Obby Rush' }), makeProject({ id: 'project-2', name: 'Old site', status: 'archived' })],
        tasks: [
          makeTask({ id: 'task-1', title: 'Fresh task', projectId: 'project-1', createdAt: now, updatedAt: now }),
          makeTask({ id: 'task-2', title: 'Old done task', projectId: 'project-1', status: 'done', completedAt: null }),
        ],
        bugs: [makeBug({ id: 'bug-1', createdAt: now, updatedAt: now })],
      }),
    );
    renderApp({ store, route: '/statistics' });
    expect(await screen.findByRole('heading', { name: 'Statistics', level: 1 })).toBeInTheDocument();

    const tasksSection = screen.getByRole('region', { name: 'Tasks' });
    const tile = (section: HTMLElement, label: string) => within(section).getByText(label).nextElementSibling?.textContent;
    expect(tile(tasksSection, 'Open now')).toBe('1');
    expect(tile(tasksSection, 'Done in total')).toBe('1');
    expect(tile(tasksSection, 'Created in period')).toBe('1');
    expect(within(tasksSection).getByText(/1 done task was completed before VOID recorded completion dates/)).toBeInTheDocument();
    expect(within(tasksSection).getByRole('table', { name: 'Tasks over time' })).toBeInTheDocument();

    expect(screen.getByRole('radio', { name: 'Last 30 days' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'All time' }));
    expect(screen.getByRole('radio', { name: 'All time' })).toHaveAttribute('aria-checked', 'true');
    expect(tile(tasksSection, 'Created in period')).toBe('2');

    const projects = screen.getByRole('list', { name: 'Progress by project' });
    expect(within(projects).getByText('Obby Rush')).toBeInTheDocument();
    expect(within(projects).queryByText('Old site')).not.toBeInTheDocument();
    expect(within(projects).getByRole('progressbar', { name: 'Obby Rush progress' })).toHaveAttribute('aria-valuenow', '50');

    // Completing the task elsewhere updates the numbers here.
    await user.click(screen.getByRole('link', { name: /Tasks/ }));
    await user.click(await screen.findByRole('checkbox', { name: /Fresh task/ }));
    await user.click(screen.getByRole('link', { name: /Statistics/ }));
    const updated = await screen.findByRole('region', { name: 'Tasks' });
    expect(tile(updated, 'Done in total')).toBe('2');
    expect(tile(updated, 'Completed in period')).toBe('1');
    await waitFor(() => expect(stored(store).tasks.find((task) => task.id === 'task-1')?.completedAt).not.toBeNull());
  });

  it('adds a statistics card to the dashboard that links to the page', async () => {
    const user = userEvent.setup();
    renderApp({
      store: storeWith(
        makeWorkspace({
          projects: [makeProject({ id: 'project-1' })],
          tasks: [makeTask({ status: 'done', completedAt: new Date().toISOString() }), makeTask({ id: 'task-2' })],
          bugs: [makeBug({ status: 'closed', resolvedAt: null })],
        }),
      ),
    });
    const heading = await screen.findByRole('heading', { name: 'Statistics' });
    const card = heading.closest('section, div.rounded-card, [class*="rounded"]') as HTMLElement;
    const tile = (label: string) => within(card).getByText(label).nextElementSibling?.textContent;
    expect(tile('Completed tasks')).toBe('1');
    expect(tile('Open tasks')).toBe('1');
    expect(tile('Closed bugs')).toBe('1');
    expect(tile('Active projects')).toBe('1');
    expect(within(card).getByText('+1 completed in the last 7 days')).toBeInTheDocument();
    await user.click(within(card).getByRole('link', { name: /View all/ }));
    expect(await screen.findByRole('heading', { name: 'Statistics', level: 1 })).toBeInTheDocument();
  });
});
