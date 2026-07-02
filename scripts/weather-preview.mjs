// Eyes-on preview for the journey WEATHER layer (GS-journey-fx / GS-journey-variety): renders one
// canvas per course effect (all ten skies + the clear-sky baseline) over a mock course backdrop, so
// each showpiece can be eyeballed for readability. Pure dev tool — serves the real TS module through
// a vite dev middleware and screenshots with the pre-installed Chromium. No game logic here.
//
//   node scripts/weather-preview.mjs   → writes the PNG to the OS temp dir, prints the path

import { createServer } from 'vite';
import http from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const outPng = process.env.WEATHER_OUT ?? join(tmpdir(), 'gs-weather.png');

function findChromium() {
  const bases = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : undefined,
    process.env.HOME ? join(process.env.HOME, '.cache', 'ms-playwright') : undefined,
    '/opt/pw-browsers',
  ].filter(Boolean);
  for (const base of bases) {
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium-') || d.includes('headless')) continue;
      for (const bin of [join(base, d, 'chrome-win64', 'chrome.exe'), join(base, d, 'chrome-linux', 'chrome')]) {
        if (existsSync(bin)) return bin;
      }
    }
  }
  return null;
}

// Each effect over an archetype whose events plausibly bring it, so the wind tint reads on-world.
// The strike cases (GS-meteor-strikes) freeze the meteor-shower's landing meteor mid-dive and at
// impact over two mock craters on the turf (period 2600ms: dive ≈ t 0.14–0.48, burn ≈ 0.48–0.78).
const STRIKES = [{ c: [150, 380], r: 7 }, { c: [95, 330], r: 6 }];
const CASES = [
  { effect: 'none', archetype: 'verdant' },
  { effect: 'moonlight', archetype: 'verdant' },
  { effect: 'meteorShower', archetype: 'desert' },
  { effect: 'meteorShower', archetype: 'desert', strikes: true, now: 13 * 2600 + 910, label: 'strike — dive' },
  { effect: 'meteorShower', archetype: 'desert', strikes: true, now: 13 * 2600 + 1560, label: 'strike — impact' },
  { effect: 'solarStorm', archetype: 'inferno' },
  { effect: 'ionStorm', archetype: 'tempest' },
  { effect: 'eclipse', archetype: 'frost' },
  { effect: 'nebula', archetype: 'void' },
  { effect: 'comet', archetype: 'crystal' },
  { effect: 'aurora', archetype: 'ocean' },
  { effect: 'spaceJunk', archetype: 'fungal' },
  { effect: 'tradeMarket', archetype: 'cetus' },
  { effect: 'gravityWell', archetype: 'void' },
  { effect: 'frostfall', archetype: 'frost' },
];

const html = `<!doctype html><meta charset="utf8">
<body style="margin:0;background:#0b0d12;display:flex;flex-wrap:wrap;gap:10px;padding:12px;font-family:sans-serif">
<style>figcaption{color:#cfd6e4;font-size:12px;margin:0 0 4px}figure{margin:0}</style>
<script type="module">
  import { createWeather } from '/src/render/weather.ts';
  const CASES = ${JSON.stringify(CASES)};
  const STRIKES = ${JSON.stringify(STRIKES)};
  for (const c of CASES) {
    const fig = document.createElement('figure');
    fig.innerHTML = '<figcaption>' + (c.label ?? c.effect) + ' · ' + c.archetype + '</figcaption>';
    const cv = document.createElement('canvas');
    cv.width = 300; cv.height = 460;
    fig.appendChild(cv);
    document.body.appendChild(fig);
    const g = cv.getContext('2d');
    // Mock backdrop: sky over turf, so tints/showpieces are judged against course readability.
    g.fillStyle = '#0b0d12'; g.fillRect(0, 0, 300, 300);
    g.fillStyle = '#3f8c3f'; g.fillRect(0, 300, 300, 160);
    g.fillStyle = '#5fd45a'; g.beginPath(); g.ellipse(150, 380, 80, 40, 0, 0, Math.PI * 2); g.fill();
    if (c.strikes) {
      // Mark the mock craters so the strike's anchoring is judgeable.
      for (const m of STRIKES) { g.fillStyle = 'rgba(24,18,15,0.9)'; g.beginPath(); g.arc(m.c[0], m.c[1], m.r, 0, Math.PI * 2); g.fill(); }
    }
    const w = createWeather({ effect: c.effect, width: 300, height: 460, archetype: c.archetype, windSpd: 18, windDir: [0.8, 0.6], seed: 1234567, strikeTargets: c.strikes ? () => STRIKES : undefined });
    // A frame time where the flash-cadence showpieces (ion/solar lightning) are mid-flash;
    // the strike cases override it to freeze the landing meteor mid-dive / at impact.
    w.draw(g, c.now ?? 34500);
  }
  window.__done = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.setHeader('content-type', 'text/html');
    res.end(html);
    return;
  }
  vite.middlewares(req, res);
});
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;

const exe = findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1000, height: 1080 }, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__done === true');
await page.waitForTimeout(200);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await vite.close();
srv.close();
console.log('wrote', outPng);
