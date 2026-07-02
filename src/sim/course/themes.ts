/**
 * Star-travel themes — content-as-data (GS-17).
 *
 * Harvested from golf-finder's night-sky catalogue (`data/night-sky-cards.json`): each
 * constellation / deep-sky showpiece / galaxy becomes a THEME — the thematic identity of a
 * stop on the voyage. A theme bundles three things the rest of the game reads:
 *   • `archetype` — which BIOME (gravity/wind/hazard/feel) the course is generated from.
 *   • `rarity`    — the loot grade (commonness of the draw + how special it should FEEL).
 *   • `arc`       — which of the three progression arcs the theme belongs to.
 *
 * Arc gating (the locked design call): a CONSTELLATION's arc is keyed by its STAR COUNT,
 * rebalanced to ≤5 / 6–7 / 8+ so the three arcs split a clean 9 / 10 / 9 (literal 1–4/5–6/7+
 * left arc 1 with only 3 themes — repetitive early game). Deep-sky/galaxy showpieces have no
 * stick figure, so they're gated by RARITY instead (rare → arc 2, epic → arc 3); the two
 * naked-eye galaxies are pinned to arc 3 as late-game grandeur.
 *
 * Fairness boundary (CLAUDE.md): a theme only SELECTS the biome + flavours the stop. It never
 * touches hole generation directly, so the fairness + no-death-spiral validators are untouched.
 *
 * Pure & deterministic: no DOM, no globals, no `Math.random`. The render layer keys palette/
 * art off the theme/biome id; this table stays physics-and-flavour only.
 */

import { Rng } from '../rng';
import type { Rarity } from './contract';
import { RARITY_C } from '../rpg/loot';
import { biomeById, type Biome } from './biomes';

export type ThemeKind = 'constellation' | 'deepsky' | 'galaxy';
export type Arc = 1 | 2 | 3;

/**
 * The five biome archetypes a theme can map to. Slice A resolves each to one of the existing
 * biome rows (`archetypeBiome`); the rarity-tiered biome expansion (GS-17b) widens this seam so
 * a legendary inferno reads wilder than a common one — without rewriting this table.
 */
export type BiomeArchetype =
  | 'verdant'
  | 'desert'
  | 'frost'
  | 'inferno'
  | 'void'
  // GS-worlds: four new exotic space worlds, each a distinct PLAYSTYLE, not just a recolour.
  | 'crystal' // prismatic gem world — true/fast crystal lies everywhere, precision rewarded
  | 'tempest' // gas-giant storm world — the wildest crosswinds in the galaxy
  | 'fungal' // bioluminescent spore-jungle — the densest tree-lined corridors
  | 'ocean' // tidal archipelago — sea channels + flanking lagoons, island-hopping golf
  // GS-cetus: the Whale constellation's realm — clifftop plateaus over a starry ocean. Off the
  // clifftop is lost to the star-ocean (the void's island/abyss model, reskinned); a river of stars
  // pours off the cliffs as a waterfall where space whales surface.
  | 'cetus'; // star-ocean clifftops — island plateaus over a starry sea, whales breaching below

/**
 * Per-theme biome flavour (GS-17b) — bounded MULTIPLIERS on the archetype baseline that give a
 * stop its constellation's character (Scorpius's hooking sting, Sagittarius's black-hole gravity,
 * a galaxy's grandeur). 1 = neutral. `resolveBiome` applies these, amplifies the deviations by the
 * theme's RARITY (rarer = more pronounced — "legendary feels legendary"), and CLAMPS every field
 * so even a legendary stop stays inside the no-death-spiral bar. Penalty hazards are STILL kept off
 * the play corridor by `validateFairness`, so flavour only ever turns up *fair* spice.
 */
export interface BiomeFlavour {
  /** Gravity feel — scales the archetype carry multiplier. */
  carry?: number;
  /** Antigrav unpredictability — overrides the archetype's per-hole carry jitter. */
  jitter?: number;
  /** Crosswind — scales both the base and wildness wind. */
  wind?: number;
  /** Corridor width — <1 tightens (kept ≥ a floor so OB doesn't spike). */
  tightness?: number;
  /** Dogleg severity — scales the archetype dogleg bias. */
  dogleg?: number;
  /** Treeline density (non-penalty lie). */
  trees?: number;
  /** Fairway sand density (non-penalty, always fair). */
  bunkers?: number;
  /** In-play scatter-lie density (ice/crystal/waste — non-penalty spice). */
  scatter?: number;
}

export interface Theme {
  /** Stable slug — never reused. */
  id: string;
  name: string;
  /** Constellation abbreviation (deep-sky/galaxy themes omit it). */
  abbr?: string;
  kind: ThemeKind;
  rarity: Rarity;
  arc: Arc;
  /** Constellation star count — the arc key for constellations. */
  stars?: number;
  archetype: BiomeArchetype;
  /** Brightest star / anchor object — the label + (later) the render anchor. */
  anchor: string;
  /** One-line flavour for the stop briefing + card. */
  blurb: string;
  /** Per-theme biome flavour (GS-17b); absent → pure archetype + rarity baseline. */
  flavour?: BiomeFlavour;
  /**
   * One-off destination (fires at most once per run). Always false here: these are the
   * RECURRING place-themes. The one-off dated events (eclipses, Apophis) land in GS-17c.
   */
  unique: boolean;
}

// --- Arc keys ----------------------------------------------------------------

/** Rebalanced star-count breaks: ≤5 → arc 1, 6–7 → arc 2, 8+ → arc 3 (9 / 10 / 9 split). */
export const STAR_ARC_BREAKS = { arc2Min: 6, arc3Min: 8 } as const;

export function arcForStars(stars: number): Arc {
  if (stars >= STAR_ARC_BREAKS.arc3Min) return 3;
  if (stars >= STAR_ARC_BREAKS.arc2Min) return 2;
  return 1;
}

/** Deep-sky/galaxy arc by rarity (no stick figure to count): rare → 2, epic/legendary → 3. */
function arcForRarity(r: Rarity): Arc {
  if (r === 'epic' || r === 'legendary') return 3;
  if (r === 'rare') return 2;
  return 1;
}

// --- Archetype → biome (the single resolver; GS-17b widens this) --------------

const ARCHETYPE_BIOME: Record<BiomeArchetype, string> = {
  verdant: 'verdant-station',
  desert: 'dust-belt',
  frost: 'ice-ring',
  inferno: 'ember-world',
  void: 'void-garden',
  crystal: 'crystal-spires',
  tempest: 'tempest-reach',
  fungal: 'spore-jungle',
  ocean: 'tidal-archipelago',
  cetus: 'cetus-deep',
};

/** The biome id a theme generates its course from. */
export function archetypeBiome(a: BiomeArchetype): string {
  return ARCHETYPE_BIOME[a];
}

/** Inverse: the archetype a biome id belongs to (verdant if unknown). The render/zone layers key
 *  zone identity off this so a biome-only course (no theme — e.g. the Sim Lab) still reads on-world. */
export function archetypeForBiome(biomeId: string): BiomeArchetype {
  for (const a of Object.keys(ARCHETYPE_BIOME) as BiomeArchetype[]) {
    if (ARCHETYPE_BIOME[a] === biomeId) return a;
  }
  return 'verdant';
}

/** Resolve a stop's archetype from its theme id if present, else its biome id. */
export function archetypeFor(themeId: string | undefined, biomeId: string): BiomeArchetype {
  if (themeId) {
    const t = themeById(themeId);
    if (t) return t.archetype;
  }
  return archetypeForBiome(biomeId);
}

export function themeBiome(t: Theme): string {
  return archetypeBiome(t.archetype);
}

// --- Rarity-tiered, theme-flavoured biomes (GS-17b) --------------------------

/**
 * How much a theme's rarity AMPLIFIES its flavour deviations from the archetype baseline. Common
 * plays the plain archetype; a legendary stop reads markedly wilder/grander. Tunable; kept modest
 * so the no-death-spiral bar holds (re-proved in tests across every theme at max wildness).
 */
export const RARITY_INTENSITY: Record<Rarity, number> = {
  common: 1.0,
  rare: 1.15,
  epic: 1.3,
  legendary: 1.5,
};

// --- Themed upgrades: which gear an archetype's outpost favours (GS-17d) ------

/**
 * Each biome archetype's outpost leans toward gear that SUITS its courses — so the shop reads
 * on-theme for where you are: a fiery inferno stocks aggression (distance), a chaotic void/desert
 * stocks control, an icy world stocks control + putting, a gentle verdant stop stocks growth
 * (economy/skill). Content-as-data; the bias is a soft weight (`ITEM_AFFINITY_BOOST`), never a
 * filter — every item can still appear, just more or less often. (Maps to `ITEM_TAGS` in economy.)
 */
export const ARCHETYPE_AFFINITY: Record<BiomeArchetype, readonly string[]> = {
  inferno: ['distance'],
  void: ['control', 'skill'],
  frost: ['control', 'putting'],
  desert: ['control'],
  verdant: ['economy', 'skill'],
  crystal: ['skill', 'putting'], // a precision world — reward true striking + putting
  tempest: ['control'], // tame the wind
  fungal: ['economy', 'skill'], // lush, growthy — like verdant's cousin
  ocean: ['control', 'distance'], // carry the sea, flight the lagoons
  cetus: ['control', 'skill'], // hit the clifftop plateau or it's lost to the star-ocean — precision
};

/** How much an on-theme item's shop weight is multiplied (soft bias, not a filter). */
export const ITEM_AFFINITY_BOOST = 2.2;

/** The shop-weight multiplier for an item's tags at a given archetype (1 = no bias). */
export function itemThemeWeight(tags: readonly string[], archetype: BiomeArchetype): number {
  const pref = ARCHETYPE_AFFINITY[archetype];
  return tags.some((t) => pref.includes(t)) ? ITEM_AFFINITY_BOOST : 1;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A multiplier's deviation from 1, scaled by rarity intensity, re-centred on 1. */
function amp(mult: number, intensity: number): number {
  return 1 + (mult - 1) * intensity;
}

/**
 * Resolve a theme to a concrete biome (GS-17b): the archetype baseline, with the theme's flavour
 * multipliers applied and amplified by its rarity, every field clamped to a fair range. The result
 * keeps the ARCHETYPE id so the render palette (5 keys) still resolves — per-theme visuals are
 * GS-17e; the course already carries `themeId` for that. Pure & deterministic from the theme alone.
 */
export function resolveBiome(theme: Theme): Biome {
  const base = biomeById(archetypeBiome(theme.archetype))!;
  const f = theme.flavour ?? {};
  const k = RARITY_INTENSITY[theme.rarity];

  // Gravity: amplify the archetype's deviation from earth-normal, then nudge by flavour.
  const carry = clamp(amp(base.carryMult * (f.carry ?? 1), k) , 0.8, 1.6);
  const jitter = clamp((f.jitter ?? base.carryJitter) * k, 0, 0.18);
  // Wind: flavour-scaled, rarity turns the gusts up (the AI aims upwind, so this stays fair).
  const windK = (f.wind ?? 1) * (1 + (k - 1) * 0.6);
  const windBase = clamp(base.windBase * windK, 0, 12);
  const windWild = clamp(base.windWild * windK, 0, 40);
  // Corridor: rarer = a touch tighter, but floored so OB doesn't spike.
  const fairwayWidthMult = clamp(base.fairwayWidthMult * (f.tightness ?? 1) * (1 - (k - 1) * 0.25), 0.72, 1.2);
  const doglegBias = clamp(base.doglegBias * (f.dogleg ?? 1) * (1 + (k - 1) * 0.5), 0, 0.6);
  // Non-penalty spice (always fair): trees, sand, scatter lies scale with flavour × rarity.
  const treeDensity = clamp((base.treeDensity ?? 0) * (f.trees ?? 1) * k, 0, 3.2);
  const fairwayBunkers = clamp((base.fairwayBunkers ?? 0) * (f.bunkers ?? 1) * k, 0, 3.5);
  const scatterK = (f.scatter ?? 1) * k;
  const scatter = base.scatter.map((s) => ({ ...s, freqPerHole: clamp(s.freqPerHole * scatterK, 0, 3) }));

  return {
    ...base,
    carryMult: carry,
    carryJitter: jitter,
    windBase,
    windWild,
    fairwayWidthMult,
    doglegBias,
    treeDensity,
    fairwayBunkers,
    scatter,
  };
}

// --- The table ---------------------------------------------------------------

/** Constellation rows: arc is DERIVED from `stars` (asserted in tests). */
interface ConstRow {
  id: string;
  name: string;
  abbr: string;
  rarity: Rarity;
  stars: number;
  archetype: BiomeArchetype;
  anchor: string;
  blurb: string;
  flavour?: BiomeFlavour;
}

const CONSTELLATIONS: readonly ConstRow[] = [
  // --- Arc 1 (≤5 stars): the small, simple figures you cut your teeth on ---
  { id: 'crux', name: 'Crux', abbr: 'Cru', rarity: 'common', stars: 5, archetype: 'verdant', anchor: 'Acrux', blurb: 'The Southern Cross — the navigator’s home beacon, lush and welcoming.', flavour: { tightness: 1.08, dogleg: 0.7, wind: 0.85 } },
  { id: 'triangulum-australe', name: 'Triangulum Australe', abbr: 'TrA', rarity: 'rare', stars: 3, archetype: 'verdant', anchor: 'Atria', blurb: 'A neat green triangle tucked beside the Pointers.', flavour: { tightness: 0.92, dogleg: 0.6, trees: 1.2 } },
  { id: 'grus', name: 'Grus', abbr: 'Gru', rarity: 'rare', stars: 5, archetype: 'frost', anchor: 'Alnair', blurb: 'The Crane wades the frozen shallows of the southern sky.', flavour: { wind: 1.1, scatter: 1.15 } },
  { id: 'vela', name: 'Vela', abbr: 'Vel', rarity: 'common', stars: 5, archetype: 'desert', anchor: 'Regor', blurb: 'The Sails of Argo, billowing over endless dust.', flavour: { wind: 1.3, bunkers: 1.1 } },
  { id: 'corvus', name: 'Corvus', abbr: 'Crv', rarity: 'rare', stars: 4, archetype: 'frost', anchor: 'Gienah Crv', blurb: 'The thirsty Crow, forever beside water it cannot reach.', flavour: { tightness: 0.9, scatter: 1.1 } },
  { id: 'cygnus', name: 'Cygnus', abbr: 'Cyg', rarity: 'rare', stars: 5, archetype: 'frost', anchor: 'Deneb', blurb: 'The Swan glides the icy Milky Way as the Northern Cross.', flavour: { carry: 1.05, wind: 1.1 } },
  { id: 'lyra', name: 'Lyra', abbr: 'Lyr', rarity: 'rare', stars: 5, archetype: 'verdant', anchor: 'Vega', blurb: 'Orpheus’ harp, whose music coaxes the green to grow.', flavour: { trees: 1.35, wind: 0.85 } },
  { id: 'tucana', name: 'Tucana', abbr: 'Tuc', rarity: 'rare', stars: 5, archetype: 'verdant', anchor: 'Alpha Tuc', blurb: 'The Toucan, a splash of the tropics among the stars.', flavour: { trees: 1.3, dogleg: 1.1 } },
  { id: 'canis-minor', name: 'Canis Minor', abbr: 'CMi', rarity: 'common', stars: 2, archetype: 'inferno', anchor: 'Procyon', blurb: 'The Lesser Dog, panting through the dog days’ heat.', flavour: { wind: 0.85, bunkers: 1.1 } },

  // --- Arc 2 (6–7 stars): the mid-size figures, the journey hardens ---
  { id: 'canis-major', name: 'Canis Major', abbr: 'CMa', rarity: 'common', stars: 6, archetype: 'inferno', anchor: 'Sirius', blurb: 'The Greater Dog, blazing under Sirius, brightest of all stars.', flavour: { carry: 0.97, bunkers: 1.2 } },
  { id: 'taurus', name: 'Taurus', abbr: 'Tau', rarity: 'common', stars: 7, archetype: 'inferno', anchor: 'Aldebaran', blurb: 'The Bull, horn-tip marked by the wreckage of a supernova.', flavour: { dogleg: 1.25, scatter: 1.15 } },
  { id: 'carina', name: 'Carina', abbr: 'Car', rarity: 'common', stars: 7, archetype: 'desert', anchor: 'Canopus', blurb: 'The Keel of Argo, hull dragged across the dunes.', flavour: { bunkers: 1.3, scatter: 1.2 } },
  { id: 'aquila', name: 'Aquila', abbr: 'Aql', rarity: 'rare', stars: 7, archetype: 'void', anchor: 'Altair', blurb: 'The Eagle, Zeus’ thunderbolt-bearer, soaring the void.', flavour: { carry: 1.08, wind: 1.25 } },
  { id: 'musca', name: 'Musca', abbr: 'Mus', rarity: 'rare', stars: 6, archetype: 'verdant', anchor: 'Alpha Mus', blurb: 'The Fly — the only insect among the constellations.', flavour: { dogleg: 1.3, tightness: 0.95 } },
  { id: 'lupus', name: 'Lupus', abbr: 'Lup', rarity: 'rare', stars: 7, archetype: 'verdant', anchor: 'Alpha Lup', blurb: 'The Wolf, a wild beast prowling the green Milky Way.', flavour: { trees: 1.4, tightness: 0.95 } },
  { id: 'ara', name: 'Ara', abbr: 'Ara', rarity: 'rare', stars: 7, archetype: 'inferno', anchor: 'Beta Ara', blurb: 'The Altar, its rising smoke said to form the Milky Way.', flavour: { wind: 1.15, scatter: 1.25 } },
  { id: 'phoenix', name: 'Phoenix', abbr: 'Phe', rarity: 'rare', stars: 6, archetype: 'inferno', anchor: 'Ankaa', blurb: 'The firebird, reborn from its own ashes.', flavour: { jitter: 0.06, wind: 1.15, scatter: 1.2 } },
  { id: 'puppis', name: 'Puppis', abbr: 'Pup', rarity: 'common', stars: 7, archetype: 'desert', anchor: 'Naos', blurb: 'The Stern of Argo, riding high over the waste.', flavour: { carry: 1.05, bunkers: 1.2 } },
  { id: 'columba', name: 'Columba', abbr: 'Col', rarity: 'rare', stars: 6, archetype: 'frost', anchor: 'Phact', blurb: 'The Dove, sent out over the flood waters.', flavour: { wind: 1.1, scatter: 1.1 } },

  // --- Arc 3 (8+ stars): the grand, sprawling figures of the deep voyage ---
  { id: 'centaurus', name: 'Centaurus', abbr: 'Cen', rarity: 'common', stars: 15, archetype: 'verdant', anchor: 'Rigil Kent', blurb: 'The Centaur, wrapping the Cross, home to our nearest star.', flavour: { carry: 1.05, trees: 1.25 } },
  { id: 'orion', name: 'Orion', abbr: 'Ori', rarity: 'common', stars: 9, archetype: 'inferno', anchor: 'Rigel', blurb: 'The Hunter, between blue Rigel and doomed red Betelgeuse.', flavour: { dogleg: 1.2, bunkers: 1.15 } },
  { id: 'scorpius', name: 'Scorpius', abbr: 'Sco', rarity: 'common', stars: 14, archetype: 'inferno', anchor: 'Antares', blurb: 'The Scorpion, its red heart Antares, rival of Mars.', flavour: { dogleg: 1.4, bunkers: 1.25 } },
  { id: 'sagittarius', name: 'Sagittarius', abbr: 'Sgr', rarity: 'common', stars: 17, archetype: 'void', anchor: 'Kaus Australis', blurb: 'The Archer, aimed at the black hole at the galaxy’s heart.', flavour: { carry: 1.12, jitter: 0.13, scatter: 1.3 } },
  { id: 'leo', name: 'Leo', abbr: 'Leo', rarity: 'common', stars: 9, archetype: 'desert', anchor: 'Regulus', blurb: 'The Lion of the savannah, the little king on the ecliptic.', flavour: { tightness: 1.08, wind: 1.1, bunkers: 1.2 } },
  { id: 'gemini', name: 'Gemini', abbr: 'Gem', rarity: 'common', stars: 10, archetype: 'frost', anchor: 'Pollux', blurb: 'The Twins, frozen side by side, guardians of sailors.', flavour: { scatter: 1.15, dogleg: 0.85 } },
  { id: 'virgo', name: 'Virgo', abbr: 'Vir', rarity: 'rare', stars: 9, archetype: 'verdant', anchor: 'Spica', blurb: 'The Maiden of the harvest, holding a sky full of galaxies.', flavour: { trees: 1.3, wind: 0.9 } },
  { id: 'pegasus', name: 'Pegasus', abbr: 'Peg', rarity: 'common', stars: 8, archetype: 'void', anchor: 'Alpheratz', blurb: 'The Winged Horse, the Great Square soaring the void.', flavour: { carry: 1.1, wind: 1.2 } },
  { id: 'capricornus', name: 'Capricornus', abbr: 'Cap', rarity: 'rare', stars: 8, archetype: 'frost', anchor: 'Deneb Algedi', blurb: 'The Sea-Goat, half-frozen in the cold deep.', flavour: { carry: 0.95, wind: 1.1, scatter: 1.2 } },

  // --- GS-worlds: new exotic worlds, spread across the arcs by star count ---
  // crystal — prismatic gem worlds
  { id: 'triangulum', name: 'Triangulum', abbr: 'Tri', rarity: 'common', stars: 3, archetype: 'crystal', anchor: 'Mothallah', blurb: 'A sharp crystal wedge of three bright stars.', flavour: { scatter: 1.1, wind: 0.85 } },
  { id: 'corona-borealis', name: 'Corona Borealis', abbr: 'CrB', rarity: 'rare', stars: 7, archetype: 'crystal', anchor: 'Alphecca', blurb: 'The Northern Crown — a jewelled arc of prismatic light.', flavour: { scatter: 1.25, tightness: 0.95 } },
  // tempest — gas-giant storm worlds
  { id: 'sagitta', name: 'Sagitta', abbr: 'Sge', rarity: 'common', stars: 4, archetype: 'tempest', anchor: 'Sham', blurb: 'The Arrow, loosed on a screaming stormwind.', flavour: { wind: 1.15 } },
  { id: 'draco', name: 'Draco', abbr: 'Dra', rarity: 'common', stars: 8, archetype: 'tempest', anchor: 'Eltanin', blurb: 'The Dragon, coiled in the eye of the great storm.', flavour: { wind: 1.3, dogleg: 1.2 } },
  // fungal — bioluminescent spore-jungles
  { id: 'lacerta', name: 'Lacerta', abbr: 'Lac', rarity: 'rare', stars: 5, archetype: 'fungal', anchor: 'Alpha Lac', blurb: 'The Lizard, creeping the glowing spore-jungle.', flavour: { trees: 1.25, tightness: 0.95 } },
  { id: 'vulpecula', name: 'Vulpecula', abbr: 'Vul', rarity: 'rare', stars: 6, archetype: 'fungal', anchor: 'Anser', blurb: 'The Fox, slinking through luminous fungal groves.', flavour: { trees: 1.35, dogleg: 1.1 } },
  // ocean — tidal archipelagos
  { id: 'delphinus', name: 'Delphinus', abbr: 'Del', rarity: 'common', stars: 5, archetype: 'ocean', anchor: 'Rotanev', blurb: 'The Dolphin, breaching the tidal sea of stars.', flavour: { wind: 1.1, bunkers: 1.1 } },
  { id: 'eridanus', name: 'Eridanus', abbr: 'Eri', rarity: 'common', stars: 9, archetype: 'ocean', anchor: 'Achernar', blurb: 'The great celestial River, pouring to the deep south.', flavour: { wind: 1.15, dogleg: 1.1 } },
  // cetus — the Whale's clifftop star-ocean (arc 2 via 7 stars)
  { id: 'cetus', name: 'Cetus', abbr: 'Cet', rarity: 'rare', stars: 7, archetype: 'cetus', anchor: 'Diphda', blurb: 'The Whale, sounding the deep star-ocean off the clifftops.', flavour: { wind: 1.05, scatter: 1.1 } },
];

/** Deep-sky + naked-eye galaxy showpieces: rare destinations gated by rarity. */
interface FeatureRow {
  id: string;
  name: string;
  kind: 'deepsky' | 'galaxy';
  rarity: Rarity;
  archetype: BiomeArchetype;
  anchor: string;
  blurb: string;
  flavour?: BiomeFlavour;
  /** Pin to a specific arc (galaxies); otherwise derived from rarity. */
  arc?: Arc;
}

const FEATURES: readonly FeatureRow[] = [
  // Rare → arc 2 showpieces
  { id: 'jewel-box', name: 'Jewel Box Cluster', kind: 'deepsky', rarity: 'rare', archetype: 'frost', anchor: 'Kappa Crucis', blurb: 'A glittering casket of blue-white and ruby suns.', flavour: { scatter: 1.3, tightness: 0.95 } },
  { id: '47-tucanae', name: '47 Tucanae', kind: 'deepsky', rarity: 'rare', archetype: 'void', anchor: 'NGC 104', blurb: 'A million stars packed into one ancient globular ball.', flavour: { jitter: 0.1, scatter: 1.3 } },
  { id: 'pleiades', name: 'The Pleiades', kind: 'deepsky', rarity: 'rare', archetype: 'frost', anchor: 'Alcyone', blurb: 'The Seven Sisters, a cold blue knot of young stars.', flavour: { scatter: 1.25, wind: 1.05 } },
  { id: 'coalsack', name: 'The Coalsack', kind: 'deepsky', rarity: 'rare', archetype: 'void', anchor: 'Coalsack Nebula', blurb: 'A void within the void — a dark nebula beside the Cross.', flavour: { carry: 1.1, wind: 0.6, scatter: 1.2 } },
  { id: 'lagoon-nebula', name: 'Lagoon Nebula', kind: 'deepsky', rarity: 'rare', archetype: 'inferno', anchor: 'M8', blurb: 'A glowing furnace of star-birth in Sagittarius.', flavour: { wind: 1.1, scatter: 1.3 } },
  { id: 'ptolemy-cluster', name: 'Ptolemy Cluster', kind: 'deepsky', rarity: 'rare', archetype: 'verdant', anchor: 'M7', blurb: 'A bright open scatter charted since antiquity.', flavour: { trees: 1.25 } },
  { id: 'southern-pleiades', name: 'Southern Pleiades', kind: 'deepsky', rarity: 'rare', archetype: 'frost', anchor: 'Theta Carinae', blurb: 'A cool sparkling cluster around Theta Carinae.', flavour: { scatter: 1.25 } },
  { id: 'wishing-well', name: 'Wishing Well Cluster', kind: 'deepsky', rarity: 'rare', archetype: 'frost', anchor: 'NGC 3532', blurb: 'Scattered silver coins glimpsed at the bottom of a well.', flavour: { scatter: 1.3, wind: 1.05 } },

  // Epic → arc 3 showpieces
  { id: 'eta-carinae', name: 'Eta Carinae Nebula', kind: 'deepsky', rarity: 'epic', archetype: 'inferno', anchor: 'Eta Carinae', blurb: 'A vast roiling nebula around a star poised to detonate.', flavour: { wind: 1.2, jitter: 0.05, scatter: 1.3 } },
  { id: 'omega-centauri', name: 'Omega Centauri', kind: 'deepsky', rarity: 'epic', archetype: 'void', anchor: 'NGC 5139', blurb: 'The grandest globular — ten million suns in one swarm.', flavour: { carry: 1.12, jitter: 0.12, scatter: 1.35 } },
  { id: 'tarantula-nebula', name: 'Tarantula Nebula', kind: 'deepsky', rarity: 'epic', archetype: 'inferno', anchor: '30 Doradus', blurb: 'A monstrous starburst blazing in a neighbour galaxy.', flavour: { wind: 1.3, bunkers: 1.2, scatter: 1.3 } },
  { id: 'orion-nebula', name: 'Orion Nebula', kind: 'deepsky', rarity: 'epic', archetype: 'void', anchor: 'M42', blurb: 'A stellar nursery glowing in the Hunter’s sword.', flavour: { carry: 1.1, jitter: 0.08, scatter: 1.3 } },
  { id: 'centaurus-a', name: 'Centaurus A', kind: 'deepsky', rarity: 'epic', archetype: 'void', anchor: 'NGC 5128', blurb: 'A galaxy split by a dark dust lane, devouring another.', flavour: { dogleg: 1.3, carry: 1.08 } },
  { id: 'sculptor-galaxy', name: 'Sculptor Galaxy', kind: 'deepsky', rarity: 'epic', archetype: 'desert', anchor: 'NGC 253', blurb: 'A dusty starburst galaxy, the Sculptor’s grand work.', flavour: { bunkers: 1.3, scatter: 1.3, wind: 1.1 } },
  { id: 'southern-pinwheel', name: 'Southern Pinwheel', kind: 'deepsky', rarity: 'epic', archetype: 'void', anchor: 'M83', blurb: 'A face-on spiral, arms wound tight with new stars.', flavour: { dogleg: 1.35, carry: 1.08 } },
  { id: 'helix-nebula', name: 'Helix Nebula', kind: 'deepsky', rarity: 'epic', archetype: 'void', anchor: 'NGC 7293', blurb: 'The Eye of God — a dying star’s exhaled shell.', flavour: { dogleg: 1.2, carry: 1.1, scatter: 1.3 } },
  { id: 'sombrero-galaxy', name: 'Sombrero Galaxy', kind: 'deepsky', rarity: 'epic', archetype: 'desert', anchor: 'M104', blurb: 'A brilliant bulge ringed by a broad dark brim.', flavour: { dogleg: 1.2, bunkers: 1.2 } },

  // The two naked-eye galaxies — pinned to arc 3 as late-game grandeur
  { id: 'milky-way-core', name: 'Milky Way Core', kind: 'galaxy', rarity: 'epic', archetype: 'void', anchor: 'Galactic Centre', blurb: 'The blazing heart of our own galaxy, in Sagittarius.', arc: 3, flavour: { carry: 1.18, jitter: 0.14, scatter: 1.4 } },
  { id: 'magellanic-clouds', name: 'Magellanic Clouds', kind: 'galaxy', rarity: 'epic', archetype: 'void', anchor: 'LMC / SMC', blurb: 'Two dwarf galaxies circling the south celestial pole.', arc: 3, flavour: { carry: 1.14, jitter: 0.1, scatter: 1.3 } },
];

/** The full theme table (constellations + features), arc derived per the gating rules. */
export const THEMES: readonly Theme[] = [
  ...CONSTELLATIONS.map(
    (c): Theme => ({
      id: c.id,
      name: c.name,
      abbr: c.abbr,
      kind: 'constellation',
      rarity: c.rarity,
      arc: arcForStars(c.stars),
      stars: c.stars,
      archetype: c.archetype,
      anchor: c.anchor,
      blurb: c.blurb,
      flavour: c.flavour,
      unique: false,
    }),
  ),
  ...FEATURES.map(
    (f): Theme => ({
      id: f.id,
      name: f.name,
      kind: f.kind,
      rarity: f.rarity,
      arc: f.arc ?? arcForRarity(f.rarity),
      archetype: f.archetype,
      anchor: f.anchor,
      blurb: f.blurb,
      flavour: f.flavour,
      unique: false,
    }),
  ),
];

// --- Lookup & selection ------------------------------------------------------

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export function themesForArc(arc: Arc): Theme[] {
  return THEMES.filter((t) => t.arc === arc);
}

/**
 * Which arc a stop belongs to, by galaxy distance (the difficulty ramp the cut line uses too).
 * Early hops stay in arc 1; the voyage opens into arcs 2 then 3 as you push deeper. Tunable.
 */
export const ARC_DISTANCE_BREAKS = { arc2Min: 6, arc3Min: 15 } as const;

export function arcForDistance(distanceFromStart: number): Arc {
  if (distanceFromStart >= ARC_DISTANCE_BREAKS.arc3Min) return 3;
  if (distanceFromStart >= ARC_DISTANCE_BREAKS.arc2Min) return 2;
  return 1;
}

/**
 * Rarity-weighted draw from an EXPLICIT theme pool (one rng float — the same stream shape as
 * `pickTheme`). Exposed for GS-journey-variety, where the caller pre-filters the arc pool to the
 * archetypes a lane may still land on. The pool must be non-empty.
 */
export function pickThemeFrom(rng: Rng, pool: readonly Theme[]): Theme {
  const total = pool.reduce((s, t) => s + RARITY_C[t.rarity].weight, 0);
  let r = rng.float() * total;
  for (let i = 0; i < pool.length - 1; i++) {
    r -= RARITY_C[pool[i]!.rarity].weight;
    if (r <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

/**
 * Pick the theme for a stop: a rarity-weighted draw (rarer = scarcer, so a legendary FEELS
 * legendary) from the themes of the stop's arc. Deterministic in the supplied rng. Falls back
 * to lower arcs if a tier is somehow empty (it never is — 9/18/20 themes).
 */
export function pickTheme(rng: Rng, arc: Arc): Theme {
  let pool = themesForArc(arc);
  let a = arc;
  while (pool.length === 0 && a > 1) {
    a = (a - 1) as Arc;
    pool = themesForArc(a);
  }
  return pickThemeFrom(rng, pool);
}

/**
 * Worlds too punishing to OPEN a run on (GS-fresh-start): the lost-ball abysses (void, cetus),
 * the lava world and the storm world. The FIRST stop's draw skips them — a voyage tees off on a
 * readable world; the journey supplies the heat (route lanes CAN land these from stop 1 on).
 */
export const HARD_ARCHETYPES: ReadonlySet<BiomeArchetype> = new Set(['inferno', 'tempest', 'void', 'cetus']);

/** Convenience: the theme a run's current stop flies into, from its distance. Stop 0 (the tee-off
 *  world — no route chosen yet) draws from the arc pool MINUS the hard archetypes: the same single
 *  rarity-weighted rng draw, just a gentler pool (GS-fresh-start). */
export function themeForStop(seed: number | string, stopIndex: number, distanceFromStart: number): Theme {
  const rng = new Rng(`${seed}:theme:${stopIndex}`);
  const arc = arcForDistance(distanceFromStart);
  if (stopIndex === 0) {
    const pool = themesForArc(arc).filter((t) => !HARD_ARCHETYPES.has(t.archetype));
    if (pool.length > 0) return pickThemeFrom(rng, pool);
  }
  return pickTheme(rng, arc);
}
