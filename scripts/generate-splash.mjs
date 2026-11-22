// Generates build/splash.bmp: the picture the portable EXE shows while it unpacks
// itself (before Electron starts). It reuses the confirmed app icon unchanged,
// centred on the app's background colour. Pure Node.js (zlib only):
//
//   node scripts/generate-splash.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WIDTH = 360;
const HEIGHT = 240;
const ICON_SIZE = 128;
const BACKGROUND = [0x08, 0x08, 0x0b];

/** Decodes an 8-bit RGBA, non-interlaced PNG (the format generate-icons.mjs writes). */
function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      if (chunk[8] !== 8 || chunk[9] !== 6 || chunk[12] !== 0) throw new Error('Expected an 8-bit RGBA, non-interlaced PNG.');
    } else if (type === 'IDAT') data.push(chunk);
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  return { width, height, pixels };
}

/** Box-filter downscale by an integer factor, premultiplied so the edges stay clean. */
function iconPixel(icon, factor, x, y) {
  const sum = [0, 0, 0, 0];
  for (let dy = 0; dy < factor; dy += 1)
    for (let dx = 0; dx < factor; dx += 1) {
      const index = ((y * factor + dy) * icon.width + x * factor + dx) * 4;
      const alpha = icon.pixels[index + 3] / 255;
      sum[0] += icon.pixels[index] * alpha;
      sum[1] += icon.pixels[index + 1] * alpha;
      sum[2] += icon.pixels[index + 2] * alpha;
      sum[3] += alpha;
    }
  const count = factor * factor;
  return { rgb: sum.slice(0, 3).map((value) => value / count), alpha: sum[3] / count };
}

const icon = decodePng(readFileSync(join(root, 'build', 'icon.png')));
const factor = icon.width / ICON_SIZE;
if (!Number.isInteger(factor)) throw new Error('The icon size must be a multiple of the splash icon size.');

// 24-bit BMP, rows bottom-up, each padded to 4 bytes.
const rowSize = Math.ceil((WIDTH * 3) / 4) * 4;
const file = Buffer.alloc(54 + rowSize * HEIGHT);
file.write('BM', 0, 'ascii');
file.writeUInt32LE(file.length, 2);
file.writeUInt32LE(54, 10);
file.writeUInt32LE(40, 14);
file.writeInt32LE(WIDTH, 18);
file.writeInt32LE(HEIGHT, 22);
file.writeUInt16LE(1, 26);
file.writeUInt16LE(24, 28);
file.writeUInt32LE(rowSize * HEIGHT, 34);

const left = (WIDTH - ICON_SIZE) / 2;
const top = (HEIGHT - ICON_SIZE) / 2;
for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    let color = BACKGROUND;
    const ix = x - left;
    const iy = y - top;
    if (ix >= 0 && iy >= 0 && ix < ICON_SIZE && iy < ICON_SIZE) {
      const { rgb, alpha } = iconPixel(icon, factor, ix, iy);
      color = BACKGROUND.map((background, channel) => Math.round(rgb[channel] + background * (1 - alpha)));
    }
    const index = 54 + (HEIGHT - 1 - y) * rowSize + x * 3;
    file[index] = color[2];
    file[index + 1] = color[1];
    file[index + 2] = color[0];
  }
}

writeFileSync(join(root, 'build', 'splash.bmp'), file);
console.log(`build/splash.bmp written (${WIDTH}×${HEIGHT}).`);
