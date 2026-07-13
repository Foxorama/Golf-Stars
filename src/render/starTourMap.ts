/**
 * STAR TOUR free-roam star map (GS-star-tour).
 *
 * A big, pannable celestial star chart: every Star Tour course sits at its constellation's real J2000
 * sky position (RA → x, Dec → y), and the player flies their ship around it to pick a world to play.
 * Distinct from the journey map (`starmap.ts`, a vertical 3-lane jump chart) — this is a whole-sky
 * chart you roam freely, framed by the spaceship bridge HUD.
 *
 * Pure & deterministic: the starfield is mulberry32-seeded (never Math.random), so the chart is
 * byte-stable. The chart is intrinsic-sized and PANS inside its viewport (the app translates it on
 * drag); worlds are tappable `<g data-startour-course>` targets, the ship is a fixed centre reticle
 * drawn by the HUD layer, not here.
 */

import { THEME_SKY } from './sky-coords';
import { shipSVG } from './shipArt';

/** One course plotted on the chart. */
export interface StarTourWorld {
  id: string;
  name: string;
  archetype: string;
  tier: 'gentle' | 'testing' | 'brutal';
  themeId: string;
  /** The player holds a record on this course (drawn with a ★). */
  hasRecord: boolean;
  /** The player's best to-par on this course, if any (shown on the planet). */
  bestToPar?: number;
}

export interface StarTourMapOpts {
  seed: string;
  worlds: StarTourWorld[];
  selectedId?: string;
  /** The player's ship (GS-star-tour-2): the character's cosmetic ride, flown around the chart. */
  shipId?: string;
  /** Ship position (chart coords) + heading (degrees, 0 = nose up). The app animates these each frame
   *  by rewriting `#gs-st-ship`'s transform; this initial value seeds the first paint. */
  shipX?: number;
  shipY?: number;
  shipHeading?: number;
}

/** The chart's intrinsic size (bigger than any viewport → it pans). */
export const CHART_W = 1600;
export const CHART_H = 1040;

/** The clubhouse SPACEPORT (GS-star-tour-2): the player's home base, where the ship starts docked and
 *  the view opens centred. A fixed chart position below the constellation field. */
export const SPACEPORT_POS = { x: CHART_W * 0.5, y: CHART_H * 0.8 };

/** How big the ship draws on the chart (shipSVG scale ≈ width/40). */
const SHIP_SCALE = 1.25;

/** Per-archetype look on the star map: planet body colour, rarity-ish accent, and a glyph. Self-
 *  contained (mirrors the journey map's BIOME_LOOK spirit, no coupling to the render palette). */
const WORLD_LOOK: Record<string, { col: string; hi: string; glyph: string }> = {
  verdant: { col: '#4a9e58', hi: '#7fe08a', glyph: '🌿' },
  desert: { col: '#c2872e', hi: '#e8c05e', glyph: '🏜' },
  frost: { col: '#7fb2d8', hi: '#d6f0ff', glyph: '❄' },
  inferno: { col: '#c24a2e', hi: '#ff9a5e', glyph: '🌋' },
  crystal: { col: '#8f6fd8', hi: '#d9c6ff', glyph: '💎' },
  tempest: { col: '#4a7ab8', hi: '#8fc0f0', glyph: '🌀' },
  fungal: { col: '#5aa84a', hi: '#b6f07a', glyph: '🍄' },
  ocean: { col: '#2f8f9a', hi: '#7fe0e6', glyph: '🌊' },
  swamp: { col: '#6a8a3a', hi: '#c6f07a', glyph: '☣' },
  metal: { col: '#8a8f96', hi: '#d6dde6', glyph: '⚙' },
  void: { col: '#4a3b78', hi: '#8f6fd8', glyph: '🕳' },
  cetus: { col: '#3a5a8a', hi: '#8fc0f0', glyph: '🐋' },
  derelict: { col: '#7a8288', hi: '#c6cdd6', glyph: '🛸' },
};

const TIER_COL: Record<StarTourWorld['tier'], string> = {
  gentle: '#5fd45a',
  testing: '#ffce54',
  brutal: '#ff6b6b',
};

/** Deterministic seeded RNG (mulberry32) — never Math.random, so the chart is byte-stable. */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Project an RA/Dec (J2000) onto the chart: RA 0–360 → x, Dec +90..−90 → y (north up). */
export function projectSky(ra: number, dec: number): { x: number; y: number } {
  return {
    x: (ra / 360) * CHART_W,
    y: ((90 - dec) / 180) * CHART_H,
  };
}

/** The projected chart position of a world (falls back to the chart centre if the theme has no sky
 *  anchor — never happens for a real Star Tour course, but keeps the projection total). */
export function worldPos(w: StarTourWorld): { x: number; y: number } {
  const sky = THEME_SKY[w.themeId];
  return sky ? projectSky(sky.ra, sky.dec) : { x: CHART_W / 2, y: CHART_H / 2 };
}

function toParLabel(toPar: number): string {
  return toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `−${-toPar}`;
}

/** One tappable world planet + label. */
function worldGlyph(w: StarTourWorld, selected: boolean): string {
  const { x, y } = worldPos(w);
  const look = WORLD_LOOK[w.archetype] ?? WORLD_LOOK.verdant!;
  const r = selected ? 24 : 19;
  const tierCol = TIER_COL[w.tier];
  const record = w.hasRecord
    ? `<g transform="translate(${r * 0.75},${-r * 0.75})"><circle r="8" fill="#0a0d1c"/><text x="0" y="3.4" font-size="11" text-anchor="middle" fill="#ffce54">★</text></g>`
    : '';
  const best =
    w.hasRecord && w.bestToPar !== undefined
      ? `<text x="0" y="${r + 30}" font-size="12" text-anchor="middle" fill="${w.bestToPar < 0 ? '#5fd45a' : w.bestToPar === 0 ? '#cdd3df' : '#ffce54'}" font-weight="700">${toParLabel(w.bestToPar)}</text>`
      : '';
  const ring = selected
    ? `<circle r="${r + 9}" fill="none" stroke="#7fe0ff" stroke-width="2.5" opacity="0.9"><animate attributeName="r" values="${r + 7};${r + 12};${r + 7}" dur="2.4s" repeatCount="indefinite"/></circle>`
    : '';
  return `
    <g class="gs-st-world" data-startour-course="${w.id}" role="button" tabindex="0" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" style="cursor:pointer;">
      ${ring}
      <circle r="${r + 6}" fill="${look.col}" opacity="0.14"/>
      <circle r="${r}" fill="${look.col}"/>
      <circle r="${r}" fill="url(#stWorldShade)"/>
      <circle r="${r}" fill="none" stroke="${tierCol}" stroke-width="2.2" opacity="0.85"/>
      <text x="0" y="${r * 0.4}" font-size="${r * 1.1}" text-anchor="middle">${look.glyph}</text>
      ${record}
      <text x="0" y="${-r - 8}" font-size="13" text-anchor="middle" fill="#e6ecf5" font-weight="700" style="paint-order:stroke;stroke:#0a0d1c;stroke-width:3px;">${w.name}</text>
      ${best}
    </g>`;
}

/** The clubhouse spaceport station — the ship's home dock, drawn as a ringed orbital platform with a
 *  lit landing pad and a "HOME" beacon. Not tappable (it's a landmark, not a course). */
function spaceportGlyph(): string {
  const { x, y } = SPACEPORT_POS;
  return `
    <g transform="translate(${x},${y})" aria-hidden="true">
      <circle r="46" fill="#39d9c4" opacity="0.06"/>
      <ellipse cx="0" cy="0" rx="42" ry="14" fill="none" stroke="#39d9c4" stroke-width="2.5" opacity="0.45"/>
      <ellipse cx="0" cy="0" rx="42" ry="14" fill="none" stroke="#7ff0e0" stroke-width="1" opacity="0.6"/>
      <circle cx="-42" cy="0" r="3" fill="#39d9c4"/><circle cx="42" cy="0" r="3" fill="#39d9c4"/>
      <rect x="-16" y="-13" width="32" height="24" rx="5" fill="#28454d"/>
      <rect x="-16" y="-13" width="32" height="7" rx="5" fill="#35636d"/>
      <rect x="-11" y="-3" width="4" height="4" rx="0.6" fill="#ffd27a"/>
      <rect x="-4" y="-3" width="4" height="4" rx="0.6" fill="#ffd27a"/>
      <rect x="3" y="-3" width="4" height="4" rx="0.6" fill="#ffd27a"/>
      <rect x="-11" y="4" width="4" height="4" rx="0.6" fill="#ffd27a"/>
      <rect x="-1" y="-24" width="2" height="11" fill="#5c7a80"/>
      <circle cx="0" cy="-25" r="2.6" fill="#ff8f5e"><animate attributeName="opacity" values="0.5;1;0.5" dur="1.6s" repeatCount="indefinite"/></circle>
      <text x="0" y="34" font-size="12" text-anchor="middle" fill="#7ff0e0" font-weight="700" style="paint-order:stroke;stroke:#0a0d1c;stroke-width:3px;letter-spacing:.1em;">SPACEPORT</text>
    </g>`;
}

/** The player's ship group (GS-star-tour-2) — positioned + rotated by the app each frame via its
 *  transform. Drawn at the origin (shipSVG at 0,0) so the wrapping transform is pure translate+rotate. */
function shipGroup(opts: StarTourMapOpts): string {
  const x = opts.shipX ?? SPACEPORT_POS.x;
  const y = opts.shipY ?? SPACEPORT_POS.y;
  const h = opts.shipHeading ?? 0;
  return `<g id="gs-st-ship" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${h.toFixed(1)})" style="pointer-events:none;">
    <circle r="30" fill="#7fe0ff" opacity="0.08"/>
    ${shipSVG(opts.shipId, 0, 0, SHIP_SCALE)}
  </g>`;
}

/** Build the full star-chart SVG (intrinsic-sized; the app pans it inside the viewport). */
export function starTourMapSVG(opts: StarTourMapOpts): string {
  const rnd = mulberry32(hashSeed(opts.seed));
  // Seeded starfield — three depth planes of twinkles.
  let stars = '';
  for (let plane = 0; plane < 3; plane++) {
    const n = [120, 80, 40][plane]!;
    const rBase = [0.6, 1.0, 1.6][plane]!;
    const opBase = [0.3, 0.5, 0.7][plane]!;
    for (let i = 0; i < n; i++) {
      const sx = (rnd() * CHART_W).toFixed(1);
      const sy = (rnd() * CHART_H).toFixed(1);
      const sr = (rBase + rnd() * rBase).toFixed(2);
      stars += `<circle cx="${sx}" cy="${sy}" r="${sr}" fill="#ffffff" opacity="${(opBase * (0.6 + rnd() * 0.4)).toFixed(2)}"/>`;
    }
  }
  // A faint RA/Dec grid so it reads as a real star chart.
  let grid = '';
  for (let gx = 1; gx < 8; gx++) {
    const x = (gx / 8) * CHART_W;
    grid += `<line x1="${x}" y1="0" x2="${x}" y2="${CHART_H}" stroke="#2a3350" stroke-width="1" opacity="0.4"/>`;
  }
  for (let gy = 1; gy < 5; gy++) {
    const y = (gy / 5) * CHART_H;
    grid += `<line x1="0" y1="${y}" x2="${CHART_W}" y2="${y}" stroke="#2a3350" stroke-width="1" opacity="0.4"/>`;
  }
  const worlds = opts.worlds.map((w) => worldGlyph(w, w.id === opts.selectedId)).join('');
  return `<svg class="gs-startour__chart" viewBox="0 0 ${CHART_W} ${CHART_H}" width="${CHART_W}" height="${CHART_H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Star Tour chart">
    <defs>
      <radialGradient id="stSky" cx="50%" cy="42%" r="80%">
        <stop offset="0%" stop-color="#141a33"/><stop offset="55%" stop-color="#0c1024"/><stop offset="100%" stop-color="#05060f"/>
      </radialGradient>
      <radialGradient id="stWorldShade" cx="36%" cy="32%" r="72%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="55%" stop-color="#ffffff" stop-opacity="0"/><stop offset="100%" stop-color="#000000" stop-opacity="0.4"/>
      </radialGradient>
    </defs>
    <rect width="${CHART_W}" height="${CHART_H}" fill="url(#stSky)"/>
    ${grid}
    ${stars}
    ${spaceportGlyph()}
    ${worlds}
    ${shipGroup(opts)}
  </svg>`;
}
