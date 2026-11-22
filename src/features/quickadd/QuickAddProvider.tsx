import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { isQuickAddShortcut } from '../../app/shortcuts';
import type { EntityType } from '../../domain/models';
import { isModalOpen } from '../search/shortcut';
import { QuickAddContext, type QuickAddContextValue } from './quickAddContext';
import { QuickAddDialog } from './QuickAddDialog';

/**
 * Owns the Quick Add palette and its Ctrl+N shortcut. Ctrl+K stays with the
 * search. The shortcut also works from a text field (Ctrl+N never types), but
 * not while another dialog is open.
 */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Remembered for this session, so adding several bugs in a row needs no switching.
  const [type, setType] = useState<EntityType>('task');

  const openQuickAdd = useCallback((next?: EntityType) => {
    if (next) setType(next);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !isQuickAddShortcut(event)) return;
      if (isModalOpen()) return;
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo<QuickAddContextValue>(() => ({ openQuickAdd }), [openQuickAdd]);

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      {open && <QuickAddDialog type={type} onTypeChange={setType} onClose={close} />}
    </QuickAddContext.Provider>
  );
}
