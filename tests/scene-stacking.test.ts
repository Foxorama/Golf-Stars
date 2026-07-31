import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromePath } from './chromium';

/**
 * A FIGURE SCENE CONFINES ITS OWN STACKING (GS-scene-isolate).
 *
 * The clubhouse, the lounge, the spaceport and the ship interior all place their people and their
 * ships by the FEET: `position:absolute` at a spot, `transform:translate(-50%,-100%)`, and a
 * `z-index` derived from the spot's y so a golfer standing nearer the camera paints in front of one
 * standing further back. That is the right way to fake depth in a flat room, and it means the scenes
 * legitimately mint z-indices in the hundreds — `clubhouseLounge`'s golfers reach ~1000 and its
 * berthed ships ~230.
 *
 * Those numbers are only meaningful INSIDE the room. The app's own furniture — the settings sheet and
 * the golfer inspect card at z-index 60, the ace / eagle / victory takeovers at 60–62 — lives in the
 * root stacking context, so a scene that does not open a stacking context of its own is handing the
 * root a fistful of z-index-900 golfers. They then paint over every overlay the app can raise: the
 * reported bug was the four clubhouse golfers and their parked cars standing ON TOP of the open
 * settings sheet, name tags and all.
 *
 * TWO THINGS LOOK LIKE THEY ALREADY HANDLE THIS AND DO NOT — which is why the scenes read as safely
 * boxed rooms right up until the settings sheet goes up:
 *
 *   `overflow:hidden`   clips GEOMETRY. Paint order is z-index. A figure clipped to the room still
 *                       paints above a sheet drawn across the whole viewport.
 *   `container-type`    is NOT a stacking context. A query container reads exactly like a
 *                       self-contained room, and the computed `contain` on these frames is `none` —
 *                       measured, not assumed. Nothing about scaling your children in `cqw` units
 *                       confines their z-indices.
 *
 * `storyClubhouse` learned this once already (its `isolation:isolate` carries a comment about the
 * figures bleeding over the inspect card) and the other four scenes never got the lesson. So the rule
 * is now stated for the class rather than the instance: EVERY container-query scene frame isolates.
 * On a scene whose figures top out at 24 it is a no-op today — it is what stops the next one being
 * raised into the overlay layer.
 */

const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist/index.html');

/** Every `.ts` under `src/`, as `[path, source]`. */
function sources(): [string, string][] {
  const out: [string, string][] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(resolve(root, d), { withFileTypes: true })) {
      const p = `${d}/${entry.name}`;
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.ts')) out.push([p, readFileSync(resolve(root, p), 'utf8')]);
    }
  };
  walk('src');
  return out;
}

/**
 * A scene frame is a `container-type:inline-size` box — the marker for "a room whose contents scale
 * with it in `cqw` units", which is exactly the set of surfaces that place figures by the feet. Its
 * declaration runs to the end of the inline `style="…"` attribute or the end of the CSS rule,
 * whichever terminator comes first.
 */
function sceneFrames(): { file: string; decl: string }[] {
  const out: { file: string; decl: string }[] = [];
  for (const [file, src] of sources()) {
    for (const m of src.matchAll(/container-type:\s*inline-size/g)) {
      const rest = src.slice(m.index!);
      const end = rest.search(/["}]/);
      out.push({ file, decl: rest.slice(0, end === -1 ? 400 : end) });
    }
  }
  return out;
}

describe('every figure scene isolates its stacking context (GS-scene-isolate)', () => {
  const frames = sceneFrames();

  it('finds the scene frames at all — a scan matching nothing passes forever', () => {
    // The five known rooms: the lounge, the spaceport berths, the Earth clubhouse, the Story
    // spaceport, and the ship interior. If this drops, the marker moved and the rule stopped running.
    expect(frames.length).toBeGreaterThanOrEqual(5);
  });

  for (const { file, decl } of frames) {
    it(`${file} — its scene frame opens a stacking context`, () => {
      expect(
        decl,
        `this frame scales its contents in container units, so it is a room that places figures by the ` +
          `feet with a depth-ordered z-index. Without \`isolation:isolate\` those z-indices join the ROOT ` +
          `stacking context and paint over the settings sheet and every takeover (z-index 60+).\n` +
          `\`overflow:hidden\` does not help — it clips geometry, not paint order.\nFrame: ${decl}`,
      ).toMatch(/isolation:\s*isolate/);
    });
  }
});

describe.runIf(chromePath)('the settings sheet is above the clubhouse (GS-scene-isolate)', () => {
  let browser: import('playwright-core').Browser;

  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => { await browser?.close(); });

  /**
   * Open a screen, raise the settings sheet, and ask the DOM what is on top across the sheet's face.
   *
   * ⚠️ `elementFromPoint` is HIT-TESTING, and hit-testing is not paint order here: opening an overlay
   * seals the rest of the app with `inert` (GS-a11y-focus), and an inert subtree is removed from
   * hit-testing while still PAINTING exactly where it did. Asked naively, this probe reported the
   * sheet on top in every viewport while a screenshot of the same page showed four golfers and their
   * parked cars standing across the settings — it was blind to the one thing it was measuring.
   *
   * Stripping `inert` first restores the correspondence: with nothing suppressing hit-testing, the
   * topmost hit IS the topmost paint. Nothing else in these scenes distorts it — the decorative
   * `pointer-events:none` children (shadows, hover hints) sit inside a button that is itself
   * hit-testable, so a point over a figure still resolves to that figure.
   */
  async function topmostOverSheet(screen: string, width = 650, height = 890) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(`file://${dist}?intro=0&seed=42&screen=${screen}`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 15_000 });
    await page.click('[data-open-settings]');
    await page.waitForSelector('.gs-settings', { timeout: 5_000 });
    await page.waitForTimeout(250);

    const hits = await page.evaluate(() => {
      for (const el of document.querySelectorAll('[inert]')) el.removeAttribute('inert');
      const sheet = document.querySelector('.gs-settings') as HTMLElement;
      const r = sheet.getBoundingClientRect();
      const strays = new Set<string>();
      // A grid over the sheet's face. One centre sample would sit in a gap between two figures and
      // report clean while a golfer stood on the corner of the sheet.
      for (let ix = 1; ix <= 14; ix++) {
        for (let iy = 1; iy <= 20; iy++) {
          const x = r.left + (r.width * ix) / 15;
          const y = r.top + (r.height * iy) / 21;
          const el = document.elementFromPoint(x, y);
          if (!el) continue;
          // Anything on top of the sheet must BE the sheet (or a descendant of it). The backdrop is
          // the sheet's own parent and paints BELOW it, so a hit on it means a hole in the sheet, not
          // a stray from the screen underneath — but either way it is not something to allow blindly.
          if (sheet.contains(el)) continue;
          const cls = (el as HTMLElement).className;
          strays.add(String(typeof cls === 'string' ? cls : (cls as unknown as SVGAnimatedString)?.baseVal) || el.tagName);
        }
      }
      return { strays: [...strays], sheetH: Math.round(r.height) };
    });
    await page.close();
    return hits;
  }

  it('no clubhouse golfer or berthed ship paints over the open sheet', async () => {
    const { strays, sheetH } = await topmostOverSheet('clubhouse');
    expect(sheetH).toBeGreaterThan(100); // the sheet really is up
    // Before the fix these came back as `gs-lounge-golfer` / `gs-port-ship` — the figures the player
    // saw standing on their settings.
    expect(strays, `these painted over the settings sheet: ${strays.join(', ')}`).toEqual([]);
  }, 60_000);
});
