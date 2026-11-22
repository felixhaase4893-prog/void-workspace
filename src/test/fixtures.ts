import { createEmptyWorkspace, type Bug, type Note, type Project, type Snippet, type Tag, type Task, type Workspace } from '../domain/models';

export const FIXED_NOW = new Date('2026-01-15T10:00:00.000Z');

export function sequentialIds(prefix = 'id') {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    createdAt: FIXED_NOW.toISOString(),
    updatedAt: FIXED_NOW.toISOString(),
    name: 'Obby Rush',
    description: '',
    kind: 'roblox',
    status: 'active',
    technologies: [],
    links: [],
    tagIds: [],
    favorite: false,
    ...overrides,
  };
}

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    createdAt: FIXED_NOW.toISOString(),
    updatedAt: FIXED_NOW.toISOString(),
    title: 'Fix jump buffering',
    description: '',
    projectId: null,
    status: 'todo',
    priority: 'medium',
    dueDate: null,
    completedAt: null,
    tagIds: [],
    favorite: false,
    ...overrides,
  };
}

export function makeBug(overrides: Partial<Bug> = {}): Bug {
  return {
    id: 'bug-1',
    createdAt: FIXED_NOW.toISOString(),
    updatedAt: FIXED_NOW.toISOString(),
    title: 'Player falls through floor',
    description: '',
    projectId: null,
    status: 'open',
    priority: 'high',
    dueDate: null,
    resolvedAt: null,
    tagIds: [],
    favorite: false,
    ...overrides,
  };
}

export function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    createdAt: FIXED_NOW.toISOString(),
    updatedAt: FIXED_NOW.toISOString(),
    title: 'Save system',
    content: 'Use DataStore2.',
    projectId: null,
    tagIds: [],
    favorite: false,
    ...overrides,
  };
}

export function makeSnippet(overrides: Partial<Snippet> = {}): Snippet {
  return {
    id: 'snippet-1',
    createdAt: FIXED_NOW.toISOString(),
    updatedAt: FIXED_NOW.toISOString(),
    title: 'Debounce',
    language: 'TypeScript',
    code: 'export const debounce = () => {};',
    description: '',
    projectId: null,
    tagIds: [],
    favorite: false,
    ...overrides,
  };
}

export function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return { ...createEmptyWorkspace(), ...overrides };
}

export function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 'tag-1',
    createdAt: FIXED_NOW.toISOString(),
    updatedAt: FIXED_NOW.toISOString(),
    name: 'Frontend',
    color: null,
    ...overrides,
  };
}

/** The item as it was stored before favourites existed (data format v3 and older). */
export function withoutFavorite<T extends { favorite: boolean }>(item: T): Omit<T, 'favorite'> {
  const copy: Partial<T> = { ...item };
  delete copy.favorite;
  return copy as Omit<T, 'favorite'>;
}
