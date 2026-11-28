import { Bug, ChartColumn, Code2, FlaskConical, FolderKanban, Gauge, LayoutDashboard, ListChecks, Settings, StickyNote, type LucideIcon } from 'lucide-react';

import type { EntityType } from '../domain/models';

export interface NavigationItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Ctrl + this digit opens the page. 1-5 are the main areas, 6 Bugs, 7 Settings, 8 Code Tester, 9 Statistics. Pages without one (PC Optimizer) only open from the sidebar. */
  shortcut?: number;
}

export const NAVIGATION: NavigationItem[] = [
  { to: '/', label: 'Dashboard', shortcut: 1, icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', shortcut: 2, icon: FolderKanban },
  { to: '/tasks', label: 'Tasks', shortcut: 3, icon: ListChecks },
  { to: '/bugs', label: 'Bugs', shortcut: 6, icon: Bug },
  { to: '/notes', label: 'Notes', shortcut: 4, icon: StickyNote },
  { to: '/snippets', label: 'Snippet Vault', shortcut: 5, icon: Code2 },
  { to: '/code-tester', label: 'Code Tester', shortcut: 8, icon: FlaskConical },
  { to: '/statistics', label: 'Statistics', shortcut: 9, icon: ChartColumn },
  { to: '/optimizer', label: 'PC Optimizer', icon: Gauge },
  { to: '/settings', label: 'Settings', shortcut: 7, icon: Settings },
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
