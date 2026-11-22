import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Card, CardHeader } from '../../components/ui/Card';
import type { Workspace } from '../../domain/models';
import { computeStatistics } from '../../domain/statistics';

/** Dashboard card with the four headline numbers; the details live on the statistics page. */
export function StatisticsCard({ workspace, today }: { workspace: Workspace; today: string }) {
  const stats = useMemo(() => computeStatistics(workspace, '7d', today), [workspace, today]);
  const lastWeek = (count: number, verb: string) => (count > 0 ? `+${count} ${verb} in the last 7 days` : `None ${verb} in the last 7 days`);
  const tiles = [
    { label: 'Completed tasks', value: stats.tasks.done, hint: lastWeek(stats.tasks.completedInRange, 'completed') },
    { label: 'Open tasks', value: stats.tasks.open, hint: lastWeek(stats.tasks.createdInRange, 'created') },
    { label: 'Closed bugs', value: stats.bugs.closed, hint: lastWeek(stats.bugs.closedInRange, 'closed') },
    { label: 'Active projects', value: stats.projects.active, hint: stats.projects.paused > 0 ? `${stats.projects.paused} paused` : null },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Statistics"
        action={
          <Link to="/statistics" className="flex items-center gap-1 rounded text-xs text-muted hover:text-fg">
            View all <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        }
      />
      <dl className="grid grid-cols-2 bg-line [gap:1px] lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-surface px-4 py-3.5 sm:px-5">
            <dt className="text-xs text-subtle">{tile.label}</dt>
            <dd className="mt-0.5 font-mono text-[22px] font-medium text-fg tabular-nums">{tile.value}</dd>
            {tile.hint && <dd className="text-[11px] text-subtle">{tile.hint}</dd>}
          </div>
        ))}
      </dl>
    </Card>
  );
}
