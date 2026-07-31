import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { chromePath } from './chromium';

/**
 * THE PORTRAIT FRAME IS ONE DECISION WITH TWO CONSUMERS (GS-startour-frame).
 *
 * The game is composed portrait, and on anything that is not phone-portrait it keeps a portrait
 * frame rather than growing sideways — the width is a fraction of the viewport HEIGHT, so the
 * composition scales with the display instead of being pinned to a px count
 * (GS-play-desktop-frame: an uncapped wide container yields a wide camera and every shot reads as
 * over-zoomed).
 *
 * The free-roam star chart escaped it. `.gs-startour` is `position: fixed; inset: 0`, so capping
 * its `.gs-main--bleed` parent did nothing: coming off a 600px-wide portrait hole you landed on a
 * 1920px-wide chart. That is a change of format mid-run, and it stranded the mobile-composed HUD —
 * tiny buttons flung to opposite corners of the display.
 *
 * Now both read `--gs-portrait-w`. These cases guard the property that matters — the two agree —
 * rather than either number, so retuning the frame cannot move one and leave the other.
 */

const dist = resolve(__dirname, '../dist/index.html');

describe('the frame token', () => {
  const css = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

  it('is defined once and read by both surfaces', () => {
    expect(css).toContain('--gs-portrait-w: calc(var(--gs-dvh) * 0.52)');
    // Neither surface may re-derive it — that is the second description this token exists to stop.
    const consumers = [...css.matchAll(/(\.gs-main--bleed|\.gs-startour)\s*\{[^}]*\}/g)].map((m) => m[0]);
    expect(consumers.length).toBeGreaterThanOrEqual(2);
    for (const rule of consumers.filter((r) => /max-width|(?<!min-)\bwidth:/.test(r))) {
      expect(rule, `re-derives the frame instead of reading the token: ${rule}`).not.toMatch(/\*\s*0\.52/);
    }
  });
});

describe.runIf(chromePath)('the star chart keeps the portrait frame (GS-startour-frame)', () => {
  let browser: import('playwright-core').Browser;

  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => { await browser?.close(); });

  async function chart(w: number, h: number) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`file://${dist}?intro=0&seed=42&screen=startour`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 15_000 });
    await page.waitForTimeout(350);
    const r = await page.evaluate(() => {
      const st = document.querySelector('.gs-startour')!.getBoundingClientRect();
      const hud = document.querySelector('.gs-bhud--st')!.getBoundingClientRect();
      return {
        x: Math.round(st.x), w: Math.round(st.width),
        hudInside: st.left <= hud.left + 1 && st.right >= hud.right - 1,
        vw: innerWidth,
      };
    });
    return { r, close: () => page.close() };
  }

  it('is a centred portrait column on a landscape display, not the whole screen', async () => {
    const { r, close } = await chart(1920, 1080);
    // 0.52 of the height, the same frame the play screen uses.
    expect(r.w).toBeGreaterThan(1080 * 0.52 - 4);
    expect(r.w).toBeLessThan(1080 * 0.52 + 4);
    // Centred — `inset: 0` pins both edges, so the auto margins have to do the work.
    expect(Math.abs(r.x - (r.vw - r.w) / 2)).toBeLessThan(2);
    await close();
  }, 60_000);

  it('carries its HUD inside the frame — there is nothing else to bound', async () => {
    // The whole cockpit HUD is a CHILD of `.gs-startour`. If that ever changes, the buttons go back
    // to the corners of the display while the chart stays in its column.
    const { r, close } = await chart(1920, 1080);
    expect(r.hudInside).toBe(true);
    await close();
  }, 60_000);

  it('still fills a phone in portrait, byte-for-byte', async () => {
    // 390x844 is 0.46 — below the 3/4 threshold, so the cap must not apply at all.
    const { r, close } = await chart(390, 844);
    expect(r.w).toBe(390);
    expect(r.x).toBe(0);
    await close();
  }, 60_000);

  it('matches the play screen frame exactly at the same viewport', async () => {
    // The property, not the number: one decision, so the two surfaces cannot drift apart.
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`file://${dist}?intro=0&seed=42&screen=storyqualmatchlive`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 15_000 });
    await page.waitForTimeout(350);
    const play = await page.evaluate(() => Math.round(document.querySelector('.gs-main--bleed')!.getBoundingClientRect().width));
    await page.close();
    const { r, close } = await chart(1280, 900);
    expect(r.w).toBe(play);
    await close();
  }, 60_000);
});
