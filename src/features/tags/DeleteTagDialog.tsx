import { useState } from 'react';

import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/toastContext';
import type { Tag } from '../../domain/models';
import type { TagUsage } from '../../domain/tags';
import { useWorkspaceActions } from '../../state/workspaceContext';
import { describeUsage } from './usageText';

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
    if (result.ok) showToast(`Tag “${tag.name}” deleted.`);
    else showToast(`Deleted for now, but not saved: ${result.error.message}`, 'danger');
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Delete tag?"
      description={`“${tag.name}” will be removed from VOID. This cannot be undone.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => void confirm()}>
            {total > 0 ? `Remove from ${total} ${total === 1 ? 'item' : 'items'} and delete` : 'Delete tag'}
          </Button>
        </>
      }
    >
      {total > 0 && usage ? (
        <Alert tone="warning" title={`This tag is used ${total} ${total === 1 ? 'time' : 'times'}: ${describeUsage(usage)}.`}>
          The tag is removed from them. The projects, tasks, notes and snippets themselves are kept unchanged.
        </Alert>
      ) : (
        <p className="text-[13px] text-muted">This tag is not used anywhere.</p>
      )}
    </Dialog>
  );
}
