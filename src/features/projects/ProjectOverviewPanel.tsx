import { CalendarClock, History } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ENTITY_ICONS, entityPath } from '../../app/navigation';
import { Card, CardHeader } from '../../components/ui/Card';
import { ENTITY_LABELS } from '../../domain/labels';
import type { Workspace } from '../../domain/models';
import { getProjectOverview } from '../../domain/projectOverview';
import { formatRelativeTime } from '../../lib/format';
import { cn } from '../../lib/cn';
import { DueBadge } from '../tasks/DueBadge';
import { t, tn } from '../../i18n/translate';

interface ProjectOverviewPanelProps {
  workspace: Workspace;
  projectId: string;
  today: string;
}

/** Project Overview 2.0: progress, task and bug counts, deadlines and recent changes of one project. */
export function ProjectOverviewPanel({ workspace, projectId, today }: ProjectOverviewPanelProps) {
  const overview = getProjectOverview(workspace, projectId, today);
  if (!overview) return null;
  const { tasks, bugs, progress, deadlines, overdue, recent } = overview;
  const now = new Date();

  const tiles = [
    { label: t('Open tasks'), value: tasks.open, hint: tasks.inProgress > 0 ? t('{count} in progress', { count: tasks.inProgress }) : null },
    { label: t('Done tasks'), value: tasks.done, hint: null },
    { label: t('Open bugs'), value: bugs.open, hint: null, warn: bugs.open > 0 },
    { label: t('Closed bugs'), value: bugs.closed, hint: bugs.total > 0 ? t('of {count} bugs', { count: bugs.total }) : null },
  ];

  return (
    <section aria-labelledby="project-overview-heading" className="space-y-4">
      <h2 id="project-overview-heading" className="sr-only">
        {t('Project overview')}
      </h2>
      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs text-subtle">{t('Progress')}</p>
          {progress !== null && (
            <p className="text-xs text-muted">
              {tn('{done} of {count} task done|{done} of {count} tasks done', tasks.total, { done: tasks.done })}
            </p>
          )}
        </div>
        {progress === null ? (
          <p className="mt-2 text-[13px] text-muted">{t('No tasks yet. Progress is calculated from the project’s tasks once it has some.')}</p>
        ) : (
          <div className="mt-2 flex items-center gap-4">
            <span className="font-mono text-[26px] leading-none font-medium text-fg tabular-nums">{progress}%</span>
            <div
              role="progressbar"
              aria-label={t('Project progress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-2 flex-1 overflow-hidden rounded-full bg-raised"
            >
              <div className="h-full rounded-full bg-accent-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        <dl className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-line [gap:1px] sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className="bg-surface px-4 py-3">
              <dt className="text-xs text-subtle">{tile.label}</dt>
              <dd className={cn('mt-0.5 font-mono text-xl font-medium tabular-nums', tile.warn ? 'text-warning' : 'text-fg')}>{tile.value}</dd>
              {tile.hint && <dd className="text-[11px] text-subtle">{tile.hint}</dd>}
            </div>
          ))}
        </dl>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader as="h3" title={t('Upcoming deadlines')} description={overdue > 0 ? `${overdue} overdue` : undefined} />
          {deadlines.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-5 text-[13px] text-muted">
              <CalendarClock className="size-4 shrink-0 text-subtle" aria-hidden="true" />
              {t('No open tasks or bugs with a due date.')}
            </p>
          ) : (
            <ul className="divide-y divide-line" aria-label={t('Upcoming deadlines')}>
              {deadlines.map(({ type, item }) => {
                const Icon = ENTITY_ICONS[type];
                return (
                  <li key={`${type}-${item.id}`} className="flex items-center gap-3 px-5 py-3">
                    <Icon className="size-4 shrink-0 text-subtle" aria-label={ENTITY_LABELS[type]} />
                    <Link to={entityPath(type, item.id)} className="min-w-0 flex-1 truncate rounded text-[13px] text-fg hover:text-accent-200">
                      {item.title}
                    </Link>
                    <DueBadge item={item} today={today} className="shrink-0" />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card className="min-w-0">
          <CardHeader as="h3" title={t('Recent changes')} />
          {recent.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-5 text-[13px] text-muted">
              <History className="size-4 shrink-0 text-subtle" aria-hidden="true" />
              {t('No changes yet.')}
            </p>
          ) : (
            <ul className="divide-y divide-line" aria-label={t('Recent changes')}>
              {recent.map((item) => {
                const Icon = ENTITY_ICONS[item.type];
                return (
                  <li key={`${item.type}-${item.id}`} className="flex items-center gap-3 px-5 py-3">
                    <Icon className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-fg">{item.title}</span>
                      <span className="block text-xs text-subtle">{ENTITY_LABELS[item.type]}</span>
                    </span>
                    <time dateTime={item.updatedAt} className="shrink-0 font-mono text-[11px] text-subtle">
                      {formatRelativeTime(item.updatedAt, now)}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </section>
  );
}
