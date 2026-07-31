// Eyeball for GS-cetus-waterfall-angle: finds real Cetus par-4/5 holes whose star-river reaches the
// plateau edge and PAINTS a waterfall, then renders each at a zoomed play-cam framing centred on the
// spill. The lip + curtain should now lean to line up with the edge the river crosses (straight-down
// only when the river arrives vertically). Prints the screen tangent angle per tile.
//
//   node scripts/cetus-angle-preview.mjs   → PNG path printed

import { createServer } from 'vite';
import http from 'node:http';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';


const outPng = process.env.OUT ?? join(tmpdir(), 'gs-cetus-angle.png');



const html = `<!doctype html><meta charset="utf8">
<body style="margin:0;background:#05070c;display:flex;flex-wrap:wrap;gap:10px;padding:12px;font-family:sans-serif">
<style>figcaption{color:#cfd6e4;font-size:12px;margin:0 0 4px}figure{margin:0}</style>
<script type="module">
  import { generateCourse } from '/src/sim/course/generate.ts';
  import { holeProjector } from '/src/render/project.ts';
  import { buildScene, drawScenePrims } from '/src/render/style.ts';
  import { createCetusFlow } from '/src/render/cetusFlow.ts';
  import { cetusRiverPath } from '/src/render/style/platforms.ts';
  import { mulberry32, hashHole } from '/src/render/style/shared.ts';
  import { landPolysCourseFor } from '/src/render/style/land.ts';
  import { pointInPoly } from '/src/sim/course/contract.ts';
  const W = 320, H = 520;
  const found = [];
  outer:
  for (let s = 0; s < 60 && found.length < 6; s++) {
    const c = generateCourse(s, { biome: 'cetus-deep', holes: 4, wildness: 0.6 });
    for (const hole of c.holes) {
      if (hole.par < 4) continue;
      const rp = cetusRiverPath(hole, mulberry32((hashHole(hole) ^ 0x00cef10e) >>> 0));
      if (!rp || !rp.spillAtEdge) continue;
      const spill = rp.line[rp.line.length - 1];
      const proj = holeProjector(hole, { width: W, height: H, focus: spill, viewRadius: 50, focusBias: 0.34 });
      // Reproduce the paint gate (drop must land off land) so we only show real waterfalls.
      const land = landPolysCourseFor(hole);
      const sp = proj.project(spill);
      const onLand = (p) => land.some(lp => pointInPoly(p, lp));
      if (onLand(proj.unproject(sp[0], sp[1] + 40)) ) continue;
      // Screen tangent angle at spill (deviation from straight-down, deg).
      const scr = rp.line.map(p => proj.project(p));
      const tail = scr[Math.max(0, scr.length - 4)];
      const ang = Math.round(Math.atan2(sp[0]-tail[0], sp[1]-tail[1]) * 180 / Math.PI);
      found.push([hole, proj, 'seed ' + s + ' · par' + hole.par + ' · flow ' + ang + '°']);
      if (found.length >= 6) break outer;
    }
  }
  for (const [hole, proj, label] of found) {
    const fig = document.createElement('figure');
    fig.innerHTML = '<figcaption>' + label + '</figcaption>';
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    fig.appendChild(cv); document.body.appendChild(fig);
    const scene = buildScene(hole, proj, { width: W, height: H, biome: 'cetus-deep', themeId: 'cetus', animateCetus: true });
    const g = cv.getContext('2d');
    drawScenePrims(g, scene);
    createCetusFlow(hole).draw(g, proj, 1200, 1, 1);
  }
  window.__n = found.length;
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
const page = await browser.newPage({ viewport: { width: 1080, height: 1200 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__done === true');
console.log('rendered', await page.evaluate('window.__n'), 'waterfall holes');
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await vite.close();
srv.close();
console.log('wrote', outPng);
