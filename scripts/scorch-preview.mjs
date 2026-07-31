// Eyes-on preview for the meteor-strike SCORCH MARKS (GS-meteor-scorch): renders the static SVG
// decision map for a few biomes WITH the craters armed, plus a zoom onto the first mark, so the
// charred strike marks can be eyeballed. Pure dev tool — imports the real TS render layer via
// vite-node, screenshots with the pre-installed Chromium. No game logic here.
//
//   node scripts/scorch-preview.mjs   → writes the PNG to the OS temp dir, prints the path

import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';


const outPng = process.env.SCORCH_OUT ?? join(tmpdir(), 'gs-scorch.png');
const outHtml = join(tmpdir(), 'gs-scorch.html');



const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
const { meteorScorch } = await server.ssrLoadModule('/src/sim/scorch.ts');

const cases = [
  { biome: 'verdant-station', themeId: 'crux', label: 'Verdant' },
  { biome: 'dust-belt', themeId: 'vela', label: 'Desert' },
  { biome: 'ice-ring', themeId: 'grus', label: 'Frost' },
];

let cards = '';
for (const c of cases) {
  const course = generateCourse(9, { biome: c.biome, themeId: c.themeId, holes: 3, wildness: 0.6 });
  const hole = course.holes[0];
  const marks = meteorScorch(hole);
  const whole = renderHoleSVG(hole, { width: 300, height: 460, biome: c.biome, themeId: c.themeId, meteorScorch: true });
  cards += `<figure><figcaption>${c.label} — whole hole (${marks.length} strikes)</figcaption>${whole}</figure>`;
  if (marks.length) {
    const zoom = renderHoleSVG(hole, {
      width: 300,
      height: 460,
      biome: c.biome,
      themeId: c.themeId,
      meteorScorch: true,
      focus: marks[0].c,
      viewRadius: 40,
      focusBias: 0.5,
    });
    cards += `<figure><figcaption>${c.label} — crater zoom</figcaption>${zoom}</figure>`;
  }
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
