// The only bridge between the page and the desktop shell. It exposes a few
// narrow functions; the page still has no Node.js or Electron access of its own.
const { contextBridge, ipcRenderer } = require('electron');

const ACTIVITIES = new Set(['idle', 'project', 'code-tester']);

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
});
