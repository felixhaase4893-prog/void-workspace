/**
 * Startup milestones for `npm run measure:startup`. `performance.mark` is cheap and
 * invisible; the desktop shell only reads these marks when measuring is switched on.
 */
export type StartupMark = 'void:script-start' | 'void:first-render' | 'void:interactive' | 'void:dashboard-ready';

export function markStartup(name: StartupMark): void {
  try {
    if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
    if (performance.getEntriesByName(name).length === 0) performance.mark(name);
  } catch {
    // Measuring must never break the app.
  }
}
