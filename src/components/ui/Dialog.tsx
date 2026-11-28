import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/cn';
import { IconButton } from './Button';
import { t } from '../../i18n/translate';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Placement = 'center' | 'left' | 'top';

/** Open dialogs, newest last. Only the top one reacts to Escape and Tab, so a confirm on top of a form never closes both. */
const openDialogs: object[] = [];
let bodyOverflowBeforeDialogs = '';

const PLACEMENT_LAYOUT: Record<Placement, string> = {
  center: 'items-end justify-center sm:items-center sm:p-6',
  left: 'justify-start',
  top: 'items-start justify-center sm:px-6 sm:pt-[12vh] sm:pb-6',
};

const PLACEMENT_PANEL: Record<Placement, string> = {
  center: 'w-full animate-pop-in rounded-t-2xl border sm:max-w-lg sm:rounded-2xl',
  left: 'h-full w-72 max-w-[85vw] animate-slide-in border-r',
  top: 'max-h-[85dvh] w-full animate-pop-in rounded-b-2xl border sm:max-h-[76dvh] sm:max-w-xl sm:rounded-2xl',
};

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * `center` for regular dialogs, `left` for the mobile navigation drawer,
   * `top` for search, so phone keyboards never cover the input.
   */
  placement?: Placement;
  className?: string;
}

/**
 * Accessible modal: focus moves in on open, Tab stays inside, Escape and a
 * backdrop click close it, and focus returns to the trigger afterwards.
 */
export function Dialog({ open, onClose, title, description, children, footer, placement = 'center', className }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const autofocus = panel?.querySelector<HTMLElement>('[data-autofocus]');
    (autofocus ?? panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

    // The page behind stays locked until the last open dialog closes.
    if (openDialogs.length === 0) bodyOverflowBeforeDialogs = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const token = {};
    openDialogs.push(token);

    const onKeyDown = (event: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== token) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      const index = openDialogs.indexOf(token);
      if (index !== -1) openDialogs.splice(index, 1);
      document.removeEventListener('keydown', onKeyDown);
      if (openDialogs.length === 0) document.body.style.overflow = bodyOverflowBeforeDialogs;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className={cn('fixed inset-0 z-50 flex', PLACEMENT_LAYOUT[placement])}>
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-full flex-col border-line-strong bg-surface shadow-2xl shadow-black/60 focus:outline-none',
          PLACEMENT_PANEL[placement],
          className,
        )}
      >
        <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-[13px] text-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton label={t('Close')} onClick={onClose} className="-mt-1 -mr-2">
            <X />
          </IconButton>
        </header>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
