import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/toastContext';
import type { SaveResult } from '../../state/workspaceContext';
import { t } from '../../i18n/translate';

interface EntityFormProps {
  submitLabel: string;
  /** Shown as a toast once the change was saved. */
  successMessage: string;
  onCancel: () => void;
  /** Returns null when validation failed (the form shows field errors). */
  onSubmit: () => Promise<SaveResult> | null;
  onSaved: () => void;
  children: ReactNode;
}

/**
 * Shared shell for the create and edit forms. If saving fails, the change
 * still exists in memory; a toast and the layout's save-error banner explain it.
 */
export function EntityForm({ submitLabel, successMessage, onCancel, onSubmit, onSaved, children }: EntityFormProps) {
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  // Move focus to the first invalid field after a failed submit.
  useEffect(() => {
    if (failedAttempts === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [failedAttempts]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const save = onSubmit();
    if (!save) {
      setFailedAttempts((count) => count + 1);
      return;
    }
    setPending(true);
    const result = await save;
    if (result.ok) showToast(successMessage);
    else showToast(t('Not saved: {reason}', { reason: result.error.message }), 'danger');
    onSaved();
  };

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className="space-y-4">
      {children}
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel}>
          {t('Cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? t('Saving…') : submitLabel}
        </Button>
      </div>
    </form>
  );
}
