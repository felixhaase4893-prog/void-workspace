import { describe, expect, it } from 'vitest';

import {
  DASHBOARD_CARDS,
  DEFAULT_DASHBOARD_LAYOUT,
  groupDashboardCards,
  isDefaultDashboardLayout,
  moveDashboardCard,
  normalizeDashboardLayout,
  setDashboardCardVisible,
  visibleDashboardCards,
} from './dashboardLayout';

describe('dashboard layout', () => {
  it('shows every card in the default order by default', () => {
    expect(visibleDashboardCards(DEFAULT_DASHBOARD_LAYOUT)).toEqual([...DASHBOARD_CARDS]);
    expect(isDefaultDashboardLayout(DEFAULT_DASHBOARD_LAYOUT)).toBe(true);
  });

  it('repairs stored layouts: unknown cards and duplicates go, missing cards are appended', () => {
    expect(normalizeDashboardLayout({ order: ['projects', 'weather', 'projects', 'stats'], hidden: ['recent', 'recent', 42] })).toEqual({
      order: ['projects', 'stats', 'statistics', 'quickActions', 'dueSoon', 'recent'],
      hidden: ['recent'],
    });
    expect(normalizeDashboardLayout('nonsense')).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    expect(normalizeDashboardLayout(null)).toEqual(DEFAULT_DASHBOARD_LAYOUT);
    expect(normalizeDashboardLayout({})).toEqual(DEFAULT_DASHBOARD_LAYOUT);
  });

  it('moves cards up and down and ignores moves past the edges', () => {
    const moved = moveDashboardCard(DEFAULT_DASHBOARD_LAYOUT, 'projects', -1);
    expect(moved.order).toEqual(['stats', 'statistics', 'quickActions', 'dueSoon', 'projects', 'recent']);
    expect(moveDashboardCard(moved, 'stats', -1)).toBe(moved);
    expect(moveDashboardCard(moved, 'recent', 1)).toBe(moved);
    expect(moveDashboardCard(moved, 'stats', 1).order.slice(0, 2)).toEqual(['statistics', 'stats']);
    expect(isDefaultDashboardLayout(moved)).toBe(false);
  });

  it('hides and shows cards without losing their position', () => {
    const hidden = setDashboardCardVisible(DEFAULT_DASHBOARD_LAYOUT, 'dueSoon', false);
    expect(visibleDashboardCards(hidden)).toEqual(['stats', 'statistics', 'quickActions', 'recent', 'projects']);
    expect(setDashboardCardVisible(hidden, 'dueSoon', false).hidden).toEqual(['dueSoon']);
    expect(setDashboardCardVisible(hidden, 'dueSoon', true)).toEqual(DEFAULT_DASHBOARD_LAYOUT);
  });

  it('adds the statistics card (new in 4.2) to layouts saved by older versions, visible', () => {
    const stored = { order: ['projects', 'stats', 'quickActions', 'dueSoon', 'recent'], hidden: ['recent'] };
    const layout = normalizeDashboardLayout(stored);
    expect(layout.order.at(-1)).toBe('statistics');
    expect(visibleDashboardCards(layout)).toContain('statistics');
  });

  it('groups neighbouring panels so they can share a row', () => {
    expect(groupDashboardCards(['stats', 'dueSoon', 'recent', 'quickActions', 'projects'])).toEqual([
      { wide: true, cards: ['stats'] },
      { wide: false, cards: ['dueSoon', 'recent'] },
      { wide: true, cards: ['quickActions'] },
      { wide: false, cards: ['projects'] },
    ]);
    expect(groupDashboardCards([])).toEqual([]);
  });
});
