// Focused eyes-on preview for JUST the drifting BRIDGE wreck piece (GS-ship-wreck): draws the bridge
// large on a starfield at a few clock times / rotations so the silhouette + the "Starlit Wanderer"
// name can be iterated in isolation.  node scripts/bridge-preview.mjs
import { createServer } from 'vite';
import http from 'node:http';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-bridge.png');

const html = `<!doctype html><meta charset="utf8">
<body style="margin:0;background:#04060b;display:flex;flex-wrap:wrap;gap:14px;padding:14px;font-family:sans-serif">
<style>figcaption{color:#cfd6e4;font-size:12px;margin:0 0 4px}figure{margin:0}</style>
<script type="module">
  import { drawWreck } from '/src/render/shipWreck.ts';
  const NAME = 'STARLIT WANDERER';
  // A handful of sizes / rotations / clock times matching how it drifts in-game.
  const specs = [
    {S:150, rot: Math.PI*0.10, t:1.2},
    {S:150, rot: -Math.PI*0.22, t:2.6},
    {S:150, rot: Math.PI*0.9, t:5.2},
    {S:150, rot: 0, t:3.4},
    {S:220, rot: Math.PI*0.12, t:1.5},
    {S:220, rot: -Math.PI*0.35, t:6.0},
  ];
  for (const {S,rot,t} of specs) {
    const pad = 40; const CW = S*2.4 + pad, CH = S*2.8 + pad;
    const fig = document.createElement('figure');
    fig.innerHTML = '<figcaption>S ' + S + ' · rot ' + rot.toFixed(2) + ' · t ' + t + '</figcaption>';
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    fig.appendChild(cv); document.body.appendChild(fig);
    const g = cv.getContext('2d');
    // faint starfield
    g.fillStyle = '#060912'; g.fillRect(0,0,CW,CH);
    g.fillStyle = 'rgba(200,220,255,0.5)';
    for (let i=0;i<80;i++){ const x=(Math.sin(i*12.9898)*43758.5453%1+1)%1*CW; const y=(Math.sin(i*78.233)*12543.11%1+1)%1*CH; g.fillRect(x,y,1.2,1.2); }
    drawWreck(g, 'bridge', CW/2, CH/2, S, rot, 0.95, t, NAME);
  }
  window.__done = true;
</script></body>`;
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => { if (req.url === '/' || req.url === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; } vite.middlewares(req, res); });
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;

const browser = await launchChromium({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__done === true', { timeout: 60000 });
await page.screenshot({ path: outPng, fullPage: true });
await browser.close(); await vite.close(); srv.close();
console.log('wrote', outPng);
