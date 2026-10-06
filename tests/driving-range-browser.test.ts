import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { chromePath } from './chromium';

/**
 * THE DRIVING RANGE in a real browser (GS-driving-range).
 *
 * The pure half (`driving-range.test.ts`) proves the rules; this proves the BUILT page wires them: the
 * title offers the range where the greyed "The Destination" teaser used to sit, tapping it lands on the
 * first tee with the coach card up as a real dialog, Back reads the card as "got it" rather than raising
 * the leave-the-round confirm, and on the wild-ball hole the upgrades row sits in the controls panel —
 * where fitting Shank Guard changes the odds it quotes AND the cone drawn on the map.
 */

const dist = resolve(__dirname, '../dist/index.html');
const PHONE = { width: 390, height: 844 };

describe.runIf(chromePath)('the Driving Range (GS-driving-range)', () => {
  let browser: import('playwright-core').Browser;
  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  async function boot() {
    const page = await browser.newPage({ viewport: PHONE });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(() => {
      try {
        if (sessionStorage.getItem('gs-test-seeded')) return;
        sessionStorage.setItem('gs-test-seeded', '1');
        localStorage.clear();
        // Fast Shots skips the per-shot result card, so a hole can be walked without tapping each one.
        localStorage.setItem('fc_settings', JSON.stringify({ fastShots: true }));
      } catch {
        /* storage denied is another feature's problem */
      }
    });
    await page.goto(`file://${dist}?intro=0&seed=42`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
      timeout: 15_000,
    });
    return { page, errors };
  }

  const openRange = async (page: import('playwright-core').Page) => {
    await page.locator(`[data-action='{"type":"openRange"}']`).first().click();
    await page.waitForSelector('.gs-shot--full');
  };

  it('replaces The Destination on the title, and opens onto the first tee with the coach up', async () => {
    const { page, errors } = await boot();
    try {
      const title = await page.locator('.gs-navtiles--games').textContent();
      expect(title).toContain('Driving Range');
      expect(title).not.toContain('The Destination');
      await openRange(page);
      const coach = page.locator('.gs-range-coach');
      expect(await coach.count()).toBe(1);
      expect(await coach.textContent()).toContain('Hitting a shot');
      // A real dialog over a sealed app (GS-a11y-focus): a direct child of #app, so the pass finds it.
      expect(await page.locator('#app > .gs-range-backdrop').count()).toBe(1);
      expect(await page.locator('main[inert]').count()).toBe(1);
      await coach.locator('button').click();
      expect(await page.locator('.gs-range-coach').count()).toBe(0);
      expect(await page.locator('[data-swing]').count()).toBe(1);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('Back closes the coach card instead of offering to leave the round', async () => {
    const { page, errors } = await boot();
    try {
      await openRange(page);
      await page.keyboard.press('Escape');
      expect(await page.locator('.gs-range-coach').count()).toBe(0);
      expect(await page.locator('body').textContent()).not.toContain('Leave this round?');
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('on the wild-ball hole, fitting Shank Guard changes the quoted odds and the cone together', async () => {
    const { page, errors } = await boot();
    try {
      await openRange(page);
      // Walk the first two holes: dismiss whichever coach card is up, auto-finish, continue.
      for (let hole = 0; hole < 2; hole++) {
        for (let guard = 0; guard < 40; guard++) {
          const coachBtn = page.locator('.gs-range-coach button');
          if (await coachBtn.count()) await coachBtn.click();
          const cont = page.locator(`[data-action='{"type":"holeComplete"}']`);
          if (await cont.count()) {
            await cont.click();
            break;
          }
          const auto = page.locator(`[data-action='{"type":"autoShotHole"}']:not([disabled])`);
          if (await auto.count()) await auto.click();
          await page.waitForTimeout(400);
        }
      }
      // Hole 3: the upgrades lesson, then the row in the controls panel.
      await page.waitForSelector('.gs-range-coach', { timeout: 15_000 });
      expect(await page.locator('.gs-range-coach').textContent()).toContain('Upgrades change your shot');
      await page.locator('.gs-range-coach button').click();
      const chip = page.locator('.gs-range-chip', { hasText: 'Shank Guard' });
      expect(await page.locator('.gs-hud-controls .gs-range-ups').count()).toBe(1);
      expect(await chip.getAttribute('aria-pressed')).toBe('false');
      expect(await chip.textContent()).toMatch(/shank \d+%/);
      const redBands = () =>
        page.evaluate(
          () => [...document.querySelectorAll('[data-map] polygon')].filter((p) => p.getAttribute('fill') === 'rgba(255,76,76,0.20)').length,
        );
      const before = await redBands();
      await chip.click();
      const after = page.locator('.gs-range-chip', { hasText: 'Shank Guard' });
      expect(await after.getAttribute('aria-pressed')).toBe('true');
      expect(await after.textContent()).toContain('no shanks');
      // The shank wedge is gone from the drawn cone — the picture IS the physics (contract 5).
      expect(await redBands()).toBe(before - 1);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 120_000);
});
