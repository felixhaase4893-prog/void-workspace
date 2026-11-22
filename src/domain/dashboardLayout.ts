/**
 * Which dashboard cards are shown and in which order. Kept deliberately small:
 * a fixed set of cards that can be hidden and moved up or down, nothing else.
 * The layout is a preference of this device, not part of the workspace.
 */

export const DASHBOARD_CARDS = ['stats', 'statistics', 'quickActions', 'dueSoon', 'recent', 'projects'] as const;

export type DashboardCardId = (typeof DASHBOARD_CARDS)[number];

export const DASHBOARD_CARD_LABELS: Record<DashboardCardId, string> = {
  stats: 'Summary',
  statistics: 'Statistics',
  quickActions: 'Quick actions',
  dueSoon: 'Due soon',
  recent: 'Recently edited',
  projects: 'Projects',
};

export const DASHBOARD_CARD_HINTS: Record<DashboardCardId, string> = {
  stats: 'Counts of projects, tasks, bugs, notes and snippets',
  statistics: 'Completed and open tasks, closed bugs and active projects',
  quickActions: 'Buttons to create something new',
  dueSoon: 'Overdue tasks and tasks due this week',
  recent: 'The items you edited last',
  projects: 'Your most recently updated projects',
};

/** Cards that span the full width. The others are laid out side by side on wide windows. */
export const WIDE_DASHBOARD_CARDS: ReadonlySet<DashboardCardId> = new Set<DashboardCardId>(['stats', 'statistics', 'quickActions']);

export interface DashboardLayout {
  order: DashboardCardId[];
  hidden: DashboardCardId[];
}

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = { order: [...DASHBOARD_CARDS], hidden: [] };

function isCardId(value: unknown): value is DashboardCardId {
  return typeof value === 'string' && (DASHBOARD_CARDS as readonly string[]).includes(value);
}

function uniqueCards(value: unknown): DashboardCardId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isCardId))];
}

/**
 * Turns whatever was stored into a valid layout: unknown cards and duplicates
 * are dropped, and cards missing from the order (e.g. added in a later VOID
 * version) are appended in their default position order, visible.
 */
export function normalizeDashboardLayout(value: unknown): DashboardLayout {
  if (typeof value !== 'object' || value === null) return DEFAULT_DASHBOARD_LAYOUT;
  const record = value as Record<string, unknown>;
  const order = uniqueCards(record.order);
  for (const card of DASHBOARD_CARDS) if (!order.includes(card)) order.push(card);
  return { order, hidden: uniqueCards(record.hidden) };
}

export function visibleDashboardCards(layout: DashboardLayout): DashboardCardId[] {
  return layout.order.filter((card) => !layout.hidden.includes(card));
}

/** Moves a card one step up (-1) or down (+1). At the edges nothing changes. */
export function moveDashboardCard(layout: DashboardLayout, card: DashboardCardId, direction: -1 | 1): DashboardLayout {
  const from = layout.order.indexOf(card);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= layout.order.length) return layout;
  const order = [...layout.order];
  [order[from], order[to]] = [order[to] as DashboardCardId, order[from] as DashboardCardId];
  return { ...layout, order };
}

export function setDashboardCardVisible(layout: DashboardLayout, card: DashboardCardId, visible: boolean): DashboardLayout {
  const hidden = layout.hidden.filter((entry) => entry !== card);
  if (!visible) hidden.push(card);
  return { ...layout, hidden };
}

export function isDefaultDashboardLayout(layout: DashboardLayout): boolean {
  return layout.hidden.length === 0 && layout.order.every((card, index) => card === DEFAULT_DASHBOARD_LAYOUT.order[index]);
}

/**
 * Groups the visible cards for rendering: wide cards on their own, runs of the
 * other cards together so they can share a two-column grid.
 */
export function groupDashboardCards(cards: readonly DashboardCardId[]): Array<{ wide: boolean; cards: DashboardCardId[] }> {
  const groups: Array<{ wide: boolean; cards: DashboardCardId[] }> = [];
  for (const card of cards) {
    const wide = WIDE_DASHBOARD_CARDS.has(card);
    const last = groups[groups.length - 1];
    if (!wide && last && !last.wide) last.cards.push(card);
    else groups.push({ wide, cards: [card] });
  }
  return groups;
}
