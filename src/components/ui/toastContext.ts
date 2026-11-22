import { createContext, useContext } from 'react';

/** success: something was done. info: a neutral note. warning: done, but with a catch. danger: it failed. */
export type ToastTone = 'success' | 'info' | 'warning' | 'danger';

export interface ToastAction {
  label: string;
  /** Runs once when the button is pressed; the toast closes right away. */
  onAction: () => void;
}

export interface ToastOptions {
  /** One button, e.g. "Undo". */
  action?: ToastAction;
  /** How long the toast stays (while not hovered or focused). Defaults depend on the tone. */
  durationMs?: number;
  /** Called once when the toast closes without its action being used (timeout, close button, pushed out). */
  onExpire?: () => void;
}

export interface ToastContextValue {
  /** Shows a short confirmation or error message that disappears on its own. */
  showToast(message: string, tone?: ToastTone, options?: ToastOptions): void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>.');
  return value;
}
