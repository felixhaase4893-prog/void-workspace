import { createContext, useContext } from 'react';

import type { EntityType } from '../../domain/models';

export interface QuickAddContextValue {
  /** Opens the Quick Add palette, on the given type or the one used last. */
  openQuickAdd: (type?: EntityType) => void;
}

export const QuickAddContext = createContext<QuickAddContextValue | null>(null);

export function useQuickAdd(): QuickAddContextValue {
  const value = useContext(QuickAddContext);
  if (!value) throw new Error('useQuickAdd must be used inside <QuickAddProvider>.');
  return value;
}
