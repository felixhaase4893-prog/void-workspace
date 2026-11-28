import { ArrowRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Card, CardHeader } from '../../components/ui/Card';
import type { Workspace } from '../../domain/models';
import { computeStatistics } from '../../domain/statistics';
import { type MessageKey, t } from '../../i18n/translate';

/** Dashboard card with the four headline numbers; the details live on the statistics page. */
export function StatisticsCard({ workspace, today }: { workspace: Workspace; today: string }) {
  const stats = useMemo(() => computeStatistics(workspace, '7d', today), [workspace, today]);
  const lastWeek = (count: number, some: MessageKey, none: MessageKey) => (count > 0 ? t(some, { count }) : t(none));
  const tiles = [
    { label: t('Completed tasks'), value: stats.tasks.done, hint: lastWeek(stats.tasks.completedInRange, '+{count} completed in the last 7 days', 'None completed in the last 7 days') },
    { label: t('Open tasks'), value: stats.tasks.open, hint: lastWeek(stats.tasks.createdInRange, '+{count} created in the last 7 days', 'None created in the last 7 days') },
    { label: t('Closed bugs'), value: stats.bugs.closed, hint: lastWeek(stats.bugs.closedInRange, '+{count} closed in the last 7 days', 'None closed in the last 7 days') },
    { label: t('Active projects'), value: stats.projects.active, hint: stats.projects.paused > 0 ? t('{count} paused', { count: stats.projects.paused }) : null },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={t('Statistics')}
        action={
          <Link to="/statistics" className="flex items-center gap-1 rounded text-xs text-muted hover:text-fg">
            {t('View all')} <ArrowRight className="size-3.5" aria-hidden="true" />
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
