import { FolderKanban, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PROJECT_KIND_LABELS, PROJECT_STATUS_LABELS } from '../../domain/labels';
import { isOpenTask } from '../../domain/workspace';
import { formatRelativeTime } from '../../lib/format';
import { useWorkspace } from '../../state/workspaceContext';
import { ItemActions } from '../create/ItemActions';
import { FavoriteButton } from '../favorites/FavoriteButton';
import { FilterBar, NoMatches } from '../filters/FilterBar';
import { useListFilters } from '../filters/listFiltersContext';
import { TagList } from '../tags/TagList';
import { useEntityDialogs } from '../create/entityDialogContext';
import { PROJECT_STATUS_TONES } from './projectStatusTones';
import { t, tn } from '../../i18n/translate';

export function ProjectsPage() {
  const { projects, tasks } = useWorkspace();
  const { openCreateDialog } = useEntityDialogs();
  const filter = useListFilters('project');
  const now = new Date();

  const newButton = (
    <Button variant="primary" icon={<Plus />} onClick={() => openCreateDialog('project')}>
      {t('New project')}
    </Button>
  );

  return (
    <>
      <PageHeader title={t('Projects')} description={t('Everything you are building, from side projects to studio titles.')} actions={projects.length > 0 ? newButton : undefined} />
      {projects.length === 0 ? (
        <Card>
          <EmptyState icon={FolderKanban} title={t('No projects yet')} description={t('Create your first project to group the tasks, notes and snippets that belong together.')} action={newButton} quickAddHint />
        </Card>
      ) : (
        <>
          <FilterBar state={filter} />
          {filter.visible.length === 0 ? (
            <Card>
              <NoMatches state={filter} />
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filter.visible.map((project) => {
                const projectTasks = tasks.filter((task) => task.projectId === project.id);
                const open = projectTasks.filter(isOpenTask).length;
                return (
                  <li key={project.id} className="min-w-0">
                    <Card className="relative flex h-full flex-col p-5 transition-colors hover:border-line-strong">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="min-w-0 truncate text-sm font-semibold text-fg">
                          <Link
                            to={`/projects/${project.id}`}
                            className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent-400"
                          >
                            {project.name}
                          </Link>
                        </h2>
                        <div className="-my-1.5 -mr-2 flex shrink-0 items-center gap-1">
                          <Badge tone={PROJECT_STATUS_TONES[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
                          <FavoriteButton type="project" id={project.id} title={project.name} favorite={project.favorite} className="relative z-10" />
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-3 flex-1 text-[13px] leading-relaxed [overflow-wrap:anywhere] text-muted">
                        {project.description || <span className="text-subtle">{t('No description')}</span>}
                      </p>
                      {project.technologies.length > 0 && (
                        <p className="mt-3 truncate font-mono text-[11px] text-subtle">{project.technologies.join(' · ')}</p>
                      )}
                      <TagList tagIds={project.tagIds} max={4} className="mt-3" />
                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-subtle">
                        <Badge>{PROJECT_KIND_LABELS[project.kind]}</Badge>
                        <span className="min-w-0 flex-1 truncate text-right">
                          {tn('{count} open task · {time}|{count} open tasks · {time}', open, { time: formatRelativeTime(project.updatedAt, now) })}
                        </span>
                        <ItemActions type="project" id={project.id} title={project.name} className="relative z-10 -my-1.5 -mr-2" />
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
