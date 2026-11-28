import type { CleanupCandidate, CleanupLocationScan, ProcessInfo, ScanMode, StartupEntry, SystemInfo } from './models';
import { createScannerSuite, type ModuleScanners, type ScannerSuite } from './scanner';

/**
 * Simulated system data: for tests and for the browser demo, where VOID has
 * no access to the PC. Nothing here touches the real system.
 */

const MB = 1024 * 1024;
const GB = 1024 * MB;

export function simulatedSystem(): SystemInfo {
  return {
    cpuModel: 'Simulated CPU (8 cores)',
    cpuCores: 8,
    totalMemoryBytes: 16 * GB,
    usedMemoryBytes: Math.round(10.4 * GB),
    freeMemoryBytes: Math.round(5.6 * GB),
    windowsVersion: 'Windows 11 Pro (Simulation)',
    windowsBuild: '26200',
    drives: [
      { id: 'C:', label: 'System', fileSystem: 'NTFS', totalBytes: 512 * GB, freeBytes: 48 * GB },
      { id: 'D:', label: 'Data', fileSystem: 'NTFS', totalBytes: 1024 * GB, freeBytes: 610 * GB },
    ],
    powerPlan: { guid: 'a1841308-3541-4fab-bc81-f71556f20b4a', name: 'Power saver' },
    uptimeSeconds: 9 * 24 * 60 * 60,
    network: { receivedBytesPerSec: Math.round(4.2 * MB), sentBytesPerSec: Math.round(0.3 * MB) },
  };
}

export function simulatedProcesses(): ProcessInfo[] {
  const process = (name: string, pid: number, memoryMb: number, extra: Partial<ProcessInfo> = {}): ProcessInfo => ({
    name,
    pid,
    cpuPercent: 0.4,
    memoryBytes: Math.round(memoryMb * MB),
    sessionId: 1,
    status: 'running',
    ...extra,
  });
  return [
    process('chrome', 4100, 320, { cpuPercent: 6.5, gpuPercent: 4, ioBytesPerSec: Math.round(2.5 * MB), connections: 24 }),
    process('chrome', 4120, 210, { cpuPercent: 2, ioBytesPerSec: 400_000, connections: 6 }),
    process('chrome', 4188, 160, { cpuPercent: 1 }),
    process('Discord', 5200, 460, { cpuPercent: 1.2, gpuPercent: 2.5, ioBytesPerSec: 150_000, connections: 9 }),
    process('explorer', 3100, 420, { cpuPercent: 0.8, gpuPercent: 0.5 }),
    process('MsMpEng', 2900, 450, { sessionId: 0, cpuPercent: null, ioBytesPerSec: Math.round(6 * MB) }),
    process('svchost', 1200, 80, { sessionId: 0, cpuPercent: 0.6, connections: 12 }),
    process('GameClient', 6600, 2300, { cpuPercent: 38, gpuPercent: 71, ioBytesPerSec: 900_000, connections: 3 }),
    process('notepad', 7700, 20),
    process('VOID', 8800, 520),
  ];
}

export function simulatedStartupEntries(): StartupEntry[] {
  return [
    { id: 'hkcu-run|Discord', name: 'Discord', source: 'hkcu-run', path: 'C:\\Users\\Demo\\AppData\\Local\\Discord\\Update.exe', status: 'enabled', description: 'Starts when you sign in.' },
    { id: 'hkcu-run|Spotify', name: 'Spotify', source: 'hkcu-run', path: 'C:\\Users\\Demo\\AppData\\Roaming\\Spotify\\Spotify.exe', status: 'enabled', description: 'Starts when you sign in.' },
    { id: 'hklm-run|SecurityHealth', name: 'SecurityHealth', source: 'hklm-run', path: 'C:\\Windows\\System32\\SecurityHealthSystray.exe', status: 'enabled', description: 'Windows Security.' },
    { id: 'hklm-run|RtkAudUService', name: 'RtkAudUService', source: 'hklm-run', path: 'C:\\Windows\\System32\\DriverStore\\RtkAudUService64.exe', status: 'enabled', description: 'Realtek Audio.' },
    { id: 'hkcu-run|OldTool', name: 'OldTool', source: 'hkcu-run', path: 'C:\\Tools\\old.exe', status: 'disabled', description: 'Already disabled.' },
  ];
}

function candidate(location: CleanupCandidate['location'], relativePath: string, sizeBytes: number, physicalKey = `${location}:${relativePath.toLowerCase()}`): CleanupCandidate {
  return { id: physicalKey, physicalKey, location, relativePath, sizeBytes, modifiedAt: '2026-11-01T10:00:00.000Z' };
}

export function simulatedCleanup(): CleanupLocationScan[] {
  const temp: CleanupCandidate[] = [
    candidate('user-temp', 'setup-cache\\installer.msi', 640 * MB),
    candidate('user-temp', 'chrome_shutdown_ms.txt', 2048),
    candidate('user-temp', 'logs\\app-2026-10.log', 18 * MB),
    candidate('user-temp', 'game-crash.dmp', 420 * MB),
    candidate('user-temp', 'thumbs\\cache.db', 96 * MB),
    ...Array.from({ length: 40 }, (_, index) => candidate('user-temp', `tmp${index}.tmp`, 12 * MB)),
  ];
  const dumps: CleanupCandidate[] = [candidate('crash-dumps', 'Discord.exe.5200.dmp', 310 * MB), candidate('crash-dumps', 'explorer.exe.3100.dmp', 150 * MB)];
  return [
    {
      location: 'user-temp',
      label: 'User Temp folder',
      displayRoot: '%LOCALAPPDATA%\\Temp',
      candidates: temp,
      occupiedBytes: temp.reduce((total, entry) => total + entry.sizeBytes, 0) + 220 * MB,
      fileCount: temp.length + 31,
      inaccessibleCount: 3,
      skipped: [
        { module: 'temp-files', reason: 'recently-modified', count: 26, bytes: 210 * MB },
        { module: 'temp-files', reason: 'junction-or-link', count: 2, bytes: 0 },
      ],
      limitReached: false,
    },
    {
      location: 'crash-dumps',
      label: 'Crash dumps',
      displayRoot: '%LOCALAPPDATA%\\CrashDumps',
      candidates: dumps,
      occupiedBytes: dumps.reduce((total, entry) => total + entry.sizeBytes, 0),
      fileCount: dumps.length,
      inaccessibleCount: 0,
      skipped: [],
      limitReached: false,
    },
  ];
}

/** Extra folders only the deep scan looks at. */
export function simulatedDeepCleanup(): CleanupLocationScan[] {
  const cache = Array.from({ length: 30 }, (_, index) => candidate('browser-cache', `f_${index.toString(16).padStart(6, '0')}`, 9 * MB));
  const reports = [candidate('error-reports', 'ReportArchive\\AppCrash_game\\Report.wer', 4 * MB), candidate('error-reports', 'ReportArchive\\AppCrash_game\\memory.hdmp', 120 * MB)];
  const scan = (location: CleanupLocationScan['location'], label: string, displayRoot: string, candidates: CleanupCandidate[]): CleanupLocationScan => ({
    location, label, displayRoot, candidates, occupiedBytes: candidates.reduce((total, entry) => total + entry.sizeBytes, 0), fileCount: candidates.length, inaccessibleCount: 0, skipped: [], limitReached: false,
  });
  return [
    scan('browser-cache', 'Chrome cache', '%LOCALAPPDATA%\\Google\\Chrome\\User Data\\Default\\Cache', cache),
    scan('error-reports', 'Windows error reports', '%LOCALAPPDATA%\\Microsoft\\Windows\\WER', reports),
  ];
}

export function simulatedModuleScanners(overrides: Partial<ModuleScanners> = {}): ModuleScanners {
  return {
    system: async () => ({ info: simulatedSystem() }),
    processes: async () => simulatedProcesses(),
    startup: async () => ({ entries: simulatedStartupEntries() }),
    tempFiles: async (mode: ScanMode) => ({ locations: mode === 'deep' ? [...simulatedCleanup(), ...simulatedDeepCleanup()] : simulatedCleanup() }),
    ...overrides,
  };
}

export function createSimulatedScannerSuite(overrides: Partial<ModuleScanners> = {}): ScannerSuite {
  return createScannerSuite(simulatedModuleScanners(overrides));
}

/** In the demo the app's own process is called VOID, like in the desktop build. */
export const SIMULATED_CONTEXT = { ownProcessNames: ['VOID'] } as const;
