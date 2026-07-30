import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { spaceSkyTileSVG, spaceSkyCssUrl, SKY_TILE } from '../src/render/spaceSky';
import { chromePath } from './chromium';

/**
 * THE PAGE SITS IN SPACE (GS-space-sky).
 *
 * `body` was `--gs-bg` plus a faint vignette and `.gs-main` sets no background, so every surface
 * that is not a panel or a canvas was flat near-black. Measured, that is 71% of the width behind
 * the full-bleed play frame on any 16:9 fullscreen (the frame is capped to a portrait strip by
 * GS-play-desktop-frame) and 68% behind an 820px-wide menu column at 2560x1440.
 *
 * The pure cases below pin the two properties that are easy to lose in a refactor — the tile is
 * deterministic, and it WRAPS — and the browser cases pin the two that make it safe: the CSS
 * degrades to the old vignette without the boot call, and the sky never becomes something a
 * pointer can hit.
 */

const dist = resolve(__dirname, '../dist/index.html');

describe('the star tile (pure)', () => {
  it('is deterministic — the same sky on every boot', () => {
    expect(spaceSkyTileSVG()).toBe(spaceSkyTileSVG());
    // …and a different seed really is a different sky, so the seed is doing something.
    expect(spaceSkyTileSVG(1)).not.toBe(spaceSkyTileSVG(2));
  });

  it('never calls Math.random', () => {
    // The determinism case above proves it for TODAY's code; this proves it cannot be introduced
    // tomorrow. Comments are stripped first — the module's own header says "never `Math.random`",
    // and a guard that matches its own documentation is a guard that fails for the wrong reason.
    const src = readFileSync(resolve(__dirname, '../src/render/spaceSky.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(src).not.toMatch(/Math\s*\.\s*random/);
  });

  it('emits every star at all nine wrap offsets, so the repeat has no join', () => {
    const svg = spaceSkyTileSVG();
    const pts = [...svg.matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)"/g)].map(
      (m) => `${Number(m[1]).toFixed(1)},${Number(m[2]).toFixed(1)}`,
    );
    const set = new Set(pts);
    expect(pts.length % 9).toBe(0);
    // Each in-tile star must have a twin one tile to the right, and one a tile down.
    const inTile = [...set].map((p) => p.split(',').map(Number) as [number, number])
      .filter(([x, y]) => x >= 0 && x < SKY_TILE && y >= 0 && y < SKY_TILE);
    expect(inTile.length).toBeGreaterThan(50);
    for (const [x, y] of inTile) {
      expect(set.has(`${(x + SKY_TILE).toFixed(1)},${y.toFixed(1)}`), `no +x twin for ${x},${y}`).toBe(true);
      expect(set.has(`${x.toFixed(1)},${(y + SKY_TILE).toFixed(1)}`), `no +y twin for ${x},${y}`).toBe(true);
    }
  });

  it('never rules a link across the whole tile — the link search is TOROIDAL', () => {
    // THE bug this guards. Two stars that are neighbours ACROSS an edge are a far-apart pair in
    // plain coordinates; drawing to the unwrapped partner puts a line straight through the middle
    // of the tile, which is the one artefact a starfield cannot hide. Every link must be no longer
    // than the search radius it was found within (sqrt(20000) ~ 141.4).
    const svg = spaceSkyTileSVG();
    const lens = [...svg.matchAll(/<line x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/g)]
      .map((m) => Math.hypot(Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])));
    expect(lens.length).toBeGreaterThan(0);
    expect(Math.max(...lens)).toBeLessThan(142);
  });

  it('produces a CSS url() with nothing left to break the declaration', () => {
    const url = spaceSkyCssUrl();
    expect(url.startsWith('url("data:image/svg+xml,')).toBe(true);
    const payload = url.slice('url("data:image/svg+xml,'.length, -2);
    // A raw `#` from a colour ends the URL and the rest of the stylesheet reads as a fragment;
    // a raw quote closes the string early. Both are what encodeURIComponent is here for.
    expect(payload).not.toContain('#');
    expect(payload).not.toContain('"');
    expect(decodeURIComponent(payload).startsWith('<svg')).toBe(true);
  });
});

describe('the stylesheet', () => {
  const css = readFileSync(resolve(__dirname, '../index.html'), 'utf8');

  it('falls back to the old vignette when the sky was never applied', () => {
    // The whole reason it is a custom property: a build where the boot call does not run must land
    // on today's background, never on a hole where a layer should be.
    expect(css).toContain('var(--gs-sky, none)');
  });

  it('repeats ONLY the star layer — the vignette blobs are single placed washes', () => {
    expect(css).toMatch(/background-repeat:\s*repeat,\s*no-repeat,\s*no-repeat/);
  });
});

describe.runIf(chromePath)('the sky in a real browser', () => {
  let browser: import('playwright-core').Browser;

  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => { await browser?.close(); });

  it('is applied to <html> at boot and reaches body as a real background layer', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`file://${dist}?intro=0&seed=42`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 15_000 });
    const r = await page.evaluate(() => ({
      prop: document.documentElement.style.getPropertyValue('--gs-sky').slice(0, 24),
      bg: getComputedStyle(document.body).backgroundImage,
      attach: getComputedStyle(document.body).backgroundAttachment,
    }));
    expect(r.prop).toContain('url(');
    // Three layers: the tile plus the two vignette blobs.
    expect(r.bg).toContain('data:image/svg+xml');
    expect(r.bg.split('gradient').length - 1).toBe(2);
    // Fixed, or the sky would scroll away from a long shop page and leave black behind it.
    expect(r.attach.split(',')[0]!.trim()).toBe('fixed');
    await page.close();
  }, 60_000);

  it('adds no element, so it can never eat a tap or a tab stop', async () => {
    // A `position: fixed` sky layer would have needed z-index, pointer-events and a mount outside
    // #app. A background has no node at all — this pins that it stayed that way.
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`file://${dist}?intro=0&seed=42`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 15_000 });
    const bodyKids = await page.evaluate(() =>
      [...document.body.children].filter((c) => c.tagName !== 'SCRIPT').map((c) => c.id || c.tagName),
    );
    expect(bodyKids).not.toContain('gs-sky');
    // The element at the top-left corner — deep in the play letterbox on a wide viewport — is the
    // page itself, not a decorative overlay sitting on top of everything.
    const top = await page.evaluate(() => document.elementFromPoint(4, 4)?.tagName ?? '');
    expect(['HTML', 'BODY', 'MAIN', 'DIV']).toContain(top);
    await page.close();
  }, 60_000);
});
