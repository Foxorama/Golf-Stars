// Eyeball the Cetus/Void fairway+green stripe smoothing and the hazard blending pass.
// Renders several cetus & void holes (calm + deep island-hop) plus hazard-heavy parkland holes
// (water + sand) so the stripe contrast and hazard edges can be compared side by side.
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';
const outPng = process.env.OUT ?? join(tmpdir(), 'gs-blend.png');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');

// distanceFromStart high => wilder => cetus/void become island-hops with void carries.
const cases = [
  ['cetus-deep','cetus','Cetus calm', 6],
  ['cetus-deep','cetus','Cetus deep', 16],
  ['void-garden','sagittarius','Void calm', 6],
  ['void-garden','sagittarius','Void deep', 16],
  ['verdant-station','crux','Verdant water', 12],
  ['dust-belt','vela','Desert sand', 12],
  ['ice-ring','cygnus','Frost water', 12],
  ['ember-world','scorpius','Inferno lava', 12],
];
let cells='';
for (const [biome,themeId,label,dist] of cases){
  const holes = generateCourse(70000,{holes:12,distanceFromStart:dist,biome}).holes;
  // prefer holes with hazards, par>=4
  const picks = holes.filter(h=>h.par>=4 && (h.hazards.length>0)).slice(0,3);
  const use = picks.length ? picks : holes.filter(h=>h.par>=4).slice(0,3);
  for (const hole of use){
    const map=renderHoleSVG(hole,{width:280,height:440,biome,themeId});
    cells+=`<figure style="margin:0"><figcaption style="color:#ccd;font:600 12px system-ui;padding:3px 0">${label} · par ${hole.par}</figcaption>${map}</figure>`;
  }
}
const html=`<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(3,280px);gap:8px;padding:12px">${cells}</body></html>`;
const outHtml=join(tmpdir(),'gs-blend.html'); writeFileSync(outHtml,html);


const browser = await launchChromium({ args: ['--no-sandbox'], wrote: outHtml });
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.goto('file://'+outHtml); await page.waitForTimeout(300);
const el = await page.$('body'); await el.screenshot({ path: outPng });
await browser.close(); await server.close();
console.log('wrote', outPng);
