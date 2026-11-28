import path from 'node:path';

import type { CleanupCandidate, CleanupLocation, CleanupLocationScan, ScanError, SkipReason, SkippedItem } from '../../domain/optimizer/models';
import type { TempScanOutput } from '../../domain/optimizer/scanner';
import { stableId } from '../../domain/optimizer/sizes';
import type { ReadOnlyFs } from './readOnlyFs';

/**
 * TempFileScanner: measures clearly defined temporary folders of the current
 * user. It only lists and measures; nothing is opened for writing, deleted or
 * moved.
 *
 * Protections:
 * - Roots are fixed (%LOCALAPPDATA%\Temp and \CrashDumps), not taken from
 *   TEMP or from the page, and must lie inside %LOCALAPPDATA%.
 * - A root that is itself a link/junction is refused.
 * - Symbolic links and junctions inside are never followed (lstat, not stat).
 * - Every path is checked to be inside its root, also after resolving it.
 * - Files changed in the last 24 hours are skipped: they may still be in use.
 * - Access errors are counted, never fatal; a file limit keeps the scan short.
 */

export const MIN_FILE_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_ENTRIES = 200_000;
export const MAX_DEPTH = 16;

export interface TempRoot {
  location: CleanupLocation;
  label: string;
  displayRoot: string;
  path: string;
}

export function defaultTempRoots(env: NodeJS.ProcessEnv): { base: string | null; roots: TempRoot[] } {
  const base = env.LOCALAPPDATA ?? null;
  if (!base) return { base: null, roots: [] };
  return {
    base,
    roots: [
      { location: 'user-temp', label: 'User Temp folder', displayRoot: '%LOCALAPPDATA%\\Temp', path: path.win32.join(base, 'Temp') },
      { location: 'crash-dumps', label: 'Crash dumps', displayRoot: '%LOCALAPPDATA%\\CrashDumps', path: path.win32.join(base, 'CrashDumps') },
    ],
  };
}

const BROWSER_DATA_DIRS: ReadonlyArray<{ browser: string; parts: readonly string[] }> = [
  { browser: 'Chrome', parts: ['Google', 'Chrome', 'User Data'] },
  { browser: 'Edge', parts: ['Microsoft', 'Edge', 'User Data'] },
];
const PROFILE_NAME = /^(Default|Profile \d{1,3}|Guest Profile)$/;

/**
 * Extra folders of the deep scan, all inside %LOCALAPPDATA%: Windows error
 * reports and the web cache of every Chrome/Edge profile. Only the cache
 * folder is included, never bookmarks, passwords or history.
 */
export async function deepTempRoots(fs: ReadOnlyFs, base: string | null): Promise<TempRoot[]> {
  if (!base) return [];
  const roots: TempRoot[] = [
    { location: 'error-reports', label: 'Windows error reports', displayRoot: '%LOCALAPPDATA%\\Microsoft\\Windows\\WER', path: path.win32.join(base, 'Microsoft', 'Windows', 'WER') },
  ];
  for (const { browser, parts } of BROWSER_DATA_DIRS) {
    const dataDir = path.win32.join(base, ...parts);
    let entries;
    try {
      entries = await fs.readdir(dataDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !PROFILE_NAME.test(entry.name)) continue;
      roots.push({
        location: 'browser-cache',
        label: `${browser} cache (${entry.name})`,
        displayRoot: `%LOCALAPPDATA%\\${parts.join('\\')}\\${entry.name}\\Cache`,
        path: path.win32.join(dataDir, entry.name, 'Cache', 'Cache_Data'),
      });
    }
  }
  return roots;
}

type PathApi =Pick<typeof path, 'resolve' | 'relative' | 'join' | 'isAbsolute' | 'sep'>;

/** True when `child` is `root` itself or lies below it. Case-insensitive on Windows. */
export function isInsideRoot(root: string, child: string, api: PathApi = path, caseInsensitive = process.platform === 'win32'): boolean {
  const normalize = (value: string) => (caseInsensitive ? api.resolve(value).toLowerCase() : api.resolve(value));
  const relative = api.relative(normalize(root), normalize(child));
  return relative === '' || (!relative.startsWith('..') && !api.isAbsolute(relative));
}

export interface TempScannerOptions {
  fs: ReadOnlyFs;
  /** All roots must lie inside this folder (normally %LOCALAPPDATA%). */
  allowedBase: string | null;
  roots: readonly TempRoot[];
  now?: () => Date;
  minFileAgeMs?: number;
  maxEntries?: number;
  maxDepth?: number;
  /** Treat paths case-insensitively (Windows). */
  caseInsensitive?: boolean;
}

function errnoCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

async function scanRoot(root: TempRoot, options: Required<Omit<TempScannerOptions, 'roots' | 'allowedBase'>>): Promise<CleanupLocationScan> {
  const { fs, caseInsensitive } = options;
  const nowMs = options.now().getTime();
  const result: CleanupLocationScan = {
    location: root.location,
    label: root.label,
    displayRoot: root.displayRoot,
    candidates: [],
    occupiedBytes: 0,
    fileCount: 0,
    inaccessibleCount: 0,
    skipped: [],
    limitReached: false,
  };
  const skipped = new Map<SkipReason, SkippedItem>();
  const skip = (reason: SkipReason, bytes = 0) => {
    const item = skipped.get(reason) ?? { module: 'temp-files' as const, reason, count: 0, bytes: 0 };
    item.count += 1;
    item.bytes += bytes;
    skipped.set(reason, item);
  };
  const inside = (child: string) => isInsideRoot(root.path, child, path, caseInsensitive);
  const realRoot = await fs.realpath(root.path);

  let visited = 0;
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root.path, depth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    let entries;
    try {
      entries = await fs.readdir(current.dir, { withFileTypes: true });
    } catch {
      result.inaccessibleCount += 1;
      continue;
    }
    for (const entry of entries) {
      visited += 1;
      if (visited > options.maxEntries) {
        result.limitReached = true;
        skip('limit-reached');
        stack.length = 0;
        break;
      }
      const full = path.join(current.dir, entry.name);
      // A file name can never leave the folder, but a manipulated entry must not either.
      if (!inside(full) || entry.name === '.' || entry.name === '..') {
        skip('outside-root');
        continue;
      }
      if (entry.isSymbolicLink()) {
        // On Windows junctions are reported as links too; neither is followed.
        skip('junction-or-link');
        continue;
      }
      let stats;
      try {
        stats = await fs.lstat(full, { bigint: true });
      } catch {
        // Locked, protected or just vanished: counted as inaccessible, never fatal.
        result.inaccessibleCount += 1;
        continue;
      }
      if (stats.isSymbolicLink()) {
        skip('junction-or-link');
        continue;
      }
      if (stats.isDirectory()) {
        if (current.depth + 1 > options.maxDepth) {
          skip('depth-limit');
          continue;
        }
        // Defence in depth: the resolved folder must still be inside the resolved root.
        try {
          const real = await fs.realpath(full);
          if (!isInsideRoot(realRoot, real, path, caseInsensitive)) {
            skip('outside-root');
            continue;
          }
        } catch {
          result.inaccessibleCount += 1;
          continue;
        }
        stack.push({ dir: full, depth: current.depth + 1 });
        continue;
      }
      if (!stats.isFile()) {
        skip('not-a-regular-file');
        continue;
      }
      const size = Number(stats.size);
      result.fileCount += 1;
      result.occupiedBytes += size;
      const modifiedMs = Number(stats.mtimeMs);
      if (nowMs - modifiedMs < options.minFileAgeMs) {
        skip('recently-modified', size);
        continue;
      }
      const normalized = caseInsensitive ? full.toLowerCase() : full;
      const candidate: CleanupCandidate = {
        id: stableId(normalized),
        // Volume + file index identify the data itself, so hard links count once.
        physicalKey: stats.ino !== 0n ? `${stats.dev}:${stats.ino}` : `path:${normalized}`,
        location: root.location,
        relativePath: path.relative(root.path, full),
        sizeBytes: size,
        modifiedAt: new Date(modifiedMs).toISOString(),
      };
      result.candidates.push(candidate);
    }
  }
  result.skipped = [...skipped.values()];
  return result;
}

export function createTempFileScanner(options: TempScannerOptions): () => Promise<TempScanOutput> {
  const settings = {
    fs: options.fs,
    now: options.now ?? (() => new Date()),
    minFileAgeMs: options.minFileAgeMs ?? MIN_FILE_AGE_MS,
    maxEntries: options.maxEntries ?? MAX_ENTRIES,
    maxDepth: options.maxDepth ?? MAX_DEPTH,
    caseInsensitive: options.caseInsensitive ?? process.platform === 'win32',
  };
  return async () => {
    const errors: ScanError[] = [];
    const locations: CleanupLocationScan[] = [];
    if (!options.allowedBase) {
      return { locations, errors: [{ module: 'temp-files', code: 'unsafe-root', message: 'The local application data folder (%LOCALAPPDATA%) is unknown.' }] };
    }
    for (const root of options.roots) {
      if (!path.isAbsolute(root.path) || !isInsideRoot(options.allowedBase, root.path, path, settings.caseInsensitive) || path.resolve(root.path) === path.resolve(options.allowedBase)) {
        errors.push({ module: 'temp-files', code: 'unsafe-root', message: `${root.label}: folder lies outside the allowed area and is not scanned.` });
        continue;
      }
      try {
        const stats = await settings.fs.lstat(root.path, { bigint: true });
        if (stats.isSymbolicLink() || !stats.isDirectory()) {
          errors.push({ module: 'temp-files', code: 'unsafe-root', message: `${root.label}: folder is a link or not a folder and is not scanned.` });
          continue;
        }
        const real = await settings.fs.realpath(root.path);
        if (!isInsideRoot(options.allowedBase, real, path, settings.caseInsensitive)) {
          errors.push({ module: 'temp-files', code: 'unsafe-root', message: `${root.label}: folder points outside the allowed area and is not scanned.` });
          continue;
        }
      } catch (error) {
        // A missing folder (e.g. no crash dumps ever) is not an error.
        if (errnoCode(error) !== 'ENOENT') errors.push({ module: 'temp-files', code: 'access-denied', message: `${root.label}: folder not readable.` });
        continue;
      }
      try {
        locations.push(await scanRoot(root, settings));
      } catch {
        errors.push({ module: 'temp-files', code: 'access-denied', message: `${root.label}: folder could not be read completely.` });
      }
    }
    return { locations, errors };
  };
}
