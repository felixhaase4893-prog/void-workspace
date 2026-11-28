/**
 * IPC channels of the optimizer, one per API function. electron/main.cjs and
 * electron/preload.cjs repeat this list (they are plain CommonJS); a test
 * makes sure all three stay identical.
 */
export const OPTIMIZER_CHANNELS = Object.freeze({
  startScan: 'void:optimizer-start-scan',
  createPreview: 'void:optimizer-create-preview',
  updateSelection: 'void:optimizer-update-selection',
  validatePreview: 'void:optimizer-validate-preview',
  confirmPreview: 'void:optimizer-confirm-preview',
  executeDryRun: 'void:optimizer-execute-dry-run',
  getHistory: 'void:optimizer-get-history',
} as const);

export type OptimizerMethod = keyof typeof OPTIMIZER_CHANNELS;

/**
 * One-click "Open": shows a folder, Windows settings page or the Task
 * Manager. Takes only a fixed target id (openTargetIdSchema), never a path.
 */
export const OPEN_TARGET_CHANNEL = 'void:optimizer-open-target';
