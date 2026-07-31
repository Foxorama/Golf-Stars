// Mid-zoom green-COMPLEX preview (GS-green-flare): render each world's green + apron + fairway
// junction at APPROACH zoom (the player's decision-map distance), so the fairway FLARE into the green
// and the apron/green/fairway blend read the way the player sees them. Two holes per world.
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-greenblend.png');
const outHtml = join(tmpdir(), 'gs-greenblend.html');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
const { pinOf } = await server.ssrLoadModule('/src/sim/round.ts');

const worlds = [
  ['verdant-station', 'crux', 'Verdant'],
  ['dust-belt', 'vela', 'Desert'],
  ['ice-ring', 'cygnus', 'Ice'],
  ['ember-world', 'scorpius', 'Ember'],
  ['crystal-spires', 'corona-borealis', 'Crystal'],
  ['tempest-reach', 'draco', 'Tempest'],
  ['spore-jungle', 'lacerta', 'Fungal'],
  ['tidal-archipelago', 'delphinus', 'Tidal'],
  ['toxic-mire', 'hydra', 'Swamp'],
  ['scrap-belt', 'antlia', 'Scrap'],
  ['crystal-spires', 'corona-borealis', 'Crystal 2'],
  ['dust-belt', 'vela', 'Desert 2'],
];
function greenDiam(h){ const g=h.features.find(f=>f.kind==='green'); let m=0; for(let i=0;i<g.poly.length;i++)for(let j=i+1;j<g.poly.length;j++){const d=Math.hypot(g.poly[i][0]-g.poly[j][0],g.poly[i][1]-g.poly[j][1]);if(d>m)m=d;} return m; }

let cells = '';
let idx = 0;
for (const [biome, themeId, label] of worlds) {
  const seed = 314159 + idx * 7 + (label.includes('2') ? 999 : 0);
  const holes = generateCourse(seed, { holes: 12, distanceFromStart: 30, biome }).holes.filter(h => h.par >= 4);
  const hole = holes[(idx * 3) % holes.length] ?? holes[0];
  const diam = greenDiam(hole);
  const pin = pinOf(hole);
  // Approach zoom: show the green + its apron + a good stretch of the fairway leading in.
  const svg = renderHoleSVG(hole, {
    width: 300, height: 340, biome, themeId, ball: hole.tee,
    focus: hole.green, viewRadius: diam * 1.7, up: [pin[0]-hole.tee[0], pin[1]-hole.tee[1]],
  });
  cells += `<figure style="margin:0"><figcaption style="color:#dde;font:600 12px system-ui;padding:4px 0">${label} · par ${hole.par}</figcaption>${svg}</figure>`;
  idx++;
}
const html = `<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(3,300px);gap:10px;padding:14px">${cells}</body></html>`;
writeFileSync(outHtml, html);



const browser = await launchChromium({ args: ['--no-sandbox'], wrote: outHtml });

const page=await browser.newPage({viewport:{width:960,height:1500},deviceScaleFactor:2});
await page.goto('file://'+outHtml);
await page.screenshot({path:outPng,fullPage:true});
await browser.close(); await server.close();
console.log('wrote',outPng);
