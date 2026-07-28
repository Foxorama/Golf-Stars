// Measure how VIBRANT each world's drawn hole actually is, so "washed out" is a number rather than
// a vibe (GS-cetus-void-glow). Renders one fixed hole per archetype through the real SVG hole
// renderer, rasterises it with the pre-installed Chromium, and reports per world:
//
//   colourfulness — Hasler & Süsstrunk's metric on the drawn pixels (the standard perceptual
//                   "how colourful is this image" index; higher = more vibrant, < ~15 reads grey)
//   chroma        — mean (max−min) channel spread, 0..1: how far off grey the GROUND actually sits
//   sat           — mean HSV saturation
//   val           — mean HSV value (how dark the world sits)
//   glow          — mean value of the brightest 2% of pixels MINUS the mean value: the luminous
//                   headroom a world keeps for its lit rims/emissive accents. A world with no
//                   glow highlights has nothing standing proud of its own base.
//
// Measured on the CENTRE CROP of a CALM (near-start) stop, deliberately: that framing is almost
// entirely playable ground on every world, so the numbers describe the turf the player looks at
// rather than the starfield, the OB stakes and the constellation art around it. A deep stop would
// flatter void/cetus, whose islands leave most of the frame as (very colourful) deep space.
//
// Dev tool only — imports the real render layer via vite, no game logic here.
//
//   node scripts/biome-vibrance.mjs                 → table for every archetype
//   ARCHES=void,cetus node scripts/biome-vibrance.mjs

import { createServer } from 'vite';
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

// One representative theme + biome per archetype (the archetype is resolved off the THEME when
// present, so both must agree or the render falls back to verdant turf).
const WORLDS = [
  ['verdant', 'centaurus', 'verdant-station'],
  ['desert', 'leo', 'dust-belt'],
  ['frost', 'gemini', 'ice-ring'],
  ['inferno', 'orion', 'ember-world'],
  ['void', 'pegasus', 'void-garden'],
  ['crystal', 'triangulum', 'crystal-spires'],
  ['tempest', 'draco', 'tempest-reach'],
  ['fungal', 'lacerta', 'spore-jungle'],
  ['ocean', 'delphinus', 'tidal-archipelago'],
  ['cetus', 'cetus', 'cetus-deep'],
  ['swamp', 'hydra', 'toxic-mire'],
  ['metal', 'pyxis', 'scrap-belt'],
];

const only = process.env.ARCHES ? new Set(process.env.ARCHES.split(',')) : null;
const dist = Number(process.env.DIST ?? 4);
/** Fraction of the frame kept about its centre — the ground, not the sky around it. */
const CROP = 0.55;
const outHtml = join(tmpdir(), 'gs-vibrance.html');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
const { THEMES } = await server.ssrLoadModule('/src/sim/course/themes.ts');

const rows = WORLDS.filter(([a]) => !only || only.has(a));
for (const [arch, themeId] of rows) {
  if (!THEMES.some((t) => t.id === themeId && t.archetype === arch)) {
    throw new Error(`scripts/biome-vibrance: theme '${themeId}' is not archetype '${arch}' — fix the WORLDS table`);
  }
}

let cells = '';
for (const [arch, themeId, biome] of rows) {
  const holes = generateCourse(20260728, { holes: 12, distanceFromStart: dist, biome }).holes;
  const hole = holes.find((h) => h.par === 4) ?? holes[0];
  const map = renderHoleSVG(hole, { width: 320, height: 520, biome, themeId });
  cells += `<div data-arch="${arch}" style="width:320px;height:520px">${map}</div>`;
}
writeFileSync(outHtml, `<!doctype html><html><body style="margin:0;background:#000;display:flex;flex-wrap:wrap">${cells}</body></html>`);

function chromiumCandidates() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', join(homedir(), '.cache', 'ms-playwright')].filter((b) => b && existsSync(b));
  const out = [];
  for (const base of bases) for (const d of readdirSync(base)) {
    if (!d.startsWith('chromium-') || d.includes('headless')) continue;
    const bin = join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(bin)) out.push(bin);
  }
  return out;
}
const { chromium } = await import('playwright-core');
let browser = null;
for (const p of chromiumCandidates()) { try { browser = await chromium.launch({ executablePath: p, args: ['--no-sandbox'] }); break; } catch {} }
if (!browser) { console.log('no chromium available; wrote', outHtml); await server.close(); process.exit(0); }
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
await page.goto('file://' + outHtml);

const stats = [];
for (const [arch] of rows) {
  const buf = await page.locator(`[data-arch="${arch}"]`).screenshot();
  stats.push([arch, await measure(page, buf)]);
}
await browser.close();
await server.close();

// Decode + measure in the page (a canvas is the cheapest PNG decoder to hand).
async function measure(pg, buf) {
  const b64 = buf.toString('base64');
  return pg.evaluate(async ({ data, crop }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const cw = Math.round(c.width * crop), ch = Math.round(c.height * crop);
    const px = ctx.getImageData(Math.round((c.width - cw) / 2), Math.round((c.height - ch) / 2), cw, ch).data;
    const rg = [], yb = [], sats = [], vals = [], chromas = [];
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      rg.push(r - g);
      yb.push(0.5 * (r + g) - b);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      sats.push(mx === 0 ? 0 : (mx - mn) / mx);
      vals.push(mx / 255);
      chromas.push((mx - mn) / 255);
    }
    const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    const sd = (a, m) => Math.sqrt(mean(a.map((x) => (x - m) * (x - m))));
    const mrg = mean(rg), myb = mean(yb);
    const colourfulness = Math.sqrt(sd(rg, mrg) ** 2 + sd(yb, myb) ** 2) + 0.3 * Math.sqrt(mrg * mrg + myb * myb);
    const sorted = vals.slice().sort((a, b2) => b2 - a);
    const top = sorted.slice(0, Math.max(1, Math.round(sorted.length * 0.02)));
    const val = mean(vals);
    return { colourfulness, chroma: mean(chromas), sat: mean(sats), val, glow: mean(top) - val };
  }, { data: b64, crop: CROP });
}

const f = (n, d = 2) => n.toFixed(d).padStart(6);
console.log(`\nBiome vibrance (dist ${dist}) — higher colourfulness/sat = more vibrant, higher glow = more luminous headroom\n`);
console.log('world     colourful chroma    sat    val   glow');
for (const [arch, s] of stats.sort((a, b) => b[1].colourfulness - a[1].colourfulness)) {
  console.log(`${arch.padEnd(9)} ${f(s.colourfulness, 1)} ${f(s.chroma, 3)} ${f(s.sat, 3)} ${f(s.val, 3)} ${f(s.glow, 3)}`);
}
console.log('');
