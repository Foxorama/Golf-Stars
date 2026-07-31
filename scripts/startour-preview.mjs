// Eyes-on preview for the Star Tour star map ICONS (GS-star-tour-map-improvements): renders the REAL
// starTourMapSVG() with the full catalogue so the per-world planet icons can be iterated visually.
//   node scripts/startour-preview.mjs      (OUT=/path.png to choose the file)
import { createServer } from 'vite';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-startour.png');

const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
const styleBlock = indexHtml.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '';
const rootVars = indexHtml.match(/:root\s*\{[\s\S]*?\}/)?.[0] ?? '';

const html = `<!doctype html><meta charset="utf8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${styleBlock}
<style>${rootVars} body{margin:0;background:#05060f;}</style>
<body>
<div id="app"></div>
<script type="module">
  import { starTourMapSVG } from '/src/render/starTourMap.ts';
  import { STATIC_COURSES } from '/src/sim/course/staticCourses.ts';
  const worlds = STATIC_COURSES.filter((c) => c.themeId && c.archetype).map((c, i) => ({
    id: c.id, name: c.name, archetype: c.archetype, tier: c.tier ?? 'testing', themeId: c.themeId,
    hasRecord: i % 3 === 0, bestToPar: i % 3 === 0 ? (i % 2 ? -4 : 3) : undefined,
  }));
  document.getElementById('app').innerHTML = starTourMapSVG({ seed: 'startour:preview', worlds, zoom: 1 });
  window.__done = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => { const path = req.url.split('?')[0]; if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; } vite.middlewares(req, res); });
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;

const browser = await launchChromium({ args: ['--no-sandbox'] });
const vw = Number(process.env.VW ?? 1600), vh = Number(process.env.VH ?? 1040);
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/${process.env.QS ?? ''}`);
await page.waitForFunction('window.__done === true', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 500));
await page.screenshot({ path: outPng });
await browser.close(); await vite.close(); srv.close();
console.log('wrote', outPng);
