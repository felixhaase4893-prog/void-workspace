import type { Bug, EntityType, Note, Project, Snippet, Task, Workspace } from './models';
import { deleteBug, deleteNote, deleteProject, deleteSnippet, deleteTask, type DeleteProjectOptions } from './workspace';

/**
 * Undo for deletions.
 *
 * A deletion is applied (and saved) right away. Alongside it, `deleteWithUndo`
 * returns a `DeletionRecord`: a snapshot of everything the deletion removed or
 * changed, with each item's original position. `restoreDeletion` merges that
 * snapshot back into the *current* workspace instead of rolling the whole
 * workspace back, so undoing one deletion never discards other deletions or
 * edits made in the meantime. Records only live in memory for a few seconds;
 * there is deliberately no persistent trash.
 */

interface Positioned<T> {
  item: T;
  /** Index in its list before the deletion (fallback position). */
  index: number;
  /** Ids of the items that came before it, nearest first, so it can return to the same neighbours. */
  precededBy: string[];
}

/** Enough neighbours to find the old spot even after several other deletions. */
const MAX_ANCHORS = 25;

/** A task, note, snippet or bug that lost its project because the project was deleted without its contents. */
interface DetachedItem {
  collection: 'tasks' | 'notes' | 'snippets' | 'bugs';
  id: string;
  projectId: string;
  updatedAt: string;
}

export interface DeletionRecord {
  type: EntityType;
  id: string;
  title: string;
  projects: Positioned<Project>[];
  tasks: Positioned<Task>[];
  notes: Positioned<Note>[];
  snippets: Positioned<Snippet>[];
  /** Missing in records made before bugs existed; treated as empty. */
  bugs?: Positioned<Bug>[];
  detached: DetachedItem[];
  /** How many items a multi-select deletion removed; missing for single deletions. */
  count?: number;
}

export interface DeletionResult {
  workspace: Workspace;
  /** `null` when nothing was deleted (e.g. the id no longer exists). */
  record: DeletionRecord | null;
}

function removedFrom<T extends { id: string }>(before: readonly T[], after: readonly T[]): Positioned<T>[] {
  const remaining = new Set(after.map((item) => item.id));
  return before.flatMap((item, index) =>
    remaining.has(item.id)
      ? []
      : [{ item, index, precededBy: before.slice(Math.max(0, index - MAX_ANCHORS), index).map((previous) => previous.id).reverse() }],
  );
}

function detachedFrom(
  collection: DetachedItem['collection'],
  before: ReadonlyArray<{ id: string; projectId: string | null; updatedAt: string }>,
  after: ReadonlyArray<{ id: string; projectId: string | null }>,
): DetachedItem[] {
  const afterById = new Map(after.map((item) => [item.id, item]));
  return before.flatMap((item) => {
    const next = afterById.get(item.id);
    if (!next || item.projectId === null || next.projectId !== null) return [];
    return [{ collection, id: item.id, projectId: item.projectId, updatedAt: item.updatedAt }];
  });
}

function titleOf(workspace: Workspace, type: EntityType, id: string): string | null {
  switch (type) {
    case 'project':
      return workspace.projects.find((item) => item.id === id)?.name ?? null;
    case 'task':
      return workspace.tasks.find((item) => item.id === id)?.title ?? null;
    case 'note':
      return workspace.notes.find((item) => item.id === id)?.title ?? null;
    case 'snippet':
      return workspace.snippets.find((item) => item.id === id)?.title ?? null;
    case 'bug':
      return workspace.bugs.find((item) => item.id === id)?.title ?? null;
  }
}

/** Deletes one item exactly like the plain delete operations and records how to bring it back. */
export function deleteWithUndo(
  workspace: Workspace,
  type: EntityType,
  id: string,
  options: DeleteProjectOptions & { now: Date } = { deleteContents: false, now: new Date() },
): DeletionResult {
  const title = titleOf(workspace, type, id);
  if (title === null) return { workspace, record: null };

  let next: Workspace;
  switch (type) {
    case 'project':
      next = deleteProject(workspace, id, { deleteContents: options.deleteContents }, { now: options.now });
      break;
    case 'task':
      next = deleteTask(workspace, id);
      break;
    case 'note':
      next = deleteNote(workspace, id);
      break;
    case 'snippet':
      next = deleteSnippet(workspace, id);
      break;
    case 'bug':
      next = deleteBug(workspace, id);
      break;
  }

  const record: DeletionRecord = {
    type,
    id,
    title,
    projects: removedFrom(workspace.projects, next.projects),
    tasks: removedFrom(workspace.tasks, next.tasks),
    notes: removedFrom(workspace.notes, next.notes),
    snippets: removedFrom(workspace.snippets, next.snippets),
    bugs: removedFrom(workspace.bugs, next.bugs),
    detached: [
      ...detachedFrom('tasks', workspace.tasks, next.tasks),
      ...detachedFrom('notes', workspace.notes, next.notes),
      ...detachedFrom('snippets', workspace.snippets, next.snippets),
      ...detachedFrom('bugs', workspace.bugs, next.bugs),
    ],
  };
  return { workspace: next, record };
}

/**
 * Deletes several tasks or bugs (multi-select) as one deletion with one record,
 * so a single "Undo" brings all of them back to their old positions.
 */
export function deleteManyWithUndo(workspace: Workspace, type: 'task' | 'bug', ids: readonly string[]): DeletionResult {
  const wanted = new Set(ids);
  const list: ReadonlyArray<{ id: string; title: string }> = type === 'task' ? workspace.tasks : workspace.bugs;
  const existing = list.filter((item) => wanted.has(item.id));
  const first = existing[0];
  if (!first) return { workspace, record: null };

  const next: Workspace =
    type === 'task'
      ? { ...workspace, tasks: workspace.tasks.filter((task) => !wanted.has(task.id)) }
      : { ...workspace, bugs: workspace.bugs.filter((bug) => !wanted.has(bug.id)) };

  const record: DeletionRecord = {
    type,
    id: first.id,
    title: first.title,
    count: existing.length,
    projects: [],
    tasks: removedFrom(workspace.tasks, next.tasks),
    notes: [],
    snippets: [],
    bugs: removedFrom(workspace.bugs, next.bugs),
    detached: [],
  };
  return { workspace: next, record };
}

/** Puts items back at their old positions (as far as the list still allows); ids that exist again are skipped. */
function reinsert<T extends { id: string }>(list: readonly T[], restored: readonly Positioned<T>[], prepare: (item: T) => T): T[] {
  const result = [...list];
  const present = new Set(list.map((item) => item.id));
  for (const { item, index, precededBy } of [...restored].sort((a, b) => a.index - b.index)) {
    if (present.has(item.id)) continue;
    present.add(item.id);
    // Right after the nearest old neighbour that still exists; at the top if it had none.
    const anchor = precededBy.find((id) => present.has(id));
    const position =
      anchor !== undefined
        ? result.findIndex((entry) => entry.id === anchor) + 1
        : index === 0 || precededBy.length < MAX_ANCHORS
          ? 0
          : Math.min(index, result.length);
    result.splice(position, 0, prepare(item));
  }
  return result;
}

/**
 * Brings a deletion back into the current workspace, including the project's
 * contents and the project links of items that were kept. References that
 * have disappeared since then are cleaned up: tags deleted in the meantime are
 * dropped and a project that no longer exists becomes "no project", so the
 * result is always a valid workspace.
 */
export function restoreDeletion(workspace: Workspace, record: DeletionRecord): Workspace {
  const projects = reinsert(workspace.projects, record.projects, (item) => item);
  const projectIds = new Set(projects.map((project) => project.id));
  const tagIds = new Set(workspace.tags.map((tag) => tag.id));

  const cleanTags = <T extends { tagIds: string[] }>(item: T): T =>
    item.tagIds.every((tagId) => tagIds.has(tagId)) ? item : { ...item, tagIds: item.tagIds.filter((tagId) => tagIds.has(tagId)) };
  const cleanReferences = <T extends { tagIds: string[]; projectId: string | null }>(item: T): T => {
    const tagged = cleanTags(item);
    return tagged.projectId !== null && !projectIds.has(tagged.projectId) ? { ...tagged, projectId: null } : tagged;
  };

  const reattach = <T extends { id: string; projectId: string | null; updatedAt: string }>(
    collection: DetachedItem['collection'],
    list: T[],
  ): T[] => {
    const links = new Map(record.detached.filter((entry) => entry.collection === collection).map((entry) => [entry.id, entry]));
    if (links.size === 0) return list;
    return list.map((item) => {
      const link = links.get(item.id);
      // Only re-link items that are still unassigned: if the user moved one to another project meanwhile, that wins.
      if (!link || item.projectId !== null || !projectIds.has(link.projectId)) return item;
      return { ...item, projectId: link.projectId, updatedAt: link.updatedAt };
    });
  };

  return {
    ...workspace,
    projects: projects.map((project) => (record.projects.some((entry) => entry.item.id === project.id) ? cleanTags(project) : project)),
    tasks: reattach('tasks', reinsert(workspace.tasks, record.tasks, cleanReferences)),
    notes: reattach('notes', reinsert(workspace.notes, record.notes, cleanReferences)),
    snippets: reattach('snippets', reinsert(workspace.snippets, record.snippets, cleanReferences)),
    bugs: reattach('bugs', reinsert(workspace.bugs, record.bugs ?? [], cleanReferences)),
  };
}
