import type { CleanupLocationScan, ProcessInfo, ScanError, ScanMode, ScanModule, ScanSnapshot, SkippedItem, StartupEntry, SystemInfo } from './models';

/**
 * The scanner contract. Each module works on its own and only reads; if one
 * fails, the others still deliver and the failure becomes a ScanError.
 * The real Windows scanners live in src/desktop/optimizer (main process only);
 * tests and the browser demo use simulated ones.
 */

export interface StartupScanOutput {
  entries: StartupEntry[];
  errors?: ScanError[];
}

export interface TempScanOutput {
  locations: CleanupLocationScan[];
  errors?: ScanError[];
}

export interface SystemScanOutput {
  info: SystemInfo;
  /** Parts that could not be read (e.g. drives); the rest of the info is still valid. */
  errors?: ScanError[];
}

/** Every scanner gets the scan mode; the deep scan may look further (more folders, longer CPU sample). */
export interface ModuleScanners {
  system: (mode: ScanMode) => Promise<SystemScanOutput>;
  processes: (mode: ScanMode) => Promise<ProcessInfo[]>;
  startup: (mode: ScanMode) => Promise<StartupScanOutput>;
  tempFiles: (mode: ScanMode) => Promise<TempScanOutput>;
}

export interface ScannerSuite {
  scan(modules: readonly ScanModule[], mode?: ScanMode): Promise<ScanSnapshot>;
}

/** An error a scanner throws on purpose, with a code the page can show. */
export class ScanFailure extends Error {
  constructor(
    readonly code: ScanError['code'],
    message: string,
  ) {
    super(message);
    this.name = 'ScanFailure';
  }
}

function toScanError(module: ScanModule, reason: unknown): ScanError {
  if (reason instanceof ScanFailure) return { module, code: reason.code, message: reason.message };
  return { module, code: 'unknown', message: reason instanceof Error ? reason.message.slice(0, 300) : 'Unknown error' };
}

export const ALL_SCAN_MODULES: readonly ScanModule[] = ['system', 'processes', 'startup', 'temp-files'];

export function createScannerSuite(scanners: ModuleScanners): ScannerSuite {
  return {
    async scan(modules, mode = 'quick') {
      const wanted = new Set(modules);
      const snapshot: ScanSnapshot = { system: null, processes: [], startupEntries: [], cleanup: [], errors: [], skipped: [], modules: ALL_SCAN_MODULES.filter((module) => wanted.has(module)) };
      const jobs: Array<Promise<void>> = [];
      const run = (module: ScanModule, job: () => Promise<void>) => {
        if (!wanted.has(module)) return;
        jobs.push(
          (async () => {
            try {
              await job();
            } catch (reason) {
              snapshot.errors.push(toScanError(module, reason));
            }
          })(),
        );
      };
      run('system', async () => {
        const output = await scanners.system(mode);
        snapshot.system = output.info;
        snapshot.errors.push(...(output.errors ?? []));
      });
      run('processes', async () => {
        snapshot.processes = await scanners.processes(mode);
      });
      run('startup', async () => {
        const output = await scanners.startup(mode);
        snapshot.startupEntries = output.entries;
        snapshot.errors.push(...(output.errors ?? []));
      });
      run('temp-files', async () => {
        const output = await scanners.tempFiles(mode);
        snapshot.cleanup = output.locations;
        snapshot.errors.push(...(output.errors ?? []));
        snapshot.skipped.push(...output.locations.flatMap((location): SkippedItem[] => location.skipped));
      });
      await Promise.all(jobs);
      return snapshot;
    },
  };
}
