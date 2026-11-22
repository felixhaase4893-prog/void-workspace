import type {
  Bug,
  BugInput,
  BugStatus,
  EntityOfType,
  EntityType,
  Note,
  NoteInput,
  Project,
  ProjectInput,
  Snippet,
  SnippetInput,
  Task,
  TaskInput,
  TaskStatus,
  Workspace,
} from './models';
import { resolveTagSelection } from './tags';

/**
 * Pure workspace operations. They never touch storage or React, which keeps
 * them easy to test and lets a future sync layer reuse them unchanged.
 */

export interface OperationContext {
  now: Date;
  createId: () => string;
}

function stamp(context: OperationContext) {
  const iso = context.now.toISOString();
  return { id: context.createId(), createdAt: iso, updatedAt: iso };
}

export function addProject(workspace: Workspace, input: ProjectInput, context: OperationContext): Workspace {
  const { tags, ...fields } = input;
  const resolved = resolveTagSelection(workspace, tags, context);
  const project: Project = { ...stamp(context), ...fields, tagIds: resolved.tagIds, favorite: false };
  return { ...resolved.workspace, projects: [project, ...workspace.projects] };
}

export function addTask(workspace: Workspace, input: TaskInput, context: OperationContext): Workspace {
  const { tags, ...fields } = input;
  const resolved = resolveTagSelection(workspace, tags, context);
  const task: Task = { ...stamp(context), ...fields, dueDate: input.dueDate ?? null, completedAt: null, projectId: existingProjectId(workspace, input.projectId), tagIds: resolved.tagIds, favorite: false };
  return { ...resolved.workspace, tasks: [task, ...workspace.tasks] };
}

export function addNote(workspace: Workspace, input: NoteInput, context: OperationContext): Workspace {
  const { tags, ...fields } = input;
  const resolved = resolveTagSelection(workspace, tags, context);
  const note: Note = { ...stamp(context), ...fields, projectId: existingProjectId(workspace, input.projectId), tagIds: resolved.tagIds, favorite: false };
  return { ...resolved.workspace, notes: [note, ...workspace.notes] };
}

export function addSnippet(workspace: Workspace, input: SnippetInput, context: OperationContext): Workspace {
  const { tags, ...fields } = input;
  const resolved = resolveTagSelection(workspace, tags, context);
  const snippet: Snippet = { ...stamp(context), ...fields, projectId: existingProjectId(workspace, input.projectId), tagIds: resolved.tagIds, favorite: false };
  return { ...resolved.workspace, snippets: [snippet, ...workspace.snippets] };
}

export function addBug(workspace: Workspace, input: BugInput, context: OperationContext): Workspace {
  const { tags, ...fields } = input;
  const resolved = resolveTagSelection(workspace, tags, context);
  const bug: Bug = { ...stamp(context), ...fields, dueDate: input.dueDate ?? null, resolvedAt: null, projectId: existingProjectId(workspace, input.projectId), tagIds: resolved.tagIds, favorite: false };
  return { ...resolved.workspace, bugs: [bug, ...workspace.bugs] };
}

export function setBugStatus(workspace: Workspace, bugId: string, status: BugStatus, context: Pick<OperationContext, 'now'>): Workspace {
  if (!workspace.bugs.some((bug) => bug.id === bugId && bug.status !== status)) return workspace;
  return {
    ...workspace,
    bugs: workspace.bugs.map((bug) => (bug.id === bugId ? { ...bug, status, updatedAt: context.now.toISOString() } : bug)),
  };
}

export function setTaskStatus(
  workspace: Workspace,
  taskId: string,
  status: TaskStatus,
  context: Pick<OperationContext, 'now'>,
): Workspace {
  return {
    ...workspace,
    tasks: workspace.tasks.map((task) =>
      task.id === taskId && task.status !== status
        ? { ...task, status, updatedAt: context.now.toISOString() }
        : task,
    ),
  };
}

/* ---------- Favourites ---------- */

const COLLECTION_OF = { project: 'projects', task: 'tasks', note: 'notes', snippet: 'snippets', bug: 'bugs' } as const satisfies Record<EntityType, keyof Workspace>;

/**
 * Marks or unmarks one item as a favourite. This is a personal marker, not an
 * edit: `updatedAt` stays as it is, so "recently edited" lists do not change.
 * Unknown ids or an unchanged value return the same workspace object.
 */
export function setFavorite(workspace: Workspace, type: EntityType, id: string, favorite: boolean): Workspace {
  const key = COLLECTION_OF[type];
  const items: ReadonlyArray<{ id: string; favorite: boolean }> = workspace[key];
  if (!items.some((item) => item.id === id && item.favorite !== favorite)) return workspace;
  const toggle = <T extends { id: string; favorite: boolean }>(list: T[]): T[] =>
    list.map((item) => (item.id === id ? { ...item, favorite } : item));
  switch (key) {
    case 'projects':
      return { ...workspace, projects: toggle(workspace.projects) };
    case 'tasks':
      return { ...workspace, tasks: toggle(workspace.tasks) };
    case 'notes':
      return { ...workspace, notes: toggle(workspace.notes) };
    case 'snippets':
      return { ...workspace, snippets: toggle(workspace.snippets) };
    case 'bugs':
      return { ...workspace, bugs: toggle(workspace.bugs) };
  }
}

/* ---------- Editing and deleting ---------- */

/** `createId` is only needed when a form created new tags; it falls back to random ids. */
type UpdateContext = Pick<OperationContext, 'now'> & Partial<Pick<OperationContext, 'createId'>>;

/** Replaces the editable fields of one item. Unknown ids leave the list unchanged. */
function updateItem<T extends { id: string; updatedAt: string }>(items: T[], id: string, changes: Partial<T>, context: UpdateContext): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...changes, updatedAt: context.now.toISOString() } : item));
}

/** New tags are only created if the item being edited actually exists. */
function withTags<K extends 'projects' | 'tasks' | 'notes' | 'snippets' | 'bugs'>(
  workspace: Workspace,
  key: K,
  id: string,
  tags: ProjectInput['tags'],
  context: UpdateContext,
): { workspace: Workspace; tagIds: string[] } {
  const items: ReadonlyArray<{ id: string }> = workspace[key];
  if (!items.some((item) => item.id === id)) return { workspace, tagIds: [] };
  return resolveTagSelection(workspace, tags, context);
}

export function updateProject(workspace: Workspace, projectId: string, input: ProjectInput, context: UpdateContext): Workspace {
  const { tags, ...fields } = input;
  const resolved = withTags(workspace, 'projects', projectId, tags, context);
  return { ...resolved.workspace, projects: updateItem(workspace.projects, projectId, { ...fields, tagIds: resolved.tagIds }, context) };
}

export function updateTask(workspace: Workspace, taskId: string, input: TaskInput, context: UpdateContext): Workspace {
  const { tags, ...fields } = input;
  const resolved = withTags(workspace, 'tasks', taskId, tags, context);
  const changes = { ...fields, dueDate: input.dueDate ?? null, projectId: existingProjectId(workspace, input.projectId), tagIds: resolved.tagIds };
  return { ...resolved.workspace, tasks: updateItem(workspace.tasks, taskId, changes, context) };
}

export function updateNote(workspace: Workspace, noteId: string, input: NoteInput, context: UpdateContext): Workspace {
  const { tags, ...fields } = input;
  const resolved = withTags(workspace, 'notes', noteId, tags, context);
  const changes = { ...fields, projectId: existingProjectId(workspace, input.projectId), tagIds: resolved.tagIds };
  return { ...resolved.workspace, notes: updateItem(workspace.notes, noteId, changes, context) };
}

export function updateSnippet(workspace: Workspace, snippetId: string, input: SnippetInput, context: UpdateContext): Workspace {
  const { tags, ...fields } = input;
  const resolved = withTags(workspace, 'snippets', snippetId, tags, context);
  const changes = { ...fields, projectId: existingProjectId(workspace, input.projectId), tagIds: resolved.tagIds };
  return { ...resolved.workspace, snippets: updateItem(workspace.snippets, snippetId, changes, context) };
}

export function updateBug(workspace: Workspace, bugId: string, input: BugInput, context: UpdateContext): Workspace {
  const { tags, ...fields } = input;
  const resolved = withTags(workspace, 'bugs', bugId, tags, context);
  const changes = { ...fields, dueDate: input.dueDate ?? null, projectId: existingProjectId(workspace, input.projectId), tagIds: resolved.tagIds };
  return { ...resolved.workspace, bugs: updateItem(workspace.bugs, bugId, changes, context) };
}

export interface DeleteProjectOptions {
  /** `true` deletes the project's tasks, notes, snippets and bugs too; otherwise they are kept without a project. */
  deleteContents: boolean;
}

export function deleteProject(
  workspace: Workspace,
  projectId: string,
  { deleteContents }: DeleteProjectOptions,
  context: UpdateContext,
): Workspace {
  const now = context.now.toISOString();
  const belongs = (item: { projectId: string | null }) => item.projectId === projectId;
  const handle = <T extends { projectId: string | null; updatedAt: string }>(items: T[]): T[] =>
    deleteContents
      ? items.filter((item) => !belongs(item))
      : items.map((item) => (belongs(item) ? { ...item, projectId: null, updatedAt: now } : item));
  return {
    ...workspace,
    projects: workspace.projects.filter((project) => project.id !== projectId),
    tasks: handle(workspace.tasks),
    notes: handle(workspace.notes),
    snippets: handle(workspace.snippets),
    bugs: handle(workspace.bugs),
  };
}

export function deleteTask(workspace: Workspace, taskId: string): Workspace {
  return { ...workspace, tasks: workspace.tasks.filter((task) => task.id !== taskId) };
}

export function deleteNote(workspace: Workspace, noteId: string): Workspace {
  return { ...workspace, notes: workspace.notes.filter((note) => note.id !== noteId) };
}

export function deleteSnippet(workspace: Workspace, snippetId: string): Workspace {
  return { ...workspace, snippets: workspace.snippets.filter((snippet) => snippet.id !== snippetId) };
}

export function deleteBug(workspace: Workspace, bugId: string): Workspace {
  return { ...workspace, bugs: workspace.bugs.filter((bug) => bug.id !== bugId) };
}

function existingProjectId(workspace: Workspace, projectId: string | null): string | null {
  if (projectId === null) return null;
  return workspace.projects.some((project) => project.id === projectId) ? projectId : null;
}

/* ---------- Selectors ---------- */

export function isOpenTask(task: Task): boolean {
  return task.status !== 'done';
}

export function countOpenTasks(workspace: Workspace): number {
  return workspace.tasks.filter(isOpenTask).length;
}

export function isWorkspaceEmpty(workspace: Workspace): boolean {
  return (
    workspace.projects.length === 0 &&
    workspace.tasks.length === 0 &&
    workspace.notes.length === 0 &&
    workspace.snippets.length === 0 &&
    workspace.bugs.length === 0
  );
}

export interface ProjectSummary {
  project: Project;
  openTasks: number;
  totalTasks: number;
}

export function getProjectSummaries(workspace: Workspace): ProjectSummary[] {
  return workspace.projects
    .filter((project) => project.status !== 'archived')
    .map((project) => {
      const tasks = workspace.tasks.filter((task) => task.projectId === project.id);
      return { project, openTasks: tasks.filter(isOpenTask).length, totalTasks: tasks.length };
    })
    .sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt));
}

export interface RecentItem {
  type: EntityType;
  id: string;
  title: string;
  updatedAt: string;
}

export function getRecentItems(workspace: Workspace, limit = 6): RecentItem[] {
  const items: RecentItem[] = [
    ...workspace.projects.map((p) => ({ type: 'project' as const, id: p.id, title: p.name, updatedAt: p.updatedAt })),
    ...workspace.tasks.map((t) => ({ type: 'task' as const, id: t.id, title: t.title, updatedAt: t.updatedAt })),
    ...workspace.notes.map((n) => ({ type: 'note' as const, id: n.id, title: n.title, updatedAt: n.updatedAt })),
    ...workspace.snippets.map((s) => ({ type: 'snippet' as const, id: s.id, title: s.title, updatedAt: s.updatedAt })),
    ...workspace.bugs.map((b) => ({ type: 'bug' as const, id: b.id, title: b.title, updatedAt: b.updatedAt })),
  ];
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

export interface ProjectContents {
  tasks: Task[];
  notes: Note[];
  snippets: Snippet[];
  bugs: Bug[];
}

export function getProjectContents(workspace: Workspace, projectId: string): ProjectContents {
  return {
    tasks: workspace.tasks.filter((task) => task.projectId === projectId),
    notes: workspace.notes.filter((note) => note.projectId === projectId),
    snippets: workspace.snippets.filter((snippet) => snippet.projectId === projectId),
    bugs: workspace.bugs.filter((bug) => bug.projectId === projectId),
  };
}

/** Looks up any item by type and id, e.g. for edit and delete dialogs. */
export function findEntity<T extends EntityType>(workspace: Workspace, type: T, id: string): EntityOfType[T] | null {
  const lists: { [K in EntityType]: Array<EntityOfType[K]> } = {
    project: workspace.projects,
    task: workspace.tasks,
    note: workspace.notes,
    snippet: workspace.snippets,
    bug: workspace.bugs,
  };
  const items: Array<EntityOfType[T]> = lists[type];
  return items.find((item) => item.id === id) ?? null;
}

export function getEntityTitle(entity: Project | Task | Note | Snippet | Bug): string {
  return 'name' in entity ? entity.name : entity.title;
}

export function getProjectName(workspace: Workspace, projectId: string | null): string | null {
  if (projectId === null) return null;
  return workspace.projects.find((project) => project.id === projectId)?.name ?? null;
}
