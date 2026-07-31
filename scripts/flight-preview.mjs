// Eyes-on sheet for the BALL FLIGHT (GS-flight-shape): the height-vs-ground profile every club
// actually flies, drawn to scale, with the OLD parameter-indexed arc ghosted behind it.
//
// This draws through the SAME `arcApex` / `arcShapeOf` / `arcHeight` the sim's knockdown walk and the
// play view's animation share, so the curve here IS the one the game flies (contract 5). The dashed
// ghost is the pre-GS-flight-shape arc — the long flat glide and the vertical drop the report called
// "the ball ends up just dropping out of the air".
//   node scripts/flight-preview.mjs        (OUT=/path.png)
import { createServer } from 'vite';
import http from 'node:http';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';


const outPng = process.env.OUT ?? join(tmpdir(), 'gs-flight.png');


const W = 1500;
const H = 1160;
const html = `<!doctype html><meta charset="utf8">
<style>html,body{margin:0;background:#0d1a12;font:12px system-ui,sans-serif;}canvas{display:block;}</style>
<body><canvas id="c" width="${W}" height="${H}"></canvas>
<script type="module">
  import { CLUBS } from '/src/sim/clubs.ts';
  import { arcApex, ARC_FEEL, arcShapeOf, arcHeight, arrivalAngleDeg, launchAngleDeg,
           flightProfileOf, flightClassOf, flightCarryScale } from '/src/sim/flight.ts';

  const ctx = document.getElementById('c').getContext('2d');
  ctx.fillStyle = '#0d1a12'; ctx.fillRect(0,0,${W},${H});
  const label = (t,x,y,sz=12,col='#dff0e2',al='left') => {
    ctx.fillStyle=col; ctx.textAlign=al; ctx.font=\`600 \${sz}px system-ui\`; ctx.fillText(t,x,y);
  };

  // The OLD arc, verbatim: height sampled at the Bezier PARAMETER while the ground ran as 2t-t².
  const OLD = { driver:[0.6,0.85], wood:[0.61,0.95], hybrid:[0.64,1.12], ironLong:[0.63,0.92],
                ironShort:[0.68,1.06], wedge:[0.7,1.12], putter:[0.75,1.0] };
  const oldApex = (c,n,m) => {
    const t = Math.max(0, Math.min(1, (n-70)/180));
    return Math.max(4, Math.min(60, Math.abs(c) * (0.22 + (0.12-0.22)*t) * m));
  };
  const oldHeightAtGround = (apex, g, apexAt) => {
    const t = 1 - Math.sqrt(1 - Math.max(0, Math.min(1, g)));       // ground -> parameter
    const aT = 1 - Math.sqrt(1 - apexAt);
    return t <= aT ? Math.sin(Math.PI/2*(t/aT))*apex : Math.cos(Math.PI/2*(t-aT)/(1-aT))*apex;
  };

  label('BALL FLIGHT — height against ground covered, to scale (GS-flight-shape)', 22, 30, 18);
  label('solid = what the game flies now   ·   dashed = the old arc, sampled at the curve parameter', 22, 50, 12, '#8fbf9d');

  // One shared yards-per-pixel across every panel so the clubs are directly comparable.
  const PXY = 1.15;            // px per yard of GROUND
  const VEXAG = 2.6;           // height blown up this much, else nothing is visible next to 270yd
  const SHOW = ['D','3W','4H','3i','7i','PW','SW'];
  const COL = { driver:'#7fd4ff', wood:'#9ee7a4', hybrid:'#ffd479', ironLong:'#ff9f7a', ironShort:'#e59bff', wedge:'#ff7f9f' };

  let y = 108;
  for (const id of SHOW) {
    const club = CLUBS.find(c => c.id === id);
    const p = flightProfileOf(id);
    const carry = club.carry * flightCarryScale(id, club.carry);
    const shape = arcShapeOf(id);
    const apex = arcApex(carry, club.carry, ARC_FEEL, p);
    const [oAt, oM] = OLD[flightClassOf(id)];
    const oApex = oldApex(carry, club.carry, oM);
    const x0 = 150;
    const base = y + 118;

    // ground line + the 90% mark (where the old arc still had 71% of its apex to shed)
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0-8, base+0.5); ctx.lineTo(x0 + carry*PXY + 14, base+0.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.moveTo(x0 + carry*0.9*PXY, base); ctx.lineTo(x0 + carry*0.9*PXY, base-116); ctx.stroke();

    const trace = (h, style, dash) => {
      ctx.save(); ctx.setLineDash(dash); ctx.strokeStyle = style; ctx.lineWidth = dash.length ? 1.4 : 2.4;
      ctx.beginPath();
      for (let i = 0; i <= 400; i++) {
        const g = i/400;
        const px = x0 + g*carry*PXY, py = base - h(g)*PXY*VEXAG;
        i ? ctx.lineTo(px,py) : ctx.moveTo(px,py);
      }
      ctx.stroke(); ctx.restore();
    };
    trace((g) => oldHeightAtGround(oApex, g, oAt), 'rgba(255,255,255,0.42)', [5,5]);
    trace((g) => arcHeight(apex, g, shape), COL[flightClassOf(id)], []);

    // the apex marker
    ctx.fillStyle = COL[flightClassOf(id)];
    ctx.beginPath(); ctx.arc(x0 + shape.apexAt*carry*PXY, base - apex*PXY*VEXAG, 3, 0, Math.PI*2); ctx.fill();

    label(id, 22, base - 10, 22);
    label(club.name, 22, base + 8, 11, '#8fbf9d');
    label(Math.round(carry) + 'yd carry', 22, base + 24, 10, '#5f8f6d');
    const line = 'launch ' + launchAngleDeg(p, club.carry).toFixed(1) + '\\u00b0   apex ' + apex.toFixed(0) +
                 'yd @ ' + Math.round(shape.apexAt*100) + '%   down ' + arrivalAngleDeg(apex, carry, shape).toFixed(1) + '\\u00b0';
    label(line, x0 + carry*PXY + 22, base - 40, 12, COL[flightClassOf(id)]);
    label('old: apex ' + oApex.toFixed(0) + 'yd, and ' +
          Math.round(100*oldHeightAtGround(oApex, 0.9, oAt)/oApex) + '% of it still to shed at 90%',
          x0 + carry*PXY + 22, base - 20, 10, 'rgba(255,255,255,0.5)');
    label('now: ' + Math.round(100*arcHeight(apex, 0.9, shape)/apex) + '% left at 90%',
          x0 + carry*PXY + 22, base - 4, 10, '#8fbf9d');
    y += 148;
  }
  window.__done = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
  vite.middlewares(req, res);
});
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;
const browser = await launchChromium({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__done === true', { timeout: 60000 });
await page.screenshot({ path: outPng });
await browser.close();
await vite.close();
srv.close();
console.log('wrote', outPng);
