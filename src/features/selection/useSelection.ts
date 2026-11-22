import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { isEditableTarget, isModalOpen } from '../search/shortcut';

export interface SelectionState {
  /** Selection mode is on: rows show checkboxes and the bulk actions bar is visible. */
  active: boolean;
  start: () => void;
  /** Leaves selection mode and forgets the selection. */
  stop: () => void;
  /** Selected ids that are still visible, in list order. Hidden or deleted items never count. */
  ids: string[];
  isSelected: (id: string) => boolean;
  /** Shift extends the selection from the last clicked row. */
  toggle: (id: string, extend?: boolean) => void;
  toggleAll: () => void;
  clear: () => void;
  allSelected: boolean;
}

/**
 * Multi-select for one list. The selection only ever applies to rows that are
 * currently shown, so a filter can never make a bulk action hit hidden items.
 * Escape leaves selection mode; Ctrl+A selects every shown row.
 */
export function useSelection(visibleIds: readonly string[]): SelectionState {
  const [active, setActive] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const anchor = useRef<string | null>(null);

  const ids = useMemo(() => visibleIds.filter((id) => selected.has(id)), [visibleIds, selected]);
  const allSelected = visibleIds.length > 0 && ids.length === visibleIds.length;

  const start = useCallback(() => setActive(true), []);
  const stop = useCallback(() => {
    setActive(false);
    setSelected(new Set());
    anchor.current = null;
  }, []);
  const clear = useCallback(() => setSelected(new Set()), []);

  const toggle = useCallback(
    (id: string, extend = false) => {
      // Read the anchor now: the state updater may run later, after it moved.
      const previousAnchor = anchor.current;
      setSelected((current) => {
        const next = new Set(current);
        const from = previousAnchor === null ? -1 : visibleIds.indexOf(previousAnchor);
        const to = visibleIds.indexOf(id);
        if (extend && from !== -1 && to !== -1) {
          // Shift-click: the whole range takes the state of the clicked row's new value.
          const value = !current.has(id);
          for (const rangeId of visibleIds.slice(Math.min(from, to), Math.max(from, to) + 1)) {
            if (value) next.add(rangeId);
            else next.delete(rangeId);
          }
        } else if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      anchor.current = id;
    },
    [visibleIds],
  );

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(visibleIds));
  }, [allSelected, visibleIds]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isModalOpen()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        stop();
      } else if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'a' && !isEditableTarget(event.target)) {
        event.preventDefault();
        setSelected(new Set(visibleIds));
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active, stop, visibleIds]);

  return {
    active,
    start,
    stop,
    ids,
    isSelected: (id: string) => active && selected.has(id),
    toggle,
    toggleAll,
    clear,
    allSelected,
  };
}
