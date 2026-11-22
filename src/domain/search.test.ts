import { describe, expect, it } from 'vitest';

import { makeNote, makeProject, makeSnippet, makeTag, makeTask, makeWorkspace } from '../test/fixtures';
import { buildSearchIndex, highlightSegments, MAX_INDEXED_FIELD_LENGTH, parseQuery, search } from './search';
import type { Workspace } from './models';

const workspace = makeWorkspace({
  projects: [
    makeProject({ id: 'p-obby', name: 'Obby Rush', description: 'Parkour game for Roblox', technologies: ['Luau', 'Rojo'] }),
    makeProject({ id: 'p-site', name: 'Portfolio Site', kind: 'web', technologies: ['React', 'Vite'], updatedAt: '2026-01-16T10:00:00.000Z' }),
  ],
  tasks: [
    makeTask({ id: 't-jump', title: 'Fix jump buffering', projectId: 'p-obby', priority: 'high', status: 'in_progress' }),
    makeTask({ id: 't-deploy', title: 'Deploy portfolio', description: 'Use the Vite preview first', projectId: 'p-site' }),
  ],
  notes: [
    makeNote({ id: 'n-save', title: 'Save system', content: 'Use DataStore2 with session locking.', projectId: 'p-obby' }),
    makeNote({ id: 'n-ideas', title: 'Ideas', content: 'A level editor would be fun.' }),
  ],
  snippets: [
    makeSnippet({ id: 's-debounce', title: 'Debounce', language: 'TypeScript', code: 'export function debounce(fn) { return fn; }', projectId: 'p-site' }),
    makeSnippet({ id: 's-tween', title: 'Tween helper', language: 'Luau', code: 'local TweenService = game:GetService("TweenService")' }),
  ],
});

const index = buildSearchIndex(workspace);
const ids = (query: string) => search(index, query).groups.flatMap((group) => group.results.map((result) => result.id));

describe('parseQuery', () => {
  it('trims, lowercases, splits and removes duplicate terms', () => {
    expect(parseQuery('  React  HOOK react ')).toEqual(['react', 'hook']);
  });

  it('treats empty, whitespace-only and non-string queries as no terms', () => {
    expect(parseQuery('')).toEqual([]);
    expect(parseQuery('   \t\n ')).toEqual([]);
    expect(parseQuery(undefined)).toEqual([]);
    expect(parseQuery(42)).toEqual([]);
  });
});

describe('search', () => {
  it('returns nothing for empty and whitespace-only queries', () => {
    expect(search(index, '')).toEqual({ terms: [], groups: [], total: 0 });
    expect(search(index, '    ')).toEqual({ terms: [], groups: [], total: 0 });
  });

  it('finds projects by name, description and technologies', () => {
    expect(ids('obby')).toContain('p-obby');
    expect(ids('parkour')).toEqual(['p-obby']);
    expect(ids('rojo')).toEqual(['p-obby']);
  });

  it('finds tasks by title, description, status, priority and project', () => {
    expect(ids('jump')).toEqual(['t-jump']);
    expect(ids('preview')).toEqual(['t-deploy']);
    expect(ids('in progress')).toEqual(['t-jump']);
    expect(search(index, 'high').groups.find((group) => group.type === 'task')?.results.map((r) => r.id)).toEqual(['t-jump']);
    expect(search(index, 'fix obby').groups.map((group) => group.type)).toEqual(['task']);
  });

  it('finds notes by title and content', () => {
    expect(ids('save system')).toEqual(['n-save']);
    expect(ids('level editor')).toEqual(['n-ideas']);
  });

  it('finds snippets by title, language and code', () => {
    expect(ids('debounce')).toEqual(['s-debounce']);
    expect(ids('getservice')).toEqual(['s-tween']);
    expect(search(index, 'typescript').groups.find((group) => group.type === 'snippet')?.results.map((r) => r.id)).toEqual(['s-debounce']);
  });

  it('ignores case and matches parts of words', () => {
    expect(ids('OBBY')).toEqual(ids('obby'));
    expect(ids('Datast')).toEqual(['n-save']);
    expect(ids('tween')).toEqual(['s-tween']);
  });

  it('requires every term to match and ignores their order', () => {
    expect(ids('locking datastore')).toEqual(['n-save']);
    expect(ids('datastore nonsense')).toEqual([]);
  });

  it('groups results by type in a fixed order and ranks title matches first', () => {
    const result = search(index, 'portfolio');
    // The snippet only matches through its project's name.
    expect(result.groups.map((group) => group.type)).toEqual(['project', 'task', 'snippet']);
    expect(result.total).toBe(3);

    const luau = search(index, 'luau');
    expect(luau.groups.map((group) => group.type)).toEqual(['project', 'snippet']);
  });

  it('returns each item only once, even if several terms and fields match', () => {
    const result = search(index, 'obby obby rush rush');
    const keys = result.groups.flatMap((group) => group.results.map((r) => `${r.type}:${r.id}`));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('adds the project name and a context excerpt with its field label', () => {
    const [note] = search(index, 'locking').groups[0]?.results ?? [];
    expect(note).toMatchObject({ id: 'n-save', projectName: 'Obby Rush', contextLabel: 'Content' });
    expect(note?.context).toContain('session locking');

    const [snippet] = search(index, 'getservice').groups[0]?.results ?? [];
    expect(snippet).toMatchObject({ contextLabel: 'Code' });
  });

  it('limits results per type but still reports the total', () => {
    const many = makeWorkspace({ notes: Array.from({ length: 10 }, (_, n) => makeNote({ id: `n-${n}`, title: `Note ${n}` })) });
    const result = search(buildSearchIndex(many), 'note', { limitPerType: 3 });
    expect(result.groups[0]?.results).toHaveLength(3);
    expect(result.groups[0]?.total).toBe(10);
    expect(result.total).toBe(10);
  });
});

describe('buildSearchIndex', () => {
  it('handles missing optional fields and broken data without throwing', () => {
    const broken = {
      projects: [{ ...makeProject({ id: 'p' }), description: undefined, technologies: undefined, links: undefined }],
      tasks: [{ ...makeTask({ id: 't', projectId: 'missing-project' }), description: null }],
      notes: [null, { ...makeNote({ id: 'n' }), content: undefined }],
      snippets: undefined,
    } as unknown as Partial<Workspace>;

    const brokenIndex = buildSearchIndex(broken);
    expect(brokenIndex.map((item) => item.id)).toEqual(['p', 't', 'n']);
    expect(search(brokenIndex, 'jump').groups[0]?.results[0]).toMatchObject({ id: 't', projectName: null });
    expect(buildSearchIndex(null)).toEqual([]);
    expect(buildSearchIndex(makeWorkspace())).toEqual([]);
  });

  it('caps very long text so huge snippets stay cheap to search', () => {
    const code = `${'x'.repeat(MAX_INDEXED_FIELD_LENGTH)}needle`;
    const longIndex = buildSearchIndex(makeWorkspace({ snippets: [makeSnippet({ code })] }));
    expect(search(longIndex, 'needle').total).toBe(0);
    expect(search(longIndex, 'xxx').total).toBe(1);
  });
});

describe('highlightSegments', () => {
  it('marks every case-insensitive occurrence and merges overlaps', () => {
    expect(highlightSegments('Obby obby', ['obby'])).toEqual([
      { text: 'Obby', match: true },
      { text: ' ', match: false },
      { text: 'obby', match: true },
    ]);
    expect(highlightSegments('Debounce', ['deb', 'bou'])).toEqual([
      { text: 'Debou', match: true },
      { text: 'nce', match: false },
    ]);
  });

  it('returns plain text when nothing matches', () => {
    expect(highlightSegments('Hello', ['xyz'])).toEqual([{ text: 'Hello', match: false }]);
    expect(highlightSegments('Hello', [])).toEqual([{ text: 'Hello', match: false }]);
    expect(highlightSegments('', ['a'])).toEqual([]);
  });
});

describe('tags in search', () => {
  const tagged = makeWorkspace({
    tags: [makeTag({ id: 'tag-perf', name: 'Performance' }), makeTag({ id: 'tag-ui', name: 'UI' })],
    projects: [makeProject({ id: 'p-1', name: 'Engine', tagIds: ['tag-perf'] })],
    tasks: [makeTask({ id: 't-1', title: 'Profile frame time', tagIds: ['tag-perf', 'tag-ui'] })],
    notes: [makeNote({ id: 'n-1', title: 'Layout', tagIds: ['tag-ui'] })],
    snippets: [makeSnippet({ id: 's-1', title: 'Pool', tagIds: ['tag-perf', 'stale'] })],
  });

  it('finds every kind of item by tag name and returns its current tag ids', () => {
    const results = search(buildSearchIndex(tagged), 'perform');
    expect(results.groups.flatMap((group) => group.results.map((result) => result.id))).toEqual(['p-1', 't-1', 's-1']);
    // Stale references never show up.
    expect(results.groups.find((group) => group.type === 'snippet')?.results[0]?.tagIds).toEqual(['tag-perf']);
    // Tags are shown as chips, not repeated as context.
    expect(results.groups[0]?.results[0]?.contextLabel).toBeNull();
  });

  it('combines tag names with other terms', () => {
    expect(search(buildSearchIndex(tagged), 'ui frame').total).toBe(1);
  });

  it('reflects renamed and deleted tags once the index is rebuilt', () => {
    const renamed = { ...tagged, tags: [makeTag({ id: 'tag-perf', name: 'Speed' }), makeTag({ id: 'tag-ui', name: 'UI' })] };
    expect(search(buildSearchIndex(renamed), 'performance').total).toBe(0);
    expect(search(buildSearchIndex(renamed), 'speed').total).toBe(3);
    const deleted = { ...tagged, tags: [makeTag({ id: 'tag-ui', name: 'UI' })] };
    expect(search(buildSearchIndex(deleted), 'performance').total).toBe(0);
  });

  it('tolerates missing or malformed tag data', () => {
    expect(() => buildSearchIndex({ ...tagged, tags: undefined } as unknown as Workspace)).not.toThrow();
    expect(() => buildSearchIndex({ ...tagged, tags: [null] } as unknown as Workspace)).not.toThrow();
  });
});
