import type { Bug, BugPriority, BugStatus, Task, TaskPriority, TaskStatus, Workspace } from './models';

/**
 * Changes for several tasks or bugs at once (multi-select). Every change
 * returns a small record of the items as they were, so it can be undone the
 * same way a deletion can: the old versions are merged back into the *current*
 * workspace, and items deleted in the meantime simply stay deleted.
 */

export type BulkType = 'task' | 'bug';

export type TaskBulkChange = { status: TaskStatus } | { priority: TaskPriority } | { projectId: string | null };
export type BugBulkChange = { status: BugStatus } | { priority: BugPriority } | { projectId: string | null };

export type BulkEditRecord = { type: 'task'; previous: Task[] } | { type: 'bug'; previous: Bug[] };

export interface BulkEditResult {
  workspace: Workspace;
  /** `null` when nothing changed (e.g. all selected tasks were already done). */
  record: BulkEditRecord | null;
}

function applyTo<T extends { id: string; updatedAt: string; status: string; priority: string; projectId: string | null }>(
  items: T[],
  ids: ReadonlySet<string>,
  change: Partial<Pick<T, 'status' | 'priority' | 'projectId'>>,
  now: Date,
): { items: T[]; previous: T[] } {
  const previous: T[] = [];
  const stamp = now.toISOString();
  const next = items.map((item) => {
    if (!ids.has(item.id)) return item;
    const differs = (Object.keys(change) as Array<keyof typeof change>).some((key) => item[key] !== change[key]);
    if (!differs) return item;
    previous.push(item);
    return { ...item, ...change, updatedAt: stamp };
  });
  return { items: next, previous };
}

/** A project that does not exist (any more) is refused rather than half-applied. */
function projectExists(workspace: Workspace, change: object): boolean {
  if (!('projectId' in change)) return true;
  const projectId = (change as { projectId: string | null }).projectId;
  return projectId === null || workspace.projects.some((project) => project.id === projectId);
}

export function bulkEditTasks(workspace: Workspace, ids: readonly string[], change: TaskBulkChange, now: Date): BulkEditResult {
  if (!projectExists(workspace, change)) return { workspace, record: null };
  const { items, previous } = applyTo(workspace.tasks, new Set(ids), change, now);
  if (previous.length === 0) return { workspace, record: null };
  return { workspace: { ...workspace, tasks: items }, record: { type: 'task', previous } };
}

export function bulkEditBugs(workspace: Workspace, ids: readonly string[], change: BugBulkChange, now: Date): BulkEditResult {
  if (!projectExists(workspace, change)) return { workspace, record: null };
  const { items, previous } = applyTo(workspace.bugs, new Set(ids), change, now);
  if (previous.length === 0) return { workspace, record: null };
  return { workspace: { ...workspace, bugs: items }, record: { type: 'bug', previous } };
}

/**
 * Puts the old versions back. References that disappeared since then are
 * cleaned up (deleted tags dropped, a deleted project becomes "no project"),
 * so the result is always a valid workspace.
 */
export function restoreBulkEdit(workspace: Workspace, record: BulkEditRecord): Workspace {
  const projectIds = new Set(workspace.projects.map((project) => project.id));
  const tagIds = new Set(workspace.tags.map((tag) => tag.id));
  const clean = <T extends { projectId: string | null; tagIds: string[] }>(item: T): T => ({
    ...item,
    projectId: item.projectId !== null && projectIds.has(item.projectId) ? item.projectId : null,
    tagIds: item.tagIds.filter((id) => tagIds.has(id)),
  });
  const merge = <T extends { id: string; projectId: string | null; tagIds: string[] }>(items: T[], previous: T[]): T[] => {
    const byId = new Map(previous.map((item) => [item.id, item]));
    return items.map((item) => {
      const old = byId.get(item.id);
      return old ? clean(old) : item;
    });
  };
  return record.type === 'task'
    ? { ...workspace, tasks: merge(workspace.tasks, record.previous) }
    : { ...workspace, bugs: merge(workspace.bugs, record.previous) };
}
