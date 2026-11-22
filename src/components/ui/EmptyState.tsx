import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { Kbd } from './Kbd';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  /** Shows the Quick Add shortcut below the action, for "nothing here yet" states. */
  quickAddHint?: boolean;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, quickAddHint = false, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="relative mb-5 grid size-12 place-items-center rounded-xl border border-line-strong bg-raised text-accent-300">
        <Icon className="size-5" aria-hidden="true" />
        <span aria-hidden="true" className="absolute -inset-3 -z-10 rounded-2xl border border-dashed border-line" />
      </div>
      <h2 className="text-sm font-semibold text-fg">{title}</h2>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
      {quickAddHint && (
        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-subtle">
          Tip: <Kbd>Ctrl</Kbd>
          <Kbd>N</Kbd> adds anything from any page.
        </p>
      )}
    </div>
  );
}
