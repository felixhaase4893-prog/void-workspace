import { ArrowLeft, Bug as BugIcon, Code2, ExternalLink, FolderKanban, ListChecks, Pencil, Plus, StickyNote, Trash2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { PROJECT_KIND_LABELS, PROJECT_STATUS_LABELS } from '../../domain/labels';
import type { EntityType } from '../../domain/models';
import { getProjectContents } from '../../domain/workspace';
import { useToday } from '../../hooks/useToday';
import { formatRelativeTime } from '../../lib/format';
import { useWorkspace } from '../../state/workspaceContext';
import { useEntityDialogs } from '../create/entityDialogContext';
import { FavoriteToggle } from '../favorites/FavoriteButton';
import { NoteCard } from '../notes/NoteCard';
import { SnippetCard } from '../snippets/SnippetCard';
import { TagList } from '../tags/TagList';
import { useItemTags } from '../tags/useTags';
import { BugRow } from '../bugs/BugRow';
import { TaskRow } from '../tasks/TaskRow';
import { ProjectOverviewPanel } from './ProjectOverviewPanel';
import { PROJECT_STATUS_TONES } from './projectStatusTones';

const backLink = (
  <Link to="/projects" className="mb-4 inline-flex items-center gap-1.5 rounded text-xs text-muted hover:text-fg">
    <ArrowLeft className="size-3.5" aria-hidden="true" /> All projects
  </Link>
);

export function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const workspace = useWorkspace();
  const { openCreateDialog, openEditDialog, openDeleteDialog } = useEntityDialogs();
  const navigate = useNavigate();
  const today = useToday();
  const now = new Date();

  const project = workspace.projects.find((candidate) => candidate.id === projectId);
  if (!project) {
    return (
      <>
        {backLink}
        <Card>
          <EmptyState
            icon={FolderKanban}
            title="Project not found"
            description="It may have been deleted, or the link is out of date."
            action={
              <Link to="/projects" className="text-[13px] font-medium text-accent-300 hover:text-accent-200">
                Back to projects
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const { tasks, notes, snippets, bugs } = getProjectContents(workspace, project.id);
  const isEmpty = tasks.length === 0 && notes.length === 0 && snippets.length === 0 && bugs.length === 0;
  const create = (type: EntityType) => openCreateDialog(type, { projectId: project.id });

  return (
    <>
      {backLink}
      <PageHeader
        eyebrow={PROJECT_KIND_LABELS[project.kind]}
        title={project.name}
        description={project.description || undefined}
        actions={
          <>
            <FavoriteToggle type="project" id={project.id} title={project.name} favorite={project.favorite} />
            <Button icon={<Pencil />} onClick={() => openEditDialog('project', project.id)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              icon={<Trash2 />}
              className="hover:text-danger"
              onClick={() => openDeleteDialog('project', project.id, { onDeleted: () => navigate('/projects') })}
            >
              Delete
            </Button>
          </>
        }
      />

      <div className="animate-rise min-w-0 space-y-6">
        <ProjectOverviewPanel workspace={workspace} projectId={project.id} today={today} />
        <Card className="p-5">
          <dl className="grid gap-x-8 gap-y-4 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Status">
              <Badge tone={PROJECT_STATUS_TONES[project.status]}>{PROJECT_STATUS_LABELS[project.status]}</Badge>
            </Detail>
            <Detail label="Created">{formatRelativeTime(project.createdAt, now)}</Detail>
            <Detail label="Last updated">{formatRelativeTime(project.updatedAt, now)}</Detail>
            <ProjectTags tagIds={project.tagIds} />
            <Detail label="Technologies" wide>
              {project.technologies.length === 0 ? (
                <span className="text-subtle">None added</span>
              ) : (
                <ul className="flex flex-wrap gap-1.5" aria-label="Technologies">
                  {project.technologies.map((technology) => (
                    <li key={technology}>
                      <Badge tone="accent">{technology}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Detail>
            <Detail label="Links" wide>
              {project.links.length === 0 ? (
                <span className="text-subtle">None added</span>
              ) : (
                <ul className="space-y-1">
                  {project.links.map((link) => (
                    <li key={link.url} className="min-w-0">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 rounded text-accent-300 hover:text-accent-200"
                      >
                        <span className="truncate">{link.label || link.url}</span>
                        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Detail>
          </dl>
        </Card>

        {isEmpty && (
          <Card>
            <EmptyState
              icon={FolderKanban}
              title="Nothing in this project yet"
              description="Add the first task, bug, note or snippet. Everything you add here is linked to this project."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="sm" icon={<ListChecks />} onClick={() => create('task')}>
                    Add task
                  </Button>
                  <Button size="sm" icon={<BugIcon />} onClick={() => create('bug')}>
                    Add bug
                  </Button>
                  <Button size="sm" icon={<StickyNote />} onClick={() => create('note')}>
                    Add note
                  </Button>
                  <Button size="sm" icon={<Code2 />} onClick={() => create('snippet')}>
                    Add snippet
                  </Button>
                </div>
              }
            />
          </Card>
        )}

        {!isEmpty && (
          <>
            <Section title="Tasks" count={tasks.length} icon={ListChecks} emptyText="No tasks in this project." onAdd={() => create('task')} addLabel="Add task">
              {tasks.length > 0 && (
                <Card>
                  <ul className="divide-y divide-line">
                    {tasks.map((task) => (
                      <TaskRow key={task.id} task={task} />
                    ))}
                  </ul>
                </Card>
              )}
            </Section>
            <Section title="Bugs" count={bugs.length} icon={BugIcon} emptyText="No bugs in this project." onAdd={() => create('bug')} addLabel="Add bug">
              {bugs.length > 0 && (
                <Card>
                  <ul className="divide-y divide-line">
                    {bugs.map((bug) => (
                      <BugRow key={bug.id} bug={bug} />
                    ))}
                  </ul>
                </Card>
              )}
            </Section>
            <Section title="Notes" count={notes.length} icon={StickyNote} emptyText="No notes in this project." onAdd={() => create('note')} addLabel="Add note">
              {notes.length > 0 && (
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {notes.map((note) => (
                    <li key={note.id} className="min-w-0">
                      <NoteCard note={note} now={now} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="Snippets" count={snippets.length} icon={Code2} emptyText="No snippets in this project." onAdd={() => create('snippet')} addLabel="Add snippet">
              {snippets.length > 0 && (
                <ul className="grid gap-4 lg:grid-cols-2">
                  {snippets.map((snippet) => (
                    <li key={snippet.id} className="min-w-0">
                      <SnippetCard snippet={snippet} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}
      </div>
    </>
  );
}

/** Hidden entirely when all of the project's tags were deleted meanwhile. */
function ProjectTags({ tagIds }: { tagIds: string[] }) {
  const tags = useItemTags(tagIds);
  if (tags.length === 0) return null;
  return (
    <Detail label="Tags" wide>
      <TagList tagIds={tagIds} />
    </Detail>
  );
}

function Detail({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
      <dt className="mb-1 text-xs text-subtle">{label}</dt>
      <dd className="[overflow-wrap:anywhere] text-fg">{children}</dd>
    </div>
  );
}

interface SectionProps {
  title: string;
  count: number;
  icon: LucideIcon;
  emptyText: string;
  addLabel: string;
  onAdd: () => void;
  children: ReactNode;
}

function Section({ title, count, icon: Icon, emptyText, addLabel, onAdd, children }: SectionProps) {
  const id = `project-${title.toLowerCase()}`;
  return (
    <section aria-labelledby={id}>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id={id} className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Icon className="size-4 text-subtle" aria-hidden="true" />
          {title}
          <span className="font-mono text-[11px] font-normal text-subtle">{count}</span>
        </h2>
        <Button size="sm" variant="ghost" icon={<Plus />} onClick={onAdd}>
          {addLabel}
        </Button>
      </div>
      {count === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong px-5 py-4 text-[13px] text-subtle">{emptyText}</p>
      ) : (
        children
      )}
    </section>
  );
}
