/**
 * Shared surface palette for both renderers (SVG map + Canvas2D play view). Render-layer
 * concern only — the sim never sees colour. Open like the lie table: unknown fantasy
 * surfaces fall back to a tint.
 */

export const FILL: Record<string, string> = {
  rough: '#274d27',
  fairway: '#3f8c3f',
  green: '#5fd45a',
  tee: '#7a9a3a',
  bunker: '#e9d8a6',
  trees: '#1f6b2e', // canopy green (the renderers draw trees as canopies, not flat blobs)
  water: '#3f8fe0',
  waste: '#c2b280',
  lava: '#d2451e',
  lavariver: '#e2541a',
  void: '#160a26',
  voidrough: '#0a0518',
  ice: '#bfe6f0',
  crystal: '#9fd8e6',
};

/** Per-biome rough/background tint, keyed by biome id (sell the world). */
export const BIOME_ROUGH: Record<string, string> = {
  'verdant-station': '#274d27',
  'dust-belt': '#6b5230',
  'ice-ring': '#3a4a55',
  'ember-world': '#3a1410',
  'void-garden': '#120a22',
};

/** Tree look (shared by both renderers so a treeline reads identically): a lit canopy, a
 *  shaded under-canopy, and a trunk. Trees are drawn as canopies, not flat polygons. */
export const TREE = {
  canopy: '#2c8a3c',
  shade: '#1c5c28',
  trunk: '#5a3a22',
};

/** OB stake look (white post, red cap) + the faint boundary line that joins them. */
export const OB = {
  post: '#f4f4f4',
  cap: '#ff3b3b',
  line: 'rgba(244,244,244,0.16)',
};

/**
 * Cell-shade tone ramps (GS graphic-upscale). A manga/comic look is flat colour BANDS with a
 * bold ink outline, not smooth gradients — so each styled surface picks `light`/`base`/`dark`
 * for its bands and `ink` for the outline. `base` deliberately keeps the original FILL value
 * (so the SVG still carries `#3f8c3f`/`#5fd45a` and the render tests stay green); the renderers
 * band the light/dark around it.
 */
export interface Shade {
  light: string;
  base: string;
  dark: string;
  ink: string;
}
export const SHADES: Record<string, Shade> = {
  // Mowing-stripe greens: a lit pass and a shaded pass either side of the base.
  fairway: { light: '#56a850', base: '#3f8c3f', dark: '#347834', ink: '#16361a' },
  green: { light: '#79e86a', base: '#5fd45a', dark: '#49b446', ink: '#1d4d22' },
  tee: { light: '#8cae46', base: '#7a9a3a', dark: '#62802c', ink: '#2c3a14' },
  // Rough tone variance (big soft patches + tufts) so the background isn't a flat slab.
  rough: { light: '#315c31', base: '#274d27', dark: '#1b3a1b', ink: '#0f240f' },
};

/** The darker fringe/apron ring drawn just outside a green so it sits ON the land, not floating. */
export const GREEN_COLLAR = '#3c9a3a';

// --- Per-zone (archetype) turf palettes (GS-19) -------------------------------
//
// The old per-theme look only HUE-ROTATED the green turf, which barely read ("green fairways in no
// way match the themes"). Instead each of the 5 worlds gets an EXPLICIT, designed turf palette so a
// desert fairway is firm tan, a frost world frosted teal, an ember world scorched ash-olive, a void
// stop a cosmic indigo platform. `verdant` keeps the original SHADES values byte-for-byte, so a
// themeless / verdant render is unchanged (the render tests still see #3f8c3f / #5fd45a).

import type { BiomeArchetype } from '../sim/course/themes';

export interface TurfPalette {
  fairway: Shade;
  green: Shade;
  tee: Shade;
  /** Darker apron ring drawn just outside the green. */
  collar: string;
  /** Rough tone ramp (tufts / soft patches) for this world. */
  rough: Shade;
}

export const ARCHETYPE_TURF: Record<BiomeArchetype, TurfPalette> = {
  // Verdant = the original SHADES, verbatim (keeps themeless/verdant renders byte-identical).
  verdant: {
    fairway: { light: '#56a850', base: '#3f8c3f', dark: '#347834', ink: '#16361a' },
    green: { light: '#79e86a', base: '#5fd45a', dark: '#49b446', ink: '#1d4d22' },
    tee: { light: '#8cae46', base: '#7a9a3a', dark: '#62802c', ink: '#2c3a14' },
    collar: '#3c9a3a',
    rough: { light: '#315c31', base: '#274d27', dark: '#1b3a1b', ink: '#0f240f' },
  },
  // Desert — firm, dry Bermuda tan with an oasis-green putting surface.
  desert: {
    fairway: { light: '#ccae64', base: '#b89a52', dark: '#9a7f3e', ink: '#5e4a22' },
    green: { light: '#b6d676', base: '#9bbf5a', dark: '#7e9e44', ink: '#46591f' },
    tee: { light: '#c0a563', base: '#a98f4e', dark: '#8c7338', ink: '#4e3f1d' },
    collar: '#86a046',
    rough: { light: '#7d6034', base: '#6b5230', dark: '#523f24', ink: '#2e2413' },
  },
  // Frost — snow-dusted, frosted teal-green turf and pale mint ice-greens.
  frost: {
    fairway: { light: '#bfe0da', base: '#9cc3bf', dark: '#7ba39e', ink: '#3a5a59' },
    green: { light: '#dcf3ec', base: '#c2e6dd', dark: '#9fcabf', ink: '#4d716b' },
    tee: { light: '#abccc7', base: '#8fb0ac', dark: '#728e8a', ink: '#3a504e' },
    collar: '#7fb0a6',
    rough: { light: '#4a5e6a', base: '#3a4a55', dark: '#2b3842', ink: '#19232b' },
  },
  // Inferno — scorched ash-earth fairways, heat-stressed olive greens.
  inferno: {
    fairway: { light: '#8a6a4e', base: '#6e5340', dark: '#523c2c', ink: '#2a1c12' },
    green: { light: '#97a653', base: '#7c8a3e', dark: '#62702f', ink: '#333a16' },
    tee: { light: '#82643f', base: '#6a5036', dark: '#523c28', ink: '#291c10' },
    collar: '#5e6b2e',
    rough: { light: '#4a1d16', base: '#3a1410', dark: '#280c0a', ink: '#160605' },
  },
  // Void — cosmic indigo "astroturf" islands, luminous violet-blue greens.
  void: {
    fairway: { light: '#4f4691', base: '#3a3270', dark: '#2a2452', ink: '#15102e' },
    green: { light: '#909aec', base: '#6f7ad6', dark: '#5460b4', ink: '#23284f' },
    tee: { light: '#473f88', base: '#34306a', dark: '#28244e', ink: '#14102b' },
    collar: '#5a64c0',
    rough: { light: '#1d1336', base: '#120a22', dark: '#0b0617', ink: '#05030c' },
  },
};

/** Lum-only deepen tint so a rarer stop reads a touch richer (1 = neutral). */
function deepenTint(deepen: number): Tint | undefined {
  if (!deepen || Math.abs(deepen - 1) < 1e-6) return undefined;
  return { hueShift: 0, satMul: 1 + (deepen - 1) * 0.18, lumMul: 1 - (deepen - 1) * 0.06 };
}

/** Resolve a world's turf Shade for a surface kind, optionally rarity-deepened. */
export function turfShade(kind: 'fairway' | 'green' | 'tee' | 'rough', archetype: BiomeArchetype, deepen = 1): Shade {
  const s = ARCHETYPE_TURF[archetype][kind];
  const t = deepenTint(deepen);
  if (!t) return s;
  return { light: tintHex(s.light, t), base: tintHex(s.base, t), dark: tintHex(s.dark, t), ink: tintHex(s.ink, t) };
}

/** A world's green-collar colour (rarity-deepened). */
export function collarFor(archetype: BiomeArchetype, deepen = 1): string {
  return tintHex(ARCHETYPE_TURF[archetype].collar, deepenTint(deepen));
}

/** A world's rough BACKGROUND base colour (the slab behind everything). */
export function roughBaseFor(archetype: BiomeArchetype, deepen = 1): string {
  return tintHex(ARCHETYPE_TURF[archetype].rough.base, deepenTint(deepen));
}

// --- Deep-space backdrop per world (GS — "golf amongst the stars") ------------
//
// A travelling space golf course should read as a landmass floating in the void, not a green
// rectangle. Each world gets a deep-space sky for the region BEYOND its play boundary: an opaque
// near-black base (tinted toward the world), a soft nebula glow, and an atmospheric RIM where the
// land meets space. The void already did this for its islands; this generalises it to all five so
// every stop floats among its own constellation. Render-only — the sim never sees these.

export interface SpaceLook {
  /** Opaque deep base of space (very dark, world-tinted) — covers the whole view first. */
  base: string;
  /** A large soft nebula glow drifting over the base (rgba). */
  nebula: string;
  /** Atmospheric rim glow where the floating landmass meets the void (rgba). */
  edge: string;
}

export const ARCHETYPE_SPACE: Record<BiomeArchetype, SpaceLook> = {
  // Verdant — a temperate night sky, faint blue nebula, soft green-lit shore.
  verdant: { base: '#05101e', nebula: 'rgba(70,130,210,0.10)', edge: 'rgba(120,205,140,0.18)' },
  // Desert — a dusty rust dusk over deep dark, warm tan shore.
  desert: { base: '#130b07', nebula: 'rgba(205,120,55,0.11)', edge: 'rgba(225,165,95,0.18)' },
  // Frost — an icy deep-blue void with a teal aurora smear, frosted shore.
  frost: { base: '#040d17', nebula: 'rgba(80,205,205,0.10)', edge: 'rgba(155,235,228,0.18)' },
  // Inferno — a near-black volcanic void lit by an ember-red nebula, molten-lit shore.
  inferno: { base: '#0f0403', nebula: 'rgba(205,60,30,0.13)', edge: 'rgba(255,125,65,0.20)' },
  // Void — the abyss: deepest base, violet nebula, luminous indigo shore.
  void: { base: '#03020a', nebula: 'rgba(150,90,225,0.13)', edge: 'rgba(125,135,245,0.20)' },
};

/** A world's deep-space look, rarity-deepened (the hex base only; the rgba glows pass through). */
export function spaceLookFor(archetype: BiomeArchetype, deepen = 1): SpaceLook {
  const s = ARCHETYPE_SPACE[archetype];
  return { base: tintHex(s.base, deepenTint(deepen)), nebula: s.nebula, edge: s.edge };
}

/** Linear blend of two `#rrggbb` colours (`t`=0 → a, 1 → b); non-hex passes through as `a`. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const m = (x: number, y: number) => Math.round(x + (y - x) * Math.max(0, Math.min(1, t)));
  const to2 = (v: number) => v.toString(16).padStart(2, '0');
  return `#${to2(m(pa[0], pb[0]))}${to2(m(pa[1], pb[1]))}${to2(m(pa[2], pb[2]))}`;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * The drawn LAND fill: the world's rough base blended toward its deep-space base, so the in-bounds
 * ground reads as a dark, star-salted nightscape (golf amongst the stars) rather than a bright slab
 * that walls off the sky in the zoomed play view. The mown fairway/green keep their bright turf
 * palette, so the corridor pops against the dark ground. `LAND_SPACE_BLEND` = how far toward space.
 */
export const LAND_SPACE_BLEND = 0.62;
export function landFillFor(archetype: BiomeArchetype, deepen = 1): string {
  return mixHex(roughBaseFor(archetype, deepen), spaceLookFor(archetype, deepen).base, LAND_SPACE_BLEND);
}

/** Sand: a lit base, a lip-shadow rim, a depression crescent and pale rake lines. */
export const SAND = {
  base: '#e9d8a6', // keep the FILL.bunker value
  rim: '#cbb77c',
  shadow: '#c4ad6f',
  rake: 'rgba(255,250,230,0.55)',
  ink: '#8a7740',
};

/** Water as banded depth: a shallow shoreline, a mid body, a deep core + white glints. */
export const WATER = {
  shallow: '#6fb3ec',
  base: '#3f8fe0', // keep the FILL.water value
  deep: '#2c6dc0',
  deepest: '#1d4f96',
  glint: 'rgba(255,255,255,0.85)',
  ink: '#163b6b',
};

/** Molten lava (lakes + rivers): a charred crust rim, a glowing body, a hot core + bright cracks. */
export const LAVA = {
  crust: '#3a1008',
  body: '#d2451e',
  hot: '#ff8a2a',
  core: '#ffd24a',
  crack: '#ffb24a',
  ink: '#651a0a',
};

/** Cell-shaded canopy: a core shadow, a mid body, a lit cap, a trunk + ground shadow + ink. */
export const CANOPY = {
  core: '#1c5c28',
  base: '#2c8a3c',
  lit: '#49b452',
  trunk: '#5a3a22',
  ink: '#123a1c',
  shadow: 'rgba(0,0,0,0.16)',
};

/** Per-biome "fun/alive" accent palette: wildflower dots in the rough + a sparkle-mote colour. */
export interface Accent {
  flowers: string[];
  mote: string;
}
export const ACCENTS: Record<string, Accent> = {
  'verdant-station': { flowers: ['#ff7eb6', '#ffe14a', '#ffffff'], mote: '#bfe6ff' },
  'dust-belt': { flowers: ['#e6a23c', '#d98c4c', '#caa86a'], mote: '#ffe0a0' },
  'ice-ring': { flowers: ['#cdeef7', '#9fd8e6', '#ffffff'], mote: '#ffffff' },
  'ember-world': { flowers: ['#ff6a3c', '#ffb24a', '#ff8a2a'], mote: '#ff9a4a' },
  'void-garden': { flowers: ['#b07eff', '#7ed4ff', '#e6a0ff'], mote: '#d0a0ff' },
};
export const ACCENT_DEFAULT: Accent = { flowers: ['#ff7eb6', '#ffe14a', '#ffffff'], mote: '#cfe8ff' };

export function accentFor(biome?: string, tint?: Tint): Accent {
  const a = (biome && ACCENTS[biome]) || ACCENT_DEFAULT;
  if (!tint) return a;
  return { flowers: a.flowers.map((f) => tintHex(f, tint)), mote: tintHex(a.mote, tint) };
}

/** Shade ramp for a surface kind; unknown fantasy surfaces derive a tint ramp off `fillFor`. */
export function shadeFor(kind: string, tint?: Tint): Shade {
  const known = SHADES[kind];
  const s: Shade = known ?? { light: fillFor(kind), base: fillFor(kind), dark: fillFor(kind), ink: 'rgba(0,0,0,0.45)' };
  if (!tint) return s;
  return {
    light: tintHex(s.light, tint),
    base: tintHex(s.base, tint),
    dark: tintHex(s.dark, tint),
    ink: tintHex(s.ink, tint),
  };
}

export function fillFor(kind: string): string {
  return FILL[kind] ?? '#6a4f8a'; // unknown fantasy surface → purple tint
}

export function roughFor(biome?: string, tint?: Tint): string {
  return tintHex((biome && BIOME_ROUGH[biome]) || FILL.rough!, tint);
}

// --- Per-theme tinting (GS-17f): shift turf/ground hue toward the stop's world ----------------
//
// A render-only colour transform so a stop's TURF and GROUND read its theme (an ember world's
// fairways scorch warm, a void's go violet), deepened by rarity. Applied only when a theme is
// active (gated upstream), so a themeless render is byte-identical. `#rrggbb`/`#rgb` only —
// `rgba()`/`none`/non-hex pass through untouched, so shadows and `fill:'none'` outlines survive.

export interface Tint {
  /** Hue rotation in degrees. */
  hueShift: number;
  /** Saturation multiplier (>1 = richer). */
  satMul: number;
  /** Lightness multiplier (<1 = deeper). */
  lumMul: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Apply a hue/sat/lum tint to a `#rrggbb`/`#rgb` colour; pass anything else through unchanged. */
export function tintHex(hex: string, tint?: Tint): string {
  if (!tint) return hex;
  const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex; // rgba(), 'none', etc. — leave alone
  let h = m[1]!;
  if (h.length === 3) h = h.replace(/(.)/g, '$1$1');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const [hh, ss, ll] = rgbToHsl(r, g, b);
  const nh = (((hh + tint.hueShift) % 360) + 360) % 360;
  const [nr, ng, nb] = hslToRgb(nh, clamp01(ss * tint.satMul), clamp01(ll * tint.lumMul));
  const to2 = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  return `#${to2(nr)}${to2(ng)}${to2(nb)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue = 0;
  if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return [hue * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  const ch = (n: number): number => {
    let x = n;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [ch(hk + 1 / 3), ch(hk), ch(hk - 1 / 3)];
}
