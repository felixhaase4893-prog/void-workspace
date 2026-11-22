import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1.5 font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">{eyebrow}</p>}
        <h1 className="text-[22px] font-semibold tracking-tight [overflow-wrap:anywhere] text-fg sm:text-[26px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm [overflow-wrap:anywhere] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
