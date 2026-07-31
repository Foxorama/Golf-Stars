// Eyes-on preview for the character-select roster at a real phone size. Renders the REAL
// characterScreen() inside the app shell CSS so overflow / scroll can be measured.
//   node scripts/charselect-preview.mjs           (OUT=/path.png, VW/VH override, MODE=startour|voyage)
import { createServer } from 'vite';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-charselect.png');

const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
const styleBlock = indexHtml.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? '';
const rootVars = indexHtml.match(/:root\s*\{[\s\S]*?\}/)?.[0] ?? '';
const mode = process.env.MODE ?? 'startour';

const html = `<!doctype html><meta charset="utf8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${styleBlock}
<style>${rootVars} html,body{margin:0;background:var(--gs-bg);} </style>
<body>
<div id="app"></div>
<script type="module">
  import { characterScreen } from '/src/render/golferCards.ts';
  // Star Tour roster with earned clubs (the case in the bug screenshot) + an owned bag so the club pill shows.
  const unlocked = ${process.env.FRESH ? '{}' : `{
    'feather-fade': ['4W','2H','SW','9I'],
    'huang-woo-hook': ['4H'],
    'longshot-larry': ['4W','SW','3W'],
    'backspin-bo': ['5I','9I','3W'],
  }`};
  const opts = ${mode === 'voyage'
    ? `{ modeName: 'The Voyage', winnable: true, ascension: { max: 15, sel: 8 }, clubSet: { owned: 'epic', sel: 'epic' }, unlockLadder: { 'feather-fade': 4, 'huang-woo-hook': 1, 'longshot-larry': 9, 'backspin-bo': 3 } }`
    : `{ modeName: 'Star Tour', winnable: false, clubSet: { owned: 'epic', sel: 'epic' } }`};
  document.getElementById('app').innerHTML =
    '<main class="gs-main gs-main--wide gs-main--fit">' + characterScreen(unlocked, opts) + '</main>' +
    '<button class="gs-cog" data-open-settings="1">⚙</button>';
  // Report overflow measurements.
  const de = document.documentElement;
  window.__metrics = {
    scrollH: de.scrollHeight, clientH: de.clientHeight,
    scrollW: de.scrollWidth, clientW: de.clientWidth,
    vScroll: de.scrollHeight - de.clientHeight,
    hScroll: de.scrollWidth - de.clientWidth,
  };
  window.__done = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => { const path = req.url.split('?')[0]; if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; } vite.middlewares(req, res); });
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;

const browser = await launchChromium({ args: ['--no-sandbox'] });
const vw = Number(process.env.VW ?? 390), vh = Number(process.env.VH ?? 844);
const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__done === true', { timeout: 60000 });
const metrics = await page.evaluate('window.__metrics');
console.log('viewport', vw + 'x' + vh, 'mode', mode);
console.log('metrics', JSON.stringify(metrics));
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: outPng, fullPage: true });
await browser.close(); await vite.close(); srv.close();
console.log('wrote', outPng);
