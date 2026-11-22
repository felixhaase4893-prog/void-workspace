import { History, Search, SearchX, X } from 'lucide-react';
import { useDeferredValue, useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';

import { ENTITY_ICONS } from '../../app/navigation';
import { Alert } from '../../components/ui/Alert';
import { Dialog } from '../../components/ui/Dialog';
import { Kbd } from '../../components/ui/Kbd';
import { ENTITY_LABELS } from '../../domain/labels';
import type { EntityType } from '../../domain/models';
import { buildSearchIndex, MAX_QUERY_LENGTH, search, type SearchIndex, type SearchResult } from '../../domain/search';
import { cn } from '../../lib/cn';
import { useWorkspace } from '../../state/workspaceContext';
import { TagList } from '../tags/TagList';
import { HighlightedText } from './HighlightedText';
import { useSearchHistory } from './useSearchHistory';

const GROUP_LABELS: Record<EntityType, string> = {
  project: 'Projects',
  task: 'Tasks',
  note: 'Notes',
  snippet: 'Snippets',
  bug: 'Bugs',
};

interface SearchDialogProps {
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
}

type IndexState = { ok: true; index: SearchIndex } | { ok: false };

/** Global search as a combobox: the input keeps focus, arrow keys move the active result. */
export function SearchDialog({ onClose, onSelect }: SearchDialogProps) {
  const workspace = useWorkspace();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  // Typing stays responsive even when a large workspace takes a moment to scan.
  const deferredQuery = useDeferredValue(query);
  const baseId = useId();
  const listId = `${baseId}-results`;
  const historyListId = `${baseId}-history`;
  const inputId = `${baseId}-input`;
  const searchHistory = useSearchHistory();
  const [historyIndex, setHistoryIndex] = useState(0);

  // Built once per workspace version instead of on every keystroke.
  const indexState = useMemo<IndexState>(() => {
    try {
      return { ok: true, index: buildSearchIndex(workspace) };
    } catch {
      return { ok: false };
    }
  }, [workspace]);

  const results = useMemo(() => (indexState.ok ? search(indexState.index, deferredQuery) : null), [indexState, deferredQuery]);
  const flat = useMemo(() => results?.groups.flatMap((group) => group.results) ?? [], [results]);
  const active = flat.length === 0 ? -1 : Math.min(activeIndex, flat.length - 1);
  const optionId = (index: number) => `${baseId}-option-${index}`;

  // Index of each group's first result in `flat`.
  const groupOffsets = useMemo(() => {
    const groups = results?.groups ?? [];
    return groups.map((_, index) => groups.slice(0, index).reduce((sum, group) => sum + group.results.length, 0));
  }, [results]);

  useEffect(() => {
    if (active === -1) return;
    document.getElementById(`${baseId}-option-${active}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, baseId]);

  const showHistory = query === '' && indexState.ok && searchHistory.history.length > 0;
  const historyActive = showHistory ? Math.min(historyIndex, searchHistory.history.length - 1) : -1;
  const historyOptionId = (index: number) => `${baseId}-history-${index}`;

  const select = (result: SearchResult) => {
    // Only searches that led somewhere are remembered.
    searchHistory.remember(query);
    onSelect(result);
  };

  const applyHistory = (entry: string) => {
    setQuery(entry);
    setActiveIndex(0);
    document.getElementById(inputId)?.focus();
  };

  const onHistoryKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = searchHistory.history.length;
    const entry = searchHistory.history[historyActive];
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHistoryIndex((historyActive + 1) % count);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHistoryIndex((historyActive - 1 + count) % count);
    } else if (event.key === 'Enter' && entry !== undefined) {
      event.preventDefault();
      applyHistory(entry);
    } else if (event.key === 'Delete' && event.shiftKey && entry !== undefined) {
      // Shift+Delete removes the highlighted entry, like in browsers' address bars.
      event.preventDefault();
      searchHistory.remove(entry);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (showHistory) {
      onHistoryKeyDown(event);
      return;
    }
    if (flat.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((active + 1) % flat.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((active - 1 + flat.length) % flat.length);
    } else if (event.key === 'Enter') {
      const selected = flat[active];
      if (selected) {
        event.preventDefault();
        select(selected);
      }
    }
  };

  const hasInput = query !== '';
  const hasTerms = (results?.terms.length ?? 0) > 0;
  let statusText = '';
  if (results && hasTerms) statusText = results.total === 0 ? 'No results' : `${results.total} ${results.total === 1 ? 'result' : 'results'}`;

  return (
    <Dialog open onClose={onClose} title="Search" placement="top">
      <div className="sticky top-0 z-10 -mx-5 border-b border-line bg-surface px-5 pb-3">
        <label htmlFor={inputId} className="sr-only">
          Search projects, tasks, bugs, notes and snippets
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input
            id={inputId}
            data-autofocus
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showHistory || flat.length > 0}
            aria-controls={showHistory ? historyListId : listId}
            aria-activedescendant={showHistory ? historyOptionId(historyActive) : active === -1 ? undefined : optionId(active)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            maxLength={MAX_QUERY_LENGTH}
            placeholder="Search projects, tasks, bugs, notes, snippets…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            className="h-11 w-full rounded-lg border border-line bg-canvas pr-3 pl-9 text-base text-fg placeholder:text-subtle transition-colors hover:border-line-strong focus:border-accent-400 focus:ring-2 focus:ring-accent-500/25 focus:outline-none focus-visible:outline-none sm:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
      </div>

      <p role="status" className="sr-only">
        {statusText}
      </p>

      <div className="pt-3">
        {!indexState.ok ? (
          <Alert tone="danger" title="Search is unavailable">
            Your data could not be prepared for searching. Reload VOID and try again.
          </Alert>
        ) : showHistory ? (
          <section aria-labelledby={`${historyListId}-label`}>
            <div className="mb-1 flex items-center justify-between px-2">
              <h3 id={`${historyListId}-label`} className="font-mono text-[10px] tracking-[0.14em] text-subtle uppercase">
                Recent searches
              </h3>
              <button type="button" onClick={searchHistory.clear} className="rounded px-1 text-xs text-muted hover:text-fg">
                Clear history
              </button>
            </div>
            <ul id={historyListId} role="listbox" aria-label="Recent searches">
              {searchHistory.history.map((entry, index) => {
                const isActive = index === historyActive;
                return (
                  <li
                    key={entry}
                    id={historyOptionId(index)}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => applyHistory(entry)}
                    onMouseMove={() => {
                      if (!isActive) setHistoryIndex(index);
                    }}
                    className={cn(
                      'group flex cursor-pointer items-center gap-3 rounded-lg py-1.5 pr-1 pl-2 transition-colors',
                      isActive ? 'bg-raised ring-1 ring-accent-500/40' : 'hover:bg-raised/60',
                    )}
                  >
                    <History className={cn('size-4 shrink-0', isActive ? 'text-accent-300' : 'text-subtle')} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{entry}</span>
                    <button
                      type="button"
                      aria-label={`Remove “${entry}” from history`}
                      title="Remove from history"
                      onClick={(event) => {
                        event.stopPropagation();
                        searchHistory.remove(entry);
                        // Keep typing and arrow keys working after the click.
                        document.getElementById(inputId)?.focus();
                      }}
                      className="grid size-6 shrink-0 place-items-center rounded text-subtle opacity-60 hover:bg-overlay hover:text-fg group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : !hasInput ? (
          <SearchHint icon={Search} title="Search everything in VOID" text="Find projects, tasks, bugs, notes and snippets by name, content, tag, language, status and more." />
        ) : !hasTerms ? (
          <SearchHint icon={Search} title="Type a search term" text="Spaces alone don’t count. Enter at least one letter, number or symbol." />
        ) : results && results.total === 0 ? (
          <SearchHint icon={SearchX} title="Nothing found" text={`Nothing matches “${query.trim()}”. Check the spelling or try fewer words.`} />
        ) : null}

        {/* The listbox stays in the DOM so the combobox always points at it. */}
        <ul id={listId} role="listbox" aria-label="Search results" className={cn('space-y-4', flat.length === 0 && 'hidden')}>
          {results?.groups.map((group, groupIndex) => {
            const headingId = `${baseId}-group-${group.type}`;
            const Icon = ENTITY_ICONS[group.type];
            return (
              <li key={group.type} role="presentation">
                <div id={headingId} className="mb-1 flex items-baseline justify-between px-2 font-mono text-[10px] tracking-[0.14em] text-subtle uppercase">
                  <span>{GROUP_LABELS[group.type]}</span>
                  <span aria-hidden="true">
                    {group.total > group.results.length ? `${group.results.length} of ${group.total}` : group.total}
                  </span>
                </div>
                <ul role="group" aria-labelledby={headingId}>
                  {group.results.map((result, resultIndex) => {
                    const index = (groupOffsets[groupIndex] ?? 0) + resultIndex;
                    const isActive = index === active;
                    const meta = [ENTITY_LABELS[result.type], result.projectName].filter(Boolean).join(' · ');
                    return (
                      <li
                        key={`${result.type}:${result.id}`}
                        id={optionId(index)}
                        role="option"
                        aria-selected={isActive}
                        onClick={() => select(result)}
                        onMouseMove={() => {
                          if (!isActive) setActiveIndex(index);
                        }}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition-colors',
                          isActive ? 'bg-raised ring-1 ring-accent-500/40' : 'hover:bg-raised/60',
                        )}
                      >
                        <Icon className={cn('mt-0.5 size-4 shrink-0', isActive ? 'text-accent-300' : 'text-subtle')} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-fg">
                            <HighlightedText text={result.title} terms={results.terms} />
                          </span>
                          <span className="block truncate text-xs text-subtle">{meta}</span>
                          <TagList tagIds={result.tagIds} max={3} terms={results.terms} className="mt-1" />
                          {result.context && (
                            <span className={cn('mt-0.5 block truncate text-xs text-muted', result.contextLabel === 'Code' && 'font-mono [font-variant-ligatures:none]')}>
                              <span className="text-subtle">{result.contextLabel}: </span>
                              <HighlightedText text={result.context} terms={results.terms} />
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 hidden items-center gap-3 border-t border-line pt-3 text-[11px] text-subtle sm:flex" aria-hidden="true">
          <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> to move</span>
          <span><Kbd>Enter</Kbd> to open</span>
          {showHistory && <span><Kbd>Shift</Kbd> <Kbd>Del</Kbd> to remove</span>}
          <span><Kbd>Esc</Kbd> to close</span>
        </p>
      </div>
    </Dialog>
  );
}

function SearchHint({ icon: Icon, title, text }: { icon: typeof Search; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <Icon className="mb-3 size-5 text-subtle" aria-hidden="true" />
      <p className="text-[13px] font-medium text-fg">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted">{text}</p>
    </div>
  );
}
