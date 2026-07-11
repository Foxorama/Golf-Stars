// Eyes-on preview for the redesigned journey cockpit (GS-journey-cockpit): drives the REAL travelScreen()
// with a crafted mid-voyage travel state, at a phone viewport, so the fixed layout / map / dock / rail can
// be iterated visually.  node scripts/travel-preview.mjs
import { createServer } from 'vite';
import http from 'node:http';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const outPng = process.env.OUT ?? join(tmpdir(), 'gs-travel.png');
function findChromium() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, process.env.HOME ? join(process.env.HOME, '.cache', 'ms-playwright') : undefined, '/opt/pw-browsers'].filter(Boolean);
  for (const base of bases) { if (!existsSync(base)) continue; for (const d of readdirSync(base)) { if (!d.startsWith('chromium-') || d.includes('headless')) continue; const bin = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(bin)) return bin; } }
  return null;
}
// Pull the <style> block out of index.html so the preview uses the real CSS tokens + cockpit rules.
const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
const styleBlock = indexHtml.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '';
const rootVars = indexHtml.match(/:root\s*\{[\s\S]*?\}/)?.[0] ?? '';

const html = `<!doctype html><meta charset="utf8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${styleBlock}
<style>${rootVars} body{margin:0;background:var(--gs-bg);}</style>
<body>
<div id="app"></div>
<script type="module">
  import { initState, reduce } from '/src/ui/game.ts';
  import { routeOptions } from '/src/sim/rpg/run.ts';
  import { setState } from '/src/app/ctx.ts';
  import { travelScreen } from '/src/app/travelScreens.ts';

  // A real run for a real character (real bag/loadout/course), then patched to a deep mid-voyage travel stop.
  let s = initState(4242);
  s = reduce(s, { type: 'selectCharacter', characterId: 'larry' });
  const run = s.run;
  run.stopIndex = 6;
  run.distanceFromStart = 21;
  run.credits = 940;
  run.fuel = 8;
  // A believable travelled trail (real theme ids → sky coords + biome glyphs resolve).
  const trailThemes = ['crux', 'triangulum-australe', 'grus', 'carina', 'lupus', 'vela'];
  run.history = trailThemes.map((themeId, i) => ({
    stopIndex: i, distanceFromStart: 3 + i * 3, biome: 'verdant', themeId,
    rarity: 'common', stableford: 20, gross: 30, cut: 10, passed: true, creditsEarned: 100, aces: 0,
  }));
  // The current stop is the last history entry in app.ts's slice(0,-1) logic — add one for "YOU".
  run.history.push({ stopIndex: 6, distanceFromStart: 21, biome: 'inferno', themeId: 'scorpius', rarity: 'rare', stableford: 18, gross: 32, cut: 12, passed: true, creditsEarned: 120, aces: 0 });

  s = { ...s, screen: 'travel', routes: routeOptions(run) };
  setState(s);
  if (new URLSearchParams(location.search).get('depot')) {
    const tv = await import('/src/app/travelScreens.ts');
    tv.travelView.depotOpen = true;
  }
  const app = document.getElementById('app');
  app.innerHTML = '<main class="gs-main">' + travelScreen() + '</main>';
  window.__done = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => { const path = req.url.split('?')[0]; if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; } vite.middlewares(req, res); });
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;
const exe = findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
const vw = Number(process.env.VW ?? 400), vh = Number(process.env.VH ?? 860);
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/${process.env.QS ?? ''}`);
await page.waitForFunction('window.__done === true', { timeout: 60000 });
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: outPng });
await browser.close(); await vite.close(); srv.close();
console.log('wrote', outPng);
