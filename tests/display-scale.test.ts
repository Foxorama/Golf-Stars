import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromePath } from './chromium';
import {
  DISPLAY_BASE_H,
  DISPLAY_BASE_W,
  DISPLAY_SCALE_MAX,
  displayScale,
  effectiveViewport,
  isTightFit,
  uiScaleOf,
} from '../src/app/viewportFit';

/**
 * EVERY DISPLAY LAYS OUT AS THE PHONE THE GAME IS COMPOSED FOR (GS-ui-display-scale).
 *
 * The lore/beat screens are `.gs-main--bleed`, whose width is a fraction of the viewport HEIGHT, so
 * they always grew with the display. The ordinary flow screens are `.gs-main` at a fixed 820px with
 * inner caps and ~660 hard-px font sizes, so nothing about them was height-derived and nothing about
 * them grew: at 1920×1080 the Star Tour round recap was a 460×390 island of phone-sized UI.
 *
 * The fix is one scale token, and these guard the three properties that make it safe:
 *   1. it MULTIPLIES the player's own choice and never replaces it (the player owns their type —
 *      GS-a11y-readable-text), which is why `--gs-uiscale` becomes a product and why no JS may
 *      write the combined token;
 *   2. it never fires on a display no bigger than the phone, in EITHER axis;
 *   3. the play screen and the star chart come out at the geometry they already shipped — the
 *      portrait frame is 0.52 of a screen height and is deliberately NOT multiplied back.
 */

const PHONE: [number, number] = [DISPLAY_BASE_W, DISPLAY_BASE_H];

describe('the display half of the root zoom', () => {
  it('leaves the composed-for phone at exactly 1 — the whole shipped game is untouched', () => {
    expect(displayScale(...PHONE)).toBe(1);
    expect(uiScaleOf(1, ...PHONE)).toBe(1);
    // …and so is every viewport SMALLER than it. Shrinking the UI on a small display would be the
    // exact opposite of the fix.
    expect(displayScale(320, 568)).toBe(1); // the small handset
    expect(displayScale(820, 760)).toBe(1); // the itch embed's default desktop frame
    expect(displayScale(390, 780)).toBe(1);
    expect(displayScale(844, 390)).toBe(1); // landscape phone: wide, but shorter than the base
  });

  it('lays a bigger display out AS the phone: 1080 px of height becomes 844 units', () => {
    const s = displayScale(1920, 1080);
    expect(s).toBeCloseTo(1080 / DISPLAY_BASE_H, 6);
    const v = effectiveViewport(1920, 1080, 1);
    expect(v.h).toBeCloseTo(DISPLAY_BASE_H, 6); // the point of the feature, in one number
    expect(v.w).toBeCloseTo(1920 / s, 6);
    expect(isTightFit(v)).toBe(false);
  });

  it('caps at 1.5 so 1440p and 4K do not render the HUD as a billboard', () => {
    expect(displayScale(2560, 1440)).toBe(DISPLAY_SCALE_MAX);
    expect(displayScale(3840, 2160)).toBe(DISPLAY_SCALE_MAX);
    // A capped 1440p still lays out as a phone-shaped screen that is comfortably bigger than 844.
    expect(effectiveViewport(2560, 1440, 1).h).toBeCloseTo(960, 6);
  });

  it('reads BOTH axes — a viewport proportionally narrower than the phone is left alone', () => {
    // A folded foldable at 344×882 is TALLER than the base phone but narrower. Scaling on height
    // alone would zoom it 1.045× and hand the layout 329 units of width, which trips TIGHT_W and
    // reflows the play HUD on a device that was perfectly fine before.
    expect(displayScale(344, 882)).toBe(1);
    expect(isTightFit(effectiveViewport(344, 882, 1))).toBe(false);
    // The scale is the smaller of the two ratios, so it only fires with room in both directions.
    expect(displayScale(500, 1688)).toBeCloseTo(500 / DISPLAY_BASE_W, 6);
  });

  it('multiplies the reader ladder rather than replacing it', () => {
    const d = displayScale(1920, 1080);
    for (const reader of [1, 1.15, 1.3, 1.45]) {
      expect(uiScaleOf(reader, 1920, 1080)).toBeCloseTo(reader * d, 6);
    }
    // …and the reader half is still snapped to the ladder, so a hand-edited `fc_settings` cannot
    // strand the player at 9× (the guard that already existed, now inside the product).
    expect(uiScaleOf(9, ...PHONE)).toBe(1.45);
  });

  it('survives a garbage viewport rather than zooming to NaN', () => {
    for (const [w, h] of [[NaN, 1080], [1920, NaN], [0, 0], [-10, -10]] as [number, number][]) {
      expect(Number.isFinite(displayScale(w, h)), `${w}×${h}`).toBe(true);
      expect(displayScale(w, h)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('the token wiring', () => {
  const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
  const css = html
    .slice(html.indexOf('<style>'), html.indexOf('</style>'))
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('composes the root zoom from the two halves, each defaulting to 1', () => {
    expect(css).toContain('--gs-readerscale: 1;');
    expect(css).toContain('--gs-displayscale: 1;');
    expect(css).toContain('--gs-uiscale: calc(var(--gs-readerscale) * var(--gs-displayscale))');
    // Both default to 1, so a build where neither writer ever runs is the shipped game exactly.
  });

  it('does not multiply the portrait frame by the display scale', () => {
    // The frame is 0.52 of a screen HEIGHT and `--gs-dvh` already divides by the zoom, so it
    // renders at 0.52·H whatever the scale is: same drawn width, same 0.52 aspect, bigger
    // contents. Multiplying it back widens the play camera to a 0.67 aspect on every desktop
    // shot — the thing GS-play-desktop-frame's cap exists to prevent.
    expect(css).toContain('--gs-portrait-w: calc(var(--gs-dvh) * 0.52)');
    expect(css).not.toMatch(/--gs-portrait-w:[^;]*displayscale/);
  });

  it('lets no module write the combined token, or a half is clobbered', () => {
    // `--gs-uiscale` is a `calc()` of two independently-owned halves. An inline
    // `style.setProperty('--gs-uiscale', …)` on the root wins over the stylesheet outright, so
    // whichever writer ran last would silently delete the other's contribution. Each writer owns
    // its own half and nothing owns the product.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, e.name);
        if (e.isDirectory()) {
          walk(full);
          continue;
        }
        if (!e.name.endsWith('.ts')) continue;
        const src = readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        const rel = full.slice(full.indexOf('src' + (process.platform === 'win32' ? '\\' : '/')));
        // Writing the product…
        if (/setProperty\(\s*['"]--gs-uiscale['"]/.test(src)) offenders.push(`${rel}: writes --gs-uiscale`);
        // …and reading it back, which since the `calc()` yields the literal token stream
        // `calc(1 * 1.28)` — `Number()` of that is NaN. Ask `rootZoom()` for the applied zoom.
        if (/getPropertyValue\(\s*['"]--gs-uiscale['"]/.test(src)) offenders.push(`${rel}: reads --gs-uiscale`);
      }
    };
    walk(resolve(__dirname, '../src'));
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('proves those patterns actually match the thing they ban', () => {
    // A scan that matches nothing passes forever. Both shapes are the code this replaced.
    const sample = `root.style.setProperty('--gs-uiscale', String(clampUiScale(s.uiScale)));
      const scale = getComputedStyle(el).getPropertyValue('--gs-uiscale').trim();`;
    expect(/setProperty\(\s*['"]--gs-uiscale['"]/.test(sample)).toBe(true);
    expect(/getPropertyValue\(\s*['"]--gs-uiscale['"]/.test(sample)).toBe(true);
  });
});

describe.runIf(chromePath)('in a real browser', () => {
  const dist = resolve(__dirname, '../dist/index.html');
  let browser: import('playwright-core').Browser;

  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => { await browser?.close(); });

  /** Boot the title at a viewport, optionally with a reader scale already stored. */
  async function boot(w: number, h: number, reader?: number) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const url = `file://${dist}?intro=0&seed=42`;
    const booted = () => document.getElementById('app')?.getAttribute('data-booted') === '1';
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(booted, { timeout: 15_000 });
    if (reader !== undefined) {
      await page.evaluate((s) => localStorage.setItem('fc_settings', JSON.stringify({
        sound: false, music: false, haptics: false, reducedMotion: true, leftHanded: false,
        fastShots: true, lastAscension: 0, aimMode: 'auto', readableFont: false, uiScale: s,
      })), reader);
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(booted, { timeout: 15_000 });
    }
    await page.waitForTimeout(250);
    const m = await page.evaluate(() => {
      const root = document.documentElement;
      const main = document.querySelector('.gs-main')!.getBoundingClientRect();
      return {
        zoom: parseFloat(getComputedStyle(root).zoom) || 1,
        fit: root.getAttribute('data-gs-fit'),
        // Drawn width of the ordinary flow frame, in physical CSS px — the number the complaint
        // was about ("a 460×390 island of phone-sized UI on a 1920×1080 display").
        mainW: main.width,
      };
    });
    return { m, close: () => page.close() };
  }

  it('applies no zoom at all on the composed-for phone', async () => {
    const { m, close } = await boot(390, 844);
    expect(m.zoom).toBeCloseTo(1, 3);
    expect(m.fit).toBe('roomy');
    await close();
  }, 60_000);

  it('draws the flow screens bigger on a 1080p display', async () => {
    const phone = await boot(390, 844);
    const desktop = await boot(1920, 1080);
    expect(desktop.m.zoom).toBeCloseTo(1080 / DISPLAY_BASE_H, 2);
    // The frame is capped at 820 LAYOUT px either way — what changed is how big those are drawn.
    expect(desktop.m.mainW).toBeGreaterThan(820 * 1.2);
    expect(desktop.m.fit).toBe('roomy');
    await phone.close();
    await desktop.close();
  }, 60_000);

  it('multiplies the reader scale, so a large-text player on a desktop gets both', async () => {
    const { m, close } = await boot(1920, 1080, 1.3);
    expect(m.zoom).toBeCloseTo(1.3 * (1080 / DISPLAY_BASE_H), 2);
    await close();
  }, 60_000);

  it('leaves the play frame at the geometry it already shipped', async () => {
    // GS-play-desktop-frame / GS-startour-frame: the portrait frame is 0.52 of the viewport
    // height, and it stays 0.52 of it — drawn width and camera aspect both unchanged, only the
    // HUD inside gets bigger. (`tests/portrait-frame.test.ts` holds the same number for the star
    // chart, which is the other consumer of the token.)
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`file://${dist}?intro=0&seed=42&screen=storyqualmatchlive`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 15_000 });
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      const b = document.querySelector('.gs-main--bleed')!.getBoundingClientRect();
      return { w: b.width, h: b.height };
    });
    await page.close();
    expect(r.w).toBeGreaterThan(1080 * 0.52 - 4);
    expect(r.w).toBeLessThan(1080 * 0.52 + 4);
    expect(r.w / r.h).toBeCloseTo(0.52, 2);
  }, 60_000);
});
