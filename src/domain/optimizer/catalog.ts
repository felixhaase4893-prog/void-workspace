import type { ActionType, OpenTarget, OptimizationCategory, Reversibility, SafetyLevel } from './models';
import { ACTION_TYPES } from './models';

/**
 * The fixed list of actions the optimizer knows. A recommendation always
 * points to one of these; nothing else can ever be requested. The texts
 * describe what a later, real run would do. Phase A–C only simulates them.
 */
export interface ActionDefinition {
  type: ActionType;
  category: OptimizationCategory;
  /** What would change, written for the detail view. */
  changes: string;
  risks: string;
  reversible: Reversibility;
  reversibleNote: string;
  /** Conditional sentence for the dry-run report, with {count} as placeholder. */
  plannedChange: string;
  /** How to do it yourself in Windows. */
  manualSteps: readonly string[];
}

/** One-click places (opened by the desktop app; only these fixed ids exist). */
export const OPEN_TARGETS = Object.freeze({
  userTemp: { id: 'folder:user-temp', label: 'Open Temp folder' },
  crashDumps: { id: 'folder:crash-dumps', label: 'Open folder' },
  errorReports: { id: 'folder:error-reports', label: 'Open folder' },
  startupUser: { id: 'folder:startup-user', label: 'Open Startup folder' },
  startupCommon: { id: 'folder:startup-common', label: 'Open Startup folder' },
  startupApps: { id: 'settings:startup-apps', label: 'Open Startup settings' },
  storage: { id: 'settings:storage', label: 'Open Storage settings' },
  power: { id: 'settings:power', label: 'Open Power settings' },
  apps: { id: 'settings:apps', label: 'Open Installed apps' },
  taskManager: { id: 'app:task-manager', label: 'Open Task Manager' },
} satisfies Record<string, OpenTarget>);

export function driveTarget(driveId: string): OpenTarget {
  return { id: `drive:${driveId.toUpperCase()}`, label: `Open drive ${driveId.toUpperCase()}` };
}

const CLEANUP_STEPS = [
  'Close all programs that are currently running.',
  'Open Windows Settings → System → Storage → "Temporary files".',
  'Tick the categories you want and choose "Remove files".',
  'Or open the folder and delete older files yourself; Windows skips files that are still in use.',
] as const;

export const ACTION_CATALOG: Readonly<Record<ActionType, ActionDefinition>> = Object.freeze({
  'cleanup.delete-temp-files': {
    type: 'cleanup.delete-temp-files',
    category: 'cleanup',
    changes: 'The listed temporary files would be removed from the user Temp folder. Folders, links and files outside the folder stay untouched.',
    risks: 'Low. Programs recreate temporary files when they need them. Files changed in the last 24 hours are left out because they might still be in use.',
    reversible: 'no',
    reversibleNote: 'No. Removed temporary files cannot be restored, but they are normally not needed any more.',
    plannedChange: 'Would remove {count} temporary files.',
    manualSteps: CLEANUP_STEPS,
  },
  'cleanup.delete-crash-dumps': {
    type: 'cleanup.delete-crash-dumps',
    category: 'cleanup',
    changes: 'Crash dumps (.dmp) in the CrashDumps folder and in the Temp folder would be removed.',
    risks: 'Low. Crash dumps are only needed to analyse errors. Keep them if you are investigating a crash right now.',
    reversible: 'no',
    reversibleNote: 'No. Removed crash dumps cannot be restored.',
    plannedChange: 'Would remove {count} crash dumps.',
    manualSteps: ['Open the CrashDumps folder.', 'Delete the .dmp files if you are no longer investigating a crash.', 'If a program crashes often: update or reinstall it.'],
  },
  'cleanup.delete-browser-cache': {
    type: 'cleanup.delete-browser-cache',
    category: 'cleanup',
    changes: 'Cached website files of Chrome or Edge would be removed. Bookmarks, passwords, history and cookies are kept.',
    risks: 'Low. Websites load a little slower once on the next visit. The browser should be closed while this happens.',
    reversible: 'no',
    reversibleNote: 'No, but the browser rebuilds its cache automatically while you browse.',
    plannedChange: 'Would remove {count} browser cache files.',
    manualSteps: [
      'In the browser, press Ctrl + Shift + Delete.',
      'Choose the time range "All time" and tick only "Cached images and files".',
      'Click "Delete data". Do not tick cookies or passwords, or you will be signed out everywhere.',
    ],
  },
  'cleanup.delete-error-reports': {
    type: 'cleanup.delete-error-reports',
    category: 'cleanup',
    changes: "Collected Windows Error Reporting (WER) files of this user would be removed.",
    risks: 'Low. The reports are only used to analyse errors and have usually been sent to Microsoft already.',
    reversible: 'no',
    reversibleNote: 'No. Removed error reports cannot be restored.',
    plannedChange: 'Would remove {count} error report files.',
    manualSteps: ['Open Windows Settings → System → Storage → "Temporary files".', 'Tick "Windows error reports and feedback diagnostics" and remove them.'],
  },
  'startup.disable-entry': {
    type: 'startup.disable-entry',
    category: 'startup',
    changes: 'The startup entry would be disabled (like in Task Manager under "Startup apps"). The program itself stays installed.',
    risks: 'Medium. The program no longer starts automatically; notifications, sync or hardware features may be missing until you start it yourself.',
    reversible: 'yes',
    reversibleNote: 'Yes. The entry can be enabled again at any time, e.g. in Task Manager under "Startup apps".',
    plannedChange: 'Would disable {count} startup entry.',
    manualSteps: [
      'Open Windows Settings → Apps → Startup (or Task Manager → "Startup apps").',
      'Switch the program off.',
      'Many programs also have a "Start with Windows" option in their own settings – turn it off there too.',
    ],
  },
  'process.end-background': {
    type: 'process.end-background',
    category: 'process',
    changes: "This program's processes would be ended to free memory.",
    risks: 'High. Unsaved data in this program is lost. The memory actually freed can be lower because processes share memory.',
    reversible: 'partial',
    reversibleNote: 'Partly. The program can be started again, but unsaved data cannot be recovered.',
    plannedChange: 'Would end {count} processes.',
    manualSteps: ['Save your open work in the program.', 'Close the program normally (also check the notification area next to the clock).', 'If it hangs: open Task Manager, select the program, choose "End task".'],
  },
  'power.switch-plan': {
    type: 'power.switch-plan',
    category: 'power',
    changes: 'The active power plan would be switched to "Balanced".',
    risks: 'Low. The PC may use more power; laptops get less battery life.',
    reversible: 'yes',
    reversibleNote: 'Yes. The previous power plan can be chosen again in Windows Settings at any time.',
    plannedChange: 'Would change {count} power setting.',
    manualSteps: ['Open Windows Settings → System → Power & battery.', 'Under "Power mode", choose "Balanced" or "Best performance".'],
  },
});

/** True only for the fixed action ids above. */
export function isKnownActionType(value: unknown): value is ActionType {
  return typeof value === 'string' && (ACTION_TYPES as readonly string[]).includes(value);
}

export const CATEGORY_LABELS: Readonly<Record<OptimizationCategory, string>> = {
  cleanup: 'Cleanup',
  startup: 'Startup',
  process: 'Processes',
  power: 'Power',
};

export const SAFETY_LABELS: Readonly<Record<SafetyLevel, string>> = {
  safe: 'Safe',
  caution: 'Caution',
  blocked: 'Blocked',
};

export const REVERSIBILITY_LABELS: Readonly<Record<Reversibility, string>> = {
  yes: 'Reversible',
  partial: 'Partly reversible',
  no: 'Not reversible',
};
