import type { OptimizationRecommendation, ResourceKind, ResourceSummary, ResourceUser, ScanSnapshot } from './models';
import { groupProcesses, processRecommendationId } from './recommendations';
import type { ProcessContext } from './safety';

/**
 * Deep scan: which programs pull the most performance – per resource (CPU,
 * GPU, RAM, network) and overall. Processes of one program are added up.
 */

export const TOP_PER_RESOURCE = 5;
export const TOP_OVERALL = 6;
/** I/O rate that counts as "full" load in the combined score (disk + network together). */
export const IO_FULL_SCALE_BYTES = 20 * 1024 * 1024;

const IGNORED = new Set(['idle', 'system idle process', '_total']);

function sumNullable(values: ReadonlyArray<number | null | undefined>): number | null {
  const measured = values.filter((value): value is number => typeof value === 'number');
  return measured.length === 0 ? null : Math.round(measured.reduce((total, value) => total + value, 0) * 10) / 10;
}

/** Each resource as a 0–100 share, so they can be compared and added up. */
function shares(user: Omit<ResourceUser, 'score' | 'main' | 'recommendationId'>, totalMemory: number): Record<ResourceKind, number> {
  return {
    cpu: Math.min(100, user.cpuPercent ?? 0),
    gpu: Math.min(100, user.gpuPercent ?? 0),
    memory: totalMemory > 0 ? Math.min(100, (user.memoryBytes / totalMemory) * 100) : 0,
    network: Math.min(100, ((user.ioBytesPerSec ?? 0) / IO_FULL_SCALE_BYTES) * 100),
  };
}

export function buildResourceSummary(snapshot: ScanSnapshot, recommendations: readonly OptimizationRecommendation[], context: ProcessContext): ResourceSummary {
  const known = new Set(recommendations.map((recommendation) => recommendation.id));
  const totalMemory = snapshot.system?.totalMemoryBytes ?? 0;
  const users: ResourceUser[] = groupProcesses(snapshot.processes, context)
    .filter((group) => !IGNORED.has(group.key) && !group.processes.every((process) => process.pid === 0))
    .map((group) => {
      const base = {
        name: group.name,
        processCount: group.processes.length,
        cpuPercent: group.cpuPercent === null ? null : Math.min(100, group.cpuPercent),
        gpuPercent: (() => {
          const value = sumNullable(group.processes.map((process) => process.gpuPercent));
          return value === null ? null : Math.min(100, value);
        })(),
        memoryBytes: group.memoryBytes,
        ioBytesPerSec: sumNullable(group.processes.map((process) => process.ioBytesPerSec)),
        connections: sumNullable(group.processes.map((process) => process.connections)),
      };
      const share = shares(base, totalMemory);
      const main = (Object.entries(share) as Array<[ResourceKind, number]>).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'memory';
      const recommendationId = processRecommendationId(group.key);
      return {
        ...base,
        score: Math.round((share.cpu + share.gpu + share.memory + share.network) * 10) / 10,
        main,
        recommendationId: known.has(recommendationId) ? recommendationId : null,
      };
    });

  const top = (value: (user: ResourceUser) => number | null) =>
    users
      .filter((user) => (value(user) ?? 0) > 0)
      .sort((a, b) => (value(b) ?? 0) - (value(a) ?? 0))
      .slice(0, TOP_PER_RESOURCE);

  const cpuTotal = sumNullable(snapshot.processes.filter((process) => !IGNORED.has(process.name.toLowerCase()) && process.pid !== 0).map((process) => process.cpuPercent));
  const network = snapshot.system?.network ?? null;

  return {
    cpu: { totalPercent: cpuTotal === null ? null : Math.min(100, cpuTotal), cores: snapshot.system?.cpuCores ?? 0, top: top((user) => user.cpuPercent) },
    gpu: { measured: snapshot.processes.some((process) => typeof process.gpuPercent === 'number'), top: top((user) => user.gpuPercent) },
    memory: { usedBytes: snapshot.system?.usedMemoryBytes ?? 0, totalBytes: totalMemory, top: top((user) => user.memoryBytes) },
    network: {
      receivedBytesPerSec: network?.receivedBytesPerSec ?? null,
      sentBytesPerSec: network?.sentBytesPerSec ?? null,
      // Ranked by I/O rate, then by open connections.
      top: users
        .filter((user) => (user.ioBytesPerSec ?? 0) > 0 || (user.connections ?? 0) > 0)
        .sort((a, b) => (b.ioBytesPerSec ?? 0) - (a.ioBytesPerSec ?? 0) || (b.connections ?? 0) - (a.connections ?? 0))
        .slice(0, TOP_PER_RESOURCE),
    },
    overall: [...users].sort((a, b) => b.score - a.score).slice(0, TOP_OVERALL),
  };
}
