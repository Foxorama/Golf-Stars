/**
 * GS-shot-lag: frame cost of a SHOT WATCH — the follow-cam case, where the camera pans and the
 * scene genuinely has to be rebuilt. The putt-watch twin of this rig measures the still camera.
 *
 * Plays real tee shots and measures the frames while the ball is in the air and running out.
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

  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  await page.waitForTimeout(400);
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
  const swing = page.locator('[data-swing]:not([disabled])').first();
  if (!(await swing.count())) {
    console.log(`seed ${seed}: no swing control — skipped`);
    await page.close();
    continue;
  }
  await page.evaluate(() => {
    window.__ft.length = 0;
  });
  await swing.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(3000); // flight + run-out

  const m = await page.evaluate(() => {
    const f = window.__ft.slice().filter((x) => x > 0).sort((a, b) => a - b);
    return { n: f.length, p50: f[(f.length / 2) | 0] ?? 0, p95: f[(f.length * 0.95) | 0] ?? 0 };
  });
  console.log(
    `seed ${seed}: shot watch — frames=${String(m.n).padStart(3)} p50=${m.p50.toFixed(1).padStart(6)}ms (${(1000 / (m.p50 || 1)).toFixed(1)} fps) p95=${m.p95.toFixed(1)}ms`,
  );
  all.push(m);
  await page.close();
}
if (all.length) {
  const mean = (k) => all.reduce((s, x) => s + x[k], 0) / all.length;
  console.log(`\nMEAN over ${all.length} shots @ ${THROTTLE}x: p50=${mean('p50').toFixed(1)}ms (${(1000 / mean('p50')).toFixed(1)} fps) p95=${mean('p95').toFixed(1)}ms`);
}
await browser.close();
