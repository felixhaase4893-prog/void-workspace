import { OPEN_TARGETS } from './catalog';
import { tipForProcess } from './hogTips';
import type { OptimizationRecommendation, PerformanceFinding, ScanSnapshot } from './models';
import { groupProcesses, isHeavyGroup, POWER_SAVER_GUID, processRecommendationId } from './recommendations';
import { isCriticalProcessName, type ProcessContext } from './safety';
import { formatBytes, formatNumber, stableId } from './sizes';

/**
 * Deep scan: the performance hogs – everything that slows the PC down, with
 * the measured value, the cause and step-by-step instructions to fix it
 * yourself. Pure analysis; nothing here acts on the system.
 */

export const LOW_DISK_SHARE = 0.15;
export const HIGH_MEMORY_SHARE = 0.85;
export const MANY_STARTUP_ENTRIES = 8;
export const LONG_UPTIME_SECONDS = 7 * 24 * 60 * 60;
export const BIG_TEMP_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_PROCESS_FINDINGS = 8;

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

export function buildFindings(snapshot: ScanSnapshot, recommendations: readonly OptimizationRecommendation[], context: ProcessContext): PerformanceFinding[] {
  const findings: PerformanceFinding[] = [];
  const known = new Set(recommendations.map((recommendation) => recommendation.id));
  const linked = (id: string) => (known.has(id) ? id : null);
  const system = snapshot.system;

  /* Programs that use a lot of RAM or CPU. */
  const heavy = groupProcesses(snapshot.processes, context)
    .filter((group) => isHeavyGroup(group, 'deep'))
    .sort((a, b) => b.memoryBytes - a.memoryBytes || (b.cpuPercent ?? 0) - (a.cpuPercent ?? 0))
    .slice(0, MAX_PROCESS_FINDINGS);
  for (const group of heavy) {
    const tip = tipForProcess(group.name);
    const share = system && system.totalMemoryBytes > 0 ? group.memoryBytes / system.totalMemoryBytes : 0;
    const cpu = group.cpuPercent ?? 0;
    const notResponding = group.processes.some((process) => process.status === 'not-responding');
    const critical = isCriticalProcessName(group.name) || group.processes.some((process) => process.sessionId === 0);
    findings.push({
      id: `finding.process:${stableId(group.key)}`,
      kind: 'process',
      severity: notResponding || share >= 0.15 || cpu >= 25 ? 'high' : share >= 0.05 || cpu >= 10 ? 'medium' : 'low',
      title: `${group.name}${notResponding ? ' is not responding' : ' uses a lot of resources'}`,
      impact: `${formatBytes(group.memoryBytes)} RAM${group.cpuPercent !== null ? ` · ${formatNumber(group.cpuPercent)} % CPU` : ''} · ${group.processes.length} ${group.processes.length === 1 ? 'process' : 'processes'}`,
      cause: critical ? `${tip.what} Part of Windows or runs as a service – do not end it, tackle the cause instead.` : tip.what,
      fixSteps: [...tip.steps],
      openTarget: OPEN_TARGETS.taskManager,
      recommendationId: linked(processRecommendationId(group.key)),
    });
  }

  /* Startup. */
  const enabled = snapshot.startupEntries.filter((entry) => entry.status === 'enabled');
  if (enabled.length >= MANY_STARTUP_ENTRIES) {
    findings.push({
      id: 'finding.startup-count',
      kind: 'startup',
      severity: enabled.length >= MANY_STARTUP_ENTRIES * 2 ? 'high' : 'medium',
      title: 'Many programs start with Windows',
      impact: `${enabled.length} enabled startup entries`,
      cause: 'Every startup program makes sign-in take longer and then keeps running in the background.',
      fixSteps: [
        'Open Windows Settings → Apps → Startup.',
        'Turn off everything you do not need right after booting (e.g. launchers, chat and music apps).',
        'Keep driver helpers (audio, graphics, mouse) and security software on.',
        'Restart and check that everything important still works.',
      ],
      openTarget: OPEN_TARGETS.startupApps,
      recommendationId: null,
    });
  }

  if (system) {
    /* Disk space. */
    for (const drive of system.drives) {
      if (drive.totalBytes <= 0) continue;
      const free = drive.freeBytes / drive.totalBytes;
      if (free >= LOW_DISK_SHARE) continue;
      findings.push({
        id: `finding.disk:${drive.id.slice(0, 1).toLowerCase()}`,
        kind: 'disk',
        severity: free < 0.05 ? 'high' : 'medium',
        title: `Drive ${drive.id} is almost full`,
        impact: `${formatBytes(drive.freeBytes)} free of ${formatBytes(drive.totalBytes)} (${Math.round(free * 100)} %)`,
        cause: 'Little free space slows down Windows updates, the page file and programs that write temporary files.',
        fixSteps: [
          'Open Windows Settings → System → Storage and remove "Temporary files".',
          'Turn on "Storage Sense" so Windows cleans up regularly.',
          'Check large, unused files and apps under "Cleanup recommendations".',
          'Empty the Downloads folder and the Recycle Bin.',
          'Move large games or media collections to another drive.',
        ],
        openTarget: OPEN_TARGETS.storage,
        recommendationId: null,
      });
    }

    /* RAM. */
    if (system.totalMemoryBytes > 0 && system.usedMemoryBytes / system.totalMemoryBytes >= HIGH_MEMORY_SHARE) {
      findings.push({
        id: 'finding.memory',
        kind: 'memory',
        severity: system.usedMemoryBytes / system.totalMemoryBytes >= 0.93 ? 'high' : 'medium',
        title: 'Memory is almost full',
        impact: `${formatBytes(system.usedMemoryBytes)} of ${formatBytes(system.totalMemoryBytes)} in use`,
        cause: 'When RAM is full, Windows swaps to the drive – that makes everything noticeably slower.',
        fixSteps: [
          'Close the programs with the highest usage (see above) if you do not need them.',
          'Close browser tabs.',
          'In Task Manager → "Processes", sort by "Memory" and end what you do not need.',
          'If this happens often: adding more RAM is worth it.',
        ],
        openTarget: OPEN_TARGETS.taskManager,
        recommendationId: null,
      });
    }

    /* Uptime. */
    if (system.uptimeSeconds >= LONG_UPTIME_SECONDS) {
      const days = Math.floor(system.uptimeSeconds / 86_400);
      findings.push({
        id: 'finding.uptime',
        kind: 'uptime',
        severity: days >= 21 ? 'medium' : 'low',
        title: 'Not restarted for a long time',
        impact: `No restart for ${days} days`,
        cause: 'Over time, memory leftovers and stuck background processes pile up, and updates wait for a restart. "Shut down" with Fast Startup does not count as a restart.',
        fixSteps: ['Save your work.', 'Start → Power → choose "Restart" (not "Shut down").', 'Afterwards, check Settings → Windows Update for anything pending.'],
        openTarget: null,
        recommendationId: null,
      });
    }

    /* Power plan. */
    if (system.powerPlan?.guid.toLowerCase() === POWER_SAVER_GUID) {
      findings.push({
        id: 'finding.power',
        kind: 'power',
        severity: 'high',
        title: 'Power saver mode slows the PC down',
        impact: `Active plan: ${system.powerPlan.name}`,
        cause: 'Power saver mode keeps the processor clock low all the time.',
        fixSteps: ['Open Windows Settings → System → Power & battery.', 'Under "Power mode", choose "Balanced" or "Best performance".'],
        openTarget: OPEN_TARGETS.power,
        recommendationId: linked('power.balanced-plan'),
      });
    }
  }

  /* Junk files. */
  const junkBytes = recommendations.filter((recommendation) => recommendation.category === 'cleanup').reduce((total, recommendation) => total + recommendation.estimatedDiskBytes, 0);
  if (junkBytes >= BIG_TEMP_BYTES) {
    findings.push({
      id: 'finding.junk-files',
      kind: 'cleanup',
      severity: junkBytes >= BIG_TEMP_BYTES * 5 ? 'high' : 'medium',
      title: 'Lots of unnecessary files',
      impact: `about ${formatBytes(junkBytes)} in temp, cache and report folders (may overlap)`,
      cause: 'Programs often do not clean up their temporary files. That costs disk space and slows down virus scans and search.',
      fixSteps: [
        'Select the cleanup actions in the preview below and look at the simulation.',
        'Clean up yourself: Settings → System → Storage → "Temporary files".',
        'Turn on "Storage Sense" so Windows does this automatically from now on.',
      ],
      openTarget: OPEN_TARGETS.storage,
      recommendationId: linked('cleanup.user-temp'),
    });
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
