import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { effectiveViewport, isTightFit, TIGHT_H, TIGHT_W } from '../src/app/viewportFit';
import { UI_SCALES } from '../src/settings';
import { findChromium as findChromiumShared } from './chromium';

/**
 * The accessibility settings have to survive a PHONE (GS-a11y-sheet-scroll · GS-a11y-tight-fit).
 *
 * GS-a11y-readable-text shipped the scale ladder having checked one thing — that the play screen's
 * commit row stayed on-screen. It did. Everything else did not, and the play report was blunt: the
 * settings sheet lost its top half with no way to scroll back to it (so the size control was a
 * one-way trip), the golfer dossier lost its hero image off the top of the display, the golfer names
 * were cut off mid-word, the Voyage scout board opened above the top of the screen, and on the play
 * screen the two HUD panels between them took 83% of the display — "you can't see the golfer or ball
 * flight or really anything."
 *
 * Every one of those is one of two bugs:
 *   1. **A `position: fixed` box bigger than the viewport is unreachable content.** The page cannot
 *      scroll it — that is what fixed means. It must cap itself and scroll internally.
 *   2. **A media query cannot see `--gs-uiscale`.** Root `zoom` shrinks the layout box and leaves the
 *      media-query viewport at its physical size, so no breakpoint can answer "is this cramped at
 *      large text?" (GS-a11y-scale-wrap). Either the content copes intrinsically, or the branch reads
 *      `data-gs-fit`.
 *
 * So the browser cases below drive the BUILT artifact at a real phone size on the top scale rung, and
 * assert the properties rather than the pixels. The scale-1 cases are the other half of the contract:
 * the game the player already knows must be untouched.
 */

const dist = resolve(__dirname, '../dist/index.html');

const chromePath = findChromiumShared();

const TOP_SCALE = UI_SCALES[UI_SCALES.length - 1]!;

/** Boot the built app at a phone size with a given UI scale / reader setting already stored. */
async function phone(
  browser: import('playwright-core').Browser,
  opts: { scale?: number; readable?: boolean; query?: string; w?: number; h?: number } = {},
) {
  const page = await browser.newPage({ viewport: { width: opts.w ?? 390, height: opts.h ?? 844 } });
  const url = `file://${dist}?intro=0&seed=42${opts.query ?? ''}`;
  const booted = () => document.getElementById('app')?.getAttribute('data-booted') === '1';
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(booted, { timeout: 15_000 });
  // The settings blob has to be in place BEFORE boot — the scale goes onto <html> before first paint.
  await page.evaluate(
    ([s, r]) =>
      localStorage.setItem(
        'fc_settings',
        JSON.stringify({
          sound: false, music: false, haptics: false, reducedMotion: true, leftHanded: false,
          fastShots: true, lastAscension: 0, aimMode: 'auto', readableFont: r, uiScale: s,
        }),
      ),
    [opts.scale ?? 1, opts.readable ?? false] as [number, boolean],
  );
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(booted, { timeout: 15_000 });
  await page.waitForTimeout(250);
  return page;
}

describe('effective viewport (pure)', () => {
  it('divides the physical viewport by the root zoom', () => {
    // A 390x844 phone at the top rung lays out in 269x582 units, not 390x844.
    const v = effectiveViewport(390, 844, 1.45);
    expect(Math.round(v.w)).toBe(269);
    expect(Math.round(v.h)).toBe(582);
  });

  it('a phone is roomy at the ship scale and tight at the top rung', () => {
    expect(isTightFit(effectiveViewport(390, 844, 1))).toBe(false);
    expect(isTightFit(effectiveViewport(390, 844, TOP_SCALE))).toBe(true);
  });

  it('an unknown scale is snapped onto the ladder, never taken at face value', () => {
    // effectiveViewport clamps through the same ladder the setting does, so a hand-edited
    // `fc_settings` carrying uiScale: 9 cannot report a 43-unit-wide viewport.
    expect(effectiveViewport(390, 844, 9).w).toBeGreaterThan(200);
  });

  it('the thresholds are the ones the CSS was tuned against', () => {
    expect(TIGHT_H).toBe(660);
    expect(TIGHT_W).toBe(330);
  });
});

describe.runIf(chromePath)('overlays fit the phone at the top text size (real browser)', () => {
  let browser: import('playwright-core').Browser;
  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it('the settings sheet keeps its top on screen and scrolls to the rest', async () => {
    const page = await phone(browser, { scale: TOP_SCALE, readable: true });
    try {
      await page.locator('.gs-cog, [data-open-settings]').first().click();
      await page.waitForSelector('.gs-settings');
      const m = await page.evaluate(() => {
        const sheet = document.querySelector<HTMLElement>('.gs-settings')!;
        const r = sheet.getBoundingClientRect();
        const head = sheet.querySelector<HTMLElement>('.gs-sheet-head')!.getBoundingClientRect();
        return {
          top: Math.round(r.top),
          scrolls: sheet.scrollHeight > sheet.clientHeight + 1,
          headTop: Math.round(head.top),
          // The scale control the player needs to get back OUT of this must be reachable.
          reachable: [...sheet.querySelectorAll<HTMLElement>('[data-selscale]')].length,
        };
      });
      // The whole sheet is on screen…
      expect(m.top).toBeGreaterThanOrEqual(-1);
      expect(m.headTop).toBeGreaterThanOrEqual(-1);
      // …because it capped itself and scrolls, not because it happens to be short.
      expect(m.scrolls).toBe(true);
      expect(m.reachable).toBe(UI_SCALES.length);
      await page.close();
    } catch (e) {
      await page.close();
      throw e;
    }
  }, 60_000);

  it('the Voyage scout board opens below the top of the screen', async () => {
    const page = await phone(browser, { scale: TOP_SCALE, readable: true });
    try {
      const click = async (t: string) => {
        await page.locator('button', { hasText: t }).first().click();
        await page.waitForTimeout(300);
      };
      await click('The Voyage');
      await click('Voyage as Feather');
      await page.locator('[data-introfield="open"]').first().click();
      await page.waitForSelector('.gs-sheet-backdrop');
      const m = await page.evaluate(() => {
        const sheet = document.querySelector<HTMLElement>('.gs-sheet-backdrop .gs-sheet')!;
        return { top: Math.round(sheet.getBoundingClientRect().top), scrolls: sheet.scrollHeight > sheet.clientHeight + 1 };
      });
      expect(m.top).toBeGreaterThanOrEqual(-1);
      expect(m.scrolls).toBe(true);
      await page.close();
    } catch (e) {
      await page.close();
      throw e;
    }
  }, 60_000);

  it('no golfer name is cut off, and the roster scrolls when the cards outgrow the screen', async () => {
    const page = await phone(browser, { scale: TOP_SCALE, readable: true, query: '&screen=character' });
    try {
      await page.waitForSelector('.gs-charcard-name');
      const m = await page.evaluate(() => {
        const names = [...document.querySelectorAll<HTMLElement>('.gs-charcard-name')];
        const clipped = names
          .filter((n) => n.scrollWidth > n.clientWidth + 1)
          .map((n) => (n.textContent || '').trim());
        const wrap = document.querySelector<HTMLElement>('.gs-charwrap')!;
        return {
          count: names.length,
          clipped,
          overflows: wrap.scrollHeight > wrap.clientHeight + 1,
          scrollable: getComputedStyle(wrap).overflowY,
        };
      });
      expect(m.count).toBeGreaterThan(0);
      // Every name lays out inside its own box — no word running out of an `overflow: hidden` card.
      expect(m.clipped).toEqual([]);
      // The roster no longer hides what doesn't fit: when it overflows, it scrolls.
      if (m.overflows) expect(m.scrollable).toBe('auto');
      await page.close();
    } catch (e) {
      await page.close();
      throw e;
    }
  }, 60_000);

  it('the golfer dossier keeps its hero image on screen', async () => {
    // `max-height: 92vh` inside a zoomed root is 1.33 screens, and the card is bottom-anchored — the
    // hometown backdrop and the golfer's name were above the top of the display, unreachable.
    const page = await phone(browser, { scale: TOP_SCALE, readable: true, query: '&screen=character' });
    try {
      await page.locator('.gs-charcard-port').first().click();
      await page.waitForSelector('.gs-charlore');
      const m = await page.evaluate(() => {
        const card = document.querySelector<HTMLElement>('.gs-charlore')!;
        const hero = card.querySelector<HTMLElement>('.gs-charlore-hero')!.getBoundingClientRect();
        const body = card.querySelector<HTMLElement>('.gs-charlore-body')!;
        return {
          cardTop: Math.round(card.getBoundingClientRect().top),
          heroTop: Math.round(hero.top),
          bodyScrolls: body.scrollHeight > body.clientHeight + 1,
        };
      });
      expect(m.cardTop).toBeGreaterThanOrEqual(-1);
      expect(m.heroTop).toBeGreaterThanOrEqual(-1);
      expect(m.bodyScrolls).toBe(true);
      await page.close();
    } catch (e) {
      await page.close();
      throw e;
    }
  }, 60_000);

  it('the play HUD leaves the golf a usable band of screen', async () => {
    const page = await phone(browser, { scale: TOP_SCALE, readable: true });
    try {
      const click = async (t: string, ms = 350) => {
        await page.locator('button', { hasText: t }).first().click();
        await page.waitForTimeout(ms);
      };
      await click('The Voyage');
      await click('Voyage as Feather');
      await click('First Tee');
      await click('Tee Off', 900);
      const m = await page.evaluate(() => {
        const top = document.querySelector<HTMLElement>('.gs-hud-top')!.getBoundingClientRect();
        const bottom = document.querySelector<HTMLElement>('.gs-hud-bottom')!.getBoundingClientRect();
        return {
          fit: document.documentElement.dataset.gsFit,
          band: (bottom.top - top.bottom) / window.innerHeight,
          // The controls panel gets the whole bar's width once the flanks stop being columns.
          panelFrac:
            document.querySelector<HTMLElement>('.gs-hud-controls')!.getBoundingClientRect().width /
            bottom.width,
        };
      });
      expect(m.fit).toBe('tight');
      // Was 0.17 before this feature — the ball, the aim cone and the fairway had nowhere to be.
      expect(m.band).toBeGreaterThan(0.33);
      // …because the caddy badge and the auto-finish button stopped flanking the panel.
      expect(m.panelFrac).toBeGreaterThan(0.9);
      await page.close();
    } catch (e) {
      await page.close();
      throw e;
    }
  }, 60_000);

  it('the ship scale is untouched — the play bar still flanks the panel', async () => {
    const page = await phone(browser, { scale: 1, readable: false });
    try {
      const click = async (t: string, ms = 350) => {
        await page.locator('button', { hasText: t }).first().click();
        await page.waitForTimeout(ms);
      };
      await click('The Voyage');
      await click('Voyage as Feather');
      await click('First Tee');
      await click('Tee Off', 900);
      const m = await page.evaluate(() => {
        const bottom = document.querySelector<HTMLElement>('.gs-hud-bottom')!.getBoundingClientRect();
        const panel = document.querySelector<HTMLElement>('.gs-hud-controls')!.getBoundingClientRect();
        const caddy = document.querySelector<HTMLElement>('.gs-hud-caddy')!.getBoundingClientRect();
        return {
          fit: document.documentElement.dataset.gsFit,
          panelFrac: panel.width / bottom.width,
          // The caddy sits BESIDE the panel, on the same row, exactly as GS-hud-frame drew it.
          caddyBeside: caddy.right <= panel.left + 1 && caddy.bottom > panel.top,
          // GS-hud-compass: the hole's shape/width descriptors left the play bar for the tee card,
          // so what this scale case now proves is that the CLUSTER holds its one-row shape here.
          pods: document.querySelectorAll('.gs-hudx__pod').length,
        };
      });
      expect(m.fit).toBe('roomy');
      expect(m.panelFrac).toBeLessThan(0.8);
      expect(m.caddyBeside).toBe(true);
      // …and the instrument cluster still carries its three readouts (hole · distance · score).
      expect(m.pods).toBe(3);
      await page.close();
    } catch (e) {
      await page.close();
      throw e;
    }
  }, 60_000);

  it('the boot cinematic seals the app behind it', async () => {
    // The intro is a <body>-level takeover ABOVE #app, so the overlay focus pass — which only walks
    // #app's own children — never saw it. Tab used to walk straight into a title screen the player
    // could not see and had not reached.
    const { chromium } = await import('playwright-core');
    const b2 = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
    try {
      const page = await b2.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`file://${dist}?intro=1`, { waitUntil: 'load' });
      await page.waitForSelector('[data-gs-intro]');
      const during = await page.evaluate(() => ({
        appInert: document.getElementById('app')!.hasAttribute('inert'),
        focusOnSkip: (document.activeElement?.textContent || '').includes('Skip'),
      }));
      expect(during.appInert).toBe(true);
      expect(during.focusOnSkip).toBe(true);
      // …and skipping hands it straight back, or the app is frozen for good.
      await page.evaluate(() => document.querySelector<HTMLElement>('[data-gs-intro] button')!.click());
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => ({
        gone: !document.querySelector('[data-gs-intro]'),
        appInert: document.getElementById('app')!.hasAttribute('inert'),
      }));
      expect(after.gone).toBe(true);
      expect(after.appInert).toBe(false);
    } finally {
      await b2.close();
    }
  }, 60_000);
});
