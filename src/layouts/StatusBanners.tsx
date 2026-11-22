import { Button } from '../components/ui/Button';
import { Alert } from '../components/ui/Alert';
import { useWorkspaceContext } from '../state/workspaceContext';

/** Surfaces storage problems that need the user's attention. */
export function StatusBanners() {
  const { storageWarning, saveError, actions } = useWorkspaceContext();
  if (!storageWarning && !saveError) return null;

  return (
    <div className="mb-6 space-y-3">
      {storageWarning && (
        <Alert tone="warning" title="Your data is only kept until you close this tab">
          {storageWarning.message} VOID is using temporary memory instead. Allow site data for this page to keep your work.
        </Alert>
      )}
      {saveError && (
        <Alert
          tone="danger"
          title="Your last change could not be saved"
          action={
            <Button size="sm" variant="ghost" onClick={actions.dismissSaveError}>
              Dismiss
            </Button>
          }
        >
          {saveError.message} The change is visible now but will be lost on reload.
        </Alert>
      )}
    </div>
  );
}
