import { AlertTriangle, Info } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

interface AlertProps {
  tone?: 'info' | 'warning' | 'danger';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

const tones = {
  info: 'border-accent-500/25 bg-accent-500/[0.06] text-accent-200',
  warning: 'border-warning/25 bg-warning/[0.06] text-warning',
  danger: 'border-danger/30 bg-danger/[0.07] text-danger',
};

export function Alert({ tone = 'info', title, children, action, className }: AlertProps) {
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div role={tone === 'info' ? 'status' : 'alert'} className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', tones[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-[13px]">
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 text-muted">{children}</div>}
      </div>
      {action}
    </div>
  );
}
