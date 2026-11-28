import { useState } from 'react';

import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/toastContext';
import type { Tag } from '../../domain/models';
import type { TagUsage } from '../../domain/tags';
import { useWorkspaceActions } from '../../state/workspaceContext';
import { describeUsage } from './usageText';
import { t, tn } from '../../i18n/translate';

interface DeleteTagDialogProps {
  tag: Tag;
  usage: TagUsage | undefined;
  onClose: () => void;
}

/** Deleting a tag only removes the label; the tagged items always stay. */
export function DeleteTagDialog({ tag, usage, onClose }: DeleteTagDialogProps) {
  const { deleteTag } = useWorkspaceActions();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const total = usage?.total ?? 0;

  const confirm = async () => {
    setPending(true);
    const result = await deleteTag(tag.id);
    if (result.ok) showToast(t('Tag “{name}” deleted.', { name: tag.name }));
    else showToast(t('Deleted for now, but not saved: {reason}', { reason: result.error.message }), 'danger');
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('Delete tag?')}
      description={t('“{name}” will be removed from VOID. This cannot be undone.', { name: tag.name })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} data-autofocus>
            {t('Cancel')}
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => void confirm()}>
            {total > 0 ? tn('Remove from {count} item and delete|Remove from {count} items and delete', total) : t('Delete tag')}
          </Button>
        </>
      }
    >
      {total > 0 && usage ? (
        <Alert tone="warning" title={tn('This tag is used {count} time: {usage}.|This tag is used {count} times: {usage}.', total, { usage: describeUsage(usage) })}>
          {t('The tag is removed from them. The projects, tasks, notes and snippets themselves are kept unchanged.')}
        </Alert>
      ) : (
        <p className="text-[13px] text-muted">{t('This tag is not used anywhere.')}</p>
      )}
    </Dialog>
  );
}
