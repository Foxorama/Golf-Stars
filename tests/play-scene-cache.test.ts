/**
 * The play view's static-scene cache (GS-shot-lag).
 *
 * The play view paints the world from ~1,000–1,900 scene prims. It cached the BUILT prims by
 * projector identity, but re-stroked every one of them into the canvas on every frame — even when
 * the camera had not moved a pixel and the picture was provably identical. Profiled on a real
 * watched shot that painting was 41% of all CPU, and on a putts-only watch it was 100% waste,
 * because that watch deliberately holds the camera STILL (`follow: hadShots`, app.ts). Measured in a
 * throttled browser the green ran at **3.3 fps**.
 *
 * This is a PERFORMANCE bug, and a frame-rate assertion in CI is a flake waiting to happen — so the
 * guard is STRUCTURAL: count the canvas fill/stroke calls the page actually makes per frame. A still
 * camera must paint the world once and then blit it; if someone reinstates the per-frame repaint the
 * count goes back to four figures and this fails, whatever the machine's speed.
 *
 * Runs against the BUILT artifact (like tests/build.test.ts). Skipped when no Chromium is available
 * — READ THE SKIPPED COUNT (GS-browser-test-gate).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromePath } from './chromium';

const dist = resolve(__dirname, '../dist/index.html');

/** Counts every fill/stroke/clip the page issues, and the frames they were spread over. */
const COUNTER = () => {
  const w = window as unknown as { __paint: { ops: number; frames: number; on: boolean } };
  w.__paint = { ops: 0, frames: 0, on: false };
  const P = CanvasRenderingContext2D.prototype;
  for (const m of ['fill', 'stroke', 'clip', 'drawImage'] as const) {
    const raw = P[m] as (...a: unknown[]) => unknown;
    (P as unknown as Record<string, unknown>)[m] = function (this: unknown, ...a: unknown[]) {
      if (w.__paint.on) w.__paint.ops++;
      return raw.apply(this, a);
    };
  }
  const raf = window.requestAnimationFrame.bind(window);
  const beat = (): void => {
    if (w.__paint.on) w.__paint.frames++;
    raf(beat);
  };
  raf(beat);
};

describe('the play view does not repaint a world that cannot have changed (GS-shot-lag)', () => {
  it('the still-camera blit and the moving-camera repaint are ONE decision, in one place', () => {
    // The cache key is projector identity, and it must stay that: two ways of asking "has the camera
    // moved" is the second-description bug this codebase keeps paying for. `drawStatic` is the only
    // place that may answer it, and the bitmap must be invalidated on the same branch that rebuilds
    // the scene — not on a separate test somewhere downstream.
    const view = readFileSync(resolve(__dirname, '../src/render/playView.ts'), 'utf8');
    const body = view.slice(view.indexOf('function drawStatic'), view.indexOf('function drawHUD'));
    expect(body, 'drawStatic must still key on projector identity').toMatch(/proj !== cachedProj/);
    expect(body, 'a rebuilt scene must invalidate the painted bitmap in the same branch').toMatch(
      /cachedProj = proj;[\s\S]{0,120}bitmapProj = null/,
    );
    // The bitmap takes the play canvas's OWN device size. A re-derived `width * dpr` disagrees with
    // the canvas's truncated width attribute whenever the UI zoom makes dpr fractional, and the blit
    // then resamples the entire world.
    expect(body).toMatch(/sceneBitmap\.width = canvas\.width/);
    expect(body).toMatch(/sceneBitmap\.height = canvas\.height/);
    expect(body, 'the blit must be 1:1 against the canvas, not a re-derived CSS size').toMatch(
      /drawImage\(sceneBitmap!, 0, 0, canvas\.width \/ dpr, canvas\.height \/ dpr\)/,
    );
  });

  it('the follow-cam can actually ARRIVE, so the cache is reachable at all', () => {
    // The ease is exponential: `camera += (target - camera) * 0.2` converges but never lands, and
    // `buildProj()` mints a fresh projector every frame regardless — so before the settle the cache
    // key changed on every frame of every shot, for ever, including long after the ball had stopped.
    const view = readFileSync(resolve(__dirname, '../src/render/playView.ts'), 'utf8');
    expect(view).toMatch(/CAMERA_SETTLE_PX/);
    expect(view, 'the settle threshold is a SCREEN measure — a yard threshold means something different at every zoom').toMatch(
      /proj\.scale;[\s\S]{0,200}stepPx > CAMERA_SETTLE_PX/,
    );
  });

  it.runIf(chromePath)(
    'a putt watch paints the world once and blits it, instead of re-stroking it every frame',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await page.addInitScript(COUNTER);
        await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
          timeout: 15000,
        });
        const click = async (t: string) => {
          await page.locator('button', { hasText: t }).first().click();
          await page.waitForTimeout(320);
        };
        await click('The Voyage');
        await click('Voyage as Feather');
        await click('First Tee');
        await click('Tee Off');
        await page.waitForSelector('[data-playmode]', { timeout: 15000 });

        // Play on until the ball is on the green (the putt decision screen).
        let onGreen = false;
        for (let i = 0; i < 14 && !onGreen; i++) {
          const st = await page.evaluate(() => ({
            overlay: !!document.querySelector('[data-gs-overlay]'),
            putt: !!document.querySelector('[data-putt-commit]:not([disabled])'),
            swing: !!document.querySelector('[data-swing]:not([disabled])'),
          }));
          if (st.putt) {
            onGreen = true;
            break;
          }
          if (st.overlay) {
            await page.locator('[data-gs-overlay]').first().click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(300);
            continue;
          }
          if (st.swing) {
            await page.locator('[data-swing]:not([disabled])').first().click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(3200);
            continue;
          }
          await page.waitForTimeout(400);
        }
        expect(onGreen, 'never reached a putt screen — the rig, not the code, needs fixing').toBe(true);

        // Roll the putt, let the ONE start-up scene paint happen, and only then measure. The cache's
        // whole claim is about the STEADY state: paint the world once, blit it thereafter. Counting
        // from the first frame would fold that legitimate opening paint into the average and measure
        // nothing (a green at the putt camera is ~100,000 canvas ops — far more than the ~1,500
        // top-level prims suggest, because most of the world lives inside clip groups; that single
        // number is the whole reason this screen was the laggiest in the game).
        await page.locator('[data-putt-commit]:not([disabled])').first().click({ timeout: 5000 });
        await page.waitForTimeout(350);
        await page.evaluate(() => {
          const w = window as unknown as { __paint: { ops: number; frames: number; on: boolean } };
          w.__paint.ops = 0;
          w.__paint.frames = 0;
          w.__paint.on = true;
        });
        await page.waitForTimeout(900);
        const m = await page.evaluate(() => {
          const w = window as unknown as { __paint: { ops: number; frames: number; on: boolean } };
          w.__paint.on = false;
          return { ops: w.__paint.ops, frames: w.__paint.frames };
        });

        expect(m.frames, 'the putt never animated — nothing was measured').toBeGreaterThan(10);
        const perFrame = m.ops / m.frames;
        // Steady state is the ball, its trail, the weather and the HUD — tens of ops. A single
        // re-stroke of the world is three orders of magnitude more, so this threshold is nowhere
        // near either behaviour and cannot flake on a slow machine.
        expect(
          perFrame,
          `a still-camera putt watch issued ${perFrame.toFixed(0)} canvas paint ops per frame in the steady state — the world is being re-stroked every frame again (GS-shot-lag)`,
        ).toBeLessThan(400);
      } finally {
        await browser.close();
      }
    },
    120000,
  );
});
