// Generates /have-your-agent-call-my-agent.svg: a lofi pixel render of the
// embroidery on the cap Bluefish handed out at Cannes, in the style of
// country-site's pixel globe — crisp pixel-grid SVG in monochrome ink,
// following prefers-color-scheme.
//
//   node script/generate-lofi.js
//
// Pipeline: crop/downsample the photo to a 360-wide grid, erode the bright
// embroidery one pixel to thin the strokes, dither, keep only full-strength
// ink, repair letters the thinning broke, then downsample 2x for chunkier
// pixels.
//
// Uses macOS sips to crop and downsample the source photo.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const SOURCE = path.join(__dirname, "have-your-agent-call-my-agent.jpg");
const DEST = path.join(__dirname, "..", "have-your-agent-call-my-agent.svg");

const BAND_W = 920, BAND_H = 380; // center crop of the text band (source px)
const GRID_W = 360; // working pixel grid width; height follows the band aspect
const DITHER = 0.45; // error-diffusion strength; lower = fewer fabric specks
const INK_LIGHT = "#171717";
const INK_DARK = "#e5e5e5";
const LEVELS = 3; // dither levels; only the top (full ink) level is kept
const FLOOR = 0.5; // normalized brightness below this drops out (fabric)
const CEIL = 0.95; // normalized brightness above this is full ink (thread)
const ERODE = 1; // erosion passes: shave the letterforms thinner
const EIGHT = true; // erode with the full 8-neighborhood (stronger than 4)
const SCALE = 2; // final pixelation: output pixels are SCALE x working pixels
const COVERAGE = 0.35; // output pixel is ink if this fraction of its block is

// Letters the erosion + solid-ink cut breaks get their sub-threshold pixels
// promoted back to full ink inside these boxes (working-grid coords).
const REPAIRS = [
  { x0: 335, x1: 341, y0: 49, y1: 64 }, // t stem, first "agent"
];

// Crop to the text band and downsample to the pixel grid via sips.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lofi-"));
const band = path.join(tmp, "band.jpg");
const bmp = path.join(tmp, "grid.bmp");
const gridH = Math.round((GRID_W * BAND_H) / BAND_W);
execFileSync("sips", ["-c", String(BAND_H), String(BAND_W), SOURCE, "--out", band], { stdio: "ignore" });
execFileSync("sips", ["-z", String(gridH), String(GRID_W), "-s", "format", "bmp", band, "--out", bmp], { stdio: "ignore" });

// Minimal BMP parser (BITMAPINFOHEADER, bottom-up, 24/32 bpp)
const buf = fs.readFileSync(bmp);
const dataOffset = buf.readUInt32LE(10);
const width = buf.readInt32LE(18);
let height = buf.readInt32LE(22);
const bpp = buf.readUInt16LE(28);
const bottomUp = height > 0;
height = Math.abs(height);
const bytesPP = bpp / 8;
const rowSize = Math.ceil((width * bpp) / 32) * 4;

function grayAt(x, y) {
  const row = bottomUp ? height - 1 - y : y;
  const off = dataOffset + row * rowSize + x * bytesPP;
  const b = buf[off], g = buf[off + 1], r = buf[off + 2];
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

const grays = [];
for (let y = 0; y < height; y++) {
  const row = [];
  for (let x = 0; x < width; x++) row.push(grayAt(x, y));
  grays.push(row);
}

// Grayscale erosion: each pass replaces every pixel with the darkest value
// in its neighborhood, shaving the bright embroidery from the outside in so
// the strokes get geometrically thinner (not just lighter).
const NEIGH = EIGHT
  ? [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
  : [[0, -1], [-1, 0], [1, 0], [0, 1]];
for (let pass = 0; pass < ERODE; pass++) {
  const prev = grays.map((row) => row.slice());
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let m = prev[y][x];
      for (const [dx, dy] of NEIGH) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && prev[ny][nx] < m) m = prev[ny][nx];
      }
      grays[y][x] = m;
    }
  }
}

// Normalize brightness to ink levels: 5th percentile (fabric) -> 0,
// 95th percentile (brightest thread) -> LEVELS.
const sorted = grays.flat().sort((a, b) => a - b);
const lo = sorted[Math.floor(sorted.length * 0.05)];
const hi = sorted[Math.floor(sorted.length * 0.95)];
// Window the tones: fabric (below FLOOR) drops out, bright thread (above
// CEIL) saturates to full ink.
const norm = (g) => Math.max(0, Math.min(1, (g - lo) / (hi - lo)));
const inkness = (g) =>
  Math.max(0, Math.min(1, (norm(g) - FLOOR) / (CEIL - FLOOR)));

// Atkinson error diffusion, quantizing to LEVELS+1 tones. Only the top
// level survives, but dithering still decides which edge pixels reach it.
const work = grays.map((row) => row.map((g) => inkness(g) * LEVELS));
const cells = grays.map((row) => row.map(() => 0));
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const q = Math.max(0, Math.min(LEVELS, Math.round(work[y][x])));
    cells[y][x] = q;
    const err = ((work[y][x] - q) / 8) * DITHER;
    for (const [dx, dy] of [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny < height) work[ny][nx] += err;
    }
  }
}

// Second pass: the fabric weave, dithered on its own channel. The speckle
// itself is discarded by the solid-ink cut below, but inside the repair
// boxes it still counts as ink, so it stays part of the recipe.
const BG = 0.92; // background speckle density
const bgWork = grays.map((row) => row.map((g) => norm(g) * BG));
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const q = bgWork[y][x] > 0.5 ? 1 : 0;
    if (q && cells[y][x] === 0) cells[y][x] = 1;
    const err = (bgWork[y][x] - q) / 8;
    for (const [dx, dy] of [[1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < width && ny < height) bgWork[ny][nx] += err;
    }
  }
}

// Solid ink only: keep full-strength pixels, except inside the repair boxes,
// where any ink at all is promoted — the thread is there in the source,
// just below full brightness.
const solid = cells.map((row, y) =>
  row.map((q, x) => {
    if (q === LEVELS) return true;
    return REPAIRS.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && q > 0);
  })
);

// Final pixelation: downsample by SCALE via area coverage. An output pixel
// is ink when at least COVERAGE of the working pixels beneath it are.
const outW = Math.round(width / SCALE);
const outH = Math.round(height / SCALE);
const rects = [];
for (let py = 0; py < outH; py++) {
  const row = [];
  for (let px = 0; px < outW; px++) {
    let ink = 0, area = 0;
    for (let sy = py * SCALE; sy < Math.min(height, (py + 1) * SCALE); sy++) {
      for (let sx = px * SCALE; sx < Math.min(width, (px + 1) * SCALE); sx++) {
        area++;
        if (solid[sy][sx]) ink++;
      }
    }
    row.push(area > 0 && ink / area >= COVERAGE);
  }
  let px = 0;
  while (px < outW) {
    if (!row[px]) { px++; continue; }
    let w = 1;
    while (px + w < outW && row[px + w]) w++;
    rects.push(`    <rect x="${px}" y="${py}" width="${w}" height="1"/>`);
    px += w;
  }
}

const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${outW} ${outH}" shape-rendering="crispEdges">`,
  `  <style>`,
  `    rect { fill: ${INK_LIGHT} }`,
  `    @media (prefers-color-scheme: dark) { rect { fill: ${INK_DARK} } }`,
  `  </style>`,
  ...rects,
  `</svg>`,
  "",
].join("\n");

fs.writeFileSync(DEST, svg);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Wrote ${DEST} (${outW}x${outH}, ${rects.length} rects)`);
