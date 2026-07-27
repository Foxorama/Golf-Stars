/**
 * The play screen's GOLF BAG — the bottom-right button that opens the club picker (GS-hud-bag), and
 * the small per-family club glyphs the picker's rows wear.
 *
 * Why a bag at all: the aim HUD used to spend a quarter of a phone screen on a club CYCLER (◄ name ►)
 * plus a power bar, a spray-odds legend and a carry range — three readouts that only restated the aim
 * cone already drawn on the map. The cycler is also the wrong shape for the job: a full bag is a dozen
 * clubs, so reaching a wedge from the driver is a dozen taps. One bag icon costs 56px of the corner
 * and opens the whole bag at once.
 *
 * Pure SVG string builders — no DOM, no rng, no state, node-testable. Deliberately id-free: these are
 * emitted many-per-page (one glyph per club row) and SVG ids are DOCUMENT-global, so a `<defs>`
 * gradient would collide the moment two glyphs share a screen (the `holeIdPrefix` lesson, render.md).
 * Everything is flat fills and strokes.
 */

import type { ClubFamily } from './itemArt';

/** Blend two hex colours. Local (not imported from itemArt) so this module stays a leaf. */
function mix(a: string, b: string, t: number): string {
  const p = (h: string): [number, number, number] => {
    const s = h.replace('#', '');
    const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = p(a);
  const [r2, g2, b2] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/**
 * The bag itself: a tapered body on a shadow, a themed panel + pocket band, a strap, and a fan of
 * club shafts poking out of the top. `clubs` is how many sticks show (clamped 3–7) — a fuller bag
 * genuinely looks fuller, so the graphic reads the player's own bag rather than being decoration.
 * `tint` is the golfer's colour, so the corner matches the cap, the tracer and the caddy frame.
 */
export function golfBagSVG(opts: { tint?: string; clubs?: number; muted?: boolean } = {}): string {
  const tint = opts.tint ?? '#5fd45a';
  const n = Math.max(3, Math.min(7, Math.round(opts.clubs ?? 5)));
  const body = mix(tint, '#1b2130', opts.muted ? 0.6 : 0.32);
  const panel = mix(tint, '#ffffff', 0.18);
  const dark = mix(tint, '#0b0d12', 0.5);
  const headCol = '#dfe6f0';
  const shaft = '#9fa8bb';
  // The sticks FAN from a point inside the mouth, each head rotated onto its own shaft, alternating
  // wood pear / iron blade. Three details do the whole job of saying "golf bag, not drinking cup":
  // the fan (parallel straws read as stirrers), the LEAN, and the stand legs.
  let sticks = '';
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = ((-34 + t * 68) * Math.PI) / 180;
    const len = 15.5 + (i % 2 ? 0 : 2);
    const bx = 20 + Math.sin(a) * 3.5;
    const by = 21 - Math.cos(a) * 1.5;
    const hx = 20 + Math.sin(a) * len;
    const hy = 21 - Math.cos(a) * len;
    const deg = ((a * 180) / Math.PI).toFixed(1);
    const head =
      i % 2
        ? `<path d="M -2.1 -1.9 l 4.2 0.7 l 0.6 3.3 l -4.8 0 z" fill="${headCol}" stroke="#11141b" stroke-width="0.7"/>`
        : `<ellipse cx="0" cy="0.4" rx="2.8" ry="2.1" fill="${headCol}" stroke="#11141b" stroke-width="0.7"/>`;
    sticks +=
      `<line x1="${bx.toFixed(1)}" y1="${by.toFixed(1)}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="${shaft}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<g transform="translate(${hx.toFixed(1)} ${hy.toFixed(1)}) rotate(${deg})">${head}</g>`;
  }
  // The whole bag leans on its stand, which is the single strongest read: a cup stands straight up.
  return `<svg viewBox="0 0 40 56" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" style="display:block;">
    <ellipse cx="21" cy="50.5" rx="11" ry="2.4" fill="rgba(0,0,0,.35)"/>
    <g transform="rotate(7 21 49)">
      ${sticks}
      <g stroke="#8b94a8" stroke-width="1.5" stroke-linecap="round">
        <path d="M 14 22 L 8.5 49"/><path d="M 15.5 22 L 12.5 49.5"/>
      </g>
      <path d="M 12.6 19.5 L 14.4 43 q 0.4 5.2 6.1 5.2 q 5.7 0 6.1 -5.2 L 28.4 19.5 z" fill="${body}" stroke="#11141b" stroke-width="1.5"/>
      <path d="M 12.4 19.6 q 8.6 -3.4 16.2 0 l 0.5 3.9 q -8.4 -3.2 -17.2 0 z" fill="${dark}" stroke="#11141b" stroke-width="1.2"/>
      <path d="M 15 27 q 6 -1.8 12 0 l -0.5 7.5 l -11 0 z" fill="${panel}" opacity="0.7"/>
      <rect x="15.2" y="36.5" width="10.8" height="4.4" rx="1.5" fill="${dark}"/>
      <path d="M 14.2 23.5 L 25.6 43.5" fill="none" stroke="${mix(tint, '#ffffff', 0.35)}" stroke-width="1.8" opacity="0.65" stroke-linecap="round"/>
      <path d="M 13.4 21.6 q 7.4 -2.6 14.6 0" fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.28"/>
    </g>
  </svg>`;
}

/**
 * A small club-head glyph for a picker row, by FAMILY — so a driver reads as a driver and a wedge as
 * a wedge at 22px, the same family split `itemArt`'s big card heads use (GS-club-icons). One shared
 * shaft, a per-family head: bulbous pear (driver), compact pear (wood), stubby rescue (hybrid), thin
 * blade (iron), lofted flanged blade (wedge), flat mallet (putter).
 */
export function clubGlyphSVG(family: ClubFamily, col = '#c9d2e0'): string {
  const steel = mix(col, '#e8edf5', 0.35);
  const dark = '#11141b';
  const shaft = `<line x1="5" y1="3" x2="14" y2="15" stroke="${steel}" stroke-width="2" stroke-linecap="round"/>`;
  const head =
    family === 'driver'
      ? `<path d="M 13 14 q 9 -1 9 5.5 q 0 5.5 -9 5 q -4 -0.2 -4 -5 q 0 -5.3 4 -5.5 z" fill="${col}" stroke="${dark}" stroke-width="1"/>`
      : family === 'wood'
        ? `<path d="M 13 15 q 7.5 -0.6 7.5 4.5 q 0 4.6 -7.5 4.2 q -3.4 -0.2 -3.4 -4.2 q 0 -4.3 3.4 -4.5 z" fill="${col}" stroke="${dark}" stroke-width="1"/>`
        : family === 'hybrid'
          ? `<path d="M 13 15.5 q 6 -0.5 6 4 q 0 4 -6 3.8 q -3 -0.2 -3 -3.8 q 0 -3.8 3 -4 z" fill="${col}" stroke="${dark}" stroke-width="1"/>`
          : family === 'iron'
            ? `<path d="M 12.5 15 l 5.5 1 l 1.5 7 l -7 0 z" fill="${col}" stroke="${dark}" stroke-width="1"/>`
            : family === 'wedge'
              ? `<path d="M 12 15 l 6 2 l 1.5 5 l 1.5 1.5 l -9 0 z" fill="${col}" stroke="${dark}" stroke-width="1"/>`
              : `<rect x="10" y="18" width="11" height="5" rx="1.6" fill="${col}" stroke="${dark}" stroke-width="1"/>`;
  const grooves =
    family === 'iron' || family === 'wedge'
      ? `<g stroke="${dark}" stroke-width="0.7" opacity="0.55"><path d="M13 17.5 h5 M12.8 19.4 h6 M12.6 21.3 h6.4"/></g>`
      : '';
  return `<svg viewBox="0 0 26 26" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" style="display:block;">
    ${shaft}${head}${grooves}
  </svg>`;
}
