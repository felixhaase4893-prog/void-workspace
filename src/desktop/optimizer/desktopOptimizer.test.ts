// @vitest-environment node
import { promises as fs, readFileSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OPEN_TARGET_CHANNEL, OPTIMIZER_CHANNELS } from '../../domain/optimizer/channels';
import { createScannerSuite } from '../../domain/optimizer/scanner';
import { OptimizerService } from '../../domain/optimizer/service';
import { invokeOptimizer, resolveOpenTarget } from './backend';
import { buildPowerShellArgs, createPowerShellRunner, powerShellPath, READ_ONLY_COMMAND_IDS, READ_ONLY_SCRIPTS, type CommandRunner, type ExecFileLike } from './commandRunner';
import { createProcessScanner, parseProcesses } from './processScanner';
import { readOnlyFs, type ReadOnlyFs } from './readOnlyFs';
import { approvedToStatus, createStartupScanner, extractExecutablePath } from './startupScanner';
import { createSystemScanner, parseSystemOutput } from './systemScanner';
import { createTempFileScanner, deepTempRoots, isInsideRoot, type TempRoot } from './tempFileScanner';

const DAY = 24 * 60 * 60 * 1000;
const root = path.join(__dirname, '..', '..', '..');

/* ---------- Read-only commands ---------- */

describe('read-only command runner', () => {
  const MUTATING = [
    /\b(Remove|Set|Stop|New|Clear|Move|Rename|Disable|Enable|Start|Restart|Suspend|Resume|Invoke|Add|Register|Unregister|Install|Uninstall|Copy|Write|Out)-[A-Z]/,
    /\breg(\.exe)?\s+(add|delete|import|copy|load|unload)\b/i,
    /powercfg(\.exe)?\s+[/-](s|setactive|change|delete|import|x)\b/i,
    /\btaskkill\b|\bschtasks\b|\bsc(\.exe)?\s+(config|stop|delete)\b/i,
    /RunAs|-Verb\b|Elevat/i,
    /\.(Kill|Delete|SetValue|DeleteValue|DeleteSubKey|CreateSubKey|OpenSubKey\([^)]*,\s*\$?true)/i,
    /\bdel\b|\berase\b|\brmdir\b|\brd\s/i,
  ];

  it('only knows five fixed queries', () => {
    expect([...READ_ONLY_COMMAND_IDS].sort()).toEqual(['processes', 'processes-deep', 'startup', 'system', 'system-deep']);
  });

  it.each(Object.entries(READ_ONLY_SCRIPTS))('the %s query contains no command that changes the system or asks for admin rights', (_id, script) => {
    for (const pattern of MUTATING) expect(script).not.toMatch(pattern);
  });

  it('refuses unknown query ids', () => {
    expect(() => buildPowerShellArgs('format-c' as never)).toThrow();
  });

  it('starts the system powershell.exe by absolute path, without a shell, hidden, and without elevation', async () => {
    const calls: Array<{ file: string; args: readonly string[]; options: Record<string, unknown> }> = [];
    const execFileImpl: ExecFileLike = (file, args, options, callback) => {
      calls.push({ file, args, options });
      callback(null, '[]', '');
    };
    const run = createPowerShellRunner({ env: { SystemRoot: 'C:\\Windows' }, execFileImpl });
    await run('processes');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.file).toBe('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    expect(calls[0]!.options).toMatchObject({ shell: false, windowsHide: true });
    expect(calls[0]!.args.slice(0, 4)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand']);
    expect(calls[0]!.args.join(' ')).not.toMatch(/RunAs|-Verb/i);
    const decoded = Buffer.from(calls[0]!.args[4]!, 'base64').toString('utf16le');
    expect(decoded).toBe(READ_ONLY_SCRIPTS.processes);
    expect(powerShellPath({})).toMatch(/^C:\\Windows\\System32\\/);
  });

  it('turns a failing or slow query into a scan error', async () => {
    const run = createPowerShellRunner({ execFileImpl: (_f, _a, _o, callback) => callback(Object.assign(new Error('x'), { killed: true }), '', '') });
    await expect(run('system')).rejects.toMatchObject({ code: 'timeout' });
  });
});

/* ---------- ProcessScanner ---------- */

describe('ProcessScanner', () => {
  it('reads name, PID, CPU, RAM and state, and keeps CPU null when it is not reliable', () => {
    const processes = parseProcesses(
      '\uFEFF' +
        JSON.stringify([
          { name: 'chrome', pid: 10, memoryBytes: 300_000_000, cpuPercent: 2.5, responding: true, sessionId: 1 },
          { name: 'System', pid: 4, memoryBytes: 100, cpuPercent: null, responding: null, sessionId: 0 },
          { name: 'hung', pid: 11, memoryBytes: 5, cpuPercent: 250, responding: false, sessionId: 1 },
          { broken: true },
        ]),
    );
    expect(processes).toEqual([
      { name: 'chrome', pid: 10, memoryBytes: 300_000_000, cpuPercent: 2.5, sessionId: 1, status: 'running' },
      { name: 'System', pid: 4, memoryBytes: 100, cpuPercent: null, sessionId: 0, status: 'unknown' },
      { name: 'hung', pid: 11, memoryBytes: 5, cpuPercent: 100, sessionId: 1, status: 'not-responding' },
    ]);
  });

  it('reads GPU, I/O and connections of the deep query and ignores broken values', async () => {
    const commands: string[] = [];
    const scan = createProcessScanner(async (id) => {
      commands.push(id);
      return JSON.stringify([
        { name: 'game', pid: 20, memoryBytes: 2_000_000_000, cpuPercent: 40, responding: true, sessionId: 1, gpuPercent: 71.26, ioBytesPerSec: 900_000.4, connections: 3 },
        { name: 'odd', pid: 21, memoryBytes: 1, cpuPercent: 1, responding: true, sessionId: 1, gpuPercent: 'x', ioBytesPerSec: -1, connections: null },
      ]);
    });
    const processes = await scan('deep');
    expect(commands).toEqual(['processes-deep']);
    expect(processes[0]).toMatchObject({ name: 'game', gpuPercent: 71.26, ioBytesPerSec: 900_000, connections: 3 });
    expect(processes[1]?.gpuPercent ?? null).toBeNull();
    expect(processes[1]?.ioBytesPerSec ?? null).toBeNull();
  });

  it('rejects unreadable output', async () => {
    await expect(createProcessScanner(async () => 'nope')()).rejects.toMatchObject({ code: 'invalid-output' });
    await expect(createProcessScanner(async () => '{"a":1}')()).rejects.toMatchObject({ code: 'invalid-output' });
  });
});

/* ---------- StartupScanner ---------- */

describe('StartupScanner', () => {
  const fakeFs = (folders: Record<string, string[]>): ReadOnlyFs => ({
    readdir: (async (folder: string) => {
      const names = folders[folder];
      if (!names) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return names.map((name) => ({ name, isFile: () => !name.endsWith('/'), isSymbolicLink: () => false }));
    }) as unknown as ReadOnlyFs['readdir'],
    lstat: (async () => {
      throw new Error('not used');
    }) as unknown as ReadOnlyFs['lstat'],
    realpath: async (value) => value,
  });

  it('reads Run keys and Startup folders with their enabled state', async () => {
    const run: CommandRunner = async () =>
      JSON.stringify({
        entries: [
          { source: 'hkcu-run', name: 'Discord', command: '"C:\\Users\\a\\Discord\\Update.exe" --processStart Discord.exe', approvedState: 2 },
          { source: 'hklm-run', name: 'Tool', command: 'C:\\Program Files\\Tool\\tool.exe -min', approvedState: 3 },
          { source: 'hkcu-run', name: '', command: 'x', approvedState: null },
        ],
        folderApproved: [{ scope: 'user', name: 'Notes.lnk', approvedState: 7 }],
      });
    const scanner = createStartupScanner({ run, fs: fakeFs({ 'C:\\Startup': ['Notes.lnk', 'desktop.ini', 'sub/'] }), folders: { user: 'C:\\Startup', common: 'C:\\Common' } });
    const { entries, errors } = await scanner();
    expect(errors).toEqual([]);
    expect(entries.map((entry) => [entry.name, entry.source, entry.status, entry.path])).toEqual([
      ['Discord', 'hkcu-run', 'enabled', 'C:\\Users\\a\\Discord\\Update.exe'],
      ['Tool', 'hklm-run', 'disabled', 'C:\\Program Files\\Tool\\tool.exe'],
      ['Notes', 'startup-folder-user', 'disabled', 'C:\\Startup\\Notes.lnk'],
    ]);
  });

  it('still returns folder entries when the registry query fails', async () => {
    const scanner = createStartupScanner({ run: async () => 'garbage', fs: fakeFs({ 'C:\\Startup': ['A.lnk'] }), folders: { user: 'C:\\Startup', common: null } });
    const { entries, errors } = await scanner();
    expect(entries).toHaveLength(1);
    expect(errors?.[0]?.code).toBe('invalid-output');
  });

  it('parses commands and approval bytes', () => {
    expect(extractExecutablePath('"C:\\A B\\x.exe" -y')).toBe('C:\\A B\\x.exe');
    expect(extractExecutablePath('C:\\Program Files\\x.exe /tray')).toBe('C:\\Program Files\\x.exe');
    expect(extractExecutablePath('')).toBeNull();
    expect(approvedToStatus(undefined)).toBe('enabled');
    expect(approvedToStatus(2)).toBe('enabled');
    expect(approvedToStatus(6)).toBe('enabled');
    expect(approvedToStatus(3)).toBe('disabled');
  });
});

/* ---------- SystemScanner ---------- */

describe('SystemScanner', () => {
  const osInfo = { cpus: () => [{ model: ' Test CPU ' }, { model: 'Test CPU' }], totalmem: () => 16_000, freemem: () => 6_000, release: () => '10.0.26200', version: () => 'Windows 10 Pro', uptime: () => 3600.4 };

  it('combines Node os data with drives, edition and power plan', async () => {
    const run: CommandRunner = async () =>
      JSON.stringify({ drives: [{ id: 'c:', label: 'System', fileSystem: 'NTFS', totalBytes: 100, freeBytes: 40 }, { id: 'weird', totalBytes: 1 }], powerPlan: { instanceId: '{381B4222-F694-41F0-9685-FF5BB260DF2E}', name: 'Ausbalanciert' }, caption: 'Microsoft Windows 11 Pro', build: '26200' });
    const { info, errors } = await createSystemScanner(run, osInfo)();
    expect(errors).toEqual([]);
    expect(info).toEqual({
      cpuModel: 'Test CPU',
      cpuCores: 2,
      totalMemoryBytes: 16_000,
      usedMemoryBytes: 10_000,
      freeMemoryBytes: 6_000,
      windowsVersion: 'Windows 11 Pro',
      windowsBuild: '26200',
      drives: [{ id: 'C:', label: 'System', fileSystem: 'NTFS', totalBytes: 100, freeBytes: 40 }],
      powerPlan: { guid: '381b4222-f694-41f0-9685-ff5bb260df2e', name: 'Ausbalanciert' },
      uptimeSeconds: 3600,
    });
  });

  it('runs the deep query and adds network throughput only in deep mode', async () => {
    const commands: string[] = [];
    const run: CommandRunner = async (id) => {
      commands.push(id);
      return JSON.stringify({ drives: [], powerPlan: null, caption: null, build: null, network: { receivedBytesPerSec: 1000.6, sentBytesPerSec: -5 } });
    };
    const deep = await createSystemScanner(run, osInfo)('deep');
    expect(deep.info.network).toEqual({ receivedBytesPerSec: 1001, sentBytesPerSec: 0 });
    const quick = await createSystemScanner(run, osInfo)('quick');
    expect(quick.info.network).toBeUndefined();
    expect(commands).toEqual(['system-deep', 'system']);
  });

  it('keeps CPU and RAM info when the Windows query fails', async () => {
    const { info, errors } = await createSystemScanner(async () => {
      throw new Error('x');
    }, osInfo)();
    expect(info.cpuCores).toBe(2);
    expect(info.drives).toEqual([]);
    expect(errors?.[0]?.module).toBe('system');
    expect(() => parseSystemOutput('[]')).toThrow();
  });
});

/* ---------- TempFileScanner (real files in a throwaway folder) ---------- */

describe('TempFileScanner', () => {
  let base: string;
  let outside: string;
  let tempRoot: TempRoot;
  const now = new Date();

  async function writeOld(file: string, size: number, ageMs = 3 * DAY) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, Buffer.alloc(size, 1));
    const time = new Date(now.getTime() - ageMs);
    await fs.utimes(file, time, time);
  }

  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), 'void-optimizer-test-'));
    outside = await fs.mkdtemp(path.join(os.tmpdir(), 'void-optimizer-outside-'));
    tempRoot = { location: 'user-temp', label: 'Temp', displayRoot: '%LOCALAPPDATA%\\Temp', path: path.join(base, 'Temp') };
    await writeOld(path.join(base, 'Temp', 'old.tmp'), 1000);
    await writeOld(path.join(base, 'Temp', 'nested', 'deep', 'crash.dmp'), 3000);
    await writeOld(path.join(base, 'Temp', '.hidden-cache'), 200);
    await writeOld(path.join(base, 'Temp', 'fresh.log'), 500, 60 * 1000);
    await writeOld(path.join(outside, 'precious.docx'), 9999);
    // A junction inside Temp pointing outside of it must never be followed.
    await fs.symlink(outside, path.join(base, 'Temp', 'escape'), 'junction');
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  });

  it('deep scan adds error reports and the cache of real browser profiles only', async () => {
    const chrome = path.join(base, 'Google', 'Chrome', 'User Data');
    await fs.mkdir(path.join(chrome, 'Default', 'Cache', 'Cache_Data'), { recursive: true });
    await fs.mkdir(path.join(chrome, 'Profile 2'), { recursive: true });
    await fs.mkdir(path.join(chrome, 'System Profile'), { recursive: true });
    await fs.symlink(outside, path.join(chrome, 'Profile 3'), 'junction');
    const roots = await deepTempRoots(readOnlyFs, base);
    expect(roots.map((root) => root.location)).toEqual(['error-reports', 'browser-cache', 'browser-cache']);
    expect(roots[0]?.path).toBe(path.win32.join(base, 'Microsoft', 'Windows', 'WER'));
    expect(roots.slice(1).map((root) => root.path)).toEqual([path.win32.join(chrome, 'Default', 'Cache', 'Cache_Data'), path.win32.join(chrome, 'Profile 2', 'Cache', 'Cache_Data')]);
    for (const root of roots) expect(isInsideRoot(base, root.path)).toBe(true);
    expect(await deepTempRoots(readOnlyFs, null)).toEqual([]);
  });

  function scanner(extra: Partial<Parameters<typeof createTempFileScanner>[0]> = {}) {
    return createTempFileScanner({ fs: readOnlyFs, allowedBase: base, roots: [tempRoot], now: () => now, ...extra });
  }

  it('measures old files, skips recent ones and never follows junctions', async () => {
    const { locations, errors } = await scanner()();
    expect(errors).toEqual([]);
    const [temp] = locations;
    expect(temp!.candidates.map((candidate) => candidate.relativePath).sort()).toEqual(['.hidden-cache', 'nested\\deep\\crash.dmp', 'old.tmp'].map((p) => p.replace(/\\/g, path.sep)).sort());
    expect(temp!.candidates.reduce((total, candidate) => total + candidate.sizeBytes, 0)).toBe(4200);
    expect(temp!.occupiedBytes).toBe(4700);
    expect(temp!.skipped).toEqual(
      expect.arrayContaining([
        { module: 'temp-files', reason: 'recently-modified', count: 1, bytes: 500 },
        { module: 'temp-files', reason: 'junction-or-link', count: 1, bytes: 0 },
      ]),
    );
    expect(JSON.stringify(temp)).not.toContain('precious');
  });

  it('does not delete, move or change any file', async () => {
    const mutations = ['unlink', 'rm', 'rmdir', 'rename', 'writeFile', 'appendFile', 'copyFile', 'truncate', 'chmod', 'utimes', 'symlink', 'mkdir'] as const;
    const spies = mutations.map((name) => vi.spyOn(fs, name));
    const used = new Set<string>();
    const recording = new Proxy(readOnlyFs, {
      get(target, property, receiver) {
        used.add(String(property));
        return Reflect.get(target, property, receiver);
      },
    });
    const before = readdirSync(path.join(base, 'Temp')).sort();
    await scanner({ fs: recording })();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect([...used].every((name) => ['readdir', 'lstat', 'realpath'].includes(name))).toBe(true);
    expect(readdirSync(path.join(base, 'Temp')).sort()).toEqual(before);
    expect(statSync(path.join(outside, 'precious.docx')).size).toBe(9999);
  });

  it('refuses roots outside the allowed folder or that are links themselves', async () => {
    const outsideRoot = await scanner({ roots: [{ ...tempRoot, path: outside }] })();
    expect(outsideRoot.locations).toEqual([]);
    expect(outsideRoot.errors?.[0]?.code).toBe('unsafe-root');

    await fs.symlink(outside, path.join(base, 'LinkedTemp'), 'junction');
    const linked = await scanner({ roots: [{ ...tempRoot, path: path.join(base, 'LinkedTemp') }] })();
    expect(linked.locations).toEqual([]);
    expect(linked.errors?.[0]?.code).toBe('unsafe-root');

    const traversal = await scanner({ roots: [{ ...tempRoot, path: path.join(base, '..', path.basename(outside)) }] })();
    expect(traversal.errors?.[0]?.code).toBe('unsafe-root');

    expect((await scanner({ allowedBase: null })()).errors?.[0]?.code).toBe('unsafe-root');
  });

  it('treats a missing folder as empty, and stops at the file limit', async () => {
    const missing = await scanner({ roots: [{ ...tempRoot, location: 'crash-dumps', path: path.join(base, 'CrashDumps') }] })();
    expect(missing).toEqual({ locations: [], errors: [] });
    const limited = await scanner({ maxEntries: 2 })();
    expect(limited.locations[0]?.limitReached).toBe(true);
  });

  it('checks path containment case-insensitively and rejects traversal', () => {
    expect(isInsideRoot('C:\\Users\\a\\Temp', 'c:\\users\\A\\temp\\x', path.win32, true)).toBe(true);
    expect(isInsideRoot('C:\\Users\\a\\Temp', 'C:\\Users\\a\\Temp\\..\\Documents', path.win32, true)).toBe(false);
    expect(isInsideRoot('C:\\Users\\a\\Temp', 'C:\\Users\\a\\Temp2\\x', path.win32, true)).toBe(false);
  });
});

/* ---------- Whole backend: no kills, no registry writes, no admin ---------- */

describe('optimizer backend safety', () => {
  it('a full scan, preview and dry run never ends a process or runs anything but the read-only queries', async () => {
    const kill = vi.spyOn(process, 'kill');
    const commands: string[] = [];
    const run: CommandRunner = async (id) => {
      commands.push(id);
      if (id === 'processes') return JSON.stringify([{ name: 'chrome', pid: 99999991, memoryBytes: 900_000_000, cpuPercent: 1, responding: true, sessionId: 1 }]);
      if (id === 'startup') return JSON.stringify({ entries: [{ source: 'hkcu-run', name: 'Discord', command: 'C:\\d.exe', approvedState: null }], folderApproved: [] });
      return JSON.stringify({ drives: [], powerPlan: null, caption: 'Windows 11', build: '1' });
    };
    const noFiles: ReadOnlyFs = { ...readOnlyFs, readdir: (async () => []) as unknown as ReadOnlyFs['readdir'] };
    const api = new OptimizerService({
      scanners: createScannerSuite({
        system: createSystemScanner(run),
        processes: createProcessScanner(run),
        startup: createStartupScanner({ run, fs: noFiles, folders: { user: null, common: null } }),
        tempFiles: async () => ({ locations: [] }),
      }),
      context: { ownProcessNames: ['VOID'] },
    });
    const scan = await api.startScan();
    if (!scan.ok) throw new Error('scan failed');
    const preview = await api.createPreview(scan.value.scanId);
    if (!preview.ok) throw new Error('preview failed');
    const ids = preview.value.recommendations.filter((recommendation) => recommendation.safety !== 'blocked').map((recommendation) => recommendation.id);
    await api.updateSelection(preview.value.previewId, ids);
    await api.validatePreview(preview.value.previewId);
    await api.confirmPreview(preview.value.previewId);
    const result = await api.executeDryRun(preview.value.previewId);
    expect(result.ok && result.value.systemChanges).toBe(0);
    expect(result.ok && result.value.actions.map((action) => action.actionType).sort()).toEqual(['process.end-background', 'startup.disable-entry']);
    expect(kill).not.toHaveBeenCalled();
    expect(new Set(commands)).toEqual(new Set(['processes', 'startup', 'system']));
  });

  it('only dispatches the seven known API functions', async () => {
    const api = new OptimizerService({ scanners: createScannerSuite({ system: async () => ({ info: {} as never }), processes: async () => [], startup: async () => ({ entries: [] }), tempFiles: async () => ({ locations: [] }) }), context: { ownProcessNames: [] } });
    for (const method of ['constructor', 'runValidation', 'findPreview', '__proto__', 'deleteFiles', 42]) {
      const response = await invokeOptimizer(api, method, []);
      expect(response).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    }
    expect((await invokeOptimizer(api, 'getHistory', [])).ok).toBe(true);
  });

  it('contains no code that writes, deletes, kills, edits the registry or elevates', () => {
    const forbidden = [
      /\b(unlink|unlinkSync|rmSync|rmdir|rmdirSync|rename|renameSync|writeFile|writeFileSync|appendFile|copyFile|truncate|chmod|chown|utimes|symlink|mkdir)\s*\(/,
      /process\.kill|\.kill\s*\(/,
      /(?<![.\w])(spawn|exec|execSync|spawnSync|fork)\s*\(/,
      /shell:\s*true/,
      /-Verb\s+RunAs|sudo-prompt|ShellExecute/i,
      /regedit|reg\.exe|Set-ItemProperty|Remove-ItemProperty/i,
    ];
    const dirs = ['src/desktop/optimizer', 'src/domain/optimizer', 'src/features/optimizer'];
    const files = dirs.flatMap((dir) => readdirSync(path.join(root, dir)).filter((name) => /\.tsx?$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')).map((name) => path.join(root, dir, name)));
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of forbidden) expect({ file: path.basename(file), match: pattern.exec(source)?.[0] ?? null }).toEqual({ file: path.basename(file), match: null });
    }
  });

  it('uses the same IPC channels in the backend, main.cjs and preload.cjs', () => {
    const main = readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
    const preload = readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
    for (const [method, channel] of Object.entries(OPTIMIZER_CHANNELS)) {
      expect(main).toContain(`${method}: '${channel}'`);
      expect(preload).toContain(`${method}: '${channel}'`);
    }
    expect(main).toContain(`'${OPEN_TARGET_CHANNEL}'`);
    expect(preload).toContain(`'${OPEN_TARGET_CHANNEL}'`);
    expect(main.match(/void:optimizer-[a-z-]+/g)).toHaveLength(8);
    expect(preload.match(/void:optimizer-[a-z-]+/g)).toHaveLength(8);
  });

  it('one-click open only resolves the fixed target ids, never a path or command', () => {
    const env = { LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local', APPDATA: 'C:\\Users\\x\\AppData\\Roaming', ProgramData: 'C:\\ProgramData', SystemRoot: 'C:\\Windows' };
    expect(resolveOpenTarget('folder:user-temp', env)).toEqual({ kind: 'path', value: 'C:\\Users\\x\\AppData\\Local\\Temp' });
    expect(resolveOpenTarget('folder:error-reports', env)).toEqual({ kind: 'path', value: 'C:\\Users\\x\\AppData\\Local\\Microsoft\\Windows\\WER' });
    expect(resolveOpenTarget('settings:startup-apps', env)).toEqual({ kind: 'uri', value: 'ms-settings:startupapps' });
    expect(resolveOpenTarget('app:task-manager', env)).toEqual({ kind: 'path', value: 'C:\\Windows\\System32\\Taskmgr.exe' });
    expect(resolveOpenTarget('drive:D:', env)).toEqual({ kind: 'path', value: 'D:\\' });
    for (const bad of ['C:\\Windows', 'folder:..\\..', 'folder:user-temp\\..\\..', 'drive:C:\\Windows', 'drive:cd:', 'settings:x', 'ms-settings:startupapps', 'https://example.com', 'cmd.exe /c del', '', null, 42, { id: 'folder:user-temp' }]) {
      expect(resolveOpenTarget(bad, env)).toBeNull();
    }
    expect(resolveOpenTarget('folder:user-temp', {})).toBeNull();
  });

  it('passes the scan mode through IPC and falls back to the quick scan for anything else', async () => {
    const modes: unknown[] = [];
    const api = new OptimizerService({
      scanners: createScannerSuite({
        system: async (mode) => (modes.push(mode), { info: { cpuModel: 'x', cpuCores: 1, totalMemoryBytes: 1, usedMemoryBytes: 0, freeMemoryBytes: 1, windowsVersion: 'w', windowsBuild: '1', drives: [], powerPlan: null, uptimeSeconds: 1 } }),
        processes: async () => [],
        startup: async () => ({ entries: [] }),
        tempFiles: async () => ({ locations: [] }),
      }),
      context: { ownProcessNames: [] },
    });
    const deep = await invokeOptimizer(api, 'startScan', ['deep']);
    expect(deep).toMatchObject({ ok: true, value: { mode: 'deep' } });
    expect(await invokeOptimizer(api, 'startScan', ['rm -rf'])).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(modes).toEqual(['deep']);
  });
});
