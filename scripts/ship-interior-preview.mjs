// Eyes-on preview for the ship-interior CABIN STYLES (GS-ship-interior-variety): one row per representative
// ship, its five rooms across, so you can confirm a saucer, the Pegasus war-steed, a chopper, a freighter
// and the Infinity Ace yacht all read as genuinely different vessels — not the same room recoloured.
//   node scripts/ship-interior-preview.mjs
import { createServer } from 'vite';
import http from 'node:http';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-ship-interior.png');


const html = `<!doctype html><meta charset="utf8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;background:#0a0d16;color:#eaf2ff;font-family:system-ui;padding:14px;}
h3{margin:14px 0 6px;font-size:15px;} .row{display:flex;gap:8px;} .cell{position:relative;width:230px;aspect-ratio:4/3;
  border:1px solid #2a3346;border-radius:12px;overflow:hidden;background:#0b0f18;} .rl{position:absolute;top:4px;left:50%;
  transform:translateX(-50%);font:700 10px system-ui;background:#0b1018cc;padding:2px 8px;border-radius:10px;z-index:2;}</style>
<body><div id="root"></div>
<script type="module">
  import { shipInteriorTheme, shipRoomArt, shipRoomMeta } from '/src/render/shipInteriorArt.ts';
  import { SHIP_ROOMS } from '/src/ui/gameState.ts';
  import { shipById } from '/src/sim/rpg/ships.ts';
  const ships = ['wagon-classic','racer-redline','firebird','ufo-saucer','ufo-mothership','pegasus-valkyrie','moto-nitro','chopper-thunderbolt','hauler-barge','infinity-ace','wyrm-ship','warden-cruiser'];
  const root = document.getElementById('root');
  for (const id of ships) {
    const t = shipInteriorTheme(id);
    const h = document.createElement('h3'); h.textContent = shipById(id).name + '  ·  ' + t.kind + ' → ' + t.style; root.appendChild(h);
    const row = document.createElement('div'); row.className = 'row';
    for (const r of SHIP_ROOMS) {
      const c = document.createElement('div'); c.className = 'cell';
      const m = shipRoomMeta(r, t.style);
      c.innerHTML = shipRoomArt(r, t) + '<span class="rl">' + m.icon + ' ' + m.label + '</span>';
      row.appendChild(c);
    }
    root.appendChild(row);
  }
  window.__done = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => { const path = req.url.split('?')[0]; if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; } vite.middlewares(req, res); });
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;

const browser = await launchChromium({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1220, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__done === true', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: outPng, fullPage: true });
await browser.close(); await vite.close(); srv.close();
console.log('wrote', outPng);
