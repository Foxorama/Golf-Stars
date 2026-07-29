/**
 * The bag + club picker, and the screen it bought back (GS-hud-bag).
 *
 * The play screen's aim HUD used to spend a quarter of a phone on a control panel: a club cycler, a
 * power bar with its own label line, a spray-odds legend and a carry range. Three of those four
 * restated the aim cone already drawn on the map, and the cycler was one tap per club — a dozen taps
 * to reach a wedge from the driver. This is the guard for the replacement: the club lives behind a
 * bag in the bottom-right corner, the power rides the commit button, and the map gets the rest.
 *
 * Layout, focus and DOM wiring — all of it invisible to the pure-sim suite — so this drives the BUILT
 * artifact in a real browser, like `tests/play-hud-frame.test.ts`. Skipped with no Chromium.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import type { Browser, Page } from 'playwright-core';
import { findChromium as findChromiumShared } from './chromium';

const dist = resolve(__dirname, '../dist/index.html');
const chromePath = findChromiumShared();

/** Boot the built game and play through to the first shot decision. */
async function toFirstTee(browser: Browser): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
    timeout: 10_000,
  });
  const click = async (t: string, ms = 350) => {
    await page.locator('button', { hasText: t }).first().click();
    await page.waitForTimeout(ms);
  };
  await click('The Voyage');
  await click('Voyage as Feather');
  await click('First Tee');
  await click('Tee Off', 900);
  await page.waitForSelector('[data-playmode="aim"]', { timeout: 10_000 });
  await page.waitForTimeout(500); // let the band self-measure + re-render once (GS-play-hud-space)
  return page;
}

describe('the bag + club picker (GS-hud-bag)', () => {
  it.runIf(chromePath)(
    'gives the golf back the bottom of the screen',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      const page = await toFirstTee(browser);
      try {
        const m = await page.evaluate(() => {
          const box = (s: string) => {
            const el = document.querySelector(s);
            return el ? el.getBoundingClientRect() : null;
          };
          const top = box('.gs-hud-top')!;
          const bottom = box('.gs-hud-bottom')!;
          return {
            H: window.innerHeight,
            band: (bottom.top - top.bottom) / window.innerHeight,
            bottomFrac: bottom.height / window.innerHeight,
            // The three readouts that duplicated the aim cone are gone from the shot screen.
            cycler: !!document.querySelector('[data-cycle]'),
            powerBar: !!document.querySelector('.gs-powerbar'),
            legend: !!document.querySelector('.gs-legend-line'),
            // …and the power is still readable, on the commit button itself.
            power: /Power\s*\d+%/.test(document.querySelector('.gs-hud-controls')?.textContent ?? ''),
            slim: !!document.querySelector('.gs-hud-controls--slim'),
          };
        });
        expect(m.cycler, 'the club cycler must be gone from the shot screen').toBe(false);
        expect(m.powerBar, 'the standalone power bar must be gone').toBe(false);
        expect(m.legend, 'the spray-odds legend must be gone').toBe(false);
        expect(m.power, 'the pull power must still read somewhere on the panel').toBe(true);
        expect(m.slim, 'the aim panel must be the slim variant').toBe(true);
        // The old bar (panel + padding) ran ~17% of an 844px phone; one badge-tall bar is ~8%.
        expect(m.bottomFrac, `the bottom bar is ${(m.bottomFrac * 100).toFixed(1)}% of the screen`).toBeLessThan(0.11);
        // …which is the point: the map's clear band. It was 0.50 with the old panel at this scale.
        expect(m.band, `clear band ${(m.band * 100).toFixed(1)}%`).toBeGreaterThan(0.68);
      } finally {
        await browser.close();
      }
    },
    90_000,
  );

  it.runIf(chromePath)(
    'the bag opens the whole bag, and picking a club arms it',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      const page = await toFirstTee(browser);
      try {
        const face = () => page.textContent('.gs-hud-bagclub');
        const before = await face();
        expect(before, 'the bag face names the club in hand').toBeTruthy();

        await page.click('[data-clubpick="open"]');
        await page.waitForSelector('.gs-clubpick', { timeout: 5000 });
        const sheet = await page.evaluate(() => ({
          clubs: document.querySelectorAll('[data-clubpick-id]').length,
          selected: document.querySelectorAll('.gs-clubpick__club--on').length,
          // The whole app behind the sheet is sealed (GS-a11y-focus does this for any direct child
          // of #app — the picker gets it by being one, not by hand-rolling a trap).
          mainInert: (document.querySelector('#app > main') as HTMLElement | null)?.inert ?? null,
          dialog: document.querySelector('.gs-clubpick')?.getAttribute('role'),
          // Every row must clear the 44px touch target.
          shortRows: [...document.querySelectorAll('[data-clubpick-id]')].filter(
            (b) => b.getBoundingClientRect().height < 44,
          ).length,
          // …and the sheet must fit the viewport, scrolling inside it (GS-a11y-sheet-scroll).
          fits: document.querySelector('.gs-clubpick')!.getBoundingClientRect().top >= -1,
        }));
        expect(sheet.clubs, 'the whole legal bag is on the sheet').toBeGreaterThan(7);
        expect(sheet.selected, 'exactly one club reads as the current pick').toBe(1);
        expect(sheet.mainInert, 'the page behind the sheet must be inert').toBe(true);
        expect(sheet.dialog).toBe('dialog');
        expect(sheet.shortRows, 'every club row must be a 44px target').toBe(0);
        expect(sheet.fits).toBe(true);

        // Pick a DIFFERENT club: the sheet closes and the bag face changes with it.
        await page.evaluate(() => {
          const rows = [...document.querySelectorAll<HTMLElement>('[data-clubpick-id]')];
          (rows.find((r) => !r.classList.contains('gs-clubpick__club--on')) ?? rows[0]!).click();
        });
        await page.waitForTimeout(400);
        expect(await page.$('.gs-clubpick'), 'picking a club closes the sheet').toBeNull();
        expect(await face(), 'the bag face follows the pick').not.toBe(before);

        // Escape closes it too — the shared back intent, not a bespoke key handler (GS-android-back).
        await page.click('[data-clubpick="open"]');
        await page.waitForSelector('.gs-clubpick', { timeout: 5000 });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        expect(await page.$('.gs-clubpick'), 'Escape must close the bag').toBeNull();
      } finally {
        await browser.close();
      }
    },
    90_000,
  );
});
