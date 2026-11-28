import { ACTION_CATALOG, OPEN_TARGETS } from './catalog';
import { tipForProcess } from './hogTips';
import type {
  ActionType,
  AffectedCounts,
  CleanupCandidate,
  CleanupLocation,
  CleanupLocationScan,
  OpenTarget,
  OptimizationCategory,
  OptimizationRecommendation,
  ProcessInfo,
  SafetyLevel,
  ScanMode,
  ScanSnapshot,
  StartupEntry,
} from './models';
import { classifyProcessGroup, classifyStartupEntry, isOwnProcess, startupRequiresAdmin, type ProcessContext } from './safety';
import { dedupeCandidates, formatBytes, stableId } from './sizes';

/**
 * RecommendationEngine: turns a scan into recommendations. It only describes;
 * nothing here can change the system. Every recommendation has a fixed action
 * type from the catalog, a safety level and the rule that produced it.
 */

export const MIN_CLEANUP_BYTES = 1024 * 1024;
/** Memory per program from which ending it is suggested (quick scan). */
export const PROCESS_MEMORY_THRESHOLD_BYTES = 400 * 1024 * 1024;
/** The deep scan looks closer. */
export const DEEP_PROCESS_MEMORY_THRESHOLD_BYTES = 250 * 1024 * 1024;
/** CPU load (sum over a program's processes) from which the deep scan reports it. */
export const DEEP_PROCESS_CPU_THRESHOLD = 10;
export const MAX_SAMPLE_TARGETS = 6;
/** Windows' built-in power saver plan. */
export const POWER_SAVER_GUID = 'a1841308-3541-4fab-bc81-f71556f20b4a';

export type TargetKind = 'file' | 'startup' | 'process' | 'power';

/** One thing a recommendation would affect. Kept in the backend; only counts and labels reach the page. */
export interface OptimizationTarget {
  /** Equal for the same physical thing, also across recommendations, so overlaps are found. */
  id: string;
  kind: TargetKind;
  label: string;
  diskBytes: number;
  memoryBytes: number;
}

export interface EngineOutput {
  recommendations: OptimizationRecommendation[];
  targets: ReadonlyMap<string, readonly OptimizationTarget[]>;
}

export interface EngineContext extends ProcessContext {
  mode?: ScanMode;
}

interface Draft {
  id: string;
  actionType: ActionType;
  title: string;
  description: string;
  reason: string;
  safety: SafetyLevel;
  statusReason: string | null;
  requiresAdmin: boolean;
  found: string;
  targets: OptimizationTarget[];
  openTarget: OpenTarget | null;
  /** Overrides the catalog's general steps (e.g. tips for a specific program). */
  manualSteps?: readonly string[];
}

const CATEGORY_ORDER: Record<OptimizationCategory, number> = { cleanup: 0, startup: 1, process: 2, power: 3 };
const SAFETY_ORDER: Record<SafetyLevel, number> = { safe: 0, caution: 1, blocked: 2 };

function fileName(relativePath: string): string {
  const parts = relativePath.split(/[\\/]/);
  return parts[parts.length - 1] || relativePath;
}

function fileTargets(candidates: readonly CleanupCandidate[]): OptimizationTarget[] {
  return dedupeCandidates(candidates).unique.map((candidate) => ({
    id: `file:${candidate.physicalKey}`,
    kind: 'file' as const,
    label: fileName(candidate.relativePath),
    diskBytes: candidate.sizeBytes,
    memoryBytes: 0,
  }));
}

function sumDisk(targets: readonly OptimizationTarget[]): number {
  return targets.reduce((total, target) => total + target.diskBytes, 0);
}

function sumMemory(targets: readonly OptimizationTarget[]): number {
  return targets.reduce((total, target) => total + target.memoryBytes, 0);
}

function countAffected(targets: readonly OptimizationTarget[]): AffectedCounts {
  const counts: AffectedCounts = { files: 0, startupEntries: 0, processes: 0, powerSettings: 0 };
  for (const target of targets) {
    if (target.kind === 'file') counts.files += 1;
    else if (target.kind === 'startup') counts.startupEntries += 1;
    else if (target.kind === 'process') counts.processes += 1;
    else counts.powerSettings += 1;
  }
  return counts;
}

function locations(snapshot: ScanSnapshot, location: CleanupLocation): CleanupLocationScan[] {
  return snapshot.cleanup.filter((entry) => entry.location === location);
}

function cleanupDrafts(snapshot: ScanSnapshot): Draft[] {
  const drafts: Draft[] = [];
  const temp = snapshot.cleanup.find((location) => location.location === 'user-temp');
  const dumps = snapshot.cleanup.find((location) => location.location === 'crash-dumps');

  if (temp) {
    const targets = fileTargets(temp.candidates);
    const total = sumDisk(targets);
    if (targets.length > 0 && total >= MIN_CLEANUP_BYTES) {
      drafts.push({
        id: 'cleanup.user-temp',
        actionType: 'cleanup.delete-temp-files',
        title: 'Clean up temporary files',
        description: `${targets.length.toLocaleString('en-US')} temporary files in the user Temp folder, older than 24 hours.`,
        reason: `${temp.displayRoot} holds ${formatBytes(total)} of files that have not changed for at least 24 hours.`,
        safety: 'safe',
        statusReason: null,
        requiresAdmin: false,
        found: `${targets.length.toLocaleString('en-US')} files (${formatBytes(total)}) in ${temp.displayRoot}.`,
        targets,
        openTarget: OPEN_TARGETS.userTemp,
      });
    }
  }

  const dumpCandidates = [...(dumps?.candidates ?? []), ...(temp?.candidates ?? []).filter((candidate) => /\.(dmp|mdmp|hdmp)$/i.test(candidate.relativePath))];
  const dumpTargets = fileTargets(dumpCandidates);
  if (dumpTargets.length > 0) {
    const total = sumDisk(dumpTargets);
    drafts.push({
      id: 'cleanup.crash-dumps',
      actionType: 'cleanup.delete-crash-dumps',
      title: 'Remove crash dumps',
      description: `${dumpTargets.length.toLocaleString('en-US')} crash dumps (.dmp) from programs that crashed.`,
      reason: 'Crash dumps are only needed to analyse errors and can get large.',
      safety: 'safe',
      statusReason: null,
      requiresAdmin: false,
      found: `${dumpTargets.length.toLocaleString('en-US')} dumps (${formatBytes(total)})${dumps ? ` in ${dumps.displayRoot}` : ''}${temp ? ' and in the Temp folder' : ''}.`,
      targets: dumpTargets,
      openTarget: dumps ? OPEN_TARGETS.crashDumps : OPEN_TARGETS.userTemp,
    });
  }

  // Deep scan only: these locations are not scanned by the quick scan.
  const caches = locations(snapshot, 'browser-cache');
  const cacheTargets = fileTargets(caches.flatMap((entry) => entry.candidates));
  const cacheTotal = sumDisk(cacheTargets);
  if (cacheTargets.length > 0 && cacheTotal >= MIN_CLEANUP_BYTES) {
    drafts.push({
      id: 'cleanup.browser-cache',
      actionType: 'cleanup.delete-browser-cache',
      title: 'Clear browser cache',
      description: `${cacheTargets.length.toLocaleString('en-US')} cached website files, older than 24 hours.`,
      reason: `The cache of ${caches.length === 1 ? 'one browser profile' : `${caches.length} browser profiles`} takes up ${formatBytes(cacheTotal)}. It grows over time and is rebuilt while you browse.`,
      safety: 'safe',
      statusReason: null,
      requiresAdmin: false,
      found: `${formatBytes(cacheTotal)} in ${caches.map((entry) => entry.displayRoot).join(', ')}.`,
      targets: cacheTargets,
      openTarget: null,
    });
  }

  const reports = locations(snapshot, 'error-reports');
  const reportTargets = fileTargets(reports.flatMap((entry) => entry.candidates));
  if (reportTargets.length > 0) {
    const total = sumDisk(reportTargets);
    drafts.push({
      id: 'cleanup.error-reports',
      actionType: 'cleanup.delete-error-reports',
      title: 'Remove Windows error reports',
      description: `${reportTargets.length.toLocaleString('en-US')} files from collected error reports.`,
      reason: 'Error reports are no longer needed once sent, but they stay on the disk.',
      safety: 'safe',
      statusReason: null,
      requiresAdmin: false,
      found: `${reportTargets.length.toLocaleString('en-US')} files (${formatBytes(total)}) in ${reports[0]?.displayRoot ?? 'WER'}.`,
      targets: reportTargets,
      openTarget: OPEN_TARGETS.errorReports,
    });
  }
  return drafts;
}

const SOURCE_LABELS: Record<StartupEntry['source'], string> = {
  'hkcu-run': 'Registry (current user)',
  'hklm-run': 'Registry (all users)',
  'hklm-run-wow64': 'Registry (all users, 32-bit)',
  'startup-folder-user': 'Startup folder (current user)',
  'startup-folder-common': 'Startup folder (all users)',
};

export function startupSourceLabel(source: StartupEntry['source']): string {
  return SOURCE_LABELS[source];
}

export function startupOpenTarget(source: StartupEntry['source']): OpenTarget {
  if (source === 'startup-folder-user') return OPEN_TARGETS.startupUser;
  if (source === 'startup-folder-common') return OPEN_TARGETS.startupCommon;
  return OPEN_TARGETS.startupApps;
}

function startupDrafts(entries: readonly StartupEntry[]): Draft[] {
  return entries
    .filter((entry) => entry.status === 'enabled')
    .map((entry) => {
      const verdict = classifyStartupEntry(entry);
      const requiresAdmin = startupRequiresAdmin(entry);
      return {
        id: `startup.disable:${stableId(entry.id)}`,
        actionType: 'startup.disable-entry' as const,
        title: `Review startup: ${entry.name}`,
        description: `Starts automatically every time you sign in (${SOURCE_LABELS[entry.source]}).`,
        reason:
          verdict.safety === 'blocked'
            ? 'Shown so it is clear why this entry is left alone.'
            : 'Every startup program makes sign-in take longer and uses resources in the background. Only you can decide whether it is needed.',
        safety: verdict.safety,
        statusReason: verdict.safety === 'blocked' ? verdict.reason : null,
        requiresAdmin,
        found: `${entry.name} – ${entry.path ?? 'path not readable'} (${SOURCE_LABELS[entry.source]}).${verdict.hardware ? ' Looks like a driver or hardware helper.' : ''}`,
        targets: [{ id: `startup:${entry.id}`, kind: 'startup' as const, label: entry.name, diskBytes: 0, memoryBytes: 0 }],
        openTarget: startupOpenTarget(entry.source),
      };
    });
}

export interface ProcessGroup {
  key: string;
  name: string;
  processes: ProcessInfo[];
  memoryBytes: number;
  /** Sum of the measured CPU load, null when no process reported one. */
  cpuPercent: number | null;
}

/** Processes grouped by program, without the app's own processes. */
export function groupProcesses(processes: readonly ProcessInfo[], context: ProcessContext): ProcessGroup[] {
  const groups = new Map<string, ProcessInfo[]>();
  for (const process of processes) {
    if (isOwnProcess(process.name, context)) continue;
    const key = process.name.toLowerCase();
    const group = groups.get(key);
    if (group) group.push(process);
    else groups.set(key, [process]);
  }
  return [...groups].map(([key, group]) => {
    const measured = group.filter((process) => process.cpuPercent !== null);
    return {
      key,
      name: group[0]?.name ?? key,
      processes: group,
      memoryBytes: group.reduce((total, process) => total + process.memoryBytes, 0),
      cpuPercent: measured.length === 0 ? null : Math.round(measured.reduce((total, process) => total + (process.cpuPercent ?? 0), 0) * 10) / 10,
    };
  });
}

/** Whether a program counts as a hog in this scan mode. */
export function isHeavyGroup(group: ProcessGroup, mode: ScanMode): boolean {
  if (mode === 'deep') return group.memoryBytes >= DEEP_PROCESS_MEMORY_THRESHOLD_BYTES || (group.cpuPercent ?? 0) >= DEEP_PROCESS_CPU_THRESHOLD;
  return group.memoryBytes >= PROCESS_MEMORY_THRESHOLD_BYTES;
}

export function processRecommendationId(groupKey: string): string {
  return `process.end:${stableId(groupKey)}`;
}

function processDrafts(processes: readonly ProcessInfo[], context: EngineContext): Draft[] {
  const mode = context.mode ?? 'quick';
  const drafts: Draft[] = [];
  for (const group of groupProcesses(processes, context)) {
    if (!isHeavyGroup(group, mode)) continue;
    const { name, memoryBytes: memory } = group;
    const verdict = classifyProcessGroup(name, group.processes);
    const notResponding = group.processes.some((process) => process.status === 'not-responding');
    const cpu = group.cpuPercent !== null && group.cpuPercent >= 1 ? ` and ${group.cpuPercent.toLocaleString('en-US')} % CPU` : '';
    drafts.push({
      id: processRecommendationId(group.key),
      actionType: 'process.end-background',
      title: `End ${name}`,
      description: `${group.processes.length === 1 ? '1 process' : `${group.processes.length} processes`} using ${formatBytes(memory)} of memory together${cpu}.`,
      reason:
        verdict.safety === 'blocked'
          ? 'Shown because it uses a lot of resources – but ending it is not allowed.'
          : `Uses a lot of memory${cpu ? ' or processor time' : ''}${notResponding ? ' and is currently not responding' : ''}. Only worth it if you do not need the program right now.`,
      safety: verdict.safety,
      statusReason: verdict.safety === 'blocked' ? verdict.reason : null,
      requiresAdmin: false,
      found: `${group.processes.length === 1 ? 'One process' : `${group.processes.length} processes`} "${name}" with ${formatBytes(memory)} of memory (working set)${cpu}.`,
      targets: [...group.processes]
        .sort((a, b) => b.memoryBytes - a.memoryBytes)
        .map((process) => ({ id: `process:${process.pid}`, kind: 'process' as const, label: `${process.name} (PID ${process.pid}, ${formatBytes(process.memoryBytes)})`, diskBytes: 0, memoryBytes: process.memoryBytes })),
      openTarget: OPEN_TARGETS.taskManager,
      manualSteps: tipForProcess(name).steps,
    });
  }
  return drafts;
}

function powerDrafts(snapshot: ScanSnapshot): Draft[] {
  const plan = snapshot.system?.powerPlan;
  if (!plan || plan.guid.toLowerCase() !== POWER_SAVER_GUID) return [];
  return [
    {
      id: 'power.balanced-plan',
      actionType: 'power.switch-plan',
      title: 'Use the "Balanced" power plan',
      description: `"${plan.name}" is active right now, which throttles processor and graphics performance.`,
      reason: 'Power saver mode is active and slows the PC down all the time. "Balanced" is the Windows default.',
      safety: 'caution',
      statusReason: null,
      requiresAdmin: false,
      found: `Active power plan: ${plan.name}.`,
      targets: [{ id: 'power:active-plan', kind: 'power', label: plan.name, diskBytes: 0, memoryBytes: 0 }],
      openTarget: OPEN_TARGETS.power,
    },
  ];
}

function toRecommendation(draft: Draft): OptimizationRecommendation {
  const action = ACTION_CATALOG[draft.actionType];
  const blocked = draft.safety === 'blocked';
  const samples = [...draft.targets].sort((a, b) => b.diskBytes + b.memoryBytes - (a.diskBytes + a.memoryBytes)).slice(0, MAX_SAMPLE_TARGETS);
  return {
    id: draft.id,
    actionType: draft.actionType,
    title: draft.title,
    description: draft.description,
    reason: draft.reason,
    category: action.category,
    safety: draft.safety,
    // Only safe recommendations start selected; caution needs a conscious click, blocked never.
    selectedByDefault: draft.safety === 'safe',
    requiresAdmin: draft.requiresAdmin,
    estimatedDiskBytes: sumDisk(draft.targets),
    estimatedMemoryBytes: sumMemory(draft.targets),
    targetCount: draft.targets.length,
    affects: countAffected(draft.targets),
    preview: {
      found: draft.found,
      why: draft.reason,
      changes: action.changes,
      risks: blocked ? `${draft.statusReason ?? ''} This action cannot be selected.`.trim() : action.risks,
      reversible: action.reversible,
      reversibleNote: action.reversibleNote,
      sampleTargets: samples.map((target) => target.label),
      moreTargets: Math.max(0, draft.targets.length - samples.length),
      manualSteps: [...(draft.manualSteps ?? action.manualSteps)],
    },
    status: blocked ? 'blocked' : 'ready',
    statusReason: draft.statusReason,
    openTarget: draft.openTarget,
  };
}

export function buildRecommendations(snapshot: ScanSnapshot, context: EngineContext): EngineOutput {
  const drafts = [...cleanupDrafts(snapshot), ...startupDrafts(snapshot.startupEntries), ...processDrafts(snapshot.processes, context), ...powerDrafts(snapshot)];
  // Ids must be unique; a hash collision would merge two recommendations, so keep only the first.
  const unique = new Map<string, Draft>();
  for (const draft of drafts) if (!unique.has(draft.id)) unique.set(draft.id, draft);

  const recommendations = [...unique.values()].map(toRecommendation).sort(
    (a, b) =>
      SAFETY_ORDER[a.safety] - SAFETY_ORDER[b.safety] ||
      CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] ||
      b.estimatedDiskBytes + b.estimatedMemoryBytes - (a.estimatedDiskBytes + a.estimatedMemoryBytes) ||
      a.title.localeCompare(b.title, 'de'),
  );
  const targets = new Map<string, readonly OptimizationTarget[]>();
  for (const draft of unique.values()) targets.set(draft.id, Object.freeze([...draft.targets]));
  return { recommendations, targets };
}
