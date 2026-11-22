import { ArrowRight, CalendarCheck2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardHeader } from '../../components/ui/Card';
import { getDueOverview, UPCOMING_DAYS } from '../../domain/dueDates';
import type { Task, Workspace } from '../../domain/models';
import { getProjectName } from '../../domain/workspace';
import { cn } from '../../lib/cn';
import { DueBadge } from '../tasks/DueBadge';

/** At most this many tasks per group; the rest is one click away on the Tasks page. */
const MAX_PER_GROUP = 4;

/** Overdue, due today and due in the coming week: the open tasks that need attention first. */
export function DueSoon({ workspace, today }: { workspace: Workspace; today: string }) {
  const overview = getDueOverview(workspace, today);
  const groups = [
    { key: 'overdue', title: 'Overdue', tasks: overview.overdue, tone: 'text-danger' },
    { key: 'today', title: 'Due today', tasks: overview.today, tone: 'text-warning' },
    { key: 'upcoming', title: `Next ${UPCOMING_DAYS} days`, tasks: overview.upcoming, tone: 'text-accent-300' },
  ] as const;
  const total = overview.overdue.length + overview.today.length + overview.upcoming.length;

  return (
    <Card>
      <CardHeader
        title="Due soon"
        description={total === 0 ? undefined : `${total} open ${total === 1 ? 'task' : 'tasks'} with a due date`}
        action={
          total > 0 ? (
            <Link to="/tasks" className="flex items-center gap-1 rounded text-xs text-muted hover:text-fg">
              All tasks <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      {total === 0 ? (
        <p className="flex items-center gap-2 px-5 py-5 text-[13px] text-muted">
          <CalendarCheck2 className="size-4 shrink-0 text-subtle" aria-hidden="true" />
          Nothing overdue or due in the next {UPCOMING_DAYS} days.
        </p>
      ) : (
        <div className="divide-y divide-line">
          {groups.map((group) =>
            group.tasks.length === 0 ? null : (
              <section key={group.key} aria-labelledby={`due-${group.key}`} className="px-5 py-3">
                <h3 id={`due-${group.key}`} className={cn('mb-1.5 flex items-center gap-2 text-xs font-medium', group.tone)}>
                  {group.title}
                  <span className="font-mono text-[11px] font-normal text-subtle">{group.tasks.length}</span>
                </h3>
                <ul className="space-y-1">
                  {group.tasks.slice(0, MAX_PER_GROUP).map((task) => (
                    <DueTask key={task.id} task={task} projectName={getProjectName(workspace, task.projectId)} today={today} />
                  ))}
                </ul>
                {group.tasks.length > MAX_PER_GROUP && <p className="mt-1 text-xs text-subtle">and {group.tasks.length - MAX_PER_GROUP} more</p>}
              </section>
            ),
          )}
        </div>
      )}
    </Card>
  );
}

function DueTask({ task, projectName, today }: { task: Task; projectName: string | null; today: string }) {
  return (
    <li className="flex min-w-0 items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
        {task.title}
        {projectName && <span className="text-subtle"> · {projectName}</span>}
      </span>
      <DueBadge item={task} today={today} className="shrink-0" />
    </li>
  );
}
