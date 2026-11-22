import { AlertTriangle, CheckCircle2, Info, OctagonAlert, X, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { ToastContext, type ToastAction, type ToastOptions, type ToastTone } from './toastContext';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action: ToastAction | undefined;
  durationMs: number;
}

const DURATION_MS: Record<ToastTone, number> = { success: 3500, info: 4500, warning: 6000, danger: 7000 };

/** One look for every toast: the same panel, with the tone shown by icon and edge colour only, so text stays readable. */
const TONE_STYLES: Record<ToastTone, { icon: LucideIcon; iconClass: string; edgeClass: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-success', edgeClass: 'bg-success/70' },
  info: { icon: Info, iconClass: 'text-accent-300', edgeClass: 'bg-accent-400/70' },
  warning: { icon: AlertTriangle, iconClass: 'text-warning', edgeClass: 'bg-warning/80' },
  danger: { icon: OctagonAlert, iconClass: 'text-danger', edgeClass: 'bg-danger/80' },
};
/** Room for a few undo toasts after deleting several items in a row. */
const MAX_TOASTS = 5;

/** Renders toasts in a polite live region in the bottom-right corner. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  // Expiry callbacks live outside React state so each one runs exactly once.
  const expiry = useRef(new Map<number, () => void>());

  const close = useCallback((ids: number[], expired: boolean) => {
    if (ids.length === 0) return;
    for (const id of ids) {
      const onExpire = expiry.current.get(id);
      expiry.current.delete(id);
      if (expired) onExpire?.();
    }
    setToasts((current) => current.filter((toast) => !ids.includes(toast.id)));
  }, []);

  const dismiss = useCallback((id: number) => close([id], true), [close]);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'success', options: ToastOptions = {}) => {
      nextId.current += 1;
      const toast: Toast = { id: nextId.current, message, tone, action: options.action, durationMs: options.durationMs ?? DURATION_MS[tone] };
      if (options.onExpire) expiry.current.set(toast.id, options.onExpire);
      setToasts((current) => {
        const next = [...current, toast];
        const overflow = next.slice(0, Math.max(0, next.length - MAX_TOASTS)).map((item) => item.id);
        // Pushed-out toasts expire normally; run their callbacks after this update.
        if (overflow.length > 0) queueMicrotask(() => close(overflow, true));
        return next;
      });
    },
    [close],
  );

  const runAction = useCallback(
    (toast: Toast) => {
      close([toast.id], false);
      toast.action?.onAction();
    },
    [close],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[70] flex flex-col items-end gap-2 sm:left-auto">
        {toasts.slice(-MAX_TOASTS).map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} onAction={runAction} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

interface ToastItemProps {
  toast: Toast;
  onDismiss: (id: number) => void;
  onAction: (toast: Toast) => void;
}

function ToastItem({ toast, onDismiss, onAction }: ToastItemProps) {
  // The countdown pauses while the pointer or keyboard focus is on the toast, so "Undo" never vanishes under the cursor.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;
  const remaining = useRef(toast.durationMs);

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => onDismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [paused, toast.id, onDismiss]);

  const { icon: Icon, iconClass, edgeClass } = TONE_STYLES[toast.tone];
  const quiet = toast.tone === 'success' || toast.tone === 'info';
  return (
    <div
      role={quiet ? 'status' : 'alert'}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className={cn(
        'pointer-events-auto relative flex w-full max-w-sm animate-pop-in items-start gap-3 overflow-hidden rounded-xl border border-line-strong bg-overlay py-3 pr-3 pl-4 text-[13px] text-fg shadow-xl shadow-black/50',
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-0.5', edgeClass)} />
      <Icon className={cn('mt-0.5 size-4 shrink-0', iconClass)} aria-hidden="true" />
      <p className="min-w-0 flex-1 [overflow-wrap:anywhere]">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => onAction(toast)}
          className="-my-0.5 shrink-0 rounded-md px-2 py-0.5 font-medium text-accent-300 hover:bg-accent-900 hover:text-accent-200"
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" aria-label="Dismiss" onClick={() => onDismiss(toast.id)} className="mt-px rounded text-subtle hover:text-fg">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
