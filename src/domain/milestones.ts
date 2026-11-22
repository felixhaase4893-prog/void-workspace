import type { Bug, BugStatus, Task, Workspace } from './models';

/**
 * Keeps `task.completedAt` and `bug.resolvedAt` in step with the status, no
 * matter which action changed it (status toggle, edit form, multi-select,
 * Quick Add, undo). It runs once per saved change in the WorkspaceProvider and
 * compares the workspace before and after:
 *
 * - an item that becomes done/resolved gets the time of that change,
 * - an item that is reopened loses the time again,
 * - an item that stays done keeps its time (or stays "unknown" if it was done
 *   before VOID recorded these times),
 * - a new item that is already done (created as done, or brought back by undo)
 *   gets its own `updatedAt`, the moment it was last really changed.
 *
 * Statistics read only these values. Nothing is ever guessed for old data.
 */

export function isResolvedBugStatus(status: BugStatus): boolean {
  return status === 'fixed' || status === 'closed';
}

function stampTask(task: Task, before: Task | undefined, now: string): Task {
  const done = task.status === 'done';
  if (!done) return task.completedAt === null ? task : { ...task, completedAt: null };
  if (task.completedAt !== null) return task;
  if (!before) return { ...task, completedAt: task.updatedAt };
  if (before.status === 'done') return task;
  return { ...task, completedAt: now };
}

function stampBug(bug: Bug, before: Bug | undefined, now: string): Bug {
  const resolved = isResolvedBugStatus(bug.status);
  if (!resolved) return bug.resolvedAt === null ? bug : { ...bug, resolvedAt: null };
  if (bug.resolvedAt !== null) return bug;
  if (!before) return { ...bug, resolvedAt: bug.updatedAt };
  if (isResolvedBugStatus(before.status)) return bug;
  return { ...bug, resolvedAt: now };
}

function stampList<T extends { id: string }>(items: T[], beforeItems: T[], stamp: (item: T, before: T | undefined) => T): T[] {
  const before = new Map(beforeItems.map((item) => [item.id, item]));
  let changed = false;
  const next = items.map((item) => {
    const stamped = stamp(item, before.get(item.id));
    if (stamped !== item) changed = true;
    return stamped;
  });
  return changed ? next : items;
}

/** Returns `next` itself when nothing needed a stamp, so unchanged saves stay cheap. */
export function stampMilestones(previous: Workspace, next: Workspace, now: Date): Workspace {
  if (previous === next) return next;
  const iso = now.toISOString();
  const tasks = next.tasks === previous.tasks ? next.tasks : stampList(next.tasks, previous.tasks, (task, before) => stampTask(task, before, iso));
  const bugs = next.bugs === previous.bugs ? next.bugs : stampList(next.bugs, previous.bugs, (bug, before) => stampBug(bug, before, iso));
  if (tasks === next.tasks && bugs === next.bugs) return next;
  return { ...next, tasks, bugs };
}
