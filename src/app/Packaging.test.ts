// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path));

describe('desktop packaging (startup performance)', () => {
  const builder = JSON.parse(read('electron-builder.json').toString('utf8')) as {
    files: string[];
    electronLanguages?: string[];
    portable: { splashImage?: string };
  };

  it('ships only the app, not the development dependencies', () => {
    expect(builder.files).toContain('!node_modules/**');
    expect(builder.files).toEqual(expect.arrayContaining(['dist/**', 'electron/**']));
  });

  it('keeps only the needed Chromium languages', () => {
    expect(builder.electronLanguages).toEqual(expect.arrayContaining(['en-US']));
  });

  it('shows a splash image built from the app icon while the portable EXE unpacks', () => {
    expect(builder.portable.splashImage).toBe('build/splash.bmp');
    const splash = read('build/splash.bmp');
    expect(splash.subarray(0, 2).toString('ascii')).toBe('BM');
    expect(splash.readUInt16LE(28)).toBe(24);
  });

  it('shows the window immediately with a loading screen instead of waiting for the app', () => {
    expect(read('electron/main.cjs').toString('utf8')).toMatch(/show:\s*true/);
    expect(read('index.html').toString('utf8')).toContain('Starting VOID');
  });
});

describe('desktop bridge', () => {
  const preload = read('electron/preload.cjs').toString('utf8');
  const main = read('electron/main.cjs').toString('utf8');

  it('exposes only notifications, tray mode, Discord presence and the read-only PC Optimizer to the page', () => {
    expect(preload).toContain("exposeInMainWorld('voidDesktop'");
    expect(preload.match(/ipcRenderer\.(invoke|send)\('([^']+)'/g)).toEqual([
      "ipcRenderer.invoke('void:notify'",
      "ipcRenderer.send('void:set-keep-in-tray'",
      "ipcRenderer.invoke('void:discord-configure'",
      "ipcRenderer.send('void:discord-activity'",
      "ipcRenderer.invoke('void:discord-reconnect'",
      "ipcRenderer.invoke('void:discord-state'",
    ]);
    // Only booleans and a fixed activity name cross the bridge for Discord, never free text.
    expect(preload).toContain("ACTIVITIES = new Set(['idle', 'project', 'code-tester'])");
  });

  it('passes only ids to the PC Optimizer, never paths or commands, and loads its backend on first use', () => {
    expect(preload.match(/ipcRenderer\.invoke\(OPTIMIZER_CHANNELS\.\w+/g)).toHaveLength(7);
    expect(preload).toContain('const asIds = (values) => (Array.isArray(values) ? values.slice(0, 500).map(asId) : []);');
    expect(main.indexOf("require('./generated/optimizerBackend.cjs')")).toBeGreaterThan(main.indexOf('function getOptimizer'));
    expect(main).toContain('args.slice(0, 2)');
  });

  it('refreshes the Start menu shortcut after the EXE was replaced, so Windows reloads the icon', () => {
    expect(main).toContain('exeIsNewer');
    expect(main).toMatch(/icon: target, iconIndex: 0/);
  });

  it('ships the Discord module and loads it only on first use', () => {
    expect(main).toContain("require('./discordPresence.cjs')");
    expect(main.indexOf("require('./discordPresence.cjs')")).toBeGreaterThan(main.indexOf('function getDiscordPresence'));
    expect(main).toContain('discordPresence?.dispose()');
  });

  it('keeps the renderer sandboxed and accepts bridge calls only from the bundled app', () => {
    expect(main).toMatch(/contextIsolation:\s*true/);
    expect(main).toMatch(/nodeIntegration:\s*false/);
    expect(main).toMatch(/sandbox:\s*true/);
    expect(main).toContain('if (!fromApp(event)');
  });
});
