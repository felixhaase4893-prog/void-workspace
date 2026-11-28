/**
 * Concrete fixes for well-known performance hogs. Matched by process name;
 * everything else gets the general steps. Only advice: nothing here runs.
 */

export interface HogTip {
  /** What the program is, in plain words. */
  what: string;
  steps: readonly string[];
}

const BROWSER: HogTip = {
  what: 'Web browser – every tab and extension runs as its own process.',
  steps: [
    'Close tabs you do not need, or use bookmarks instead of keeping tabs open.',
    'Check your extensions and disable the ones you do not need (menu → Extensions).',
    "Open the browser's own Task Manager (Shift + Esc) and end tabs that use a lot.",
    'Turn on "Memory Saver" / "Sleeping tabs" for inactive tabs in the browser settings (Performance).',
    'In the settings, turn off "Continue running background apps when the browser is closed".',
  ],
};

const TIPS: ReadonlyArray<{ pattern: RegExp; tip: HogTip }> = [
  { pattern: /^(chrome|msedge|firefox|opera|brave|vivaldi)$/i, tip: BROWSER },
  {
    pattern: /^msedgewebview2$/i,
    tip: {
      what: 'Edge WebView2 – draws the interface of other programs (e.g. Widgets, Teams, Outlook, game launchers).',
      steps: ['In Task Manager → "Details", add the "Command line" column to see which program starts it.', 'Close that program or turn off its startup.', 'Turn off Windows Widgets: Settings → Personalization → Taskbar → "Widgets" off.'],
    },
  },
  {
    pattern: /^discord$/i,
    tip: {
      what: 'Discord – chat app built on a browser engine.',
      steps: ['Discord → Settings → Advanced → try toggling "Hardware Acceleration".', 'Settings → Windows Settings → turn off "Open Discord" (startup).', 'Turn off the in-game overlay if you do not use it (Settings → Overlay).', 'Quit Discord completely from the icon next to the clock when you are not using it.'],
    },
  },
  {
    pattern: /^(steam|steamwebhelper)$/i,
    tip: {
      what: 'Steam – the web helper draws the store, library and overlay.',
      steps: ['Steam → Settings → Interface → turn off "GPU accelerated rendering" and animated avatars.', 'Steam → Settings → Interface → turn off "Run Steam when my computer starts".', 'Disable the in-game overlay per game if you do not need it.', 'Use the small mode: View → Small Mode.'],
    },
  },
  {
    pattern: /^spotify$/i,
    tip: {
      what: 'Spotify – music app with a browser-based interface and offline cache.',
      steps: ['Spotify → Settings → toggle "Hardware acceleration".', 'Settings → Startup and window behaviour → set "Open Spotify automatically" to "No".', 'Check offline storage: Settings → Storage → Clear cache.'],
    },
  },
  {
    pattern: /^(ms-teams|teams)$/i,
    tip: { what: 'Microsoft Teams.', steps: ['Teams → Settings → General → turn off "Auto-start Teams".', 'Quit Teams completely (icon next to the clock → Quit) when you do not need it.'] },
  },
  {
    pattern: /^onedrive$/i,
    tip: { what: 'OneDrive – syncs files with the cloud.', steps: ['OneDrive icon → gear → "Pause syncing" while you need the performance.', 'Remove large folders from syncing (Settings → Account → Choose folders).', 'Turn off startup in the OneDrive settings if you do not use OneDrive.'] },
  },
  {
    pattern: /^(msmpeng|mpdefendercoreservice)$/i,
    tip: {
      what: 'Microsoft Defender – antivirus. Do not turn it off!',
      steps: ['High load usually comes from a running scan and drops again afterwards.', 'Add folders that change all the time (e.g. game libraries, development folders) as exclusions: Windows Security → Virus & threat protection → Manage settings → Exclusions.', 'Leave the PC on overnight now and then so scheduled scans run at that time.'],
    },
  },
  {
    pattern: /^(searchindexer|searchhost|searchprotocolhost)$/i,
    tip: { what: 'Windows Search – indexes files for searching.', steps: ['Settings → Privacy & security → Searching Windows → choose "Classic" instead of "Enhanced".', 'Add large, rarely searched folders under "Excluded folders".'] },
  },
  {
    pattern: /^(code|devenv|idea64|rider64|studio64)$/i,
    tip: { what: 'Development environment.', steps: ['Close projects and windows you do not need.', 'Check extensions/plugins and disable heavy ones.', 'Exclude large folders (node_modules, build) from file watching.'] },
  },
  {
    pattern: /^(nvidia overlay|nvcontainer|nvidia share)$/i,
    tip: { what: 'NVIDIA app / overlay.', steps: ['NVIDIA app → Settings → turn off the in-game overlay if you do not use it.', 'Turn off Instant Replay / background recording.'] },
  },
];

const GENERIC: HogTip = {
  what: 'A program that uses a lot of memory or processor time.',
  steps: [
    'Check whether you need the program right now; if not, close it normally (also check next to the clock).',
    'In the program\'s settings, turn off "Start with Windows" or "Run in background".',
    'Update the program – newer versions often fix memory leaks.',
    'If you never use it: uninstall it via Settings → Apps → Installed apps.',
  ],
};

export function tipForProcess(name: string): HogTip {
  const normalized = name.trim().replace(/\.exe$/i, '');
  return TIPS.find((entry) => entry.pattern.test(normalized))?.tip ?? GENERIC;
}
