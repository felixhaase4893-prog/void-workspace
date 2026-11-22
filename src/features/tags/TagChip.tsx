import type { ReactNode } from 'react';

import type { TagColor } from '../../domain/models';
import { cn } from '../../lib/cn';
import { TAG_CHIP_CLASSES } from './tagColors';

interface TagChipProps {
  name: string;
  color: TagColor | null;
  /** Rendered instead of the plain name, e.g. with search highlights. */
  children?: ReactNode;
  /** Extra content after the name, such as a remove button. */
  trailing?: ReactNode;
  className?: string;
}

/** A compact tag label. Long names are cut off with an ellipsis; the full name is in the tooltip. */
export function TagChip({ name, color, children, trailing, className }: TagChipProps) {
  return (
    <span
      title={name}
      className={cn(
        'inline-flex h-5 max-w-[12rem] min-w-0 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium',
        TAG_CHIP_CLASSES[color ?? 'default'],
        className,
      )}
    >
      <span className="truncate">{children ?? name}</span>
      {trailing}
    </span>
  );
}
