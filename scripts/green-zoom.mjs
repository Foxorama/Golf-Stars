// Green close-up: render each world's green at PUTT zoom (not whole-hole) so the actual green SIZE +
// contour + tucked pin read, with a ball placed a long way from the flag to show the two-putt.
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-green-zoom.png');
const outHtml = join(tmpdir(), 'gs-green-zoom.html');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
const { pinOf } = await server.ssrLoadModule('/src/sim/round.ts');

const worlds = [
  ['dust-belt', 'vela', 'Desert (huge smooth)'],
  ['earth-links', 'lyra', 'Earth (St Andrews)'],
  ['ice-ring', 'cygnus', 'Ice (long shelf)'],
  ['ember-world', 'scorpius', 'Ember (jagged)'],
  ['crystal-spires', 'corona-borealis', 'Crystal (faceted)'],
  ['tidal-archipelago', 'delphinus', 'Tidal (water-ringed)'],
  ['verdant-station', 'crux', 'Verdant (rolling)'],
  ['toxic-mire', 'hydra', 'Mire (waterlogged)'],
  ['scrap-belt', 'antlia', 'Scrap (canted plate)'],
];
function greenDiam(h){ const g=h.features.find(f=>f.kind==='green'); let m=0; for(let i=0;i<g.poly.length;i++)for(let j=i+1;j<g.poly.length;j++){const d=Math.hypot(g.poly[i][0]-g.poly[j][0],g.poly[i][1]-g.poly[j][1]);if(d>m)m=d;} return m; }

let cells = '';
for (const [biome, themeId, label] of worlds) {
  // pick a deep (long/hard) hole so the "higher difficulty = tiny green?" claim is tested directly
  const holes = generateCourse(20260714, { holes: 12, distanceFromStart: 55, biome }).holes.filter(h => h.par >= 4);
  const hole = holes[2] ?? holes[0];
  const diam = greenDiam(hole);
  const pin = pinOf(hole);
  // ball ~ 60% of the green radius away from the pin, along the long axis — a real long two-putt
  const ball = [pin[0] + diam * 0.34, pin[1] - diam * 0.20];
  const putt = Math.hypot(pin[0]-ball[0], pin[1]-ball[1]);
  const svg = renderHoleSVG(hole, {
    width: 300, height: 320, biome, themeId, ball,
    focus: hole.green, viewRadius: diam * 0.62, up: [pin[0]-ball[0], pin[1]-ball[1]],
  });
  cells += `<figure style="margin:0"><figcaption style="color:#dde;font:600 12px system-ui;padding:4px 0">${label}<br><span style="color:#9ab;font-weight:400">${diam.toFixed(0)} yd green · ${putt.toFixed(0)} yd putt (${(putt*3).toFixed(0)} ft)</span></figcaption>${svg}</figure>`;
}
const html = `<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(3,300px);gap:10px;padding:14px">${cells}</body></html>`;
writeFileSync(outHtml, html);



const browser = await launchChromium({ args: ['--no-sandbox'], wrote: outHtml });

const page=await browser.newPage({viewport:{width:960,height:1100},deviceScaleFactor:2});
await page.goto('file://'+outHtml);
await page.screenshot({path:outPng,fullPage:true});
await browser.close(); await server.close();
console.log('wrote',outPng);
