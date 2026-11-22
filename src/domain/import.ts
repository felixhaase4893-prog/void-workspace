import { tagKey, type Bug, type Note, type Project, type Snippet, type Tag, type Task, type Workspace } from './models';
import { findTagByName, removeUnknownTagIds } from './tags';
import type { OperationContext } from './workspace';

/**
 * Pure logic for importing a validated backup into the current workspace.
 * Parsing and validating the file lives in storage/backup.ts.
 */

/** What happens when an imported item has the same id as an existing one but different content. */
export type ConflictPolicy = 'keep-current' | 'use-imported' | 'keep-both';

export type ImportMode = { kind: 'merge'; conflicts: ConflictPolicy } | { kind: 'replace' };

export const COLLECTIONS = ['projects', 'tasks', 'notes', 'snippets', 'bugs'] as const;
export type Collection = (typeof COLLECTIONS)[number];

export interface CollectionAnalysis {
  /** Items in the file. */
  total: number;
  /** Ids that do not exist yet. */
  added: number;
  /** Same id and exactly the same content: never imported twice. */
  identical: number;
  /** Same id, different content. */
  conflicting: number;
}

/** Tags are analysed like the content collections, but are not counted as items. */
export const ANALYZED_COLLECTIONS = [...COLLECTIONS, 'tags'] as const;
export type AnalyzedCollection = (typeof ANALYZED_COLLECTIONS)[number];

export type ImportAnalysis = Record<AnalyzedCollection, CollectionAnalysis>;

export interface ImportStats {
  added: number;
  replaced: number;
  copied: number;
  skipped: number;
  removed: number;
  /** Tags that did not exist yet (by id or by name). */
  tagsAdded: number;
  /** Existing tags that took the file's name or colour ("use the version from the file"). */
  tagsUpdated: number;
}

/** Key-order independent JSON, so equal items compare equal however they were built. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

type Item = Project | Task | Note | Snippet | Bug;

function classify(current: Item[], item: Item): 'added' | 'identical' | 'conflicting' {
  const existing = current.find((candidate) => candidate.id === item.id);
  if (!existing) return 'added';
  return canonical(existing) === canonical(item) ? 'identical' : 'conflicting';
}

type TagMatch =
  | { kind: 'added' }
  /** Same id and content, or another tag with the same name: the existing tag is reused. */
  | { kind: 'existing'; id: string }
  | { kind: 'conflicting'; current: Tag };

function matchTag(current: readonly Tag[], tag: Tag): TagMatch {
  const sameId = current.find((candidate) => candidate.id === tag.id);
  if (sameId) return canonical(sameId) === canonical(tag) ? { kind: 'existing', id: sameId.id } : { kind: 'conflicting', current: sameId };
  const sameName = findTagByName(current, tag.name);
  return sameName ? { kind: 'existing', id: sameName.id } : { kind: 'added' };
}

function analyzeTags(current: Workspace, imported: Workspace): CollectionAnalysis {
  const result: CollectionAnalysis = { total: imported.tags.length, added: 0, identical: 0, conflicting: 0 };
  for (const tag of imported.tags) {
    const match = matchTag(current.tags, tag);
    if (match.kind === 'added') result.added += 1;
    else if (match.kind === 'existing') result.identical += 1;
    else result.conflicting += 1;
  }
  return result;
}

export function analyzeImport(current: Workspace, imported: Workspace): ImportAnalysis {
  const analyze = (key: Collection): CollectionAnalysis => {
    const result: CollectionAnalysis = { total: imported[key].length, added: 0, identical: 0, conflicting: 0 };
    const existing: Item[] = current[key];
    for (const item of imported[key]) result[classify(existing, item)] += 1;
    return result;
  };
  return {
    projects: analyze('projects'),
    tasks: analyze('tasks'),
    notes: analyze('notes'),
    snippets: analyze('snippets'),
    bugs: analyze('bugs'),
    tags: analyzeTags(current, imported),
  };
}

export function countItems(workspace: Workspace): number {
  return COLLECTIONS.reduce((sum, key) => sum + workspace[key].length, 0);
}

function emptyStats(): ImportStats {
  return { added: 0, replaced: 0, copied: 0, skipped: 0, removed: 0, tagsAdded: 0, tagsUpdated: 0 };
}

/**
 * Returns the workspace after the import. Never mutates its inputs, so the
 * caller can throw the result away if saving fails.
 */
export function applyImport(
  current: Workspace,
  imported: Workspace,
  mode: ImportMode,
  context: OperationContext,
): { workspace: Workspace; stats: ImportStats } {
  const stats = emptyStats();

  if (mode.kind === 'replace') {
    stats.added = countItems(imported);
    stats.removed = countItems(current);
    stats.tagsAdded = imported.tags.length;
    return { workspace: imported, stats };
  }

  const policy = mode.conflicts;
  const { tags, tagIdMap } = mergeTags(current.tags, imported.tags, policy, context, stats);
  const followTags = <T extends { tagIds: string[] }>(item: T): T => ({
    ...item,
    tagIds: Array.from(new Set(item.tagIds.map((id) => tagIdMap.get(id) ?? id))),
  });
  // With "keep both", conflicting imported items get fresh ids; references to renamed projects follow them.
  const renamedProjects = new Map<string, string>();
  if (policy === 'keep-both') {
    for (const project of imported.projects) {
      if (classify(current.projects, project) === 'conflicting') renamedProjects.set(project.id, context.createId());
    }
  }
  const followProject = <T extends { projectId: string | null }>(item: T): T =>
    item.projectId !== null && renamedProjects.has(item.projectId)
      ? { ...item, projectId: renamedProjects.get(item.projectId) ?? null }
      : item;
  const followReferences = <T extends { projectId: string | null; tagIds: string[] }>(item: T): T => followTags(followProject(item));

  /** Items are compared as they are in the file; `prepare` only shapes what is actually added. */
  function merge<T extends Item>(existing: T[], incoming: T[], newId: (item: T) => string, prepare: (item: T) => T = (item) => item): T[] {
    const additions: T[] = [];
    let result = existing;
    for (const item of incoming) {
      const kind = classify(existing, item);
      if (kind === 'added') {
        additions.push(prepare(item));
        stats.added += 1;
      } else if (kind === 'identical' || policy === 'keep-current') {
        stats.skipped += 1;
      } else if (policy === 'use-imported') {
        result = result.map((candidate) => (candidate.id === item.id ? prepare(item) : candidate));
        stats.replaced += 1;
      } else {
        additions.push({ ...prepare(item), id: newId(item) });
        stats.copied += 1;
      }
    }
    return [...additions, ...result];
  }

  const projects = merge(current.projects, imported.projects, (project) => renamedProjects.get(project.id) ?? context.createId(), followTags);
  const projectIds = new Set(projects.map((project) => project.id));
  const knownProject = <T extends { projectId: string | null }>(item: T): T =>
    item.projectId === null || projectIds.has(item.projectId) ? item : { ...item, projectId: null };

  const merged: Workspace = {
    ...current,
    projects,
    tasks: merge(current.tasks, imported.tasks, context.createId, followReferences).map(knownProject),
    notes: merge(current.notes, imported.notes, context.createId, followReferences).map(knownProject),
    snippets: merge(current.snippets, imported.snippets, context.createId, followReferences).map(knownProject),
    bugs: merge(current.bugs, imported.bugs, context.createId, followReferences).map(knownProject),
    tags,
  };
  // Safety net: no item may point to a tag that does not exist.
  return { workspace: removeUnknownTagIds(merged).workspace, stats };
}

/**
 * Merges tag definitions. Tags never end up with duplicate names:
 * - a new id whose name already exists reuses the existing tag,
 * - same id with other content follows the conflict policy, but only if
 *   that does not create a second tag with an existing name.
 * Returns where each imported tag id ends up, so items can follow it.
 */
function mergeTags(
  current: Tag[],
  incoming: Tag[],
  policy: ConflictPolicy,
  context: OperationContext,
  stats: ImportStats,
): { tags: Tag[]; tagIdMap: Map<string, string> } {
  const tagIdMap = new Map<string, string>();
  let tags = current;
  for (const tag of incoming) {
    const match = matchTag(tags, tag);
    if (match.kind === 'added') {
      tags = [...tags, tag];
      tagIdMap.set(tag.id, tag.id);
      stats.tagsAdded += 1;
      continue;
    }
    if (match.kind === 'existing') {
      tagIdMap.set(tag.id, match.id);
      continue;
    }
    const sameName = findTagByName(tags, tag.name);
    const nameTakenElsewhere = sameName !== undefined && sameName.id !== tag.id;
    if (policy === 'use-imported' && !nameTakenElsewhere) {
      tags = tags.map((candidate) => (candidate.id === tag.id ? tag : candidate));
      tagIdMap.set(tag.id, tag.id);
      stats.tagsUpdated += 1;
    } else if (policy === 'keep-both' && nameTakenElsewhere) {
      tagIdMap.set(tag.id, sameName.id);
    } else if (policy === 'keep-both' && tagKey(match.current.name) !== tagKey(tag.name)) {
      const copy: Tag = { ...tag, id: context.createId() };
      tags = [...tags, copy];
      tagIdMap.set(tag.id, copy.id);
      stats.tagsAdded += 1;
    } else {
      // Keep the current tag; items from the file still get it, since the id is the same.
      tagIdMap.set(tag.id, tag.id);
    }
  }
  return { tags, tagIdMap };
}
