// Rasterise a grid of DERELICT-world holes (static SVG map) so the ship redesign can be eyeballed.
//   node scripts/derelict-preview.mjs            → writes the PNG to the OS temp dir, prints the path
//   DERELICT_OUT=/path/out.png node ...          → writes there instead
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outPng = process.env.DERELICT_OUT ?? join(tmpdir(), 'gs-derelict.png');
const outHtml = join(tmpdir(), 'gs-derelict.html');



const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');

// Several derelict courses at increasing depth (wildness rises with distanceFromStart) so we see
// calm early stops AND brutal deep island-hop chains.
const themeId = 'skull-nebula';
let cells = '';
for (const dist of [4, 14, 22]) {
  const holes = generateCourse(20260627, { holes: 24, distanceFromStart: dist, biome: 'derelict-ship' }).holes;
  const picks = holes.filter((h) => h.par >= 3).slice(0, 6);
  for (const hole of picks) {
    const map = renderHoleSVG(hole, { width: 300, height: 460, biome: 'derelict-ship', themeId });
    cells += `<figure style="margin:0"><figcaption style="color:#ccd;font:600 11px system-ui;padding:3px 0">depth ${dist} · par ${hole.par} · ${hole.widthId ?? ''}</figcaption>${map}</figure>`;
  }
}
const html = `<!doctype html><html><body style="margin:0;background:#05060a;display:grid;grid-template-columns:repeat(6,300px);gap:8px;padding:12px">${cells}</body></html>`;
writeFileSync(outHtml, html);




const browser = await launchChromium({ args: ['--no-sandbox'], wrote: outHtml });

const page = await browser.newPage({ viewport: { width: 1860, height: 1000 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
