// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path));

/** Sizes stored in a Windows .ico file (0 in the directory means 256). */
function icoSizes(buffer: Buffer): number[] {
  expect(buffer.readUInt16LE(0)).toBe(0);
  expect(buffer.readUInt16LE(2)).toBe(1);
  const count = buffer.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => buffer[6 + index * 16] || 256);
}

function pngSize(buffer: Buffer): [number, number] {
  expect(buffer.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}

describe('VOID app icon', () => {
  it('ships a multi-size Windows icon for the EXE, taskbar and shortcuts', () => {
    const sizes = icoSizes(read('build/icon.ico'));
    expect(sizes).toEqual(expect.arrayContaining([16, 24, 32, 48, 256]));
  });

  it('ships PNG versions for the window icon and the build', () => {
    expect(pngSize(read('build/icon.png'))).toEqual([512, 512]);
    expect(pngSize(read('public/icon.png'))).toEqual([256, 256]);
  });

  it('is wired into the desktop build and the Electron window', () => {
    const builder = JSON.parse(read('electron-builder.json').toString('utf8')) as {
      directories: { buildResources: string };
      win: { icon: string; signAndEditExecutable: boolean };
    };
    expect(builder.win.icon).toBe('build/icon.ico');
    expect(existsSync(join(root, builder.win.icon))).toBe(true);
    // Without resource editing electron-builder cannot embed the icon into VOID.exe.
    expect(builder.win.signAndEditExecutable).toBe(true);

    const main = read('electron/main.cjs').toString('utf8');
    expect(main).toMatch(/icon:\s*path\.join\(DIST_DIR, 'icon\.png'\)/);
  });

  it('uses the same mark for the browser tab', () => {
    const html = read('index.html').toString('utf8');
    expect(html).toContain('href="/favicon.svg"');
    expect(html).toContain('href="/icon.png"');
    expect(read('public/favicon.svg').toString('utf8')).toContain('void-ring');
  });
});
