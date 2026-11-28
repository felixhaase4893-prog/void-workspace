import { z } from 'zod';

import type { ProcessInfo, ScanMode } from '../../domain/optimizer/models';
import { ScanFailure } from '../../domain/optimizer/scanner';
import { parseCommandJson, type CommandRunner } from './commandRunner';

/** ProcessScanner: reads name, PID, CPU load, RAM and state of every process. Never ends one. */

const rawProcessSchema = z.object({
  name: z.string().min(1),
  pid: z.number().int().nonnegative(),
  memoryBytes: z.number().nullable().optional(),
  cpuPercent: z.number().nullable().optional(),
  responding: z.boolean().nullable().optional(),
  sessionId: z.number().int().nullable().optional(),
  gpuPercent: z.number().nullable().optional(),
  ioBytesPerSec: z.number().nullable().optional(),
  connections: z.number().int().nullable().optional(),
});

function finite(value: number | null | undefined, max = Number.POSITIVE_INFINITY): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : null;
}

function rounded(value: number | null | undefined): number | null {
  const clean = finite(value);
  return clean === null ? null : Math.round(clean);
}

export function parseProcesses(stdout: string): ProcessInfo[] {
  const parsed = z.array(z.unknown()).safeParse(parseCommandJson(stdout));
  if (!parsed.success) throw new ScanFailure('invalid-output', 'The process list had an unexpected format.');
  const processes: ProcessInfo[] = [];
  for (const row of parsed.data) {
    const entry = rawProcessSchema.safeParse(row);
    if (!entry.success) continue;
    const { name, pid, memoryBytes, cpuPercent, responding, sessionId, gpuPercent, ioBytesPerSec, connections } = entry.data;
    // The deep query adds GPU, I/O and connections; the quick one leaves them out.
    const deep = gpuPercent !== undefined || ioBytesPerSec !== undefined || connections !== undefined ? { gpuPercent: finite(gpuPercent, 100), ioBytesPerSec: rounded(ioBytesPerSec), connections: rounded(connections) } : {};
    processes.push({
      ...deep,
      name,
      pid,
      memoryBytes: Math.max(0, Math.round(memoryBytes ?? 0)),
      cpuPercent: typeof cpuPercent === 'number' && Number.isFinite(cpuPercent) ? Math.min(100, Math.max(0, cpuPercent)) : null,
      sessionId: Math.max(0, sessionId ?? 0),
      status: responding === false ? 'not-responding' : responding === true ? 'running' : 'unknown',
    });
  }
  return processes;
}

export function createProcessScanner(run: CommandRunner): (mode?: ScanMode) => Promise<ProcessInfo[]> {
  return async (mode = 'quick') => parseProcesses(await run(mode === 'deep' ? 'processes-deep' : 'processes'));
}
