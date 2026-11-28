// The only bridge between the page and the desktop shell. It exposes a few
// narrow functions; the page still has no Node.js or Electron access of its own.
const { contextBridge, ipcRenderer } = require('electron');

const ACTIVITIES = new Set(['idle', 'project', 'code-tester']);

// PC Optimizer (read-only in this phase). Only ids cross the bridge: no paths, commands or
// action types. The backend checks every id again against what it handed out.
const OPTIMIZER_CHANNELS = {
  startScan: 'void:optimizer-start-scan',
  createPreview: 'void:optimizer-create-preview',
  updateSelection: 'void:optimizer-update-selection',
  validatePreview: 'void:optimizer-validate-preview',
  confirmPreview: 'void:optimizer-confirm-preview',
  executeDryRun: 'void:optimizer-execute-dry-run',
  getHistory: 'void:optimizer-get-history',
};
const OPEN_TARGET_CHANNEL = 'void:optimizer-open-target';
const asId = (value) => String(value ?? '').slice(0, 64);
const asIds = (values) => (Array.isArray(values) ? values.slice(0, 500).map(asId) : []);

contextBridge.exposeInMainWorld('voidDesktop', {
  isDesktop: true,
  /** Shows a native notification. Resolves to false if Windows refused it. */
  notify: (message) =>
    ipcRenderer.invoke('void:notify', {
      title: String(message?.title ?? ''),
      body: String(message?.body ?? ''),
    }),
  /** When enabled, closing the window hides VOID to the notification area instead of quitting. */
  setKeepInTray: (enabled) => ipcRenderer.send('void:set-keep-in-tray', enabled === true),
  /**
   * Discord Rich Presence. Only booleans and one of three activity names pass
   * this bridge; no text from the page can reach Discord.
   */
  discord: {
    configure: (settings) =>
      ipcRenderer.invoke('void:discord-configure', { enabled: settings?.enabled === true, showElapsed: settings?.showElapsed !== false }),
    setActivity: (activity) => {
      if (ACTIVITIES.has(activity)) ipcRenderer.send('void:discord-activity', activity);
    },
    reconnect: () => ipcRenderer.invoke('void:discord-reconnect'),
    getState: () => ipcRenderer.invoke('void:discord-state'),
    onStateChange: (listener) => {
      const handler = (_event, state) => listener(state);
      ipcRenderer.on('void:discord-state', handler);
      return () => ipcRenderer.removeListener('void:discord-state', handler);
    },
  },
  optimizer: {
    startScan: (mode) => ipcRenderer.invoke(OPTIMIZER_CHANNELS.startScan, mode === 'deep' ? 'deep' : 'quick'),
    createPreview: (scanId) => ipcRenderer.invoke(OPTIMIZER_CHANNELS.createPreview, asId(scanId)),
    updateSelection: (previewId, selectedIds) => ipcRenderer.invoke(OPTIMIZER_CHANNELS.updateSelection, asId(previewId), asIds(selectedIds)),
    validatePreview: (previewId) => ipcRenderer.invoke(OPTIMIZER_CHANNELS.validatePreview, asId(previewId)),
    confirmPreview: (previewId) => ipcRenderer.invoke(OPTIMIZER_CHANNELS.confirmPreview, asId(previewId)),
    executeDryRun: (previewId) => ipcRenderer.invoke(OPTIMIZER_CHANNELS.executeDryRun, asId(previewId)),
    getHistory: () => ipcRenderer.invoke(OPTIMIZER_CHANNELS.getHistory),
    /** Opens a fixed place (folder, settings page, Task Manager) by id. Resolves to false if refused. */
    openTarget: (id) => ipcRenderer.invoke(OPEN_TARGET_CHANNEL, asId(id)),
  },
});
