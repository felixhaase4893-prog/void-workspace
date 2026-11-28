import path from 'node:path';

import { OPEN_TARGET_CHANNEL, OPTIMIZER_CHANNELS, type OptimizerMethod } from '../../domain/optimizer/channels';
import { openTargetIdSchema, type OptimizerResponse } from '../../domain/optimizer/models';
import { createScannerSuite, ScanFailure, type ModuleScanners } from '../../domain/optimizer/scanner';
import { OptimizerService, type OptimizerApi } from '../../domain/optimizer/service';
import { createPowerShellRunner } from './commandRunner';
import { createProcessScanner } from './processScanner';
import { readOnlyFs } from './readOnlyFs';
import { createStartupScanner, startupFoldersFromEnv } from './startupScanner';
import { createSystemScanner } from './systemScanner';
import { createTempFileScanner, deepTempRoots, defaultTempRoots } from './tempFileScanner';

/**
 * Entry point of the optimizer backend in the Electron main process.
 * Bundled by vite.desktop.config.ts into electron/generated/optimizerBackend.cjs
 * and loaded by main.cjs on first use. Phase A–C: scan, preview and dry run only.
 */

export interface BackendOptions {
  /** Names of this app's own processes; they are never suggested. */
  ownProcessNames: readonly string[];
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

export function createWindowsScanners(env: NodeJS.ProcessEnv): ModuleScanners {
  const run = createPowerShellRunner({ env });
  const temp = defaultTempRoots(env);
  const quickTemp = createTempFileScanner({ fs: readOnlyFs, allowedBase: temp.base, roots: temp.roots });
  const startup = createStartupScanner({ run, fs: readOnlyFs, folders: startupFoldersFromEnv(env) });
  return {
    system: createSystemScanner(run),
    processes: createProcessScanner(run),
    startup: () => startup(),
    tempFiles: async (mode) => {
      if (mode !== 'deep') return quickTemp();
      const extra = await deepTempRoots(readOnlyFs, temp.base);
      return createTempFileScanner({ fs: readOnlyFs, allowedBase: temp.base, roots: [...temp.roots, ...extra] })();
    },
  };
}

export type ResolvedTarget = { kind: 'path'; value: string } | { kind: 'uri'; value: string };

const SETTINGS_URIS: Readonly<Record<string, string>> = {
  'settings:startup-apps': 'ms-settings:startupapps',
  'settings:storage': 'ms-settings:storagesense',
  'settings:power': 'ms-settings:powersleep',
  'settings:apps': 'ms-settings:appsfeatures',
};

/**
 * Maps a one-click target id to a folder, program or Windows settings page.
 * Only the fixed ids of openTargetIdSchema are accepted; anything else is null.
 * Opening a place only shows it – it never changes the system.
 */
export function resolveOpenTarget(id: unknown, env: NodeJS.ProcessEnv): ResolvedTarget | null {
  const parsed = openTargetIdSchema.safeParse(id);
  if (!parsed.success) return null;
  const target = parsed.data;
  const settings = SETTINGS_URIS[target];
  if (settings) return { kind: 'uri', value: settings };
  const drive = /^drive:([A-Z]):$/.exec(target);
  if (drive) return { kind: 'path', value: `${drive[1]}:\\` };
  const local = env.LOCALAPPDATA;
  const folders = startupFoldersFromEnv(env);
  const paths: Record<string, string | null> = {
    'folder:user-temp': local ? path.win32.join(local, 'Temp') : null,
    'folder:crash-dumps': local ? path.win32.join(local, 'CrashDumps') : null,
    'folder:error-reports': local ? path.win32.join(local, 'Microsoft', 'Windows', 'WER') : null,
    'folder:startup-user': folders.user,
    'folder:startup-common': folders.common,
    'app:task-manager': path.win32.join(env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows', 'System32', 'Taskmgr.exe'),
  };
  const value = paths[target];
  return value ? { kind: 'path', value } : null;
}

function unsupportedScanners(): ModuleScanners {
  const fail = async (): Promise<never> => {
    throw new ScanFailure('unsupported-platform', 'The PC Optimizer only supports Windows.');
  };
  return { system: fail, processes: fail, startup: fail, tempFiles: fail };
}

export function createOptimizerBackend(options: BackendOptions): OptimizerApi {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const scanners = platform === 'win32' ? createWindowsScanners(env) : unsupportedScanners();
  return new OptimizerService({ scanners: createScannerSuite(scanners), context: { ownProcessNames: options.ownProcessNames } });
}

const METHODS = Object.keys(OPTIMIZER_CHANNELS) as OptimizerMethod[];

/**
 * Calls one API function by name with the arguments from IPC. Unknown names
 * are refused; the arguments are checked again inside the service.
 */
export async function invokeOptimizer(api: OptimizerApi, method: unknown, args: readonly unknown[]): Promise<OptimizerResponse<unknown>> {
  if (typeof method !== 'string' || !(METHODS as string[]).includes(method)) return { ok: false, error: { code: 'invalid-input', message: 'Unknown function.' } };
  try {
    switch (method as OptimizerMethod) {
      case 'startScan':
        return await api.startScan(args[0]);
      case 'createPreview':
        return await api.createPreview(args[0]);
      case 'updateSelection':
        return await api.updateSelection(args[0], args[1]);
      case 'validatePreview':
        return await api.validatePreview(args[0]);
      case 'confirmPreview':
        return await api.confirmPreview(args[0]);
      case 'executeDryRun':
        return await api.executeDryRun(args[0]);
      case 'getHistory':
        return await api.getHistory();
    }
  } catch {
    return { ok: false, error: { code: 'internal', message: 'Internal error in the optimizer.' } };
  }
  return { ok: false, error: { code: 'invalid-input', message: 'Unknown function.' } };
}

export { OPEN_TARGET_CHANNEL, OPTIMIZER_CHANNELS };
