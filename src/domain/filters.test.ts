import { describe, expect, it } from 'vitest';

import { makeNote, makeProject, makeSnippet, makeTag, makeTask, makeWorkspace } from '../test/fixtures';
import {
  EMPTY_FILTERS,
  NO_LANGUAGE,
  NO_PROJECT,
  clearFilterField,
  countActiveFilters,
  filterItems,
  getFilterOptions,
  getFilterValueLabel,
  hasActiveFilters,
  pruneFilters,
  removeFilterValue,
  toggleFilterValue,
  type FilterField,
  type ListFilters,
} from './filters';
import type { EntityType, Workspace } from './models';
import { deleteProject } from './workspace';

const workspace: Workspace = makeWorkspace({
  tags: [makeTag({ id: 'tag-roblox', name: 'Roblox' }), makeTag({ id: 'tag-ui', name: 'UI' }), makeTag({ id: 'tag-unused', name: 'Unused' })],
  projects: [
    makeProject({ id: 'void', name: 'VOID', status: 'active', tagIds: ['tag-ui'], favorite: true }),
    makeProject({ id: 'obby', name: 'Obby Rush', status: 'paused', tagIds: ['tag-roblox'] }),
    makeProject({ id: 'old', name: 'Old site', status: 'archived', kind: 'web' }),
  ],
  tasks: [
    makeTask({ id: 't1', title: 'Filter bar', projectId: 'void', status: 'in_progress', priority: 'high', tagIds: ['tag-roblox'], favorite: true }),
    makeTask({ id: 't2', title: 'Spawn pads', projectId: 'void', status: 'in_progress', priority: 'high', tagIds: ['tag-roblox'] }),
    makeTask({ id: 't3', title: 'Jump buffer', projectId: 'obby', status: 'todo', priority: 'low', tagIds: ['tag-ui'] }),
    makeTask({ id: 't4', title: 'Taxes', projectId: null, status: 'done', priority: 'medium' }),
  ],
  notes: [
    makeNote({ id: 'n1', title: 'Architecture', projectId: 'void', tagIds: ['tag-ui'] }),
    makeNote({ id: 'n2', title: 'Loose idea', projectId: null, favorite: true }),
  ],
  snippets: [
    makeSnippet({ id: 's1', title: 'Debounce', language: 'TypeScript', projectId: 'void' }),
    makeSnippet({ id: 's2', title: 'Hook', language: ' typescript ', projectId: null, favorite: true, tagIds: ['tag-ui'] }),
    makeSnippet({ id: 's3', title: 'Tween', language: 'Luau', projectId: 'obby' }),
  ],
});

const ids = (type: EntityType, filters: ListFilters, ws: Workspace = workspace) => filterItems(ws, type, filters).map((item) => item.id);
const withValues = (values: Partial<Record<FilterField, string[]>>, extra: Partial<ListFilters> = {}): ListFilters => ({ ...EMPTY_FILTERS, values, ...extra });

describe('filterItems', () => {
  it('shows everything without filters, in the original order', () => {
    expect(ids('task', EMPTY_FILTERS)).toEqual(['t1', 't2', 't3', 't4']);
    expect(ids('project', withValues({ status: [], tag: [] }))).toEqual(['void', 'obby', 'old']);
  });

  it('filters projects by status (several statuses = either)', () => {
    expect(ids('project', withValues({ status: ['paused'] }))).toEqual(['obby']);
    expect(ids('project', withValues({ status: ['active', 'archived'] }))).toEqual(['void', 'old']);
  });

  it('filters projects by tags and leaves out projects without tags', () => {
    expect(ids('project', withValues({ tag: ['tag-roblox'] }))).toEqual(['obby']);
    expect(ids('project', withValues({ tag: ['tag-roblox', 'tag-ui'] }))).toEqual(['void', 'obby']);
  });

  it('filters tasks by status and by priority', () => {
    expect(ids('task', withValues({ status: ['in_progress'] }))).toEqual(['t1', 't2']);
    expect(ids('task', withValues({ status: ['todo', 'done'] }))).toEqual(['t3', 't4']);
    expect(ids('task', withValues({ priority: ['low', 'medium'] }))).toEqual(['t3', 't4']);
  });

  it('filters by project, including items without a project', () => {
    expect(ids('task', withValues({ project: ['obby'] }))).toEqual(['t3']);
    expect(ids('task', withValues({ project: [NO_PROJECT] }))).toEqual(['t4']);
    expect(ids('note', withValues({ project: [NO_PROJECT] }))).toEqual(['n2']);
    expect(ids('snippet', withValues({ project: ['void', NO_PROJECT] }))).toEqual(['s1', 's2']);
  });

  it('filters notes by project and tags together', () => {
    expect(ids('note', withValues({ project: ['void'], tag: ['tag-ui'] }))).toEqual(['n1']);
    expect(ids('note', withValues({ project: [NO_PROJECT], tag: ['tag-ui'] }))).toEqual([]);
  });

  it('filters snippets by language, ignoring case and stray spaces', () => {
    expect(ids('snippet', withValues({ language: ['typescript'] }))).toEqual(['s1', 's2']);
    expect(ids('snippet', withValues({ language: ['luau'] }))).toEqual(['s3']);
  });

  it.each<[EntityType, string[]]>([
    ['project', ['void']],
    ['task', ['t1']],
    ['note', ['n2']],
    ['snippet', ['s2']],
  ])('shows only favourite %ss', (type, expected) => {
    expect(ids(type, { ...EMPTY_FILTERS, favoritesOnly: true })).toEqual(expected);
  });

  it('combines different criteria with AND', () => {
    const filters = withValues({ status: ['in_progress'], priority: ['high'], project: ['void'], tag: ['tag-roblox'] });
    expect(ids('task', filters)).toEqual(['t1', 't2']);
    expect(ids('task', { ...filters, favoritesOnly: true })).toEqual(['t1']);
    expect(ids('task', { ...filters, values: { ...filters.values, priority: ['low'] } })).toEqual([]);
  });

  it('works together with the text search and never contradicts it', () => {
    expect(ids('task', { ...EMPTY_FILTERS, query: 'spawn' })).toEqual(['t2']);
    // Matches project names and tags too, exactly like the global search.
    expect(ids('task', { ...EMPTY_FILTERS, query: 'obby' })).toEqual(['t3']);
    expect(ids('task', { ...withValues({ status: ['in_progress'] }), query: 'roblox' })).toEqual(['t1', 't2']);
    expect(ids('task', { ...withValues({ status: ['todo'] }), query: 'spawn' })).toEqual([]);
    // Only items of the list itself: a project called "VOID" does not show up among snippets.
    expect(ids('snippet', { ...EMPTY_FILTERS, query: 'tween' })).toEqual(['s3']);
    expect(ids('task', { ...EMPTY_FILTERS, query: '   ' })).toEqual(['t1', 't2', 't3', 't4']);
  });

  it('copes with items that lack optional fields or have odd values', () => {
    const odd = makeWorkspace({
      tasks: [{ ...makeTask({ id: 'x' }), tagIds: undefined, projectId: undefined } as unknown as Workspace['tasks'][number]],
      snippets: [{ ...makeSnippet({ id: 'y' }), language: undefined } as unknown as Workspace['snippets'][number]],
    });
    expect(ids('task', withValues({ tag: ['tag-ui'] }), odd)).toEqual([]);
    expect(ids('task', withValues({ project: [NO_PROJECT] }), odd)).toEqual(['x']);
    expect(ids('snippet', withValues({ language: [NO_LANGUAGE] }), odd)).toEqual(['y']);
    expect(getFilterOptions(odd, 'snippet').language).toEqual([{ value: NO_LANGUAGE, label: 'No language', count: 1 }]);
  });

  it('never changes the workspace', () => {
    const snapshot = structuredClone(workspace);
    filterItems(workspace, 'task', withValues({ status: ['done'] }, { favoritesOnly: true, query: 'x' }));
    expect(workspace).toEqual(snapshot);
  });

  it('returns an empty list for an empty workspace', () => {
    expect(ids('note', withValues({ tag: ['tag-ui'] }), makeWorkspace())).toEqual([]);
  });
});

describe('changing filters', () => {
  it('toggles, removes and clears single values', () => {
    let filters = toggleFilterValue(EMPTY_FILTERS, 'tag', 'tag-ui');
    filters = toggleFilterValue(filters, 'tag', 'tag-roblox');
    filters = toggleFilterValue(filters, 'status', 'done');
    expect(filters.values).toEqual({ tag: ['tag-ui', 'tag-roblox'], status: ['done'] });
    expect(toggleFilterValue(filters, 'tag', 'tag-ui').values.tag).toEqual(['tag-roblox']);
    expect(removeFilterValue(filters, 'tag', 'tag-roblox').values.tag).toEqual(['tag-ui']);
    expect(clearFilterField(filters, 'tag').values).toEqual({ tag: [], status: ['done'] });
    expect(EMPTY_FILTERS.values).toEqual({});
  });

  it('counts active filters, including favourites and the search text', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(countActiveFilters({ values: { tag: ['a', 'b'], status: [] }, favoritesOnly: true, query: ' hook ' })).toBe(4);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: '   ' })).toBe(false);
  });

  it('drops values that refer to deleted projects or tags', () => {
    const filters = withValues({ project: ['obby', NO_PROJECT], tag: ['tag-ui', 'tag-gone'], status: ['todo'] });
    const pruned = pruneFilters(deleteProject(workspace, 'obby', { deleteContents: false }, { now: new Date() }), filters);
    expect(pruned.values).toEqual({ project: [NO_PROJECT], tag: ['tag-ui'], status: ['todo'] });
    const clean = withValues({ tag: ['tag-ui'] });
    expect(pruneFilters(workspace, clean)).toBe(clean);
  });
});

describe('getFilterOptions', () => {
  it('offers every real status and priority with counts', () => {
    const options = getFilterOptions(workspace, 'task');
    expect(options.status).toEqual([
      { value: 'todo', label: 'To do', count: 1 },
      { value: 'in_progress', label: 'In progress', count: 2 },
      { value: 'done', label: 'Done', count: 1 },
    ]);
    expect(options.priority?.map((option) => [option.value, option.count])).toEqual([
      ['high', 2],
      ['medium', 1],
      ['low', 1],
    ]);
    expect(getFilterOptions(workspace, 'project').status?.map((option) => option.value)).toEqual(['active', 'paused', 'archived']);
  });

  it('offers only projects and tags that the list uses, sorted by name, plus "No project"', () => {
    const options = getFilterOptions(workspace, 'task');
    expect(options.project).toEqual([
      { value: 'obby', label: 'Obby Rush', count: 1 },
      { value: 'void', label: 'VOID', count: 2 },
      { value: NO_PROJECT, label: 'No project', count: 1 },
    ]);
    expect(options.tag?.map((option) => option.label)).toEqual(['Roblox', 'UI']);
    expect(getFilterOptions(workspace, 'project').project).toBeUndefined();
  });

  it('keeps selected values available even when nothing uses them any more', () => {
    const options = getFilterOptions(workspace, 'note', withValues({ tag: ['tag-unused'] }));
    expect(options.tag).toContainEqual({ value: 'tag-unused', label: 'Unused', count: 0 });
  });

  it('groups languages and shows their most common spelling', () => {
    expect(getFilterOptions(workspace, 'snippet').language).toEqual([
      { value: 'luau', label: 'Luau', count: 1 },
      { value: 'typescript', label: 'TypeScript', count: 2 },
    ]);
  });

  it('labels values that no longer exist', () => {
    const options = getFilterOptions(workspace, 'task');
    expect(getFilterValueLabel(options, 'project', 'void')).toBe('VOID');
    expect(getFilterValueLabel(options, 'project', 'gone')).toBe('Deleted project');
    expect(getFilterValueLabel(options, 'tag', 'gone')).toBe('Deleted tag');
    expect(getFilterValueLabel(options, 'project', NO_PROJECT)).toBe('No project');
  });
});
