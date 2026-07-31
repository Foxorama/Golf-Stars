/**
 * Eyes-on companion to `play-frame-probe.mjs` — screenshots the aim screen at a driver-off-the-tee
 * decision on the viewports the framing is tuned against. `node scripts/play-frame-shot.mjs <tag>`
 * writes `.tmp/frame-<tag>-<viewport>.png`.
 */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const tag = process.argv[2] ?? 'now';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist/index.html');
const out = path.join(root, '.tmp');
mkdirSync(out, { recursive: true });

const VIEWPORTS = [
  ['iphone14', 390, 844],
  ['small', 320, 568],
  ['embed', 820, 760],
  ['desktop', 1920, 1080],
];

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
try {
  for (const [label, width, height] of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
      timeout: 15000,
    });
    const click = async (t) => {
      await page.locator('button', { hasText: t }).first().click();
      await page.waitForTimeout(320);
    };
    await click('The Voyage');
    await click('Voyage as Feather');
    await click('First Tee');
    await click('Tee Off');
    await page.waitForSelector('[data-playmode="aim"]', { timeout: 15000 });
    await page.waitForTimeout(700);
    const file = path.join(out, `frame-${tag}-${label}.png`);
    await page.screenshot({ path: file });
    console.log(file);
    await page.close();
  }
} finally {
  await browser.close();
}
