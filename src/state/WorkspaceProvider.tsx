import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { bulkEditBugs, bulkEditTasks, restoreBulkEdit, type BulkEditRecord, type BulkEditResult } from '../domain/bulk';
import { createEmptyWorkspace, type Workspace } from '../domain/models';
import { applyImport } from '../domain/import';
import { stampMilestones } from '../domain/milestones';
import { createTag, deleteTag, updateTag, type TagError } from '../domain/tags';
import { deleteManyWithUndo, deleteWithUndo, restoreDeletion, type DeletionRecord } from '../domain/undo';
import {
  addBug,
  addNote,
  addProject,
  addSnippet,
  addTask,
  deleteNote,
  deleteProject,
  deleteSnippet,
  deleteTask,
  setBugStatus,
  setFavorite,
  setTaskStatus,
  updateBug,
  updateNote,
  updateProject,
  updateSnippet,
  updateTask,
  type OperationContext,
} from '../domain/workspace';
import { createId } from '../lib/id';
import { err, ok, type Result } from '../lib/result';
import type { StorageError } from '../storage/errors';
import type { LoadedWorkspace, WorkspaceRepository } from '../storage/workspaceRepository';
import {
  WorkspaceContext,
  type SaveResult,
  type TagSaveResult,
  type WorkspaceActions,
  type WorkspaceContextValue,
  type WorkspaceState,
} from './workspaceContext';

interface WorkspaceProviderProps {
  repository: WorkspaceRepository;
  storageWarning?: StorageError | null;
  children: ReactNode;
}

const defaultContext = (): OperationContext => ({ now: new Date(), createId });

function toState(result: Result<LoadedWorkspace, StorageError>): WorkspaceState {
  return result.ok ? { status: 'ready', workspace: result.value.workspace } : { status: 'error', error: result.error };
}

export function WorkspaceProvider({ repository, storageWarning = null, children }: WorkspaceProviderProps) {
  const [state, setState] = useState<WorkspaceState>({ status: 'loading' });
  const [saveError, setSaveError] = useState<StorageError | null>(null);
  // Latest workspace, so rapid consecutive actions never build on stale data.
  const workspaceRef = useRef<Workspace | null>(null);

  const applyLoaded = useCallback((next: WorkspaceState) => {
    workspaceRef.current = next.status === 'ready' ? next.workspace : null;
    setState(next);
  }, []);

  const reload = useCallback(async () => {
    const result = await repository.load();
    applyLoaded(toState(result));
  }, [repository, applyLoaded]);

  useEffect(() => {
    let cancelled = false;
    repository.load().then((result) => {
      if (cancelled) return;
      applyLoaded(toState(result));
    });
    const unsubscribe = repository.subscribe(() => {
      void reload();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [repository, applyLoaded, reload]);

  /** Applies an update in memory immediately, then persists it. */
  const commit = useCallback(
    async (update: (workspace: Workspace) => Workspace): Promise<SaveResult> => {
      const current = workspaceRef.current;
      if (!current) {
        return { ok: false, error: { kind: 'write-failed', message: 'The workspace is not loaded yet.' } };
      }
      const next = stampMilestones(current, update(current), new Date());
      applyLoaded({ status: 'ready', workspace: next });
      const result = await repository.save(next);
      setSaveError(result.ok ? null : result.error);
      return result;
    },
    [repository, applyLoaded],
  );

  /** Runs a tag change that may be refused (e.g. a duplicate name) and only commits it when valid. */
  const commitTagChange = useCallback(
    async (change: (workspace: Workspace) => Result<Workspace, TagError>): Promise<TagSaveResult> => {
      const current = workspaceRef.current;
      if (!current) return err({ kind: 'write-failed', message: 'The workspace is not loaded yet.' });
      const next = change(current);
      if (!next.ok) return next;
      if (next.value === current) return ok(undefined);
      return commit(() => next.value);
    },
    [commit],
  );

  /** Commits a change that also produces an undo record. */
  const commitBulkEdit = useCallback(
    async (change: (workspace: Workspace) => BulkEditResult) => {
      let record: BulkEditRecord | null = null;
      const saved = await commit((ws) => {
        const result = change(ws);
        record = result.record;
        return result.workspace;
      });
      return { saved, record: record as BulkEditRecord | null };
    },
    [commit],
  );

  const actions = useMemo<WorkspaceActions>(
    () => ({
      createProject: (input) => commit((ws) => addProject(ws, input, defaultContext())),
      createTask: (input) => commit((ws) => addTask(ws, input, defaultContext())),
      createNote: (input) => commit((ws) => addNote(ws, input, defaultContext())),
      createSnippet: (input) => commit((ws) => addSnippet(ws, input, defaultContext())),
      createBug: (input) => commit((ws) => addBug(ws, input, defaultContext())),
      createSnippetWithId: async (input) => {
        const id = createId();
        // Without tags, the id generator is asked exactly once: for the snippet itself.
        const saved = await commit((ws) => addSnippet(ws, { ...input, tags: [] }, { now: new Date(), createId: () => id }));
        return saved.ok ? ok(id) : saved;
      },
      updateProject: (id, input) => commit((ws) => updateProject(ws, id, input, defaultContext())),
      updateTask: (id, input) => commit((ws) => updateTask(ws, id, input, defaultContext())),
      updateNote: (id, input) => commit((ws) => updateNote(ws, id, input, defaultContext())),
      updateSnippet: (id, input) => commit((ws) => updateSnippet(ws, id, input, defaultContext())),
      updateBug: (id, input) => commit((ws) => updateBug(ws, id, input, defaultContext())),
      deleteProject: (id, options) => commit((ws) => deleteProject(ws, id, options, { now: new Date() })),
      deleteTask: (id) => commit((ws) => deleteTask(ws, id)),
      deleteNote: (id) => commit((ws) => deleteNote(ws, id)),
      deleteSnippet: (id) => commit((ws) => deleteSnippet(ws, id)),
      deleteWithUndo: async (type, id, options = { deleteContents: false }) => {
        let record: DeletionRecord | null = null;
        const saved = await commit((ws) => {
          const result = deleteWithUndo(ws, type, id, { ...options, now: new Date() });
          record = result.record;
          return result.workspace;
        });
        return { saved, record };
      },
      restoreDeletion: (record) => commit((ws) => restoreDeletion(ws, record)),
      deleteManyWithUndo: async (type, ids) => {
        let record: DeletionRecord | null = null;
        const saved = await commit((ws) => {
          const result = deleteManyWithUndo(ws, type, ids);
          record = result.record;
          return result.workspace;
        });
        return { saved, record };
      },
      bulkEditTasks: (ids, change) => commitBulkEdit((ws) => bulkEditTasks(ws, ids, change, new Date())),
      bulkEditBugs: (ids, change) => commitBulkEdit((ws) => bulkEditBugs(ws, ids, change, new Date())),
      restoreBulkEdit: (record) => commit((ws) => restoreBulkEdit(ws, record)),
      setTaskStatus: (taskId, status) => commit((ws) => setTaskStatus(ws, taskId, status, { now: new Date() })),
      setBugStatus: (bugId, status) => commit((ws) => setBugStatus(ws, bugId, status, { now: new Date() })),
      applyChange: (update) => commit(update),
      setFavorite: (type, id, favorite) => commit((ws) => setFavorite(ws, type, id, favorite)),
      createTag: (input) =>
        commitTagChange((ws) => {
          const result = createTag(ws, input, defaultContext());
          return result.ok ? ok(result.value.workspace) : result;
        }),
      updateTag: (id, input) => commitTagChange((ws) => updateTag(ws, id, input, { now: new Date() })),
      deleteTag: (id) => commit((ws) => deleteTag(ws, id)),
      importWorkspace: async (imported, mode) => {
        const current = workspaceRef.current;
        if (!current) return err({ kind: 'write-failed', message: 'The workspace is not loaded yet.' });
        const { workspace, stats } = applyImport(current, imported, mode, defaultContext());
        const result = await repository.save(workspace);
        if (!result.ok) return result;
        applyLoaded({ status: 'ready', workspace });
        setSaveError(null);
        return ok(stats);
      },
      resetWorkspace: async () => {
        const result = await repository.clear();
        if (result.ok) {
          applyLoaded({ status: 'ready', workspace: createEmptyWorkspace() });
          setSaveError(null);
        }
        return result;
      },
      startFresh: async () => {
        const result = await repository.quarantine();
        if (result.ok) applyLoaded({ status: 'ready', workspace: createEmptyWorkspace() });
        return result;
      },
      reload,
      dismissSaveError: () => setSaveError(null),
    }),
    [commit, commitTagChange, commitBulkEdit, repository, applyLoaded, reload],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({ state, repository, storageWarning, saveError, actions }),
    [state, repository, storageWarning, saveError, actions],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
