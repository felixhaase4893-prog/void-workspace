import { ChartColumn } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PROJECT_STATUS_LABELS } from '../../domain/labels';
import { computeStatistics, hasActivity, STATS_RANGE_LABELS, STATS_RANGES, type StatsRange } from '../../domain/statistics';
import { useToday } from '../../hooks/useToday';
import { cn } from '../../lib/cn';
import { useWorkspace } from '../../state/workspaceContext';
import { BarChart } from './BarChart';

const BUCKET_WORD = { day: 'day', week: 'week', month: 'month' } as const;

/**
 * Detailed statistics, computed from the local workspace on every render, so
 * they always reflect the latest changes. The period only affects what
 * happened "in the period"; current totals (open, done) are shown as they are now.
 */
export default function StatisticsPage() {
  const workspace = useWorkspace();
  const today = useToday();
  const [range, setRange] = useState<StatsRange>('30d');
  const stats = useMemo(() => computeStatistics(workspace, range, today), [workspace, range, today]);
  const empty = workspace.tasks.length === 0 && workspace.bugs.length === 0 && workspace.projects.length === 0;

  return (
    <>
      <PageHeader title="Statistics" description="Your tasks, bugs and projects, calculated from the data on this device." />
      {empty ? (
        <Card>
          <EmptyState icon={ChartColumn} title="No data yet" description="Statistics appear once you have projects, tasks or bugs. Nothing here is estimated." quickAddHint />
        </Card>
      ) : (
        <div className="space-y-6">
          <div role="radiogroup" aria-label="Period" className="inline-flex flex-wrap rounded-lg border border-line bg-surface p-0.5">
            {STATS_RANGES.map((entry) => (
              <button
                key={entry}
                type="button"
                role="radio"
                aria-checked={range === entry}
                onClick={() => setRange(entry)}
                className={cn('h-8 rounded-md px-3 text-[13px] font-medium transition-colors', range === entry ? 'bg-raised text-fg' : 'text-muted hover:text-fg')}
              >
                {STATS_RANGE_LABELS[entry]}
              </button>
            ))}
          </div>

          <section aria-labelledby="stats-tasks" className="space-y-3">
            <h2 id="stats-tasks" className="text-sm font-semibold text-fg">
              Tasks
            </h2>
            <Tiles
              items={[
                { label: 'Open now', value: stats.tasks.open, hint: stats.tasks.inProgress > 0 ? `${stats.tasks.inProgress} in progress` : undefined },
                { label: 'Done in total', value: stats.tasks.done },
                { label: 'Created in period', value: stats.tasks.createdInRange },
                { label: 'Completed in period', value: stats.tasks.completedInRange },
              ]}
            />
            <ChartCard
              title="Tasks over time"
              description={`Created and completed per ${BUCKET_WORD[stats.bucketSize]}`}
              active={hasActivity(stats, 'tasks')}
              emptyText="No tasks were created or completed in this period."
              note={stats.tasks.completedUnknownDate > 0 ? `${stats.tasks.completedUnknownDate} done ${stats.tasks.completedUnknownDate === 1 ? 'task was' : 'tasks were'} completed before VOID recorded completion dates and ${stats.tasks.completedUnknownDate === 1 ? 'is' : 'are'} not in the chart.` : undefined}
            >
              <BarChart
                title="Tasks over time"
                buckets={stats.buckets}
                series={[
                  { key: 'tasksCreated', label: 'Created', color: 'bg-accent-500/70' },
                  { key: 'tasksCompleted', label: 'Completed', color: 'bg-success/80' },
                ]}
              />
            </ChartCard>
          </section>

          <section aria-labelledby="stats-bugs" className="space-y-3">
            <h2 id="stats-bugs" className="text-sm font-semibold text-fg">
              Bugs
            </h2>
            <Tiles
              items={[
                { label: 'Open now', value: stats.bugs.open, hint: 'Open or in progress' },
                { label: 'Closed in total', value: stats.bugs.closed, hint: 'Fixed or closed' },
                { label: 'Reported in period', value: stats.bugs.reportedInRange },
                { label: 'Closed in period', value: stats.bugs.closedInRange },
              ]}
            />
            <ChartCard
              title="Bugs over time"
              description={`Reported and closed per ${BUCKET_WORD[stats.bucketSize]}`}
              active={hasActivity(stats, 'bugs')}
              emptyText="No bugs were reported or closed in this period."
              note={stats.bugs.closedUnknownDate > 0 ? `${stats.bugs.closedUnknownDate} closed ${stats.bugs.closedUnknownDate === 1 ? 'bug was' : 'bugs were'} closed before VOID recorded closing dates and ${stats.bugs.closedUnknownDate === 1 ? 'is' : 'are'} not in the chart.` : undefined}
            >
              <BarChart
                title="Bugs over time"
                buckets={stats.buckets}
                series={[
                  { key: 'bugsReported', label: 'Reported', color: 'bg-warning/70' },
                  { key: 'bugsClosed', label: 'Closed', color: 'bg-success/80' },
                ]}
              />
            </ChartCard>
          </section>

          <section aria-labelledby="stats-projects" className="space-y-3">
            <h2 id="stats-projects" className="text-sm font-semibold text-fg">
              Projects
            </h2>
            <Tiles
              items={[
                { label: 'Active', value: stats.projects.active },
                { label: 'Paused', value: stats.projects.paused },
                { label: 'Archived', value: stats.projects.archived },
              ]}
            />
            <Card>
              <CardHeader title="Progress by project" description="Share of done tasks; archived projects are not shown" />
              {stats.projects.list.length === 0 ? (
                <p className="px-5 py-6 text-[13px] text-muted">No active or paused projects.</p>
              ) : (
                <ul className="divide-y divide-line" aria-label="Progress by project">
                  {stats.projects.list.map((project) => (
                    <li key={project.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-5 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
                      <span className="flex min-w-0 items-center gap-2">
                        <Link to={`/projects/${project.id}`} className="truncate rounded text-[13px] font-medium text-fg hover:text-accent-200">
                          {project.name}
                        </Link>
                        {project.status === 'paused' && <Badge tone="warning">{PROJECT_STATUS_LABELS.paused}</Badge>}
                      </span>
                      <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
                        {project.progress === null ? (
                          <span className="text-xs text-subtle">No tasks</span>
                        ) : (
                          <span
                            role="progressbar"
                            aria-label={`${project.name} progress`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={project.progress}
                            className="block h-1.5 overflow-hidden rounded-full bg-raised"
                          >
                            <span className="block h-full rounded-full bg-accent-500" style={{ width: `${project.progress}%` }} />
                          </span>
                        )}
                      </span>
                      <span className="text-right font-mono text-xs text-muted tabular-nums">
                        {project.progress === null ? '–' : `${project.progress}%`}
                        <span className="ml-2 text-subtle">
                          {project.doneTasks}/{project.totalTasks} tasks · {project.openBugs} open {project.openBugs === 1 ? 'bug' : 'bugs'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        </div>
      )}
    </>
  );
}

function Tiles({ items }: { items: Array<{ label: string; value: number; hint?: string | undefined }> }) {
  return (
    <dl className={cn('grid grid-cols-2 overflow-hidden rounded-card border border-line bg-line [gap:1px]', items.length === 4 ? 'lg:grid-cols-4' : 'sm:grid-cols-3')}>
      {items.map((item) => (
        <div key={item.label} className="bg-surface px-4 py-3.5 sm:px-5">
          <dt className="text-xs text-subtle">{item.label}</dt>
          <dd className="mt-0.5 font-mono text-[22px] font-medium text-fg tabular-nums">{item.value}</dd>
          {item.hint && <dd className="text-[11px] text-subtle">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

function ChartCard({ title, description, active, emptyText, note, children }: { title: string; description: string; active: boolean; emptyText: string; note?: string | undefined; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <div className="px-5 py-4">{active ? children : <p className="py-6 text-center text-[13px] text-muted">{emptyText}</p>}</div>
      {note && <p className="border-t border-line px-5 py-2.5 text-[11px] text-subtle">{note}</p>}
    </Card>
  );
}
