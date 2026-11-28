import type { ProcessInfo, SafetyLevel, StartupEntry } from './models';

/**
 * Safety classification. "blocked" means: never selectable, never executable,
 * whatever the page sends. The lists are deliberately conservative; anything
 * that belongs to Windows itself or to security software is blocked.
 */

export interface SafetyVerdict {
  safety: SafetyLevel;
  reason: string;
}

/** Windows core processes and security software. Ending them can crash or endanger the PC. */
const CRITICAL_PROCESSES = new Set(
  [
    'system',
    'idle',
    'registry',
    'smss',
    'csrss',
    'wininit',
    'winlogon',
    'services',
    'lsass',
    'lsaiso',
    'svchost',
    'fontdrvhost',
    'dwm',
    'explorer',
    'sihost',
    'ctfmon',
    'taskhostw',
    'runtimebroker',
    'searchhost',
    'startmenuexperiencehost',
    'shellexperiencehost',
    'textinputhost',
    'audiodg',
    'conhost',
    'spoolsv',
    'wudfhost',
    'memory compression',
    'secure system',
    'msmpeng',
    'nissrv',
    'mpdefendercoreservice',
    'securityhealthservice',
    'securityhealthsystray',
    'smartscreen',
  ].map((name) => name.toLowerCase()),
);

export function isCriticalProcessName(name: string): boolean {
  return CRITICAL_PROCESSES.has(name.trim().toLowerCase().replace(/\.exe$/, ''));
}

export interface ProcessContext {
  /** Names of the processes that belong to this app itself (e.g. "VOID", "electron"). Never suggested. */
  ownProcessNames: readonly string[];
}

export function isOwnProcess(name: string, context: ProcessContext): boolean {
  const normalized = name.trim().toLowerCase().replace(/\.exe$/, '');
  return context.ownProcessNames.some((own) => own.trim().toLowerCase().replace(/\.exe$/, '') === normalized);
}

/** Processes of one program, judged together (a browser runs many). */
export function classifyProcessGroup(name: string, processes: readonly ProcessInfo[]): SafetyVerdict {
  if (isCriticalProcessName(name)) {
    return { safety: 'blocked', reason: 'Part of Windows or security software. Ending it could make the system unstable or unprotected.' };
  }
  if (processes.some((process) => process.sessionId === 0)) {
    return { safety: 'blocked', reason: 'Runs as a system service (session 0). The optimizer never ends services.' };
  }
  return { safety: 'caution', reason: 'Ending closes the program; unsaved data is lost.' };
}

/** Patterns of autostart entries that keep Windows or the PC safe. */
const BLOCKED_STARTUP_PATTERNS: readonly RegExp[] = [
  /securityhealth/i,
  /windows ?defender/i,
  /msascui/i,
  /msmpeng/i,
  /\bctfmon\b/i,
  /\buserinit\b/i,
  /\bexplorer\.exe\b/i,
];

/** Hardware helpers: allowed, but the risk text mentions possible missing device functions. */
const HARDWARE_STARTUP_PATTERNS: readonly RegExp[] = [/realtek|rtkaud|rtkngui/i, /igfx|intel\s*graphics/i, /nvidia|nvcpl|nvbackend/i, /\bamd\b|radeon/i, /synaptics|\belan\b|touchpad/i, /logitech|razer|corsair/i];

export function classifyStartupEntry(entry: StartupEntry): SafetyVerdict & { hardware: boolean } {
  const haystack = `${entry.name} ${entry.path ?? ''}`;
  if (BLOCKED_STARTUP_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return { safety: 'blocked', reason: 'System- or security-relevant entry. It is never disabled.', hardware: false };
  }
  const hardware = HARDWARE_STARTUP_PATTERNS.some((pattern) => pattern.test(haystack));
  return {
    safety: 'caution',
    reason: hardware ? 'Probably a driver or hardware helper; device features could be missing.' : 'The program no longer starts automatically afterwards.',
    hardware,
  };
}

/** Entries in the machine-wide locations can only be changed with administrator rights. */
export function startupRequiresAdmin(entry: StartupEntry): boolean {
  return entry.source === 'hklm-run' || entry.source === 'hklm-run-wow64' || entry.source === 'startup-folder-common';
}

/** A recommendation may only be selected when it is not blocked and still ready. */
export function isSelectable(recommendation: { safety: SafetyLevel; status: string }): boolean {
  return recommendation.safety !== 'blocked' && recommendation.status === 'ready';
}
