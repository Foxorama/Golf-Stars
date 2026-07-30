import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { chromePath } from './chromium';
import { UI_SCALES } from '../src/settings';

/**
 * WHICH CARD YOU GET IS A QUESTION ABOUT THE CARD (GS-select-card-room).
 *
 * The golfer roster dresses each card two ways — COMPACT (portrait, stats, one clamped ✓/▲ hint)
 * and FULL (blurb + pros/cons list + the "Tap · …" footer) — and it chose between them on
 * `max-width: 999px` alone: a question about the PAGE asked in place of a question about the CARD.
 *
 * Measured on the itch.io embed at its default desktop viewport (820x760), the roster lays out
 * 2-across, so each card is 390x323 — wider than the four-across desktop card at 1280x800
 * (277x348) — and every one wore the phone dressing, so four big cards sat 60% empty.
 *
 * These cases pin the corners of the new condition. The last is the one that matters most: a media
 * query cannot see `--gs-uiscale` (GS-a11y-scale-wrap), so the same 820x760 embed at the top reader
 * rung lays out in 566x524 units and the full card no longer fits — `data-gs-fit` is what has to
 * catch that, and a fix that forgot it would pass every other case here.
 */

const dist = resolve(__dirname, '../dist/index.html');
const TOP_SCALE = UI_SCALES[UI_SCALES.length - 1]!;

/** Roster overflow under this many px is sub-pixel grid slack, not a scroll (see the case below). */
const NO_SCROLL = 8;

/** What the roster is actually showing, and whether it had to scroll to show it. */
const CARD = `(() => {
  const wrap = document.querySelector('.gs-charwrap');
  const card = document.querySelector('.gs-charcard');
  const shown = (sel) => { const e = card.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none'; };
  const r = card.getBoundingClientRect();
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    blurb: shown('.gs-charcard-blurb'), pros: shown('.gs-charcard-pc'),
    hint: shown('.gs-charcard-hint'), cta: shown('.gs-charcard-cta'),
    rosterOverflow: Math.round(wrap.scrollHeight - wrap.clientHeight),
    fit: document.documentElement.getAttribute('data-gs-fit'),
  };
})()`;

type Card = {
  w: number; h: number; blurb: boolean; pros: boolean; hint: boolean; cta: boolean;
  rosterOverflow: number; fit: string;
};

describe.runIf(chromePath)('the roster card is dressed for the room it has (GS-select-card-room)', () => {
  let browser: import('playwright-core').Browser;

  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => { await browser?.close(); });

  /**
   * Open the roster at a viewport, with a UI scale already stored (it applies at boot).
   *
   * The settings blob is written and the page RELOADED every time, not only when the scale
   * differs, and `reducedMotion` is always on. The roster cards animate in over 420ms
   * (`gs-char-in`), and a fixed wait shorter than that measures a grid that has not settled: this
   * suite passed in isolation and failed under full-suite load, which is a flaky test, not a
   * layout bug. `.gs-reduced` collapses every animation duration to ~0, so the measurement is of
   * the resting layout by construction rather than by waiting long enough.
   */
  async function roster(w: number, h: number, scale = 1): Promise<{ card: Card; close: () => Promise<void> }> {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const url = `file://${dist}?intro=0&seed=42&screen=character`;
    const booted = () => document.getElementById('app')?.getAttribute('data-booted') === '1';
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(booted, { timeout: 15_000 });
    await page.evaluate(
      (s) => localStorage.setItem('fc_settings', JSON.stringify({
        sound: false, music: false, haptics: false, reducedMotion: true, leftHanded: false,
        fastShots: true, lastAscension: 0, aimMode: 'auto', readableFont: false, uiScale: s,
      })), scale,
    );
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(booted, { timeout: 15_000 });
    await page.waitForTimeout(250);
    return { card: (await page.evaluate(CARD)) as Card, close: () => page.close() };
  }

  const full = (c: Card) => [c.blurb, c.pros, c.cta, !c.hint];
  const compact = (c: Card) => [!c.blurb, !c.pros, !c.cta, c.hint];

  it('dresses the 820x760 itch embed FULL — its card is bigger than the desktop one', async () => {
    const { card, close } = await roster(820, 760);
    expect(full(card)).toEqual([true, true, true, true]);
    // The whole point: this card is not small. It was wearing the phone dressing at 390x323.
    expect(card.w).toBeGreaterThan(340);
    expect(card.h).toBeGreaterThan(300);
    // …and GS-select-onescreen's promise still holds — the roster fits with no scroll. The floor
    // is `NO_SCROLL`, not 0: the grid carries ~3px of sub-pixel slack on EVERY viewport including
    // the untouched phone (asserted below), so 0 would be pinning a rounding artefact, not the
    // promise. It is well under a scroll a player could find — 820x700 overflowed by 37px and
    // 820x680 by 57, which is what the 760px height floor exists to exclude.
    expect(card.rosterOverflow).toBeLessThan(NO_SCROLL);
    await close();
  }, 60_000);

  it('leaves a phone COMPACT', async () => {
    const { card, close } = await roster(390, 844);
    expect(compact(card)).toEqual([true, true, true, true]);
    expect(card.rosterOverflow).toBeLessThan(NO_SCROLL);
    await close();
  }, 60_000);

  it('leaves a phone in LANDSCAPE compact — wide is not the same as roomy', async () => {
    // 844x390: a 402px-wide card, wider than the desktop one, in 206px of height. Width alone
    // would have called this roomy; it is the shortest viewport the roster ever sees.
    const { card, close } = await roster(844, 390);
    expect(compact(card)).toEqual([true, true, true, true]);
    await close();
  }, 60_000);

  it('leaves the four-across desktop roster exactly as it was', async () => {
    const { card, close } = await roster(1280, 800);
    expect(full(card)).toEqual([true, true, true, true]);
    await close();
  }, 60_000);

  it('keeps a SHORT desktop window full — height never limits a single row of cards', async () => {
    // 1280x560 reads `data-gs-fit="tight"` (TIGHT_H is 660), which is why the scale veto is on the
    // two-across branch only: gating here would strip a card that fits perfectly well.
    const { card, close } = await roster(1280, 560);
    expect(card.fit).toBe('tight');
    expect(full(card)).toEqual([true, true, true, true]);
    await close();
  }, 60_000);

  it('falls back to COMPACT on the same embed at the top reader scale', async () => {
    // The media query still sees 820x760 and would say "roomy". The layout is 566x524 units — a
    // 265x195 card. `data-gs-fit` is the only thing that can tell the difference (GS-a11y-tight-fit).
    const { card, close } = await roster(820, 760, TOP_SCALE);
    expect(card.fit).toBe('tight');
    expect(compact(card)).toEqual([true, true, true, true]);
    await close();
  }, 60_000);
});
