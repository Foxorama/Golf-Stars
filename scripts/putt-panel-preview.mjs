// Eyes-on sheet for the PUTT panel (GS-putt-panel): the real bottom-of-screen control stack the
// player sees on the green, built through the REAL `playFrameHTML` / `puttAimRow` / `mountPuttMeter`
// and the REAL stylesheet lifted out of index.html — so what you see here is what the game draws.
//
// Three phone-width columns: a plain putt, a long putt whose read has run out (a narrow make band),
// and a fringe putt read by a green-reading caddy (nudges disabled, the chip toggle present).
//   node scripts/putt-panel-preview.mjs        (OUT=/path.png)
import { createServer } from 'vite';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';


const outPng = process.env.OUT ?? join(tmpdir(), 'gs-putt-panel.png');


// The game's own stylesheet, verbatim — a preview with hand-written CSS proves nothing.
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const style = indexHtml.slice(indexHtml.indexOf('<style>') + 7, indexHtml.indexOf('</style>'));

const html = `<!doctype html><meta charset="utf8">
<style>${style}</style>
<style>
  html, body { margin: 0; background: #10151c; }
  .rig { display: flex; gap: 18px; padding: 18px; align-items: flex-end; }
  .col { width: 390px; }
  .cap { font: 700 12px var(--gs-font); color: #9aa1ad; padding: 0 0 8px 4px; letter-spacing: .04em; }
  /* A slab of green so the glass panel is composited over turf, like it is in play. */
  .stage { position: relative; height: 440px; border-radius: 14px; overflow: hidden;
           background: linear-gradient(180deg, #57b972, #3f9a5c 60%, #2f7f4b); }
  .stage .gs-shot--full { height: 100%; }
</style>
<body><div class="rig" id="rig"></div>
<script type="module">
  import { setState } from '/src/app/ctx.ts';
  // The read row asks the live loadout who found the line; give it one before anything renders.
  setState({ run: { loadout: { perks: ['mystic-mole'] } } });
  const { playFrameHTML } = await import('/src/app/playFrame.ts');
  const { puttAimRow } = await import('/src/app/playHud.ts');
  const { mountPuttMeter } = await import('/src/render/puttMeter.ts');

  const CASES = [
    { cap: 'PLAIN PUTT · 15y', aim: 0, brk: -1.9, reads: false, fringe: false, band: 0.13, note: 'Slope <b>breaks 1.9yd left</b>' },
    { cap: 'LONG PUTT · read run out, band pinched', aim: 2.4, brk: 2.4, reads: false, fringe: false, band: 0.055, note: 'Slope <b>breaks 2.4yd right</b> · read ends <b>7y</b>' },
    { cap: 'FRINGE · a caddy has the line', aim: -1.2, brk: -1.2, reads: true, fringe: true, band: 0.16, note: 'Slope <b>double-breaks · nets 1.2yd left</b> · from the fringe' },
  ];

  const rig = document.getElementById('rig');
  rig.innerHTML = CASES.map((c, i) => \`
    <div class="col">
      <div class="cap">\${c.cap}</div>
      <div class="stage">\${playFrameHTML({
        mode: 'putt',
        map: '',
        top: '',
        rows: [
          puttAimRow(c.brk, c.aim, c.reads, c.reads, c.fringe),
          \`<div id="puttmeter\${i}" class="gs-puttmeter"></div>\`,
          \`<div class="gs-puttnote">\${c.note}</div>\`,
        ],
        commit: '<button class="gs-btn gs-btn--primary" data-putt-commit="1">⛳ Putt</button>',
        caddyId: 'mystic-mole',
        nav: { whole: false, viewDisabled: true, settingsDisabled: false },
        autoFinishDisabled: false,
        bag: { code: 'Pt', name: 'Putter', clubs: 12, disabled: true },
        aim: { icon: '◎', label: 'Auto aim', on: false, disabled: true },
        lefty: false,
      })}</div>
    </div>\`).join('');

  CASES.forEach((c, i) => {
    const el = document.getElementById('puttmeter' + i);
    mountPuttMeter(el, {
      width: Math.max(240, Math.min(420, el.clientWidth || 300)),
      band: c.band,
      onCommit: () => {},
    });
  });
  // Let one sweep frame land before the shot.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__done = true;
</script>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
  vite.middlewares(req, res);
});
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;
const browser = await launchChromium({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1260, height: 500 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__done === true', { timeout: 60000 });
await page.screenshot({ path: outPng });
await browser.close();
await vite.close();
srv.close();
console.log('wrote', outPng);
