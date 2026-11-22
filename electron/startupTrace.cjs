// Opt-in startup measurement for `npm run measure:startup`. Does nothing unless the
// VOID_STARTUP_TRACE environment variable points to a file; normal launches never touch it.
const fs = require('node:fs');

const TRACE_FILE = process.env.VOID_STARTUP_TRACE || null;
const enabled = TRACE_FILE !== null;

/** Wall-clock milliseconds, comparable with the launcher's `Date.now()` before it spawned VOID. */
const seenMarks = new Set();

function mark(name, at = Date.now()) {
  if (!enabled) return;
  seenMarks.add(name);
  // A finished launch needs both a visible window and a rendered dashboard (they can arrive in either order).
  if (name !== 'done' && !seenMarks.has('done') && seenMarks.has('window-shown') && seenMarks.has('renderer-dashboard-ready')) {
    queueMicrotask(finish);
  }
  try {
    fs.appendFileSync(TRACE_FILE, `${name} ${Math.round(at)}\n`);
  } catch {
    // Measuring must never break the app.
  }
}

function finish() {
  if (seenMarks.has('done')) return;
  mark('done');
  // Lets the measuring script start the next launch; a normal quit also lets the portable EXE clean up.
  if (process.env.VOID_TRACE_EXIT) setTimeout(() => require('electron').app.quit(), 300);
}

/** Renderer milestones are recorded with performance.mark(); this collects them by polling. */
const RENDERER_MARKS = ['void:script-start', 'void:first-render', 'void:interactive', 'void:dashboard-ready'];

function watchRenderer(webContents) {
  if (!enabled) return;
  const seen = new Set();
  const script = `(() => {
    const origin = performance.timeOrigin;
    const out = {};
    for (const name of ${JSON.stringify(RENDERER_MARKS)}) {
      const entry = performance.getEntriesByName(name)[0];
      if (entry) out[name] = origin + entry.startTime;
    }
    const nav = performance.getEntriesByType('navigation')[0];
    if (nav && nav.domContentLoadedEventEnd > 0) out['dom-content-loaded'] = origin + nav.domContentLoadedEventEnd;
    return out;
  })()`;
  const timer = setInterval(() => {
    if (webContents.isDestroyed()) return clearInterval(timer);
    webContents
      .executeJavaScript(script, true)
      .then((marks) => {
        for (const [name, at] of Object.entries(marks)) {
          if (seen.has(name)) continue;
          seen.add(name);
          mark(name.replace('void:', 'renderer-'), at);
        }
        if (seen.has('void:dashboard-ready')) clearInterval(timer);
      })
      .catch(() => {});
  }, 20);
}

/**
 * Measurement runs use their own profile folder (VOID_USER_DATA_DIR), so they never
 * read or write the user's real workspace. VOID_TRACE_SEED optionally fills that
 * throwaway profile with a sample workspace once, before the timed runs.
 */
function applyProfile(app) {
  if (enabled && process.env.VOID_USER_DATA_DIR) app.setPath('userData', process.env.VOID_USER_DATA_DIR);
}

function seedIfRequested(webContents) {
  const seedFile = process.env.VOID_TRACE_SEED;
  if (!enabled || !seedFile || !process.env.VOID_USER_DATA_DIR) return;
  webContents.once('did-finish-load', () => {
    const json = fs.readFileSync(seedFile, 'utf8');
    void webContents
      .executeJavaScript(`localStorage.setItem('void:workspace', ${JSON.stringify(json)}); true`, true)
      .then(() => {
        mark('seeded');
        setTimeout(() => require('electron').app.quit(), 300);
      });
  });
}

module.exports = { enabled, mark, watchRenderer, applyProfile, seedIfRequested };
