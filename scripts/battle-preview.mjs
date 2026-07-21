// Eyes-on preview for the finale battle (GS-story-battle-2). Mounts mountStoryBattle non-interactively
// (the auto-pilot fires + strikes for itself) for BOTH paths and screenshots the key states — Warden
// assault (the mythic serpent + a telegraphed lunge), Herald assault (the golden wards + blockade lance),
// the aim reveal (reticle on the eye / the seal), and the climaxes.
//   node scripts/battle-preview.mjs      (OUTDIR=/path to choose the folder)
import { createServer } from 'vite';
import http from 'node:http';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const outDir = process.env.OUTDIR ?? join(tmpdir(), 'gs-battle');
mkdirSync(outDir, { recursive: true });

function findChromium() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, process.env.HOME ? join(process.env.HOME, '.cache', 'ms-playwright') : undefined, '/opt/pw-browsers'].filter(Boolean);
  for (const base of bases) { if (!existsSync(base)) continue; for (const d of readdirSync(base)) { if (!d.startsWith('chromium-') || d.includes('headless')) continue; const bin = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(bin)) return bin; } }
  return null;
}

const html = `<!doctype html><meta charset="utf8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;background:#03040a;}</style>
<body>
<script type="module">
  import { mountStoryBattle } from '/src/render/storyBattle.ts';
  window.__mount = (herald) => {
    window.__done = false;
    window.__handle = mountStoryBattle({
      won: true,
      tuning: { shotsToKill: 13, lungesToBreak: 10, rechargeMs: 900 },
      interactive: false,
      herald,
      onDone: () => { window.__done = true; },
    });
  };
  window.__ready = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => { const path = req.url.split('?')[0]; if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; } vite.middlewares(req, res); });
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;
const exe = findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
const page = await browser.newPage({ viewport: { width: 1100, height: 660 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__ready === true', { timeout: 60000 });

for (const herald of [false, true]) {
  const tag = herald ? 'herald' : 'warden';
  await page.evaluate((h) => window.__mount(h), herald);
  await page.waitForTimeout(2600); // mid-assault, a telegraph in flight
  await page.screenshot({ path: join(outDir, `${tag}-1-assault.png`) });
  await page.waitForTimeout(3400); // ~6s in: damage landed / wards cracking
  await page.screenshot({ path: join(outDir, `${tag}-2-assault-late.png`) });
  await page.waitForTimeout(4200); // ~10.2s: past the auto deadline → the aim reveal
  await page.screenshot({ path: join(outDir, `${tag}-3-aim.png`) });
  await page.waitForTimeout(1600); // ~11.8s: the auto strike has landed → climax
  await page.screenshot({ path: join(outDir, `${tag}-4-climax.png`) });
  await page.waitForFunction('window.__done === true', { timeout: 20000 });
}

console.log('battle preview →', outDir);
await browser.close();
srv.close();
await vite.close();
process.exit(0);
