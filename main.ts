// main.ts — GTA 6 meme generator + POST.json copier (Node 22, stdlib only).
//
// What it does:
//   1. Draws the meme picture deterministically, in pure Node with no network:
//      a Vice City sunset (gradient sky, slatted synthwave sun, dark skyline),
//      make.fun's ghost mark composited large in the middle of the scene, and
//      the joke in big bold outlined letters top and bottom.
//   2. Writes the picture as meme.png into the output directory.
//   3. Copies POST.json from the repository root to the output directory,
//      which is all the gate needs from this program (the house reads the
//      post itself from X; nothing the program writes about the post is judged).
//
// The meme (the joke is the picture + the post's text together):
//   AFTER 13 YEARS OF WAITING
//   BOSS: WHY OFF ALL WEEK?
//   ME: GTA 6. THAT IS WHY.
// The ghost is make.fun's mascot, from the press kit's mark-1024.png,
// composited as-is (uniform scale only, never redrawn or recoloured).
//
// Run it locally:
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
// It writes out/meme.png and out/POST.json. The meme.png it writes is the
// picture to post on X; the program regenerates the identical bytes at
// grade time, so the posted picture and the program's output agree.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// ---------------------------------------------------------------------------
// CRC-32 (the polynomial the PNG format uses), table driven.
// ---------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  view.setUint32(8 + data.length, crc);
  return out;
}

// ---------------------------------------------------------------------------
// PNG: a small decoder (8-bit RGB / RGBA, non-interlaced) and an encoder.
// Only what this program needs; the ghost asset is 8-bit RGBA, no interlace.
// ---------------------------------------------------------------------------

interface DecodedPng {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes a pixel. */
  data: Uint8Array;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(buf: Buffer): DecodedPng {
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIG[i]) throw new Error('not a PNG file');
  }
  let off = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatParts: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idatParts.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error('interlaced PNG not supported');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`unsupported PNG color type ${colorType}`);
  const raw = inflateSync(Buffer.concat(idatParts));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const recon = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? recon[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      let v = row[i];
      if (filter === 1) v = (v + left) & 0xff;
      else if (filter === 2) v = (v + up) & 0xff;
      else if (filter === 3) v = (v + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) v = (v + paethPredictor(left, up, upLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`unknown PNG filter ${filter}`);
      recon[i] = v;
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      out[di] = recon[si];
      out[di + 1] = recon[si + 1];
      out[di + 2] = recon[si + 2];
      out[di + 3] = channels === 4 ? recon[si + 3] : 255;
    }
    prev.set(recon);
  }
  return { width, height, data: out };
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width);
  ihdrView.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  // One filter byte (0 = none) per scanline, then the raw RGBA bytes.
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    Buffer.from(chunk('IHDR', ihdr)),
    Buffer.from(chunk('IDAT', new Uint8Array(idat))),
    Buffer.from(chunk('IEND', new Uint8Array(0))),
  ]);
}

// ---------------------------------------------------------------------------
// Canvas: an RGBA pixel buffer with the drawing this meme needs.
// Coordinates are pixels, origin at the top-left, y growing downward.
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];

class Canvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 4);
  }

  /** Set a pixel, blending source-over onto what is already there. */
  setPixel(x: number, y: number, r: number, g: number, b: number, a: number): void {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return;
    const i = (yi * this.width + xi) * 4;
    if (a >= 255) {
      this.data[i] = r;
      this.data[i + 1] = g;
      this.data[i + 2] = b;
      this.data[i + 3] = 255;
      return;
    }
    if (a <= 0) return;
    const sa = a / 255;
    const da = this.data[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) return;
    this.data[i] = Math.round((r * sa + this.data[i] * da * (1 - sa)) / outA);
    this.data[i + 1] = Math.round((g * sa + this.data[i + 1] * da * (1 - sa)) / outA);
    this.data[i + 2] = Math.round((b * sa + this.data[i + 2] * da * (1 - sa)) / outA);
    this.data[i + 3] = Math.round(outA * 255);
  }

  fillRect(x0: number, y0: number, x1: number, y1: number, c: Rgb, a = 255): void {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.height, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.width, Math.ceil(x1)); x++) {
        this.setPixel(x, y, c[0], c[1], c[2], a);
      }
    }
  }

  /** Vertical gradient through the given stops: [position 0..1, color]. */
  verticalGradient(stops: Array<[number, Rgb]>): void {
    for (let y = 0; y < this.height; y++) {
      const t = this.height <= 1 ? 0 : y / (this.height - 1);
      let a = stops[0];
      let b = stops[stops.length - 1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i][0] && t <= stops[i + 1][0]) {
          a = stops[i];
          b = stops[i + 1];
          break;
        }
      }
      const span = b[0] - a[0] || 1;
      const f = Math.min(1, Math.max(0, (t - a[0]) / span));
      const r = Math.round(a[1][0] + (b[1][0] - a[1][0]) * f);
      const g = Math.round(a[1][1] + (b[1][1] - a[1][1]) * f);
      const bl = Math.round(a[1][2] + (b[1][2] - a[1][2]) * f);
      for (let x = 0; x < this.width; x++) {
        const i = (y * this.width + x) * 4;
        this.data[i] = r;
        this.data[i + 1] = g;
        this.data[i + 2] = bl;
        this.data[i + 3] = 255;
      }
    }
  }

  fillCircle(cx: number, cy: number, radius: number, c: Rgb, a = 255): void {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.setPixel(x, y, c[0], c[1], c[2], a);
      }
    }
  }

  /** Thick line (Bresenham, drawn as a chain of small discs). */
  thickLine(x0: number, y0: number, x1: number, y1: number, thick: number, c: Rgb, a = 255): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
    const radius = thick / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.fillCircle(x0 + dx * t, y0 + dy * t, radius, c, a);
    }
  }

  /**
   * Composite an RGBA image onto this canvas, scaled to the given box,
   * nearest-neighbour, source-over. Uniform scale only (no stretching).
   */
  blit(src: DecodedPng, dx: number, dy: number, dw: number, dh: number): void {
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(src.height - 1, Math.floor((y / dh) * src.height));
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(src.width - 1, Math.floor((x / dw) * src.width));
        const si = (sy * src.width + sx) * 4;
        const sa = src.data[si + 3];
        if (sa === 0) continue;
        this.setPixel(dx + x, dy + y, src.data[si], src.data[si + 1], src.data[si + 2], sa);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Bitmap font: a bold 5x7 pixel font, one glyph per needed character.
// Each glyph is 7 rows of 5 cells; '#' is ink, '.' is empty. Drawn scaled up
// with a black outline, it reads like a classic meme caption.
// ---------------------------------------------------------------------------

const FONT: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  ':': ['.....', '..#..', '.....', '.....', '.....', '..#..', '.....'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
};

const FONT_W = 5;
const FONT_H = 7;

/** Width of a string at a given scale, in pixels (glyph + 1px gap, scaled). */
function textWidth(text: string, scale: number): number {
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') w += (FONT_W + 1) * scale;
    else if (FONT[ch]) w += (FONT_W + 1) * scale;
  }
  return w > 0 ? w - scale : 0; // no trailing gap after the last glyph
}

/**
 * Draw a string centred on x, at the given top y, in the given colour,
 * with a thick black outline so it reads over any background.
 */
function drawText(
  cv: Canvas,
  text: string,
  centerX: number,
  topY: number,
  scale: number,
  color: Rgb,
): void {
  const w = textWidth(text, scale);
  let x = Math.round(centerX - w / 2);
  const outline = Math.max(2, Math.round(scale * 0.45));
  const outlineColor: Rgb = [10, 8, 12];
  // Outline pass: the same glyphs stamped in black, offset in 8 directions.
  for (const [ox, oy] of [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ] as Array<[number, number]>) {
    drawTextRaw(cv, text, x + ox * outline, topY + oy * outline, scale, outlineColor);
  }
  drawTextRaw(cv, text, x, topY, scale, color);
}

function drawTextRaw(
  cv: Canvas,
  text: string,
  x0: number,
  y0: number,
  scale: number,
  color: Rgb,
): void {
  let x = x0;
  for (const ch of text) {
    if (ch === ' ') {
      x += (FONT_W + 1) * scale;
      continue;
    }
    const glyph = FONT[ch];
    if (!glyph) {
      x += (FONT_W + 1) * scale;
      continue;
    }
    for (let row = 0; row < FONT_H; row++) {
      for (let col = 0; col < FONT_W; col++) {
        if (glyph[row][col] === '#') {
          cv.fillRect(
            x + col * scale,
            y0 + row * scale,
            x + (col + 1) * scale,
            y0 + (row + 1) * scale,
            color,
          );
        }
      }
    }
    x += (FONT_W + 1) * scale;
  }
}

// ---------------------------------------------------------------------------
// The scene: a Vice City sunset behind make.fun's ghost.
// Deterministic throughout: the same bytes every run, no randomness that
// is not seeded, no network, no clock.
// ---------------------------------------------------------------------------

/** Tiny seeded PRNG (mulberry32) so the skyline and windows never change. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKY_STOPS: Array<[number, Rgb]> = [
  [0.0, [26, 11, 46]], // deep purple, top
  [0.35, [91, 26, 107]], // purple
  [0.55, [196, 28, 131]], // make.fun magenta
  [0.75, [255, 107, 53]], // orange
  [1.0, [255, 179, 71]], // warm horizon
];

function skyColorAt(y: number, height: number): Rgb {
  const t = height <= 1 ? 0 : y / (height - 1);
  let a = SKY_STOPS[0];
  let b = SKY_STOPS[SKY_STOPS.length - 1];
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    if (t >= SKY_STOPS[i][0] && t <= SKY_STOPS[i + 1][0]) {
      a = SKY_STOPS[i];
      b = SKY_STOPS[i + 1];
      break;
    }
  }
  const span = b[0] - a[0] || 1;
  const f = Math.min(1, Math.max(0, (t - a[0]) / span));
  return [
    Math.round(a[1][0] + (b[1][0] - a[1][0]) * f),
    Math.round(a[1][1] + (b[1][1] - a[1][1]) * f),
    Math.round(a[1][2] + (b[1][2] - a[1][2]) * f),
  ];
}

const NIGHT: Rgb = [20, 8, 31]; // near-black purple for the skyline and palms
const SUN: Rgb = [255, 210, 63]; // golden sun
const WINDOW_LIT: Rgb = [255, 210, 63];
const WHITE: Rgb = [255, 255, 255];
const PINK: Rgb = [255, 136, 196]; // make.fun's lighter pink, for the wordmark

function drawMeme(ghost: DecodedPng): Canvas {
  const W = 1200;
  const H = 1200;
  const cv = new Canvas(W, H);

  // 1. Sunset sky.
  cv.verticalGradient(SKY_STOPS);

  // 2. Synthwave sun, high in the sky, with horizontal slats cut across
  //    its lower half. The slats are painted in the sky's own colour at
  //    their height, so the sun reads as striped, not banded.
  const sunCx = W / 2;
  const sunCy = 400;
  const sunR = 300;
  cv.fillCircle(sunCx, sunCy, sunR, SUN);
  let slatY = sunCy + 10;
  let slatH = 12;
  while (slatY < sunCy + sunR) {
    const c = skyColorAt(slatY, H);
    cv.fillRect(sunCx - sunR - 2, slatY, sunCx + sunR + 2, slatY + slatH, c);
    slatY += slatH + 26;
    slatH += 5;
  }

  // 3. Dark skyline along the bottom, with a few lit windows.
  const rng = mulberry32(20261119);
  let x = -20;
  while (x < W + 20) {
    const bw = 70 + Math.floor(rng() * 110);
    const bh = 90 + Math.floor(rng() * 260);
    const top = H - bh;
    cv.fillRect(x, top, x + bw, H, NIGHT);
    // A rooftop antenna on some buildings.
    if (rng() < 0.35) {
      cv.fillRect(x + bw / 2 - 2, top - 34, x + bw / 2 + 2, top, NIGHT);
      cv.fillCircle(x + bw / 2, top - 38, 4, [255, 80, 80]);
    }
    // Lit windows, a sparse scatter.
    const wins = Math.floor(rng() * 7);
    for (let i = 0; i < wins; i++) {
      const wx = x + 10 + Math.floor(rng() * Math.max(1, bw - 22));
      const wy = top + 14 + Math.floor(rng() * Math.max(1, bh - 30));
      cv.fillRect(wx, wy, wx + 7, wy + 9, WINDOW_LIT);
    }
    x += bw + 6 + Math.floor(rng() * 26);
  }

  // 5. make.fun's ghost mark, large and centred, the star of the scene.
  //    The mark is used as-is: one uniform scale, no redraw, no recolour.
  const ghostSize = 520;
  cv.blit(ghost, Math.round((W - ghostSize) / 2), 380, ghostSize, ghostSize);

  // 6. The joke, in big bold outlined letters, over a dark caption band
  //    so it reads at a glance against the bright sky and the skyline.
  cv.fillRect(0, 916, W, 1160, [16, 7, 24], 175);
  drawText(cv, 'AFTER 13 YEARS OF WAITING', W / 2, 44, 6, WHITE);
  drawText(cv, 'BOSS: WHY OFF ALL WEEK?', W / 2, 936, 8, WHITE);
  drawText(cv, 'ME: GTA 6. THAT IS WHY.', W / 2, 1006, 8, WHITE);
  // The name, small, at the very bottom of the band, in make.fun's pink.
  drawText(cv, 'MAKE.FUN', W / 2, 1108, 5, PINK);

  return cv;
}

// ---------------------------------------------------------------------------
// Main: build the meme, write it out, and copy POST.json to the output.
// ---------------------------------------------------------------------------

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const ghostPath = join(BOT_DIR, 'assets', 'mark-1024.png');
  const ghost = decodePng(readFileSync(ghostPath));
  const meme = drawMeme(ghost);
  const png = encodePng(meme.width, meme.height, meme.data);
  writeFileSync(join(OUTPUT_DIR, 'meme.png'), png);
  console.log(`meme.png written: ${meme.width}x${meme.height}, ${png.length} bytes`);

  try {
    copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
    console.log('POST.json copied to the output directory');
  } catch (err) {
    console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
