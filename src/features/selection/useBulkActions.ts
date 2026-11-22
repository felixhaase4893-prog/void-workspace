import { useCallback } from 'react';

import { useToast } from '../../components/ui/toastContext';
import type { BugBulkChange, BulkEditRecord, TaskBulkChange } from '../../domain/bulk';
import { useWorkspaceActions, type SaveResult } from '../../state/workspaceContext';
import { UNDO_WINDOW_MS } from '../create/DeleteDialog';

export type BulkType = 'task' | 'bug';

export function countLabel(type: BulkType, count: number): string {
  return `${count} ${type}${count === 1 ? '' : 's'}`;
}

/**
 * Multi-select actions with the same feedback as single ones: a toast that
 * says what happened, with "Undo" for the same 8 seconds (paused on hover).
 * Each resolves to true when something changed.
 */
export function useBulkActions(type: BulkType) {
  const actions = useWorkspaceActions();
  const { showToast } = useToast();

  const reportEdit = useCallback(
    (saved: SaveResult, record: BulkEditRecord | null, describe: (count: string) => string): boolean => {
      if (!saved.ok) {
        showToast(`Changed for now, but not saved: ${saved.error.message}`, 'danger');
        return record !== null;
      }
      if (!record) {
        showToast(`Nothing to change: the selected ${type}s already look like that.`, 'info');
        return false;
      }
      const count = countLabel(type, record.previous.length);
      showToast(describe(count), 'success', {
        durationMs: UNDO_WINDOW_MS,
        action: {
          label: 'Undo',
          onAction: () => {
            void actions.restoreBulkEdit(record).then((restored) => {
              if (restored.ok) showToast(`Change to ${count} undone.`);
              else showToast(`Undone for now, but not saved: ${restored.error.message}`, 'danger');
            });
          },
        },
      });
      return true;
    },
    [actions, showToast, type],
  );

  const editTasks = useCallback(
    async (ids: readonly string[], change: TaskBulkChange, describe: (count: string) => string) => {
      const { saved, record } = await actions.bulkEditTasks(ids, change);
      return reportEdit(saved, record, describe);
    },
    [actions, reportEdit],
  );

  const editBugs = useCallback(
    async (ids: readonly string[], change: BugBulkChange, describe: (count: string) => string) => {
      const { saved, record } = await actions.bulkEditBugs(ids, change);
      return reportEdit(saved, record, describe);
    },
    [actions, reportEdit],
  );

  const deleteMany = useCallback(
    async (ids: readonly string[]) => {
      const { saved, record } = await actions.deleteManyWithUndo(type, ids);
      if (!saved.ok) {
        showToast(`Deleted for now, but not saved: ${saved.error.message}`, 'danger');
        return record !== null;
      }
      if (!record) return false;
      const count = countLabel(type, record.count ?? 1);
      showToast(`${count} deleted.`, 'success', {
        durationMs: UNDO_WINDOW_MS,
        action: {
          label: 'Undo',
          onAction: () => {
            void actions.restoreDeletion(record).then((restored) => {
              if (restored.ok) showToast(`${count} restored.`);
              else showToast(`Restored for now, but not saved: ${restored.error.message}`, 'danger');
            });
          },
        },
      });
      return true;
    },
    [actions, showToast, type],
  );

  return { editTasks, editBugs, deleteMany };
}
