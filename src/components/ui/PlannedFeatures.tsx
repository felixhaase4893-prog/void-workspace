import { CircleDashed } from 'lucide-react';

import { Badge } from './Badge';

interface PlannedFeaturesProps {
  title?: string;
  items: string[];
}

/** Clearly marks functionality that is not implemented yet. Contains nothing clickable on purpose. */
export function PlannedFeatures({ title = 'Not implemented yet', items }: PlannedFeaturesProps) {
  return (
    <section aria-label={title} className="mt-8 rounded-card border border-dashed border-line-strong px-5 py-4">
      <div className="flex items-center gap-2">
        <CircleDashed className="size-4 text-subtle" aria-hidden="true" />
        <h2 className="text-[13px] font-medium text-muted">{title}</h2>
        <Badge>Planned</Badge>
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] text-subtle sm:grid-cols-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2 before:mt-2 before:size-1 before:shrink-0 before:rounded-full before:bg-line-strong">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
