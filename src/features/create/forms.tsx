import {
  BUG_PRIORITIES,
  BUG_STATUSES,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  bugInputSchema,
  formatLinkLines,
  noteInputSchema,
  projectInputSchema,
  snippetInputSchema,
  taskInputSchema,
  type Bug,
  type Note,
  type Project,
  type Snippet,
  type Task,
  type TagSelection,
} from '../../domain/models';
import { BUG_PRIORITY_LABELS, BUG_STATUS_LABELS, PROJECT_KIND_LABELS, PROJECT_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '../../domain/labels';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { useZodForm } from '../../hooks/useZodForm';
import { useWorkspaceActions } from '../../state/workspaceContext';
import { MarkdownEditor } from '../notes/MarkdownEditor';
import { TagField } from '../tags/TagSelector';
import { EntityForm } from './EntityForm';
import { ProjectReferenceSelect } from './ProjectReferenceSelect';
import type { CreatePreset } from './entityDialogContext';

/** Stored tag ids as the form's starting selection. */
const tagSelection = (entity: { tagIds: string[] } | undefined): TagSelection[] => entity?.tagIds.map((id) => ({ id })) ?? [];

/** Without `entity` the form creates a new item; with it, the form edits that item. */
export interface EntityFormComponentProps<T> {
  onDone: () => void;
  entity?: T | undefined;
  preset?: CreatePreset | undefined;
}

export function ProjectForm({ onDone, entity, preset }: EntityFormComponentProps<Project>) {
  const { createProject, updateProject } = useWorkspaceActions();
  const form = useZodForm(projectInputSchema, {
    name: entity?.name ?? preset?.title ?? '',
    description: entity?.description ?? '',
    kind: entity?.kind ?? 'web',
    status: entity?.status ?? 'active',
    technologies: entity?.technologies.join(', ') ?? '',
    links: formatLinkLines(entity?.links ?? []),
    tags: tagSelection(entity),
  });
  return (
    <EntityForm
      submitLabel={entity ? 'Save changes' : 'Create project'}
      successMessage={entity ? 'Project updated.' : 'Project created.'}
      onCancel={onDone}
      onSaved={onDone}
      onSubmit={() => {
        const input = form.validate();
        if (!input) return null;
        return entity ? updateProject(entity.id, input) : createProject(input);
      }}
    >
      <Field label="Name" error={form.errors.name}>
        {(field) => (
          <Input {...field} data-autofocus value={form.values.name} onChange={(e) => form.setValue('name', e.target.value)} placeholder="e.g. Obby Rush" autoComplete="off" />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" error={form.errors.kind}>
          {(field) => (
            <Select {...field} value={form.values.kind} onChange={(e) => form.setValue('kind', e.target.value)}>
              {PROJECT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {PROJECT_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Status" error={form.errors.status}>
          {(field) => (
            <Select {...field} value={form.values.status} onChange={(e) => form.setValue('status', e.target.value)}>
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PROJECT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Description" optional error={form.errors.description}>
        {(field) => (
          <Textarea {...field} value={form.values.description} onChange={(e) => form.setValue('description', e.target.value)} placeholder="What are you building?" />
        )}
      </Field>
      <Field label="Technologies" optional error={form.errors.technologies} hint="Separate with commas, e.g. React, TypeScript, Vite.">
        {(field) => (
          <Input {...field} value={form.values.technologies} onChange={(e) => form.setValue('technologies', e.target.value)} autoComplete="off" />
        )}
      </Field>
      <TagField value={form.values.tags} error={form.errors.tags} onChange={(tags) => form.setValue('tags', tags)} />
      <Field label="Links" optional error={form.errors.links} hint="One per line: https://… or Label | https://…">
        {(field) => (
          <Textarea
            {...field}
            spellCheck={false}
            className="min-h-20 font-mono text-[13px]"
            value={form.values.links}
            onChange={(e) => form.setValue('links', e.target.value)}
            placeholder="Repository | https://github.com/you/project"
          />
        )}
      </Field>
    </EntityForm>
  );
}

export function TaskForm({ onDone, entity, preset }: EntityFormComponentProps<Task>) {
  const { createTask, updateTask } = useWorkspaceActions();
  const form = useZodForm(taskInputSchema, {
    title: entity?.title ?? preset?.title ?? '',
    description: entity?.description ?? '',
    projectId: entity ? (entity.projectId ?? '') : (preset?.projectId ?? ''),
    status: entity?.status ?? 'todo',
    priority: entity?.priority ?? 'medium',
    dueDate: entity?.dueDate ?? preset?.dueDate ?? '',
    tags: tagSelection(entity),
  });
  return (
    <EntityForm
      submitLabel={entity ? 'Save changes' : 'Create task'}
      successMessage={entity ? 'Task updated.' : 'Task created.'}
      onCancel={onDone}
      onSaved={onDone}
      onSubmit={() => {
        const input = form.validate();
        if (!input) return null;
        return entity ? updateTask(entity.id, input) : createTask(input);
      }}
    >
      <Field label="Title" error={form.errors.title}>
        {(field) => (
          <Input {...field} data-autofocus value={form.values.title} onChange={(e) => form.setValue('title', e.target.value)} placeholder="e.g. Fix jump buffering" autoComplete="off" />
        )}
      </Field>
      <ProjectReferenceSelect value={form.values.projectId} error={form.errors.projectId} onChange={(v) => form.setValue('projectId', v)} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status" error={form.errors.status}>
          {(field) => (
            <Select {...field} value={form.values.status} onChange={(e) => form.setValue('status', e.target.value)}>
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {TASK_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Priority" error={form.errors.priority}>
          {(field) => (
            <Select {...field} value={form.values.priority} onChange={(e) => form.setValue('priority', e.target.value)}>
              {TASK_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {TASK_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <DueDateField value={form.values.dueDate} error={form.errors.dueDate} onChange={(value) => form.setValue('dueDate', value)} />
      </div>
      <Field label="Description" optional error={form.errors.description}>
        {(field) => (
          <Textarea {...field} value={form.values.description} onChange={(e) => form.setValue('description', e.target.value)} />
        )}
      </Field>
      <TagField value={form.values.tags} error={form.errors.tags} onChange={(tags) => form.setValue('tags', tags)} />
    </EntityForm>
  );
}

export function NoteForm({ onDone, entity, preset }: EntityFormComponentProps<Note>) {
  const { createNote, updateNote } = useWorkspaceActions();
  const form = useZodForm(noteInputSchema, {
    title: entity?.title ?? preset?.title ?? '',
    content: entity?.content ?? '',
    projectId: entity ? (entity.projectId ?? '') : (preset?.projectId ?? ''),
    tags: tagSelection(entity),
  });
  return (
    <EntityForm
      submitLabel={entity ? 'Save changes' : 'Create note'}
      successMessage={entity ? 'Note updated.' : 'Note created.'}
      onCancel={onDone}
      onSaved={onDone}
      onSubmit={() => {
        const input = form.validate();
        if (!input) return null;
        return entity ? updateNote(entity.id, input) : createNote(input);
      }}
    >
      <Field label="Title" error={form.errors.title}>
        {(field) => (
          <Input {...field} data-autofocus value={form.values.title} onChange={(e) => form.setValue('title', e.target.value)} placeholder="e.g. Save system architecture" autoComplete="off" />
        )}
      </Field>
      <ProjectReferenceSelect value={form.values.projectId} error={form.errors.projectId} onChange={(v) => form.setValue('projectId', v)} />
      <Field label="Content" optional error={form.errors.content} hint="Markdown supported: # headings, **bold**, *italic*, lists, `code`, ``` code blocks and [links](https://…).">
        {(field) => <MarkdownEditor field={field} value={form.values.content} onChange={(content) => form.setValue('content', content)} />}
      </Field>
      <TagField value={form.values.tags} error={form.errors.tags} onChange={(tags) => form.setValue('tags', tags)} />
    </EntityForm>
  );
}

export function SnippetForm({ onDone, entity, preset }: EntityFormComponentProps<Snippet>) {
  const { createSnippet, updateSnippet } = useWorkspaceActions();
  const form = useZodForm(snippetInputSchema, {
    title: entity?.title ?? preset?.title ?? '',
    language: entity?.language ?? '',
    code: entity?.code ?? '',
    description: entity?.description ?? '',
    projectId: entity ? (entity.projectId ?? '') : (preset?.projectId ?? ''),
    tags: tagSelection(entity),
  });
  return (
    <EntityForm
      submitLabel={entity ? 'Save changes' : 'Save snippet'}
      successMessage={entity ? 'Snippet updated.' : 'Snippet saved.'}
      onCancel={onDone}
      onSaved={onDone}
      onSubmit={() => {
        const input = form.validate();
        if (!input) return null;
        return entity ? updateSnippet(entity.id, input) : createSnippet(input);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field label="Title" error={form.errors.title}>
          {(field) => (
            <Input {...field} data-autofocus value={form.values.title} onChange={(e) => form.setValue('title', e.target.value)} placeholder="e.g. Debounce hook" autoComplete="off" />
          )}
        </Field>
        <Field label="Language" error={form.errors.language}>
          {(field) => (
            <Input {...field} list="snippet-languages" value={form.values.language} onChange={(e) => form.setValue('language', e.target.value)} placeholder="TypeScript" autoComplete="off" />
          )}
        </Field>
      </div>
      <datalist id="snippet-languages">
        {SNIPPET_LANGUAGE_SUGGESTIONS.map((language) => (
          <option key={language} value={language} />
        ))}
      </datalist>
      <Field label="Code" error={form.errors.code}>
        {(field) => (
          <Textarea
            {...field}
            spellCheck={false}
            className="min-h-44 font-mono text-[13px] [font-variant-ligatures:none]"
            value={form.values.code}
            onChange={(e) => form.setValue('code', e.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Description" optional error={form.errors.description}>
          {(field) => (
            <Input {...field} value={form.values.description} onChange={(e) => form.setValue('description', e.target.value)} />
          )}
        </Field>
        <ProjectReferenceSelect value={form.values.projectId} error={form.errors.projectId} onChange={(v) => form.setValue('projectId', v)} />
      </div>
      <TagField value={form.values.tags} error={form.errors.tags} onChange={(tags) => form.setValue('tags', tags)} />
    </EntityForm>
  );
}

export function BugForm({ onDone, entity, preset }: EntityFormComponentProps<Bug>) {
  const { createBug, updateBug } = useWorkspaceActions();
  const form = useZodForm(bugInputSchema, {
    title: entity?.title ?? preset?.title ?? '',
    description: entity?.description ?? '',
    projectId: entity ? (entity.projectId ?? '') : (preset?.projectId ?? ''),
    status: entity?.status ?? 'open',
    priority: entity?.priority ?? 'medium',
    dueDate: entity?.dueDate ?? preset?.dueDate ?? '',
    tags: tagSelection(entity),
  });
  return (
    <EntityForm
      submitLabel={entity ? 'Save changes' : 'Create bug'}
      successMessage={entity ? 'Bug updated.' : 'Bug created.'}
      onCancel={onDone}
      onSaved={onDone}
      onSubmit={() => {
        const input = form.validate();
        if (!input) return null;
        return entity ? updateBug(entity.id, input) : createBug(input);
      }}
    >
      <Field label="Title" error={form.errors.title}>
        {(field) => (
          <Input {...field} data-autofocus value={form.values.title} onChange={(e) => form.setValue('title', e.target.value)} placeholder="e.g. Player falls through the floor" autoComplete="off" />
        )}
      </Field>
      <ProjectReferenceSelect value={form.values.projectId} error={form.errors.projectId} onChange={(v) => form.setValue('projectId', v)} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status" error={form.errors.status}>
          {(field) => (
            <Select {...field} value={form.values.status} onChange={(e) => form.setValue('status', e.target.value)}>
              {BUG_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {BUG_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Priority" error={form.errors.priority}>
          {(field) => (
            <Select {...field} value={form.values.priority} onChange={(e) => form.setValue('priority', e.target.value)}>
              {BUG_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {BUG_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <DueDateField value={form.values.dueDate} error={form.errors.dueDate} onChange={(value) => form.setValue('dueDate', value)} />
      </div>
      <Field label="Description" optional error={form.errors.description} hint="What happens, what you expected, and how to reproduce it.">
        {(field) => (
          <Textarea {...field} value={form.values.description} onChange={(e) => form.setValue('description', e.target.value)} />
        )}
      </Field>
      <TagField value={form.values.tags} error={form.errors.tags} onChange={(tags) => form.setValue('tags', tags)} />
    </EntityForm>
  );
}

/** A native date picker; leaving it empty means "no due date". */
function DueDateField({ value, error, onChange }: { value: string; error: string | undefined; onChange: (value: string) => void }) {
  return (
    <Field label="Due date" optional error={error}>
      {(field) => <Input {...field} type="date" value={value} onChange={(e) => onChange(e.target.value)} className="[color-scheme:dark]" />}
    </Field>
  );
}

const SNIPPET_LANGUAGE_SUGGESTIONS = ['TypeScript', 'JavaScript', 'Luau', 'Lua', 'Python', 'C#', 'C++', 'Rust', 'Go', 'GDScript', 'SQL', 'Shell', 'HTML', 'CSS'];
