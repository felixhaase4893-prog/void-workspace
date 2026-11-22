import { ArrowUpDown, ChevronDown, Search, SearchX, SlidersHorizontal, Star, X } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent } from 'react';

import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  FILTER_FIELDS,
  FILTER_FIELD_LABELS,
  countActiveFilters,
  getFilterValueLabel,
  removeFilterValue,
  toggleFilterValue,
  type FilterField,
} from '../../domain/filters';
import type { EntityType } from '../../domain/models';
import { MAX_QUERY_LENGTH, parseQuery } from '../../domain/search';
import { SORT_KEYS, getSortLabel, isSortKeyFor } from '../../domain/sorting';
import { cn } from '../../lib/cn';
import type { ListFilterState } from './listFiltersContext';

const NOUNS: Record<EntityType, [singular: string, plural: string]> = {
  project: ['project', 'projects'],
  task: ['task', 'tasks'],
  note: ['note', 'notes'],
  snippet: ['snippet', 'snippets'],
  bug: ['bug', 'bugs'],
};

const FIELD_HINTS: Partial<Record<FilterField, string>> = {
  tag: 'Shows items with at least one of the selected tags.',
};

const toggleClasses = (pressed: boolean) =>
  cn(
    'inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:outline-none',
    pressed ? 'border-accent-500/50 bg-accent-500/15 text-accent-200' : 'border-line-strong text-muted hover:border-subtle/60 hover:text-fg',
  );

/**
 * The one filter bar every overview uses: a text search, a favourites toggle,
 * a sort order picker, a collapsible panel with the list's criteria, and removable chips for
 * everything that is active. It wraps instead of overflowing on small screens.
 */
export function FilterBar<T extends EntityType>({ state }: { state: ListFilterState<T> }) {
  const { type, filters, update, reset, options, visible, total, active, sort, setSort } = state;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [singular, plural] = NOUNS[type];
  const criteriaCount = countActiveFilters({ ...filters, favoritesOnly: false, query: '' });

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    setOpen(false);
    toggleRef.current?.focus();
  };

  const chips = FILTER_FIELDS[type].flatMap((field) =>
    (filters.values[field] ?? []).map((value) => ({ field, value, label: getFilterValueLabel(options, field, value) })),
  );
  const hasQuery = parseQuery(filters.query).length > 0;

  return (
    <section aria-label={`Filter ${plural}`} className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_14rem]">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input
            type="search"
            value={filters.query}
            maxLength={MAX_QUERY_LENGTH}
            onChange={(event) => {
              const query = event.target.value;
              update((current) => ({ ...current, query }));
            }}
            aria-label={`Search ${plural}`}
            placeholder={`Search ${plural}…`}
            className="h-9 w-full rounded-lg border border-line bg-canvas pr-3 pl-9 text-[13px] text-fg transition-colors placeholder:text-subtle hover:border-line-strong focus:border-accent-400 focus:ring-2 focus:ring-accent-500/25 focus:outline-none"
          />
        </div>
        <Button
          size="sm"
          aria-pressed={filters.favoritesOnly}
          icon={<Star fill={filters.favoritesOnly ? 'currentColor' : 'none'} />}
          className={cn('h-9', filters.favoritesOnly && 'border-accent-500/50 bg-accent-500/15 text-accent-200 hover:bg-accent-500/20')}
          onClick={() => update((current) => ({ ...current, favoritesOnly: !current.favoritesOnly }))}
        >
          Favorites only
        </Button>
        <Button
          ref={toggleRef}
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          icon={<SlidersHorizontal />}
          className="h-9"
          onClick={() => setOpen((value) => !value)}
        >
          Filters
          {criteriaCount > 0 && (
            <Badge tone="accent">
              {criteriaCount}
              <span className="sr-only"> active</span>
            </Badge>
          )}
        </Button>
        <div className="relative">
          <ArrowUpDown className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <select
            value={sort}
            onChange={(event) => {
              const next = event.target.value;
              if (isSortKeyFor(type, next)) setSort(next);
            }}
            aria-label={`Sort ${plural}`}
            title="Sort order"
            className="h-9 max-w-[13rem] cursor-pointer appearance-none truncate rounded-lg border border-line-strong bg-canvas pr-8 pl-8 text-xs font-medium text-muted transition-colors hover:border-subtle/60 hover:text-fg focus:border-accent-400 focus:ring-2 focus:ring-accent-500/25 focus:outline-none"
          >
            {SORT_KEYS[type].map((key) => (
              <option key={key} value={key}>
                {getSortLabel(type, key)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-subtle" aria-hidden="true" />
        </div>
      </div>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={`${singular[0]?.toUpperCase()}${singular.slice(1)} filters`}
          onKeyDown={closeOnEscape}
          className="animate-fade-in grid gap-4 rounded-card border border-line bg-surface p-4 sm:grid-cols-2"
        >
          {FILTER_FIELDS[type].map((field) => {
            const fieldOptions = options[field] ?? [];
            const selected = filters.values[field] ?? [];
            const hint = FIELD_HINTS[field];
            return (
              <fieldset key={field} className="min-w-0">
                <legend className="mb-2 text-xs font-medium text-muted">{FILTER_FIELD_LABELS[field]}</legend>
                {fieldOptions.length === 0 ? (
                  <p className="text-xs text-subtle">
                    {field === 'tag' ? `No ${plural} have tags yet.` : field === 'project' ? `No ${plural} yet.` : 'Nothing to filter by yet.'}
                  </p>
                ) : (
                  <ul className="scrollbar-thin flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                    {fieldOptions.map((option) => {
                      const pressed = selected.includes(option.value);
                      return (
                        <li key={option.value} className="max-w-full min-w-0">
                          <button
                            type="button"
                            aria-pressed={pressed}
                            aria-label={`${option.label} (${option.count})`}
                            title={option.label}
                            onClick={() => update((current) => toggleFilterValue(current, field, option.value))}
                            className={toggleClasses(pressed)}
                          >
                            <span className="truncate">{option.label}</span>
                            <span className="font-mono text-[10px] text-subtle" aria-hidden="true">
                              {option.count}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {hint && fieldOptions.length > 0 && <p className="mt-2 text-[11px] text-subtle">{hint}</p>}
              </fieldset>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <p aria-live="polite" className="mr-1 text-subtle">
          {active ? `Showing ${visible.length} of ${total} ${total === 1 ? singular : plural}` : `${total} ${total === 1 ? singular : plural}`}
        </p>
        {active && (
          <ul aria-label="Active filters" className="flex min-w-0 flex-wrap gap-1.5">
            {filters.favoritesOnly && (
              <ActiveChip label="Favorites only" onRemove={() => update((current) => ({ ...current, favoritesOnly: false }))} />
            )}
            {hasQuery && <ActiveChip label={`Search: “${filters.query.trim()}”`} onRemove={() => update((current) => ({ ...current, query: '' }))} />}
            {chips.map((chip) => (
              <ActiveChip
                key={`${chip.field}:${chip.value}`}
                label={`${FILTER_FIELD_LABELS[chip.field]}: ${chip.label}`}
                onRemove={() => update((current) => removeFilterValue(current, chip.field, chip.value))}
              />
            ))}
          </ul>
        )}
        {active && (
          <button type="button" onClick={reset} className="rounded px-1 text-xs font-medium text-accent-300 hover:text-accent-200 focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:outline-none">
            Reset all filters
          </button>
        )}
      </div>
    </section>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <li className="max-w-full min-w-0">
      <span className="inline-flex h-6 max-w-[16rem] min-w-0 items-center gap-1 rounded-md border border-accent-500/30 bg-accent-500/10 pr-0.5 pl-2 text-[11px] font-medium text-accent-200">
        <span className="truncate" title={label}>
          {label}
        </span>
        <button
          type="button"
          aria-label={`Remove filter ${label}`}
          title="Remove filter"
          onClick={onRemove}
          className="grid size-5 shrink-0 place-items-center rounded text-accent-300 hover:bg-accent-500/20 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:outline-none"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      </span>
    </li>
  );
}

/** Shown instead of the list when items exist but none match the filters. */
export function NoMatches<T extends EntityType>({ state }: { state: ListFilterState<T> }) {
  const plural = NOUNS[state.type][1];
  return (
    <EmptyState
      icon={SearchX}
      title={`No ${plural} match your filters`}
      description={`You have ${state.total} ${state.total === 1 ? NOUNS[state.type][0] : plural}, but none fit everything that is selected. Remove a filter or start over.`}
      action={
        <Button size="sm" onClick={state.reset}>
          Reset all filters
        </Button>
      }
    />
  );
}
