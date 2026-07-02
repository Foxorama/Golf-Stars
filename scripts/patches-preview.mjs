// Eyes-on preview for the effect GROUND PATCHES (GS-journey-fx-2): renders the static SVG decision
// map with each patch family armed — comet stardust, frostfall ice, debris-field wreckage — plus a
// zoom onto the first patch of each, so the turf art can be eyeballed per family. Pure dev tool —
// imports the real TS render layer via vite-node, screenshots with the pre-installed Chromium.
// No game logic here.
//
//   node scripts/patches-preview.mjs   → writes the PNG to the OS temp dir, prints the path

import { createServer } from 'vite';
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const outPng = process.env.PATCHES_OUT ?? join(tmpdir(), 'gs-patches.png');
const outHtml = join(tmpdir(), 'gs-patches.html');

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
const { effectPatches } = await server.ssrLoadModule('/src/sim/patches.ts');

// Each family on the world its route most often reaches — stardust anywhere, frost on turfy worlds
// (the ice world's own ground would camouflage it), junk on the dust belt.
const cases = [
  { kind: 'stardust', biome: 'verdant-station', themeId: 'crux', label: 'Comet stardust (bonus lie)' },
  { kind: 'frost', biome: 'verdant-station', themeId: 'crux', label: 'Frostfall ice (slick lie)' },
  { kind: 'junk', biome: 'dust-belt', themeId: 'vela', label: 'Debris wreckage (snag lie)' },
];

let cards = '';
for (const c of cases) {
  const course = generateCourse(9, { biome: c.biome, themeId: c.themeId, holes: 3, wildness: 0.6 });
  const hole = course.holes[0];
  const patches = effectPatches(hole, c.kind);
  const whole = renderHoleSVG(hole, { width: 300, height: 460, biome: c.biome, themeId: c.themeId, groundPatch: c.kind });
  cards += `<figure><figcaption>${c.label} — whole hole (${patches.length} patches)</figcaption>${whole}</figure>`;
  if (patches.length) {
    const zoom = renderHoleSVG(hole, {
      width: 300,
      height: 460,
      biome: c.biome,
      themeId: c.themeId,
      groundPatch: c.kind,
      focus: patches[0].c,
      viewRadius: 40,
      focusBias: 0.5,
    });
    cards += `<figure><figcaption>${c.label} — patch zoom</figcaption>${zoom}</figure>`;
  }
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
