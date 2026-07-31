// Focused per-biome hole-variety preview: render N whole-hole maps for one biome so shape/width/
// rough variety can be eyeballed after a biomes.ts identity change. Dev tool only.
//   BIOME=verdant-station THEME=crux node scripts/biome-focus.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { launchChromium } from './chromium.mjs';

const BIOME = process.env.BIOME ?? 'verdant-station';
const THEME = process.env.THEME ?? 'crux';
const outPng = process.env.OUT ?? join(tmpdir(), `gs-focus-${BIOME}.png`);
const outHtml = join(tmpdir(), `gs-focus-${BIOME}.html`);

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');

let cells = '';
// A spread of stops: shallow (calm) → deep (wild), several holes each.
for (const dist of [4, 14, 30, 60]) {
  const holes = generateCourse(20260714, { holes: 24, distanceFromStart: dist, biome: BIOME }).holes;
  const picks = holes.filter((h) => h.par >= 4).slice(0, 4);
  for (const hole of picks) {
    const map = renderHoleSVG(hole, { width: 240, height: 380, biome: BIOME, themeId: THEME });
    cells += `<figure style="margin:0"><figcaption style="color:#ccd;font:600 11px system-ui;padding:3px 0">d${dist} · par ${hole.par} · ${hole.widthId ?? '?'} · ${hole.shapeId ?? '?'}</figcaption>${map}</figure>`;
  }
}
const html = `<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(4,240px);gap:8px;padding:12px">${cells}</body></html>`;
writeFileSync(outHtml, html);




const browser = await launchChromium({ args: ['--no-sandbox'], wrote: outHtml });

const page = await browser.newPage({ viewport: { width: 1024, height: 1700 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
