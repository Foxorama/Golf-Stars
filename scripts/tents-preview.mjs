// Eyes-on preview for the trade-camp TENTS (GS-tents): renders the static SVG decision map for a
// few biomes WITH the trade tents armed, so the ring of bright tents around the green can be
// eyeballed. Pure dev tool — imports the real TS render layer via vite-node, screenshots with the
// pre-installed Chromium. No game logic here.
//
//   node scripts/tents-preview.mjs   → writes the PNG to the OS temp dir, prints the path

import { createServer } from 'vite';
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const outPng = process.env.TENTS_OUT ?? join(tmpdir(), 'gs-tents.png');
const outHtml = join(tmpdir(), 'gs-tents.html');

// Find the pre-installed Chromium across platforms (Windows %LOCALAPPDATA%, Linux/CI caches).
function findChromium() {
  const bases = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : undefined,
    process.env.HOME ? join(process.env.HOME, '.cache', 'ms-playwright') : undefined,
    '/opt/pw-browsers',
  ].filter(Boolean);
  for (const base of bases) {
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium-') || d.includes('headless')) continue;
      for (const bin of [join(base, d, 'chrome-win64', 'chrome.exe'), join(base, d, 'chrome-linux', 'chrome')]) {
        if (existsSync(bin)) return bin;
      }
    }
  }
  return null;
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');

const cases = [
  { biome: 'verdant-station', themeId: 'crux', label: 'Verdant — whole hole' },
  { biome: 'dust-belt', themeId: 'vela', label: 'Desert — whole hole' },
  { biome: 'void-garden', themeId: 'sagittarius', label: 'Void — whole hole' },
];

let cards = '';
for (const c of cases) {
  const course = generateCourse(7, { biome: c.biome, themeId: c.themeId, holes: 3, wildness: 0.6 });
  const hole = course.holes[0];
  // Whole-hole view.
  const whole = renderHoleSVG(hole, { width: 300, height: 460, biome: c.biome, themeId: c.themeId, tradeTents: true });
  // Zoomed-to-green view so the tents read big (focus on the green).
  const zoom = renderHoleSVG(hole, {
    width: 300,
    height: 460,
    biome: c.biome,
    themeId: c.themeId,
    tradeTents: true,
    focus: hole.green,
    viewRadius: 55,
    focusBias: 0.5,
  });
  cards += `<figure><figcaption>${c.label}</figcaption>${whole}</figure>`;
  cards += `<figure><figcaption>${c.label} — green zoom</figcaption>${zoom}</figure>`;
}

const html = `<!doctype html><meta charset="utf8"><body style="margin:0;background:#0b0d12;display:flex;flex-wrap:wrap;gap:10px;padding:12px;font-family:sans-serif">
<style>figcaption{color:#cfd6e4;font-size:12px;margin-bottom:4px}figure{margin:0}</style>${cards}</body>`;
writeFileSync(outHtml, html);

const exe = findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 960, height: 1100 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml.replace(/\\/g, '/'));
await page.waitForTimeout(300);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
