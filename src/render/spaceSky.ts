/**
 * The page sits in space (GS-space-sky).
 *
 * `body` was `--gs-bg` plus a faint two-blob vignette, and `.gs-main` sets no background of its
 * own — so every surface that is not a panel or a canvas was flat near-black. That is invisible on
 * a phone, where the play screen fills the display and the menus are dense. It is very visible on
 * a large screen, and worst of all in FULLSCREEN, which is where a desktop player actually plays:
 *
 *   · The play frame is capped to a portrait strip whenever the viewport aspect is >= 3/4
 *     (GS-play-desktop-frame — an uncapped wide container yields a wide camera and every shot
 *     reads as over-zoomed). Measured, the frame uses **29%** of the width on any 16:9 display and
 *     22% on a 21:9 ultrawide. The other 71-78% was bare `--gs-bg`.
 *   · The menus are worse, and were missed the first time round: `.gs-main` caps at 820px, so at
 *     2560x1440 a shop, clubhouse or recap is an 820px column with **68%** of the width empty.
 *
 * Both are the same missing thing — a background — so this is one answer rather than a letterbox
 * patch plus a menu patch.
 *
 * IT IS A `body` BACKGROUND LAYER, NOT AN ELEMENT, and that is the whole reason it is small:
 *   · A `position: fixed` layer would need a size, and a fixed box inside a `zoom`ed root does not
 *     measure the display (GS-a11y-scale-wrap) — it would want a `--gs-vw` token that does not
 *     exist. `body`'s background propagates to the canvas and covers the viewport at any zoom, for
 *     free.
 *   · It would need `z-index: -1` and would then depend on nothing above it ever creating a
 *     stacking context.
 *   · It would need mounting OUTSIDE `#app` (like `#gs-live`) to survive `render()`.
 * A background layer has none of those problems, and it paints from the first frame — before the
 * module bundle has even run, if the value is already there.
 *
 * The tile is built at RUNTIME and handed to CSS as a custom property, so it costs the BUNDLE
 * nothing but the generator; and CSS reads it as `var(--gs-sky, none)`, so a build where this
 * never runs degrades to exactly today's background rather than to a broken one.
 *
 * Seeded with mulberry32, never `Math.random` — the sim's rule, and it also means the sky is the
 * same sky on every boot instead of re-rolling under the player.
 */

import { mulberry32 } from './style/shared';
import { STAR_TINTS } from './starTourMap';

/** Tile edge, in CSS px. Matches the itch store page's sky so the two are one field. */
export const SKY_TILE = 1024;

/**
 * One star per this many px². Deliberately sparse: this is a field that TEXT SITS ON, not a chart
 * you look at, and it has to stay invisible until you look for it.
 */
const PX2_PER_STAR = 4200;

/** Fixed — the sky must not re-roll between boots, and `Math.random` is banned besides. */
const SKY_SEED = 20260801;

/**
 * A seamless star tile, as SVG markup.
 *
 * Every star and link is emitted at all NINE (±TILE) offsets, so anything crossing an edge
 * reappears on the opposite one and the repeat has no visible join. The link search uses TOROIDAL
 * distance and draws along the WRAPPED delta — without that, two stars that are neighbours ACROSS
 * an edge are found as a far-apart pair and the tile gets a long line ruled across its middle
 * instead of a figure that continues into the next tile.
 *
 * Pure: same seed, same string, no DOM.
 */
export function spaceSkyTileSVG(seed = SKY_SEED, tile = SKY_TILE): string {
  const rnd = mulberry32(seed);
  const wrap = (d: number): number => (d > tile / 2 ? d - tile : d < -tile / 2 ? d + tile : d);

  const stars: { x: number; y: number; r: number; a: number; t: string }[] = [];
  const n = Math.round((tile * tile) / PX2_PER_STAR);
  for (let i = 0; i < n; i++) {
    stars.push({
      x: rnd() * tile,
      y: rnd() * tile,
      r: 0.5 + rnd() * 1.4,
      // Capped well below a foreground star's: body text reads over this.
      a: 0.16 + rnd() * 0.42,
      t: STAR_TINTS[(rnd() * STAR_TINTS.length) | 0]!,
    });
  }

  // Constellation links — the intro cinematic's motif. AT MOST ONE PER STAR, to its nearest
  // unclaimed neighbour: linking every near pair produces a triangulated mesh that reads as
  // scribble, not as star figures.
  const links: [{ x: number; y: number }, { x: number; y: number }][] = [];
  const claimed = new Set<number>();
  for (let i = 0; i < stars.length; i++) {
    if (claimed.has(i) || rnd() > 0.34) continue;
    let best = -1;
    let bestD = 20000; // (~140px)²
    for (let j = 0; j < stars.length; j++) {
      if (j === i || claimed.has(j)) continue;
      const dx = wrap(stars[i]!.x - stars[j]!.x);
      const dy = wrap(stars[i]!.y - stars[j]!.y);
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = j; }
    }
    if (best < 0) continue;
    claimed.add(i);
    claimed.add(best);
    const s = stars[i]!;
    links.push([s, { x: s.x - wrap(s.x - stars[best]!.x), y: s.y - wrap(s.y - stars[best]!.y) }]);
  }

  const OFF = [-tile, 0, tile];
  const tiled = (fn: (dx: number, dy: number) => string): string =>
    OFF.map((dx) => OFF.map((dy) => fn(dx, dy)).join('')).join('');
  const f = (v: number): string => v.toFixed(1);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}">` +
    tiled((dx, dy) =>
      links
        .map(
          ([a, b]) =>
            `<line x1="${f(a.x + dx)}" y1="${f(a.y + dy)}" x2="${f(b.x + dx)}" y2="${f(b.y + dy)}" stroke="#9fd8e6" stroke-width=".6" opacity=".10"/>`,
        )
        .join(''),
    ) +
    tiled((dx, dy) =>
      stars
        .map((s) => `<circle cx="${f(s.x + dx)}" cy="${f(s.y + dy)}" r="${s.r.toFixed(2)}" fill="${s.t}" opacity="${s.a.toFixed(2)}"/>`)
        .join(''),
    ) +
    `</svg>`
  );
}

/** The tile as a CSS `url(…)` value, ready to drop into a `background-image` layer. */
export function spaceSkyCssUrl(seed = SKY_SEED, tile = SKY_TILE): string {
  // `encodeURIComponent` rather than base64: it is smaller for markup, and it escapes the `#` in
  // every colour, which is what actually breaks a raw SVG data URI in CSS.
  return `url("data:image/svg+xml,${encodeURIComponent(spaceSkyTileSVG(seed, tile))}")`;
}

/**
 * Hand the sky to CSS. Guarded like `applyViewportFit` so the node-side sim and the tests can
 * import this module freely.
 *
 * Set on `<html>`, not `<body>`: the property has to be readable by the `body` rule that consumes
 * it, and the root is where every other theme token already lives.
 */
export function applySpaceSky(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--gs-sky', spaceSkyCssUrl());
}
