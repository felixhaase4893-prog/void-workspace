import { ArrowRight, FolderKanban } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { PROJECT_KIND_LABELS } from '../../domain/labels';
import type { Workspace } from '../../domain/models';
import { taskProgress } from '../../domain/projectOverview';
import { getProjectSummaries } from '../../domain/workspace';
import { useEntityDialogs } from '../create/entityDialogContext';
import { t } from '../../i18n/translate';

const MAX_PROJECTS = 5;

export function ProjectsOverview({ workspace }: { workspace: Workspace }) {
  const { openCreateDialog } = useEntityDialogs();
  const summaries = getProjectSummaries(workspace);

  return (
    <Card>
      <CardHeader
        title={t('Projects')}
        description={summaries.length > 0 ? t('Most recently updated first') : undefined}
        action={
          summaries.length > 0 ? (
            <Link to="/projects" className="flex items-center gap-1 rounded text-xs text-muted hover:text-fg">
              {t('View all')} <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      {summaries.length === 0 ? (
        <div className="flex flex-col items-start gap-3 px-5 py-6">
          <p className="text-[13px] text-muted">{t('No projects yet. Projects group your tasks and notes.')}</p>
          <Button size="sm" icon={<FolderKanban />} onClick={() => openCreateDialog('project')}>
            {t('Create a project')}
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {summaries.slice(0, MAX_PROJECTS).map(({ project, openTasks, totalTasks }) => {
            const done = totalTasks - openTasks;
            const progress = taskProgress({ total: totalTasks, done }) ?? 0;
            return (
              <li key={project.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link to={`/projects/${project.id}`} className="truncate rounded text-[13px] font-medium text-fg hover:text-accent-200">
                      {project.name}
                    </Link>
                    <Badge>{PROJECT_KIND_LABELS[project.kind]}</Badge>
                    {project.status === 'paused' && <Badge tone="warning">{t('Paused')}</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-subtle">
                    {totalTasks === 0 ? t('No tasks yet') : t('{open} open · {done} done', { open: openTasks, done })}
                  </p>
                </div>
                {totalTasks > 0 && (
                  <div
                    role="progressbar"
                    aria-label={`${project.name} progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    className="hidden h-1 w-20 overflow-hidden rounded-full bg-raised sm:block"
                  >
                    <div className="h-full rounded-full bg-accent-500" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
