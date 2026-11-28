import { Bug, ChartColumn, Code2, FlaskConical, FolderKanban, Gauge, LayoutDashboard, ListChecks, Settings, StickyNote, type LucideIcon } from 'lucide-react';

import type { EntityType } from '../domain/models';
import { t, type MessageKey } from '../i18n/translate';

export interface NavigationItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Ctrl + this digit opens the page. 1-5 are the main areas, 6 Bugs, 7 Settings, 8 Code Tester, 9 Statistics. Pages without one (PC Optimizer) only open from the sidebar. */
  shortcut?: number;
}

/** The label is read on every render, so it follows the active language. */
function item(to: string, labelKey: MessageKey, icon: LucideIcon, shortcut?: number): NavigationItem {
  return {
    to,
    icon,
    ...(shortcut === undefined ? {} : { shortcut }),
    get label() {
      return t(labelKey);
    },
  };
}

export const NAVIGATION: NavigationItem[] = [
  item('/', 'Dashboard', LayoutDashboard, 1),
  item('/projects', 'Projects', FolderKanban, 2),
  item('/tasks', 'Tasks', ListChecks, 3),
  item('/bugs', 'Bugs', Bug, 6),
  item('/notes', 'Notes', StickyNote, 4),
  item('/snippets', 'Snippet Vault', Code2, 5),
  item('/code-tester', 'Code Tester', FlaskConical, 8),
  item('/statistics', 'Statistics', ChartColumn, 9),
  item('/optimizer', 'PC Optimizer', Gauge),
  item('/settings', 'Settings', Settings, 7),
];

export const ENTITY_ROUTES: Record<EntityType, string> = {
  project: '/projects',
  task: '/tasks',
  note: '/notes',
  snippet: '/snippets',
  bug: '/bugs',
};

export const ENTITY_ICONS: Record<EntityType, LucideIcon> = {
  project: FolderKanban,
  task: ListChecks,
  note: StickyNote,
  snippet: Code2,
  bug: Bug,
};

/** Where an item is shown. Projects have their own detail page. */
export function entityPath(type: EntityType, id: string): string {
  return type === 'project' ? `/projects/${id}` : ENTITY_ROUTES[type];
}
