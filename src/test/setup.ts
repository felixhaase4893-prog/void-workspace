import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without globals, so Testing Library cannot register this itself.
afterEach(() => cleanup());

// jsdom has no layout. CodeMirror measures text ranges, so give ranges empty geometry.
const rangePrototype = (typeof Range === 'undefined' ? {} : Range.prototype) as Partial<Pick<Range, 'getClientRects' | 'getBoundingClientRect'>>;
if (typeof rangePrototype.getClientRects !== 'function') {
  rangePrototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  rangePrototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);
}

// jsdom does not implement scrolling and would log "Not implemented: window.scrollTo" on every page change.
if (typeof window !== 'undefined') window.scrollTo = (() => {}) as typeof window.scrollTo;
