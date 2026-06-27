/**
 * Biome table — content-as-data. A new biome is a NEW ROW here, never an engine edit
 * (CLAUDE.md). Pure & physics-only: this drives carry/wind/hazard/lie content. Render
 * concerns (palette/art) live in the render layer keyed by biome id, not here.
 *
 * Design contract for fairness (golf-soul lens): a biome's *penalty* surfaces are the
 * risk you can avoid with a sensible line (the generator keeps them clear of the play
 * corridor). A biome's *spice* is its in-play non-penalty lies — slick ice, true
 * crystal, low-gravity carry — which visibly matter but never make a hole unfair.
 */

/** A fantasy/extra surface scattered as in-play patches (NOT a penalty hazard). */
export interface BiomeScatter {
  /** Surface kind; must have a LIE_INFO row in shot.ts. */
  kind: string;
  /** Base patches per hole (scaled by wildness at generation time). */
  freqPerHole: number;
  rMin: number;
  rMax: number;
}

export interface Biome {
  id: string;
  name: string;
  /** Selection weight. */
  weight: number;
  /**
   * Baseline carry multiplier (gravity). 1 = earth-like; >1 = low gravity (ball flies
   * farther); <1 = dense/heavy. Emitted as a `biomeMods` carry entry on every hole.
   */
  carryMult: number;
  /** Per-hole carry jitter (antigrav pockets etc.); 0 = uniform. */
  carryJitter: number;
  /** Wind mph at wildness 0. */
  windBase: number;
  /** Additional wind mph at wildness 1 (linear in wildness). */
  windWild: number;
  /** Penalty hazard kinds this biome uses (must have penalty LIE_INFO rows). */
  hazardKinds: string[];
  /** Greenside hazard kind preference (defaults to 'bunker'). */
  greensideKind: string;
  /** In-play non-penalty surfaces scattered near landing zones. */
  scatter: BiomeScatter[];
  /** Fairway corridor width multiplier (tighter = harder). */
  fairwayWidthMult: number;
  /** 0..1 tendency to dogleg. */
  doglegBias: number;
  /**
   * Treeline density (trees per hole, base — scaled by wildness & par at generation). Trees
   * are a non-penalty LIE lining the rough OUTSIDE the corridor (`trees` in LIE_INFO). 0 = a
   * barren world (the void has crystals, not woods). A new world tunes this like any row.
   */
  treeDensity?: number;
  /** Fairway sand bunkers per hole (base, scaled by wildness). Sand is non-penalty → always
   *  fair, so these bite the landing-zone edge as risk-reward without ever killing a card. */
  fairwayBunkers?: number;
  /**
   * Green character (GS-greens) — gives each world a distinct putting-surface shape so greens stop
   * being identical circles. All optional with sane defaults:
   *  • `greenSize`     — radius multiplier (1 = baseline). Desert oasis greens run big, void asteroid
   *                      greens small.
   *  • `greenAspect`   — MAX long-axis stretch (1 = round). Frost ice-shelves run long and narrow.
   *  • `greenIrregular`— 0..~1.5 shape roughness (harmonics + kidney lobes). Inferno greens are jagged,
   *                      desert greens smooth.
   */
  greenSize?: number;
  greenAspect?: number;
  greenIrregular?: number;
  /**
   * Signature mechanic flags (GS-19), scaled fair→brutal by wildness at generation time:
   *  • `lostRough` — off-fairway is the named PENALTY lie (the void: "play to the fairway or it's
   *    lost"). The generator widens the corridor into a fair island and only arms the penalty on
   *    the wilder/deeper stops; the lie is returned by `lieAt` via a `roughLie` biomeMod.
   *  • `lavaRiver` — a molten river/creek crosses the fairway as a forced carry (the ember world).
   *  • `frozenPond` — a meltwater channel crosses the fairway as a forced carry (the frost world);
   *    a `frozenpond` penalty band, sanctioned + proven carryable exactly like the lava river.
   *  • `craters`   — impact-crater sand bunkers scattered through the landing zones (the desert
   *    world); non-penalty sand, so they bite the corridor as a navigable crater field.
   * All pure data: a world opts in, the generator + sim do the rest.
   */
  lostRough?: string;
  lavaRiver?: boolean;
  frozenPond?: boolean;
  /** Impact-crater bunkers per hole (base, scaled by wildness). Sand → always fair. */
  craters?: number;
}

export const BIOMES: readonly Biome[] = [
  {
    id: 'verdant-station',
    name: 'Verdant Station',
    weight: 30,
    carryMult: 1.0,
    carryJitter: 0,
    windBase: 3,
    windWild: 14,
    hazardKinds: ['water'],
    greensideKind: 'bunker',
    scatter: [],
    fairwayWidthMult: 1.0,
    doglegBias: 0.35,
    treeDensity: 1.6, // lush, tree-lined parkland
    fairwayBunkers: 1.5,
    greenSize: 1.05, // classic parkland greens — gently rolling, moderate variety
    greenAspect: 1.8,
    greenIrregular: 1.05,
  },
  {
    id: 'dust-belt',
    name: 'Dust Belt',
    weight: 22,
    carryMult: 1.22, // low gravity — clubs reach farther, so holes are longer
    carryJitter: 0.04,
    windBase: 8,
    windWild: 24,
    hazardKinds: ['waste', 'bunker'],
    greensideKind: 'bunker',
    scatter: [{ kind: 'waste', freqPerHole: 1.2, rMin: 7, rMax: 14 }],
    fairwayWidthMult: 1.1,
    doglegBias: 0.25,
    treeDensity: 0.2, // sparse desert scrub
    fairwayBunkers: 2.2, // sandy world — bunkers everywhere
    craters: 2.2, // signature: impact-crater bunkers pock the landing zones
    greenSize: 1.3, // big, smooth oasis greens against the dunes
    greenAspect: 1.6,
    greenIrregular: 0.7,
  },
  {
    id: 'ice-ring',
    name: 'Ice Ring',
    weight: 18,
    carryMult: 1.05,
    carryJitter: 0,
    windBase: 6,
    windWild: 30, // brutal crosswinds
    hazardKinds: ['water'],
    greensideKind: 'bunker',
    scatter: [{ kind: 'ice', freqPerHole: 1.5, rMin: 8, rMax: 16 }],
    fairwayWidthMult: 0.95,
    doglegBias: 0.3,
    treeDensity: 0.8, // frosted pines ring the fairways
    fairwayBunkers: 1,
    frozenPond: true, // signature: a meltwater channel crosses the fairway (forced carry)
    greenSize: 1.0, // long, narrow ice-shelf greens — a tester to hold
    greenAspect: 2.5,
    greenIrregular: 0.95,
  },
  {
    id: 'ember-world',
    name: 'Ember World',
    weight: 16,
    carryMult: 0.95, // dense, hot air
    carryJitter: 0,
    windBase: 2,
    windWild: 10,
    hazardKinds: ['lava'],
    greensideKind: 'lava',
    scatter: [{ kind: 'crystal', freqPerHole: 0.8, rMin: 6, rMax: 11 }],
    fairwayWidthMult: 0.9,
    doglegBias: 0.4,
    treeDensity: 0.35, // charred snags
    fairwayBunkers: 1.2,
    lavaRiver: true, // signature: molten rivers cross the fairway (forced carry)
    greenSize: 0.95, // jagged, broken basalt greens
    greenAspect: 1.9,
    greenIrregular: 1.45,
  },
  {
    id: 'void-garden',
    name: 'Void Garden',
    weight: 14,
    carryMult: 1.4, // near-vacuum, very low gravity
    carryJitter: 0.1, // antigrav pockets
    windBase: 0,
    windWild: 2, // almost no wind in vacuum
    hazardKinds: ['void'],
    greensideKind: 'void',
    scatter: [{ kind: 'crystal', freqPerHole: 1.6, rMin: 6, rMax: 12 }],
    fairwayWidthMult: 0.85,
    doglegBias: 0.45,
    treeDensity: 0, // nothing grows in the void — crystals are the spice
    fairwayBunkers: 0.5,
    lostRough: 'voidrough', // signature: there is no rough — off the fairway is lost to the void
    greenSize: 0.85, // small, angular asteroid greens adrift in the abyss
    greenAspect: 1.7,
    greenIrregular: 1.25,
  },
];

const TOTAL_WEIGHT = BIOMES.reduce((s, b) => s + b.weight, 0);

export function biomeById(id: string): Biome | undefined {
  return BIOMES.find((b) => b.id === id);
}

/** Pick a biome by weight using a [0,1) roll. */
export function pickBiome(roll01: number): Biome {
  let t = roll01 * TOTAL_WEIGHT;
  for (const b of BIOMES) {
    t -= b.weight;
    if (t <= 0) return b;
  }
  return BIOMES[0]!;
}
