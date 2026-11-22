import { daysBetween, getDueState, isFinished, type DueItem } from './dueDates';
import { isResolvedBugStatus } from './milestones';
import type { EntityType, Workspace } from './models';
import { getProjectContents } from './workspace';

/**
 * Project Overview 2.0: everything the project page summarises, computed from
 * the existing tasks and bugs. No separate data is stored.
 */

export interface TaskCounts {
  total: number;
  open: number;
  inProgress: number;
  done: number;
}

export interface BugCounts {
  total: number;
  /** Open or in progress. */
  open: number;
  /** Fixed or closed. */
  closed: number;
}

/**
 * Share of done tasks, rounded down to whole percent so a project only shows
 * 100 % when every task is done. `null` when the project has no tasks: an
 * empty project has no progress, not 0 %.
 */
export function taskProgress(counts: Pick<TaskCounts, 'total' | 'done'>): number | null {
  if (counts.total === 0) return null;
  return Math.floor((counts.done / counts.total) * 100);
}

export interface ProjectChange {
  type: EntityType;
  id: string;
  title: string;
  updatedAt: string;
}

export interface ProjectOverview {
  tasks: TaskCounts;
  bugs: BugCounts;
  progress: number | null;
  /** Unfinished tasks and bugs with a due date: overdue first, then by date. */
  deadlines: DueItem[];
  overdue: number;
  recent: ProjectChange[];
}

/** How many deadlines and changes the overview lists. */
export const OVERVIEW_LIST_LIMIT = 5;

export function getProjectOverview(workspace: Workspace, projectId: string, today: string, limit = OVERVIEW_LIST_LIMIT): ProjectOverview | null {
  const project = workspace.projects.find((candidate) => candidate.id === projectId);
  if (!project) return null;
  const { tasks, bugs, notes, snippets } = getProjectContents(workspace, projectId);

  const taskCounts: TaskCounts = {
    total: tasks.length,
    open: tasks.filter((task) => task.status !== 'done').length,
    inProgress: tasks.filter((task) => task.status === 'in_progress').length,
    done: tasks.filter((task) => task.status === 'done').length,
  };
  const bugCounts: BugCounts = {
    total: bugs.length,
    open: bugs.filter((bug) => !isResolvedBugStatus(bug.status)).length,
    closed: bugs.filter((bug) => isResolvedBugStatus(bug.status)).length,
  };

  const dated: DueItem[] = [
    ...tasks.filter((task) => task.dueDate !== null && !isFinished(task)).map((item) => ({ type: 'task' as const, item })),
    ...bugs.filter((bug) => bug.dueDate !== null && !isFinished(bug)).map((item) => ({ type: 'bug' as const, item })),
  ].filter((entry) => getDueState(entry.item, today) !== 'none');
  dated.sort((a, b) => daysBetween(b.item.dueDate as string, a.item.dueDate as string) || a.item.title.localeCompare(b.item.title));
  const overdue = dated.filter((entry) => getDueState(entry.item, today) === 'overdue').length;

  const recent: ProjectChange[] = [
    { type: 'project' as const, id: project.id, title: project.name, updatedAt: project.updatedAt },
    ...tasks.map((item) => ({ type: 'task' as const, id: item.id, title: item.title, updatedAt: item.updatedAt })),
    ...bugs.map((item) => ({ type: 'bug' as const, id: item.id, title: item.title, updatedAt: item.updatedAt })),
    ...notes.map((item) => ({ type: 'note' as const, id: item.id, title: item.title, updatedAt: item.updatedAt })),
    ...snippets.map((item) => ({ type: 'snippet' as const, id: item.id, title: item.title, updatedAt: item.updatedAt })),
  ]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);

  return { tasks: taskCounts, bugs: bugCounts, progress: taskProgress(taskCounts), deadlines: dated.slice(0, limit), overdue, recent };
}
