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
  deeprough: '#3a4a1e', // deepest tangle (dark; themed per world in style.ts styleDeepRough)
  barranca: '#6b5a48', // dry rocky ravine/chasm
  lava: '#d2451e',
  lavariver: '#e2541a',
  frozenpond: '#5aa6d8',
  creek: '#3f8fe0',
  void: '#160a26',
  voidrough: '#0a0518',
  cetusdeep: '#06283a',
  shiprough: '#080b12',
  ice: '#bfe6f0',
  crystal: '#9fd8e6',
};

/** Per-biome rough/background tint, keyed by biome id (sell the world). Kept in sync with the
 *  `ARCHETYPE_TURF` rough bases (GS-rough-frame: ground must read as ground on every world;
 *  GS-ground-cover: and the ground is the biome's COVERING — snow, beach sand, moss, ash…). */
export const BIOME_ROUGH: Record<string, string> = {
  'verdant-station': '#274d27',
  'dust-belt': '#85683a',
  'ice-ring': '#dce9f2',
  'ember-world': '#594238',
  'void-garden': '#310e4d',
  'crystal-spires': '#5a6680',
  'tempest-reach': '#4d5945',
  'spore-jungle': '#3a6446',
  'tidal-archipelago': '#cfba85',
  'cetus-deep': '#08355a',
  'toxic-mire': '#4a5a2c',
  'scrap-belt': '#7a4a2c',
  'derelict-ship': '#48535e',
  'earth-links': '#a89a5a', // sandy-golden fescue/marram links rough
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
  swamp: { post: '#6a5a3a', cap: '#9fd84a', line: 'rgba(120,180,60,0.16)', glow: 'rgba(150,220,80,0.30)' }, // rotting bog-marker posts, sickly acid-lamp caps
  metal: { post: '#8a5e3a', cap: '#ff8a2a', line: 'rgba(180,120,70,0.16)', glow: 'rgba(255,150,60,0.28)' }, // rusted girder posts with hazard-orange warning caps
  // Derelict — no ground to plant a stake in (off the deck is open space): a FLOATING emergency beacon,
  // a dead red warning light adrift where the hull ends. Cold steel post for the calm-stop hull edges.
  derelict: { post: '#6a7a86', cap: '#ff5a4a', line: 'rgba(150,175,200,0.16)', beacon: 'rgba(255,90,74,0.42)' },
  asgard: { post: '#e8d48a', cap: '#ffcf4a', line: 'rgba(232,212,138,0.18)', glow: 'rgba(255,210,110,0.34)' }, // gilded rune-pillars with a Bifröst-banner cap glow
  earth: { post: '#f4f4f4', cap: '#d64545', line: 'rgba(244,244,244,0.16)' }, // the classic white boundary stakes of a real course (St Annette’s' out-of-bounds)
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
  // Desert — firm, dry Bermuda tan with an oasis-green putting surface. The rough is open DUNE
  // SAND (GS-ground-cover) — lighter than the old scrub-dirt so off the fairway reads as the
  // rolling sand sea the world is, not dark wasteland.
  desert: {
    fairway: { light: '#ccae64', base: '#b89a52', dark: '#9a7f3e', ink: '#5e4a22' },
    green: { light: '#b6d676', base: '#9bbf5a', dark: '#7e9e44', ink: '#46591f' },
    tee: { light: '#c0a563', base: '#a98f4e', dark: '#8c7338', ink: '#4e3f1d' },
    collar: '#86a046',
    rough: { light: '#98793f', base: '#85683a', dark: '#68512c', ink: '#392c16' },
  },
  // Frost — snow-dusted, frosted teal-green turf and pale mint ice-greens. The rough is a bright
  // SNOWFIELD (GS-ground-cover): the frosted turf corridor is mown THROUGH deep snow cover, so the
  // off-fairway ground reads white — the old slate-blue slab read as more night sky ("the rough
  // still doesn't look like ground").
  // NB (GS-rough-frame follow-up): every world's rough ramp below is kept CLEARLY lighter than its
  // `ARCHETYPE_SPACE` base — the rough slab only ever renders where it's PLAYABLE ground now, so a
  // near-sky-dark rough just reads as more starless space. Ground must look like ground on all ten.
  frost: {
    fairway: { light: '#bfe0da', base: '#9cc3bf', dark: '#7ba39e', ink: '#3a5a59' },
    green: { light: '#dcf3ec', base: '#c2e6dd', dark: '#9fcabf', ink: '#4d716b' },
    tee: { light: '#abccc7', base: '#8fb0ac', dark: '#728e8a', ink: '#3a504e' },
    collar: '#7fb0a6',
    rough: { light: '#eef6fb', base: '#dce9f2', dark: '#c0d3e0', ink: '#6d8494' },
  },
  // Inferno — scorched ash-earth fairways, heat-stressed olive greens. The rough is an ASH & CINDER
  // field (GS-ground-cover): grey-brown volcanic ash rather than dark red-brown earth, so the ember
  // decor (fissures, cinder flecks) sits on visible ground instead of near-darkness.
  inferno: {
    fairway: { light: '#8a6a4e', base: '#6e5340', dark: '#523c2c', ink: '#2a1c12' },
    green: { light: '#97a653', base: '#7c8a3e', dark: '#62702f', ink: '#333a16' },
    tee: { light: '#82643f', base: '#6a5036', dark: '#523c28', ink: '#291c10' },
    collar: '#5e6b2e',
    rough: { light: '#6b5246', base: '#594238', dark: '#43302a', ink: '#221712' },
  },
  // Void — cosmic VIOLET "astroturf" islands, luminous lilac greens. The fairway stripes carry a
  // wider light↔dark spread than other worlds: indigo turf sits so close in value to the indigo
  // platform/rough that the mowing bands vanished on long par-4/5 corridors (GS-cetus-void-45).
  // GS-cetus-void-glow pushed the whole world off the greyish periwinkle it had drifted onto and
  // onto a genuinely PURPLE hue at a much higher chroma (OKLab C: fairway 0.114 → 0.140, green
  // 0.139 → 0.161, rough 0.084 → 0.109) at the same darkness — the world was reading washed out
  // because it was monochrome AND desaturated, not because it was dark. Lightness is deliberately
  // unchanged; the vibrance is bought with saturation and the emissive kit in `style/glow.ts`.
  void: {
    fairway: { light: '#7d55bd', base: '#523088', dark: '#311853', ink: '#1c0d30' },
    green: { light: '#a291f5', base: '#8272e0', dark: '#6658bb', ink: '#2c2455' },
    tee: { light: '#5a3f95', base: '#452c74', dark: '#331f56', ink: '#1a0f2c' },
    collar: '#7a5ecc',
    rough: { light: '#3f1863', base: '#310e4d', dark: '#210834', ink: '#100419' },
  },
  // Crystal — pale prismatic teal turf and bright cyan-white greens on a crystalline GRAVEL SCREE
  // (GS-ground-cover): a lavender-slate shard-litter field, lifted well clear of the world's
  // night-sky base (the old deep-indigo slab read as starfield, not ground — GS-rough-frame).
  crystal: {
    fairway: { light: '#a7e0d6', base: '#7fc8bd', dark: '#5fa399', ink: '#2f5650' },
    green: { light: '#c4f3ff', base: '#9fe0f5', dark: '#7cc0dc', ink: '#3a6675' },
    tee: { light: '#9fd0c8', base: '#84b4ac', dark: '#6a948c', ink: '#33504a' },
    collar: '#6fb0a6',
    rough: { light: '#6b7796', base: '#5a6680', dark: '#454f64', ink: '#232a3a' },
  },
  // Tempest — storm-greyed olive turf, electric-green greens. The rough is rain-soaked MOORLAND
  // HEATH (GS-ground-cover): a wet green-grey moor rather than bare slate, so the storm world's
  // ground reads as flattened wild grass under the gale.
  tempest: {
    fairway: { light: '#7e8a72', base: '#66735c', dark: '#4e5a46', ink: '#252b1f' },
    green: { light: '#9cc874', base: '#7ea84e', dark: '#62843a', ink: '#2c3f1a' },
    tee: { light: '#73806a', base: '#5e6a55', dark: '#495440', ink: '#22281c' },
    collar: '#5a7a44',
    rough: { light: '#5e6b54', base: '#4d5945', dark: '#3a4433', ink: '#1d2418' },
  },
  // Fungal — bioluminescent jade fairways and glowing mint greens. The rough is a MOSS & LICHEN
  // carpet (GS-ground-cover): deep living green undergrowth (the old dark-purple floor read as
  // night sky) — the toadstool/spore decor grows out of visible moss now.
  fungal: {
    fairway: { light: '#46d6a0', base: '#2fae82', dark: '#228866', ink: '#0e3f30' },
    green: { light: '#7af0c0', base: '#54dba0', dark: '#3cb37e', ink: '#175440' },
    tee: { light: '#3fbf8c', base: '#2f9e73', dark: '#247a58', ink: '#103a2b' },
    collar: '#39b486',
    rough: { light: '#4b7c58', base: '#3a6446', dark: '#294a33', ink: '#12281a' },
  },
  // Ocean — sea-green island turf and bright aqua greens on open BEACH SAND (GS-ground-cover):
  // the whole island off the mown turf is one big strand — "sandy all-bunker rough" — instead of
  // the old deep-teal seafloor slab (which read as being IN the sea, not on the island).
  ocean: {
    fairway: { light: '#5fd0a0', base: '#46b487', dark: '#36906c', ink: '#16402f' },
    green: { light: '#7fe6b8', base: '#5fd49e', dark: '#49b07f', ink: '#1d4d38' },
    tee: { light: '#54bf94', base: '#42a07c', dark: '#338062', ink: '#15402f' },
    collar: '#3ca07a',
    rough: { light: '#e0cf9e', base: '#cfba85', dark: '#b09a67', ink: '#6a5834' },
  },
  // Cetus — luminous deep-sea CYAN clifftop turf and glowing aqua greens over an abyssal blue ground,
  // darker + more bioluminescent than ocean's bright sea-green, so the plateau reads as land lit from
  // within over a starry sea (the off-cliff abyss is the deep-ocean rough/space).
  // GS-cetus-void-glow: this was the LEAST chromatic turf of any non-grey world — a petrol-grey
  // slab (OKLab C 0.083, against verdant's 0.136) whose green was barely distinguishable from its
  // fairway on the drawn map. Pushed onto a saturated ocean blue-cyan at the same lightness
  // (fairway C → 0.101, green 0.108 → 0.129, rough 0.054 → 0.081); the glow itself is the emissive
  // kit in `style/glow.ts`, not a brighter fill.
  cetus: {
    fairway: { light: '#2ea6c8', base: '#127f9f', dark: '#0a6180', ink: '#042a3e' },
    green: { light: '#79f0f2', base: '#2ad6e0', dark: '#12b1bf', ink: '#0a4c56' },
    tee: { light: '#2894b0', base: '#12758f', dark: '#0b586e', ink: '#04283a' },
    collar: '#1cb0c2',
    rough: { light: '#0d4771', base: '#08355a', dark: '#042442', ink: '#021124' },
  },
  // Earth — HOME LINKS (GS-earth): firm, sun-cured Scottish links turf — a golden-sage fescue fairway
  // (drier and more olive-gold than verdant's lush emerald), a true bentgrass putting green, over a
  // sandy-golden FESCUE/MARRAM rough (base mean ~137/255, far clear of the dusk-sea space base ~27/255).
  // The distinct golden turf reads as a windswept seaside course, not the exotic worlds' saturated skins.
  earth: {
    fairway: { light: '#84b45a', base: '#6a9a44', dark: '#527a34', ink: '#243812' },
    green: { light: '#7fd86e', base: '#63c257', dark: '#4aa244', ink: '#1e4a22' },
    tee: { light: '#8ca846', base: '#78933a', dark: '#5f7830', ink: '#2c3a16' },
    collar: '#5a9440',
    rough: { light: '#c2b877', base: '#a89a5a', dark: '#8a7c44', ink: '#4a4020' },
  },
  // Swamp — SICKLY BOG: muddy chartreuse fairways and pale acid-green greens over a murky olive-brown
  // muck rough (base mean ~69/255, comfortably clear of the near-black green-space base ~12/255 — the
  // ≥30 rough-vs-space brightness gap the frame test enforces).
  swamp: {
    fairway: { light: '#7f9a42', base: '#6a8236', dark: '#506128', ink: '#26300f' },
    green: { light: '#9ec857', base: '#83b040', dark: '#66902f', ink: '#2f4013' },
    tee: { light: '#758c3c', base: '#5f7830', dark: '#4a5f26', ink: '#232e10' },
    collar: '#6a8a34',
    rough: { light: '#5a6c36', base: '#4a5a2c', dark: '#38461f', ink: '#1c2610' },
  },
  // Metal — SCRAP BELT: a MUTED oxidised-copper verdigris salvaged-turf fairway that sits with the
  // rust (greyed, darkened patina — a weathered teal, not a vibrant lime), a slightly fresher patina
  // green so the target still reads, and a bare RUSTED-IRON rough (base mean ~80/255, well clear of
  // the near-black metallic space base ~10/255). The muted-teal-over-rust contrast (complementary
  // hues, not a bright-green sticker) sells a corroded machine graveyard, not a mown parkland.
  metal: {
    fairway: { light: '#70a091', base: '#5a8578', dark: '#41625a', ink: '#182b26' },
    green: { light: '#82c2a6', base: '#63ab8f', dark: '#4a8570', ink: '#1c3d33' },
    tee: { light: '#658b7d', base: '#54786c', dark: '#3f5c52', ink: '#172823' },
    collar: '#568576',
    rough: { light: '#96603a', base: '#7a4a2c', dark: '#5e381f', ink: '#301c10' },
  },
  // Derelict — COLD DEAD STEEL: the mown "fairway" is a lit deck-plating walkway (a desaturated steel-
  // teal with a faint emergency-cyan cast), the "green" a slightly brighter landing pad, over a bare
  // gunmetal HULL rough (base mean ~83/255, well clear of the cold blue-black space base ~8/255 — the
  // ≥30 rough-vs-space brightness gap the frame test enforces). No parkland lime anywhere: this reads as
  // the inside of a wreck, lit by dying emergency light, not a mown lawn.
  derelict: {
    fairway: { light: '#63797d', base: '#4a5f63', dark: '#374a4e', ink: '#152023' },
    green: { light: '#72a0a2', base: '#557f82', dark: '#406366', ink: '#183034' },
    tee: { light: '#5a6d70', base: '#455659', dark: '#374749', ink: '#141d1f' },
    collar: '#4a6266',
    rough: { light: '#5c6773', base: '#48535e', dark: '#363f48', ink: '#1a1f26' },
  },
  // Asgard — GILDED EMERALD: jewel-green fairways with a golden sheen, luminous emerald greens, a gold
  // apron collar. The rough is a rich gilded meadow (base mean ~75/255, comfortably clear of the deep
  // royal-indigo space base ~21/255 — the ≥30 rough-vs-space brightness gap the frame test enforces).
  asgard: {
    fairway: { light: '#5ec878', base: '#3fa85e', dark: '#2f8248', ink: '#154020' },
    green: { light: '#8ff0a0', base: '#6fe086', dark: '#4fb865', ink: '#1d5028' },
    tee: { light: '#c4b256', base: '#a99a44', dark: '#877a34', ink: '#463f18' },
    collar: '#c9a84a',
    rough: { light: '#3f8a5a', base: '#2f6a48', dark: '#215034', ink: '#0f2c1e' },
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
  // Void — the abyss: deepest base, violet nebula, luminous violet shore. GS-cetus-void-glow
  // saturated all three (the shore rim was a periwinkle BLUE, which is what pulled the world off
  // its own purple) without lightening the sky — a vibrant dark world, not a brighter one.
  void: { base: '#040109', nebula: 'rgba(140,55,235,0.15)', edge: 'rgba(170,110,255,0.26)' },
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
  // (GS-cetus-void-glow: the bloom deepened to a saturated cobalt — the world's light comes from
  // BELOW, out of the sea, so the sky it stains should be ocean blue rather than a pale cyan haze.)
  cetus: { base: '#01080f', nebula: 'rgba(25,120,235,0.15)', edge: 'rgba(95,205,255,0.28)' },
  // Swamp — a fetid green-black gloom lit by a toxic-green miasma nebula, with a sickly chartreuse
  // shore glow where the mire meets the murk.
  swamp: { base: '#0b1206', nebula: 'rgba(120,180,60,0.12)', edge: 'rgba(160,205,90,0.18)' },
  // Metal — a cold metallic near-black lit by a rust-orange scrap nebula, with a warm metallic-lit
  // shore where the derelict plates meet the vacuum.
  metal: { base: '#0c0a08', nebula: 'rgba(190,110,55,0.12)', edge: 'rgba(215,155,95,0.19)' },
  // Derelict — a cold blue-black vacuum, a faint dead-steel nebula wash, and a cold steel-lit rim where
  // the broken hull sections meet the stars. Bleak, silent, haunted — the emptiest sky short of the void.
  derelict: { base: '#05070d', nebula: 'rgba(90,120,160,0.10)', edge: 'rgba(140,170,205,0.18)' },
  // Asgard — the Golden Realm: a royal indigo→violet twilight (deep base) with a violet nebula and a
  // warm GOLD horizon glow at the shore where the emerald fields meet the celestial sky.
  asgard: { base: '#0e0a26', nebula: 'rgba(150,90,225,0.13)', edge: 'rgba(255,205,90,0.24)' },
  // Earth — HOME: a soft North-Sea DUSK beyond the links, not the deep void of space. A dark dusk-blue
  // base under a gentle sea-blue haze, with a warm golden-links shore glow where the fairways meet the
  // twilight sky and the sea. (base mean ~27 — the ≥30 rough-vs-space gap holds against the golden rough.)
  earth: { base: '#0b1a2c', nebula: 'rgba(90,140,200,0.10)', edge: 'rgba(206,220,150,0.19)' },
};

/**
 * The Rainbow Road's OWN deep-space look (GS-rainbow-polish): a distinct cosmic backdrop so the
 * legendary ball reads as its own bespoke world, not "whatever biome it landed on painted rainbow".
 * A rich indigo-violet void (deeper + more saturated than any archetype's, closer to the intro
 * cinematic's night sky) with a warm prismatic nebula wash and a bright multi-hue shore rim — the
 * matching backdrop for the aurora sky + rainbow-cliff ribbon painted over it.
 */
export const RAINBOW_SPACE: SpaceLook = {
  base: '#070417',
  nebula: 'rgba(150,90,225,0.12)',
  edge: 'rgba(190,150,255,0.22)',
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
  rim: '#f4ead0', // sunlit far floor of the bowl (lifted brighter — the lit side of the depression)
  shadow: '#c4ad6f',
  rake: 'rgba(255,250,230,0.55)',
  ink: '#8a7740',
  // GS-inset-2 depression shading (a single upper-left light): a SLIM shadow on the near (up-light)
  // rim so the bunker reads dug in — soft, so it's a lip, not a distinct dark shadow.
  wall: 'rgba(74,54,18,0.28)',
};

/** Water as banded depth: a shallow shoreline, a mid body, a deep core + white glints. */
export const WATER = {
  shallow: '#5f9ed6', // shoreline rim, dimmed from the old candy-bright cyan so it reads as a bank, not a sticker border
  base: '#3f8fe0', // keep the FILL.water value
  deep: '#2c6dc0',
  deepest: '#1d4f96',
  glint: 'rgba(255,255,255,0.65)',
  ink: '#163b6b',
  // GS-inset-2: a slim shadow along the up-light shore so the water reads sunk below its bank.
  bank: 'rgba(6,20,44,0.30)',
};

/** Molten lava (lakes + rivers): a charred crust rim, a glowing body, a hot core + bright cracks. */
export const LAVA = {
  crust: '#3a1008',
  body: '#d2451e',
  hot: '#ff8a2a',
  core: '#ffd24a',
  crack: '#ffb24a',
  ink: '#651a0a',
  // GS-inset-2: a cooler charred bank along the up-light shore so the lava reads sunk below its crust.
  bank: 'rgba(18,4,2,0.32)',
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
  'toxic-mire': { flowers: ['#9fd84a', '#c8e07a', '#7aa83a'], mote: '#c8e888' }, // sickly bog blooms
  'scrap-belt': { flowers: ['#ff8a2a', '#ffbf6a', '#d98c4c'], mote: '#ffcf8a' }, // rust flecks & sparks
  'derelict-ship': { flowers: ['#ff5a4a', '#5fd4d0', '#ffb04a'], mote: '#9fd0e0' }, // dead emergency lights, live wiring sparks, cold motes
  'earth-links': { flowers: ['#e88aa8', '#ffd34a', '#8ab0e0'], mote: '#e2ecc8' }, // sea-pink thrift, gorse yellow, harebell blue on the dunes
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
