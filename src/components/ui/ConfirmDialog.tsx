import type { ReactNode } from 'react';

import { Button } from './Button';
import { Dialog } from './Dialog';
import { t } from '../../i18n/translate';

interface ConfirmDialogProps {
  title: string;
  description?: string;
  /** The button that carries out the action, e.g. "Delete 3 tasks". */
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}

/**
 * The one way VOID asks "are you sure?": a short title, what will happen, and
 * Cancel (focused, so Enter never destroys anything by accident) next to the action.
 */
export function ConfirmDialog({ title, description, confirmLabel, tone = 'danger', pending = false, onConfirm, onClose, children }: ConfirmDialogProps) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      {...(description ? { description } : {})}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} data-autofocus>
            {t('Cancel')}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} disabled={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
