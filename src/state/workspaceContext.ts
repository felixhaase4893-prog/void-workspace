import { createContext, useContext } from 'react';

import type { BugBulkChange, BulkEditRecord, TaskBulkChange } from '../domain/bulk';
import type { ImportMode, ImportStats } from '../domain/import';
import type { BugInput, BugStatus, EntityType, NoteInput, ProjectInput, SnippetInput, TaskInput, TaskStatus, Workspace } from '../domain/models';
import type { TagError, TagInput } from '../domain/tags';
import type { DeletionRecord } from '../domain/undo';
import type { DeleteProjectOptions } from '../domain/workspace';
import type { Result } from '../lib/result';
import type { StorageError } from '../storage/errors';
import type { WorkspaceRepository } from '../storage/workspaceRepository';

export type WorkspaceState =
  | { status: 'loading' }
  | { status: 'error'; error: StorageError }
  | { status: 'ready'; workspace: Workspace };

export type SaveResult = Result<void, StorageError>;

/** Tag changes can also be refused before saving, e.g. for a duplicate name. */
export type TagSaveResult = Result<void, StorageError | TagError>;

export interface WorkspaceActions {
  createProject(input: ProjectInput): Promise<SaveResult>;
  createTask(input: TaskInput): Promise<SaveResult>;
  createNote(input: NoteInput): Promise<SaveResult>;
  createSnippet(input: SnippetInput): Promise<SaveResult>;
  createBug(input: BugInput): Promise<SaveResult>;
  /** Creates a snippet (without tags) and returns its id, so the Code Tester can stay linked to it. */
  createSnippetWithId(input: SnippetInput): Promise<Result<string, StorageError>>;
  updateProject(projectId: string, input: ProjectInput): Promise<SaveResult>;
  updateTask(taskId: string, input: TaskInput): Promise<SaveResult>;
  updateNote(noteId: string, input: NoteInput): Promise<SaveResult>;
  updateSnippet(snippetId: string, input: SnippetInput): Promise<SaveResult>;
  updateBug(bugId: string, input: BugInput): Promise<SaveResult>;
  deleteProject(projectId: string, options: DeleteProjectOptions): Promise<SaveResult>;
  deleteTask(taskId: string): Promise<SaveResult>;
  deleteNote(noteId: string): Promise<SaveResult>;
  deleteSnippet(snippetId: string): Promise<SaveResult>;
  /**
   * Deletes any item and returns a record that `restoreDeletion` can bring back.
   * `record` is `null` when the item did not exist. Project options default to keeping the contents.
   */
  deleteWithUndo(type: EntityType, id: string, options?: DeleteProjectOptions): Promise<{ saved: SaveResult; record: DeletionRecord | null }>;
  /** Merges a deleted item (and its related data) back into the current workspace. */
  restoreDeletion(record: DeletionRecord): Promise<SaveResult>;
  /** Multi-select: deletes several tasks or bugs as one deletion that `restoreDeletion` can undo. */
  deleteManyWithUndo(type: 'task' | 'bug', ids: readonly string[]): Promise<{ saved: SaveResult; record: DeletionRecord | null }>;
  /** Multi-select: changes status, priority or project of several items. `record` is `null` if nothing changed. */
  bulkEditTasks(ids: readonly string[], change: TaskBulkChange): Promise<{ saved: SaveResult; record: BulkEditRecord | null }>;
  bulkEditBugs(ids: readonly string[], change: BugBulkChange): Promise<{ saved: SaveResult; record: BulkEditRecord | null }>;
  /** Undoes a multi-select change. */
  restoreBulkEdit(record: BulkEditRecord): Promise<SaveResult>;
  setTaskStatus(taskId: string, status: TaskStatus): Promise<SaveResult>;
  setBugStatus(bugId: string, status: BugStatus): Promise<SaveResult>;
  /**
   * Applies a change that was prepared outside the usual actions (e.g. the
   * developer tools' test data). It goes through the same validation and save
   * path as every other change.
   */
  applyChange(update: (workspace: Workspace) => Workspace): Promise<SaveResult>;
  /** Marks or unmarks an item as a favourite; nothing else about it changes. */
  setFavorite(type: EntityType, id: string, favorite: boolean): Promise<SaveResult>;
  createTag(input: TagInput): Promise<TagSaveResult>;
  /** Renames and/or recolours a tag; every item keeps it. */
  updateTag(tagId: string, input: TagInput): Promise<TagSaveResult>;
  /** Deletes a tag and removes it from all items. The items themselves are kept. */
  deleteTag(tagId: string): Promise<SaveResult>;
  /**
   * Imports validated backup data. Unlike other actions this is not optimistic:
   * the workspace only changes once the result was saved, so a failed import
   * leaves both the screen and the stored data exactly as they were.
   */
  importWorkspace(imported: Workspace, mode: ImportMode): Promise<Result<ImportStats, StorageError>>;
  /** Deletes all workspace data. */
  resetWorkspace(): Promise<SaveResult>;
  /** After a load error: keeps the unreadable data as a backup and starts empty. */
  startFresh(): Promise<Result<string | null, StorageError>>;
  reload(): Promise<void>;
  dismissSaveError(): void;
}

export interface WorkspaceContextValue {
  state: WorkspaceState;
  repository: WorkspaceRepository;
  /** Set when the preferred storage was unavailable and a fallback is used. */
  storageWarning: StorageError | null;
  /** The most recent failed save, until dismissed or a later save succeeds. */
  saveError: StorageError | null;
  actions: WorkspaceActions;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspaceContext(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspaceContext must be used inside <WorkspaceProvider>.');
  return value;
}

/** The loaded workspace. Only use below <WorkspaceGate>, which guarantees it is ready. */
export function useWorkspace(): Workspace {
  const { state } = useWorkspaceContext();
  if (state.status !== 'ready') throw new Error('useWorkspace was called before the workspace was ready.');
  return state.workspace;
}

export function useWorkspaceActions(): WorkspaceActions {
  return useWorkspaceContext().actions;
}
