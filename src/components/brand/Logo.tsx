import { useId } from 'react';

import { cn } from '../../lib/cn';

/**
 * The VOID mark: a broken orbit with one particle escaping through the gap.
 * Same geometry as public/favicon.svg and the app icon (scripts/generate-icons.mjs),
 * with a slightly bolder stroke because it is shown small.
 */
export function LogoMark({ className }: { className?: string }) {
  const gradient = `void-ring-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-7', className)}>
      <defs>
        <linearGradient id={gradient} x1="0.2" y1="0.15" x2="0.8" y2="0.9">
          <stop offset="0" stopColor="#c4bbff" />
          <stop offset="1" stopColor="#6352dc" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="6.6" className="fill-raised stroke-line-strong" strokeWidth="0.6" />
      <path d="M24.607 15.247A8.64 8.64 0 1 1 18.236 7.654" fill="none" stroke={`url(#${gradient})`} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="22.619" cy="10.446" r="2.2" className="fill-fg" />
    </svg>
  );
}

/** `responsive` hides the wordmark below the `lg` breakpoint (tablet rail). */
export function Logo({ responsive = false }: { responsive?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className={cn('font-mono text-[15px] font-semibold tracking-[0.32em] text-fg', responsive && 'sr-only lg:not-sr-only')}>VOID</span>
    </span>
  );
}
