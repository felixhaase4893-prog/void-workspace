import { DEV_TOOLS_SHORTCUT_LABEL } from '../features/devtools/devToolsContext';
import { SEARCH_SHORTCUT_LABEL } from '../features/search/shortcut';
import { t } from '../i18n/translate';

/**
 * Keyboard shortcuts that are not owned by a single dialog. VOID ships for
 * Windows, so labels always say Ctrl (⌘ also works on a Mac for development).
 *
 * Taken already and left alone: Ctrl+K (search), Ctrl+Shift+D (developer
 * tools), plus Escape, Enter and the arrow keys inside dialogs.
 */

export const QUICK_ADD_SHORTCUT_LABEL = 'Ctrl N';
export const QUICK_ADD_SHORTCUT_ARIA = 'Control+N';

function plainCtrl(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && !event.isComposing;
}

/** Ctrl+N: the Quick Add palette ("new …"). */
export function isQuickAddShortcut(event: KeyboardEvent): boolean {
  return plainCtrl(event) && event.key.toLowerCase() === 'n';
}

/**
 * Ctrl+1 … Ctrl+9 (top row or number pad): which digit was pressed, or null.
 * Uses the physical key, so it works the same on every keyboard layout.
 */
export function navigationDigit(event: KeyboardEvent): number | null {
  if (!plainCtrl(event)) return null;
  const match = /^(?:Digit|Numpad)([1-9])$/.exec(event.code) ?? /^([1-9])$/.exec(event.key);
  return match ? Number(match[1]) : null;
}

export interface ShortcutHelp {
  keys: string;
  description: string;
}

/** Shown in Settings, so every shortcut can be looked up in one place. */
export function describeGlobalShortcuts(navigation: ReadonlyArray<{ label: string; shortcut?: number | undefined }>): ShortcutHelp[] {
  return [
    { keys: SEARCH_SHORTCUT_LABEL, description: t('Search everything') },
    { keys: QUICK_ADD_SHORTCUT_LABEL, description: t('Quick add: create a task, project, note, snippet or bug') },
    ...navigation
      .filter((item): item is { label: string; shortcut: number } => item.shortcut !== undefined)
      .sort((a, b) => a.shortcut - b.shortcut)
      .map((item) => ({ keys: `Ctrl ${item.shortcut}`, description: t('Go to {label}', { label: item.label }) })),
    { keys: 'Esc', description: t('Close a dialog, or leave selection mode in a list') },
    { keys: DEV_TOOLS_SHORTCUT_LABEL, description: t('Developer tools') },
  ];
}
