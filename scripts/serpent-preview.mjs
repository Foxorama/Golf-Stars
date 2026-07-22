// Eyes-on preview for the sigil-ceremony serpent (GS-story-serpent). Renders paintSerpent at a few
// (wake, focusHead) states so the reworked HEAD can be iterated visually.
//   node scripts/serpent-preview.mjs      (OUT=/path.png to choose the file)
import { createServer } from 'vite';
import http from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const outPng = process.env.OUT ?? join(tmpdir(), 'gs-serpent.png');
function findChromium() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, process.env.HOME ? join(process.env.HOME, '.cache', 'ms-playwright') : undefined, '/opt/pw-browsers'].filter(Boolean);
  for (const base of bases) { if (!existsSync(base)) continue; for (const d of readdirSync(base)) { if (!d.startsWith('chromium-') || d.includes('headless')) continue; const bin = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(bin)) return bin; } }
  return null;
}

const html = `<!doctype html><meta charset="utf8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;background:#03040a;display:grid;grid-template-columns:1fr 1fr;gap:2px;}
canvas{width:100%;height:auto;display:block;background:#03040a;}
figcaption{position:absolute;color:#8fe0b0;font:600 14px system-ui;padding:6px 10px;}
figure{margin:0;position:relative;}</style>
<body>
<div id="app"></div>
<script type="module">
  import { paintSerpent } from '/src/render/sigilCeremony.ts';
  const CEREMONY = { spread: 700 }; // the ceremony wrapper's framing
  const states = [
    { wake: 0.2, focus: 0, opts: CEREMONY, label: 'Sigil 1 · wake 0.2 (eye sealed)' },
    { wake: 0.4, focus: 0, opts: CEREMONY, label: 'Sigil 2 · wake 0.4 (a sliver)' },
    { wake: 0.6, focus: 0, opts: CEREMONY, label: 'Sigil 3 · wake 0.6 (eye cracks open)' },
    { wake: 0.8, focus: 0, opts: CEREMONY, label: 'Sigil 4 · wake 0.8 (looking back at you)' },
    { wake: 1.0, focus: 0.55, opts: CEREMONY, label: 'Sigil 5 · zooming to head' },
    { wake: 1.0, focus: 1.0, opts: CEREMONY, label: 'Sigil 5 · FINAL reveal (eye wide)' },
    { wake: 1.0, focus: 0, cx: 950, cy: 200, t: 1.5, label: 'FINAL BATTLE framing (CX 950 · pose t)' },
    { wake: 1.0, focus: 0, cx: 950, cy: 200, t: 1.5, opts: { rage: 1 }, label: 'FINAL BATTLE · spitting (rage 1)' },
    { wake: 0.3, focus: 0, opts: { spread: 500, sleep: 0.85 }, cy: 300, label: 'Reseal ending · sung to sleep' },
  ];
  const app = document.getElementById('app');
  const DW = 1000, DH = 640;
  for (const s of states) {
    const fig = document.createElement('figure');
    const cap = document.createElement('figcaption'); cap.textContent = s.label; fig.appendChild(cap);
    const c = document.createElement('canvas'); c.width = DW; c.height = DH; fig.appendChild(c);
    app.appendChild(fig);
    const ctx = c.getContext('2d');
    // abyss backdrop
    const g = ctx.createRadialGradient(500, 320, 30, 500, 320, 620);
    g.addColorStop(0, '#08120e'); g.addColorStop(0.6, '#040a08'); g.addColorStop(1, '#020403');
    ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);
    paintSerpent(ctx, s.cx ?? 500, s.cy ?? 320, s.t ?? 1.2, s.wake, s.focus, s.opts);
  }
  window.__done = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => { const path = req.url.split('?')[0]; if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; } vite.middlewares(req, res); });
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;
const exe = findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
const page = await browser.newPage({ viewport: { width: 1400, height: 920 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__done === true', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: outPng, fullPage: true });
await browser.close(); await vite.close(); srv.close();
console.log('wrote', outPng);
