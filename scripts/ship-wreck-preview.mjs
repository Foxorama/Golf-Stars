// Eyes-on preview for the LARGE drifting ship-wreck sections (GS-ship-wreck): mounts the real
// buildScene backdrop + the shipDrift overlay (big bridge/wing/engine sections drifting in the space
// beside the corridor) on a canvas and screenshots several holes at a fixed clock, so the wreck shapes
// + the "Starlit Wanderer" spray text can be eyeballed.  node scripts/ship-wreck-preview.mjs
import { createServer } from 'vite';
import http from 'node:http';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-ship-wreck.png');

const html = `<!doctype html><meta charset="utf8">
<body style="margin:0;background:#04060b;display:flex;flex-wrap:wrap;gap:10px;padding:12px;font-family:sans-serif">
<style>figcaption{color:#cfd6e4;font-size:12px;margin:0 0 4px}figure{margin:0}</style>
<script type="module">
  import { generateCourse } from '/src/sim/course/generate.ts';
  import { holeProjector } from '/src/render/project.ts';
  import { buildScene, drawScenePrims } from '/src/render/style.ts';
  import { createShipDrift } from '/src/render/shipDrift.ts';
  const W = 440, H = 780;
  const specs = [ {dist:5, t:1200, mode:'fit'}, {dist:14, t:2600, mode:'focus'}, {dist:20, t:5200, mode:'focus'}, {dist:8, t:3400, mode:'focus'} ];
  for (const {dist,t,mode} of specs) {
    const c = generateCourse(20260627, { biome: 'derelict-ship', holes: 24, distanceFromStart: dist });
    const hole = c.holes.find(h => h.par >= 4) ?? c.holes[0];
    // 'focus' = the realistic zoomed follow-cam (centred on the ball at the tee); 'fit' = whole-hole map.
    const opts = mode === 'focus' ? { width: W, height: H, focus: hole.tee, viewRadius: 150 } : { width: W, height: H };
    const proj = holeProjector(hole, opts);
    const scene = buildScene(hole, proj, { width: W, height: H, biome: 'derelict-ship', themeId: 'skull-nebula' });
    const drift = createShipDrift(hole);
    const fig = document.createElement('figure');
    fig.innerHTML = '<figcaption>depth ' + dist + ' · par ' + hole.par + ' · ' + mode + ' · now ' + t + '</figcaption>';
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    fig.appendChild(cv); document.body.appendChild(fig);
    const g = cv.getContext('2d');
    drawScenePrims(g, scene);
    drift.draw(g, proj, t, 1, 1);
  }
  window.__done = true;
</script></body>`;
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => { if (req.url === '/' || req.url === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; } vite.middlewares(req, res); });
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;

const browser = await launchChromium({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 820 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__done === true', { timeout: 60000 });
await page.screenshot({ path: outPng, fullPage: true });
await browser.close(); await vite.close(); srv.close();
console.log('wrote', outPng);
