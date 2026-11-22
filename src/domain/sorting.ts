import { BUG_PRIORITIES, BUG_STATUSES, TASK_PRIORITIES, TASK_STATUSES, isValidDueDate, type EntityOfType, type EntityType } from './models';

/**
 * Pure sort logic for the four overviews. Like filters, sorting is only a view:
 * it returns a new array and never changes or reorders the stored items.
 *
 * Every sort is stable: items that compare equal keep their stored order, so
 * the result is predictable and does not jump around between renders.
 */

export type SortKey = 'default' | 'name-asc' | 'name-desc' | 'created-desc' | 'created-asc' | 'updated-desc' | 'priority' | 'status' | 'due-asc';

/** Which sort orders each overview offers, in the order they are shown. */
export const SORT_KEYS: { readonly [T in EntityType]: readonly SortKey[] } = {
  project: ['default', 'name-asc', 'name-desc', 'created-desc', 'created-asc', 'updated-desc'],
  task: ['default', 'name-asc', 'name-desc', 'created-desc', 'created-asc', 'updated-desc', 'priority', 'status', 'due-asc'],
  note: ['default', 'name-asc', 'name-desc', 'created-desc', 'created-asc', 'updated-desc'],
  snippet: ['default', 'name-asc', 'name-desc', 'created-desc', 'created-asc', 'updated-desc'],
  bug: ['default', 'name-asc', 'name-desc', 'created-desc', 'created-asc', 'updated-desc', 'priority', 'status', 'due-asc'],
};

export const SORT_LABELS: Record<SortKey, string> = {
  default: 'Default order',
  'name-asc': 'Name: A–Z',
  'name-desc': 'Name: Z–A',
  'created-desc': 'Newest first',
  'created-asc': 'Oldest first',
  'updated-desc': 'Recently updated',
  priority: 'Priority: high to low',
  status: 'Status: to do first',
  'due-asc': 'Due date: soonest first',
};

/** The few labels that read differently for one overview, e.g. bugs are "open", not "to do". */
const SORT_LABEL_OVERRIDES: Partial<Record<EntityType, Partial<Record<SortKey, string>>>> = {
  bug: { status: 'Status: open first' },
};

export function getSortLabel(type: EntityType, key: SortKey): string {
  return SORT_LABEL_OVERRIDES[type]?.[key] ?? SORT_LABELS[key];
}

/** The stored order (new items are added at the top). Keeps the lists exactly as they were before sorting existed. */
export const DEFAULT_SORT: SortKey = 'default';

export function isSortKeyFor(type: EntityType, value: string): value is SortKey {
  return (SORT_KEYS[type] as readonly string[]).includes(value);
}

type Item = EntityOfType[EntityType];

/** Projects have a name, everything else a title. */
export function sortName(item: Item): string {
  const record = item as Partial<Record<string, unknown>>;
  const value = 'name' in item ? record.name : record.title;
  return typeof value === 'string' ? value.trim() : '';
}

/** Unparseable dates sort as the oldest instead of breaking the comparison. */
function time(value: unknown): number {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Tasks and bugs share one scale: low < medium < high < critical. */
const PRIORITY_RANK: Record<string, number> = Object.fromEntries([...TASK_PRIORITIES, ...BUG_PRIORITIES].map((value) => [value, BUG_PRIORITIES.indexOf(value)]));
/** To do / open first, then in progress, then done / fixed, then closed. */
const STATUS_RANK: Record<string, number> = {
  ...Object.fromEntries(TASK_STATUSES.map((value, index) => [value, index])),
  ...Object.fromEntries(BUG_STATUSES.map((value, index) => [value, index])),
};
const UNKNOWN_STATUS_RANK = BUG_STATUSES.length;

function rank<K extends string>(ranks: Record<K, number>, value: unknown, fallback: number): number {
  return typeof value === 'string' && value in ranks ? ranks[value as K] : fallback;
}

function compareNumbers(a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

type Compare = (a: Item, b: Item) => number;

const COMPARATORS: Record<Exclude<SortKey, 'default'>, Compare> = {
  'name-asc': (a, b) => collator.compare(sortName(a), sortName(b)),
  'name-desc': (a, b) => collator.compare(sortName(b), sortName(a)),
  'created-desc': (a, b) => compareNumbers(time(b.createdAt), time(a.createdAt)),
  'created-asc': (a, b) => compareNumbers(time(a.createdAt), time(b.createdAt)),
  'updated-desc': (a, b) => compareNumbers(time(b.updatedAt), time(a.updatedAt)),
  // High before low; unknown values go last.
  priority: (a, b) =>
    compareNumbers(rank(PRIORITY_RANK, (b as Partial<Record<string, unknown>>).priority, -1), rank(PRIORITY_RANK, (a as Partial<Record<string, unknown>>).priority, -1)),
  // To do → In progress → Done; unknown values go last.
  status: (a, b) =>
    compareNumbers(
      rank(STATUS_RANK, (a as Partial<Record<string, unknown>>).status, UNKNOWN_STATUS_RANK),
      rank(STATUS_RANK, (b as Partial<Record<string, unknown>>).status, UNKNOWN_STATUS_RANK),
    ),
  // Earliest due date first; items without a due date go last.
  'due-asc': (a, b) => {
    const dueA = (a as Partial<Record<string, unknown>>).dueDate;
    const dueB = (b as Partial<Record<string, unknown>>).dueDate;
    const validA = isValidDueDate(dueA);
    const validB = isValidDueDate(dueB);
    if (validA && validB) return dueA < dueB ? -1 : dueA > dueB ? 1 : 0;
    return compareNumbers(validA ? 0 : 1, validB ? 0 : 1);
  },
};

/**
 * The items in the chosen order, as a new array. Ties (and the default order)
 * keep the order the items were given in. A key that does not belong to this
 * overview falls back to the default order.
 */
export function sortItems<T extends EntityType>(items: ReadonlyArray<EntityOfType[T]>, type: T, sort: SortKey): Array<EntityOfType[T]> {
  if (sort === 'default' || !isSortKeyFor(type, sort)) return [...items];
  const compare = COMPARATORS[sort];
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => compare(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item);
}
