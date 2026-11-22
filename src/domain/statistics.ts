import { addDays, daysBetween, toDayKey } from './dueDates';
import { isResolvedBugStatus } from './milestones';
import type { ProjectStatus, Workspace } from './models';
import { taskProgress } from './projectOverview';

/**
 * Statistics computed from the workspace on every render, so they always
 * match the current data. Only facts are counted: how many items exist, were
 * created, completed or closed. Nothing is estimated or scored. Items that
 * were finished before VOID recorded completion times are counted as
 * finished, but are left out of the "over time" charts (their date is unknown).
 */

export const STATS_RANGES = ['7d', '30d', '90d', 'all'] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export const STATS_RANGE_LABELS: Record<StatsRange, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
};

const RANGE_DAYS: Record<Exclude<StatsRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

export interface StatsBucket {
  /** First day of the bucket (inclusive). */
  start: string;
  /** Last day of the bucket (inclusive). */
  end: string;
  label: string;
  tasksCreated: number;
  tasksCompleted: number;
  bugsReported: number;
  bugsClosed: number;
}

export interface ProjectStat {
  id: string;
  name: string;
  status: ProjectStatus;
  totalTasks: number;
  doneTasks: number;
  progress: number | null;
  openBugs: number;
}

export interface Statistics {
  range: StatsRange;
  /** First and last day of the period. `null` for "All time" without any dated items. */
  from: string | null;
  to: string;
  tasks: {
    total: number;
    open: number;
    inProgress: number;
    done: number;
    createdInRange: number;
    completedInRange: number;
    /** Done tasks without a recorded completion time (finished before VOID 4.2). */
    completedUnknownDate: number;
  };
  bugs: {
    total: number;
    open: number;
    closed: number;
    reportedInRange: number;
    closedInRange: number;
    closedUnknownDate: number;
  };
  projects: {
    active: number;
    paused: number;
    archived: number;
    /** Active and paused projects, most tasks first. */
    list: ProjectStat[];
  };
  buckets: StatsBucket[];
  bucketSize: 'day' | 'week' | 'month';
}

/** The local day of a stored timestamp. */
export function dayOf(iso: string): string {
  return toDayKey(new Date(iso));
}

const dayLabel = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthLabel = new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit', timeZone: 'UTC' });

function utcDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day));
}

function emptyBucket(start: string, end: string, label: string): StatsBucket {
  return { start, end, label, tasksCreated: 0, tasksCompleted: 0, bugsReported: 0, bugsClosed: 0 };
}

/** Day buckets up to 31 days, week buckets up to ~half a year, month buckets beyond. */
export function makeBuckets(from: string, to: string): { buckets: StatsBucket[]; size: Statistics['bucketSize'] } {
  const span = daysBetween(from, to) + 1;
  if (span <= 31) {
    return {
      size: 'day',
      buckets: Array.from({ length: Math.max(1, span) }, (_, index) => {
        const day = addDays(from, index);
        return emptyBucket(day, day, dayLabel.format(utcDate(day)));
      }),
    };
  }
  if (span <= 190) {
    const buckets: StatsBucket[] = [];
    for (let start = from; daysBetween(start, to) >= 0; start = addDays(start, 7)) {
      const end = daysBetween(addDays(start, 6), to) >= 0 ? addDays(start, 6) : to;
      buckets.push(emptyBucket(start, end, dayLabel.format(utcDate(start))));
    }
    return { size: 'week', buckets };
  }
  const buckets: StatsBucket[] = [];
  let [year, month] = from.split('-').map(Number) as [number, number];
  for (;;) {
    const start = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
    if (daysBetween(start, to) < 0) break;
    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    const nextStart = `${String(next.year).padStart(4, '0')}-${String(next.month).padStart(2, '0')}-01`;
    const end = daysBetween(addDays(nextStart, -1), to) >= 0 ? addDays(nextStart, -1) : to;
    buckets.push(emptyBucket(daysBetween(start, from) > 0 ? from : start, end, monthLabel.format(utcDate(start))));
    year = next.year;
    month = next.month;
  }
  return { size: 'month', buckets };
}

function earliestDay(workspace: Workspace): string | null {
  let earliest: string | null = null;
  const consider = (iso: string | null) => {
    if (!iso) return;
    const day = dayOf(iso);
    if (earliest === null || daysBetween(day, earliest) > 0) earliest = day;
  };
  for (const task of workspace.tasks) {
    consider(task.createdAt);
    consider(task.completedAt);
  }
  for (const bug of workspace.bugs) {
    consider(bug.createdAt);
    consider(bug.resolvedAt);
  }
  return earliest;
}

export function computeStatistics(workspace: Workspace, range: StatsRange, today: string): Statistics {
  const earliest = range === 'all' ? earliestDay(workspace) : addDays(today, -(RANGE_DAYS[range] - 1));
  // A timestamp from the future (e.g. a changed system clock) must not produce an empty or negative period.
  const from = earliest !== null && daysBetween(earliest, today) < 0 ? today : earliest;
  const inRange = (iso: string | null): boolean => {
    if (!iso || from === null) return false;
    const day = dayOf(iso);
    return daysBetween(from, day) >= 0 && daysBetween(day, today) >= 0;
  };
  const { buckets, size } = from === null ? { buckets: [], size: 'day' as const } : makeBuckets(from, today);
  const bucketOf = (iso: string): StatsBucket | undefined => {
    const day = dayOf(iso);
    return buckets.find((bucket) => daysBetween(bucket.start, day) >= 0 && daysBetween(day, bucket.end) >= 0);
  };

  const tasks = { total: workspace.tasks.length, open: 0, inProgress: 0, done: 0, createdInRange: 0, completedInRange: 0, completedUnknownDate: 0 };
  for (const task of workspace.tasks) {
    if (task.status === 'done') {
      tasks.done += 1;
      if (task.completedAt === null) tasks.completedUnknownDate += 1;
    } else tasks.open += 1;
    if (task.status === 'in_progress') tasks.inProgress += 1;
    if (inRange(task.createdAt)) {
      tasks.createdInRange += 1;
      const bucket = bucketOf(task.createdAt);
      if (bucket) bucket.tasksCreated += 1;
    }
    if (task.status === 'done' && inRange(task.completedAt)) {
      tasks.completedInRange += 1;
      const bucket = bucketOf(task.completedAt as string);
      if (bucket) bucket.tasksCompleted += 1;
    }
  }

  const bugs = { total: workspace.bugs.length, open: 0, closed: 0, reportedInRange: 0, closedInRange: 0, closedUnknownDate: 0 };
  for (const bug of workspace.bugs) {
    const resolved = isResolvedBugStatus(bug.status);
    if (resolved) {
      bugs.closed += 1;
      if (bug.resolvedAt === null) bugs.closedUnknownDate += 1;
    } else bugs.open += 1;
    if (inRange(bug.createdAt)) {
      bugs.reportedInRange += 1;
      const bucket = bucketOf(bug.createdAt);
      if (bucket) bucket.bugsReported += 1;
    }
    if (resolved && inRange(bug.resolvedAt)) {
      bugs.closedInRange += 1;
      const bucket = bucketOf(bug.resolvedAt as string);
      if (bucket) bucket.bugsClosed += 1;
    }
  }

  const list: ProjectStat[] = workspace.projects
    .filter((project) => project.status !== 'archived')
    .map((project) => {
      const projectTasks = workspace.tasks.filter((task) => task.projectId === project.id);
      const doneTasks = projectTasks.filter((task) => task.status === 'done').length;
      const openBugs = workspace.bugs.filter((bug) => bug.projectId === project.id && !isResolvedBugStatus(bug.status)).length;
      return { id: project.id, name: project.name, status: project.status, totalTasks: projectTasks.length, doneTasks, progress: taskProgress({ total: projectTasks.length, done: doneTasks }), openBugs };
    })
    .sort((a, b) => b.totalTasks - a.totalTasks || a.name.localeCompare(b.name));

  const count = (status: ProjectStatus) => workspace.projects.filter((project) => project.status === status).length;
  return {
    range,
    from,
    to: today,
    tasks,
    bugs,
    projects: { active: count('active'), paused: count('paused'), archived: count('archived'), list },
    buckets,
    bucketSize: size,
  };
}

/** True when the period has something to draw; otherwise the charts show an empty state. */
export function hasActivity(statistics: Statistics, kind: 'tasks' | 'bugs'): boolean {
  return statistics.buckets.some((bucket) => (kind === 'tasks' ? bucket.tasksCreated + bucket.tasksCompleted : bucket.bugsReported + bucket.bugsClosed) > 0);
}
