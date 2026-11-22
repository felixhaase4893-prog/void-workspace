import { useState } from 'react';

import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useWorkspaceActions } from '../../state/workspaceContext';

export function ResetWorkspaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { resetWorkspace } = useWorkspaceActions();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const close = () => {
    setError(null);
    onClose();
  };

  const confirm = async () => {
    setPending(true);
    const result = await resetWorkspace();
    setPending(false);
    if (result.ok) close();
    else setError(result.error.message);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Delete all data?"
      description="This removes every project, task, note and snippet from this device. It cannot be undone."
      footer={
        <>
          <Button variant="ghost" onClick={close} data-autofocus>
            Cancel
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => void confirm()}>
            Delete everything
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-muted">Export a backup first if you might need this data again.</p>
      {error && <Alert tone="danger" title={error} className="mt-4" />}
    </Dialog>
  );
}
