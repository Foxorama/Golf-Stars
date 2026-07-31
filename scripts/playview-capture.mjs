/**
 * GS-shot-lag eyes-on rig: capture the play view at the moments the scene cache is in force —
 * mid-flight (follow-cam, direct paint), at rest after a shot (camera settled → BLIT), and during
 * a putt watch (still camera → BLIT from the first frame).
 *
 * Writes PNGs to scripts/out/. Run on a stash of main and on the branch to compare by eye.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launchChromium } from './chromium.mjs';


const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist/index.html');
const out = process.env.OUT ?? path.join(tmpdir(), 'gs-playview');
const TAG = process.env.TAG || 'branch';
mkdirSync(out, { recursive: true });

const browser = await launchChromium({ args: ['--no-sandbox'] });
for (const [seed, biomeNote] of [['42', ''], ['7', ''], ['99', '']]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
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

  await page.locator('[data-swing]:not([disabled])').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(420);
  await page.screenshot({ path: path.join(out, `${TAG}-seed${seed}-flight.png`) });
  await page.waitForTimeout(2600); // well past the run-out: camera settled, blit path
  await page.screenshot({ path: path.join(out, `${TAG}-seed${seed}-rest.png`) });

  // On to the green for a putt watch.
  for (let i = 0; i < 10; i++) {
    const st = await page.evaluate(() => ({
      overlay: !!document.querySelector('[data-gs-overlay]'),
      putt: !!document.querySelector('[data-putt-commit]:not([disabled])'),
      swing: !!document.querySelector('[data-swing]:not([disabled])'),
    }));
    if (st.overlay) {
      await page.locator('[data-gs-overlay]').first().click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(300);
      continue;
    }
    if (st.putt) break;
    if (st.swing) {
      await page.locator('[data-swing]:not([disabled])').first().click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(3200);
      continue;
    }
    await page.waitForTimeout(400);
  }
  const pb = page.locator('[data-putt-commit]:not([disabled])').first();
  if (await pb.count()) {
    await pb.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, `${TAG}-seed${seed}-puttwatch.png`) });
  }
  await page.close();
  console.log(`seed ${seed}${biomeNote} captured`);
}
await browser.close();
