import os from 'node:os';
import { z } from 'zod';

import type { DriveInfo, ScanError, ScanMode, SystemInfo } from '../../domain/optimizer/models';
import type { SystemScanOutput } from '../../domain/optimizer/scanner';
import { ScanFailure } from '../../domain/optimizer/scanner';
import { parseCommandJson, type CommandRunner } from './commandRunner';

/** SystemScanner: CPU, RAM, Windows version, drives, free space and the active power plan. Reads only. */

const rawSystemSchema = z.object({
  drives: z.array(
    z.object({
      id: z.string(),
      label: z.string().nullable().optional(),
      fileSystem: z.string().nullable().optional(),
      totalBytes: z.number().nullable().optional(),
      freeBytes: z.number().nullable().optional(),
    }),
  ),
  powerPlan: z.object({ instanceId: z.string(), name: z.string() }).nullable().optional(),
  caption: z.string().nullable().optional(),
  build: z.string().nullable().optional(),
  network: z.object({ receivedBytesPerSec: z.number(), sentBytesPerSec: z.number() }).nullable().optional(),
});

export interface OsInfo {
  cpus: () => Array<{ model: string }>;
  totalmem: () => number;
  freemem: () => number;
  release: () => string;
  version: () => string;
  uptime: () => number;
}

export function parseSystemOutput(stdout: string): { drives: DriveInfo[]; powerPlan: SystemInfo['powerPlan']; caption: string | null; build: string | null; network: SystemInfo['network'] } {
  const parsed = rawSystemSchema.safeParse(parseCommandJson(stdout));
  if (!parsed.success) throw new ScanFailure('invalid-output', 'Die Systeminformationen hatten ein unerwartetes Format.');
  const drives: DriveInfo[] = parsed.data.drives
    .filter((drive) => /^[A-Z]:$/i.test(drive.id))
    .map((drive) => ({
      id: drive.id.toUpperCase(),
      label: drive.label ?? '',
      fileSystem: drive.fileSystem ?? '',
      totalBytes: Math.max(0, Math.round(drive.totalBytes ?? 0)),
      freeBytes: Math.max(0, Math.round(drive.freeBytes ?? 0)),
    }));
  const guid = /\{([0-9a-f-]{36})\}/i.exec(parsed.data.powerPlan?.instanceId ?? '')?.[1]?.toLowerCase();
  return {
    drives,
    powerPlan: guid && parsed.data.powerPlan ? { guid, name: parsed.data.powerPlan.name } : null,
    caption: parsed.data.caption?.trim() || null,
    build: parsed.data.build?.trim() || null,
    network: parsed.data.network
      ? { receivedBytesPerSec: Math.max(0, Math.round(parsed.data.network.receivedBytesPerSec)), sentBytesPerSec: Math.max(0, Math.round(parsed.data.network.sentBytesPerSec)) }
      : null,
  };
}

export function createSystemScanner(run: CommandRunner, osInfo: OsInfo = os): (mode?: ScanMode) => Promise<SystemScanOutput> {
  return async (mode = 'quick') => {
    const errors: ScanError[] = [];
    const cpus = osInfo.cpus();
    const total = osInfo.totalmem();
    const free = osInfo.freemem();
    const info: SystemInfo = {
      cpuModel: cpus[0]?.model.trim() || 'Unknown',
      cpuCores: cpus.length,
      totalMemoryBytes: total,
      usedMemoryBytes: Math.max(0, total - free),
      freeMemoryBytes: free,
      windowsVersion: osInfo.version(),
      windowsBuild: osInfo.release(),
      drives: [],
      powerPlan: null,
      uptimeSeconds: Math.max(0, Math.round(osInfo.uptime())),
    };
    try {
      const details = parseSystemOutput(await run(mode === 'deep' ? 'system-deep' : 'system'));
      if (mode === 'deep') info.network = details.network;
      info.drives = details.drives;
      info.powerPlan = details.powerPlan;
      if (details.caption) info.windowsVersion = details.caption.replace(/^Microsoft\s+/i, '');
      if (details.build) info.windowsBuild = details.build;
    } catch (error) {
      errors.push({ module: 'system', code: error instanceof ScanFailure ? error.code : 'unknown', message: 'Drives and power plan could not be read.' });
    }
    return { info, errors };
  };
}
