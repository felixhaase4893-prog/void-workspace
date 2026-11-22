import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

/** A key cap for shortcut hints, e.g. <Kbd>Esc</Kbd>. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn('rounded border border-line-strong bg-canvas/60 px-1 font-mono text-[10px] leading-4 text-subtle', className)}>{children}</kbd>;
}
