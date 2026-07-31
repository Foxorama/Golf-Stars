/**
 * GS-shot-lag: frame cost of the PUTT WATCH — the screen the lag was reported worst on.
 *
 * A putts-only animation is the one watch with a deliberately STILL camera (`follow: hadShots`,
 * app.ts), so every frame of it repaints a provably identical picture. This rig plays real strokes
 * until the ball is on the green, commits an interactive putt, and measures the frames while the
 * ball is rolling — the actual window the player calls laggy.
 *
 * Run it on a stash of `main` and again on the branch to A/B. CPU throttling is the point: on a
 * desktop everything is 60fps and the difference hides in the headroom.
 */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const chromePath = process.env.CHROME_PATH;
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.html');
const THROTTLE = Number(process.env.THROTTLE || 12);
const SEEDS = (process.env.SEEDS || '42,7,99').split(',');

const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const all = [];
for (const seed of SEEDS) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const cdp = await page.context().newCDPSession(page);
  await page.goto('file://' + dist + `?intro=0&seed=${seed}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 20000 });
  const click = async (t) => {
    await page.locator('button', { hasText: t }).first().click();
    await page.waitForTimeout(300);
  };
  await page.locator('[data-action*="unending"]').first().click();
  await page.waitForTimeout(400);
  await click('as Feather');
  await click('First Tee');
  await click('Tee Off');
  await page.waitForSelector('[data-playmode]', { timeout: 20000 });
  await page.waitForTimeout(700);

  // Swing until the ball is on the green (the putt decision screen).
  let onGreen = false;
  for (let i = 0; i < 12 && !onGreen; i++) {
    const mode = await page.getAttribute('[data-playmode]', 'data-playmode').catch(() => null);
    if (mode === 'putt') {
      onGreen = true;
      break;
    }
    const swing = page.locator('[data-swing]:not([disabled])').first();
    if (!(await swing.count())) break;
    await swing.click({ timeout: 4000 }).catch(() => {});
    // wait out the flight + any shot card
    for (let k = 0; k < 40; k++) {
      await page.waitForTimeout(250);
      const st = await page.evaluate(() => ({
        mode: document.querySelector('[data-playmode]')?.getAttribute('data-playmode') ?? null,
        overlay: !!document.querySelector('[data-gs-overlay]'),
        swing: !!document.querySelector('[data-swing]:not([disabled])'),
        putt: !!document.querySelector('[data-putt-commit]:not([disabled])'),
      }));
      if (st.overlay) {
        await page.locator('[data-gs-overlay]').first().click({ timeout: 1000 }).catch(() => {});
        continue;
      }
      if (st.putt || st.swing) break;
    }
  }
  if (!onGreen) {
    console.log(`seed ${seed}: never reached the green — skipped`);
    await page.close();
    continue;
  }

  // Throttle only now, so getting here stays quick.
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.__ft = [];
    let last = performance.now();
    const b = (t) => {
      window.__ft.push(t - last);
      last = t;
      requestAnimationFrame(b);
    };
    requestAnimationFrame(b);
  });

  // Commit the putt (the pace meter is sweeping; any tap on ⛳ Putt commits at the live pace).
  const puttBtn = page.locator('[data-putt-commit]:not([disabled])').first();
  if (!(await puttBtn.count())) {
    console.log(`seed ${seed}: no putt control — skipped`);
    await page.close();
    continue;
  }
  await page.evaluate(() => {
    window.__ft.length = 0;
  });
  await puttBtn.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(2500); // the roll + the settle beat

  const m = await page.evaluate(() => {
    const f = window.__ft.slice().filter((x) => x > 0).sort((a, b) => a - b);
    return {
      n: f.length,
      p50: f[(f.length / 2) | 0] ?? 0,
      p95: f[(f.length * 0.95) | 0] ?? 0,
      max: f[f.length - 1] ?? 0,
    };
  });
  const fps = m.p50 ? 1000 / m.p50 : 0;
  console.log(
    `seed ${seed}: putt watch — frames=${String(m.n).padStart(3)} p50=${m.p50.toFixed(1).padStart(6)}ms (${fps.toFixed(1)} fps) p95=${m.p95.toFixed(1).padStart(6)}ms max=${m.max.toFixed(1)}ms`,
  );
  all.push(m);
  await page.close();
}

if (all.length) {
  const mean = (k) => all.reduce((s, x) => s + x[k], 0) / all.length;
  console.log(
    `\nMEAN over ${all.length} putts @ ${THROTTLE}x CPU throttle: p50=${mean('p50').toFixed(1)}ms (${(1000 / mean('p50')).toFixed(1)} fps)  p95=${mean('p95').toFixed(1)}ms`,
  );
}
await browser.close();
