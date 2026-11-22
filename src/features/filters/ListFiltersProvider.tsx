import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { EMPTY_FILTERS, type ListFilters } from '../../domain/filters';
import type { EntityType } from '../../domain/models';
import { DEFAULT_SORT, type SortKey } from '../../domain/sorting';
import { ListFiltersContext, type ListFiltersContextValue } from './listFiltersContext';

const initialFilters = (): Record<EntityType, ListFilters> => ({
  project: EMPTY_FILTERS,
  task: EMPTY_FILTERS,
  note: EMPTY_FILTERS,
  snippet: EMPTY_FILTERS,
  bug: EMPTY_FILTERS,
});

const initialSorts = (): Record<EntityType, SortKey> => ({
  project: DEFAULT_SORT,
  task: DEFAULT_SORT,
  note: DEFAULT_SORT,
  snippet: DEFAULT_SORT,
  bug: DEFAULT_SORT,
});

/** Keeps each overview's filters and sort order while the user moves between pages. */
export function ListFiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setAll] = useState(initialFilters);
  const [sorts, setSorts] = useState(initialSorts);

  const setFilters = useCallback<ListFiltersContextValue['setFilters']>((type, update) => {
    setAll((current) => {
      const next = update(current[type]);
      return next === current[type] ? current : { ...current, [type]: next };
    });
  }, []);

  const setSort = useCallback<ListFiltersContextValue['setSort']>((type, sort) => {
    setSorts((current) => (current[type] === sort ? current : { ...current, [type]: sort }));
  }, []);

  const value = useMemo(() => ({ filters, setFilters, sorts, setSort }), [filters, setFilters, sorts, setSort]);
  return <ListFiltersContext.Provider value={value}>{children}</ListFiltersContext.Provider>;
}
