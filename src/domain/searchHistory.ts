/**
 * Recent searches. Only queries the user actually used (opened a result for)
 * are kept, at most a handful, newest first, and never anything else about the
 * search. The list lives on this device only and can be cleared at any time.
 */

export const MAX_SEARCH_HISTORY = 8;
/** Longer queries are not worth remembering (and are most likely pasted text). */
export const MAX_HISTORY_QUERY_LENGTH = 100;

/** Trims and collapses whitespace, so "  foo   bar " and "foo bar" are the same entry. */
export function normalizeHistoryQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

const sameQuery = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** Puts a query at the top. Empty, overly long or duplicate (case-insensitive) queries never pile up. */
export function addToSearchHistory(history: readonly string[], query: string, max = MAX_SEARCH_HISTORY): string[] {
  const entry = normalizeHistoryQuery(query);
  if (entry === '' || entry.length > MAX_HISTORY_QUERY_LENGTH) return [...history];
  return [entry, ...history.filter((item) => !sameQuery(item, entry))].slice(0, max);
}

export function removeFromSearchHistory(history: readonly string[], query: string): string[] {
  return history.filter((item) => !sameQuery(item, query));
}

/** Reads a stored list defensively: anything that is not a usable query is dropped. */
export function parseSearchHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  let history: string[] = [];
  // Oldest first, so the newest entry wins and ends up on top.
  for (const item of [...value].reverse()) if (typeof item === 'string') history = addToSearchHistory(history, item);
  return history;
}
