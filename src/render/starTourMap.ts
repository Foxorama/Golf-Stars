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
 *
 * DESTINATION ICONS (GS-star-tour-destinations / GS-star-map-icon-consistency): the star map is a
 * DIFFERENT interface from the journey map — a course is the PLACE it is named for, not a biome skin.
 * So every destination is its OWN bespoke celestial object, keyed by themeId through `SIGNATURE`, that
 * marries the constellation's identity to the biome: Lyra IS the green Ring Nebula, Vulpecula the
 * Dumbbell, Hydra a toxic multi-headed serpent, Corona Borealis a jewelled crown-arc, Sagittarius the
 * grand galactic core. Two courses of the same archetype (both void, both desert, …) never share a
 * shape OR a palette — a per-destination hue/sat/light shift + a per-world MOTIF (a lion's mane, a
 * river of stars, a breaching whale, a scrap belt, molten foundry seams) individuates the shared
 * planet body. Every body EMITS its own soft glow so it blends INTO the star field instead of sitting
 * on it as a token. Diffuse objects (galaxy/nebula/storm/crown/serpent) draw larger; the blazing stars
 * are TAMED so no single icon overpowers the chart. All seeded → byte-stable.
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
  /** The HIDDEN Yggdrasil, the World Tree (GS-star-tour-yggdrasil): drawn only once the player has
   *  unlocked Thor's Hammer, in the open sky above the constellation cluster. A tappable object
   *  (`data-startour-yggdrasil`) that opens the Nine Realms overlay — Asgard is playable, the rest are
   *  bare branches awaiting future realms. Absent/false ⇒ no tree (byte-for-byte the old chart). */
  showYggdrasil?: boolean;
  /** The tree is the flight target / its realm overlay is open (draws the selection ring). */
  yggdrasilSelected?: boolean;
}

/** The ship's docked heading (GS-star-tour): nose UP (−90° in the +x-facing art frame), poised toward
 *  the constellation field above the home spaceport. */
export const SHIP_DOCK_HEADING = -90;

/** Max lean (deg) a HOVER craft (GS-ship-fly-orient) banks into its travel — enough to read as "gliding
 *  that way" without ever tumbling the disc. */
export const HOVER_BANK_MAX = 15;

/** A nose-LESS hover craft's body BANK for a given flight heading (GS-ship-fly-orient): it stays UPRIGHT
 *  and leans by the HORIZONTAL component of travel (cos heading = dx/|v|) — flying right tips the disc
 *  right, flying left tips it left, flying straight up/down keeps it flat (0), and docked (heading −90)
 *  sits it level. The trailing thrust plume shows the actual direction; the bank only sells the glide. */
export function hoverBank(headingDeg: number): number {
  return HOVER_BANK_MAX * Math.cos((headingDeg * Math.PI) / 180);
}

/** The CONTENT box — the region the RA→x / Dec→y world projection maps into. This is the original chart
 *  size; every constellation keeps its exact J2000 layout INSIDE this box. The visible chart is bigger
 *  than this (see the PAD below), so the worlds cluster in the middle and open starry space surrounds
 *  them on every side. */
const CONTENT_W = 2240;
const CONTENT_H = 1456;

/** Starry-space PADDING around the content box (GS-star-map-bigger-canvas). The world cluster is a
 *  DESTINATION field; space is mostly empty, so we wrap the constellations in a generous margin of pure
 *  starfield you can fly out into. The pad is asymmetric-friendly but here symmetric: the content sits
 *  dead-centre. A portrait-leaning aspect (taller than the old 1.54:1 landscape) means a phone screen
 *  zoomed all the way out shows far more starry sky and far less black letterbox. */
const PAD_X = 620;
const PAD_Y = 1120;

/** The chart's intrinsic size (bigger than any viewport → it pans). = content + padding on every side.
 *  The RA→x / Dec→y projection keeps the same proportions inside the content box, so the constellations
 *  are byte-for-byte where they were, just translated into the centre of a much larger sky. */
export const CHART_W = CONTENT_W + PAD_X * 2;
export const CHART_H = CONTENT_H + PAD_Y * 2;

/** The clubhouse SPACEPORT (GS-star-tour-2): the player's home base, where the ship starts docked and
 *  the view opens centred. Anchored to the content box (so it keeps its place among the worlds). */
export const SPACEPORT_POS = { x: PAD_X + CONTENT_W * 0.5, y: PAD_Y + CONTENT_H * 0.8 };

/** Home EARTH (GS-star-map-icon-consistency) — a recognisable blue marble beside the home port, so the
 *  chart has a "you are here" anchor. A landmark, not a course (not tappable). */
export const EARTH_POS = { x: PAD_X + CONTENT_W * 0.5 + 232, y: PAD_Y + CONTENT_H * 0.8 + 10 };

/** The hidden YGGDRASIL, the World Tree (GS-star-tour-yggdrasil): sits high in the open starry PAD above
 *  the constellation cluster (the World Tree crowns all realms), reachable by flying up from the port.
 *  Anchored off the content box so it keeps its place as the canvas grows. */
export const YGGDRASIL_POS = { x: PAD_X + CONTENT_W * 0.5, y: PAD_Y * 0.46 };

/** One realm hanging on the World Tree (GS-star-tour-yggdrasil). CONTENT-AS-DATA: the Nine Realms are a
 *  table both the tree glyph (which node lights) and the overlay (which branch is pickable) read — a new
 *  realm is a NEW ROW (flip `playable` + wire its launcher), never an engine edit. Only ASGARD is
 *  playable today (the Warriors Three tournament); the other eight are bare branches awaiting the realms
 *  they'll host. `node` is the glyph offset from the canopy centre where the realm's fruit hangs. */
export interface YggdrasilRealm {
  id: string;
  name: string;
  blurb: string;
  playable: boolean;
  node: { dx: number; dy: number };
}

export const YGGDRASIL_REALMS: readonly YggdrasilRealm[] = [
  { id: 'asgard', name: 'Asgard', blurb: 'The Golden Realm at the crown of the tree. Cross the Bifröst and challenge the Warriors Three to nine holes of stroke play.', playable: true, node: { dx: 0, dy: -78 } },
  { id: 'vanaheim', name: 'Vanaheim', blurb: 'Home of the Vanir. A bare branch — a realm yet to bloom on the World Tree.', playable: false, node: { dx: -46, dy: -50 } },
  { id: 'alfheim', name: 'Alfheim', blurb: 'Realm of the light elves. A bare branch — a realm yet to bloom on the World Tree.', playable: false, node: { dx: 46, dy: -50 } },
  { id: 'midgard', name: 'Midgard', blurb: 'The world of mortals. A bare branch — a realm yet to bloom on the World Tree.', playable: false, node: { dx: -72, dy: -14 } },
  { id: 'jotunheim', name: 'Jötunheim', blurb: 'Land of the giants. A bare branch — a realm yet to bloom on the World Tree.', playable: false, node: { dx: 72, dy: -14 } },
  { id: 'svartalfheim', name: 'Svartálfheim', blurb: 'The dwarven forges of Niðavellir. A bare branch — a realm yet to bloom on the World Tree.', playable: false, node: { dx: -44, dy: 18 } },
  { id: 'muspelheim', name: 'Múspelheim', blurb: 'The primordial fire. A bare branch — a realm yet to bloom on the World Tree.', playable: false, node: { dx: 44, dy: 18 } },
  { id: 'niflheim', name: 'Niflheim', blurb: 'The primordial ice and mist. A bare branch — a realm yet to bloom on the World Tree.', playable: false, node: { dx: -22, dy: 44 } },
  { id: 'helheim', name: 'Helheim', blurb: 'The realm of the dead. A bare branch — a realm yet to bloom on the World Tree.', playable: false, node: { dx: 22, dy: 44 } },
];

/** How big the ship draws on the chart (shipSVG scale ≈ width/40). */
const SHIP_SCALE = 1.25;

/** Per-archetype base look on the star map: planet body colour + a lit accent. The archetype supplies
 *  the colour FAMILY so a world still reads its biome at a glance; a per-destination shift + a specific
 *  TINT_OVERRIDE individuate each place. */
const WORLD_LOOK: Record<string, { col: string; hi: string }> = {
  verdant: { col: '#4a9e58', hi: '#7fe08a' },
  desert: { col: '#c2872e', hi: '#e8c05e' },
  frost: { col: '#7fb2d8', hi: '#d6f0ff' },
  inferno: { col: '#c24a2e', hi: '#ff9a5e' },
  crystal: { col: '#8f6fd8', hi: '#d9c6ff' },
  tempest: { col: '#4a7ab8', hi: '#8fc0f0' },
  fungal: { col: '#5aa84a', hi: '#b6f07a' },
  ocean: { col: '#2f8f9a', hi: '#7fe0e6' },
  swamp: { col: '#6a8a3a', hi: '#c6f07a' },
  metal: { col: '#8a8f96', hi: '#d6dde6' },
  void: { col: '#4a3b78', hi: '#8f6fd8' },
  cetus: { col: '#3a5a8a', hi: '#8fc0f0' },
  derelict: { col: '#7a8288', hi: '#c6cdd6' },
};

/** DELIBERATE per-destination palettes (GS-star-map-icon-consistency) — where the archetype base
 *  would collide (both inferno stars, both desert planets) or a place has a signature colour (Hydra's
 *  toxic acid, Orion's blue forge). Applied INSTEAD of the seeded hue shift so the intended colour
 *  holds; a whisper of seeded light jitter still keeps them from being flat. */
const TINT_OVERRIDE: Record<string, { col: string; hi: string }> = {
  orion: { col: '#4a72c8', hi: '#cfe2ff' }, // a blue-white forge sun (vs Scorpius' red)
  scorpius: { col: '#c93a2e', hi: '#ff9a6e' }, // red Antares, the scorpion's heart
  leo: { col: '#c39a34', hi: '#f2da72' }, // bright golden savannah
  vela: { col: '#b07a2e', hi: '#e0b45e' }, // muted dusty amber (vs Leo's yellow-gold)
  hydra: { col: '#7fa62e', hi: '#ccf24e' }, // toxic acid green
  centaurus: { col: '#3f9e6a', hi: '#8fe0a2' }, // verdant, distinct from Lyra's meadow
  cetus: { col: '#2f6f8a', hi: '#7fdce6' }, // deep star-sea
  eridanus: { col: '#2f7fa8', hi: '#8fd0f0' }, // river blue
  antlia: { col: '#8f8a80', hi: '#d0c9bd' }, // warm corroded scrap (vs Pyxis' cool steel)
  pyxis: { col: '#868f98', hi: '#ccd6df' }, // cool foundry steel
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

/** Project an RA/Dec (J2000) onto the chart: RA 0–360 → x, Dec +90..−90 → y (north up). Maps into the
 *  centred CONTENT box (offset by the starry PAD), so the constellations keep their exact relative
 *  layout while open space surrounds them. */
export function projectSky(ra: number, dec: number): { x: number; y: number } {
  return {
    x: PAD_X + (ra / 360) * CONTENT_W,
    y: PAD_Y + ((90 - dec) / 180) * CONTENT_H,
  };
}

/** The projected chart position of a world (falls back to the chart centre if the theme has no sky
 *  anchor — never happens for a real Star Tour course, but keeps the projection total). */
export function worldPos(w: StarTourWorld): { x: number; y: number } {
  // HOME (GS-earth): the Old Course lives ON Earth, the home landmark beside the port — not out on a
  // constellation. It has no sky anchor (Earth is the observer), so it's pinned to the blue-marble
  // glyph's fixed position instead of the RA/Dec projection.
  if (w.themeId === 'earth') return EARTH_POS;
  const sky = THEME_SKY[w.themeId];
  return sky ? projectSky(sky.ra, sky.dec) : { x: CHART_W / 2, y: CHART_H / 2 };
}

function toParLabel(toPar: number): string {
  return toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `−${-toPar}`;
}

/** The surface CHARACTER a world's planet is painted with. Keyed by archetype so a world still reads
 *  its biome at a glance, but the individual craters/bands/continents are seeded per world so two
 *  courses of the SAME archetype never look alike. */
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

/** The per-destination palette. A deliberate TINT_OVERRIDE wins (only a whisper of seeded light jitter
 *  on top); otherwise the archetype base is shifted by a bounded per-id hue/sat/light so two same-biome
 *  worlds diverge. Pure + mulberry32-seeded → byte-stable. */
function worldLook(w: StarTourWorld): { col: string; hi: string } {
  const rnd = mulberry32(hashSeed('stlook:' + (w.themeId || w.id)));
  const ov = TINT_OVERRIDE[w.themeId];
  if (ov) {
    const dl = (rnd() - 0.5) * 0.06;
    return { col: shiftHsl(ov.col, 0, 0, dl), hi: shiftHsl(ov.hi, 0, 0, dl) };
  }
  const base = WORLD_LOOK[w.archetype] ?? WORLD_LOOK.verdant!;
  const dHue = (rnd() - 0.5) * 76; // ±38° — separates two same-biome worlds, stays in the family.
  const dSat = (rnd() - 0.5) * 0.22;
  const dLight = (rnd() - 0.5) * 0.14;
  return { col: shiftHsl(base.col, dHue, dSat, dLight), hi: shiftHsl(base.hi, dHue, dSat, dLight) };
}

/** The seeded surface features drawn INSIDE a planet's disc, per family. Returns clip-bounded markup
 *  (the caller wraps it in a per-world circular clip). Pure + mulberry32-seeded → byte-stable. */
function planetSurface(fam: SurfaceFamily, r: number, col: string, hi: string, rnd: () => number): string {
  let s = '';
  const rr = (v: number) => v.toFixed(1);
  if (fam === 'lush') {
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
 *  IN, instead of sitting on it as a hard opaque disc. Inner ring brightest, fading out. Pure geometry. */
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
  if (style === 'ice') {
    band = '#bcd9f0';
    line = '#ffffff';
  } else if (style === 'ocean') {
    band = shadeHex(look.hi, 0.05);
    line = shadeHex(look.hi, 0.4);
  } else if (style === 'metal') {
    band = '#8a8f96';
    line = '#c6cdd6';
  } else if (style === 'dust') {
    band = '#c9a86a';
    line = '#ecd39a';
    bw = r * 0.34;
  } else {
    band = shadeHex(look.hi, 0.1);
    line = shadeHex(look.hi, 0.45);
  }

  if (style === 'metal') {
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

/** A small four-point diffraction cross for a bright star at (cx,cy), radius `s`. */
function starTwinkle(cx: number, cy: number, s: number, tint: string): string {
  const rr = (v: number) => v.toFixed(1);
  const sp = s * 3.2;
  return `<g transform="translate(${rr(cx)},${rr(cy)})">
    <circle r="${rr(s * 2.4)}" fill="${tint}" opacity="0.16"/>
    <path d="M0,${rr(-sp)} L0,${rr(sp)} M${rr(-sp)},0 L${rr(sp)},0" stroke="${tint}" stroke-width="0.7" opacity="0.5"/>
    <circle r="${rr(s)}" fill="#ffffff"/>
    <circle r="${rr(s * 1.7)}" fill="${tint}" opacity="0.5"/>
  </g>`;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Per-destination celestial identity: a SIGNATURE table (kind + size + motif + ring/star flavour), a
// bespoke renderer per kind, and a MOTIF system that individuates the shared planet body.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The celestial KIND a destination is drawn as. */
type CelestialKind =
  | 'galaxy'
  | 'rift'
  | 'wreck'
  | 'ringNebula'
  | 'dumbbell'
  | 'star'
  | 'crown'
  | 'crystal'
  | 'maelstrom'
  | 'binary'
  | 'serpent'
  | 'planet';

/** A per-world planet MOTIF — the decoration that individuates one shared planet body from another of
 *  the same archetype. */
type PlanetMotif = 'mane' | 'companion' | 'whale' | 'river' | 'dune' | 'scrap' | 'foundry';

interface Signature {
  kind: CelestialKind;
  /** Body size multiplier (diffuse objects draw bigger; compact ones stay tight). */
  size?: number;
  /** Planet motif (only meaningful when kind === 'planet'). */
  motif?: PlanetMotif;
  /** Planet ring style (only meaningful when kind === 'planet'). */
  ring?: RingStyle;
  /** Star flavour (only meaningful when kind === 'star'): a cool forge sun vs a red stinger. */
  star?: 'forge' | 'sting';
}

/** Per-DESTINATION signature, keyed by themeId — hand-authored so every course reads as its OWN place
 *  and no two same-biome worlds collide. Any unlisted/future destination falls back to inference. */
const SIGNATURE: Record<string, Signature> = {
  lyra: { kind: 'ringNebula', size: 1.15 }, // the Ring Nebula (M57), a green smoke ring
  vulpecula: { kind: 'dumbbell', size: 1.15 }, // the Dumbbell Nebula (M27), bi-lobed
  cygnus: { kind: 'planet', ring: 'ice' }, // the Swan glides icy links → a ringed frost world
  delphinus: { kind: 'planet', ring: 'ocean' }, // the Dolphin's tidal sea → a ringed ocean world
  pyxis: { kind: 'planet', ring: 'metal', motif: 'foundry' }, // the Compass's scrap foundry
  antlia: { kind: 'planet', motif: 'scrap', size: 1.05 }, // the Air-Pump scrapworks
  orion: { kind: 'star', star: 'forge', size: 1.0 }, // the Hunter's blue forge-sun + belt
  scorpius: { kind: 'star', star: 'sting', size: 1.0 }, // red Antares + the scorpion's tail
  'corona-borealis': { kind: 'crown', size: 1.2 }, // the Northern Crown, a jewelled arc
  triangulum: { kind: 'crystal', size: 1.05 }, // a sharp three-point crystal wedge
  draco: { kind: 'maelstrom', size: 1.35 }, // the Dragon coiled in a raging storm
  gemini: { kind: 'binary', size: 1.0 }, // the Twins, side by side on the ice
  pegasus: { kind: 'rift', size: 1.1 }, // the void rift the Winged Horse soars
  sagittarius: { kind: 'galaxy', size: 1.6 }, // the grand galactic CORE at the sky's heart
  vela: { kind: 'planet', motif: 'dune', size: 1.0 }, // the Sails billowing over dust
  leo: { kind: 'planet', motif: 'mane', size: 1.05 }, // the Lion's golden mane
  hydra: { kind: 'serpent', size: 1.28 }, // the Water-Serpent, toxic and many-headed
  eridanus: { kind: 'planet', motif: 'river', size: 1.0 }, // the celestial River
  cetus: { kind: 'planet', motif: 'whale', size: 1.05 }, // the Whale sounding the star-sea
  centaurus: { kind: 'planet', motif: 'companion', size: 1.0 }, // + bright Alpha Centauri
  'ghost-nebula': { kind: 'wreck', size: 1.1 }, // the derelict adrift in the Ghost Nebula
};

/** The signature for a world — the hand-authored row, else inferred from name/archetype so a new
 *  evocative destination still picks up a fitting shape with no plumbing. */
function signatureFor(w: StarTourWorld): Signature {
  const s = SIGNATURE[w.themeId];
  if (s) return s;
  const name = w.name.toLowerCase();
  if (w.archetype === 'derelict' || name.includes('wreck') || name.includes('ship')) return { kind: 'wreck', size: 1.1 };
  if (name.includes('core') || name.includes('galaxy') || name.includes('nucleus')) return { kind: 'galaxy', size: 1.5 };
  if (w.archetype === 'void' || name.includes('rift') || name.includes('abyss')) return { kind: 'rift', size: 1.1 };
  if (w.archetype === 'swamp') return { kind: 'serpent', size: 1.25 };
  if (w.archetype === 'crystal') return { kind: 'crystal', size: 1.05 };
  if (w.archetype === 'tempest') return { kind: 'maelstrom', size: 1.3 };
  if (w.archetype === 'inferno') return { kind: 'star', star: 'sting', size: 1.0 };
  if (w.archetype === 'frost') return { kind: 'planet', ring: 'ice' };
  return { kind: 'planet' };
}

/** A per-world MOTIF drawn around/over the shared planet body — a lion's mane, a companion star, a
 *  breaching whale, a river of stars, dune sails, a scrap belt, molten foundry seams. Returns markup
 *  layered `behind` the body, added to its clipped `surface`, and drawn in `front`. Seeded per world. */
function planetMotif(
  motif: PlanetMotif,
  r: number,
  look: { col: string; hi: string },
  rnd: () => number,
): { behind: string; surface: string; front: string } {
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  if (motif === 'mane') {
    // A radiating golden MANE of tapered light-spikes (the Lion) — behind the disc.
    let rays = '';
    const n = 18;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.1;
      const inner = r * 1.02;
      const outer = r * (1.5 + (i % 2 ? 0.4 : 0.12) + rnd() * 0.15);
      const hw = r * 0.09;
      const bx = Math.cos(a) * inner;
      const by = Math.sin(a) * inner;
      const tx = Math.cos(a) * outer;
      const ty = Math.sin(a) * outer;
      const px = -Math.sin(a) * hw;
      const py = Math.cos(a) * hw;
      rays += `<path d="M${rr(bx + px)},${rr(by + py)} L${rr(tx)},${rr(ty)} L${rr(bx - px)},${rr(by - py)} Z" fill="${hi}" opacity="0.42"/>`;
    }
    return { behind: `${softGlow(hi, r, 0.14)}${rays}`, surface: '', front: '' };
  }
  if (motif === 'companion') {
    // A bright binary COMPANION beside the world (Alpha Centauri, our nearest star), tethered.
    const cx = r * 1.75;
    const cy = -r * 0.62;
    return {
      behind: softGlow(hi, r, 0.13),
      surface: '',
      front: `<line x1="0" y1="0" x2="${rr(cx)}" y2="${rr(cy)}" stroke="${shadeHex(hi, 0.4)}" stroke-width="0.7" opacity="0.32" stroke-dasharray="2 3"/>
        ${starTwinkle(cx, cy, r * 0.2, '#ffe9b0')}
        ${starTwinkle(cx + r * 0.34, cy + r * 0.26, r * 0.12, '#ffd18a')}`,
    };
  }
  if (motif === 'whale') {
    // A WHALE breaching beside the deep star-sea world — a stylised fluke + spout of stars.
    const wx = r * 1.5;
    const wy = r * 0.5;
    const body = shadeHex(col, -0.15);
    return {
      behind: softGlow(hi, r, 0.13),
      surface: '',
      front: `<g transform="translate(${rr(wx)},${rr(wy)}) rotate(24)">
        <path d="M${rr(-r * 0.7)},0 Q${rr(-r * 0.1)},${rr(-r * 0.42)} ${rr(r * 0.55)},${rr(-r * 0.26)} Q${rr(r * 0.2)},0 ${rr(r * 0.55)},${rr(r * 0.26)} Q${rr(-r * 0.1)},${rr(r * 0.42)} ${rr(-r * 0.7)},0 Z" fill="${body}" opacity="0.9"/>
        <path d="M${rr(-r * 0.7)},0 L${rr(-r * 1.05)},${rr(-r * 0.34)} L${rr(-r * 0.86)},0 L${rr(-r * 1.05)},${rr(r * 0.34)} Z" fill="${body}" opacity="0.9"/>
        <circle cx="${rr(r * 0.34)}" cy="${rr(-r * 0.06)}" r="${rr(r * 0.07)}" fill="#eaffff"/>
      </g>
      <circle cx="${rr(wx - r * 0.2)}" cy="${rr(wy - r * 0.7)}" r="0.9" fill="#dff4ff" opacity="0.8"/>
      <circle cx="${rr(wx)}" cy="${rr(wy - r * 0.95)}" r="0.7" fill="#dff4ff" opacity="0.7"/>`,
    };
  }
  if (motif === 'river') {
    // A winding luminous RIVER of stars pouring off the world (Eridanus, the celestial River).
    let d = `M${rr(r * 0.7)},${rr(r * 0.2)}`;
    let dots = '';
    let px = r * 0.7;
    let py = r * 0.2;
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const nx = r * (0.7 + i * 0.42);
      const ny = r * (0.2 + Math.sin(i * 1.3 + rnd()) * 0.55);
      const mx = (px + nx) / 2;
      const my = (py + ny) / 2 + (rnd() - 0.5) * r * 0.3;
      d += ` Q${rr(mx)},${rr(my)} ${rr(nx)},${rr(ny)}`;
      dots += `<circle cx="${rr(nx)}" cy="${rr(ny)}" r="${rr(1.2 - i * 0.1)}" fill="#dff2ff" opacity="${(0.9 - i * 0.12).toFixed(2)}"/>`;
      px = nx;
      py = ny;
    }
    return {
      behind: softGlow(hi, r, 0.13),
      surface: '',
      front: `<path d="${d}" fill="none" stroke="${shadeHex(hi, 0.2)}" stroke-width="${rr(r * 0.12)}" stroke-linecap="round" opacity="0.4"/>
        <path d="${d}" fill="none" stroke="#dff2ff" stroke-width="1" stroke-linecap="round" opacity="0.6"/>${dots}`,
    };
  }
  if (motif === 'dune') {
    // A triangular SAIL nebula-wisp behind (the Sails of Vela) + strong dune bands on the surface.
    let bands = '';
    for (let i = 0; i < 4; i++) {
      const cy = -r * 0.55 + i * r * 0.42;
      bands += `<ellipse cx="0" cy="${rr(cy)}" rx="${rr(r * 1.02)}" ry="${rr(r * 0.11)}" fill="${i % 2 ? shadeHex(hi, 0.05) : shadeHex(col, -0.18)}" opacity="0.5" transform="rotate(-12)"/>`;
    }
    const sail = `<path d="M${rr(-r * 1.7)},${rr(r * 0.7)} Q${rr(-r * 0.5)},${rr(-r * 1.6)} ${rr(r * 0.4)},${rr(-r * 0.4)} Q${rr(-r * 0.6)},${rr(-r * 0.1)} ${rr(-r * 1.7)},${rr(r * 0.7)} Z" fill="${shadeHex(hi, 0.1)}" opacity="0.1"/>`;
    return { behind: `${softGlow(hi, r, 0.13)}${sail}`, surface: bands, front: '' };
  }
  if (motif === 'scrap') {
    // A broken machine world — a partial belt of tumbling JUNK + jutting antenna/panels, corroded.
    let junk = '';
    const n = 12;
    const t0 = rnd() * Math.PI;
    for (let i = 0; i < n; i++) {
      const a = t0 + (i / n) * Math.PI * 1.25;
      const rad = r * (1.35 + (i % 3) * 0.14);
      const jx = Math.cos(a) * rad * 1.7;
      const jy = Math.sin(a) * rad * 0.5;
      const sz = r * (0.06 + rnd() * 0.07);
      junk += `<rect x="${rr(jx - sz / 2)}" y="${rr(jy - sz / 2)}" width="${rr(sz)}" height="${rr(sz * 0.7)}" fill="${i % 2 ? '#7a746a' : '#b45a3a'}" opacity="0.85" transform="rotate(${rr(rnd() * 90)} ${rr(jx)} ${rr(jy)})"/>`;
    }
    const antenna = `<path d="M${rr(-r * 0.2)},${rr(-r * 0.9)} L${rr(-r * 0.24)},${rr(-r * 1.4)}" stroke="#c6c0b4" stroke-width="1" opacity="0.8"/><circle cx="${rr(-r * 0.24)}" cy="${rr(-r * 1.4)}" r="1.3" fill="#ff8f5e"/>
      <path d="M${rr(r * 0.5)},${rr(-r * 0.7)} l${rr(r * 0.3)},${rr(-r * 0.18)}" stroke="#8a857a" stroke-width="2" opacity="0.7"/>`;
    const rust = `<ellipse cx="${rr(r * 0.2)}" cy="${rr(r * 0.1)}" rx="${rr(r * 0.4)}" ry="${rr(r * 0.3)}" fill="#8a4a2e" opacity="0.35"/>`;
    return { behind: `${softGlow(hi, r, 0.12)}${junk}`, surface: rust, front: antenna };
  }
  // foundry — molten glowing SEAMS across the metal world + a compass needle (the Mariner's Compass).
  let seams = '';
  const n = 3;
  for (let i = 0; i < n; i++) {
    const y = -r * 0.5 + i * r * 0.5;
    seams += `<path d="M${rr(-r * 0.92)},${rr(y + (rnd() - 0.5) * r * 0.2)} Q0,${rr(y + (rnd() - 0.5) * r * 0.4)} ${rr(r * 0.92)},${rr(y + (rnd() - 0.5) * r * 0.2)}" fill="none" stroke="#ff8a3a" stroke-width="${rr(r * 0.07)}" stroke-linecap="round" opacity="0.85"/>`;
  }
  seams += `<circle r="${rr(r * 0.16)}" fill="#ffd27a" opacity="0.7"/>`;
  const na = -30 + rnd() * 60;
  const compass = `<g transform="rotate(${rr(na)})">
    <path d="M0,${rr(-r * 0.72)} L${rr(r * 0.14)},0 L0,${rr(r * 0.16)} L${rr(-r * 0.14)},0 Z" fill="#ff5a4a" opacity="0.9"/>
    <path d="M0,${rr(r * 0.72)} L${rr(r * 0.14)},0 L0,${rr(-r * 0.16)} L${rr(-r * 0.14)},0 Z" fill="#e6ecf5" opacity="0.85"/>
    <circle r="${rr(r * 0.1)}" fill="#20262e"/></g>`;
  return { behind: softGlow(hi, r, 0.12), surface: seams, front: compass };
}

/** A lit planetary WORLD — a luminous atmosphere glow, a seeded surface, a soft terminator + lit rim,
 *  an OPTIONAL ring, and an OPTIONAL per-world MOTIF. Everything is seeded off the world id → each
 *  same-biome world looks distinct. */
function planetBody(
  w: StarTourWorld,
  r: number,
  look: { col: string; hi: string },
  opts: { ring?: RingStyle; motif?: PlanetMotif } = {},
): string {
  const rnd = mulberry32(hashSeed('stworld:' + w.id));
  const fam = SURFACE_FAMILY[w.archetype] ?? 'rocky';
  const { col, hi } = look;
  const rr = (v: number) => v.toFixed(1);
  const clipId = `stwClip-${idSafe(w.id)}`;
  const ring = opts.ring ? ringSystem(r, look, opts.ring, rnd) : null;
  const motif = opts.motif ? planetMotif(opts.motif, r, look, rnd) : null;
  return `
    ${motif ? motif.behind : softGlow(hi, r, 0.15)}
    ${ring ? ring.back : ''}
    <clipPath id="${clipId}"><circle r="${rr(r)}"/></clipPath>
    <circle r="${rr(r)}" fill="${col}"/>
    <g clip-path="url(#${clipId})">${planetSurface(fam, r, col, hi, rnd)}${motif ? motif.surface : ''}</g>
    <circle r="${rr(r)}" fill="url(#stWorldShade)"/>
    <circle r="${rr(r)}" fill="none" stroke="${shadeHex(hi, 0.5)}" stroke-width="0.8" opacity="0.4"/>
    ${ring ? ring.front : ''}
    ${motif ? motif.front : ''}`;
}

/** A spiral GALAXY seen from a shallow angle — a luminous tilted disc, sweeping arms of scattered
 *  stars, and a blazing core with a black-hole heart ringed in light. The GRAND destination (Sagittarius
 *  Core), drawn large so it never reads smaller than a planet. Seeded → byte-stable. */
function galaxyBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('stgalaxy:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  const tilt = -30 + rnd() * 24;
  const armN = 3 + (rnd() < 0.5 ? 1 : 0);
  const start = rnd() * Math.PI * 2;
  let arms = '';
  for (let a = 0; a < armN; a++) {
    const phase = start + (a / armN) * Math.PI * 2;
    const turns = 1.1 + rnd() * 0.5;
    const stars = 16 + ((rnd() * 8) | 0);
    for (let i = 0; i < stars; i++) {
      const t = i / stars;
      const ang = phase + t * turns * Math.PI * 2;
      const rad = r * (0.16 + t * 1.35);
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad * 0.42;
      const sr = (0.4 + rnd() * 1.2) * (1 - t * 0.45);
      const tint = i % 4 === 0 ? '#ffffff' : hi;
      arms += `<circle cx="${rr(x)}" cy="${rr(y)}" r="${rr(sr)}" fill="${tint}" opacity="${(0.88 - t * 0.5).toFixed(2)}"/>`;
    }
  }
  return `<g transform="rotate(${rr(tilt)})">
    <ellipse rx="${rr(r * 1.75)}" ry="${rr(r * 0.74)}" fill="${col}" opacity="0.14"/>
    <ellipse rx="${rr(r * 1.3)}" ry="${rr(r * 0.55)}" fill="${col}" opacity="0.16"/>
    <ellipse rx="${rr(r * 0.9)}" ry="${rr(r * 0.4)}" fill="${hi}" opacity="0.18"/>
    ${arms}
    <ellipse rx="${rr(r * 0.46)}" ry="${rr(r * 0.3)}" fill="${shadeHex(hi, 0.35)}" opacity="0.9"/>
    <ellipse rx="${rr(r * 0.26)}" ry="${rr(r * 0.16)}" fill="#fff4d6" opacity="0.98"/>
    <circle r="${rr(r * 0.12)}" fill="#07040e"/>
    <circle r="${rr(r * 0.15)}" fill="none" stroke="#ffe8b0" stroke-width="${rr(r * 0.05)}" opacity="0.95"/>
  </g>`;
}

/** A RIFT in spacetime — an elongated dark SLIT torn open by a jagged luminous crack, wrapped in a soft
 *  energy glow and flinging sparks. The darkness hugs the crack so it reads as a tear, not a token. */
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

/** The RING NEBULA (Lyra / M57) — a bright glowing SMOKE RING (annulus) with a darker heart, a tiny
 *  central white-dwarf, and a soft haze, coloured off the meadow-green palette. A luminous cloud, not a
 *  planet, so it blends straight into the field. Seeded → byte-stable. */
function ringNebulaBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('stringneb:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  const tilt = -28 + rnd() * 30;
  const inner = shadeHex(col, -0.24);
  let speckle = '';
  const n = 10 + ((rnd() * 6) | 0);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = r * (0.62 + rnd() * 0.5);
    const sx = Math.cos(a) * rad;
    const sy = Math.sin(a) * rad * 0.7;
    speckle += `<circle cx="${rr(sx)}" cy="${rr(sy)}" r="${rr(0.5 + rnd() * 0.8)}" fill="${i % 2 ? '#ffffff' : hi}" opacity="0.6"/>`;
  }
  return `${softGlow(hi, r, 0.15)}
    <g transform="rotate(${rr(tilt)})">
      <ellipse rx="${rr(r * 1.15)}" ry="${rr(r * 0.82)}" fill="${col}" opacity="0.2"/>
      <ellipse rx="${rr(r * 1.0)}" ry="${rr(r * 0.7)}" fill="none" stroke="${hi}" stroke-width="${rr(r * 0.42)}" opacity="0.42"/>
      <ellipse rx="${rr(r * 1.0)}" ry="${rr(r * 0.7)}" fill="none" stroke="${shadeHex(hi, 0.35)}" stroke-width="${rr(r * 0.16)}" opacity="0.7"/>
      <ellipse rx="${rr(r * 0.66)}" ry="${rr(r * 0.42)}" fill="${inner}" opacity="0.5"/>
      ${speckle}
      <circle r="${rr(r * 0.12)}" fill="#ffffff" opacity="0.95"/>
      <circle r="${rr(r * 0.22)}" fill="#ffffff" opacity="0.25"/>
    </g>`;
}

/** The DUMBBELL NEBULA (Vulpecula / M27) — a bi-lobed "apple-core" planetary nebula: two bright glowing
 *  lobes with a fainter perpendicular waist and a hot central star, in luminous fungal green. Seeded. */
function dumbbellBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('stdumb:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  const tilt = -20 + rnd() * 40;
  let stars = '';
  const n = 10 + ((rnd() * 6) | 0);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = r * (0.3 + rnd() * 0.9);
    stars += `<circle cx="${rr(Math.cos(a) * rad)}" cy="${rr(Math.sin(a) * rad * 0.9)}" r="${rr(0.4 + rnd() * 0.8)}" fill="${i % 3 ? '#ffffff' : hi}" opacity="0.6"/>`;
  }
  const lobe = (cy: number): string =>
    `<circle cx="0" cy="${rr(cy)}" r="${rr(r * 0.66)}" fill="${col}" opacity="0.28"/>
     <circle cx="0" cy="${rr(cy)}" r="${rr(r * 0.5)}" fill="${hi}" opacity="0.3"/>
     <circle cx="0" cy="${rr(cy)}" r="${rr(r * 0.3)}" fill="${shadeHex(hi, 0.25)}" opacity="0.35"/>`;
  return `${softGlow(hi, r, 0.15)}
    <g transform="rotate(${rr(tilt)})">
      <ellipse rx="${rr(r * 0.5)}" ry="${rr(r * 1.05)}" fill="${col}" opacity="0.14"/>
      ${lobe(-r * 0.55)}
      ${lobe(r * 0.55)}
      <ellipse rx="${rr(r * 0.9)}" ry="${rr(r * 0.28)}" fill="${hi}" opacity="0.12"/>
      ${stars}
      <circle r="${rr(r * 0.1)}" fill="#ffffff" opacity="0.95"/>
    </g>`;
}

/** A blazing STAR — a tamed corona, a soft diffraction cross, seeded flares and a hot core. TWO
 *  flavours: a 'forge' sun (blue-white, flanked by Orion's Belt) and a 'sting' (red Antares, trailing
 *  the scorpion's curved stinger tail). The glow is deliberately restrained so a star never overpowers
 *  the rest of the chart (the old Scorpius bloom did). Seeded → byte-stable. */
function starBody(w: StarTourWorld, r: number, look: { col: string; hi: string }, star: 'forge' | 'sting'): string {
  const rnd = mulberry32(hashSeed('ststar:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  const coreCol = shadeHex(hi, 0.55);
  const spike = r * 2.2;
  let flares = '';
  const n = 5 + ((rnd() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const len = r * (0.9 + rnd() * 0.6);
    const x2 = Math.cos(a) * len;
    const y2 = Math.sin(a) * len;
    const wdt = r * (0.1 + rnd() * 0.12);
    const px = -Math.sin(a) * wdt;
    const py = Math.cos(a) * wdt;
    flares += `<path d="M${rr(px)},${rr(py)} L${rr(x2)},${rr(y2)} L${rr(-px)},${rr(-py)} Z" fill="${hi}" opacity="0.22"/>`;
  }
  // Signature satellites: Orion's Belt (three stars in a diagonal row) or the scorpion's stinger tail.
  let sig = '';
  if (star === 'forge') {
    for (let i = 0; i < 3; i++) {
      const bx = r * (1.5 + i * 0.55);
      const by = r * (0.7 - i * 0.55);
      sig += starTwinkle(bx, by, r * 0.13, '#dfeaff');
    }
  } else {
    let d = `M${rr(r * 0.8)},${rr(r * 0.3)}`;
    let dots = '';
    const pts = 5;
    for (let i = 1; i <= pts; i++) {
      const t = i / pts;
      const ang = -0.3 + t * 2.4;
      const rad = r * (1.0 + t * 1.1);
      const x = r * 0.8 + Math.cos(ang) * rad * 0.6;
      const y = r * 0.3 + Math.sin(ang) * rad;
      d += ` L${rr(x)},${rr(y)}`;
      dots += starTwinkle(x, y, r * (0.14 - t * 0.05), '#ffb488');
    }
    sig = `<path d="${d}" fill="none" stroke="${hi}" stroke-width="1" opacity="0.35" stroke-dasharray="1.5 3"/>${dots}`;
  }
  return `
    ${softGlow(col, r, 0.16, 3)}
    ${softGlow(hi, r * 0.75, 0.14, 2)}
    <path d="M0,${rr(-spike)} L0,${rr(spike)} M${rr(-spike)},0 L${rr(spike)},0" stroke="${hi}" stroke-width="0.9" opacity="0.28"/>
    ${flares}
    ${sig}
    <circle r="${rr(r * 0.92)}" fill="${col}" opacity="0.6"/>
    <circle r="${rr(r * 0.68)}" fill="${hi}"/>
    <circle r="${rr(r * 0.4)}" fill="${coreCol}"/>`;
}

/** A CRYSTAL cluster — glowing faceted shards radiating from a bright central gem (for Triangulum's
 *  three-point wedge). Two-tone facets catch the light; coloured off the palette. Seeded. */
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

/** The CROWN (Corona Borealis, the Northern Crown) — a semicircular ARC of jewelled gems on a luminous
 *  band, brightest at the centre stone, mirroring the real constellation's diadem. Crystal palette.
 *  Seeded → byte-stable. */
function crownBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('stcrown:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  const gemN = 7;
  const arcR = r * 1.15;
  const a0 = Math.PI * 0.86; // sweep the upper arc (a crown opening upward)
  const a1 = Math.PI * 0.14;
  // The luminous band the gems sit on.
  const band = `<path d="M${rr(Math.cos(a0) * arcR)},${rr(-Math.sin(a0) * arcR)} A ${rr(arcR)} ${rr(arcR)} 0 0 1 ${rr(Math.cos(a1) * arcR)},${rr(-Math.sin(a1) * arcR)}" fill="none" stroke="${hi}" stroke-width="${rr(r * 0.14)}" opacity="0.4" stroke-linecap="round"/>`;
  let gems = '';
  for (let i = 0; i < gemN; i++) {
    const t = i / (gemN - 1);
    const a = a0 + (a1 - a0) * t;
    const gx = Math.cos(a) * arcR;
    const gy = -Math.sin(a) * arcR;
    // Centre gem is the crown jewel — biggest + brightest.
    const centreW = 1 - Math.abs(t - 0.5) * 1.3;
    const gr = r * (0.16 + centreW * 0.18 + (rnd() - 0.5) * 0.03);
    const gemCol = i % 2 ? hi : shadeHex(col, 0.1);
    gems += `<g transform="translate(${rr(gx)},${rr(gy)})">
      <circle r="${rr(gr * 1.8)}" fill="${gemCol}" opacity="0.18"/>
      <path d="M0,${rr(-gr)} L${rr(gr * 0.7)},0 L0,${rr(gr)} L${rr(-gr * 0.7)},0 Z" fill="${gemCol}" opacity="0.9" stroke="${shadeHex(hi, 0.45)}" stroke-width="0.6"/>
      <circle r="${rr(gr * 0.34)}" fill="#ffffff" opacity="0.85"/>
    </g>`;
  }
  return `${softGlow(hi, r, 0.14)}${band}${gems}`;
}

/** A cyclonic MAELSTROM (Draco Gale) — a dense raging vortex: many tight spiral arms winding into a
 *  dark eye with a glowing heart, whipping outer wisps and a bright rim, so it reads as a proper storm
 *  and not a thin doodle. Coloured off the tempest palette. Seeded → byte-stable. */
function maelstromBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('stmael:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  const armN = 5;
  const start = rnd() * Math.PI * 2;
  let arms = '';
  for (let a = 0; a < armN; a++) {
    const phase = start + (a / armN) * Math.PI * 2;
    let d = '';
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = phase + t * 2.9 * Math.PI;
      const rad = r * (0.12 + t * 1.08);
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad;
      d += (i ? ' L' : 'M') + rr(x) + ',' + rr(y);
    }
    const w2 = a % 2 ? r * 0.18 : r * 0.11;
    arms += `<path d="${d}" fill="none" stroke="${a % 2 ? hi : shadeHex(col, 0.18)}" stroke-width="${rr(w2)}" stroke-linecap="round" opacity="0.6"/>`;
  }
  // A few detached whipping wisps at the edge.
  let wisps = '';
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2;
    const r0 = r * (0.95 + rnd() * 0.35);
    const x0 = Math.cos(a) * r0;
    const y0 = Math.sin(a) * r0;
    const x1 = x0 - Math.sin(a) * r * 0.4;
    const y1 = y0 + Math.cos(a) * r * 0.4;
    wisps += `<path d="M${rr(x0)},${rr(y0)} Q${rr((x0 + x1) / 2 + (rnd() - 0.5) * r * 0.3)},${rr((y0 + y1) / 2)} ${rr(x1)},${rr(y1)}" fill="none" stroke="${hi}" stroke-width="${rr(r * 0.06)}" stroke-linecap="round" opacity="0.5"/>`;
  }
  return `${softGlow(hi, r, 0.16)}
    <circle r="${rr(r * 1.05)}" fill="${col}" opacity="0.22"/>
    <circle r="${rr(r * 0.8)}" fill="${col}" opacity="0.16"/>
    ${arms}
    ${wisps}
    <circle r="${rr(r * 0.9)}" fill="none" stroke="${shadeHex(hi, 0.3)}" stroke-width="1" opacity="0.35"/>
    <circle r="${rr(r * 0.24)}" fill="${shadeHex(col, -0.28)}"/>
    <circle r="${rr(r * 0.12)}" fill="${shadeHex(hi, 0.35)}" opacity="0.95"/>`;
}

/** A BINARY — twin worlds bound by a faint orbital tether (Gemini, the Twins). The larger takes the
 *  base palette, the smaller a shade off it; both wear an icy sheen. Seeded → byte-stable. */
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
    <g clip-path="url(#${clip})"><circle cx="${rr(cx)}" cy="${rr(cy)}" r="${rr(rad)}" fill="url(#stWorldShade)"/><ellipse cx="${rr(cx - rad * 0.2)}" cy="${rr(cy - rad * 0.3)}" rx="${rr(rad * 0.6)}" ry="${rr(rad * 0.3)}" fill="#ffffff" opacity="0.25"/></g>
    <circle cx="${rr(cx)}" cy="${rr(cy)}" r="${rr(rad)}" fill="none" stroke="${shadeHex(hi, 0.5)}" stroke-width="0.7" opacity="0.4"/>`;
  return `
    ${softGlow(hi, r, 0.14)}
    <line x1="${rr(-sep)}" y1="${rr(sep * 0.4)}" x2="${rr(sep)}" y2="${rr(-sep * 0.4)}" stroke="${shadeHex(hi, 0.4)}" stroke-width="0.7" opacity="0.4" stroke-dasharray="2 3"/>
    ${sphere(-sep, sep * 0.4, rp, clipA, col)}
    ${sphere(sep, -sep * 0.4, rp * 0.82, clipB, shadeHex(col, 0.12))}`;
}

/** The HYDRA — a toxic, many-headed WATER-SERPENT coiled in an acid haze (Hydra, the sky's largest
 *  constellation, over the toxic mire). A glowing acid-green sinuous body with THREE rising heads (a
 *  glowing eye + fang each) and dripping venom motes. The signature bespoke destination. Seeded. */
function serpentBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('stserpent:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const { col, hi } = look;
  const bodyDk = shadeHex(col, -0.2);
  // The coiled body — a fat sinuous S/coil path stroked twice (dark body + bright spine highlight).
  const coil = `M${rr(-r * 1.1)},${rr(r * 0.6)}
    C${rr(-r * 0.6)},${rr(r * 1.0)} ${rr(-r * 0.2)},${rr(r * 0.2)} ${rr(r * 0.1)},${rr(r * 0.3)}
    C${rr(r * 0.5)},${rr(r * 0.42)} ${rr(r * 0.7)},${rr(-r * 0.2)} ${rr(r * 0.35)},${rr(-r * 0.35)}
    C${rr(r * 0.05)},${rr(-r * 0.48)} ${rr(-r * 0.2)},${rr(-r * 0.1)} ${rr(-r * 0.05)},${rr(r * 0.05)}`;
  const body = `<path d="${coil}" fill="none" stroke="${bodyDk}" stroke-width="${rr(r * 0.42)}" stroke-linecap="round" opacity="0.92"/>
    <path d="${coil}" fill="none" stroke="${hi}" stroke-width="${rr(r * 0.14)}" stroke-linecap="round" opacity="0.6"/>`;
  // Three heads on necks rising off the coil (the many-headed Hydra).
  const head = (hx: number, hy: number, ang: number, sc: number): string =>
    `<g transform="translate(${rr(hx)},${rr(hy)}) rotate(${rr(ang)}) scale(${sc.toFixed(2)})">
      <path d="M${rr(-r * 0.5)},${rr(r * 0.16)} Q${rr(-r * 0.2)},0 ${rr(-r * 0.42)},${rr(-r * 0.16)}" fill="none" stroke="${col}" stroke-width="${rr(r * 0.22)}" stroke-linecap="round"/>
      <path d="M${rr(-r * 0.1)},${rr(-r * 0.28)} Q${rr(r * 0.42)},${rr(-r * 0.36)} ${rr(r * 0.5)},0 Q${rr(r * 0.42)},${rr(r * 0.34)} ${rr(-r * 0.1)},${rr(r * 0.26)} Q${rr(-r * 0.28)},0 ${rr(-r * 0.1)},${rr(-r * 0.28)} Z" fill="${col}" stroke="${shadeHex(hi, 0.2)}" stroke-width="0.6"/>
      <path d="M${rr(r * 0.5)},${rr(-r * 0.04)} l${rr(r * 0.16)},${rr(-r * 0.05)} m${rr(-r * 0.16)},${rr(r * 0.12)} l${rr(r * 0.16)},${rr(r * 0.05)}" stroke="#eaf7c0" stroke-width="1" opacity="0.8"/>
      <circle cx="${rr(r * 0.16)}" cy="${rr(-r * 0.05)}" r="${rr(r * 0.09)}" fill="#eaffb0"/>
      <circle cx="${rr(r * 0.16)}" cy="${rr(-r * 0.05)}" r="${rr(r * 0.045)}" fill="#1a2a06"/>
    </g>`;
  let drips = '';
  const dn = 4 + ((rnd() * 3) | 0);
  for (let i = 0; i < dn; i++) {
    const dx = (rnd() - 0.5) * r * 2.0;
    const dy = r * (0.4 + rnd() * 0.9);
    drips += `<circle cx="${rr(dx)}" cy="${rr(dy)}" r="${rr(0.8 + rnd() * 1.0)}" fill="${hi}" opacity="0.6"/>`;
  }
  return `${softGlow(hi, r, 0.16)}
    <circle r="${rr(r * 1.05)}" fill="${col}" opacity="0.12"/>
    ${body}
    ${head(-r * 0.05, -r * 0.05, -50, 0.92)}
    ${head(-r * 0.55, r * 0.1, -20, 0.72)}
    ${head(r * 0.45, -r * 0.3, -80, 0.66)}
    ${drips}`;
}

/** A derelict STARSHIP wreck adrift in a ghostly nebula (The Ghost Wreck) — a torn hull broken into a
 *  nose section and a drifted tail with a dead engine bell, dark windows (one flickering), a bent
 *  antenna and tumbling debris. The hull is cold metal; the haze is an eerie nebula. Seeded. */
function wreckBody(w: StarTourWorld, r: number, look: { col: string; hi: string }): string {
  const rnd = mulberry32(hashSeed('stwreck:' + w.id));
  const rr = (v: number) => v.toFixed(1);
  const ghost = '#7fdcc0';
  const hull = '#8f97a1';
  const hullDk = '#4c545e';
  const hullLt = '#c8d0da';
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

/** Draw the destination's celestial body by its signature. */
function celestialBody(w: StarTourWorld, r: number, look: { col: string; hi: string }, sig: Signature): string {
  switch (sig.kind) {
    case 'galaxy':
      return galaxyBody(w, r, look);
    case 'rift':
      return riftBody(w, r, look);
    case 'wreck':
      return wreckBody(w, r, look);
    case 'ringNebula':
      return ringNebulaBody(w, r, look);
    case 'dumbbell':
      return dumbbellBody(w, r, look);
    case 'star':
      return starBody(w, r, look, sig.star ?? 'sting');
    case 'crown':
      return crownBody(w, r, look);
    case 'crystal':
      return crystalBody(w, r, look);
    case 'maelstrom':
      return maelstromBody(w, r, look);
    case 'binary':
      return binaryBody(w, r, look);
    case 'serpent':
      return serpentBody(w, r, look);
    default:
      return planetBody(w, r, look, { ring: sig.ring, motif: sig.motif });
  }
}

/** One tappable destination + label. The body EMITS its own glow so it blends into the star field — no
 *  hard tier ring or dark halo bubble. Tier is a small luminous BEACON dot top-left; a record ★ sits
 *  top-right; the name floats above. Diffuse bodies (galaxy/nebula/…) draw larger via the signature. */
function worldGlyph(w: StarTourWorld, selected: boolean): string {
  const { x, y } = worldPos(w);
  const look = worldLook(w);
  const sig = signatureFor(w);
  const r = (selected ? 24 : 19) * (sig.size ?? 1);
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
      ${celestialBody(w, r, look, sig)}
      ${tierDot}
      ${record}
      <text x="0" y="${-r - 8}" font-size="13" text-anchor="middle" fill="#e6ecf5" font-weight="700" style="paint-order:stroke;stroke:#0a0d1c;stroke-width:3px;">${w.name}</text>
      ${best}
    </g>`;
}

/** Home EARTH — a recognisable blue marble beside the port (GS-star-map-icon-consistency): ocean-blue
 *  disc, green continents, white cloud swirls, a cyan atmosphere rim + day/night terminator, and a
 *  small grey Moon. Seeded for the continents but always reads as Earth.
 *
 *  GS-earth: Earth is now ALSO the destination for the Old Course at St Andrews — the home planet's
 *  course. When a `world` is passed (the `earth`-themed catalogue row) the blue marble becomes a
 *  TAPPABLE course target (`data-startour-course`), with the selection ring + record star + best-to-par
 *  the constellation worlds carry; flying home to it opens the Old Course dossier. With no world it stays
 *  the decorative "HOME" landmark (backward-safe). */
function earthGlyph(world?: StarTourWorld, selected = false): string {
  const { x, y } = EARTH_POS;
  const rnd = mulberry32(hashSeed('startour:earth'));
  const rr = (v: number) => v.toFixed(1);
  const r = 21;
  const clip = 'stEarthClip';
  let land = '';
  const conts = 4;
  for (let i = 0; i < conts; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * r * 0.55;
    const cx = Math.cos(a) * d;
    const cy = Math.sin(a) * d;
    const rx = r * (0.24 + rnd() * 0.26);
    const ry = r * (0.18 + rnd() * 0.22);
    const rot = (rnd() * 180) | 0;
    land += `<ellipse cx="${rr(cx)}" cy="${rr(cy)}" rx="${rr(rx)}" ry="${rr(ry)}" fill="#4faa5a" opacity="0.9" transform="rotate(${rot} ${rr(cx)} ${rr(cy)})"/>`;
    land += `<ellipse cx="${rr(cx + rx * 0.2)}" cy="${rr(cy + ry * 0.2)}" rx="${rr(rx * 0.5)}" ry="${rr(ry * 0.5)}" fill="#6fc46a" opacity="0.7"/>`;
  }
  let clouds = '';
  for (let i = 0; i < 4; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * r * 0.7;
    const cx = Math.cos(a) * d;
    const cy = Math.sin(a) * d;
    clouds += `<ellipse cx="${rr(cx)}" cy="${rr(cy)}" rx="${rr(r * (0.2 + rnd() * 0.24))}" ry="${rr(r * 0.1)}" fill="#ffffff" opacity="0.5" transform="rotate(${(rnd() * 60 - 30) | 0} ${rr(cx)} ${rr(cy)})"/>`;
  }
  // As a course target: the selection ring, the ★ record badge, and the best-to-par label (mirrors
  // `worldGlyph`), plus the tappable wrapper attributes. As the bare landmark: aria-hidden, no controls.
  const ring = selected
    ? `<circle r="${rr(r + 10)}" fill="none" stroke="#7fe0ff" stroke-width="2.5" opacity="0.9"><animate attributeName="r" values="${rr(r + 8)};${rr(r + 13)};${rr(r + 8)}" dur="2.4s" repeatCount="indefinite"/></circle>`
    : '';
  const record =
    world?.hasRecord
      ? `<g transform="translate(${rr(r * 0.92)},${rr(-r * 0.92)})"><circle r="8" fill="#0a0d1c"/><text x="0" y="3.4" font-size="11" text-anchor="middle" fill="#ffce54">★</text></g>`
      : '';
  const best =
    world?.hasRecord && world.bestToPar !== undefined
      ? `<text x="0" y="${rr(r + 30)}" font-size="12" text-anchor="middle" fill="${world.bestToPar < 0 ? '#5fd45a' : world.bestToPar === 0 ? '#cdd3df' : '#ffce54'}" font-weight="700">${toParLabel(world.bestToPar)}</text>`
      : '';
  const wrapOpen = world
    ? `<g class="gs-st-world gs-st-earth" data-startour-course="${world.id}" role="button" tabindex="0" aria-label="Earth — The Old Course, St Andrews" transform="translate(${x},${y})" style="cursor:pointer;">`
    : `<g transform="translate(${x},${y})" aria-hidden="true">`;
  const sublabel = world ? 'THE OLD COURSE' : 'HOME';
  return `
    ${wrapOpen}
      ${ring}
      <circle r="${rr(r * 1.5)}" fill="#6fd6ff" opacity="0.1"/>
      <circle r="${rr(r * 1.18)}" fill="#6fd6ff" opacity="0.12"/>
      <clipPath id="${clip}"><circle r="${rr(r)}"/></clipPath>
      <circle r="${rr(r)}" fill="#2f6fc2"/>
      <g clip-path="url(#${clip})">
        <circle r="${rr(r)}" fill="#245aa8" opacity="0.5"/>
        ${land}
        ${clouds}
        <circle r="${rr(r)}" fill="url(#stWorldShade)"/>
      </g>
      <circle r="${rr(r)}" fill="none" stroke="#bfe6ff" stroke-width="0.9" opacity="0.55"/>
      <circle cx="${rr(r * 2.0)}" cy="${rr(-r * 1.1)}" r="${rr(r * 0.3)}" fill="#c6ccd4"/>
      <circle cx="${rr(r * 2.0)}" cy="${rr(-r * 1.1)}" r="${rr(r * 0.3)}" fill="url(#stWorldShade)"/>
      ${record}
      <text x="0" y="${-r - 9}" font-size="13" text-anchor="middle" fill="#bfe6ff" font-weight="700" style="paint-order:stroke;stroke:#0a0d1c;stroke-width:3px;">Earth</text>
      <text x="0" y="${r + 16}" font-size="10" text-anchor="middle" fill="#9fb8d6" font-weight="600" style="paint-order:stroke;stroke:#0a0d1c;stroke-width:2.5px;letter-spacing:.12em;">${sublabel}</text>
      ${best}
    </g>`;
}

/** The clubhouse SPACEPORT station (GS-star-tour-port) — the ship's home dock AND the way OUT of the star
 *  map: it's a TAPPABLE target (`data-startour-port`), and flying home to it docks the ship and opens the
 *  Clubhouse. Drawn as a proper orbital station — a ringed platform, a central hub with lit windows,
 *  extended docking gantries with landing pads + guide lights, and a beacon mast — so it reads as a real
 *  port you return to, not just a label. A "⇩ DOCK · CLUBHOUSE" hint spells out that tapping leaves. */
function spaceportGlyph(): string {
  const { x, y } = SPACEPORT_POS;
  const pad = (px: number, py: number) =>
    `<g transform="translate(${px},${py})">
       <rect x="-7" y="-5" width="14" height="10" rx="2.5" fill="#22424a" stroke="#4a8f96" stroke-width="1"/>
       <rect x="-7" y="-5" width="14" height="3" rx="2" fill="#3a7078"/>
       <circle cx="-4" cy="2.5" r="1.1" fill="#7ff0e0"/><circle cx="0" cy="2.5" r="1.1" fill="#7ff0e0"/><circle cx="4" cy="2.5" r="1.1" fill="#7ff0e0"/>
     </g>`;
  return `
    <g class="gs-st-port" data-startour-port="1" role="button" aria-label="Dock at the spaceport and enter the Clubhouse" transform="translate(${x},${y})" style="cursor:pointer;">
      <circle r="62" fill="#39d9c4" opacity="0.05"/>
      <circle class="gs-st-port__halo" r="54" fill="none" stroke="#39d9c4" stroke-width="1" opacity="0.25"/>
      <ellipse cx="0" cy="0" rx="52" ry="17" fill="none" stroke="#39d9c4" stroke-width="2.5" opacity="0.4"/>
      <ellipse cx="0" cy="0" rx="52" ry="17" fill="none" stroke="#7ff0e0" stroke-width="1" opacity="0.55"/>
      <!-- docking gantries out to the landing pads -->
      <line x1="-18" y1="0" x2="-46" y2="0" stroke="#4a8f96" stroke-width="2.5"/>
      <line x1="18" y1="0" x2="46" y2="0" stroke="#4a8f96" stroke-width="2.5"/>
      ${pad(-52, 0)}${pad(52, 0)}
      <!-- central hub -->
      <rect x="-19" y="-15" width="38" height="30" rx="6" fill="#28454d" stroke="#4a8f96" stroke-width="1.2"/>
      <rect x="-19" y="-15" width="38" height="9" rx="6" fill="#35636d"/>
      <rect x="-13" y="-3" width="4.5" height="4.5" rx="0.6" fill="#ffd27a"/>
      <rect x="-5.5" y="-3" width="4.5" height="4.5" rx="0.6" fill="#ffd27a"/>
      <rect x="2" y="-3" width="4.5" height="4.5" rx="0.6" fill="#ffd27a"/>
      <rect x="9.5" y="-3" width="4.5" height="4.5" rx="0.6" fill="#ffe0a0"/>
      <rect x="-13" y="5" width="4.5" height="4.5" rx="0.6" fill="#ffd27a"/>
      <rect x="-5.5" y="5" width="4.5" height="4.5" rx="0.6" fill="#ffd27a"/>
      <!-- beacon mast -->
      <rect x="-1.2" y="-28" width="2.4" height="13" fill="#5c7a80"/>
      <circle cx="0" cy="-29" r="2.8" fill="#ff8f5e"><animate attributeName="opacity" values="0.5;1;0.5" dur="1.6s" repeatCount="indefinite"/></circle>
      <text x="0" y="42" font-size="12" text-anchor="middle" fill="#7ff0e0" font-weight="700" style="paint-order:stroke;stroke:#0a0d1c;stroke-width:3px;letter-spacing:.1em;">SPACEPORT</text>
      <text x="0" y="56" font-size="9.5" text-anchor="middle" fill="#cfe" font-weight="600" opacity="0.85" style="paint-order:stroke;stroke:#0a0d1c;stroke-width:3px;letter-spacing:.08em;">⇩ DOCK · CLUBHOUSE</text>
    </g>`;
}

/** The hidden YGGDRASIL — the World Tree (GS-star-tour-yggdrasil). Revealed on the chart only once the
 *  player has won Thor's Hammer. A luminous cosmic tree — glowing roots, a broad trunk, a canopy of
 *  branches — hung with the NINE REALMS as glowing fruit. ASGARD crowns the tree, lit gold with a ⚔
 *  and a soft pulse (the one playable branch); the other eight are BARE sockets (a dim dashed ring)
 *  awaiting the realms they'll host. The whole tree is ONE tappable target that opens the realm overlay.
 *  Pure geometry, zero rng → byte-stable; only rendered when armed, so a Hammerless chart is unchanged. */
function yggdrasilGlyph(selected: boolean): string {
  const { x, y } = YGGDRASIL_POS;
  const rr = (v: number) => v.toFixed(1);
  const GOLD = '#ffd97a';
  const BARK = '#6a5a3a';
  const BARK_LT = '#a2895a';
  const LEAF = '#4a9e6a';
  const LEAF_LT = '#7fe0a2';
  // Canopy foliage — a cluster of soft luminous blobs behind the branch nodes.
  const canopy = [
    [0, -60, 58],
    [-52, -30, 40],
    [52, -30, 40],
    [-30, 24, 38],
    [30, 24, 38],
    [0, 8, 46],
  ]
    .map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${LEAF}" opacity="0.14"/>`)
    .join('');
  // Branches fanning from the trunk to each realm node, plus roots spreading below.
  let branches = '';
  for (const realm of YGGDRASIL_REALMS) {
    const { dx, dy } = realm.node;
    const midx = dx * 0.5;
    const midy = 40 + dy * 0.4;
    branches += `<path d="M0,52 Q${rr(midx)},${rr(midy)} ${rr(dx)},${rr(dy)}" fill="none" stroke="${BARK}" stroke-width="4.5" stroke-linecap="round" opacity="0.85"/>`;
    branches += `<path d="M0,52 Q${rr(midx)},${rr(midy)} ${rr(dx)},${rr(dy)}" fill="none" stroke="${BARK_LT}" stroke-width="1.4" stroke-linecap="round" opacity="0.6"/>`;
  }
  const roots = [-1, 0, 1]
    .map((s) => `<path d="M0,78 Q${rr(s * 26)},96 ${rr(s * 54)},108" fill="none" stroke="${BARK}" stroke-width="${s === 0 ? 5 : 4}" stroke-linecap="round" opacity="0.8"/>`)
    .join('');
  // The realm nodes — Asgard lit gold, the rest bare dashed sockets.
  const nodes = YGGDRASIL_REALMS.map((realm) => {
    const { dx, dy } = realm.node;
    if (realm.playable) {
      return `<g transform="translate(${rr(dx)},${rr(dy)})">
        <circle r="17" fill="${GOLD}" opacity="0.16"><animate attributeName="r" values="15;20;15" dur="2.6s" repeatCount="indefinite"/></circle>
        <circle r="10.5" fill="#fff4d6"/>
        <circle r="10.5" fill="url(#stWorldShade)"/>
        <circle r="10.5" fill="none" stroke="${GOLD}" stroke-width="1.6" opacity="0.95"/>
        <text x="0" y="4.2" font-size="12" text-anchor="middle" fill="#7a5a10">⚔</text>
        <text x="0" y="-16" font-size="10.5" text-anchor="middle" fill="${GOLD}" font-weight="800" style="paint-order:stroke;stroke:#0a0d1c;stroke-width:3px;">${realm.name}</text>
      </g>`;
    }
    return `<g transform="translate(${rr(dx)},${rr(dy)})">
      <circle r="7.5" fill="#141c2a" opacity="0.7"/>
      <circle r="7.5" fill="none" stroke="#5f7048" stroke-width="1.2" stroke-dasharray="2.5 3" opacity="0.7"/>
      <circle r="1.6" fill="${LEAF_LT}" opacity="0.5"/>
    </g>`;
  }).join('');
  const ring = selected
    ? `<circle r="118" fill="none" stroke="#7fe0ff" stroke-width="2.5" opacity="0.9"><animate attributeName="r" values="112;124;112" dur="2.4s" repeatCount="indefinite"/></circle>`
    : '';
  return `
    <g class="gs-st-ygg" data-startour-yggdrasil="1" role="button" tabindex="0" aria-label="Yggdrasil — the World Tree" transform="translate(${x.toFixed(1)},${y.toFixed(1)})" style="cursor:pointer;">
      ${ring}
      ${softGlow(LEAF_LT, 80, 0.05, 3)}
      ${canopy}
      <rect x="-9" y="40" width="18" height="46" rx="5" fill="${BARK}"/>
      <rect x="-9" y="40" width="6" height="46" rx="3" fill="${BARK_LT}" opacity="0.5"/>
      ${roots}
      ${branches}
      ${nodes}
      <text x="0" y="132" font-size="15" text-anchor="middle" fill="${LEAF_LT}" font-weight="800" style="paint-order:stroke;stroke:#0a0d1c;stroke-width:3.5px;letter-spacing:.08em;">YGGDRASIL</text>
      <text x="0" y="148" font-size="10" text-anchor="middle" fill="#9fbf9a" font-weight="600" opacity="0.9" style="paint-order:stroke;stroke:#0a0d1c;stroke-width:3px;letter-spacing:.12em;">THE WORLD TREE</text>
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

/** The player's ship group (GS-star-tour-2, GS-ship-fly-orient) — positioned each frame by the app
 *  rewriting the transforms. The group splits into TWO oriented children so a nose-less hover craft can
 *  glide level while its plume still streams behind:
 *    • `#gs-st-ship`   — position only (`translate`).
 *    • `#gs-st-thrust-orient` — the engine plume, always rotated to the flight heading so it trails BEHIND
 *                        the hull (the art plume points −x, so `rotate(heading)` sends it opposite travel).
 *    • `#gs-st-body`   — the hull. NOSE craft rotate to the heading (+ vertical `flip` when flying left
 *                        so a wheeled hull never reads belly-up). HOVER craft (saucer/UFO) stay UPRIGHT
 *                        and only `hoverBank()` — the disc never tumbles, so its under-beam stops swinging
 *                        out the side.
 *  The ship art faces +x (right), so heading 0 = flying right; the app feeds `atan2(dy,dx)`. */
function shipGroup(opts: StarTourMapOpts): string {
  const x = opts.shipX ?? SPACEPORT_POS.x;
  const y = opts.shipY ?? SPACEPORT_POS.y;
  const h = opts.shipHeading ?? SHIP_DOCK_HEADING;
  const flip = opts.shipFlip ?? 1;
  const look = (shipById(opts.shipId) ?? shipById(DEFAULT_SHIP_ID)!).look;
  const bodyTransform =
    look.fly === 'hover'
      ? `rotate(${hoverBank(h).toFixed(1)})`
      : `rotate(${h.toFixed(1)}) scale(1 ${flip})`;
  return `<g id="gs-st-ship" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" style="pointer-events:none;">
    <circle r="30" fill="#7fe0ff" opacity="0.08"/>
    <g id="gs-st-thrust-orient" transform="rotate(${h.toFixed(1)})"><g transform="scale(${SHIP_SCALE})">${thrustTrail(look)}</g></g>
    <g id="gs-st-body" transform="${bodyTransform}">${shipSVG(opts.shipId, 0, 0, SHIP_SCALE)}</g>
  </g>`;
}

/** The out-of-fuel SPACE TANKER (GS-star-tour-fuel): when the ship drains its tank in deep space a little
 *  fuel truck flies in from the viewport edge, hoses up, and leaves. Drawn nose facing +x (like the ship),
 *  ~44 units across; the app positions/flips it each frame by rewriting `#gs-st-fueltruck`'s transform and
 *  reveals it (display) only during a refuel. Pure geometry — a rounded tank, a cab window, a hazard band,
 *  a fuel-drop emblem, a nozzle at the belly the hose connects to. */
function fuelTruckArt(): string {
  return `
    <g transform="scale(1.15)">
      <ellipse cx="-25" cy="0" rx="9" ry="4.5" fill="#ffd27a" opacity="0.55"/>
      <ellipse cx="-25" cy="0" rx="5" ry="2.4" fill="#fff2c0" opacity="0.8"/>
      <rect x="-20" y="-11" width="30" height="22" rx="10" fill="#e08a2e" stroke="#4a2c0c" stroke-width="1.6"/>
      <ellipse cx="-4" cy="-4" rx="12" ry="4.5" fill="#ffffff" opacity="0.16"/>
      <rect x="-7" y="-11" width="7" height="22" fill="#2a1a08" opacity="0.5"/>
      <path d="M-3.5,-3 Q-3.5,-8 -0.2,-9.5 Q3,-8 3,-3 a3.3 3.3 0 1 1 -6.5 0 Z" fill="#ffe08a" opacity="0.92"/>
      <path d="M10,-9 L19,-4.5 L19,4.5 L10,9 Z" fill="#c96f22" stroke="#4a2c0c" stroke-width="1.3"/>
      <circle cx="14.5" cy="0" r="2.6" fill="#bfe8ff" stroke="#2a3340" stroke-width="0.6"/>
      <rect x="-2.4" y="10" width="4.8" height="6" rx="1.6" fill="#9aa0a8" stroke="#3a3f46" stroke-width="0.6"/>
    </g>`;
}

/** The refuel HOSE + tanker group, mounted hidden in the chart SVG (the app shows/positions them during a
 *  refuel). The hose `d` is rewritten each frame to link the tanker's belly nozzle to the ship. */
function fuelTruckGroup(): string {
  return `
    <path id="gs-st-fuelhose" d="" fill="none" stroke="#c98a3a" stroke-width="3" stroke-linecap="round" opacity="0.9" style="display:none;pointer-events:none;"/>
    <path id="gs-st-fuelhose-hi" d="" fill="none" stroke="#ffe08a" stroke-width="1" stroke-linecap="round" opacity="0.85" style="display:none;pointer-events:none;"/>
    <g id="gs-st-fueltruck" transform="translate(${SPACEPORT_POS.x} ${SPACEPORT_POS.y})" style="display:none;pointer-events:none;">${fuelTruckArt()}</g>`;
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
  // More, larger clouds to dress the enlarged canvas (GS-star-map-bigger-canvas) so the open margins
  // read as deep space with drifting colour, not flat emptiness.
  for (let i = 0; i < 9; i++) {
    const cx = (0.08 + rnd() * 0.84) * CHART_W;
    const cy = (0.06 + rnd() * 0.88) * CHART_H;
    const rx = (200 + rnd() * 300).toFixed(0);
    const ry = (150 + rnd() * 230).toFixed(0);
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
  let stars = '';
  // Scaled to the enlarged canvas (GS-star-map-bigger-canvas) so the starfield density holds across the
  // full sky — the padded margins are open space to fly through, but never an empty black void.
  const counts = [1420, 950, 510, 190];
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
      const twinkle =
        plane >= 2 && rnd() < 0.35
          ? `<animate attributeName="opacity" values="${op};${(Number(op) * 0.4).toFixed(2)};${op}" dur="${(2.4 + rnd() * 3).toFixed(1)}s" repeatCount="indefinite"/>`
          : '';
      stars += `<circle cx="${sx}" cy="${sy}" r="${sr}" fill="${tint}" opacity="${op}">${twinkle}</circle>`;
    }
  }
  let heroes = '';
  for (let i = 0; i < 55; i++) {
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
  let grid = '';
  // Keep a roughly constant cell size (~205 chart-units) as the canvas grows, so the coordinate grid
  // reads the same density it always did rather than stretching into a few huge cells.
  const gvN = Math.round(CHART_W / 205);
  const ghN = Math.round(CHART_H / 205);
  for (let gx = 1; gx < gvN; gx++) {
    const x = ((gx / gvN) * CHART_W).toFixed(1);
    grid += `<line x1="${x}" y1="0" x2="${x}" y2="${CHART_H}" stroke="#2a3350" stroke-width="1" opacity="0.28"/>`;
  }
  for (let gy = 1; gy < ghN; gy++) {
    const y = ((gy / ghN) * CHART_H).toFixed(1);
    grid += `<line x1="0" y1="${y}" x2="${CHART_W}" y2="${y}" stroke="#2a3350" stroke-width="1" opacity="0.28"/>`;
  }
  // The home Old Course rides the bespoke Earth blue-marble glyph (drawn with the port), not a generic
  // constellation planet — so it's split out of the world loop and handed to `earthGlyph` below.
  const earthWorld = opts.worlds.find((w) => w.themeId === 'earth');
  const worlds = opts.worlds
    .filter((w) => w.themeId !== 'earth')
    .map((w) => worldGlyph(w, w.id === opts.selectedId))
    .join('');
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
    ${earthGlyph(earthWorld, earthWorld?.id === opts.selectedId)}
    ${worlds}
    ${opts.showYggdrasil ? yggdrasilGlyph(!!opts.yggdrasilSelected) : ''}
    ${shipGroup(opts)}
    <!-- Weapon projectiles (GS-star-tour-weapons): an empty layer the app fills with fired shots (the
         fuel-tanker pattern) — a shot group is appended here + driven by a per-frame transform, then
         removed when it dies. Over the ship so a muzzle shot reads leaving the nose. -->
    <g id="gs-st-shots" style="pointer-events:none;"></g>
    ${fuelTruckGroup()}
  </svg>`;
}
