import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { chromePath } from './chromium';

/**
 * A SCREEN SITS IN THE MIDDLE OF THE ROOM (GS-page-centre).
 *
 * `.gs-main` is `min-height: var(--gs-vh)` — at least one viewport tall — and every screen used to
 * stack its content from the TOP of that frame, leaving the remainder black. On a phone that reads
 * as "the screen is short". On a landscape viewport it reads as broken: measured across the
 * deep-linkable screens at the 820x760 itch embed size, the Star Tour round recap left 43% of the
 * frame empty below the content, the Trade Market 47%, the champion picker 59% and the Story
 * prologue beat 64% — all of it in one slab under content glued to the top edge.
 *
 * The fix is `align-content: safe center` on the BLOCK container, and these cases guard the three
 * properties that make it the right one rather than a plausible one:
 *
 *   1. **It centres.** Content shorter than the frame sits with matched space above and below.
 *   2. **It never clips.** Content TALLER than the frame still starts at the top and scrolls —
 *      that is what `safe` buys, and a bare `center` would cut the head off (GS-a11y-sheet-scroll).
 *   3. **It stays a BLOCK container.** Flex or grid would centre too, and would also stop adjacent
 *      sibling margins collapsing and turn every child into a flex/grid item — the title screen's
 *      five sections would gain ~48px between them. The measured stack height must be identical
 *      with the alignment on and off, and `display` must still compute to `block`.
 */

const dist = resolve(__dirname, '../dist/index.html');

/** The union of `.gs-main`'s IN-FLOW children — the content stack the alignment moves. */
const STACK = `(() => {
  const m = document.querySelector('.gs-main');
  let top = Infinity, bottom = -Infinity;
  for (const c of m.children) {
    const cs = getComputedStyle(c);
    if (cs.position === 'fixed' || cs.position === 'absolute' || cs.display === 'none') continue;
    const r = c.getBoundingClientRect();
    if (r.height < 0.5) continue;
    top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom);
  }
  return { top, bottom, height: bottom - top, display: getComputedStyle(m).display,
           scrollH: document.documentElement.scrollHeight, vh: innerHeight };
})()`;

describe.runIf(chromePath)('the page frame centres its content (GS-page-centre)', () => {
  let browser: import('playwright-core').Browser;

  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => { await browser?.close(); });

  /** Boot the built app at a given viewport + deep-linked screen. */
  async function open(w: number, h: number, screen: string) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`file://${dist}?intro=0&seed=42${screen ? `&screen=${screen}` : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 15_000 });
    await page.waitForTimeout(300);
    return page;
  }

  // 820x760 is the itch.io embed's default desktop viewport — landscape, and short enough that a
  // top-anchored screen leaves a visible slab of black under it.
  it('splits the spare room above and below on a short landscape viewport', async () => {
    const page = await open(820, 760, 'trademarket');
    const s = await page.evaluate(STACK) as { top: number; bottom: number; vh: number };
    const above = s.top;
    const below = s.vh - s.bottom;
    // There IS spare room here — otherwise the case proves nothing.
    expect(above + below).toBeGreaterThan(120);
    // …and it is shared, not all dumped at the bottom. The frame's own padding is asymmetric
    // (18 top / 28 bottom), so allow a small bias rather than demanding an exact split.
    expect(Math.abs(above - below)).toBeLessThan(40);
    // The old behaviour: everything at the top, against the 18px pad.
    expect(above).toBeGreaterThan(60);
    await page.close();
  }, 60_000);

  it('leaves a screen that already fills the frame exactly where it was', async () => {
    // The full-bleed play frame is a whole viewport tall, so there is no free space to distribute.
    const page = await open(820, 760, 'storyqualmatchlive');
    const s = await page.evaluate(STACK) as { top: number; bottom: number; vh: number };
    expect(s.top).toBeLessThanOrEqual(1);
    expect(s.bottom).toBeGreaterThanOrEqual(759);
    await page.close();
  }, 60_000);

  it('starts content taller than the frame at the TOP and scrolls it (safe, not centre)', async () => {
    const page = await open(390, 700, 'shop');
    const s = await page.evaluate(STACK) as { top: number; scrollH: number; vh: number };
    // Taller than the viewport — the case only means something if it really overflows.
    expect(s.scrollH).toBeGreaterThan(s.vh + 40);
    // Nothing may be pushed above the top edge, where the page cannot scroll back to it.
    expect(s.top).toBeGreaterThanOrEqual(0);
    await page.close();
  }, 60_000);

  it('is still a BLOCK container — margins collapse exactly as before', async () => {
    const page = await open(820, 760, '');
    const on = await page.evaluate(STACK) as { height: number; display: string };
    // Turning the alignment off must not change the stack's HEIGHT — that is the property flex and
    // grid would break (sibling margins stop collapsing), and the reason this is one CSS line.
    const off = await page.evaluate(`(() => {
      const m = document.querySelector('.gs-main');
      m.style.alignContent = 'start';
      const r = ${STACK};
      m.style.alignContent = '';
      return r;
    })()`) as { height: number };
    expect(on.display).toBe('block');
    expect(Math.abs(on.height - off.height)).toBeLessThan(0.5);
    await page.close();
  }, 60_000);
});
