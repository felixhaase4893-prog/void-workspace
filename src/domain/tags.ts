import { createId as randomId } from '../lib/id';
import { err, ok, type Result } from '../lib/result';
import {
  MAX_TAG_NAME_LENGTH,
  MAX_TAGS,
  MAX_TAGS_PER_ITEM,
  TAG_COLORS,
  normalizeTagName,
  tagKey,
  type EntityType,
  type Tag,
  type TagColor,
  type TagSelection,
  type Workspace,
} from './models';
import { t } from '../i18n/translate';

/**
 * Pure tag logic. Tags live once in `workspace.tags`; items only store tag ids
 * (`tagIds`), so renaming or recolouring a tag never touches the items, and
 * deleting one only removes its id from them.
 */

export interface TagContext {
  now: Date;
  /** Only needed when new tags may be created. Falls back to random ids. */
  createId?: (() => string) | undefined;
}

export type TagError =
  | { kind: 'empty'; message: string }
  | { kind: 'too-long'; message: string }
  | { kind: 'duplicate'; message: string; existingId: string }
  | { kind: 'invalid-color'; message: string }
  | { kind: 'not-found'; message: string }
  | { kind: 'limit'; message: string };

const TAG_ERROR_KINDS: ReadonlySet<string> = new Set<TagError['kind']>(['empty', 'too-long', 'duplicate', 'invalid-color', 'not-found', 'limit']);

/** Tells a refused tag change apart from a storage failure. */
export function isTagError(error: { kind: string }): error is TagError {
  return TAG_ERROR_KINDS.has(error.kind);
}

export interface TagInput {
  name: string;
  color: TagColor | null;
}

export function isTagColor(value: unknown): value is TagColor {
  return typeof value === 'string' && (TAG_COLORS as readonly string[]).includes(value);
}

export function findTagByName(tags: readonly Tag[], name: string): Tag | undefined {
  const key = tagKey(name);
  return tags.find((tag) => tagKey(tag.name) === key);
}

/** Returns the normalized name, or why it cannot be used. `exceptId` is the tag being renamed. */
export function validateTagName(tags: readonly Tag[], rawName: unknown, exceptId: string | null = null): Result<string, TagError> {
  const name = typeof rawName === 'string' ? normalizeTagName(rawName) : '';
  if (name === '') return err({ kind: 'empty', message: t('Tag names cannot be empty.') });
  if (name.length > MAX_TAG_NAME_LENGTH) {
    return err({ kind: 'too-long', message: t('Tag names must be at most {max} characters.', { max: MAX_TAG_NAME_LENGTH }) });
  }
  const existing = findTagByName(tags, name);
  if (existing && existing.id !== exceptId) {
    return err({ kind: 'duplicate', message: t('A tag called “{name}” already exists.', { name: existing.name }), existingId: existing.id });
  }
  return ok(name);
}

function validateInput(tags: readonly Tag[], input: TagInput, exceptId: string | null): Result<TagInput, TagError> {
  const name = validateTagName(tags, input.name, exceptId);
  if (!name.ok) return name;
  if (input.color !== null && !isTagColor(input.color)) {
    return err({ kind: 'invalid-color', message: t('Choose one of the offered colours.') });
  }
  return ok({ name: name.value, color: input.color });
}

/* ---------- Managing tags ---------- */

export function createTag(workspace: Workspace, input: TagInput, context: TagContext): Result<{ workspace: Workspace; tag: Tag }, TagError> {
  if (workspace.tags.length >= MAX_TAGS) return err({ kind: 'limit', message: t('VOID supports up to {max} tags.', { max: MAX_TAGS }) });
  const valid = validateInput(workspace.tags, input, null);
  if (!valid.ok) return valid;
  const iso = context.now.toISOString();
  const tag: Tag = { id: (context.createId ?? randomId)(), createdAt: iso, updatedAt: iso, ...valid.value };
  return ok({ workspace: { ...workspace, tags: [...workspace.tags, tag] }, tag });
}

/** Renames and/or recolours a tag. Every item keeps it, because items only store the id. */
export function updateTag(workspace: Workspace, tagId: string, input: TagInput, context: Pick<TagContext, 'now'>): Result<Workspace, TagError> {
  const current = workspace.tags.find((tag) => tag.id === tagId);
  if (!current) return err({ kind: 'not-found', message: t('This tag no longer exists.') });
  const valid = validateInput(workspace.tags, input, tagId);
  if (!valid.ok) return valid;
  if (valid.value.name === current.name && valid.value.color === current.color) return ok(workspace);
  const updated: Tag = { ...current, ...valid.value, updatedAt: context.now.toISOString() };
  return ok({ ...workspace, tags: workspace.tags.map((tag) => (tag.id === tagId ? updated : tag)) });
}

/**
 * Deletes a tag and removes it from every item. The items themselves stay
 * untouched otherwise (their `updatedAt` too: losing a label is not an edit).
 */
export function deleteTag(workspace: Workspace, tagId: string): Workspace {
  if (!workspace.tags.some((tag) => tag.id === tagId)) return workspace;
  const strip = <T extends { tagIds: string[] }>(items: T[]): T[] =>
    items.map((item) => (item.tagIds.includes(tagId) ? { ...item, tagIds: item.tagIds.filter((id) => id !== tagId) } : item));
  return {
    ...workspace,
    tags: workspace.tags.filter((tag) => tag.id !== tagId),
    projects: strip(workspace.projects),
    tasks: strip(workspace.tasks),
    notes: strip(workspace.notes),
    snippets: strip(workspace.snippets),
    bugs: strip(workspace.bugs),
  };
}

/**
 * Turns what a form picked into tag ids. Known ids are kept, ids of tags that
 * were deleted meanwhile are dropped, and new names reuse an existing tag with
 * the same name (case-insensitive) or create it. Returns the workspace with any
 * new tags, so the item and its new tags are saved in one step.
 */
export function resolveTagSelection(
  workspace: Workspace,
  selection: readonly TagSelection[],
  context: TagContext,
): { workspace: Workspace; tagIds: string[] } {
  let tags = workspace.tags;
  const tagIds: string[] = [];
  const add = (id: string) => {
    if (!tagIds.includes(id) && tagIds.length < MAX_TAGS_PER_ITEM) tagIds.push(id);
  };

  for (const choice of selection) {
    if ('id' in choice) {
      if (tags.some((tag) => tag.id === choice.id)) add(choice.id);
      continue;
    }
    const existing = findTagByName(tags, choice.name);
    if (existing) {
      add(existing.id);
      continue;
    }
    const created = createTag({ ...workspace, tags }, { name: choice.name, color: null }, context);
    if (created.ok) {
      tags = created.value.workspace.tags;
      add(created.value.tag.id);
    }
  }
  return { workspace: tags === workspace.tags ? workspace : { ...workspace, tags }, tagIds };
}

/* ---------- Reading tags (shared by pages, search and later filters) ---------- */

export type TagLookup = ReadonlyMap<string, Tag>;

export function createTagLookup(tags: readonly Tag[]): TagLookup {
  return new Map(tags.map((tag) => [tag.id, tag]));
}

/** The tags of an item, in its own order. Ids without a tag are skipped. */
export function getTagsFor(lookup: TagLookup, tagIds: readonly string[] | undefined): Tag[] {
  if (!tagIds) return [];
  const result: Tag[] = [];
  for (const id of tagIds) {
    const tag = lookup.get(id);
    if (tag) result.push(tag);
  }
  return result;
}

export function hasTag(item: { tagIds: readonly string[] }, tagId: string): boolean {
  return item.tagIds.includes(tagId);
}

export function sortTagsByName<T extends { name: string }>(tags: readonly T[]): T[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export interface TagUsage {
  total: number;
  byType: Record<EntityType, number>;
}

/** How often each tag is used, per content type. One pass over the workspace. */
export function countTagUsage(workspace: Workspace): Map<string, TagUsage> {
  const usage = new Map<string, TagUsage>(
    workspace.tags.map((tag) => [tag.id, { total: 0, byType: { project: 0, task: 0, note: 0, snippet: 0, bug: 0 } }]),
  );
  const count = (type: EntityType, items: ReadonlyArray<{ tagIds: readonly string[] }>) => {
    for (const item of items) {
      for (const id of item.tagIds) {
        const entry = usage.get(id);
        if (!entry) continue;
        entry.total += 1;
        entry.byType[type] += 1;
      }
    }
  };
  count('project', workspace.projects);
  count('task', workspace.tasks);
  count('note', workspace.notes);
  count('snippet', workspace.snippets);
  count('bug', workspace.bugs);
  return usage;
}

/* ---------- Repairs used when importing files ---------- */

function remapItems<T extends { tagIds: string[] }>(items: T[], map: (ids: string[]) => string[]): T[] {
  return items.map((item) => {
    const next = map(item.tagIds);
    return next.length === item.tagIds.length && next.every((id, index) => id === item.tagIds[index]) ? item : { ...item, tagIds: next };
  });
}

/** Applies `map` to the tag ids of every item. */
export function mapItemTagIds(workspace: Workspace, map: (ids: string[]) => string[]): Workspace {
  return {
    ...workspace,
    projects: remapItems(workspace.projects, map),
    tasks: remapItems(workspace.tasks, map),
    notes: remapItems(workspace.notes, map),
    snippets: remapItems(workspace.snippets, map),
    bugs: remapItems(workspace.bugs, map),
  };
}

/**
 * Several tags with the same name (case-insensitive) are merged into the
 * first one; items that used the others now use it. Nothing is lost.
 */
export function mergeDuplicateTags(workspace: Workspace): { workspace: Workspace; merged: number } {
  const firstByKey = new Map<string, string>();
  const replacements = new Map<string, string>();
  const tags: Tag[] = [];
  for (const tag of workspace.tags) {
    const key = tagKey(tag.name);
    const first = firstByKey.get(key);
    if (first === undefined) {
      firstByKey.set(key, tag.id);
      tags.push(tag);
    } else {
      replacements.set(tag.id, first);
    }
  }
  if (replacements.size === 0) return { workspace, merged: 0 };
  const merged = mapItemTagIds({ ...workspace, tags }, (ids) => Array.from(new Set(ids.map((id) => replacements.get(id) ?? id))));
  return { workspace: merged, merged: replacements.size };
}

/** Removes tag ids that point to no tag. Returns how many references were removed. */
export function removeUnknownTagIds(workspace: Workspace): { workspace: Workspace; removed: number } {
  const known = new Set(workspace.tags.map((tag) => tag.id));
  let removed = 0;
  const next = mapItemTagIds(workspace, (ids) => {
    const kept = ids.filter((id) => known.has(id));
    removed += ids.length - kept.length;
    return kept;
  });
  return { workspace: removed === 0 ? workspace : next, removed };
}
