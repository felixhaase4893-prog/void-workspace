import { useId, type ReactNode } from 'react';

import { Card } from '../../components/ui/Card';

interface SettingsSectionProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-4 md:grid-cols-[14rem_1fr] md:gap-8">
      <div>
        <h2 id={id} className="text-sm font-semibold text-fg">
          {title}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-subtle">{description}</p>
      </div>
      <Card className="p-5">{children}</Card>
    </section>
  );
}

export function SettingRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-[13px] text-fg">{children}</dd>
    </div>
  );
}
