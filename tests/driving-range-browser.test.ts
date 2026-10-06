import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { chromePath } from './chromium';
import { initState, reduce, type UiState } from '../src/ui/game';
import { CAMPAIGN_STORE_VERSION } from '../src/sim/rpg/storyRoster';

/** A real `fc_story` blob: Backspin Bo's campaign with a Story world round parked two holes in, built by
 *  the reducer itself so it is exactly what the game writes. */
function parkedStoryBlob(): string {
  const beats = (s: UiState): UiState => {
    let g = 0;
    while (s.screen === 'lore' && g++ < 8) s = reduce(s, { type: 'dismissLore' });
    return s;
  };
  let s = beats(reduce(reduce(initState('browser-crossmode'), { type: 'openStory' }), { type: 'selectCharacter', characterId: 'backspin-bo' }));
  s = reduce(beats(reduce(s, { type: 'storyPlayWorld', courseId: 'standrews-18' })), { type: 'playInteractive' });
  for (let h = 0; h < 2; h++) {
    let g = 0;
    while (s.play && !s.play.done && g++ < 600) s = reduce(s, { type: 'autoShotHole' });
    s = reduce(s, { type: 'holeComplete' });
  }
  const story = reduce(s, { type: 'toTitle' }).story!;
  return JSON.stringify({ version: CAMPAIGN_STORE_VERSION, campaigns: { 'backspin-bo': story }, activeId: 'backspin-bo' });
}

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

  async function boot(opts: { settings?: Record<string, unknown>; story?: string } = {}) {
    const page = await browser.newPage({ viewport: PHONE });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.addInitScript(
      ({ settings, story }) => {
        try {
          if (sessionStorage.getItem('gs-test-seeded')) return;
          sessionStorage.setItem('gs-test-seeded', '1');
          localStorage.clear();
          localStorage.setItem('fc_settings', JSON.stringify(settings));
          if (story) localStorage.setItem('fc_story', story);
        } catch {
          /* storage denied is another feature's problem */
        }
      },
      // Fast Shots skips the per-shot result card, so a hole can be walked without tapping each one —
      // except where a test needs the card, which passes its own settings.
      { settings: opts.settings ?? { fastShots: true }, story: opts.story ?? null },
    );
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
      // Hole 3: the matchplay lesson, then the upgrades lesson, then the row in the controls panel.
      await page.waitForSelector('.gs-range-coach', { timeout: 15_000 });
      expect(await page.locator('.gs-range-coach').textContent()).toContain('Matchplay vs Longshot Larry');
      await page.locator('.gs-range-coach button').click();
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

  it('putting is taught on the FIRST green, even with the shot card on (the default)', async () => {
    // Fast Shots OFF: every shot raises the result card, and its flag stays set on the putt screen —
    // which used to hold the putting lesson back until AFTER the first putt.
    const { page, errors } = await boot({ settings: { fastShots: false } });
    try {
      await openRange(page);
      let sawPuttScreen = false;
      for (let guard = 0; guard < 60 && !sawPuttScreen; guard++) {
        const coach = page.locator('.gs-range-coach');
        if (await page.locator('[data-putt-commit]').count()) {
          sawPuttScreen = true;
          // The very first time the putter is in hand, the lesson must already be up.
          expect(await coach.count()).toBe(1);
          expect(await coach.textContent()).toContain('Putting');
          break;
        }
        if (await coach.count()) await coach.locator('button').click();
        else if (await page.locator('[data-popup-continue]').count()) await page.locator('[data-popup-continue]').first().click();
        else if (await page.locator('[data-swing]:not([disabled])').count()) await page.locator('[data-swing]').click();
        await page.waitForTimeout(500);
      }
      expect(sawPuttScreen).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 120_000);

  it('announces the range once, and ✕ puts it away for good', async () => {
    const { page, errors } = await boot();
    try {
      const notice = page.locator('.gs-range-notice');
      expect(await notice.count()).toBe(1);
      expect(await notice.textContent()).toContain('The Driving Range has opened!');
      await page.locator('[data-range-notice-dismiss]').click();
      expect(await page.locator('.gs-range-notice').count()).toBe(0);
      const stamped = await page.evaluate(() => JSON.parse(localStorage.getItem('fc_settings') ?? '{}').rangeNoticeDone);
      expect(stamped).toBe(true);
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1');
      expect(await page.locator('.gs-range-notice').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('going into the range by any door also retires the announcement', async () => {
    const { page, errors } = await boot();
    try {
      await page.locator('.gs-range-notice [data-action]').click();
      await page.waitForSelector('.gs-shot--full');
      const stamped = await page.evaluate(() => JSON.parse(localStorage.getItem('fc_settings') ?? '{}').rangeNoticeDone);
      expect(stamped).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('the Star Tour tile follows its existing rule: hidden with no campaign, shown once one exists', async () => {
    const fresh = await boot();
    try {
      expect(await fresh.page.locator('.gs-navtiles--games').textContent()).not.toContain('Star Tour');
    } finally {
      await fresh.page.close();
    }
    const withStory = await boot({ story: parkedStoryBlob() });
    try {
      expect(await withStory.page.locator('.gs-navtiles--games').textContent()).toContain('Star Tour');
      expect(withStory.errors).toEqual([]);
    } finally {
      await withStory.page.close();
    }
  }, 60_000);

  it('a parked Story round is still in fc_story after starting a Voyage instead (GS-story-liveround-crossmode)', async () => {
    const blob = parkedStoryBlob();
    const parked = JSON.parse(blob).campaigns['backspin-bo'].liveRound;
    expect(parked?.stopHoleIndex).toBe(2);
    const { page, errors } = await boot({ story: blob });
    try {
      await page.locator(`[data-action='{"type":"start","format":"voyage"}']`).click();
      await page.locator(`[data-action*='"selectCharacter"'][data-action*='longshot-larry']`).first().click();
      await page.waitForTimeout(500);
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fc_story') ?? '{}'));
      expect(stored.campaigns['backspin-bo'].liveRound).toEqual(parked);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);
});
