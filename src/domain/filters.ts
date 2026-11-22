import { getDueState, toDayKey } from './dueDates';
import { BUG_PRIORITY_LABELS, BUG_STATUS_LABELS, PROJECT_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from './labels';
import {
  BUG_PRIORITIES,
  BUG_STATUSES,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type EntityOfType,
  type EntityType,
  type Workspace,
} from './models';
import { buildSearchIndex, parseQuery, search, type SearchIndex } from './search';
import { createTagLookup } from './tags';

/**
 * Pure filter logic for the four overviews. Filters are a view on the data:
 * they never change items, and nothing here is persisted.
 *
 * Rules, the same for every list:
 * - different criteria are combined with AND,
 * - several values within one criterion are combined with OR
 *   (e.g. "tag Roblox or tag UI"),
 * - an empty criterion does not filter at all.
 */

export type FilterField = 'status' | 'priority' | 'due' | 'project' | 'language' | 'tag';

/** Which criteria each overview offers, in the order they are shown. */
export const FILTER_FIELDS: { readonly [T in EntityType]: readonly FilterField[] } = {
  project: ['status', 'tag'],
  task: ['status', 'priority', 'due', 'project', 'tag'],
  note: ['project', 'tag'],
  snippet: ['language', 'project', 'tag'],
  bug: ['status', 'priority', 'due', 'project', 'tag'],
};

export const FILTER_FIELD_LABELS: Record<FilterField, string> = {
  status: 'Status',
  priority: 'Priority',
  due: 'Due date',
  project: 'Project',
  language: 'Language',
  tag: 'Tags',
};

/**
 * Due date buckets, relative to today. Finished items (done tasks, fixed or
 * closed bugs) are in none of them: they are never "overdue".
 */
export const DUE_FILTER_VALUES = ['overdue', 'today', 'upcoming', 'later', 'none'] as const;
export const DUE_FILTER_LABELS: Record<(typeof DUE_FILTER_VALUES)[number], string> = {
  overdue: 'Overdue',
  today: 'Due today',
  upcoming: 'Next 7 days',
  later: 'Later',
  none: 'No due date',
};

/** Filter value for items that belong to no project. Real ids are never empty. */
export const NO_PROJECT = '';
/** Filter value for snippets whose language is missing or blank. */
export const NO_LANGUAGE = '';

export interface ListFilters {
  values: Partial<Record<FilterField, string[]>>;
  favoritesOnly: boolean;
  /** Free text, matched exactly like the global search. */
  query: string;
}

export const EMPTY_FILTERS: ListFilters = { values: {}, favoritesOnly: false, query: '' };

export interface FilterOption {
  value: string;
  label: string;
  /** Items of this list with this value, ignoring all filters. */
  count: number;
}

export type FilterOptions = Partial<Record<FilterField, FilterOption[]>>;

type Item = EntityOfType[EntityType];

const COLLECTION_OF = { project: 'projects', task: 'tasks', note: 'notes', snippet: 'snippets', bug: 'bugs' } as const satisfies Record<EntityType, keyof Workspace>;

export function getItems<T extends EntityType>(workspace: Workspace, type: T): Array<EntityOfType[T]> {
  const items: Array<EntityOfType[EntityType]> = workspace[COLLECTION_OF[type]];
  return items as Array<EntityOfType[T]>;
}

/** "  TypeScript " and "typescript" are the same language. */
export function languageKey(language: unknown): string {
  return typeof language === 'string' ? language.trim().toLowerCase() : NO_LANGUAGE;
}

/** The values one item has for a criterion. Tolerates missing optional fields. `today` is a local day key. */
function valuesOf(item: Item, field: FilterField, today: string): string[] {
  const record = item as Partial<Record<string, unknown>>;
  switch (field) {
    case 'due': {
      const dueDate = typeof record.dueDate === 'string' ? record.dueDate : null;
      const state = getDueState({ dueDate, status: typeof record.status === 'string' ? record.status : '' }, today);
      return state === 'finished' ? [] : [state];
    }
    case 'status':
    case 'priority': {
      const value = record[field];
      return typeof value === 'string' ? [value] : [];
    }
    case 'project':
      return [typeof record.projectId === 'string' && record.projectId !== '' ? record.projectId : NO_PROJECT];
    case 'language':
      return [languageKey(record.language)];
    case 'tag':
      return Array.isArray(record.tagIds) ? record.tagIds.filter((id): id is string => typeof id === 'string') : [];
  }
}

export function countActiveFilters(filters: ListFilters): number {
  const values = Object.values(filters.values).reduce((sum, list) => sum + (list?.length ?? 0), 0);
  return values + (filters.favoritesOnly ? 1 : 0) + (parseQuery(filters.query).length > 0 ? 1 : 0);
}

export function hasActiveFilters(filters: ListFilters): boolean {
  return countActiveFilters(filters) > 0;
}

/* ---------- Changing filters (always returns a new object) ---------- */

export function toggleFilterValue(filters: ListFilters, field: FilterField, value: string): ListFilters {
  const current = filters.values[field] ?? [];
  const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
  return { ...filters, values: { ...filters.values, [field]: next } };
}

export function removeFilterValue(filters: ListFilters, field: FilterField, value: string): ListFilters {
  const current = filters.values[field] ?? [];
  return { ...filters, values: { ...filters.values, [field]: current.filter((item) => item !== value) } };
}

export function clearFilterField(filters: ListFilters, field: FilterField): ListFilters {
  return { ...filters, values: { ...filters.values, [field]: [] } };
}

/* ---------- Options ---------- */

function count(items: readonly Item[], field: FilterField, today: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const value of new Set(valuesOf(item, field, today))) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

const byLabel = (a: FilterOption, b: FilterOption) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });

/**
 * What each criterion of one overview can be filtered by, built from the real
 * data: every existing status and priority, the projects and tags the items
 * actually use, and the stored languages. Values that are selected but no
 * longer used (e.g. the last tagged item was deleted) stay available, so a
 * visible filter chip can always be found and removed again.
 */
export function getFilterOptions(
  workspace: Workspace,
  type: EntityType,
  filters: ListFilters = EMPTY_FILTERS,
  today: string = toDayKey(new Date()),
): FilterOptions {
  const items: readonly Item[] = getItems(workspace, type);
  const options: FilterOptions = {};
  for (const field of FILTER_FIELDS[type]) {
    const counts = count(items, field, today);
    const selected = filters.values[field] ?? [];
    const relevant = (value: string) => counts.has(value) || selected.includes(value);
    switch (field) {
      case 'status':
        options.status =
          type === 'project'
            ? PROJECT_STATUSES.map((value) => ({ value, label: PROJECT_STATUS_LABELS[value], count: counts.get(value) ?? 0 }))
            : type === 'bug'
              ? BUG_STATUSES.map((value) => ({ value, label: BUG_STATUS_LABELS[value], count: counts.get(value) ?? 0 }))
              : TASK_STATUSES.map((value) => ({ value, label: TASK_STATUS_LABELS[value], count: counts.get(value) ?? 0 }));
        break;
      case 'priority':
        // Shown from high to low, the way people scan priorities.
        options.priority =
          type === 'bug'
            ? [...BUG_PRIORITIES].reverse().map((value) => ({ value, label: BUG_PRIORITY_LABELS[value], count: counts.get(value) ?? 0 }))
            : [...TASK_PRIORITIES].reverse().map((value) => ({ value, label: TASK_PRIORITY_LABELS[value], count: counts.get(value) ?? 0 }));
        break;
      case 'due':
        options.due = DUE_FILTER_VALUES.map((value) => ({ value, label: DUE_FILTER_LABELS[value], count: counts.get(value) ?? 0 }));
        break;
      case 'project': {
        const projects = workspace.projects
          .filter((project) => relevant(project.id))
          .map((project) => ({ value: project.id, label: project.name, count: counts.get(project.id) ?? 0 }))
          .sort(byLabel);
        options.project = relevant(NO_PROJECT) ? [...projects, { value: NO_PROJECT, label: 'No project', count: counts.get(NO_PROJECT) ?? 0 }] : projects;
        break;
      }
      case 'language':
        options.language = languageOptions(items, counts, selected);
        break;
      case 'tag':
        options.tag = workspace.tags
          .filter((tag) => relevant(tag.id))
          .map((tag) => ({ value: tag.id, label: tag.name, count: counts.get(tag.id) ?? 0 }))
          .sort(byLabel);
        break;
    }
  }
  return options;
}

/** Languages are grouped case-insensitively and shown in their most common spelling. */
function languageOptions(items: readonly Item[], counts: Map<string, number>, selected: readonly string[]): FilterOption[] {
  const spellings = new Map<string, Map<string, number>>();
  for (const item of items) {
    const raw = (item as Partial<Record<string, unknown>>).language;
    const key = languageKey(raw);
    if (key === NO_LANGUAGE || typeof raw !== 'string') continue;
    const forKey = spellings.get(key) ?? new Map<string, number>();
    forKey.set(raw.trim(), (forKey.get(raw.trim()) ?? 0) + 1);
    spellings.set(key, forKey);
  }
  const label = (key: string): string => {
    if (key === NO_LANGUAGE) return 'No language';
    const forKey = spellings.get(key);
    if (!forKey) return key;
    // Ties go to the spelling seen first (sort is stable), i.e. the most recently added snippet.
    return [...forKey.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? key;
  };
  const keys = new Set([...counts.keys(), ...selected]);
  const options = [...keys].map((key) => ({ value: key, label: label(key), count: counts.get(key) ?? 0 }));
  const named = options.filter((option) => option.value !== NO_LANGUAGE).sort(byLabel);
  const unnamed = options.filter((option) => option.value === NO_LANGUAGE);
  return [...named, ...unnamed];
}

/** Label for an active filter chip; falls back gracefully for values that disappeared meanwhile. */
export function getFilterValueLabel(options: FilterOptions, field: FilterField, value: string): string {
  const found = options[field]?.find((option) => option.value === value);
  if (found) return found.label;
  if (field === 'project') return value === NO_PROJECT ? 'No project' : 'Deleted project';
  if (field === 'tag') return 'Deleted tag';
  if (field === 'language') return value === NO_LANGUAGE ? 'No language' : value;
  return value;
}

/* ---------- Applying filters ---------- */

/**
 * Drops selected values that can never match again because the project or
 * tag they refer to was deleted. Keeps everything else as chosen.
 */
export function pruneFilters(workspace: Workspace, filters: ListFilters): ListFilters {
  const projectIds = new Set(workspace.projects.map((project) => project.id));
  const tags = createTagLookup(workspace.tags);
  const keep: Partial<Record<FilterField, (value: string) => boolean>> = {
    project: (value) => value === NO_PROJECT || projectIds.has(value),
    tag: (value) => tags.has(value),
  };
  let changed = false;
  const values: ListFilters['values'] = {};
  for (const [field, list] of Object.entries(filters.values) as Array<[FilterField, string[] | undefined]>) {
    const test = keep[field];
    const next = test && list ? list.filter(test) : list;
    if (next && list && next.length !== list.length) changed = true;
    values[field] = next;
  }
  return changed ? { ...filters, values } : filters;
}

export interface FilterContext {
  /** Reuse the search index the app already built for this workspace, if there is one. */
  index?: SearchIndex;
  /** Today's local day key (`YYYY-MM-DD`) for the due date filter. Defaults to the current day. */
  today?: string;
}

/**
 * The items of one overview that match every active filter, in their original
 * order. The text query uses the global search engine, so a list never shows
 * something the search would not find, and vice versa.
 */
export function filterItems<T extends EntityType>(
  workspace: Workspace,
  type: T,
  filters: ListFilters,
  context: FilterContext = {},
): Array<EntityOfType[T]> {
  const items = getItems(workspace, type);
  const today = context.today ?? toDayKey(new Date());
  const criteria = FILTER_FIELDS[type]
    .map((field) => ({ field, selected: new Set(filters.values[field] ?? []) }))
    .filter(({ selected }) => selected.size > 0);

  let matchingIds: Set<string> | null = null;
  if (parseQuery(filters.query).length > 0) {
    const index = (context.index ?? buildSearchIndex(workspace)).filter((entry) => entry.type === type);
    const results = search(index, filters.query, { limitPerType: Number.POSITIVE_INFINITY });
    matchingIds = new Set(results.groups.flatMap((group) => group.results.map((result) => result.id)));
  }

  return items.filter((item) => {
    if (filters.favoritesOnly && item.favorite !== true) return false;
    if (matchingIds && !matchingIds.has(item.id)) return false;
    return criteria.every(({ field, selected }) => valuesOf(item, field, today).some((value) => selected.has(value)));
  });
}
