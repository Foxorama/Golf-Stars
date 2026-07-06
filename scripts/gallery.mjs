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

// Find launchable Chromium CANDIDATES, best first: the pre-installed full chromium (cloud
// sandbox default + the local Playwright cache, each platform's layout), then the headless-shell
// build (screenshots only — all we need; on one Windows box the full chromium download shipped a
// broken side-by-side manifest while the headless shell ran fine), then a system Chrome/Edge.
// The caller tries each in turn — existing on disk does not mean it can actually launch.
async function chromiumCandidates() {
  const { readdirSync } = await import('node:fs');
  const { homedir } = await import('node:os');
  const bases = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    join(homedir(), 'AppData', 'Local', 'ms-playwright'), // Windows Playwright cache
    join(homedir(), 'Library', 'Caches', 'ms-playwright'), // macOS
    join(homedir(), '.cache', 'ms-playwright'), // Linux
  ].filter((b) => b && existsSync(b));
  const out = [];
  for (const base of bases) {
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium-') || d.includes('headless')) continue;
      for (const rel of [
        ['chrome-linux', 'chrome'],
        ['chrome-win64', 'chrome.exe'],
        ['chrome-win', 'chrome.exe'],
        ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
      ]) {
        const bin = join(base, d, ...rel);
        if (existsSync(bin)) out.push(bin);
      }
    }
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium_headless_shell-')) continue;
      for (const rel of [
        ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
        ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
        ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
        ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
      ]) {
        const bin = join(base, d, ...rel);
        if (existsSync(bin)) out.push(bin);
      }
    }
  }
  for (const bin of [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ]) {
    if (existsSync(bin)) out.push(bin);
  }
  return out;
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
  { biome: 'crystal-spires', themeId: 'corona-borealis', label: 'Crystal · Corona Borealis' },
  { biome: 'tempest-reach', themeId: 'draco', label: 'Tempest · Draco' },
  { biome: 'spore-jungle', themeId: 'lacerta', label: 'Fungal · Lacerta' },
  { biome: 'tidal-archipelago', themeId: 'delphinus', label: 'Ocean · Delphinus' },
  { biome: 'cetus-deep', themeId: 'cetus', label: 'Cetus · Cetus' },
];
const seeds = [7, 4242];

// Showcase hole SHAPE variety: for each world, render several whole-hole maps (different holes) so
// the doglegs / S-curves / straights and the curved corridors read.
let cells = '';
for (const c of cases) {
  const holes = generateCourse(20260627, { holes: 24, distanceFromStart: 14, biome: c.biome }).holes;
  const picks = holes.filter((h) => h.par >= 4).slice(0, 4);
  for (const hole of picks) {
    const map = renderHoleSVG(hole, { width: 240, height: 380, biome: c.biome, themeId: c.themeId });
    cells += `<figure style="margin:0"><figcaption style="color:#ccd;font:600 11px system-ui;padding:3px 0">${c.label} · par ${hole.par}</figcaption>${map}</figure>`;
  }
}
const html = `<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(4,240px);gap:8px;padding:12px">${cells}</body></html>`;
writeFileSync(outHtml, html);

const candidates = await chromiumCandidates();
const { chromium } = await import('playwright-core');
let browser = null;
for (const chromePath of candidates) {
  try {
    browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
    break;
  } catch (e) {
    console.log('launch failed, trying next candidate:', chromePath, '—', String(e).split('\n')[0]);
  }
}
if (!browser) {
  console.log('No launchable Chromium — wrote HTML only:', outHtml);
  await server.close();
  process.exit(0);
}
const page = await browser.newPage({ viewport: { width: 1570, height: 940 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
