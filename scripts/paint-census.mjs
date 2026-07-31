/**
 * GS-shot-lag: canvas paint census for the play view.
 *
 * Counts every `fill`/`stroke`/`clip`/`drawImage` the page issues while a putt is rolling, split by
 * which canvas received it and sampled by call site. This is the rig that found the real number: a
 * green at the putt camera is about **100,000 canvas ops per scene paint** — two orders of magnitude
 * more than the ~1,500 top-level prims suggest, because most of the world lives inside `clip` groups
 * — so repainting it every frame is what made the green the laggiest screen in the game.
 *
 * A detached canvas is bucketed separately and split two ways on purpose: the play view's static
 * scene BITMAP (expected — one paint per camera) versus an ORPHANED play-view canvas still animating
 * after its container was wiped (a leak — a class of bug this codebase has fixed before).
 *
 * Read it as: steady-state ops/frame should be tens. Thousands means the world is being re-stroked.
 */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const chromePath = process.env.CHROME_PATH;
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.html');
const SEED = process.env.SEED || '42';

const COUNTER = () => {
  const w = window;
  w.__paint = { by: Object.create(null), sites: Object.create(null), sampled: 0, frames: 0, on: false };
  const P = CanvasRenderingContext2D.prototype;
  for (const m of ['fill', 'stroke', 'clip', 'drawImage']) {
    const raw = P[m];
    P[m] = function (...a) {
      if (w.__paint.on) {
        const cv = this.canvas;
        // A DETACHED canvas is either the static-scene bitmap (never mounted, so no CSS size) or an
        // ORPHANED play-view canvas still drawing after its container was wiped — different bugs.
        const key = !cv.isConnected
          ? (cv.style.width ? `ORPHAN-playview(${cv.style.width})` : 'scene-bitmap') + '/' + m
          : (cv.parentElement?.id || cv.parentElement?.className || 'body') + '/' + m;
        w.__paint.by[key] = (w.__paint.by[key] || 0) + 1;
        w.__paint.sampled++;
        if (w.__paint.sampled % 97 === 0) {
          const st = (new Error().stack || '').split('\n').slice(2, 5).map((l) => l.trim()).join(' <- ');
          w.__paint.sites[st] = (w.__paint.sites[st] || 0) + 1;
        }
      }
      return raw.apply(this, a);
    };
  }
  const rawCreate = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...rest) {
    if (w.__paint.on && String(tag).toLowerCase() === 'canvas') w.__paint.by['*canvasCreated'] = (w.__paint.by['*canvasCreated'] || 0) + 1;
    return rawCreate.call(this, tag, ...rest);
  };
  const raf = window.requestAnimationFrame.bind(window);
  const beat = () => {
    if (w.__paint.on) w.__paint.frames++;
    raf(beat);
  };
  raf(beat);
};

const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(COUNTER);
await page.goto('file://' + dist + `?intro=0&seed=${SEED}`, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 20000 });
const click = async (t) => {
  await page.locator('button', { hasText: t }).first().click();
  await page.waitForTimeout(320);
};
await page.locator('[data-action*="unending"]').first().click();
await page.waitForTimeout(400);
await click('as Feather');
await click('First Tee');
await click('Tee Off');
await page.waitForSelector('[data-playmode]', { timeout: 20000 });

// Play on until the ball is on the green.
for (let i = 0; i < 14; i++) {
  const st = await page.evaluate(() => ({
    overlay: !!document.querySelector('[data-gs-overlay]'),
    putt: !!document.querySelector('[data-putt-commit]:not([disabled])'),
    swing: !!document.querySelector('[data-swing]:not([disabled])'),
  }));
  if (st.putt) break;
  if (st.overlay) {
    await page.locator('[data-gs-overlay]').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(300);
    continue;
  }
  if (st.swing) {
    await page.locator('[data-swing]:not([disabled])').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(3200);
    continue;
  }
  await page.waitForTimeout(400);
}

// Roll the putt, let the one start-up scene paint land, then measure the STEADY state.
await page.locator('[data-putt-commit]:not([disabled])').first().click({ timeout: 5000 });
await page.waitForTimeout(350);
await page.evaluate(() => {
  window.__paint.by = Object.create(null);
  window.__paint.sites = Object.create(null);
  window.__paint.sampled = 0;
  window.__paint.frames = 0;
  window.__paint.on = true;
});
await page.waitForTimeout(1200);
const m = await page.evaluate(() => {
  window.__paint.on = false;
  return { by: window.__paint.by, frames: window.__paint.frames, sites: window.__paint.sites };
});

console.log(`putt watch, steady state — frames=${m.frames}\n`);
let total = 0;
for (const [k, v] of Object.entries(m.by).sort((a, b) => b[1] - a[1])) {
  total += v;
  console.log(`${String(v).padStart(8)}  ${(v / m.frames).toFixed(1).padStart(9)}/frame  ${k}`);
}
console.log(`${String(total).padStart(8)}  ${(total / m.frames).toFixed(1).padStart(9)}/frame  TOTAL`);
const sites = Object.entries(m.sites).sort((a, b) => b[1] - a[1]).slice(0, 6);
if (sites.length) {
  console.log('\ntop call sites (1-in-97 sample):');
  for (const [k, v] of sites) console.log(`${String(v).padStart(5)}  ${k}`);
}
await browser.close();
