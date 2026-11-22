/** Shown next to search buttons. VOID ships for Windows, so it is always Ctrl. */
export const SEARCH_SHORTCUT_LABEL = 'Ctrl K';
export const SEARCH_SHORTCUT_ARIA = 'Control+K';

/** Ctrl+K (or ⌘K), without other modifiers and not while composing text, e.g. with an IME. */
export function isSearchShortcut(event: KeyboardEvent): boolean {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    !event.isComposing &&
    event.key.toLowerCase() === 'k'
  );
}

/** Text fields keep their own keyboard handling, so the shortcut never interrupts typing. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** Another modal (an edit form, a delete confirmation…) is open and owns the keyboard. */
export function isModalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}
