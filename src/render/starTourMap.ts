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
import { shipById, DEFAULT_SHIP_ID, type ShipLook } from '../sim/rpg/ships';

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
  /** Ship position (chart coords) + heading (degrees, 0 = nose along +x, matching the right-facing
   *  ship art). The app animates these each frame by rewriting `#gs-st-ship`'s transform; this initial
   *  value seeds the first paint. `shipFlip` (+1 / −1) mirrors the hull vertically when it flies LEFT so
   *  a wheeled/keeled craft never reads belly-up (a spaceship has no "up", but these are drawn vehicles). */
  shipX?: number;
  shipY?: number;
  shipHeading?: number;
  shipFlip?: number;
  /** Chart zoom (pinch/scroll). 1 = intrinsic size; the SVG's px width/height scale by this while the
   *  viewBox stays fixed, so ship/world chart-coords are unchanged and only the render size grows. */
  zoom?: number;
}

/** The ship's docked heading (GS-star-tour): nose UP (−90° in the +x-facing art frame), poised toward
 *  the constellation field above the home spaceport. */
export const SHIP_DOCK_HEADING = -90;

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

/** The surface CHARACTER a world's planet is painted with (GS-star-tour-map-improvements). Keyed by
 *  archetype so a world still reads its biome at a glance, but the individual craters/bands/continents
 *  are seeded per world so two courses of the SAME archetype never look alike. */
type SurfaceFamily = 'lush' | 'rocky' | 'gas' | 'fiery' | 'crystal';
const SURFACE_FAMILY: Record<string, SurfaceFamily> = {
  verdant: 'lush',
  fungal: 'lush',
  swamp: 'lush',
  desert: 'rocky',
  metal: 'rocky',
  derelict: 'rocky',
  frost: 'rocky',
  ocean: 'gas',
  tempest: 'gas',
  cetus: 'gas',
  void: 'gas',
  inferno: 'fiery',
  crystal: 'crystal',
};

/** Sanitise a world id into an SVG-id-safe suffix (clip ids are per-world — many worlds co-mount). */
function idSafe(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, '');
}

/** Nudge a #rrggbb hex toward white (amt>0) or black (amt<0) by |amt| (0..1) — for surface shading. */
function shadeHex(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(amt));
  const mix = (c: number) => Math.round(c + (t - c) * p);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** The seeded surface features drawn INSIDE a planet's disc, per family. Returns clip-bounded markup
 *  (the caller wraps it in a per-world circular clip). Pure + mulberry32-seeded → byte-stable. */
function planetSurface(fam: SurfaceFamily, r: number, col: string, hi: string, rnd: () => number): string {
  let s = '';
  const rr = (v: number) => v.toFixed(1);
  if (fam === 'lush') {
    // Organic continents (hi) over darker seas — a couple of blobby land masses.
    const seas = shadeHex(col, -0.22);
    s += `<circle r="${rr(r)}" fill="${seas}" opacity="0.35"/>`;
    const n = 2 + ((rnd() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * r * 0.5;
      const cx = Math.cos(a) * d;
      const cy = Math.sin(a) * d;
      const rx = r * (0.28 + rnd() * 0.28);
      const ry = r * (0.2 + rnd() * 0.24);
      const rot = (rnd() * 180) | 0;
      s += `<ellipse cx="${rr(cx)}" cy="${rr(cy)}" rx="${rr(rx)}" ry="${rr(ry)}" fill="${hi}" opacity="0.62" transform="rotate(${rot} ${rr(cx)} ${rr(cy)})"/>`;
    }
  } else if (fam === 'rocky') {
    // Impact craters — dark pits with a lit rim, scattered across the face.
    const pit = shadeHex(col, -0.3);
    const rim = shadeHex(col, 0.28);
    const n = 3 + ((rnd() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * r * 0.62;
      const cx = Math.cos(a) * d;
      const cy = Math.sin(a) * d;
      const cr = r * (0.1 + rnd() * 0.14);
      s += `<circle cx="${rr(cx)}" cy="${rr(cy)}" r="${rr(cr)}" fill="${pit}" opacity="0.55"/>`;
      s += `<circle cx="${rr(cx - cr * 0.24)}" cy="${rr(cy - cr * 0.24)}" r="${rr(cr * 0.72)}" fill="${rim}" opacity="0.32"/>`;
    }
  } else if (fam === 'gas') {
    // Latitudinal cloud bands + a great storm spot.
    const n = 3 + ((rnd() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const cy = -r * 0.6 + (i / (n - 1)) * r * 1.2;
      const ry = r * (0.1 + rnd() * 0.1);
      const fill = i % 2 === 0 ? hi : shadeHex(col, -0.16);
      s += `<ellipse cx="0" cy="${rr(cy)}" rx="${rr(r * 1.05)}" ry="${rr(ry)}" fill="${fill}" opacity="0.4"/>`;
    }
    const sa = rnd() * Math.PI * 2;
    const sd = r * (0.2 + rnd() * 0.3);
    const scx = Math.cos(sa) * sd;
    const scy = Math.sin(sa) * sd * 0.5;
    const sr = r * (0.16 + rnd() * 0.12);
    s += `<ellipse cx="${rr(scx)}" cy="${rr(scy)}" rx="${rr(sr * 1.3)}" ry="${rr(sr)}" fill="${shadeHex(hi, 0.15)}" opacity="0.7"/>`;
    s += `<ellipse cx="${rr(scx)}" cy="${rr(scy)}" rx="${rr(sr * 0.6)}" ry="${rr(sr * 0.45)}" fill="#ffffff" opacity="0.5"/>`;
  } else if (fam === 'fiery') {
    // A molten face — glowing cracks branching from a hot core.
    const hot = shadeHex(hi, 0.2);
    s += `<circle r="${rr(r)}" fill="${shadeHex(col, -0.3)}" opacity="0.4"/>`;
    const n = 3 + ((rnd() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const x1 = Math.cos(a) * r * 0.15;
      const y1 = Math.sin(a) * r * 0.15;
      const x2 = Math.cos(a) * r * (0.7 + rnd() * 0.25);
      const y2 = Math.sin(a) * r * (0.7 + rnd() * 0.25);
      const mx = (x1 + x2) / 2 + (rnd() - 0.5) * r * 0.3;
      const my = (y1 + y2) / 2 + (rnd() - 0.5) * r * 0.3;
      s += `<path d="M${rr(x1)},${rr(y1)} Q${rr(mx)},${rr(my)} ${rr(x2)},${rr(y2)}" fill="none" stroke="${hot}" stroke-width="${rr(r * 0.09)}" stroke-linecap="round" opacity="0.85"/>`;
    }
    s += `<circle r="${rr(r * 0.22)}" fill="#fff2c0" opacity="0.85"/>`;
  } else {
    // crystal — faceted gem shards radiating from the centre.
    const n = 4 + ((rnd() * 3) | 0);
    const start = rnd() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a0 = start + (i / n) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / n;
      const mr = r * (0.7 + rnd() * 0.3);
      const x1 = Math.cos(a0) * mr;
      const y1 = Math.sin(a0) * mr;
      const x2 = Math.cos(a1) * mr * 0.9;
      const y2 = Math.sin(a1) * mr * 0.9;
      const fill = i % 2 === 0 ? hi : shadeHex(hi, -0.2);
      s += `<path d="M0,0 L${rr(x1)},${rr(y1)} L${rr(x2)},${rr(y2)} Z" fill="${fill}" opacity="0.5" stroke="${shadeHex(hi, 0.35)}" stroke-width="0.6"/>`;
    }
  }
  return s;
}

/** A richly-drawn, per-world UNIQUE planet body (GS-star-tour-map-improvements). Replaces the old flat
 *  disc + emoji: an atmosphere halo, a seeded surface (craters / bands / continents / lava / facets by
 *  archetype family), an optional Saturn ring + moons, a lit rim, and the archetype emoji as a small
 *  emblem. Everything past the palette is seeded off the world id, so the two verdant / two desert /
 *  … courses that used to render identically now each look distinct. Pure + mulberry32-seeded. */
function planetBody(w: StarTourWorld, r: number, look: { col: string; hi: string; glyph: string }): string {
  const rnd = mulberry32(hashSeed('stworld:' + w.id));
  const fam = SURFACE_FAMILY[w.archetype] ?? 'rocky';
  const { col, hi, glyph } = look;
  const rr = (v: number) => v.toFixed(1);
  const clipId = `stwClip-${idSafe(w.id)}`;

  // Optional planetary RING (~42%) — a tilted ellipse, back arc behind the body, near arc in front.
  const ringed = rnd() < 0.42;
  const ringTilt = -34 + rnd() * 22;
  const rrx = r * 1.95;
  const rry = r * 0.5;
  const ringW = r * 0.26;
  const ringCol = shadeHex(hi, 0.1);
  const ringLine = shadeHex(hi, 0.45);
  const ringBack = ringed
    ? `<g transform="rotate(${rr(ringTilt)})"><ellipse rx="${rr(rrx)}" ry="${rr(rry)}" fill="none" stroke="${ringCol}" stroke-width="${rr(ringW)}" opacity="0.4"/><ellipse rx="${rr(rrx)}" ry="${rr(rry)}" fill="none" stroke="${ringLine}" stroke-width="1" opacity="0.6"/></g>`
    : '';
  const ringFront = ringed
    ? `<g transform="rotate(${rr(ringTilt)})"><path d="M${rr(-rrx)},0 A ${rr(rrx)} ${rr(rry)} 0 0 0 ${rr(rrx)},0" fill="none" stroke="${ringCol}" stroke-width="${rr(ringW)}" opacity="0.55"/><path d="M${rr(-rrx)},0 A ${rr(rrx)} ${rr(rry)} 0 0 0 ${rr(rrx)},0" fill="none" stroke="${ringLine}" stroke-width="1" opacity="0.75"/></g>`
    : '';

  // Seeded MOONS (0–2), parked to the sides so they never crowd the name (top) or record (bottom).
  const moonN = rnd() < 0.35 ? 0 : rnd() < 0.72 ? 1 : 2;
  let moons = '';
  for (let i = 0; i < moonN; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const mx = side * r * (1.5 + rnd() * 0.5);
    const my = (-0.35 + rnd() * 0.55) * r;
    const mr = r * (0.15 + rnd() * 0.08);
    moons += `<g transform="translate(${rr(mx)} ${rr(my)})"><circle r="${rr(mr)}" fill="#c6ccd8"/><circle r="${rr(mr)}" fill="url(#stWorldShade)"/><circle cx="${rr(mr * 0.3)}" cy="${rr(mr * 0.2)}" r="${rr(mr * 0.28)}" fill="#8f97a6" opacity="0.5"/></g>`;
  }

  return `
    ${moons}
    <circle r="${rr(r + 7)}" fill="${hi}" opacity="0.14"/>
    ${ringBack}
    <clipPath id="${clipId}"><circle r="${rr(r)}"/></clipPath>
    <circle r="${rr(r)}" fill="${col}"/>
    <g clip-path="url(#${clipId})">${planetSurface(fam, r, col, hi, rnd)}</g>
    <circle r="${rr(r)}" fill="url(#stWorldShade)"/>
    ${ringFront}
    <text x="0" y="${rr(r * 0.34)}" font-size="${rr(r * 0.82)}" text-anchor="middle" opacity="0.92" style="paint-order:stroke;stroke:${shadeHex(col, -0.4)};stroke-width:1.4px;">${glyph}</text>`;
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
      ${planetBody(w, r, look)}
      <circle r="${r}" fill="none" stroke="${tierCol}" stroke-width="2.2" opacity="0.85"/>
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

/** The engine THRUST wake (GS-star-tour) — a layered ion plume trailing behind the hull so the ship
 *  reads as FLYING, not sliding. Authored in the ±20u right-facing ship frame trailing off the tail
 *  (−x), coloured off the ship's own flame/accent for cohesion; SMIL flicker + charge particles racing
 *  down the wake. Wrapped in `.gs-st-thrust` — the app fades it in only while the engines are firing
 *  (a `.gs-st-thrusting` class on `#gs-st-ship`), so a docked/idle ship shows no plume. */
function thrustTrail(look: ShipLook): string {
  const { flame, accent } = look;
  const flick = (dur: string): string =>
    `<animate attributeName="opacity" values="0.9;0.4;0.75;0.45;0.9" dur="${dur}" repeatCount="indefinite"/>`;
  const particle = (beg: string, dy: number, dur: string): string =>
    `<circle cx="-22" cy="${dy}" r="1.2" fill="#eaffff" opacity="0">
       <animate attributeName="opacity" values="0;0.95;0" dur="${dur}" begin="${beg}" repeatCount="indefinite"/>
       <animateTransform attributeName="transform" type="translate" values="0 0;-32 ${dy > 1 ? 1.4 : -1.4}" dur="${dur}" begin="${beg}" repeatCount="indefinite"/>
     </circle>`;
  return `<g class="gs-st-thrust" stroke="none">
    <path d="M-15,-3.4 C-34,-9 -52,-7 -63,1 C-52,9 -34,11 -15,5.4 Z" fill="${flame}" opacity="0.26">${flick('1.0s')}</path>
    <path d="M-15,-1.8 C-31,-6 -46,-4.5 -54,1 C-46,7.5 -31,7.5 -15,3.8 Z" fill="${accent}" opacity="0.5">${flick('0.6s')}</path>
    <path d="M-15,0 C-26,-2.2 -37,-1 -45,1.2 C-37,4.2 -26,5 -15,2.6 Z" fill="#ffffff" opacity="0.82">${flick('0.4s')}</path>
    <circle cx="-15" cy="1" r="4.6" fill="#bfffff" opacity="0.5"><animate attributeName="r" values="3.6;5.2;3.6" dur="0.5s" repeatCount="indefinite"/></circle>
    <circle cx="-15" cy="1" r="2" fill="#ffffff" opacity="0.9"/>
    ${particle('0s', 0.6, '0.7s')}${particle('0.24s', 2.6, '0.9s')}${particle('0.5s', -1.2, '0.6s')}
  </g>`;
}

/** The player's ship group (GS-star-tour-2) — positioned, rotated + flipped by the app each frame via
 *  its transform. Drawn at the origin (shipSVG at 0,0) so the wrapping transform is a pure
 *  translate+rotate+scale. The ship art faces +x (right), so heading 0 = flying right; the app feeds
 *  `atan2(dy,dx)` so the nose always points along the flight (the old code fed a 0=up heading into a
 *  right-facing hull, which is why a downward flight rendered upside-down). */
function shipGroup(opts: StarTourMapOpts): string {
  const x = opts.shipX ?? SPACEPORT_POS.x;
  const y = opts.shipY ?? SPACEPORT_POS.y;
  const h = opts.shipHeading ?? SHIP_DOCK_HEADING;
  const flip = opts.shipFlip ?? 1;
  const look = (shipById(opts.shipId) ?? shipById(DEFAULT_SHIP_ID)!).look;
  return `<g id="gs-st-ship" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${h.toFixed(1)}) scale(1 ${flip})" style="pointer-events:none;">
    <circle r="30" fill="#7fe0ff" opacity="0.08"/>
    <g transform="scale(${SHIP_SCALE})">${thrustTrail(look)}</g>
    ${shipSVG(opts.shipId, 0, 0, SHIP_SCALE)}
  </g>`;
}

/** Star tints — most stars are white, but a galaxy reads richer with a scatter of blue-white giants,
 *  warm gold suns and the odd red one. Weighted so white dominates. */
const STAR_TINTS = ['#ffffff', '#ffffff', '#ffffff', '#dbe6ff', '#bcd4ff', '#fff0cf', '#ffd8a8', '#ffc0b0'];

/** Deep-space nebula clouds — soft, luminous colour washes that give the chart a galaxy/system feel
 *  instead of a flat black field. Fixed positions/hues (only ONE star map mounts at a time, so the
 *  document-global gradient ids are safe — unlike the co-mounted hole SVGs). */
function nebulaClouds(rnd: () => number): { defs: string; body: string } {
  const HUES = [
    ['#3b6bd6', '#7f3bd6'], // blue → violet
    ['#2fa39a', '#1f5f8a'], // teal → deep blue
    ['#c23b8f', '#5a2a8a'], // magenta → purple
    ['#d67f3b', '#8a3a2a'], // amber → rust
    ['#3b8fd6', '#2a5a8a'], // sky blue
  ];
  let defs = '';
  let body = '';
  for (let i = 0; i < 5; i++) {
    const cx = (0.12 + rnd() * 0.76) * CHART_W;
    const cy = (0.08 + rnd() * 0.82) * CHART_H;
    const rx = (150 + rnd() * 220).toFixed(0);
    const ry = (110 + rnd() * 170).toFixed(0);
    const rot = (rnd() * 180).toFixed(0);
    const [a, b] = HUES[i % HUES.length]!;
    const id = `stNeb${i}`;
    defs += `<radialGradient id="${id}" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="${a}" stop-opacity="0.30"/>
      <stop offset="45%" stop-color="${b}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${b}" stop-opacity="0"/>
    </radialGradient>`;
    body += `<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${rx}" ry="${ry}" fill="url(#${id})" transform="rotate(${rot} ${cx.toFixed(0)} ${cy.toFixed(0)})"/>`;
  }
  return { defs, body };
}

/** The galaxy's core band — a soft diagonal river of light dense with dust, sweeping across the chart
 *  like the Milky Way. A wide translucent stroke + a brighter core, plus a knot of glow at its heart. */
function galaxyBand(): string {
  const y0 = CHART_H * 0.28;
  const y1 = CHART_H * 0.66;
  const path = `M0,${y0.toFixed(0)} C${(CHART_W * 0.35).toFixed(0)},${(y0 - 60).toFixed(0)} ${(CHART_W * 0.62).toFixed(0)},${(y1 + 40).toFixed(0)} ${CHART_W},${y1.toFixed(0)}`;
  const cx = CHART_W * 0.5;
  const cy = (y0 + y1) / 2 - 6;
  return `
    <g opacity="0.6">
      <path d="${path}" fill="none" stroke="url(#stBand)" stroke-width="230" stroke-linecap="round"/>
      <path d="${path}" fill="none" stroke="url(#stBand)" stroke-width="90" stroke-linecap="round" opacity="0.8"/>
      <ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="200" ry="60" fill="url(#stCore)" transform="rotate(-16 ${cx.toFixed(0)} ${cy.toFixed(0)})"/>
    </g>`;
}

/** Build the full star-chart SVG (intrinsic-sized; the app pans it inside the viewport). `opts.zoom`
 *  scales the rendered px size (viewBox fixed → chart coords unchanged). */
export function starTourMapSVG(opts: StarTourMapOpts): string {
  const rnd = mulberry32(hashSeed(opts.seed));
  const zoom = opts.zoom ?? 1;
  const neb = nebulaClouds(rnd);
  // Seeded starfield — four depth planes of tinted twinkles (denser + more colourful than a flat white
  // field), some slowly pulsing so the sky feels alive.
  let stars = '';
  const counts = [260, 170, 90, 34];
  const rBases = [0.55, 0.9, 1.4, 2.1];
  const opBases = [0.32, 0.5, 0.72, 0.92];
  for (let plane = 0; plane < counts.length; plane++) {
    const n = counts[plane]!;
    const rBase = rBases[plane]!;
    const opBase = opBases[plane]!;
    for (let i = 0; i < n; i++) {
      const sx = (rnd() * CHART_W).toFixed(1);
      const sy = (rnd() * CHART_H).toFixed(1);
      const sr = (rBase + rnd() * rBase).toFixed(2);
      const tint = STAR_TINTS[(rnd() * STAR_TINTS.length) | 0]!;
      const op = (opBase * (0.6 + rnd() * 0.4)).toFixed(2);
      // The nearest plane's brightest stars twinkle; the rest stay steady (perf + calm).
      const twinkle =
        plane >= 2 && rnd() < 0.35
          ? `<animate attributeName="opacity" values="${op};${(Number(op) * 0.4).toFixed(2)};${op}" dur="${(2.4 + rnd() * 3).toFixed(1)}s" repeatCount="indefinite"/>`
          : '';
      stars += `<circle cx="${sx}" cy="${sy}" r="${sr}" fill="${tint}" opacity="${op}">${twinkle}</circle>`;
    }
  }
  // A handful of bright hero stars with a soft halo + a diffraction cross — the anchors the eye reads
  // as nearby suns.
  let heroes = '';
  for (let i = 0; i < 10; i++) {
    const hx = (rnd() * CHART_W).toFixed(1);
    const hy = (rnd() * CHART_H).toFixed(1);
    const tint = STAR_TINTS[(rnd() * STAR_TINTS.length) | 0]!;
    const s = (2.4 + rnd() * 2).toFixed(1);
    heroes += `<g transform="translate(${hx} ${hy})">
      <circle r="${(Number(s) * 3).toFixed(1)}" fill="${tint}" opacity="0.10"/>
      <path d="M0,-${(Number(s) * 3.4).toFixed(1)} L0,${(Number(s) * 3.4).toFixed(1)} M-${(Number(s) * 3.4).toFixed(1)},0 L${(Number(s) * 3.4).toFixed(1)},0" stroke="${tint}" stroke-width="0.7" opacity="0.35"/>
      <circle r="${s}" fill="#ffffff"/>
      <circle r="${(Number(s) * 1.8).toFixed(1)}" fill="${tint}" opacity="0.4"/>
    </g>`;
  }
  // A faint RA/Dec grid so it reads as a real star chart (kept subtle under the richer sky).
  let grid = '';
  for (let gx = 1; gx < 8; gx++) {
    const x = (gx / 8) * CHART_W;
    grid += `<line x1="${x}" y1="0" x2="${x}" y2="${CHART_H}" stroke="#2a3350" stroke-width="1" opacity="0.28"/>`;
  }
  for (let gy = 1; gy < 5; gy++) {
    const y = (gy / 5) * CHART_H;
    grid += `<line x1="0" y1="${y}" x2="${CHART_W}" y2="${y}" stroke="#2a3350" stroke-width="1" opacity="0.28"/>`;
  }
  const worlds = opts.worlds.map((w) => worldGlyph(w, w.id === opts.selectedId)).join('');
  return `<svg class="gs-startour__chart" viewBox="0 0 ${CHART_W} ${CHART_H}" width="${(CHART_W * zoom).toFixed(0)}" height="${(CHART_H * zoom).toFixed(0)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Star Tour chart">
    <defs>
      <radialGradient id="stSky" cx="50%" cy="42%" r="80%">
        <stop offset="0%" stop-color="#141a33"/><stop offset="55%" stop-color="#0c1024"/><stop offset="100%" stop-color="#05060f"/>
      </radialGradient>
      <radialGradient id="stWorldShade" cx="36%" cy="32%" r="72%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="55%" stop-color="#ffffff" stop-opacity="0"/><stop offset="100%" stop-color="#000000" stop-opacity="0.4"/>
      </radialGradient>
      <linearGradient id="stBand" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#6f7fd6" stop-opacity="0"/>
        <stop offset="50%" stop-color="#9fb0ff" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#6f7fd6" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="stCore" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff2d6" stop-opacity="0.5"/>
        <stop offset="40%" stop-color="#ffd9a0" stop-opacity="0.18"/>
        <stop offset="100%" stop-color="#ffd9a0" stop-opacity="0"/>
      </radialGradient>
      ${neb.defs}
    </defs>
    <rect width="${CHART_W}" height="${CHART_H}" fill="url(#stSky)"/>
    ${neb.body}
    ${galaxyBand()}
    ${grid}
    ${stars}
    ${heroes}
    ${spaceportGlyph()}
    ${worlds}
    ${shipGroup(opts)}
  </svg>`;
}
