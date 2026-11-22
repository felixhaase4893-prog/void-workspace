import { describe, expect, it } from 'vitest';

import { FIXED_NOW, makeNote, makeProject, makeSnippet, makeTag, makeTask, makeWorkspace, sequentialIds } from '../test/fixtures';
import { MAX_TAGS_PER_ITEM, noteInputSchema, projectInputSchema, tagKey, taskInputSchema, workspaceSchema } from './models';
import {
  countTagUsage,
  createTag,
  createTagLookup,
  deleteTag,
  getTagsFor,
  mergeDuplicateTags,
  removeUnknownTagIds,
  resolveTagSelection,
  updateTag,
  validateTagName,
} from './tags';
import { addNote, addProject, addTask, updateTask } from './workspace';

const context = () => ({ now: FIXED_NOW, createId: sequentialIds('tag') });
const later = { now: new Date('2026-02-01T00:00:00.000Z') };

const frontend = makeTag({ id: 'tag-frontend', name: 'Frontend', color: 'blue' });
const bug = makeTag({ id: 'tag-bug', name: 'Bug', color: 'red' });

/** A workspace where both tags are used by several kinds of items. */
const tagged = () =>
  makeWorkspace({
    tags: [frontend, bug],
    projects: [makeProject({ tagIds: ['tag-frontend'] })],
    tasks: [makeTask({ tagIds: ['tag-frontend', 'tag-bug'] }), makeTask({ id: 'task-2', tagIds: ['tag-bug'] })],
    notes: [makeNote({ tagIds: ['tag-frontend'] })],
    snippets: [makeSnippet()],
  });

describe('tag names', () => {
  it('compares names case-insensitively and ignores extra whitespace', () => {
    expect(tagKey('  Game   Jam ')).toBe('game jam');
    expect(tagKey('UI')).toBe(tagKey('ui'));
  });

  it('rejects empty, whitespace-only and overly long names', () => {
    expect(validateTagName([], '')).toMatchObject({ ok: false, error: { kind: 'empty' } });
    expect(validateTagName([], '    ')).toMatchObject({ ok: false, error: { kind: 'empty' } });
    expect(validateTagName([], 'x'.repeat(41))).toMatchObject({ ok: false, error: { kind: 'too-long' } });
    expect(validateTagName([], 42)).toMatchObject({ ok: false, error: { kind: 'empty' } });
    expect(validateTagName([], '  Later  ')).toEqual({ ok: true, value: 'Later' });
  });

  it('rejects a name that exists in another spelling, but allows recasing the same tag', () => {
    expect(validateTagName([frontend], 'FRONTEND')).toMatchObject({ ok: false, error: { kind: 'duplicate', existingId: 'tag-frontend' } });
    expect(validateTagName([frontend], 'FrontEnd', 'tag-frontend')).toEqual({ ok: true, value: 'FrontEnd' });
  });
});

describe('managing tags', () => {
  it('creates a tag with a stable id and keeps the chosen spelling', () => {
    const result = createTag(makeWorkspace(), { name: ' Roblox ', color: 'green' }, context());
    expect(result).toMatchObject({ ok: true, value: { tag: { id: 'tag-1', name: 'Roblox', color: 'green', createdAt: FIXED_NOW.toISOString() } } });
    if (result.ok) expect(result.value.workspace.tags).toHaveLength(1);
  });

  it('does not create duplicates, whatever the case', () => {
    expect(createTag(tagged(), { name: 'bug', color: null }, context())).toMatchObject({ ok: false, error: { kind: 'duplicate' } });
  });

  it('rejects colours outside the palette', () => {
    // @ts-expect-error: an invalid colour, as it could arrive from outside the type system
    expect(createTag(makeWorkspace(), { name: 'UI', color: 'neon' }, context())).toMatchObject({ ok: false, error: { kind: 'invalid-color' } });
  });

  it('renames a tag and every item keeps it', () => {
    const result = updateTag(tagged(), 'tag-bug', { name: 'Bugfix', color: 'orange' }, later);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.tags.find((tag) => tag.id === 'tag-bug')).toMatchObject({ name: 'Bugfix', color: 'orange', updatedAt: later.now.toISOString() });
    expect(result.value.tasks.map((task) => task.tagIds)).toEqual([['tag-frontend', 'tag-bug'], ['tag-bug']]);
  });

  it('refuses to rename a tag to the name of another tag or to update a missing tag', () => {
    expect(updateTag(tagged(), 'tag-bug', { name: 'frontend', color: null }, later)).toMatchObject({ ok: false, error: { kind: 'duplicate' } });
    expect(updateTag(tagged(), 'gone', { name: 'X', color: null }, later)).toMatchObject({ ok: false, error: { kind: 'not-found' } });
  });

  it('returns the same workspace when nothing changed', () => {
    const workspace = tagged();
    expect(updateTag(workspace, 'tag-bug', { name: 'Bug', color: 'red' }, later)).toEqual({ ok: true, value: workspace });
  });

  it('deletes a tag, removes it from all items and keeps the items', () => {
    const next = deleteTag(tagged(), 'tag-frontend');
    expect(next.tags.map((tag) => tag.id)).toEqual(['tag-bug']);
    expect(next.projects[0]?.tagIds).toEqual([]);
    expect(next.tasks.map((task) => task.tagIds)).toEqual([['tag-bug'], ['tag-bug']]);
    expect(next.notes[0]?.tagIds).toEqual([]);
    expect(next.projects).toHaveLength(1);
    expect(next.tasks).toHaveLength(2);
    // Losing a label is not an edit.
    expect(next.tasks[0]?.updatedAt).toBe(FIXED_NOW.toISOString());
  });
});

describe('assigning tags', () => {
  it('keeps known ids, drops stale ones, reuses names and creates new tags once', () => {
    const { workspace, tagIds } = resolveTagSelection(
      tagged(),
      [{ id: 'tag-bug' }, { id: 'deleted-meanwhile' }, { name: 'FRONTEND' }, { name: 'Idea' }, { name: 'idea' }, { id: 'tag-bug' }],
      context(),
    );
    expect(tagIds).toEqual(['tag-bug', 'tag-frontend', 'tag-1']);
    expect(workspace.tags.map((tag) => tag.name)).toEqual(['Frontend', 'Bug', 'Idea']);
  });

  it('returns the very same workspace when no tag had to be created', () => {
    const workspace = tagged();
    expect(resolveTagSelection(workspace, [{ id: 'tag-bug' }], context()).workspace).toBe(workspace);
  });

  it('creates items with tags and new tags in one step', () => {
    const input = taskInputSchema.parse({ title: 'A', description: '', projectId: '', priority: 'low', tags: [{ id: 'tag-bug' }, { name: 'Performance' }] });
    const next = addTask(tagged(), input, context());
    expect(next.tasks[0]?.tagIds).toEqual(['tag-bug', 'tag-1']);
    expect(next.tags.map((tag) => tag.name)).toContain('Performance');
  });

  it('lets several items share one tag and an item carry several tags', () => {
    let workspace = addProject(makeWorkspace(), projectInputSchema.parse({ name: 'P', description: '', kind: 'web', tags: [{ name: 'UI' }, { name: 'Later' }] }), context());
    workspace = addNote(workspace, noteInputSchema.parse({ title: 'N', content: '', projectId: '', tags: [{ name: 'ui' }] }), context());
    expect(workspace.tags.map((tag) => tag.name)).toEqual(['UI', 'Later']);
    expect(countTagUsage(workspace).get(workspace.tags[0]!.id)).toEqual({ total: 2, byType: { project: 1, task: 0, note: 1, snippet: 0, bug: 0 } });
  });

  it('changes and removes assignments when editing', () => {
    const input = taskInputSchema.parse({ title: 'A', description: '', projectId: '', priority: 'low', tags: [{ id: 'tag-bug' }] });
    const next = updateTask(tagged(), 'task-1', input, later);
    expect(next.tasks[0]?.tagIds).toEqual(['tag-bug']);
    expect(updateTask(tagged(), 'task-1', { ...input, tags: [] }, later).tasks[0]?.tagIds).toEqual([]);
  });

  it('does not create tags when the edited item no longer exists', () => {
    const input = taskInputSchema.parse({ title: 'A', description: '', projectId: '', priority: 'low', tags: [{ name: 'Orphan' }] });
    expect(updateTask(tagged(), 'missing', input, later).tags).toHaveLength(2);
  });

  it('validates the tag selection of forms', () => {
    const base = { title: 'A', description: '', projectId: '', priority: 'low' };
    expect(taskInputSchema.safeParse({ ...base, tags: [{ name: '   ' }] }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...base, tags: [{ name: 'x'.repeat(41) }] }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_TAGS_PER_ITEM + 1 }, (_, index) => ({ name: `T${index}` }));
    expect(taskInputSchema.safeParse({ ...base, tags: tooMany }).success).toBe(false);
  });
});

describe('reading tags', () => {
  it('returns an item’s tags in its own order and skips unknown ids', () => {
    const lookup = createTagLookup([frontend, bug]);
    expect(getTagsFor(lookup, ['tag-bug', 'nope', 'tag-frontend']).map((tag) => tag.name)).toEqual(['Bug', 'Frontend']);
    expect(getTagsFor(lookup, undefined)).toEqual([]);
  });

  it('counts usage per tag and content type, ignoring stale references', () => {
    const workspace = tagged();
    workspace.snippets[0] = makeSnippet({ tagIds: ['tag-bug', 'stale'] });
    const usage = countTagUsage(workspace);
    expect(usage.get('tag-frontend')).toEqual({ total: 3, byType: { project: 1, task: 1, note: 1, snippet: 0, bug: 0 } });
    expect(usage.get('tag-bug')).toEqual({ total: 3, byType: { project: 0, task: 2, note: 0, snippet: 1, bug: 0 } });
    expect(usage.has('stale')).toBe(false);
  });
});

describe('stored and imported tag data', () => {
  it('accepts older items without tag fields and drops duplicate ids', () => {
    const task: Record<string, unknown> = { ...makeTask() };
    delete task.tagIds;
    const parsed = workspaceSchema.parse({ ...makeWorkspace(), tags: undefined, tasks: [task, makeTask({ id: 'task-2', tagIds: ['a', 'a'] })] });
    expect(parsed.tags).toEqual([]);
    expect(parsed.tasks.map((item) => item.tagIds)).toEqual([[], ['a']]);
  });

  it('falls back to the default colour instead of rejecting a damaged colour', () => {
    const parsed = workspaceSchema.parse({ ...makeWorkspace(), tags: [{ ...frontend, color: '#ff00ff' }] });
    expect(parsed.tags[0]?.color).toBeNull();
  });

  it('rejects tags without a usable name', () => {
    expect(workspaceSchema.safeParse({ ...makeWorkspace(), tags: [{ ...frontend, name: '  ' }] }).success).toBe(false);
  });

  it('merges tags with the same name into the first and moves their items', () => {
    const workspace = makeWorkspace({
      tags: [frontend, makeTag({ id: 'tag-dupe', name: 'frontend' })],
      tasks: [makeTask({ tagIds: ['tag-dupe'] }), makeTask({ id: 'task-2', tagIds: ['tag-frontend', 'tag-dupe'] })],
    });
    const { workspace: merged, merged: count } = mergeDuplicateTags(workspace);
    expect(count).toBe(1);
    expect(merged.tags.map((tag) => tag.id)).toEqual(['tag-frontend']);
    expect(merged.tasks.map((task) => task.tagIds)).toEqual([['tag-frontend'], ['tag-frontend']]);
  });

  it('removes references to tags that do not exist', () => {
    const workspace = makeWorkspace({ tags: [bug], tasks: [makeTask({ tagIds: ['tag-bug', 'gone', 'also-gone'] })] });
    const { workspace: fixed, removed } = removeUnknownTagIds(workspace);
    expect(removed).toBe(2);
    expect(fixed.tasks[0]?.tagIds).toEqual(['tag-bug']);
    expect(removeUnknownTagIds(fixed).workspace).toBe(fixed);
  });
});
