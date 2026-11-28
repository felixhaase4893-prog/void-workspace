import { Link } from 'react-router-dom';

import type { Workspace } from '../../domain/models';
import { countOpenTasks } from '../../domain/workspace';
import { t } from '../../i18n/translate';

export function StatTiles({ workspace }: { workspace: Workspace }) {
  const activeProjects = workspace.projects.filter((project) => project.status === 'active').length;
  const openBugs = workspace.bugs.filter((bug) => bug.status === 'open' || bug.status === 'in_progress').length;
  const stats = [
    { label: t('Active projects'), value: activeProjects, to: '/projects' },
    { label: t('Open tasks'), value: countOpenTasks(workspace), to: '/tasks' },
    { label: t('Open bugs'), value: openBugs, to: '/bugs' },
    { label: t('Notes'), value: workspace.notes.length, to: '/notes' },
    { label: t('Snippets'), value: workspace.snippets.length, to: '/snippets' },
  ];

  return (
    <section aria-labelledby="stats-heading">
      <h2 id="stats-heading" className="sr-only">
        {t('Workspace summary')}
      </h2>
      <dl className="grid grid-cols-2 overflow-hidden rounded-card border border-line bg-line [gap:1px] sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <div key={stat.label} className="relative bg-surface transition-colors last:col-span-2 hover:bg-raised lg:last:col-span-1">
            <dt className="px-4 pt-3.5 text-xs text-subtle sm:px-5">
              <Link to={stat.to} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-accent-400">
                {stat.label}
              </Link>
            </dt>
            <dd className="px-4 pt-0.5 pb-3.5 font-mono text-[22px] font-medium text-fg tabular-nums sm:px-5">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
