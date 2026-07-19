// Eyes-on preview for the Story-Tour clubhouse crew standees (GS-story-fullbody): the Warden spaceport
// (full roster) and the Herald deck, so the full-body figures can be checked standing on the floor.
//   node scripts/storyclub-preview.mjs
import { createServer } from 'vite';
import http from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const outPng = process.env.OUT ?? join(tmpdir(), 'gs-storyclub.png');
function findChromium() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, process.env.HOME ? join(process.env.HOME, '.cache', 'ms-playwright') : undefined, '/opt/pw-browsers'].filter(Boolean);
  for (const base of bases) { if (!existsSync(base)) continue; for (const d of readdirSync(base)) { if (!d.startsWith('chromium-') || d.includes('headless')) continue; const bin = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(bin)) return bin; } }
  return null;
}
const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
const styleBlock = indexHtml.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '';
const rootVars = indexHtml.match(/:root\s*\{[\s\S]*?\}/)?.[0] ?? '';

const html = `<!doctype html><meta charset="utf8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${styleBlock}
<style>${rootVars} body{margin:0;background:#0a0d16;color:#eaf2ff;font-family:system-ui;} .row{display:flex;gap:18px;padding:18px;flex-wrap:wrap;} .col{flex:1;min-width:420px;} h3{margin:0 0 8px;}</style>
<body>
<div class="row">
  <div class="col"><h3>Warden clubhouse</h3><div id="warden"></div></div>
  <div class="col"><h3>Herald (Coil) clubhouse</h3><div id="herald"></div></div>
</div>
<script type="module">
  import { spaceportSceneHTML } from '/src/render/storySpaceport.ts';
  import { defaultStoryState } from '/src/sim/rpg/story.ts';
  const warden = { ...defaultStoryState('feather-fade'), chapter: 3,
    hiredCaddyIds: ['driver-dan','auto-caddie','sandy-sandsaver','dr-chipinski','suggestible-sam','mystic-mole','prognostic-parrot'],
    activeCaddyId: 'sandy-sandsaver' };
  const herald = { ...defaultStoryState('feather-fade'), chapter: 4, alignment: 'herald',
    hiredCaddyIds: ['driver-dan'], activeCaddyId: 'driver-dan' };
  document.getElementById('warden').innerHTML = spaceportSceneHTML(warden);
  document.getElementById('herald').innerHTML = spaceportSceneHTML(herald);
  window.__done = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => { const path = req.url.split('?')[0]; if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; } vite.middlewares(req, res); });
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;
const exe = findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
const page = await browser.newPage({ viewport: { width: 1360, height: 720 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__done === true', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: outPng, fullPage: true });
await browser.close(); await vite.close(); srv.close();
console.log('wrote', outPng);
