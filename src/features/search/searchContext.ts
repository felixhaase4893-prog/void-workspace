import { createContext, useContext } from 'react';

export interface SearchContextValue {
  openSearch: () => void;
}

export const SearchContext = createContext<SearchContextValue | null>(null);

export function useSearch(): SearchContextValue {
  const value = useContext(SearchContext);
  if (!value) throw new Error('useSearch must be used inside <SearchProvider>.');
  return value;
}
