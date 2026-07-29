// Eyes-on sheet for the Story-Tour CAMPAIGN PICKER (GS-story-campaign-picker): the real Earth
// clubhouse with campaign badges over the golfers, the inspect card's continue/start-over pair, and
// the start-over confirmation — built through the REAL `storyGolferPickerHTML` and the REAL stylesheet
// lifted out of index.html, so what you see here is what the game draws.
//
// Three phone-width columns: a roster with an in-progress + a prologue + a completed champion, the
// inspect card open on a saved campaign, and the destructive confirm for a COMPLETED one (the case
// whose copy has to say the Star Tour character goes too).
//
//   node scripts/campaign-picker-preview.mjs           screenshot to OUT (needs chromium)
//   SERVE=1 node scripts/campaign-picker-preview.mjs   just serve it, print the URL, stay up
import { createServer } from 'vite';
import http from 'node:http';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-campaign-picker.png');
const serveOnly = !!process.env.SERVE;
function findChromium() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', process.env.HOME ? join(process.env.HOME, '.cache', 'ms-playwright') : undefined].filter(Boolean);
  for (const base of bases) {
    if (!existsSync(base)) continue;
    if (existsSync(join(base, 'chromium'))) return join(base, 'chromium');
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium-') || d.includes('headless')) continue;
      const bin = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}

// The game's own stylesheet, verbatim — a preview with hand-written CSS proves nothing.
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const style = indexHtml.slice(indexHtml.indexOf('<style>') + 7, indexHtml.indexOf('</style>'));

const html = `<!doctype html><meta charset="utf8">
<style>${style}</style>
<style>
  html, body { margin: 0; background: #10151c; }
  .rig { display: flex; gap: 18px; padding: 18px; align-items: flex-start; }
  .col { width: 400px; flex: none; }
  .cap { font: 700 12px var(--gs-font); color: #9aa1ad; padding: 0 0 8px 4px; letter-spacing: .04em; }
  .stage { position: relative; height: 900px; border-radius: 14px; overflow: hidden; background: #0b0f16; }
  .stage > .inner { position: absolute; inset: 0; overflow: auto; padding: 10px; }
</style>
<body><div class="rig" id="rig"></div>
<script type="module">
  import { initState, reduce } from '/src/ui/game.ts';
  import { setState } from '/src/app/ctx.ts';
  import { defaultStoryState } from '/src/sim/rpg/story.ts';
  import { emptyCampaignStore, upsertCampaign } from '/src/sim/rpg/storyRoster.ts';
  const { storyGolferPickerHTML } = await import('/src/app/storyScreens.ts');

  const mk = (id, chapter, completed) => ({
    ...defaultStoryState(id), chapter, credits: 1200,
    ...(completed ? { completed: true, alignment: 'herald', trophyIds: ['a','b','c','d','e'] } : {}),
  });
  // A realistic roster: one mid-campaign, one only just started, one finished (a Star Tour champion).
  const roster = [mk('feather-fade', 3, false), mk('longshot-larry', 0, false), mk('backspin-bo', 5, true)]
    .reduce((s, st) => upsertCampaign(s, st), emptyCampaignStore());
  const boot = initState('preview', {}, undefined, roster.campaigns['feather-fade'], roster);
  const picker = reduce(boot, { type: 'openStory' });

  const CASES = [
    { cap: 'ROSTER · badges over the golfers', state: picker },
    { cap: 'INSPECT · a saved campaign (continue / start over)', state: { ...picker, storyInspectId: 'feather-fade' } },
    { cap: 'CONFIRM · overwriting a COMPLETED campaign', state: reduce({ ...picker, storyInspectId: 'backspin-bo' }, { type: 'storyRequestRestart', characterId: 'backspin-bo' }) },
  ];

  document.getElementById('rig').innerHTML = CASES.map((c) => {
    setState(c.state);
    return \`<div class="col"><div class="cap">\${c.cap}</div>
      <div class="stage"><div class="inner gs-main">\${storyGolferPickerHTML()}</div></div></div>\`;
  }).join('');
  window.__done = true;
</script>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
  vite.middlewares(req, res);
});
await new Promise((ok) => srv.listen(serveOnly ? 5199 : 0, ok));
const port = srv.address().port;
if (serveOnly) {
  console.log(`serving http://127.0.0.1:${port}/ — ctrl-c to stop`);
} else {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 940 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction('window.__done === true', { timeout: 60000 });
  await page.screenshot({ path: outPng });
  await browser.close();
  await vite.close();
  srv.close();
  console.log('wrote', outPng);
}
