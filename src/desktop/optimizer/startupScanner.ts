import path from 'node:path';
import { z } from 'zod';

import type { ScanError, StartupEntry, StartupSource } from '../../domain/optimizer/models';
import type { StartupScanOutput } from '../../domain/optimizer/scanner';
import { ScanFailure } from '../../domain/optimizer/scanner';
import { parseCommandJson, type CommandRunner } from './commandRunner';
import type { ReadOnlyFs } from './readOnlyFs';

/**
 * StartupScanner: lists autostart entries from the Run keys of the registry
 * and the two Startup folders. It only reads; nothing is changed.
 */

const registryOutputSchema = z.object({
  entries: z.array(
    z.object({
      source: z.enum(['hkcu-run', 'hklm-run', 'hklm-run-wow64']),
      name: z.string(),
      command: z.string().nullable().optional(),
      approvedState: z.number().int().nullable().optional(),
    }),
  ),
  folderApproved: z.array(z.object({ scope: z.enum(['user', 'common']), name: z.string(), approvedState: z.number().int().nullable().optional() })),
});

type ApprovedState = number | null | undefined;

/** StartupApproved: an odd first byte (0x03, 0x07 …) means "disabled in Task Manager"; no value means enabled. */
export function approvedToStatus(state: ApprovedState): StartupEntry['status'] {
  if (state === null || state === undefined) return 'enabled';
  return (state & 1) === 1 ? 'disabled' : 'enabled';
}

/** The executable from a Run command line, when it can be read without running anything. */
export function extractExecutablePath(command: string): string | null {
  const text = command.trim();
  if (text === '') return null;
  const quoted = /^"([^"]+)"/.exec(text);
  if (quoted?.[1]) return quoted[1];
  const exe = /^(.+?\.(?:exe|bat|cmd|com|lnk))(?:\s|$)/i.exec(text);
  if (exe?.[1]) return exe[1];
  return text.split(/\s+/)[0] ?? null;
}

function describe(name: string, executable: string | null): string {
  const file = executable ? path.win32.basename(executable) : null;
  return file ? `Starts ${file} when you sign in.` : `Starts "${name}" when you sign in.`;
}

export function entryId(source: StartupSource, name: string): string {
  return `${source}|${name.toLowerCase()}`;
}

export interface StartupFolders {
  user: string | null;
  common: string | null;
}

export function startupFoldersFromEnv(env: NodeJS.ProcessEnv): StartupFolders {
  const appData = env.APPDATA;
  const programData = env.ProgramData ?? env.PROGRAMDATA;
  return {
    user: appData ? path.win32.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup') : null,
    common: programData ? path.win32.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StartUp') : null,
  };
}

async function readFolder(fs: ReadOnlyFs, folder: string | null, scope: 'user' | 'common', approved: Map<string, ApprovedState>): Promise<StartupEntry[]> {
  if (!folder) return [];
  let names: string[];
  try {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    // Only plain files directly in the folder; links and subfolders are not followed.
    names = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase() !== 'desktop.ini').map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const source: StartupSource = scope === 'user' ? 'startup-folder-user' : 'startup-folder-common';
  return names.map((fileName) => {
    const name = fileName.replace(/\.[^.]+$/, '') || fileName;
    const filePath = path.win32.join(folder, fileName);
    return {
      id: entryId(source, fileName),
      name,
      source,
      path: filePath,
      status: approvedToStatus(approved.get(`${scope}|${fileName.toLowerCase()}`)),
      description: `Shortcut in the Startup folder (${fileName}).`,
    };
  });
}

export interface StartupScannerOptions {
  run: CommandRunner;
  fs: ReadOnlyFs;
  folders: StartupFolders;
}

export function createStartupScanner({ run, fs, folders }: StartupScannerOptions): () => Promise<StartupScanOutput> {
  return async () => {
    const errors: ScanError[] = [];
    let registry: z.infer<typeof registryOutputSchema> = { entries: [], folderApproved: [] };
    try {
      const parsed = registryOutputSchema.safeParse(parseCommandJson(await run('startup')));
      if (!parsed.success) throw new ScanFailure('invalid-output', 'The startup entries in the registry had an unexpected format.');
      registry = parsed.data;
    } catch (error) {
      errors.push({ module: 'startup', code: error instanceof ScanFailure ? error.code : 'unknown', message: error instanceof Error ? error.message : 'Registry not readable.' });
    }

    const entries: StartupEntry[] = registry.entries
      .filter((entry) => entry.name.trim() !== '')
      .map((entry) => {
        const executable = extractExecutablePath(entry.command ?? '');
        return { id: entryId(entry.source, entry.name), name: entry.name, source: entry.source, path: executable, status: approvedToStatus(entry.approvedState), description: describe(entry.name, executable) };
      });

    const approved = new Map(registry.folderApproved.map((entry) => [`${entry.scope}|${entry.name.toLowerCase()}`, entry.approvedState]));
    for (const [scope, folder] of [['user', folders.user], ['common', folders.common]] as const) {
      try {
        entries.push(...(await readFolder(fs, folder, scope, approved)));
      } catch {
        errors.push({ module: 'startup', code: 'access-denied', message: `The Startup folder (${scope === 'user' ? 'current user' : 'all users'}) could not be read.` });
      }
    }

    if (entries.length === 0 && errors.length >= 3) throw new ScanFailure('command-failed', 'Keine Autostart-Quelle war lesbar.');
    // Same id twice (e.g. a value present in two hives with the same name in one source) cannot happen per source; keep the first anyway.
    const unique = new Map(entries.map((entry) => [entry.id, entry]));
    return { entries: [...unique.values()], errors };
  };
}
