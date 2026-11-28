import { useState } from 'react';

import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/toastContext';
import { ENTITY_LABELS } from '../../domain/labels';
import type { EntityType } from '../../domain/models';
import { findEntity, getEntityTitle, getProjectContents } from '../../domain/workspace';
import { useWorkspace, useWorkspaceActions } from '../../state/workspaceContext';
import { type MessageKey, t, tn } from '../../i18n/translate';

interface DeleteDialogProps {
  type: EntityType;
  id: string;
  onClose: () => void;
  onDeleted?: (() => void) | undefined;
}

/** How long the t('Undo') button stays available after a deletion (paused while hovered). */
export const UNDO_WINDOW_MS = 8000;

function describeCount(count: number, noun: MessageKey): string | null {
  return count === 0 ? null : tn(noun, count);
}

const DELETE_COPY: Record<EntityType, { title: MessageKey; action: MessageKey }> = {
  project: { title: 'Delete project?', action: 'Delete project' },
  task: { title: 'Delete task?', action: 'Delete task' },
  note: { title: 'Delete note?', action: 'Delete note' },
  snippet: { title: 'Delete snippet?', action: 'Delete snippet' },
  bug: { title: 'Delete bug?', action: 'Delete bug' },
};

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
        describeCount(contents.tasks.length, '{count} task|{count} tasks'),
        describeCount(contents.bugs.length, '{count} bug|{count} bugs'),
        describeCount(contents.notes.length, '{count} note|{count} notes'),
        describeCount(contents.snippets.length, '{count} snippet|{count} snippets'),
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
      showToast(t('{label} “{title}” deleted.', { label, title }), 'success', {
        durationMs: UNDO_WINDOW_MS,
        action: {
          label: t('Undo'),
          onAction: () => {
            void actions.restoreDeletion(record).then((restored) => {
              if (restored.ok) showToast(t('{label} “{title}” restored.', { label, title }));
              else showToast(t('Restored for now, but not saved: {reason}', { reason: restored.error.message }), 'danger');
            });
          },
        },
      });
    } else if (!saved.ok) {
      showToast(t('Deleted for now, but not saved: {reason}', { reason: saved.error.message }), 'danger');
    }
    onClose();
    onDeleted?.();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t(DELETE_COPY[type].title)}
      description={t('“{title}” will be removed from this device. You can undo this for a few seconds afterwards.', { title })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} data-autofocus>
            {t('Cancel')}
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => void confirm()}>
            {t(DELETE_COPY[type].action)}
          </Button>
        </>
      }
    >
      {contentSummary ? (
        <fieldset className="space-y-2 text-[13px]">
          <legend className="mb-2 text-muted">{t('This project contains {contents}.', { contents: contentSummary })}</legend>
          <label className="flex items-start gap-2.5 text-fg">
            <input type="radio" name="project-contents" className="mt-0.5 accent-accent-500" checked={!deleteContents} onChange={() => setDeleteContents(false)} />
            <span>
              {t('Keep them')} <span className="text-subtle">{t('(they stay in their lists without a project)')}</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-fg">
            <input type="radio" name="project-contents" className="mt-0.5 accent-accent-500" checked={deleteContents} onChange={() => setDeleteContents(true)} />
            <span>{t('Delete them as well')}</span>
          </label>
        </fieldset>
      ) : (
        <Alert tone="warning" title={t('Need it later?')}>
          {t('Export a backup in Settings first.')}
        </Alert>
      )}
    </Dialog>
  );
}
