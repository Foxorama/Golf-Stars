// Eyes-on preview for the Reseal ending cinematic (GS-story-reseal-tree). Mounts the good-win ending and
// screenshots it at several beats (settle → seal locks → tree grows → hold + title), plus a portrait frame
// to check readability. Writes gs-reseal-<beat>.png into the OUT dir (default: tmp).
//   node scripts/story-ending-preview.mjs
import { createServer } from 'vite';
import http from 'node:http';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outDir = process.env.OUT ?? tmpdir();


const html = `<!doctype html><meta charset="utf8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;background:#03040a;height:100%;}</style>
<body>
<script type="module">
  import { mountStoryEnding } from '/src/render/storyEnding.ts';
  window.__mount = () => mountStoryEnding({ variant: 'good-win', betrayerName: 'Feather' });
  window.__ready = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => { const path = req.url.split('?')[0]; if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; } vite.middlewares(req, res); });
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;

const browser = await launchChromium({ args: ['--no-sandbox'] });

async function shoot(viewport, tag) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction('window.__ready === true', { timeout: 60000 });
  await page.evaluate('window.__mount()');
  const beats = [[1600, 'a-seal'], [3000, 'b-locked'], [5000, 'c-growing'], [7200, 'd-canopy'], [9200, 'e-hold']];
  let prev = 0;
  for (const [ms, name] of beats) {
    await new Promise((r) => setTimeout(r, ms - prev)); prev = ms;
    await page.screenshot({ path: join(outDir, `gs-reseal-${tag}-${name}.png`) });
  }
  await page.close();
}

await shoot({ width: 1000, height: 640 }, 'wide');
await shoot({ width: 430, height: 932 }, 'phone');
await browser.close(); await vite.close(); srv.close();
console.log('wrote gs-reseal-*.png to', outDir);
