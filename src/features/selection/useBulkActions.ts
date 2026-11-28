import { useCallback } from 'react';

import { useToast } from '../../components/ui/toastContext';
import type { BugBulkChange, BulkEditRecord, TaskBulkChange } from '../../domain/bulk';
import { useWorkspaceActions, type SaveResult } from '../../state/workspaceContext';
import { UNDO_WINDOW_MS } from '../create/DeleteDialog';
import { t, tn } from '../../i18n/translate';

export type BulkType = 'task' | 'bug';

export function countLabel(type: BulkType, count: number): string {
  return tn(type === 'task' ? '{count} task|{count} tasks' : '{count} bug|{count} bugs', count);
}

/**
 * Multi-select actions with the same feedback as single ones: a toast that
 * says what happened, with t('Undo') for the same 8 seconds (paused on hover).
 * Each resolves to true when something changed.
 */
export function useBulkActions(type: BulkType) {
  const actions = useWorkspaceActions();
  const { showToast } = useToast();

  const reportEdit = useCallback(
    (saved: SaveResult, record: BulkEditRecord | null, describe: (count: string) => string): boolean => {
      if (!saved.ok) {
        showToast(t('Changed for now, but not saved: {reason}', { reason: saved.error.message }), 'danger');
        return record !== null;
      }
      if (!record) {
        showToast(t('Nothing to change: the selected items already look like that.'), 'info');
        return false;
      }
      const count = countLabel(type, record.previous.length);
      showToast(describe(count), 'success', {
        durationMs: UNDO_WINDOW_MS,
        action: {
          label: t('Undo'),
          onAction: () => {
            void actions.restoreBulkEdit(record).then((restored) => {
              if (restored.ok) showToast(t('Change to {items} undone.', { items: count }));
              else showToast(t('Undone for now, but not saved: {reason}', { reason: restored.error.message }), 'danger');
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
        showToast(t('Deleted for now, but not saved: {reason}', { reason: saved.error.message }), 'danger');
        return record !== null;
      }
      if (!record) return false;
      const count = countLabel(type, record.count ?? 1);
      showToast(t('{items} deleted.', { items: count }), 'success', {
        durationMs: UNDO_WINDOW_MS,
        action: {
          label: t('Undo'),
          onAction: () => {
            void actions.restoreDeletion(record).then((restored) => {
              if (restored.ok) showToast(t('{items} restored.', { items: count }));
              else showToast(t('Restored for now, but not saved: {reason}', { reason: restored.error.message }), 'danger');
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
