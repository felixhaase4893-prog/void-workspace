// Generates the VOID app icon in every format the app and the Windows build need.
// Pure Node.js (zlib only), so it needs no image libraries:
//
//   node scripts/generate-icons.mjs
//
// Output:
//   build/icon.ico      Windows EXE, taskbar and desktop shortcut (16–256 px)
//   build/icon.png      512 px master (electron-builder fallback, docs)
//   public/icon.png     256 px, used as the window icon and apple-touch icon
//   public/favicon.svg  vector version for the browser tab and the in-app logo
//
// The mark: a dark tile with a broken orbit ring and one bright particle
// escaping through the gap — "something leaving the void".
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- Geometry (unit square, y grows downwards) ---------- */

const TILE = { inset: 0.04, radius: 0.2 };
const RING = { radius: 0.27, gapFrom: -75, gapTo: -5 };
const PARTICLE_ANGLE = -40;

const COLORS = {
  tileTop: [0x1c, 0x1b, 0x27],
  tileBottom: [0x07, 0x07, 0x0a],
  edge: [0x34, 0x32, 0x46],
  ringStart: [0xc4, 0xbb, 0xff],
  ringEnd: [0x63, 0x52, 0xdc],
  core: [0x02, 0x02, 0x04],
  particle: [0xf4, 0xf3, 0xff],
};

/** Small icons get a bolder ring and particle so they stay readable at 16 px. */
function shapeFor(size) {
  if (size <= 20) return { thickness: 0.13, particle: 0.085, edge: 0 };
  if (size <= 32) return { thickness: 0.11, particle: 0.072, edge: 0 };
  if (size <= 64) return { thickness: 0.095, particle: 0.064, edge: 0.012 };
  return { thickness: 0.085, particle: 0.058, edge: 0.008 };
}

const deg = (value) => (value * Math.PI) / 180;
const mix = (a, b, t) => a.map((channel, index) => channel + (b[index] - channel) * t);

function roundedRectDistance(x, y) {
  const half = 0.5 - TILE.inset;
  const qx = Math.abs(x - 0.5) - (half - TILE.radius);
  const qy = Math.abs(y - 0.5) - (half - TILE.radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - TILE.radius;
}

function polar(angle, radius) {
  return [0.5 + Math.cos(deg(angle)) * radius, 0.5 + Math.sin(deg(angle)) * radius];
}

function inRing(x, y, thickness) {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const distance = Math.hypot(dx, dy);
  const half = thickness / 2;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const inGap = angle > RING.gapFrom && angle < RING.gapTo;
  if (!inGap && Math.abs(distance - RING.radius) <= half) return true;
  // Rounded caps at both ends of the gap.
  for (const end of [RING.gapFrom, RING.gapTo]) {
    const [cx, cy] = polar(end, RING.radius);
    if (Math.hypot(x - cx, y - cy) <= half) return true;
  }
  return false;
}

/** Colour of one sample point as [r, g, b, a] (straight alpha, 0–255 / 0–1). */
function sample(x, y, shape) {
  const tile = roundedRectDistance(x, y);
  if (tile > 0) return [0, 0, 0, 0];

  let color = mix(COLORS.tileTop, COLORS.tileBottom, Math.min(1, Math.max(0, (y - TILE.inset) / (1 - 2 * TILE.inset))));
  if (shape.edge > 0 && tile > -shape.edge) color = mix(color, COLORS.edge, 0.85);

  // A slightly darker core makes the centre read as "empty space".
  const distance = Math.hypot(x - 0.5, y - 0.5);
  if (distance < RING.radius - shape.thickness / 2) color = mix(color, COLORS.core, 0.55 * (1 - distance / RING.radius));

  if (inRing(x, y, shape.thickness)) {
    const t = Math.min(1, Math.max(0, ((x - 0.5) * 0.6 + (y - 0.5) + 0.35) / 0.7));
    color = mix(COLORS.ringStart, COLORS.ringEnd, t);
  }

  const [px, py] = polar(PARTICLE_ANGLE, RING.radius);
  if (Math.hypot(x - px, y - py) <= shape.particle) color = COLORS.particle;

  return [...color, 1];
}

/** Renders the icon with 4×4 (8×8 for tiny sizes) supersampling. Returns RGBA bytes. */
function render(size) {
  const shape = shapeFor(size);
  const grid = size <= 32 ? 8 : 4;
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < grid; sy += 1) {
        for (let sx = 0; sx < grid; sx += 1) {
          const [cr, cg, cb, ca] = sample((px + (sx + 0.5) / grid) / size, (py + (sy + 0.5) / grid) / size, shape);
          r += cr * ca;
          g += cg * ca;
          b += cb * ca;
          a += ca;
        }
      }
      const offset = (py * size + px) * 4;
      const count = grid * grid;
      pixels[offset] = a ? Math.round(r / a) : 0;
      pixels[offset + 1] = a ? Math.round(g / a) : 0;
      pixels[offset + 2] = a ? Math.round(b / a) : 0;
      pixels[offset + 3] = Math.round((a / count) * 255);
    }
  }
  return pixels;
}

/* ---------- PNG ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- ICO ---------- */

/** Classic 32-bit DIB entry (BGRA, bottom-up, empty AND mask) — understood by every Windows tool, including NSIS. */
function encodeDib(size, rgba) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR + AND mask
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const from = (y * size + x) * 4;
      const to = ((size - 1 - y) * size + x) * 4;
      pixels[to] = rgba[from + 2];
      pixels[to + 1] = rgba[from + 1];
      pixels[to + 2] = rgba[from];
      pixels[to + 3] = rgba[from + 3];
    }
  }
  const maskRow = Math.ceil(size / 32) * 4;
  return Buffer.concat([header, pixels, Buffer.alloc(maskRow * size)]);
}

function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.data)]);
}

/* ---------- SVG ---------- */

function svg() {
  const shape = shapeFor(512);
  const s = (value) => +(value * 32).toFixed(3);
  const [ax, ay] = polar(RING.gapTo, RING.radius);
  const [bx, by] = polar(RING.gapFrom, RING.radius);
  const [px, py] = polar(PARTICLE_ANGLE, RING.radius);
  const inset = TILE.inset * 32;
  const hex = (rgb) => `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="void-tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hex(COLORS.tileTop)}"/>
      <stop offset="1" stop-color="${hex(COLORS.tileBottom)}"/>
    </linearGradient>
    <linearGradient id="void-ring" x1="0.2" y1="0.15" x2="0.8" y2="0.9">
      <stop offset="0" stop-color="${hex(COLORS.ringStart)}"/>
      <stop offset="1" stop-color="${hex(COLORS.ringEnd)}"/>
    </linearGradient>
  </defs>
  <rect x="${inset}" y="${inset}" width="${32 - 2 * inset}" height="${32 - 2 * inset}" rx="${TILE.radius * 32}" fill="url(#void-tile)" stroke="${hex(COLORS.edge)}" stroke-width="0.4"/>
  <path d="M${s(ax)} ${s(ay)}A${s(RING.radius)} ${s(RING.radius)} 0 1 1 ${s(bx)} ${s(by)}" fill="none" stroke="url(#void-ring)" stroke-width="${s(shape.thickness)}" stroke-linecap="round"/>
  <circle cx="${s(px)}" cy="${s(py)}" r="${s(shape.particle)}" fill="${hex(COLORS.particle)}"/>
</svg>
`;
}

/* ---------- Write files ---------- */

function write(relativePath, data) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
  console.log(`wrote ${relativePath} (${data.length} bytes)`);
}

const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const icoImages = ICO_SIZES.map((size) => {
  const rgba = render(size);
  // 256 px is stored as PNG (standard for Vista+), the rest as classic bitmaps.
  return { size, data: size >= 256 ? encodePng(size, rgba) : encodeDib(size, rgba) };
});

write('build/icon.ico', encodeIco(icoImages));
write('build/icon.png', encodePng(512, render(512)));
write('public/icon.png', encodePng(256, render(256)));
write('public/favicon.svg', svg());
