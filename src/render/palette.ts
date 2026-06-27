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
  void: '#160a26',
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
