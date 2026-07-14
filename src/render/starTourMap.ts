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

/** #rrggbb → [h(0..360), s(0..1), l(0..1)]. */
function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

/** [h(0..360), s(0..1), l(0..1)] → #rrggbb. */
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255);
  return '#' + ((1 << 24) | (to(r) << 16) | (to(g) << 8) | to(b)).toString(16).slice(1);
}

/** Shift a colour's hue/saturation/lightness — the per-DESTINATION recolour so two courses of the same
 *  archetype (both void, both verdant, …) never share a palette. */
function shiftHsl(hex: string, dHue: number, dSat: number, dLight: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h + dHue, s + dSat, l + dLight);
}

/** The star map is a DIFFERENT interface from the journey map: a course is a DESTINATION, not a biome
 *  skin. So the palette is derived per DESTINATION (seeded off its themeId/id), not shared across every
 *  course of the same archetype — Pegasus Rift and Sagittarius Core are both void yet must read as
 *  distinct places. The archetype supplies the base colour + emblem glyph (so it still reads its biome
 *  at a glance); a bounded hue/sat/light shift makes each destination its own. Pure + mulberry32-seeded
 *  → byte-stable. */
function worldLook(w: StarTourWorld): { col: string; hi: string; glyph: string } {
  const base = WORLD_LOOK[w.archetype] ?? WORLD_LOOK.verdant!;
  const rnd = mulberry32(hashSeed('stlook:' + (w.themeId || w.id)));
  const dHue = (rnd() - 0.5) * 76; // ±38° — enough to separate two same-biome worlds, not so far it
  //                                  leaves the archetype's colour family.
  const dSat = (rnd() - 0.5) * 0.22;
  const dLight = (rnd() - 0.5) * 0.14;
  return {
    col: shiftHsl(base.col, dHue, dSat, dLight),
    hi: shiftHsl(base.hi, dHue, dSat, dLight),
    glyph: base.glyph,
  };
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

/** A soft luminous HALO — concentric fading rings so a body EMITS light into the star field and blends
 *  IN, instead of sitting on it as a hard opaque disc (the whole reason the old ringed+haloed tokens
 *  read as stickers on black). Inner ring brightest, fading out. Pure geometry. */
function softGlow(col: string, r: number, opa = 0.15, layers = 3): string {
  let s = '';
  for (let i = layers; i >= 1; i--) {
    const rad = r * (1.15 + i * 0.5);
    const op = (opa * (1 - (i - 1) / (layers + 0.4))).toFixed(3);
    s += `<circle r="${rad.toFixed(1)}" fill="${col}" opacity="${op}"/>`;
  }
  return s;
}

/** The ring STYLE a ringed world wears — keyed to what the world IS (icy halo / watery band / metal
 *  debris belt / dusty ring), so a ringed frost world and a ringed metal world read differently. */
type RingStyle = 'ice' | 'ocean' | 'metal' | 'dust' | 'default';
function ringStyleFor(arch: string): RingStyle {
  if (arch === 'frost') return 'ice';
  if (arch === 'ocean' || arch === 'cetus') return 'ocean';
  if (arch === 'metal') return 'metal';
  if (arch === 'desert') return 'dust';
  return 'default';
}

/** Build a tilted planetary RING system (back arc drawn behind the body, front arc over it). Metal rings
 *  are scattered DEBRIS chunks (an asteroid/scrap belt); the rest are smooth ice/water/dust bands. */
function ringSystem(
  r: number,
  look: { col: string; hi: string },
  style: RingStyle,
  rnd: () => number,
): { back: string; front: string } {
  const rr = (v: number) => v.toFixed(1);
  const tilt = -34 + rnd() * 20;
  const rrx = r * 2.0;
  const rry = r * 0.5;
  let band: string;
  let line: string;
  let bw = r * 0.24;
  if (style === 'ice') { band = '#bcd9f0'; line = '#ffffff'; }
  else if (style === 'ocean') { band = shadeHex(look.hi, 0.05); line = shadeHex(look.hi, 0.4); }
  else if (style === 'metal') { band = '#8a8f96'; line = '#c6cdd6'; }
  else if (style === 'dust') { band = '#c9a86a'; line = '#ecd39a'; bw = r * 0.34; }
  else { band = shadeHex(look.hi, 0.1); line = shadeHex(look.hi, 0.45); }

  if (style === 'metal') {
    // A ring of tumbling scrap: chunks scattered along the tilted ellipse, split near/far by the
    // pre-rotation y so the near half draws OVER the body and the far half behind.
    let back = '';
    let front = '';
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const ex = Math.cos(a) * rrx;
      const ey = Math.sin(a) * rry;
      const sz = r * (0.05 + rnd() * 0.06);
      const chunk = `<rect x="${rr(ex - sz / 2)}" y="${rr(ey - sz / 2)}" width="${rr(sz)}" height="${rr(sz * 0.7)}" fill="${i % 3 ? band : line}" opacity="0.85" transform="rotate(${rr(rnd() * 90)} ${rr(ex)} ${rr(ey)})"/>`;
      if (ey < 0) back += chunk;
      else front += chunk;
    }
    return {
      back: `<g transform="rotate(${rr(tilt)})">${back}</g>`,
      front: `<g transform="rotate(${rr(tilt)})">${front}</g>`,
    };
  }
  const back = `<g transform="rotate(${rr(tilt)})"><ellipse rx="${rr(rrx)}" ry="${rr(rry)}" fill="none" stroke="${band}" stroke-width="${rr(bw)}" opacity="0.32"/><ellipse rx="${rr(rrx)}" ry="${rr(rry)}" fill="none" stroke="${line}" stroke-width="1" opacity="0.5"/></g>`;
  const front = `<g transform="rotate(${rr(tilt)})"><path d="M${rr(-rrx)},0 A ${rr(rrx)} ${rr(rry)} 0 0 0 ${rr(rrx)},0" fill="none" stroke="${band}" stroke-width="${rr(bw)}" opacity="0.6"/><path d="M${rr(-rrx)},0 A ${rr(rrx)} ${rr(rry)} 0 0 0 ${rr(rrx)},0" fill="none" stroke="${line}" stroke-width="1" opacity="0.8"/></g>`;
  return { back, front };
}

/** A lit planetary WORLD — a luminous atmosphere glow, a seeded surface (craters / bands / continents /
 *  lava / facets by archetype family), a soft terminator + lit rim, and an OPTIONAL ring. No hard tier
 *  ring, no dark halo bubble, no emoji sticker — it emits into the field so it reads as a real world on
 *  a star chart. Everything is seeded off the world id → each same-biome world looks distinct. */
function planetBody(
  w: StarTourWorld,
  r: number,
  look: { col: string; hi: string },
  opts: { ring?: RingStyle } = {},
): string {
  const rnd = mulberry32(hashSeed('stworld:' + w.id));
  const fam = SURFACE_FAMILY[w.archetype] ?? 'rocky';
  const { col, hi } = look;
  const rr = (v: number) => v.toFixed(1);
  const clipId = `stwClip-${idSafe(w.id)}`;
  const ring = opts.ring ? ringSystem(r, look, opts.ring, rnd) : null;
  return `
    ${softGlow(hi, r, 0.15)}
    ${ring ? ring.back : ''}
    <clipPath id="${clipId}"><circle r="${rr(r)}"/></clipPath>
    <circle r="${rr(r)}" fill="${col}"/>
    <g clip-path="url(#${clipId})">${planetSurface(fam, r, col, hi, rnd)}</g>
    <circle r="${rr(r)}" fill="url(#stWorldShade)"/>
    <circle r="${rr(r)}" fill="none" stroke="${shadeHex(hi, 0.5)}" stroke-width="0.8" opacity="0.4"/>
    ${ring ? ring.front : ''}`;
}

/** The celestial KIND a destination is drawn as. The star map is exploration — a course is the PLACE it
 *  is named for, not a generic "world" — so a galactic CORE is a spiral galaxy, a RIFT is a tear in
 *  space, a derelict is a broken SHIP, a "Meadows"/"Hollows" is a glowing NEBULA, a "Forge"/"Sting" is a
 *  blazing STAR, a "Prism"/"Wedge" is a CRYSTAL cluster, a "Gale" is a STORM, the "Twins" are a BINARY,
 *  a "Links"/"Tides"/"Foundry" wears a RING, and the rest are lit planets. */
type CelestialKind =
  | 'galaxy'
  | 'rift'
  | 'wreck'
  | 'nebula'
  | 'star'
  | 'crystal'
  | 'storm'
  | 'binary'
  | 'ringworld'
  | 'planet';

/** Per-DESTINATION kind, keyed by themeId — hand-authored so every course reads as its own place. Any
 *  unlisted/future destination falls back to inference (below), so a new evocative row still picks up a
 *  fitting shape with no plumbing. */
const DESTINATION_KIND: Record<string, CelestialKind> = {
  lyra: 'nebula',
  vulpecula: 'nebula',
  cygnus: 'ringworld',
  delphinus: 'ringworld',
  pyxis: 'ringworld',
  antlia: 'ringworld',
  orion: 'star',
  scorpius: 'star',
  'corona-borealis': 'crystal',
  triangulum: 'crystal',
  draco: 'storm',
  gemini: 'binary',
  pegasus: 'rift',
  sagittarius: 'galaxy',
  'ghost-nebula': 'wreck',
  vela: 'planet',
  eridanus: 'planet',
  hydra: 'planet',
  cetus: 'planet',
  centaurus: 'planet',
  leo: 'planet',
};
function celestialKind(w: StarTourWorld): CelestialKind {
  const byTheme = DESTINATION_KIND[w.themeId];
  if (byTheme) return byTheme;
  const name = w.name.toLowerCase();
  if (w.archetype === 'derelict' || name.includes('wreck') || name.includes('ship')) return 'wreck';
  if (name.includes('core') || name.includes('galaxy') || name.includes('nucleus')) return 'galaxy';
  if (w.archetype === 'void' || name.includes('rift') || name.includes('abyss')) return 'rift';
  if (w.archetype === 'crystal') return 'crystal';
  if (w.archetype === 'tempest') return 'storm';
  if (w.archetype === 'inferno') return 'star';
  return 'planet';
}

/** A spiral GALAXY seen from a shallow angle — a luminous tilted disc, two or three sweeping arms of
 *  scattered stars, and a blazing core with a dark black-hole heart ringed in light (for a galactic-core
 *  destination). Coloured off the per-destination palette so two galaxies never match. Pure + seeded. */
function galaxyBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('stgalaxy:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  const tilt = -30 + rnd() * 24;
  const armN = 2 + (rnd() < 0.5 ? 1 : 0);
  const start = rnd() * Math.PI * 2;
  let arms = '';
  for (let a = 0; a < armN; a++) {
    const phase = start + (a / armN) * Math.PI * 2;
    const turns = 1.05 + rnd() * 0.5;
    const stars = 12 + ((rnd() * 6) | 0);
    for (let i = 0; i < stars; i++) {
      const t = i / stars;
      const ang = phase + t * turns * Math.PI * 2;
      const rad = r * (0.16 + t * 1.15);
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad * 0.42; // squashed disc → a shallow viewing angle
      const sr = (0.4 + rnd() * 1.1) * (1 - t * 0.5);
      const tint = i % 4 === 0 ? '#ffffff' : hi;
      arms += `<circle cx="${rr(x)}" cy="${rr(y)}" r="${rr(sr)}" fill="${tint}" opacity="${(0.85 - t * 0.55).toFixed(2)}"/>`;
    }
  }
  return `<g transform="rotate(${rr(tilt)})">
    <ellipse rx="${rr(r * 1.5)}" ry="${rr(r * 0.64)}" fill="${col}" opacity="0.14"/>
    <ellipse rx="${rr(r * 1.15)}" ry="${rr(r * 0.48)}" fill="${col}" opacity="0.16"/>
    <ellipse rx="${rr(r * 0.85)}" ry="${rr(r * 0.36)}" fill="${hi}" opacity="0.16"/>
    ${arms}
    <ellipse rx="${rr(r * 0.4)}" ry="${rr(r * 0.26)}" fill="${shadeHex(hi, 0.35)}" opacity="0.85"/>
    <ellipse rx="${rr(r * 0.22)}" ry="${rr(r * 0.14)}" fill="#fff4d6" opacity="0.95"/>
    <circle r="${rr(r * 0.1)}" fill="#07040e"/>
    <circle r="${rr(r * 0.13)}" fill="none" stroke="#ffe8b0" stroke-width="${rr(r * 0.05)}" opacity="0.9"/>
  </g>`;
}

/** A RIFT in spacetime — an elongated dark SLIT torn open by a jagged luminous crack, wrapped in a soft
 *  energy glow and flinging sparks of debris (for a void/rift destination). No round dark disc — the
 *  darkness hugs the crack so it reads as a tear, not a token. The crack + glow take the per-destination
 *  colour. Seeded → byte-stable. */
function riftBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('strift:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  const tilt = -70 + rnd() * 140;
  const glow = shadeHex(hi, 0.25);
  const segs = 5;
  let d = `M0,${rr(-r * 1.15)}`;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const y = -r * 1.15 + t * r * 2.3;
    const x = (rnd() - 0.5) * r * 0.55;
    d += ` L${rr(x)},${rr(y)}`;
  }
  let sparks = '';
  const sparkN = 5 + ((rnd() * 3) | 0);
  for (let i = 0; i < sparkN; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const sx = side * r * (0.4 + rnd() * 1.2);
    const sy = (rnd() - 0.5) * r * 2.0;
    const sr = 0.6 + rnd() * 1.1;
    sparks += `<circle cx="${rr(sx)}" cy="${rr(sy)}" r="${rr(sr)}" fill="${i % 2 ? '#ffffff' : hi}" opacity="0.75"/>`;
  }
  return `<g transform="rotate(${rr(tilt)})">
    <ellipse rx="${rr(r * 0.6)}" ry="${rr(r * 1.35)}" fill="${col}" opacity="0.16"/>
    <ellipse rx="${rr(r * 0.34)}" ry="${rr(r * 1.15)}" fill="${col}" opacity="0.18"/>
    <ellipse rx="${rr(r * 0.24)}" ry="${rr(r * 1.05)}" fill="#05040a" opacity="0.62"/>
    ${sparks}
    <path d="${d}" fill="none" stroke="${glow}" stroke-width="${rr(r * 0.46)}" stroke-linecap="round" opacity="0.4"/>
    <path d="${d}" fill="none" stroke="${hi}" stroke-width="${rr(r * 0.2)}" stroke-linecap="round" opacity="0.85"/>
    <path d="${d}" fill="none" stroke="#ffffff" stroke-width="${rr(r * 0.07)}" stroke-linecap="round" opacity="0.95"/>
  </g>`;
}

/** A glowing emission NEBULA — soft transparent gas blobs with an embedded star CLUSTER twinkling
 *  through it (for a "Meadows"/"Hollows"-type place: a luminous cloud, not a planet). Blends straight
 *  into the star field because it IS gas + stars. Coloured off the per-destination palette. Seeded. */
function nebulaBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('stneb:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  let cloud = '';
  const blobs = 6 + ((rnd() * 4) | 0);
  for (let i = 0; i < blobs; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * r * 1.0;
    const bx = Math.cos(a) * d;
    const by = Math.sin(a) * d * 0.85;
    const br = r * (0.55 + rnd() * 0.8);
    const c = i % 3 === 0 ? shadeHex(hi, 0.25) : i % 2 ? hi : col;
    cloud += `<circle cx="${rr(bx)}" cy="${rr(by)}" r="${rr(br)}" fill="${c}" opacity="0.1"/>`;
  }
  cloud += `<circle r="${rr(r * 0.45)}" fill="${shadeHex(hi, 0.3)}" opacity="0.13"/>`;
  let stars = '';
  const n = 14 + ((rnd() * 10) | 0);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * r * 1.15;
    const sx = Math.cos(a) * d;
    const sy = Math.sin(a) * d * 0.9;
    const sr = 0.4 + rnd() * 1.3;
    const op = (0.5 + rnd() * 0.5).toFixed(2);
    const twinkle =
      rnd() < 0.28
        ? `<animate attributeName="opacity" values="${op};0.2;${op}" dur="${(2.5 + rnd() * 3).toFixed(1)}s" repeatCount="indefinite"/>`
        : '';
    stars += `<circle cx="${rr(sx)}" cy="${rr(sy)}" r="${rr(sr)}" fill="${rnd() < 0.25 ? hi : '#ffffff'}" opacity="${op}">${twinkle}</circle>`;
  }
  return cloud + stars;
}

/** A blazing STAR — a soft corona, a bright diffraction cross, seeded prominences/flares, and a hot
 *  white core (for a "Forge"/"Sting"-type place: a sun, not a planet). Coloured off the per-destination
 *  palette so a blue-white forge-star and a deep-red giant diverge. Seeded → byte-stable. */
function starBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('ststar:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  const coreCol = shadeHex(hi, 0.55);
  const spike = r * 2.8;
  let flares = '';
  const n = 5 + ((rnd() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const len = r * (1.0 + rnd() * 0.8);
    const x2 = Math.cos(a) * len;
    const y2 = Math.sin(a) * len;
    const wdt = r * (0.12 + rnd() * 0.14);
    const px = -Math.sin(a) * wdt;
    const py = Math.cos(a) * wdt;
    flares += `<path d="M${rr(px)},${rr(py)} L${rr(x2)},${rr(y2)} L${rr(-px)},${rr(-py)} Z" fill="${hi}" opacity="0.25"/>`;
  }
  return `
    ${softGlow(col, r, 0.2, 4)}
    ${softGlow(hi, r * 0.8, 0.18, 3)}
    <path d="M0,${rr(-spike)} L0,${rr(spike)} M${rr(-spike)},0 L${rr(spike)},0" stroke="${hi}" stroke-width="1" opacity="0.35"/>
    <path d="M${rr(-spike * 0.66)},${rr(-spike * 0.66)} L${rr(spike * 0.66)},${rr(spike * 0.66)} M${rr(-spike * 0.66)},${rr(spike * 0.66)} L${rr(spike * 0.66)},${rr(-spike * 0.66)}" stroke="${hi}" stroke-width="0.6" opacity="0.2"/>
    ${flares}
    <circle r="${rr(r * 0.92)}" fill="${col}" opacity="0.6"/>
    <circle r="${rr(r * 0.7)}" fill="${hi}"/>
    <circle r="${rr(r * 0.42)}" fill="${coreCol}"/>`;
}

/** A CRYSTAL cluster — glowing faceted shards radiating from a bright central gem (for a "Prism"/"Wedge"
 *  crystal place, e.g. the Northern Crown). Two-tone facets catch the light; coloured off the palette.
 *  Seeded → byte-stable. */
function crystalBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('stcrys:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  let shards = '';
  const n = 5 + ((rnd() * 3) | 0);
  const start = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
    const len = r * (0.85 + rnd() * 0.5);
    const halfw = r * (0.16 + rnd() * 0.1);
    const tipx = Math.cos(a) * len;
    const tipy = Math.sin(a) * len;
    const bx = Math.cos(a) * r * 0.15;
    const by = Math.sin(a) * r * 0.15;
    const perpx = -Math.sin(a) * halfw;
    const perpy = Math.cos(a) * halfw;
    const midx = (bx + tipx) / 2;
    const midy = (by + tipy) / 2;
    shards += `<path d="M${rr(bx + perpx)},${rr(by + perpy)} L${rr(tipx)},${rr(tipy)} L${rr(midx)},${rr(midy)} Z" fill="${hi}" opacity="0.85"/>`;
    shards += `<path d="M${rr(bx - perpx)},${rr(by - perpy)} L${rr(tipx)},${rr(tipy)} L${rr(midx)},${rr(midy)} Z" fill="${shadeHex(col, -0.1)}" opacity="0.8"/>`;
    shards += `<path d="M${rr(bx + perpx)},${rr(by + perpy)} L${rr(tipx)},${rr(tipy)}" stroke="${shadeHex(hi, 0.5)}" stroke-width="0.7" opacity="0.8"/>`;
  }
  return `${softGlow(hi, r, 0.16)}${shards}<circle r="${rr(r * 0.32)}" fill="${shadeHex(hi, 0.3)}"/><circle r="${rr(r * 0.18)}" fill="#ffffff" opacity="0.85"/>`;
}

/** A cyclonic STORM world — spiral cloud arms winding into a dark eye (for a "Gale"/tempest place: a
 *  raging vortex). Coloured off the per-destination palette. Seeded → byte-stable. */
function stormBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('ststorm:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  let arms = '';
  const armN = 2 + (rnd() < 0.5 ? 1 : 0);
  const start = rnd() * Math.PI * 2;
  for (let a = 0; a < armN; a++) {
    const phase = start + (a / armN) * Math.PI * 2;
    let d = '';
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = phase + t * 2.4 * Math.PI;
      const rad = r * (0.14 + t * 0.95);
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad;
      d += (i ? ' L' : 'M') + rr(x) + ',' + rr(y);
    }
    arms += `<path d="${d}" fill="none" stroke="${a % 2 ? hi : shadeHex(col, 0.15)}" stroke-width="${rr(r * 0.16)}" stroke-linecap="round" opacity="0.55"/>`;
  }
  return `${softGlow(hi, r, 0.15)}<circle r="${rr(r * 0.95)}" fill="${col}" opacity="0.25"/>${arms}<circle r="${rr(r * 0.2)}" fill="${shadeHex(col, -0.2)}"/><circle r="${rr(r * 0.1)}" fill="${shadeHex(hi, 0.3)}" opacity="0.9"/>`;
}

/** A BINARY — twin worlds bound by a faint orbital tether (for the "Twins": two bodies, not one). The
 *  larger takes the base palette, the smaller a shade off it. Seeded → byte-stable. */
function binaryBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  const clipA = `stbinA-${idSafe(w.id)}`;
  const clipB = `stbinB-${idSafe(w.id)}`;
  const rp = r * 0.62;
  const sep = r * 0.85;
  const sphere = (cx: number, cy: number, rad: number, clip: string, tint: string): string => `
    <clipPath id="${clip}"><circle cx="${rr(cx)}" cy="${rr(cy)}" r="${rr(rad)}"/></clipPath>
    <circle cx="${rr(cx)}" cy="${rr(cy)}" r="${rr(rad)}" fill="${tint}"/>
    <g clip-path="url(#${clip})"><circle cx="${rr(cx)}" cy="${rr(cy)}" r="${rr(rad)}" fill="url(#stWorldShade)"/></g>
    <circle cx="${rr(cx)}" cy="${rr(cy)}" r="${rr(rad)}" fill="none" stroke="${shadeHex(hi, 0.5)}" stroke-width="0.7" opacity="0.4"/>`;
  return `
    ${softGlow(hi, r, 0.14)}
    <line x1="${rr(-sep)}" y1="${rr(sep * 0.4)}" x2="${rr(sep)}" y2="${rr(-sep * 0.4)}" stroke="${shadeHex(hi, 0.4)}" stroke-width="0.7" opacity="0.4" stroke-dasharray="2 3"/>
    ${sphere(-sep, sep * 0.4, rp, clipA, col)}
    ${sphere(sep, -sep * 0.4, rp * 0.82, clipB, shadeHex(col, 0.12))}`;
}

/** A derelict STARSHIP wreck adrift in a ghostly nebula — a torn hull broken into a nose section and a
 *  drifted tail with a dead engine bell, dark windows (one still flickering), a bent antenna, and a
 *  couple of tumbling debris chunks (for The Ghost Wreck and any derelict). The hull is cold metal; the
 *  haze is an eerie soft nebula that blends into the field. Seeded → byte-stable. */
function wreckBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('stwreck:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const ghost = '#7fdcc0';
  const hull = '#8f97a1';
  const hullDk = '#4c545e';
  const hullLt = '#c8d0da';
  // Ghostly nebula haze — a scatter of soft blobs so the wreck sits IN a cloud, not on a dark disc.
  let haze = '';
  const hb = 5;
  for (let i = 0; i < hb; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * r * 0.9;
    const bx = Math.cos(a) * d;
    const by = Math.sin(a) * d * 0.7;
    const br = r * (0.7 + rnd() * 0.7);
    haze += `<circle cx="${rr(bx)}" cy="${rr(by)}" r="${rr(br)}" fill="${i % 2 ? ghost : look.hi}" opacity="0.08"/>`;
  }
  const tilt = -24 + rnd() * 34;
  const fwd = `<path d="M${rr(-r * 0.15)},${rr(-r * 0.3)} L${rr(r * 0.55)},${rr(-r * 0.26)} Q${rr(r * 1.05)},${rr(-r * 0.05)} ${rr(r * 1.05)},0 Q${rr(r * 1.05)},${rr(r * 0.05)} ${rr(r * 0.55)},${rr(r * 0.26)} L${rr(-r * 0.15)},${rr(r * 0.3)} L${rr(-r * 0.02)},${rr(r * 0.12)} L${rr(-r * 0.18)},0 L${rr(-r * 0.02)},${rr(-r * 0.14)} Z" fill="${hull}"/>`;
  let windows = '';
  for (let i = 0; i < 3; i++) {
    const wx = r * (0.05 + i * 0.28);
    const lit = i === 1;
    windows += `<rect x="${rr(wx)}" y="${rr(-r * 0.16)}" width="${rr(r * 0.11)}" height="${rr(r * 0.11)}" rx="${rr(r * 0.03)}" fill="${lit ? '#ffd98a' : '#20262e'}">${lit ? `<animate attributeName="opacity" values="1;0.2;1" dur="2.6s" repeatCount="indefinite"/>` : ''}</rect>`;
  }
  const aft = `<g transform="translate(${rr(-r * 0.55)},${rr(r * 0.16)}) rotate(${rr(14 + rnd() * 12)})">
      <path d="M${rr(r * 0.32)},${rr(-r * 0.24)} L${rr(-r * 0.34)},${rr(-r * 0.2)} L${rr(-r * 0.34)},${rr(r * 0.2)} L${rr(r * 0.32)},${rr(r * 0.24)} L${rr(r * 0.18)},0 Z" fill="${hullDk}"/>
      <rect x="${rr(-r * 0.5)}" y="${rr(-r * 0.16)}" width="${rr(r * 0.18)}" height="${rr(r * 0.32)}" rx="${rr(r * 0.04)}" fill="${hull}"/>
      <ellipse cx="${rr(-r * 0.52)}" cy="0" rx="${rr(r * 0.05)}" ry="${rr(r * 0.18)}" fill="#1a1f26"/>
    </g>`;
  const rig = `<path d="M${rr(r * 0.2)},${rr(-r * 0.26)} L${rr(r * 0.34)},${rr(-r * 0.62)} L${rr(r * 0.42)},${rr(-r * 0.26)} Z" fill="${hullDk}"/>
      <path d="M${rr(r * 0.7)},${rr(-r * 0.2)} L${rr(r * 0.9)},${rr(-r * 0.5)}" stroke="${hullLt}" stroke-width="1" opacity="0.8"/><circle cx="${rr(r * 0.9)}" cy="${rr(-r * 0.5)}" r="1.2" fill="#ff8f5e"/>`;
  let debris = '';
  const debN = 2 + (rnd() < 0.5 ? 1 : 0);
  for (let i = 0; i < debN; i++) {
    const dx = (rnd() - 0.3) * r * 1.8;
    const dy = (rnd() - 0.5) * r * 1.9;
    const dsz = r * (0.06 + rnd() * 0.07);
    debris += `<rect x="${rr(dx)}" y="${rr(dy)}" width="${rr(dsz)}" height="${rr(dsz * 0.7)}" fill="${hullDk}" transform="rotate(${rr(rnd() * 90)} ${rr(dx)} ${rr(dy)})"/>`;
  }
  return `
    ${haze}
    ${debris}
    <g transform="rotate(${rr(tilt)})">
      ${aft}
      ${fwd}
      <path d="M${rr(-r * 0.15)},${rr(-r * 0.3)} L${rr(r * 0.55)},${rr(-r * 0.26)} Q${rr(r * 1.05)},${rr(-r * 0.05)} ${rr(r * 1.05)},0" fill="none" stroke="${hullLt}" stroke-width="1" opacity="0.7"/>
      ${rig}
      ${windows}
    </g>`;
}

/** Draw the destination's celestial body by its KIND. */
function celestialBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  switch (celestialKind(w)) {
    case 'galaxy':
      return galaxyBody(w, r, look);
    case 'rift':
      return riftBody(w, r, look);
    case 'wreck':
      return wreckBody(w, r, look);
    case 'nebula':
      return nebulaBody(w, r, look);
    case 'star':
      return starBody(w, r, look);
    case 'crystal':
      return crystalBody(w, r, look);
    case 'storm':
      return stormBody(w, r, look);
    case 'binary':
      return binaryBody(w, r, look);
    case 'ringworld':
      return planetBody(w, r, look, { ring: ringStyleFor(w.archetype) });
    default:
      return planetBody(w, r, look);
  }
}

/** One tappable destination + label. The body EMITS its own glow so it blends into the star field — no
 *  hard tier ring or dark halo bubble (those made every icon read as a token). Tier is a small luminous
 *  BEACON dot top-left; a record ★ sits top-right; the name floats above. */
function worldGlyph(w: StarTourWorld, selected: boolean): string {
  const { x, y } = worldPos(w);
  const look = worldLook(w);
  const r = selected ? 24 : 19;
  const rr = (v: number) => v.toFixed(1);
  const tierCol = TIER_COL[w.tier];
  const record = w.hasRecord
    ? `<g transform="translate(${rr(r * 0.92)},${rr(-r * 0.92)})"><circle r="8" fill="#0a0d1c"/><text x="0" y="3.4" font-size="11" text-anchor="middle" fill="#ffce54">★</text></g>`
    : '';
  const best =
    w.hasRecord && w.bestToPar !== undefined
      ? `<text x="0" y="${r + 30}" font-size="12" text-anchor="middle" fill="${w.bestToPar < 0 ? '#5fd45a' : w.bestToPar === 0 ? '#cdd3df' : '#ffce54'}" font-weight="700">${toParLabel(w.bestToPar)}</text>`
      : '';
  const tierDot = `<g transform="translate(${rr(-r * 0.92)},${rr(-r * 0.92)})"><circle r="4.4" fill="${tierCol}" opacity="0.28"/><circle r="2.4" fill="${tierCol}"/><circle r="2.4" fill="none" stroke="#0a0d1c" stroke-width="0.7"/></g>`;
  const ring = selected
    ? `<circle r="${r + 9}" fill="none" stroke="#7fe0ff" stroke-width="2.5" opacity="0.9"><animate attributeName="r" values="${r + 7};${r + 12};${r + 7}" dur="2.4s" repeatCount="indefinite"/></circle>`
    : '';
  return `
    <g class="gs-st-world" data-startour-course="${w.id}" role="button" tabindex="0" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" style="cursor:pointer;">
      ${ring}
      ${celestialBody(w, r, look)}
      ${tierDot}
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
