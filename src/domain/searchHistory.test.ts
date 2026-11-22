import { describe, expect, it } from 'vitest';

import { addToSearchHistory, MAX_HISTORY_QUERY_LENGTH, MAX_SEARCH_HISTORY, parseSearchHistory, removeFromSearchHistory } from './searchHistory';

describe('search history', () => {
  it('keeps the newest query on top and tidies whitespace', () => {
    expect(addToSearchHistory(['jump'], '  save   system ')).toEqual(['save system', 'jump']);
  });

  it('moves a repeated query to the top instead of adding it twice (ignoring case)', () => {
    expect(addToSearchHistory(['jump', 'Save', 'debounce'], 'save')).toEqual(['save', 'jump', 'debounce']);
  });

  it('ignores empty and overly long queries', () => {
    expect(addToSearchHistory(['jump'], '   ')).toEqual(['jump']);
    expect(addToSearchHistory(['jump'], 'x'.repeat(MAX_HISTORY_QUERY_LENGTH + 1))).toEqual(['jump']);
  });

  it(`keeps at most ${MAX_SEARCH_HISTORY} entries`, () => {
    let history: string[] = [];
    for (let index = 0; index < 20; index += 1) history = addToSearchHistory(history, `query ${index}`);
    expect(history).toHaveLength(MAX_SEARCH_HISTORY);
    expect(history[0]).toBe('query 19');
  });

  it('removes single entries', () => {
    expect(removeFromSearchHistory(['a', 'B', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('reads stored lists defensively', () => {
    expect(parseSearchHistory(['jump', 3, null, ' jump ', 'save'])).toEqual(['jump', 'save']);
    expect(parseSearchHistory('jump')).toEqual([]);
    expect(parseSearchHistory(null)).toEqual([]);
  });
});
