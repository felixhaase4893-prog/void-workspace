import {
  bugInputSchema,
  noteInputSchema,
  projectInputSchema,
  snippetInputSchema,
  taskInputSchema,
  type BugInput,
  type BugPriority,
  type EntityType,
  type NoteInput,
  type ProjectInput,
  type ProjectKind,
  type SnippetInput,
  type TaskInput,
  type TaskPriority,
} from '../../domain/models';

/** The order of the type switcher; Alt+1 … Alt+5 pick them. */
export const QUICK_ADD_TYPES: EntityType[] = ['task', 'project', 'note', 'snippet', 'bug'];

/**
 * Everything the palette can hold. Switching the type keeps what was typed,
 * so "type first, decide later" works.
 */
export interface QuickAddDraft {
  title: string;
  projectId: string;
  taskPriority: TaskPriority;
  bugPriority: BugPriority;
  dueDate: string;
  kind: ProjectKind;
  content: string;
  language: string;
  code: string;
}

export const EMPTY_DRAFT: QuickAddDraft = {
  title: '',
  projectId: '',
  taskPriority: 'medium',
  bugPriority: 'medium',
  dueDate: '',
  kind: 'web',
  content: '',
  language: '',
  code: '',
};

export type QuickAddInput =
  | { type: 'project'; input: ProjectInput }
  | { type: 'task'; input: TaskInput }
  | { type: 'note'; input: NoteInput }
  | { type: 'snippet'; input: SnippetInput }
  | { type: 'bug'; input: BugInput };

/** Field names of the draft that can show an error. */
export type QuickAddField = 'title' | 'language' | 'code' | 'dueDate' | 'content';

export type QuickAddValidation = { ok: true; value: QuickAddInput } | { ok: false; errors: Partial<Record<QuickAddField, string>> };

function collectErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): Partial<Record<QuickAddField, string>> {
  const errors: Partial<Record<QuickAddField, string>> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    // A project's "name" is the palette's title field.
    const field = key === 'name' ? 'title' : key;
    if (field === 'title' || field === 'language' || field === 'code' || field === 'dueDate' || field === 'content') errors[field] ??= issue.message;
  }
  return errors;
}

/** Validates the draft with the same schemas the full forms use. */
export function buildQuickAddInput(type: EntityType, draft: QuickAddDraft): QuickAddValidation {
  switch (type) {
    case 'project': {
      const result = projectInputSchema.safeParse({ name: draft.title, description: '', kind: draft.kind, tags: [] });
      return result.success ? { ok: true, value: { type, input: result.data } } : { ok: false, errors: collectErrors(result.error.issues) };
    }
    case 'task': {
      const result = taskInputSchema.safeParse({
        title: draft.title,
        description: '',
        projectId: draft.projectId,
        priority: draft.taskPriority,
        dueDate: draft.dueDate,
        tags: [],
      });
      return result.success ? { ok: true, value: { type, input: result.data } } : { ok: false, errors: collectErrors(result.error.issues) };
    }
    case 'note': {
      const result = noteInputSchema.safeParse({ title: draft.title, content: draft.content, projectId: draft.projectId, tags: [] });
      return result.success ? { ok: true, value: { type, input: result.data } } : { ok: false, errors: collectErrors(result.error.issues) };
    }
    case 'snippet': {
      const result = snippetInputSchema.safeParse({
        title: draft.title,
        language: draft.language,
        code: draft.code,
        description: '',
        projectId: draft.projectId,
        tags: [],
      });
      return result.success ? { ok: true, value: { type, input: result.data } } : { ok: false, errors: collectErrors(result.error.issues) };
    }
    case 'bug': {
      const result = bugInputSchema.safeParse({
        title: draft.title,
        description: '',
        projectId: draft.projectId,
        priority: draft.bugPriority,
        dueDate: '',
        tags: [],
      });
      return result.success ? { ok: true, value: { type, input: result.data } } : { ok: false, errors: collectErrors(result.error.issues) };
    }
  }
}
