// Eyes-on preview for the MOVING Cetus star-waterfall (GS-cetus-flow): mounts the real cetusFlow
// overlay over the real buildScene backdrop (animateCetus on, so the static river is suppressed) and
// screenshots it at several virtual-clock times, so the flow (drifting channel stars, falling curtain
// streaks, churning splash) can be eyeballed frame-to-frame. Pure dev tool — serves the real TS
// modules through a vite dev middleware and shoots with the pre-installed Chromium.
//
//   node scripts/cetus-flow-preview.mjs   → writes the PNG to the OS temp dir, prints the path

import { createServer } from 'vite';
import http from 'node:http';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';


const outPng = process.env.CETUS_OUT ?? join(tmpdir(), 'gs-cetus-flow.png');



const TIMES = [0, 300, 600, 1200, 2400, 4200];

const html = `<!doctype html><meta charset="utf8">
<body style="margin:0;background:#05070c;display:flex;flex-wrap:wrap;gap:10px;padding:12px;font-family:sans-serif">
<style>figcaption{color:#cfd6e4;font-size:12px;margin:0 0 4px}figure{margin:0}</style>
<script type="module">
  import { generateCourse } from '/src/sim/course/generate.ts';
  import { holeProjector } from '/src/render/project.ts';
  import { buildScene, drawScenePrims } from '/src/render/style.ts';
  import { createCetusFlow } from '/src/render/cetusFlow.ts';
  const TIMES = ${JSON.stringify(TIMES)};
  const c = generateCourse(7, { biome: 'cetus-deep', holes: 4, wildness: 0.5 });
  const hole = c.holes.find(h => h.par >= 4) ?? c.holes[0];
  const W = 300, H = 470;
  // Whole-hole FIT (like the SVG map) — shows the full river + the cliff waterfall — so the falling
  // curtain streaks are on screen, not just the channel.
  const proj = holeProjector(hole, { width: W, height: H });
  const scene = buildScene(hole, proj, { width: W, height: H, biome: 'cetus-deep', themeId: 'cetus', animateCetus: true });
  const flow = createCetusFlow(hole);
  window.__flowActive = flow.active;
  const fps = [];
  for (const t of TIMES) {
    const fig = document.createElement('figure');
    fig.innerHTML = '<figcaption>now = ' + t + ' ms</figcaption>';
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    fig.appendChild(cv); document.body.appendChild(fig);
    const g = cv.getContext('2d');
    drawScenePrims(g, scene);
    flow.draw(g, proj, t, 1, 1);
    // Fingerprint the WHOLE frame so any moving pixel (drifting channel star or falling streak) counts.
    fps.push(cv.getContext('2d').getImageData(0, 0, W, H).data.reduce((a, v, i) => (i % 51 === 0 ? a + v : a), 0));
  }
  window.__fps = fps;
  window.__done = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
  vite.middlewares(req, res);
});
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;


const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1000, height: 1100 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__done === true');
const active = await page.evaluate('window.__flowActive');
const fps = await page.evaluate('window.__fps');
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await vite.close();
srv.close();
const distinct = new Set(fps).size;
console.log('flow.active =', active);
console.log('curtain-region fingerprints =', fps.join(', '));
console.log('distinct frames =', distinct, '/', fps.length, distinct > 1 ? '→ MOTION ✓' : '→ NO MOTION ✗');
console.log('wrote', outPng);
