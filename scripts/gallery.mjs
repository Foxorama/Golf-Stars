// Rasterise a biome×theme×seed gallery of the static SVG hole renderer to a PNG, so the world look
// (deep-space backdrop, floating landmass, constellation sky, cell-shaded turf) can be eyeballed
// after a `src/render/style.ts` / `palette.ts` change — the project's "re-shoot the gallery" rule
// (CLAUDE.md, Render layer). Pure dev tool: imports the real TS render layer via vite-node and
// screenshots it with the pre-installed Chromium. No game logic here.
//
//   node scripts/gallery.mjs            → writes the PNG to the OS temp dir, prints the path
//   GALLERY_OUT=/path/out.png node ...  → writes there instead

import { createServer } from 'vite';
import { writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outPng = process.env.GALLERY_OUT ?? join(tmpdir(), 'gs-gallery.png');
const outHtml = join(tmpdir(), 'gs-gallery.html');

// Find the pre-installed Chromium (versioned dir; the binary, not just the cache folder).
async function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  const { readdirSync } = await import('node:fs');
  for (const d of readdirSync(base)) {
    if (!d.startsWith('chromium-') || d.includes('headless')) continue;
    const bin = join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(bin)) return bin;
  }
  return null;
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');

// One representative real constellation per archetype (so the figure shows), across a couple of seeds.
const cases = [
  { biome: 'verdant-station', themeId: 'crux', label: 'Verdant · Crux' },
  { biome: 'dust-belt', themeId: 'vela', label: 'Desert · Vela' },
  { biome: 'ice-ring', themeId: 'cygnus', label: 'Frost · Cygnus' },
  { biome: 'ember-world', themeId: 'scorpius', label: 'Inferno · Scorpius' },
  { biome: 'void-garden', themeId: 'sagittarius', label: 'Void · Sagittarius' },
];
const seeds = [7, 4242];

// For each world: a whole-hole MAP (sky around the floating island) and a zoomed PLAY view
// (focus/follow-cam — the case where the turf used to fill the frame and hide the sky).
let cells = '';
for (const c of cases) {
  const seed = seeds[0];
  const hole = generateCourse(seed, { holes: 1 }).holes[0];
  const map = renderHoleSVG(hole, { width: 300, height: 420, biome: c.biome, themeId: c.themeId });
  // Zoom to a tee shot like the decision map (focus the tee, a driver-ish reach, ball low).
  const zoom = renderHoleSVG(hole, {
    width: 300, height: 420, biome: c.biome, themeId: c.themeId,
    focus: hole.tee, viewRadius: 95, focusBias: 0.8,
  });
  cells += `<figure style="margin:0"><figcaption style="color:#ccd;font:600 12px system-ui;padding:4px 0">${c.label} · map</figcaption>${map}</figure>`;
  cells += `<figure style="margin:0"><figcaption style="color:#ccd;font:600 12px system-ui;padding:4px 0">${c.label} · zoomed play</figcaption>${zoom}</figure>`;
}
const html = `<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(4,300px);gap:10px;padding:12px">${cells}</body></html>`;
writeFileSync(outHtml, html);

const chromePath = await findChromium();
if (!chromePath) {
  console.log('No Chromium found — wrote HTML only:', outHtml);
  await server.close();
  process.exit(0);
}
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1570, height: 940 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
