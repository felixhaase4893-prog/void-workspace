import { useState } from 'react';

import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/toastContext';
import { ENTITY_LABELS } from '../../domain/labels';
import type { EntityType } from '../../domain/models';
import { findEntity, getEntityTitle, getProjectContents } from '../../domain/workspace';
import { useWorkspace, useWorkspaceActions } from '../../state/workspaceContext';

interface DeleteDialogProps {
  type: EntityType;
  id: string;
  onClose: () => void;
  onDeleted?: (() => void) | undefined;
}

/** How long the "Undo" button stays available after a deletion (paused while hovered). */
export const UNDO_WINDOW_MS = 8000;

function describeCount(count: number, singular: string): string | null {
  return count === 0 ? null : `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** Asks before deleting anything. For projects it also asks what happens to their contents. */
export function DeleteDialog({ type, id, onClose, onDeleted }: DeleteDialogProps) {
  const workspace = useWorkspace();
  const actions = useWorkspaceActions();
  const { showToast } = useToast();
  const [deleteContents, setDeleteContents] = useState(false);
  const [pending, setPending] = useState(false);

  const entity = findEntity(workspace, type, id);
  if (!entity) return null;
  const title = getEntityTitle(entity);
  const label = ENTITY_LABELS[type];

  const contents = type === 'project' ? getProjectContents(workspace, id) : null;
  const contentSummary = contents
    ? [
        describeCount(contents.tasks.length, 'task'),
        describeCount(contents.bugs.length, 'bug'),
        describeCount(contents.notes.length, 'note'),
        describeCount(contents.snippets.length, 'snippet'),
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  const confirm = async () => {
    setPending(true);
    const { saved, record } = await actions.deleteWithUndo(type, id, { deleteContents });
    // The item is gone from the screen either way; if saving failed, the toast and the
    // layout's save-error banner explain that it comes back on reload.
    if (saved.ok && record) {
      showToast(`${label} “${title}” deleted.`, 'success', {
        durationMs: UNDO_WINDOW_MS,
        action: {
          label: 'Undo',
          onAction: () => {
            void actions.restoreDeletion(record).then((restored) => {
              if (restored.ok) showToast(`${label} “${title}” restored.`);
              else showToast(`Restored for now, but not saved: ${restored.error.message}`, 'danger');
            });
          },
        },
      });
    } else if (!saved.ok) {
      showToast(`Deleted for now, but not saved: ${saved.error.message}`, 'danger');
    }
    onClose();
    onDeleted?.();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Delete ${label.toLowerCase()}?`}
      description={`“${title}” will be removed from this device. You can undo this for a few seconds afterwards.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => void confirm()}>
            Delete {label.toLowerCase()}
          </Button>
        </>
      }
    >
      {contentSummary ? (
        <fieldset className="space-y-2 text-[13px]">
          <legend className="mb-2 text-muted">This project contains {contentSummary}.</legend>
          <label className="flex items-start gap-2.5 text-fg">
            <input type="radio" name="project-contents" className="mt-0.5 accent-accent-500" checked={!deleteContents} onChange={() => setDeleteContents(false)} />
            <span>
              Keep them <span className="text-subtle">(they stay in their lists without a project)</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-fg">
            <input type="radio" name="project-contents" className="mt-0.5 accent-accent-500" checked={deleteContents} onChange={() => setDeleteContents(true)} />
            <span>Delete them as well</span>
          </label>
        </fieldset>
      ) : (
        <Alert tone="warning" title="Need it later?">
          Export a backup in Settings first.
        </Alert>
      )}
    </Dialog>
  );
}
