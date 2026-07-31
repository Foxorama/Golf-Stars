import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { chromePath } from './chromium';

/**
 * MOVING AROUND THE STAR CHART (GS-star-map-scan-ahead / GS-star-map-zoom-wheel).
 *
 * Two navigation faults, reported together from a play-test on the itch build, with one cause each:
 *
 *   1. **The map yanked back to the ship.** Every manual pan/pinch/wheel clears `following`
 *      (GS-star-map-jerky-movement), but the chase-cam was gated on `cruising || refuel ||
 *      following` — and a ship mid-flight is still cruising, so the release did nothing until the
 *      hop finished. You could not fly somewhere and scan ahead at the same time. The comment above
 *      that line already claimed the gate was `following` "rather than the per-frame `cruising`
 *      flag", so the code and its own documentation disagreed.
 *
 *   2. **No zoom on a desktop mouse.** Zoom was Ctrl/⌘+wheel only, a chord written down nowhere,
 *      with pinch covering touch and nothing at all covering keyboard or switch input.
 *
 * The camera lives in a rAF loop inside app.ts, so the gate itself is guarded by a SOURCE SCAN —
 * weaker than a behavioural test, but it catches the class (any re-introduction of `cruising` into
 * that condition) rather than one instance, and the behaviour is covered in the browser below.
 */

const appSrc = readFileSync(resolve(__dirname, '../src/app.ts'), 'utf8');
const dist = resolve(__dirname, '../dist/index.html');

describe('the chase-cam gate', () => {
  it('is `following` (plus the scripted refuel) and never `cruising`', () => {
    // The condition wrapping the chase-cam ease. Found by the scroll-easing it guards rather than by
    // a line number, so the guard survives the file moving around it.
    const gate = /if\s*\(\(([^)]*)\)\s*&&\s*vp\)\s*\{[\s\S]{0,600}?scrollLeft \+= \(tx - vp\.scrollLeft\)/.exec(appSrc);
    expect(gate, 'could not find the chase-cam condition — did the ease move?').toBeTruthy();
    const cond = gate![1]!;
    expect(cond).toContain('following');
    // The bug, exactly: `cruising` in this condition defeats every manual release.
    expect(cond, `chase-cam re-gated on cruising — a pan can no longer scan ahead: ${cond}`).not.toMatch(
      /\bcruising\b/,
    );
  });

  it('every manual navigation still releases the cam', () => {
    // Dropping `cruising` is only safe because the release is on all three inputs and every fly*
    // re-arms. If a release is deleted the map becomes unpannable during flight in a new way.
    const wire = appSrc.slice(appSrc.indexOf('function wireStarTourGestures'));
    const body = wire.slice(0, wire.indexOf('\n}\n'));
    for (const ev of ['pointerdown', 'wheel']) {
      const at = body.indexOf(`'${ev}'`);
      expect(at, `no ${ev} handler on the chart`).toBeGreaterThan(-1);
      expect(body.slice(at, at + 700)).toContain('following = false');
    }
  });
});

describe.runIf(chromePath)('moving around the chart', () => {
  let browser: import('playwright-core').Browser;

  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  async function chart() {
    const page = await browser.newPage({ viewport: { width: 820, height: 760 } });
    await page.goto(`file://${dist}?intro=0&seed=42&screen=startour`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
      timeout: 15_000,
    });
    // Character select comes first on some entry paths (GS-star-tour-2) — take the first golfer.
    if (await page.evaluate(() => !!document.querySelector('.gs-charcard'))) {
      await page.evaluate(() => (document.querySelector('.gs-charcard') as HTMLElement)?.click());
    }
    await page.waitForSelector('#gs-st-viewport', { timeout: 15_000 });
    await page.waitForTimeout(300);
    return page;
  }

  it('offers an on-screen zoom that actually zooms', async () => {
    const page = await chart();
    const before = await page.evaluate(() => document.querySelectorAll('[data-startour-zoom]').length);
    expect(before, 'no on-screen zoom control on the chart').toBe(2);

    const zoomed = await page.evaluate(async () => {
      const chartEl = () => document.querySelector('.gs-startour__chart') as SVGElement | null;
      const widthOf = (): number => Number(chartEl()?.getAttribute('width') ?? 0);
      const w0 = widthOf();
      (document.querySelector('[data-startour-zoom="in"]') as HTMLElement).click();
      await new Promise((r) => setTimeout(r, 120));
      return { w0, w1: widthOf() };
    });
    // The chart element is scaled by the zoom, so a wider chart IS a zoom-in. Asserting on the drawn
    // size rather than on starTourView.zoom keeps the test on what the player sees.
    expect(zoomed.w1, `zoom-in did not grow the chart (${zoomed.w0} → ${zoomed.w1})`).toBeGreaterThan(zoomed.w0);
    await page.close();
  }, 60_000);

  it('puts the zoom inside .gs-bhud, so tapping it cannot fly the ship', async () => {
    // The fly-on-tap handler ignores `target.closest('.gs-bhud, .gs-st-sheet')`. Living inside the
    // HUD is what buys that exemption — a control placed anywhere else on the viewport would zoom
    // AND launch the ship at whatever was behind it. One exemption list, not two.
    const page = await chart();
    const inside = await page.evaluate(() =>
      [...document.querySelectorAll('[data-startour-zoom]')].every((el) => !!el.closest('.gs-bhud')),
    );
    expect(inside, 'a zoom button sits outside .gs-bhud — tapping it will also fly the ship').toBe(true);
    await page.close();
  }, 60_000);

  it('a plain wheel zooms — it does not need a Ctrl chord', async () => {
    const page = await chart();
    const r = await page.evaluate(async () => {
      const widthOf = (): number =>
        Number((document.querySelector('.gs-startour__chart') as SVGElement | null)?.getAttribute('width') ?? 0);
      const w0 = widthOf();
      document
        .getElementById('gs-st-viewport')!
        .dispatchEvent(new WheelEvent('wheel', { deltaY: -240, bubbles: true, cancelable: true, clientX: 400, clientY: 380 }));
      await new Promise((res) => setTimeout(res, 120));
      return { w0, w1: widthOf() };
    });
    expect(r.w1, `a plain wheel did not zoom (${r.w0} → ${r.w1})`).toBeGreaterThan(r.w0);
    await page.close();
  }, 60_000);
});
