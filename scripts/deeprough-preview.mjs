// Eyeball the deep rough (GS-deep-rough): render one dogleg hole per land world that actually carries
// deep rough (and an ocean hole whose corner is open sea), larger, so the themed tangle reads.
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';
const outPng = process.env.OUT ?? join(tmpdir(), 'gs-deeprough.png');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
const cases = [
  ['verdant-station','crux','Verdant'],['dust-belt','vela','Desert'],['ice-ring','cygnus','Frost'],
  ['ember-world','scorpius','Inferno'],['crystal-spires','corona-borealis','Crystal'],
  ['tempest-reach','draco','Tempest'],['spore-jungle','lacerta','Fungal'],['tidal-archipelago','delphinus','Ocean'],
];
let cells='';
for (const [biome,themeId,label] of cases){
  const want = biome==='tidal-archipelago' ? 'water' : 'deeprough';
  let picked=null;
  for (let s=0;s<200 && !picked;s++){
    const holes = generateCourse(70000+s,{holes:6,distanceFromStart:12,biome}).holes;
    picked = holes.find(h=>h.par>=4 && h.hazards.some(z=>z.kind===want));
  }
  if (picked){ const map=renderHoleSVG(picked,{width:300,height:460,biome,themeId}); cells+=`<figure style="margin:0"><figcaption style="color:#ccd;font:600 12px system-ui;padding:3px 0">${label} · par ${picked.par}</figcaption>${map}</figure>`; }
}
const html=`<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(4,300px);gap:8px;padding:12px">${cells}</body></html>`;
const outHtml=join(tmpdir(),'gs-deeprough.html'); writeFileSync(outHtml,html);


const browser = await launchChromium({ args: ['--no-sandbox'], wrote: outHtml });
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.goto('file://'+outHtml); await page.waitForTimeout(300);
const el = await page.$('body'); await el.screenshot({ path: outPng });
await browser.close(); await server.close();
console.log('wrote', outPng);
