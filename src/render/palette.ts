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
  pot: '#d8c48f', // deep pot bunker — a touch darker than open sand
  fescue: '#8a9a52', // wispy native fescue (olive-tan tall grass)
  barranca: '#6b5a48', // dry rocky ravine/chasm
  lava: '#d2451e',
  lavariver: '#e2541a',
  frozenpond: '#5aa6d8',
  creek: '#3f8fe0',
  void: '#160a26',
  voidrough: '#0a0518',
  cetusdeep: '#06283a',
  ice: '#bfe6f0',
  crystal: '#9fd8e6',
};

/** Per-biome rough/background tint, keyed by biome id (sell the world). Kept in sync with the
 *  `ARCHETYPE_TURF` rough bases (GS-rough-frame: ground must read as ground on every world). */
export const BIOME_ROUGH: Record<string, string> = {
  'verdant-station': '#274d27',
  'dust-belt': '#6b5230',
  'ice-ring': '#485a68',
  'ember-world': '#532c20',
  'void-garden': '#241847',
  'crystal-spires': '#41506e',
  'tempest-reach': '#424854',
  'spore-jungle': '#2c1f50',
  'tidal-archipelago': '#1d5668',
  'cetus-deep': '#1a3a50',
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
 * Per-world OB boundary look (GS-biome-feel). The same white-post/red-cap golf stake ringed EVERY
 * world — a picket fence floating in the void garden. Each archetype now marks its boundary in its
 * own vocabulary: weathered desert posts, ember-capped obsidian pylons, prism stakes, storm rods,
 * glowing spore lamps, sea buoys — and the two lost-rough worlds (void/cetus) trade the ground post
 * for a FLOATING warp beacon (`beacon` set → drawn as a glowing diamond adrift in the abyss, since
 * there is no ground out there to plant a stake in). `glow` adds a soft halo behind the cap so a
 * luminous world's boundary reads at night. Render-only; the OB *rule* (play-bounds box) is untouched.
 */
export interface ObLook {
  post: string;
  cap: string;
  line: string;
  /** Soft halo behind the cap (rgba) — luminous worlds. */
  glow?: string;
  /** Floating warp-beacon style (rgba glow): no ground post — a lit diamond adrift in the void. */
  beacon?: string;
}
export const OB_LOOK: Record<BiomeArchetype, ObLook> = {
  verdant: { post: '#f4f4f4', cap: '#ff3b3b', line: 'rgba(244,244,244,0.16)' }, // the classic stakes
  desert: { post: '#d8b98a', cap: '#e05a2a', line: 'rgba(216,185,138,0.18)' }, // sun-bleached timber
  frost: { post: '#dff2fa', cap: '#4ac8e8', line: 'rgba(190,235,250,0.18)', glow: 'rgba(120,220,245,0.30)' }, // ice pylons
  inferno: { post: '#3a2a24', cap: '#ff8a2a', line: 'rgba(255,138,42,0.14)', glow: 'rgba(255,130,50,0.35)' }, // ember-capped obsidian
  void: { post: '#6a54b8', cap: '#b07eff', line: 'rgba(176,126,255,0.16)', beacon: 'rgba(160,120,255,0.45)' }, // floating warp beacons
  crystal: { post: '#e8f6fa', cap: '#7ad8f0', line: 'rgba(190,235,248,0.18)', glow: 'rgba(150,225,250,0.30)' }, // prism stakes
  tempest: { post: '#c8ccd8', cap: '#ffe14a', line: 'rgba(200,204,216,0.16)' }, // lightning rods
  fungal: { post: '#caa8e8', cap: '#7af0c0', line: 'rgba(150,240,190,0.14)', glow: 'rgba(120,240,190,0.32)' }, // glowing spore lamps
  ocean: { post: '#f4f4f4', cap: '#ff6a3c', line: 'rgba(244,244,244,0.16)' }, // channel buoys
  cetus: { post: '#bfe8f0', cap: '#5fd8dc', line: 'rgba(150,235,245,0.16)', beacon: 'rgba(120,230,240,0.42)' }, // luminous sea-marks adrift
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
  // NB (GS-rough-frame follow-up): every world's rough ramp below is kept CLEARLY lighter than its
  // `ARCHETYPE_SPACE` base — the rough slab only ever renders where it's PLAYABLE ground now, so a
  // near-sky-dark rough just reads as more starless space. Ground must look like ground on all ten.
  frost: {
    fairway: { light: '#bfe0da', base: '#9cc3bf', dark: '#7ba39e', ink: '#3a5a59' },
    green: { light: '#dcf3ec', base: '#c2e6dd', dark: '#9fcabf', ink: '#4d716b' },
    tee: { light: '#abccc7', base: '#8fb0ac', dark: '#728e8a', ink: '#3a504e' },
    collar: '#7fb0a6',
    rough: { light: '#5a7080', base: '#485a68', dark: '#364652', ink: '#202c34' },
  },
  // Inferno — scorched ash-earth fairways, heat-stressed olive greens. The rough is CINDER EARTH,
  // not near-black: a rough base that dark read as deep space with embers, i.e. as OB (the
  // "lava biome is still a starfield" report, GS-rough-frame follow-up) — ground must look like ground.
  inferno: {
    fairway: { light: '#8a6a4e', base: '#6e5340', dark: '#523c2c', ink: '#2a1c12' },
    green: { light: '#97a653', base: '#7c8a3e', dark: '#62702f', ink: '#333a16' },
    tee: { light: '#82643f', base: '#6a5036', dark: '#523c28', ink: '#291c10' },
    collar: '#5e6b2e',
    rough: { light: '#66392a', base: '#532c20', dark: '#3d1e14', ink: '#200e08' },
  },
  // Void — cosmic indigo "astroturf" islands, luminous violet-blue greens. The fairway stripes carry
  // a wider light↔dark spread than other worlds: indigo turf sits so close in value to the indigo
  // platform/rough that the mowing bands vanished on long par-4/5 corridors (GS-cetus-void-45).
  void: {
    fairway: { light: '#6a60ba', base: '#443a80', dark: '#241e4a', ink: '#15102e' },
    green: { light: '#909aec', base: '#6f7ad6', dark: '#5460b4', ink: '#23284f' },
    tee: { light: '#473f88', base: '#34306a', dark: '#28244e', ink: '#14102b' },
    collar: '#5a64c0',
    rough: { light: '#322260', base: '#241847', dark: '#180f30', ink: '#0a0618' },
  },
  // Crystal — pale prismatic teal turf and bright cyan-white greens on an indigo-slate SCREE field.
  // The rough is lifted well clear of the world's night-sky base: the old deep-indigo slab read as
  // starfield, not ground ("crystal biome is still a starfield", GS-rough-frame follow-up).
  crystal: {
    fairway: { light: '#a7e0d6', base: '#7fc8bd', dark: '#5fa399', ink: '#2f5650' },
    green: { light: '#c4f3ff', base: '#9fe0f5', dark: '#7cc0dc', ink: '#3a6675' },
    tee: { light: '#9fd0c8', base: '#84b4ac', dark: '#6a948c', ink: '#33504a' },
    collar: '#6fb0a6',
    rough: { light: '#526487', base: '#41506e', dark: '#303c54', ink: '#181f30' },
  },
  // Tempest — storm-greyed olive turf, electric-green greens, slate-grey storm ground.
  tempest: {
    fairway: { light: '#7e8a72', base: '#66735c', dark: '#4e5a46', ink: '#252b1f' },
    green: { light: '#9cc874', base: '#7ea84e', dark: '#62843a', ink: '#2c3f1a' },
    tee: { light: '#73806a', base: '#5e6a55', dark: '#495440', ink: '#22281c' },
    collar: '#5a7a44',
    rough: { light: '#525a68', base: '#424854', dark: '#30353e', ink: '#171a20' },
  },
  // Fungal — bioluminescent jade fairways and glowing mint greens on a dark-purple jungle floor.
  fungal: {
    fairway: { light: '#46d6a0', base: '#2fae82', dark: '#228866', ink: '#0e3f30' },
    green: { light: '#7af0c0', base: '#54dba0', dark: '#3cb37e', ink: '#175440' },
    tee: { light: '#3fbf8c', base: '#2f9e73', dark: '#247a58', ink: '#103a2b' },
    collar: '#39b486',
    rough: { light: '#3a2b66', base: '#2c1f50', dark: '#1f163a', ink: '#0e081e' },
  },
  // Ocean — sea-green island turf and bright aqua greens over a deep-teal seafloor.
  ocean: {
    fairway: { light: '#5fd0a0', base: '#46b487', dark: '#36906c', ink: '#16402f' },
    green: { light: '#7fe6b8', base: '#5fd49e', dark: '#49b07f', ink: '#1d4d38' },
    tee: { light: '#54bf94', base: '#42a07c', dark: '#338062', ink: '#15402f' },
    collar: '#3ca07a',
    rough: { light: '#27687c', base: '#1d5668', dark: '#133c4a', ink: '#081e26' },
  },
  // Cetus — luminous deep-sea CYAN clifftop turf and glowing aqua greens over an abyssal blue ground,
  // darker + more bioluminescent than ocean's bright sea-green, so the plateau reads as land lit from
  // within over a starry sea (the off-cliff abyss is the deep-ocean rough/space).
  cetus: {
    fairway: { light: '#46a8b8', base: '#2f8294', dark: '#226576', ink: '#0c2c36' },
    green: { light: '#8af2ee', base: '#5fd8dc', dark: '#46b4bc', ink: '#174d52' },
    tee: { light: '#3f96a6', base: '#327886', dark: '#275c68', ink: '#0e2e36' },
    collar: '#3aa0aa',
    rough: { light: '#254c64', base: '#1a3a50', dark: '#112a3a', ink: '#061420' },
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
  // Crystal — a cool prismatic dark with an icy-cyan nebula and a bright crystalline shore.
  crystal: { base: '#0a1420', nebula: 'rgba(150,210,230,0.11)', edge: 'rgba(180,235,240,0.20)' },
  // Tempest — a storm-violet dark, electric nebula, lightning-lit shore.
  tempest: { base: '#0e0b16', nebula: 'rgba(150,120,210,0.13)', edge: 'rgba(190,170,255,0.20)' },
  // Fungal — a deep green-black, bioluminescent spore-glow nebula, glowing jade shore.
  fungal: { base: '#05140e', nebula: 'rgba(80,210,150,0.12)', edge: 'rgba(120,240,180,0.20)' },
  // Ocean — a deep sea-black, aqua nebula, luminous turquoise shore.
  ocean: { base: '#03101a', nebula: 'rgba(60,180,210,0.11)', edge: 'rgba(120,225,220,0.20)' },
  // Cetus — the star-ocean: an abyssal blue-black sea, a bioluminescent cyan bloom, a glowing
  // cliff-shore where the plateau meets the deep (the surrounding void IS the ocean the whales swim).
  cetus: { base: '#020a12', nebula: 'rgba(70,190,225,0.13)', edge: 'rgba(120,230,240,0.22)' },
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
 * The drawn LAND fill: the world's ROUGH turf, near-verbatim. The in-bounds ground must read as
 * playable rough — the lie the sim actually gives you there — NOT as deep space: the old heavy
 * blend (0.62) made every world's rough read as a starfield, i.e. as OB you could somehow play
 * from (GS-rough-frame). A whisper of the world's space base keeps the night mood; deep space
 * itself starts at the OB frame, where the land hull ends. The lost-rough worlds (void/cetus)
 * skip the land hull entirely when the penalty is armed — off the fairway there really IS the
 * deep, so the render shows it (see buildScene's `lostHole`).
 */
export const LAND_SPACE_BLEND = 0.12;
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
// NB (GS-rough-frame): no PURE-WHITE flower dots on a dark-rough world — white specks scattered
// over dark ground read as stars, i.e. the "rough is a starfield" bug by another route. Verdant's
// bright green rough keeps its white daisies; the dark worlds get tinted blooms instead.
export const ACCENTS: Record<string, Accent> = {
  'verdant-station': { flowers: ['#ff7eb6', '#ffe14a', '#ffffff'], mote: '#bfe6ff' },
  'dust-belt': { flowers: ['#e6a23c', '#d98c4c', '#caa86a'], mote: '#ffe0a0' },
  'ice-ring': { flowers: ['#cdeef7', '#9fd8e6', '#8ecbe0'], mote: '#dff2fa' },
  'ember-world': { flowers: ['#ff6a3c', '#ffb24a', '#ff8a2a'], mote: '#ff9a4a' },
  'void-garden': { flowers: ['#b07eff', '#7ed4ff', '#e6a0ff'], mote: '#d0a0ff' },
  'crystal-spires': { flowers: ['#bff0ff', '#9fe0f5', '#ff9ab8'], mote: '#cdeeff' },
  'tempest-reach': { flowers: ['#c8b8ff', '#9fd0ff', '#ffe14a'], mote: '#d0c8ff' },
  'spore-jungle': { flowers: ['#7af0c0', '#b07eff', '#ffe14a'], mote: '#9fffd0' },
  'tidal-archipelago': { flowers: ['#7fe6b8', '#ffe14a', '#ff9ab8'], mote: '#bfe8ff' },
  'cetus-deep': { flowers: ['#7af0ff', '#9fd8ff', '#c8fbff'], mote: '#bff4ff' },
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
