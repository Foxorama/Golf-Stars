import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { chromePath } from './chromium';

/**
 * THE SETTINGS SHEET'S BOTTOM HALF (GS-settings-more).
 *
 * The sheet had grown a tail: a Help section heading over one link row, then the whole Save data
 * block — a heading, a paragraph, a storage-status line, a backup nudge and four buttons — and then
 * the Return to title footer, all stacked under the controls a player actually opens the sheet to
 * change. Measured on the composed-for phone (390×844) at the ship scale, the sheet was **1059px of
 * content in an 831px box**: two screens of settings, most of the second one occupied by a feature
 * used once a month.
 *
 * The rule that came out of it, and what this file guards:
 *
 *  - **A tile is a place you GO; a row is a promise about a CONSEQUENCE.** The guide and Save data are
 *    tiles in a two-up More grid; Return to title (and, since GS-leave-round, Leave round) stay
 *    full-width rows in the footer, because each has a whole sentence to say about what leaving costs
 *    and a tile's sub-line is a hint.
 *  - **Save data is a second PAGE of the same sheet**, not a block in it — reached by its tile,
 *    left by a back arrow, by the Back button at its foot, or by Escape (which closes the panel
 *    before the sheet: the same innermost-layer-first rule `backIntent` walks, one level further in).
 *  - **A read-only save is never behind a tap.** That case is covered next door in
 *    `save-integrity-browser.test.ts`, which asserts the block renders INLINE and the tile is gone.
 *
 * These are DOM/CSS properties, so they need the built artifact in a real browser — the pure suite is
 * blind to all of it.
 */

const dist = resolve(__dirname, '../dist/index.html');

/** The composed-for phone. The whole point of the feature is what the sheet costs on THIS screen. */
const PHONE = { width: 390, height: 844 };

/**
 * The height budget for the whole sheet at the ship scale on that phone, in px of content.
 *
 * It measured 1059 before and 829 after, so this fails the moment somebody stacks the old shape back
 * in while leaving ~15% of slack for font-metric differences between this machine and CI. It is a
 * FENCE, not a target: shipping at 900 would be fine, and the number is only here because "the sheet
 * got long again" is invisible to every other test in the suite.
 */
const SHEET_BUDGET_PX = 950;

describe.runIf(chromePath)('the settings sheet (GS-settings-more)', () => {
  let browser: import('playwright-core').Browser;
  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  async function openSheet(query = '') {
    const page = await browser.newPage({ viewport: PHONE });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`file://${dist}?intro=0&seed=42${query}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
      timeout: 15_000,
    });
    await page.locator('[data-open-settings]').first().click();
    await page.waitForSelector('.gs-settings', { timeout: 5_000 });
    return { page, errors };
  }

  it('opens on the controls, with the save block one tap away and the whole sheet in budget', async () => {
    const { page, errors } = await openSheet();
    try {
      // The preference controls the sheet exists for are all still right there.
      expect(await page.locator('.gs-settings [data-setting]').count()).toBeGreaterThan(4);
      expect(await page.locator('.gs-settings [data-selscale]').count()).toBe(4);
      expect(await page.locator('.gs-settings [data-selaim]').count()).toBe(3);

      // Two tiles: the guide (an anchor, so it needs no handler) and the Save data panel.
      const tiles = page.locator('.gs-settings .gs-setact');
      expect(await tiles.count()).toBe(2);
      expect(await page.locator('.gs-settings a.gs-setact[target="_blank"]').count()).toBe(1);
      expect(await page.locator('.gs-settings [data-setpanel="save"]').count()).toBe(1);

      // …and NOT the save controls themselves. That is the height the tidy-up bought.
      expect(await page.locator('.gs-settings [data-save-transfer]').count()).toBe(0);
      expect(await page.locator('.gs-settings #gs-save-file').count()).toBe(0);

      const height = await page.evaluate(
        () => document.querySelector<HTMLElement>('.gs-settings')!.scrollHeight,
      );
      expect(height, `the sheet is ${height}px of content (budget ${SHEET_BUDGET_PX})`).toBeLessThanOrEqual(
        SHEET_BUDGET_PX,
      );
      expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('the Save data tile opens a panel that carries every control, and the Back button returns', async () => {
    const { page, errors } = await openSheet();
    try {
      await page.locator('[data-setpanel="save"]').click();
      await page.waitForSelector('[data-save-transfer="export"]', { timeout: 5_000 });

      // Everything the old inline block had, including the (hidden) file picker.
      for (const what of ['export', 'import', 'copy']) {
        expect(await page.locator(`[data-save-transfer="${what}"]`).count(), what).toBe(1);
      }
      expect(await page.locator('#gs-save-file').count()).toBe(1);
      // It is a PAGE, not a modal over a modal — one sheet, and the preference controls are gone.
      expect(await page.locator('.gs-settings').count()).toBe(1);
      expect(await page.locator('.gs-settings [data-setting]').count()).toBe(0);
      // Two ways back, both wired: the head arrow and the footer button.
      expect(await page.locator('.gs-settings [data-setpanel="close"]').count()).toBe(2);

      await page.locator('.gs-settings .gs-setdone [data-setpanel="close"]').click();
      await page.waitForSelector('.gs-settings [data-setpanel="save"]', { timeout: 5_000 });
      expect(await page.locator('.gs-settings [data-save-transfer]').count()).toBe(0);
      expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('Escape closes the panel first and the sheet second', async () => {
    const { page, errors } = await openSheet();
    try {
      await page.locator('[data-setpanel="save"]').click();
      await page.waitForSelector('[data-save-transfer="export"]', { timeout: 5_000 });

      // One press: back to the settings page, sheet still open. A panel that swallowed the sheet with
      // it would make Escape a two-level jump out of a place the player only went one level into.
      await page.keyboard.press('Escape');
      await page.waitForSelector('.gs-settings [data-setpanel="save"]', { timeout: 5_000 });
      expect(await page.locator('.gs-settings').count()).toBe(1);

      // Second press: the sheet.
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.gs-settings'), { timeout: 5_000 });
      expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  /**
   * The other half of GS-leave-round, end to end: the pure policy is guarded in `leave-round.test.ts`,
   * and this is the part only a browser can see — that the row is actually reachable, that it raises a
   * confirm rather than leaving anything, and that the safe answer really keeps you in the run.
   *
   * `?screen=travel` is the honest deep-link into a live Voyage (it builds the shop and leaves it, so
   * the real reducer transitions run), which is why the row here says "run" and not "round".
   */
  describe('the leave-the-round exit (GS-leave-round)', () => {
    it('is absent on the title, where there is nothing to give up', async () => {
      const { page } = await openSheet();
      try {
        expect(await page.locator('[data-settings-leave]').count()).toBe(0);
        // …and neither is Return to title, because the title IS the destination.
        expect(await page.locator('[data-settings-home]').count()).toBe(0);
      } finally {
        await page.close();
      }
    }, 60_000);

    it('offers both exits mid-run, and the destructive one takes a second deliberate tap', async () => {
      const { page, errors } = await openSheet('&screen=travel');
      try {
        // Two exits, saying different things: one parks, one throws the round away.
        const leave = page.locator('[data-settings-leave]');
        expect(await leave.count()).toBe(1);
        expect(await page.locator('[data-settings-home]').count()).toBe(1);
        const label = (await leave.textContent()) ?? '';
        expect(label, 'a Voyage stop is not a round — the control must name the RUN').toMatch(/give up this run/i);
        expect(label).toMatch(/pays out nothing/i);

        // Tapping it closes the sheet and raises the confirm. Nothing has been given up yet.
        await leave.click();
        await page.waitForSelector('.gs-exit', { timeout: 5_000 });
        expect(await page.locator('.gs-settings').count()).toBe(0);
        const stillInRun = await page.evaluate(() => !!document.querySelector('.gs-bhud, .gs-shot'));
        expect(stillInRun, 'the run must still be underway behind the confirm').toBe(true);

        // "Keep playing" is the fat primary, and it really does keep you playing.
        await page.locator('.gs-exit .gs-btn--primary').click();
        await page.waitForFunction(() => !document.querySelector('.gs-exit'), { timeout: 5_000 });
        expect(await page.evaluate(() => !!document.querySelector('.gs-bhud, .gs-shot'))).toBe(true);

        // Round two: through the confirm this time, and the run is gone.
        await page.locator('[data-open-settings]').first().click();
        await page.waitForSelector('.gs-settings', { timeout: 5_000 });
        await page.locator('[data-settings-leave]').click();
        await page.waitForSelector('.gs-exit', { timeout: 5_000 });
        await page.locator('.gs-exit .gs-btn--ghost').click();
        await page.waitForFunction(() => !!document.querySelector('.gs-navtile--game'), { timeout: 5_000 });
        const slots = await page.evaluate(() => JSON.parse(localStorage.getItem('fc_save') || '{}').runSlots ?? {});
        expect(Object.keys(slots), 'the run it gave up must not still be parked').toEqual([]);
        expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
      } finally {
        await page.close();
      }
    }, 60_000);
  });
});
