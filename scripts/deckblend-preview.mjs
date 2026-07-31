// Close-up of the derelict deck EDGE + island-green junction, to see how the fairway/deck meets the
// hull/space and how the green sits on the deck (GS-ship-deck-blend).
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';
const outPng = process.env.OUT ?? join(tmpdir(), 'gs-deckblend.png');
const outHtml = join(tmpdir(), 'gs-deckblend.html');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
const { pinOf } = await server.ssrLoadModule('/src/sim/round.ts');
function greenDiam(h){ const g=h.features.find(f=>f.kind==='green'); if(!g)return 30; let m=0; for(let i=0;i<g.poly.length;i++)for(let j=i+1;j<g.poly.length;j++){const d=Math.hypot(g.poly[i][0]-g.poly[j][0],g.poly[i][1]-g.poly[j][1]);if(d>m)m=d;} return m; }
let cells = '';
for (const dist of [4, 14, 22]) {
  const holes = generateCourse(20260627, { holes: 24, distanceFromStart: dist, biome: 'derelict-ship' }).holes;
  const p3 = holes.find(h => h.par === 3) ?? holes[0];
  const p4 = holes.find(h => h.par >= 4) ?? holes[0];
  for (const [hole,label] of [[p3,`depth ${dist} · island green`],[p4,`depth ${dist} · corridor`]]) {
    const diam = greenDiam(hole);
    const pin = pinOf(hole);
    const svg = renderHoleSVG(hole, { width: 320, height: 340, biome: 'derelict-ship', themeId: 'skull-nebula',
      ball: hole.tee, focus: hole.green, viewRadius: diam * 1.8, up: [pin[0]-hole.tee[0], pin[1]-hole.tee[1]] });
    cells += `<figure style="margin:0"><figcaption style="color:#ccd;font:600 11px system-ui;padding:3px 0">${label}</figcaption>${svg}</figure>`;
  }
}
const html = `<!doctype html><html><body style="margin:0;background:#05060a;display:grid;grid-template-columns:repeat(2,320px);gap:10px;padding:14px">${cells}</body></html>`;
writeFileSync(outHtml, html);


const browser = await launchChromium({ args: ['--no-sandbox'], wrote: outHtml });

const page=await browser.newPage({viewport:{width:700,height:1100},deviceScaleFactor:2});
await page.goto('file://'+outHtml); await page.screenshot({path:outPng,fullPage:true});
await browser.close(); await server.close(); console.log('wrote',outPng);
