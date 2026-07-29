/**
 * The play HUD's top INSTRUMENT CLUSTER (GS-hud-compass).
 *
 * The bar used to be up to six independently-wrapping rows saying overlapping things — hole/total,
 * par + length, the live yardage, a points chip, a placing chip, a lie chip, a wind sentence and two
 * hole descriptors. It is now one row of pods with a wind COMPASS anchored at the left. Two things
 * have to hold, and neither is visible to the pure-sim suite:
 *
 *  - the needle reads against the SHOT's bearing, which is both what the map is oriented down and
 *    what the sim resolves wind against — so the drawn wind, the physics and the picture agree;
 *  - the cluster does not REFLOW between play states (GS-hud-frame), which is exactly what a pod that
 *    could grow with its caption did the first time this was built.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { windRead } from '../src/app/playHud';
import { windCompassSVG, windKindColour } from '../src/render/windCompass';
import type { Hole } from '../src/sim/course/contract';
import { findChromium as findChromiumShared } from './chromium';

const dist = resolve(__dirname, '../dist/index.html');
const chromePath = findChromiumShared();

/** A hole whose tee→green line is bearing 0 (`bearing` is `atan2(dx, dy)`, so +y is 0°), with a wind
 *  we choose — the fixture the whole read is measured against. */
const holeWith = (dir: number, spd: number): Hole =>
  ({ tee: [0, 0], green: [0, 100], par: 4, wind: { dir, spd } }) as unknown as Hole;

describe('the wind read (GS-hud-compass)', () => {
  it('defaults to the HOLE line, so the once-per-hole narration is unchanged', () => {
    // tee→green points up-screen (bearing 0), so a wind blowing that way is a pure tailwind.
    expect(windRead(holeWith(0, 12))).toMatchObject({ spd: 12, kind: 'tailwind', delta: 0 });
    expect(windRead(holeWith(180, 12)).kind).toBe('headwind');
    expect(windRead(holeWith(90, 12)).kind).toBe('crosswind');
    // Under a mph the game calls it calm, and calm has no direction to draw.
    expect(windRead(holeWith(90, 0.4))).toMatchObject({ spd: 0, kind: 'calm', delta: 0 });
  });

  it('re-reads against the SHOT bearing when the play HUD passes one', () => {
    // Same wind, but you are playing back down the hole: the tailwind becomes a headwind, and the
    // needle flips with it. This is the reading the sim uses (`shot.ts playWind` is shot-relative).
    const h = holeWith(0, 12);
    expect(windRead(h, 180)).toMatchObject({ kind: 'headwind' });
    expect(Math.abs(windRead(h, 180).delta)).toBe(180);
    // A dogleg: aiming 45° right of the hole line turns a tailwind into a cross-tail off that line.
    expect(windRead(h, 45).delta).toBe(-45);
  });
});

describe('the compass dial (GS-hud-compass)', () => {
  it('emits no ids — it shares a document with the bag glyphs', () => {
    // SVG ids are DOCUMENT-global (the `holeIdPrefix` lesson): a `<defs>` gradient here would collide
    // with any other inline SVG on the play screen.
    expect(windCompassSVG({ spd: 9, kind: 'tailwind', delta: -12 })).not.toMatch(/\sid="/);
  });

  it('draws a needle only when there is wind, and reads its verdict in colour', () => {
    const windy = windCompassSVG({ spd: 9, kind: 'headwind', delta: 170 });
    const calm = windCompassSVG({ spd: 0, kind: 'calm', delta: 0 });
    expect(windy).toContain('<polygon');
    expect(windy).toContain(windKindColour('headwind'));
    expect(windy).toContain('9');
    expect(calm).toContain('CALM');
    // The play-direction index mark survives a calm dial (it is the bezel, not a reading) — but the
    // needle does not, and it must never be drawn in a wind colour when there is no wind.
    expect(calm).not.toContain(windKindColour('tailwind'));
    expect(calm).not.toContain(windKindColour('headwind'));
  });

  it('points the needle where the wind pushes the ball ON SCREEN', () => {
    // delta 0 = blowing the way you play = up-screen. The arrowhead's tip is the first point of the
    // needle polygon; in the 52-unit frame the centre is (26, 26), so a tailwind tip must be ABOVE it
    // and a right-to-left crosswind's tip must be to its RIGHT (the way it pushes the ball).
    const tip = (delta: number): [number, number] => {
      const poly = windCompassSVG({ spd: 10, kind: 'crosswind', delta }).match(/<polygon points="([^"]+)"[^>]*fill="#ffc454"/)![1]!;
      const [x, y] = poly.split(',')[0]!.trim().split(/\s+/).map(Number);
      return [x!, y!];
    };
    const [ux, uy] = tip(0);
    expect(uy).toBeLessThan(26);
    expect(ux).toBeCloseTo(26, 1);
    const [rx] = tip(90);
    expect(rx).toBeGreaterThan(26);
    const [lx] = tip(-90);
    expect(lx).toBeLessThan(26);
  });
});

describe('the cluster on screen (GS-hud-compass)', () => {
  it.runIf(chromePath)(
    'is one row of pods that does not reflow when the shot is struck',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
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
        await page.waitForTimeout(500);

        const read = () =>
          page.evaluate(() => {
            const bar = document.querySelector('.gs-hud-top')!.getBoundingClientRect();
            const pods = [...document.querySelectorAll('.gs-hudx__pod')].map((p) => p.getBoundingClientRect());
            return {
              h: bar.height,
              frac: bar.height / window.innerHeight,
              pods: pods.length,
              // Every pod on ONE line: same top edge, to within sub-pixel layout.
              oneRow: pods.every((p) => Math.abs(p.top - pods[0]!.top) < 2),
              compass: !!document.querySelector('.gs-hudx__compass svg'),
              // The wind SENTENCE is gone from the bar — the dial says it instead. (Its screen-reader
              // twin still says "9 mph tailwind" in a `.gs-sr-only` span, which is the point of that
              // span; what must not survive is the visible line, whose tell is the 🌬 glyph.)
              windText: /🌬|tailwind|headwind|crosswind/.test(
                [...document.querySelectorAll('.gs-hud-top *')]
                  .filter((e) => !e.classList.contains('gs-sr-only'))
                  .map((e) => e.childNodes.length === 1 && e.firstChild?.nodeType === 3 ? e.textContent : '')
                  .join(' '),
              ),
              navButtons: document.querySelectorAll('.gs-mapctrl button').length,
            };
          });

        const aim = await read();
        expect(aim.compass, 'the wind compass is missing').toBe(true);
        expect(aim.pods, 'hole · distance · score').toBe(3);
        expect(aim.oneRow, 'the pods must sit on one row at the ship scale').toBe(true);
        expect(aim.windText, 'the wind sentence should be the dial now').toBe(false);
        // Four zoom/recenter controls collapsed into the one whole-hole toggle, plus the cog.
        expect(aim.navButtons).toBe(2);
        // It was 112px of an 844px phone before this pass.
        expect(aim.frac, `top bar is ${(aim.frac * 100).toFixed(1)}% of the screen`).toBeLessThan(0.12);

        await page.locator('[data-swing]').first().click();
        await page.waitForSelector('[data-playmode="watch"]', { timeout: 8000 });
        await page.waitForTimeout(200);
        const watch = await read();
        expect(watch.oneRow, 'the pods wrapped once the shot was struck').toBe(true);
        expect(
          Math.abs(watch.h - aim.h),
          `the bar changed height by ${Math.abs(watch.h - aim.h).toFixed(1)}px when the shot was struck`,
        ).toBeLessThan(2);
      } finally {
        await browser.close();
      }
    },
    90_000,
  );

  it.runIf(chromePath)(
    'the whole-hole toggle latches, and leaving it puts the camera back',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
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
        await page.waitForTimeout(400);

        const state = () =>
          page.evaluate(() => ({
            on: document.querySelector('[data-mapview="toggle"]')!.getAttribute('aria-pressed'),
            lit: document.querySelector('[data-mapview="toggle"]')!.classList.contains('gs-mapbtn--on'),
          }));
        expect(await state()).toMatchObject({ on: 'false', lit: false });
        await page.click('[data-mapview="toggle"]');
        await page.waitForTimeout(350);
        expect(await state(), 'the toggle must latch like the aim mode').toMatchObject({ on: 'true', lit: true });
        await page.click('[data-mapview="toggle"]');
        await page.waitForTimeout(350);
        expect(await state()).toMatchObject({ on: 'false', lit: false });

        // …and custom zoom survives the ＋/－ removal on a device with no second finger: the wheel
        // zooms the follow-cam, which shows up as the aim cone being drawn at a different scale.
        const coneSpan = () =>
          page.evaluate(() => {
            const xs = document
              .querySelector('#gs-shot-overlay polygon')!
              .getAttribute('points')!
              .trim()
              .split(/\s+/)
              .map((p) => Number(p.split(',')[0]));
            return Math.max(...xs) - Math.min(...xs);
          });
        const before = await coneSpan();
        await page.mouse.move(195, 500);
        await page.mouse.wheel(0, -300);
        await page.waitForTimeout(400);
        expect(await coneSpan(), 'the wheel must zoom the play map').not.toBeCloseTo(before, 0);
      } finally {
        await browser.close();
      }
    },
    90_000,
  );
});
