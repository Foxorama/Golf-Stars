// Eyes-on + measurement rig for the UI-SCALE ladder (GS-a11y-sheet-scroll · GS-a11y-tight-fit).
//
// The whole class of bug this exists for is invisible at the ship scale and invisible to the pure
// suite: a `position: fixed` sheet that grows past the phone, a grid track that blows out, a HUD that
// eats the golf. Chromium at 390x844 with the scale + reader settings pre-seeded is the only place
// you can see it, so this drives the BUILT app to a named screen and reports what is off-screen and
// whether anything can scroll to it.
//
//   node scripts/a11y-scale-preview.mjs <screen> [scale] [readable]
//   node scripts/a11y-scale-preview.mjs settings 1.45 1
//   VW=320 OUT=/tmp/x.png node scripts/a11y-scale-preview.mjs play 1.3 0
//
// `scrollAnc` in the report is the important column: content hanging off the screen is only a BUG
// when it reads `none`. Run it before and after any change to a viewport-locked screen.
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';

function findChromium() {
  const bases = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    process.env.HOME ? join(process.env.HOME, '.cache', 'ms-playwright') : undefined,
  ].filter(Boolean);
  for (const base of bases) {
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium-') || d.includes('headless')) continue;
      const bin = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}

const dist = 'file://' + resolve(process.cwd(), 'dist/index.html');
if (!existsSync(resolve(process.cwd(), 'dist/index.html'))) {
  console.error('dist/index.html missing — run `npx vite build` first.');
  process.exit(1);
}
const screen = process.argv[2] ?? 'settings';
const scale = Number(process.argv[3] ?? 1.45);
const readable = (process.argv[4] ?? '1') === '1';
const VW = Number(process.env.VW ?? 390);
const VH = Number(process.env.VH ?? 844);
const out = process.env.OUT ?? join(tmpdir(), `gs-a11y-${screen}-${scale}.png`);

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });

// The scale is stamped on <html> before the first paint, so it has to be in storage BEFORE the boot
// we measure — hence the load / seed / reload.
async function boot(query = '') {
  const url = dist + '?intro=0&seed=42' + query;
  const booted = () => document.getElementById('app')?.getAttribute('data-booted') === '1';
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(booted, { timeout: 20000 });
  await page.evaluate(([s, r]) => {
    localStorage.setItem('gs_settings', JSON.stringify({
      sound: false, music: false, haptics: false, reducedMotion: true, leftHanded: false,
      fastShots: true, lastAscension: 0, aimMode: 'auto', readableFont: r, uiScale: s,
    }));
  }, [scale, readable]);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(booted, { timeout: 20000 });
  await page.waitForTimeout(400);
}
const click = async (t, ms = 400) => {
  await page.locator('button', { hasText: t }).first().click();
  await page.waitForTimeout(ms);
};

const SCREENS = {
  title: () => boot(),
  settings: async () => { await boot(); await page.locator('.gs-cog, [data-open-settings]').first().click(); await page.waitForTimeout(400); },
  character: () => boot('&screen=character'),
  dossier: async () => { await boot('&screen=character'); await page.locator('.gs-charcard-port').first().click(); await page.waitForTimeout(400); },
  arcintro: async () => { await boot(); await click('The Voyage'); await click('Voyage as Feather'); },
  scout: async () => { await SCREENS.arcintro(); await page.locator('[data-introfield="open"]').first().click(); await page.waitForTimeout(400); },
  holeintro: async () => { await SCREENS.arcintro(); await click('First Tee'); },
  play: async () => { await SCREENS.holeintro(); await click('Tee Off', 900); },
  travel: () => boot('&screen=travel'),
  shop: () => boot('&screen=shop'),
  clubhouse: () => boot('&screen=clubhouse'),
  trademarket: () => boot('&screen=trademarket'),
  starmart: () => boot('&screen=starmart'),
};
if (!SCREENS[screen]) {
  console.error('screens:', Object.keys(SCREENS).join(', '));
  process.exit(1);
}
await SCREENS[screen]();

const report = await page.evaluate(() => {
  const de = document.documentElement;
  const vw = window.innerWidth, vh = window.innerHeight;
  const out = { fit: de.dataset.gsFit, vw, vh, docScroll: de.scrollHeight - de.clientHeight, clipped: [] };
  const seen = new Set();
  for (const el of document.querySelectorAll('#app, #app *')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
    const overTop = -r.top, overBot = r.bottom - vh, overR = r.right - vw, overL = -r.left;
    if (overTop <= 1 && overBot <= 1 && overR <= 1 && overL <= 1) continue;
    const key = (typeof el.className === 'string' && el.className.split(' ')[0]) || el.tagName;
    const id = key + Math.round(r.top);
    if (seen.has(id)) continue;
    seen.add(id);
    let scrollAnc = 'none';
    for (let p = el.parentElement; p; p = p.parentElement) {
      const pc = getComputedStyle(p);
      if (/(auto|scroll)/.test(pc.overflowY) && p.scrollHeight > p.clientHeight + 1) { scrollAnc = String(p.className || p.tagName); break; }
    }
    out.clipped.push({
      cls: key, top: Math.round(r.top), bottom: Math.round(r.bottom),
      overTop: Math.round(overTop), overBot: Math.round(overBot), overR: Math.round(overR),
      scrollAnc, text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
    });
  }
  out.clipped.sort((a, b) => b.overTop + b.overBot + b.overR - (a.overTop + a.overBot + a.overR));
  out.clipped = out.clipped.slice(0, 16);
  return out;
});

console.log(`== ${screen}  scale ${scale}  readable ${readable}  ${VW}x${VH}`);
console.log(`   data-gs-fit=${report.fit}  page scroll ${report.docScroll}px`);
if (!report.clipped.length) console.log('   nothing off-screen');
for (const c of report.clipped) {
  console.log(
    `   ${c.cls.padEnd(24).slice(0, 24)} top=${String(c.top).padStart(5)} ` +
    `over[T${c.overTop} B${c.overBot} R${c.overR}] scroll=${c.scrollAnc || 'none'} | ${c.text}`,
  );
}
await page.screenshot({ path: out });
console.log('   wrote', out);
await browser.close();
