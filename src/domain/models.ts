import { z } from 'zod';
import { t, type MessageKey } from '../i18n/translate';

/**
 * Central data models for VOID.
 *
 * Every persisted entity is defined here as a Zod schema, and the TypeScript
 * types are inferred from those schemas, so validation and types never drift.
 */

const id = z.string().min(1);
const timestamp = z.iso.datetime();
const optionalProjectId = id.nullable();

const entityBase = {
  id,
  createdAt: timestamp,
  updatedAt: timestamp,
};

export const PROJECT_KINDS = ['web', 'software', 'app', 'game', 'roblox', 'other'] as const;
export const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const;
export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export const BUG_STATUSES = ['open', 'in_progress', 'fixed', 'closed'] as const;
export const BUG_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export const projectKindSchema = z.enum(PROJECT_KINDS);
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const taskStatusSchema = z.enum(TASK_STATUSES);
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export const bugStatusSchema = z.enum(BUG_STATUSES);
export const bugPrioritySchema = z.enum(BUG_PRIORITIES);

/* ---------- Due dates ---------- */

/**
 * A due date is a calendar day in the user's own time zone, stored as
 * `YYYY-MM-DD` without a time. "Due on the 24th" therefore stays the 24th
 * wherever and whenever VOID is opened, and never shifts by a day because of
 * UTC offsets or daylight saving time.
 */
export const DUE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True for real calendar days like 2026-02-28, false for 2026-02-30 or other text. */
export function isValidDueDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DUE_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && year >= 1970 && year <= 9999;
}

export const dueDateSchema = z.string().refine(isValidDueDate, { error: () => t('Enter a valid date.') });

/** Optional and forgiving when loading: a missing or unreadable due date simply means "no due date". */
const storedDueDate = dueDateSchema.nullable().catch(null);

/**
 * When a task was completed or a bug was resolved (VOID 4.2). Added without a
 * format change: data from before 4.2 simply has no value, which means "date
 * unknown", never a guessed date.
 */
const storedMilestone = timestamp.nullable().catch(null);

export const MAX_TECHNOLOGIES = 20;
export const MAX_LINKS = 10;

/* ---------- Tags ---------- */

/** A small, hand-picked palette that stays readable on the dark surfaces. `null` means the calm default look. */
export const TAG_COLORS = ['violet', 'blue', 'teal', 'green', 'amber', 'orange', 'red', 'pink', 'slate'] as const;
export const MAX_TAG_NAME_LENGTH = 40;
export const MAX_TAGS_PER_ITEM = 20;
/** Far more than anyone needs; keeps suggestion lists and the settings page usable. */
export const MAX_TAGS = 500;

export const tagColorSchema = z.enum(TAG_COLORS);

/** "  Game   Jam " → "Game Jam": the spelling the user chose, without stray whitespace. */
export function normalizeTagName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** Tags are compared case-insensitively: "UI", "ui" and " Ui " are the same tag. */
export function tagKey(name: string): string {
  return normalizeTagName(name).toLowerCase();
}

export const tagSchema = z.object({
  ...entityBase,
  name: z.string().trim().min(1).max(MAX_TAG_NAME_LENGTH),
  // Purely visual: an unknown colour (e.g. from a hand-edited file) falls back to the default instead of failing the whole load.
  color: tagColorSchema.nullable().catch(null),
});

/** Ids of the tags an item carries, in the order they were added. Duplicates are dropped. */
const tagIdList = z
  .array(id)
  .max(MAX_TAGS_PER_ITEM)
  .transform((ids) => Array.from(new Set(ids)))
  .default([]);

/**
 * Favourites are a personal marker, not content. Anything that is not exactly
 * `true` (missing in older data, or garbage from a hand-edited file) means
 * "not a favourite" instead of making the whole workspace unreadable.
 */
const favoriteFlag = z.boolean().catch(false);

const technologySchema = z.string().trim().min(1).max(40);

export const projectLinkSchema = z.object({
  label: z.string().max(60),
  url: z.url({ protocol: /^https?$/, error: () => t('Links must be full http(s) URLs, e.g. https://github.com/you/repo.') }),
});

export const projectSchema = z.object({
  ...entityBase,
  name: z.string().min(1).max(80),
  description: z.string().max(500),
  kind: projectKindSchema,
  status: projectStatusSchema,
  technologies: z.array(technologySchema).max(MAX_TECHNOLOGIES),
  links: z.array(projectLinkSchema).max(MAX_LINKS),
  tagIds: tagIdList,
  favorite: favoriteFlag,
});

export const taskSchema = z.object({
  ...entityBase,
  title: z.string().min(1).max(160),
  description: z.string().max(2000),
  projectId: optionalProjectId,
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  dueDate: storedDueDate,
  completedAt: storedMilestone,
  tagIds: tagIdList,
  favorite: favoriteFlag,
});

export const MAX_BUG_DESCRIPTION_LENGTH = 5000;

export const bugSchema = z.object({
  ...entityBase,
  title: z.string().min(1).max(160),
  description: z.string().max(MAX_BUG_DESCRIPTION_LENGTH),
  projectId: optionalProjectId,
  status: bugStatusSchema,
  priority: bugPrioritySchema,
  dueDate: storedDueDate,
  resolvedAt: storedMilestone,
  tagIds: tagIdList,
  favorite: favoriteFlag,
});

export const noteSchema = z.object({
  ...entityBase,
  title: z.string().min(1).max(160),
  content: z.string().max(50_000),
  projectId: optionalProjectId,
  tagIds: tagIdList,
  favorite: favoriteFlag,
});

export const snippetSchema = z.object({
  ...entityBase,
  title: z.string().min(1).max(160),
  language: z.string().min(1).max(40),
  code: z.string().min(1).max(50_000),
  description: z.string().max(500),
  projectId: optionalProjectId,
  tagIds: tagIdList,
  favorite: favoriteFlag,
});

export type ProjectKind = z.infer<typeof projectKindSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
export type BugStatus = z.infer<typeof bugStatusSchema>;
export type BugPriority = z.infer<typeof bugPrioritySchema>;

export type TagColor = z.infer<typeof tagColorSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type ProjectLink = z.infer<typeof projectLinkSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Snippet = z.infer<typeof snippetSchema>;
export type Bug = z.infer<typeof bugSchema>;

/** Current version of the persisted data format. Bump it together with a migration. */
export const WORKSPACE_SCHEMA_VERSION = 5;

export const workspaceSchema = z.object({
  schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
  projects: z.array(projectSchema),
  tasks: z.array(taskSchema),
  notes: z.array(noteSchema),
  snippets: z.array(snippetSchema),
  bugs: z.array(bugSchema).default([]),
  tags: z.array(tagSchema).max(MAX_TAGS).default([]),
});

export type Workspace = z.infer<typeof workspaceSchema>;

export type EntityType = 'project' | 'task' | 'note' | 'snippet' | 'bug';

export interface EntityOfType {
  project: Project;
  task: Task;
  note: Note;
  snippet: Snippet;
  bug: Bug;
}

export function createEmptyWorkspace(): Workspace {
  return {
    schemaVersion: WORKSPACE_SCHEMA_VERSION,
    projects: [],
    tasks: [],
    notes: [],
    snippets: [],
    bugs: [],
    tags: [],
  };
}

/* ---------- Inputs for creating entities (used by forms) ---------- */

// Messages are built when a form is validated, so they use the language active then.
const requiredText = (label: MessageKey, max: number) =>
  z
    .string()
    .trim()
    .min(1, { error: () => t('{label} is required.', { label: t(label) }) })
    .max(max, { error: () => t('{label} must be at most {max} characters.', { label: t(label), max }) });

const optionalText = (label: MessageKey, max: number) =>
  z.string().trim().max(max, { error: () => t('{label} must be at most {max} characters.', { label: t(label), max }) });

/** A date input gives "" for "no date"; anything else must be a real calendar day. */
const dueDateInput = z
  .string()
  .transform((value) => (value.trim() === '' ? null : value.trim()))
  .pipe(dueDateSchema.nullable())
  .default(null);

const projectReference = z
  .string()
  .transform((value) => (value === '' ? null : value))
  .pipe(optionalProjectId);

/** "React, TypeScript, Vite" → ["React", "TypeScript", "Vite"], without duplicates. */
const technologyList = z
  .string()
  .transform((value) => {
    const seen = new Set<string>();
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '' && !seen.has(item.toLowerCase()) && seen.add(item.toLowerCase()));
  })
  .pipe(
    z
      .array(technologySchema.max(40, { error: () => t('Each technology must be at most 40 characters.') }))
      .max(MAX_TECHNOLOGIES, { error: () => t('Add at most {max} technologies.', { max: MAX_TECHNOLOGIES }) }),
  );

/**
 * One link per line, either `https://…` or `Label | https://…`.
 * Exported so the edit form can turn stored links back into the same text.
 */
export function parseLinkLines(value: string): Array<{ label: string; url: string }> {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => {
      const separator = line.lastIndexOf('|');
      if (separator === -1) return { label: '', url: line };
      return { label: line.slice(0, separator).trim(), url: line.slice(separator + 1).trim() };
    });
}

export function formatLinkLines(links: ReadonlyArray<{ label: string; url: string }>): string {
  return links.map((link) => (link.label ? `${link.label} | ${link.url}` : link.url)).join('\n');
}

const linkList = z
  .string()
  .transform(parseLinkLines)
  .pipe(
    z
      .array(projectLinkSchema.extend({ label: z.string().max(60, { error: () => t('Link labels must be at most 60 characters.') }) }))
      .max(MAX_LINKS, { error: () => t('Add at most {max} links.', { max: MAX_LINKS }) }),
  );

/**
 * A tag picked in a form: an existing tag by id, or a new one by name. New
 * tags are only created when the form is saved, so cancelling leaves no trace.
 */
export const tagSelectionSchema = z.union([
  z.object({ id }),
  z.object({
    name: z
      .string()
      .transform(normalizeTagName)
      .pipe(
        z
          .string()
          .min(1, { error: () => t('Tag names cannot be empty.') })
          .max(MAX_TAG_NAME_LENGTH, { error: () => t('Tag names must be at most {max} characters.', { max: MAX_TAG_NAME_LENGTH }) }),
      ),
  }),
]);

const tagSelectionList = z
  .array(tagSelectionSchema)
  .max(MAX_TAGS_PER_ITEM, { error: () => t('Add at most {max} tags.', { max: MAX_TAGS_PER_ITEM }) })
  .default([]);

export type TagSelection = z.infer<typeof tagSelectionSchema>;

export const projectInputSchema = z.object({
  name: requiredText('Name', 80),
  description: optionalText('Description', 500),
  kind: projectKindSchema,
  status: projectStatusSchema.default('active'),
  technologies: technologyList.default([]),
  links: linkList.default([]),
  tags: tagSelectionList,
});

export const taskInputSchema = z.object({
  title: requiredText('Title', 160),
  description: optionalText('Description', 2000),
  projectId: projectReference,
  status: taskStatusSchema.default('todo'),
  priority: taskPrioritySchema,
  dueDate: dueDateInput,
  tags: tagSelectionList,
});

export const bugInputSchema = z.object({
  title: requiredText('Title', 160),
  description: optionalText('Description', MAX_BUG_DESCRIPTION_LENGTH),
  projectId: projectReference,
  status: bugStatusSchema.default('open'),
  priority: bugPrioritySchema,
  dueDate: dueDateInput,
  tags: tagSelectionList,
});

export const noteInputSchema = z.object({
  title: requiredText('Title', 160),
  content: optionalText('Content', 50_000),
  projectId: projectReference,
  tags: tagSelectionList,
});

export const snippetInputSchema = z.object({
  title: requiredText('Title', 160),
  language: requiredText('Language', 40),
  code: z.string().min(1, { error: () => t('Code is required.') }).max(50_000, { error: () => t('Code must be at most 50000 characters.') }),
  description: optionalText('Description', 500),
  projectId: projectReference.default(null),
  tags: tagSelectionList,
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
/** The due date may be left out entirely (e.g. by older callers); that means "no due date". */
export type TaskInput = Omit<z.infer<typeof taskInputSchema>, 'dueDate'> & { dueDate?: string | null };
export type NoteInput = z.infer<typeof noteInputSchema>;
export type SnippetInput = z.infer<typeof snippetInputSchema>;
export type BugInput = Omit<z.infer<typeof bugInputSchema>, 'dueDate'> & { dueDate?: string | null };
