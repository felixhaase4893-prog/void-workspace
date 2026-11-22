import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Workspace } from '../domain/models';
import { WORKSPACE_STORAGE_KEY } from '../storage/keyValueWorkspaceRepository';
import { MemoryKeyValueStore } from '../storage/keyValueStore';
import { makeNote, makeSnippet, makeWorkspace } from '../test/fixtures';
import { renderApp } from '../test/renderApp';

function storeWith(workspace: Workspace) {
  return new MemoryKeyValueStore({ [WORKSPACE_STORAGE_KEY]: JSON.stringify(workspace) });
}

function stored(store: MemoryKeyValueStore): Workspace {
  return JSON.parse(store.getItem(WORKSPACE_STORAGE_KEY) ?? '{}') as Workspace;
}

const MARKDOWN = [
  '# Save system',
  '',
  'Use **DataStore2** and *retry* writes. See [docs](https://create.roblox.com/docs).',
  '',
  '- one',
  '- two',
  '',
  '1. first',
  '2. second',
  '',
  'Call `save()` on exit.',
  '',
  '```lua',
  'local x = 1',
  '```',
  '',
  '[evil](javascript:alert(1)) <script>alert(1)</script>',
].join('\n');

describe('markdown notes', () => {
  it('renders Markdown in note cards, safely', async () => {
    renderApp({ store: storeWith(makeWorkspace({ notes: [makeNote({ title: 'Plan', content: MARKDOWN })] })), route: '/notes' });

    const card = (await screen.findByRole('heading', { name: 'Plan' })).closest('div.flex.h-full') as HTMLElement;
    expect(within(card).getByRole('heading', { name: 'Save system', level: 1 })).toBeInTheDocument();
    expect(within(card).getByText('DataStore2').tagName).toBe('STRONG');
    expect(within(card).getByText('retry').tagName).toBe('EM');
    expect(within(card).getAllByRole('list')).toHaveLength(2);
    expect(within(card).getByText('save()').tagName).toBe('CODE');
    expect(within(card).getByText('local')).toHaveClass('hljs-keyword');

    const link = within(card).getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://create.roblox.com/docs');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));

    // The unsafe link stays text and raw HTML is shown, not executed.
    expect(within(card).queryByRole('link', { name: 'evil' })).not.toBeInTheDocument();
    expect(card.querySelector('script')).toBeNull();
    expect(card).toHaveTextContent('<script>alert(1)</script>');
  });

  it('still shows existing plain-text notes with their line breaks', async () => {
    renderApp({ store: storeWith(makeWorkspace({ notes: [makeNote({ title: 'Old', content: 'Line one\nLine two' })] })), route: '/notes' });
    const card = (await screen.findByRole('heading', { name: 'Old' })).closest('div.flex.h-full') as HTMLElement;
    expect(card).toHaveTextContent('Line oneLine two');
    expect(card.querySelector('br')).not.toBeNull();
  });

  it('writes Markdown with the toolbar, previews it and saves the raw text unchanged', async () => {
    const user = userEvent.setup();
    const store = storeWith(makeWorkspace());
    renderApp({ store, route: '/notes' });

    await user.click((await screen.findAllByRole('button', { name: /new note/i }))[0]!);
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Title'), 'Markdown');
    const content = within(dialog).getByLabelText(/content/i);
    await user.type(content, 'Intro');
    await user.click(within(dialog).getByRole('button', { name: 'Bold' }));
    expect(content).toHaveValue('Intro**bold text**');

    await user.clear(content);
    await user.type(content, '## Heading{enter}{enter}- item');
    await user.click(within(dialog).getByRole('tab', { name: 'Preview' }));
    const preview = within(dialog).getByRole('region', { name: 'Note preview' });
    expect(within(preview).getByRole('heading', { name: 'Heading', level: 2 })).toBeInTheDocument();
    expect(within(preview).getByRole('listitem')).toHaveTextContent('item');
    expect(within(dialog).getByLabelText(/content/i)).not.toBeVisible();

    await user.click(within(dialog).getByRole('tab', { name: 'Write' }));
    expect(within(dialog).getByLabelText(/content/i)).toHaveValue('## Heading\n\n- item');
    await user.click(within(dialog).getByRole('button', { name: 'Create note' }));

    expect(stored(store).notes[0]).toMatchObject({ title: 'Markdown', content: '## Heading\n\n- item' });
  });

  it('opens an existing plain note for editing with its text untouched', async () => {
    const user = userEvent.setup();
    const store = storeWith(makeWorkspace({ notes: [makeNote({ title: 'Old', content: 'a * b * c\nsnake_case_name' })] }));
    renderApp({ store, route: '/notes' });
    await user.click(await screen.findByRole('button', { name: 'Edit Old' }));
    expect(within(screen.getByRole('dialog')).getByLabelText(/content/i)).toHaveValue('a * b * c\nsnake_case_name');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));
    expect(stored(store).notes[0]?.content).toBe('a * b * c\nsnake_case_name');
  });
});

describe('snippet syntax highlighting', () => {
  const longLine = `const value = "${'x'.repeat(400)}";`;
  const snippets = [
    makeSnippet({ id: 's-ts', title: 'TS', language: 'TypeScript', code: 'export const answer: number = 42;' }),
    makeSnippet({ id: 's-py', title: 'PY', language: 'Python', code: 'def run():\n    return None' }),
    makeSnippet({ id: 's-cs', title: 'CS', language: 'C#', code: 'public class Player { }' }),
    makeSnippet({ id: 's-gd', title: 'GD', language: 'GDScript', code: 'extends Node2D' }),
    makeSnippet({ id: 's-long', title: 'Long', language: 'JavaScript', code: longLine }),
  ];

  function codeOf(title: string) {
    const card = screen.getByRole('heading', { name: title }).closest('div.flex.h-full') as HTMLElement;
    return card.querySelector('pre') as HTMLPreElement;
  }

  it('colours code by the snippet language and keeps it exactly as stored', async () => {
    renderApp({ store: storeWith(makeWorkspace({ snippets })), route: '/snippets' });
    await screen.findByRole('heading', { name: 'TS' });

    for (const [title, keyword] of [['TS', 'export'], ['PY', 'def'], ['CS', 'public']] as const) {
      const pre = codeOf(title);
      expect(pre).toHaveAttribute('data-highlighted', 'true');
      expect(within(pre).getByText(keyword)).toHaveClass('hljs-keyword');
    }
    // Unknown language: shown plain, no guessing.
    expect(codeOf('GD')).toHaveAttribute('data-highlighted', 'false');
    for (const snippet of snippets) expect(codeOf(snippet.title).textContent).toBe(snippet.code);
  });

  it('keeps long lines inside the card (scrolls instead of widening the layout)', async () => {
    renderApp({ store: storeWith(makeWorkspace({ snippets })), route: '/snippets' });
    await screen.findByRole('heading', { name: 'Long' });
    const pre = codeOf('Long');
    expect(pre).toHaveClass('min-w-0', 'max-w-full', 'overflow-auto');
    expect(pre.closest('div.flex.h-full')).toHaveClass('min-w-0', 'overflow-hidden');
  });

  it('copies the exact code and still edits it as plain text', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    const store = storeWith(makeWorkspace({ snippets }));
    renderApp({ store, route: '/snippets' });

    await user.click(await screen.findByRole('button', { name: 'Copy PY' }));
    expect(writeText).toHaveBeenCalledWith('def run():\n    return None');

    await user.click(screen.getByRole('button', { name: 'Edit PY' }));
    const code = within(screen.getByRole('dialog')).getByLabelText('Code');
    expect(code).toHaveValue('def run():\n    return None');
    await user.type(code, '{enter}print("ok")');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save changes' }));

    expect(stored(store).snippets.find((snippet) => snippet.id === 's-py')?.code).toBe('def run():\n    return None\nprint("ok")');
    expect(within(codeOf('PY')).getByText('print')).toHaveClass('hljs-built_in');
  });
});
