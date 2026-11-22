import { createContext, useContext, useMemo } from 'react';

import {
  EMPTY_FILTERS,
  filterItems,
  getFilterOptions,
  getItems,
  hasActiveFilters,
  pruneFilters,
  type FilterOptions,
  type ListFilters,
} from '../../domain/filters';
import type { EntityOfType, EntityType } from '../../domain/models';
import { buildSearchIndex } from '../../domain/search';
import { DEFAULT_SORT, sortItems, type SortKey } from '../../domain/sorting';
import { useWorkspace } from '../../state/workspaceContext';

export interface ListFiltersContextValue {
  filters: Record<EntityType, ListFilters>;
  setFilters: (type: EntityType, update: (current: ListFilters) => ListFilters) => void;
  /** Kept apart from the filters, so resetting filters never resets the order and vice versa. */
  sorts: Record<EntityType, SortKey>;
  setSort: (type: EntityType, sort: SortKey) => void;
}

export const ListFiltersContext = createContext<ListFiltersContextValue | null>(null);

export interface ListFilterState<T extends EntityType> {
  type: T;
  filters: ListFilters;
  update: (update: (current: ListFilters) => ListFilters) => void;
  reset: () => void;
  options: FilterOptions;
  sort: SortKey;
  setSort: (sort: SortKey) => void;
  /** Matching items, in the chosen sort order. */
  visible: Array<EntityOfType[T]>;
  /** All items of this type, ignoring filters. */
  total: number;
  active: boolean;
}

/**
 * The filters and sort order of one overview and the items they let through. The state lives
 * in memory for this app session only (switching pages keeps it, restarting
 * VOID clears it) and never touches the stored workspace.
 */
export function useListFilters<T extends EntityType>(type: T): ListFilterState<T> {
  const context = useContext(ListFiltersContext);
  if (!context) throw new Error('useListFilters must be used inside <ListFiltersProvider>.');
  const workspace = useWorkspace();
  const { setFilters, setSort } = context;
  const sort = context.sorts[type] ?? DEFAULT_SORT;
  // Deleted projects or tags can never match again; they silently drop out.
  const filters = pruneFilters(workspace, context.filters[type]);
  const query = filters.query;
  const index = useMemo(() => (query.trim() === '' ? undefined : buildSearchIndex(workspace)), [workspace, query]);

  return useMemo(() => {
    const update = (change: (current: ListFilters) => ListFilters) => setFilters(type, (current) => change(pruneFilters(workspace, current)));
    return {
      type,
      filters,
      update,
      reset: () => setFilters(type, () => EMPTY_FILTERS),
      options: getFilterOptions(workspace, type, filters),
      sort,
      setSort: (next: SortKey) => setSort(type, next),
      // Filter first, then sort: the two never interfere with each other.
      visible: sortItems(filterItems(workspace, type, filters, index ? { index } : {}), type, sort),
      total: getItems(workspace, type).length,
      active: hasActiveFilters(filters),
    };
  }, [workspace, type, filters, index, setFilters, sort, setSort]);
}
