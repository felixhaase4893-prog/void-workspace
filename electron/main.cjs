// Desktop shell for VOID. Serves the bundled web app through a private app:// scheme;
// no remote content is loaded and the renderer has no Node.js access.
const trace = require('./startupTrace.cjs');
trace.mark('main-start');
const { app, BrowserWindow, Menu, Notification, dialog, Tray, ipcMain, nativeImage, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const ORIGIN = `${SCHEME}://void`;
const DIST_DIR = path.join(__dirname, '..', 'dist');
const ICON_PATH = path.join(DIST_DIR, 'icon.png');
// Same id as the installer metadata, so Windows groups VOID's notifications under its own name and icon.
const APP_USER_MODEL_ID = 'app.void.workspace';

// A standard, secure scheme gives the app a stable origin, so localStorage persists between launches.
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Tray | null} */
let tray = null;
let keepInTray = false;
let quitting = false;
// Notifications are kept referenced until closed; otherwise their click handler can be garbage collected.
const activeNotifications = new Set();

function serveDist() {
  protocol.handle(SCHEME, (request) => {
    const { pathname } = new URL(request.url);
    const filePath = path.normalize(path.join(DIST_DIR, decodeURIComponent(pathname)));
    const insideDist = filePath.startsWith(DIST_DIR + path.sep);
    // Unknown paths and client-side routes like /tasks fall back to the SPA entry point.
    const hasExtension = path.extname(filePath) !== '';
    const target = insideDist && hasExtension ? filePath : path.join(DIST_DIR, 'index.html');
    return net.fetch(pathToFileURL(target).toString());
  });
}

function showMainWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

/* ---------- Window size and position ---------- */

// Remembered between launches in the user data folder (not in the workspace).
const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_BOUNDS = { width: 1360, height: 880 };

function windowStatePath() {
  return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

/** The saved bounds, if they still fit on a connected screen. Never throws. */
function loadWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
    const { x, y, width, height } = saved ?? {};
    if (![x, y, width, height].every(Number.isFinite) || width < 380 || height < 560) return { ...DEFAULT_BOUNDS, maximized: false };
    const { screen } = require('electron');
    // At least a good part of the title bar must be on some screen, or the window would open out of reach.
    const visible = screen.getAllDisplays().some(({ workArea: area }) => x + width - 100 > area.x && x + 100 < area.x + area.width && y >= area.y - 10 && y + 40 < area.y + area.height);
    if (!visible) return { width, height, maximized: saved.maximized === true };
    return { x, y, width, height, maximized: saved.maximized === true };
  } catch {
    return { ...DEFAULT_BOUNDS, maximized: false };
  }
}

function saveWindowState(window) {
  try {
    if (window.isDestroyed() || window.isMinimized()) return;
    const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
    fs.writeFileSync(windowStatePath(), JSON.stringify({ ...bounds, maximized: window.isMaximized() }));
  } catch {
    // Only costs the remembered size.
  }
}

function createWindow() {
  const state = loadWindowState();
  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    ...(state.x !== undefined ? { x: state.x, y: state.y } : {}),
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#08080b',
    title: 'VOID',
    // Window and taskbar icon; the packaged EXE additionally embeds build/icon.ico.
    icon: path.join(DIST_DIR, 'icon.png'),
    autoHideMenuBar: true,
    // Shown right away: the page paints a lightweight loading screen from index.html
    // within a few frames, instead of keeping the user waiting for an invisible window.
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  mainWindow = window;
  if (state.maximized) window.maximize();
  if (window.isVisible()) trace.mark('window-shown');
  else window.once('show', () => trace.mark('window-shown'));
  trace.watchRenderer(window.webContents);
  trace.seedIfRequested(window.webContents);

  // Only the bundled app may load in the window. Web links (e.g. project links) open in the system browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN)) event.preventDefault();
  });

  // Tray mode: closing hides the window, so reminders keep running. Quitting goes through the tray menu.
  window.on('close', (event) => {
    saveWindowState(window);
    if (keepInTray && !quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  // The page blocks unloading while the Code Tester holds unsaved code (beforeunload).
  // Electron would silently cancel the close, so ask the user instead.
  window.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(window, {
      type: 'question',
      buttons: ['Leave', 'Stay'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved code',
      message: 'The Code Tester has unsaved code.',
      detail: 'If you leave now, the code in the Code Tester is lost.',
      noLink: true,
    });
    if (choice === 0) event.preventDefault();
    else quitting = false;
  });
  window.on('closed', () => {
    mainWindow = null;
  });

  void window.loadURL(`${ORIGIN}/`);
}

/* ---------- Notifications ---------- */

/** Only the bundled page may use the bridge. */
function fromApp(event) {
  const url = event.senderFrame?.url ?? '';
  return url.startsWith(`${ORIGIN}/`);
}

function clip(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

ipcMain.handle('void:notify', (event, message) => {
  if (!fromApp(event) || !Notification.isSupported()) return false;
  const title = clip(message?.title, 120);
  if (title === '') return false;
  return new Promise((resolve) => {
    const notification = new Notification({ title, body: clip(message?.body, 400), icon: ICON_PATH });
    activeNotifications.add(notification);
    const forget = () => activeNotifications.delete(notification);
    notification.once('show', () => resolve(true));
    notification.once('failed', () => {
      forget();
      resolve(false);
    });
    notification.on('click', () => {
      forget();
      showMainWindow();
    });
    notification.on('close', forget);
    notification.show();
    // Windows does not always report "show"; do not keep the page waiting.
    setTimeout(() => resolve(true), 3000);
  });
});

/* ---------- Tray ---------- */

function createTray() {
  if (tray) return;
  const image = nativeImage.createFromPath(ICON_PATH).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('VOID');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open VOID', click: showMainWindow },
      { type: 'separator' },
      {
        label: 'Quit VOID',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('click', showMainWindow);
}

function destroyTray() {
  tray?.destroy();
  tray = null;
}

ipcMain.on('void:set-keep-in-tray', (event, enabled) => {
  if (!fromApp(event)) return;
  keepInTray = enabled === true;
  if (keepInTray) createTray();
  else {
    destroyTray();
    // The window may be hidden right now; never leave VOID running without a way back.
    if (mainWindow && !mainWindow.isVisible()) showMainWindow();
  }
});

/* ---------- Discord Rich Presence ---------- */

// Loaded on first use, so it never costs start time. The page only sends on/off
// switches and an activity name; the texts live in discordPresence.cjs.
/** @type {ReturnType<typeof import('./discordPresence.cjs').createDiscordPresence> | null} */
let discordPresence = null;

function getDiscordPresence() {
  if (!discordPresence) {
    const { createDiscordPresence } = require('./discordPresence.cjs');
    const { DISCORD_CLIENT_ID } = require('./discordConfig.cjs');
    discordPresence = createDiscordPresence({
      clientId: DISCORD_CLIENT_ID,
      onState: (state) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('void:discord-state', state);
      },
    });
  }
  return discordPresence;
}

ipcMain.handle('void:discord-configure', (event, settings) => {
  if (!fromApp(event)) return null;
  return getDiscordPresence().configure({ enabled: settings?.enabled === true, showElapsed: settings?.showElapsed !== false });
});
ipcMain.handle('void:discord-reconnect', (event) => (fromApp(event) ? getDiscordPresence().reconnect() : null));
ipcMain.handle('void:discord-state', (event) => (fromApp(event) ? getDiscordPresence().getState() : null));
ipcMain.on('void:discord-activity', (event, activity) => {
  if (!fromApp(event)) return;
  getDiscordPresence().setActivity(activity);
});

/* ---------- App lifecycle ---------- */

Menu.setApplicationMenu(null);
trace.applyProfile(app);
if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);

/**
 * Windows takes the taskbar icon of VOID's window group from the Start Menu
 * shortcut with the same AppUserModelID. The portable EXE runs from a new temp
 * folder on every launch, so a shortcut pointing into an old one shows a blank
 * icon. Repair an existing VOID shortcut so it points at the EXE that was just
 * started (and takes its icon from there). No new shortcut is ever created.
 */
function repairStartMenuShortcut() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const target = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  const link = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'VOID.lnk');
  try {
    if (!fs.existsSync(link)) return;
    const current = shell.readShortcutLink(link);
    // After an update the EXE is replaced at the same path; Windows keeps the old cached
    // icon until the shortcut itself changes. So rewrite it once whenever the EXE is newer.
    const exeIsNewer = fs.statSync(target).mtimeMs > fs.statSync(link).mtimeMs;
    if (!exeIsNewer && current.target === target && current.appUserModelId === APP_USER_MODEL_ID && fs.existsSync(current.target)) return;
    shell.writeShortcutLink(link, 'replace', { target, cwd: path.dirname(target), icon: target, iconIndex: 0, appUserModelId: APP_USER_MODEL_ID, description: 'VOID' });
  } catch {
    // A broken shortcut only costs the icon; never block the start for it.
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Starting VOID again (e.g. from the EXE) brings the running window back, also from the tray.
  app.on('second-instance', showMainWindow);
  app.whenReady().then(() => {
    trace.mark('app-ready');
    serveDist();
    createWindow();
    // After the window is up, so it never delays the start. Measurement runs leave the user's shortcut alone.
    if (!process.env.VOID_STARTUP_TRACE) setTimeout(repairStartMenuShortcut, 1500);
  });
  app.on('before-quit', () => {
    quitting = true;
    // Clears the status in Discord right away instead of when Discord notices the closed pipe.
    discordPresence?.dispose();
  });
  app.on('window-all-closed', () => app.quit());
}
