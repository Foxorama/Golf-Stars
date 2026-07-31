// Eyes-on preview for the trade-camp TENTS (GS-tents): renders the static SVG decision map for a
// few biomes WITH the trade tents armed, so the ring of bright tents around the green can be
// eyeballed. Pure dev tool — imports the real TS render layer via vite-node, screenshots with the
// pre-installed Chromium. No game logic here.
//
//   node scripts/tents-preview.mjs   → writes the PNG to the OS temp dir, prints the path

import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';


const outPng = process.env.TENTS_OUT ?? join(tmpdir(), 'gs-tents.png');
const outHtml = join(tmpdir(), 'gs-tents.html');



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
  // Tents live on ONE stamped hole of a trade-market stop (GS-tent-interactions) — arm this hole so the
  // preview shows the ring (in play the stamp is done by currentCourse).
  const hole = { ...course.holes[0], tents: true };
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


const browser = await launchChromium({ wrote: outHtml });
const page = await browser.newPage({ viewport: { width: 960, height: 1100 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml.replace(/\\/g, '/'));
await page.waitForTimeout(300);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
