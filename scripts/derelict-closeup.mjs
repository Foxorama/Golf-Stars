// Close-up of a couple of derelict holes (larger SVG) to inspect deck plating + bulkhead walls + hull.
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';
const outPng = process.env.OUT ?? join(tmpdir(), 'gs-derelict-closeup.png');
const outHtml = join(tmpdir(), 'gs-derelict-closeup.html');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
let cells = '';
// A calm par-4/5 (corridor + walls) and a deep par-4 (hull sections).
const picks = [];
for (const dist of [5, 14]) {
  const holes = generateCourse(20260627, { holes: 24, distanceFromStart: dist, biome: 'derelict-ship' }).holes;
  for (const h of holes.filter((x) => x.par >= 4).slice(0, 2)) picks.push({ h, dist });
}
for (const { h, dist } of picks) {
  const map = renderHoleSVG(h, { width: 620, height: 900, biome: 'derelict-ship', themeId: 'skull-nebula' });
  cells += `<figure style="margin:0"><figcaption style="color:#ccd;font:600 13px system-ui;padding:4px 0">depth ${dist} · par ${h.par}</figcaption>${map}</figure>`;
}
const html = `<!doctype html><html><body style="margin:0;background:#05060a;display:grid;grid-template-columns:repeat(4,620px);gap:10px;padding:12px">${cells}</body></html>`;
writeFileSync(outHtml, html);



const browser = await launchChromium({ args: ['--no-sandbox'], wrote: outHtml });

const page = await browser.newPage({ viewport: { width: 2560, height: 980 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
