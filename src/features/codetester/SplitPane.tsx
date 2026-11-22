import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import { cn } from '../../lib/cn';

const STORAGE_KEY = 'void:code-tester-split';
const MIN = 0.25;
const MAX = 0.8;
const DEFAULT_RATIO = 0.62;
const STEP = 0.05;

function clamp(value: number): number {
  return Math.min(MAX, Math.max(MIN, value));
}

function readRatio(): number {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clamp(stored) : DEFAULT_RATIO;
  } catch {
    return DEFAULT_RATIO;
  }
}

function useWideLayout(): boolean {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const onChange = () => setWide(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return wide;
}

interface SplitPaneProps {
  first: ReactNode;
  second: ReactNode;
  label: string;
}

/**
 * Editor and results side by side on wide windows, stacked on narrow ones.
 * The divider can be dragged or moved with the arrow keys; the size is kept
 * on this device only.
 */
export function SplitPane({ first, second, label }: SplitPaneProps) {
  const wide = useWideLayout();
  const [ratio, setRatio] = useState(readRatio);
  const container = useRef<HTMLDivElement>(null);

  const commit = useCallback((value: number) => {
    const next = clamp(value);
    setRatio(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Math.round(next * 1000) / 1000));
    } catch {
      // Not remembering the size is fine.
    }
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const box = container.current?.getBoundingClientRect();
    if (!box) return;
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    const move = (moveEvent: globalThis.PointerEvent) => {
      const value = wide ? (moveEvent.clientX - box.left) / box.width : (moveEvent.clientY - box.top) / box.height;
      commit(value);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const smaller = wide ? 'ArrowLeft' : 'ArrowUp';
    const larger = wide ? 'ArrowRight' : 'ArrowDown';
    if (event.key === smaller) commit(ratio - STEP);
    else if (event.key === larger) commit(ratio + STEP);
    else if (event.key === 'Home') commit(MIN);
    else if (event.key === 'End') commit(MAX);
    else return;
    event.preventDefault();
  };

  const template = `minmax(0, ${ratio}fr) 10px minmax(0, ${1 - ratio}fr)`;
  return (
    <div
      ref={container}
      className={cn('grid min-h-0 overflow-hidden rounded-card border border-line bg-surface', wide ? 'h-[calc(100dvh-16.5rem)] min-h-[440px]' : 'h-[82dvh] min-h-[560px]')}
      style={wide ? { gridTemplateColumns: template } : { gridTemplateRows: template }}
    >
      <div className="min-h-0 min-w-0">{first}</div>
      <div
        role="separator"
        tabIndex={0}
        aria-label={label}
        aria-orientation={wide ? 'vertical' : 'horizontal'}
        aria-valuemin={MIN * 100}
        aria-valuemax={MAX * 100}
        aria-valuenow={Math.round(ratio * 100)}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        className={cn(
          'group relative flex touch-none items-center justify-center bg-surface focus-visible:outline-none',
          wide ? 'cursor-col-resize border-x border-line' : 'cursor-row-resize border-y border-line',
        )}
      >
        <span className={cn('rounded-full bg-line-strong transition-colors group-hover:bg-accent-400 group-focus-visible:bg-accent-400', wide ? 'h-8 w-0.5' : 'h-0.5 w-8')} aria-hidden="true" />
      </div>
      <div className="min-h-0 min-w-0">{second}</div>
    </div>
  );
}
