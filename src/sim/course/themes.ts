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

export type ThemeKind = 'constellation' | 'deepsky' | 'galaxy';
export type Arc = 1 | 2 | 3;

/**
 * The five biome archetypes a theme can map to. Slice A resolves each to one of the existing
 * biome rows (`archetypeBiome`); the rarity-tiered biome expansion (GS-17b) widens this seam so
 * a legendary inferno reads wilder than a common one — without rewriting this table.
 */
export type BiomeArchetype = 'verdant' | 'desert' | 'frost' | 'inferno' | 'void';

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
};

/** The biome id a theme generates its course from. */
export function archetypeBiome(a: BiomeArchetype): string {
  return ARCHETYPE_BIOME[a];
}

export function themeBiome(t: Theme): string {
  return archetypeBiome(t.archetype);
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
}

const CONSTELLATIONS: readonly ConstRow[] = [
  // --- Arc 1 (≤5 stars): the small, simple figures you cut your teeth on ---
  { id: 'crux', name: 'Crux', abbr: 'Cru', rarity: 'common', stars: 5, archetype: 'verdant', anchor: 'Acrux', blurb: 'The Southern Cross — the navigator’s home beacon, lush and welcoming.' },
  { id: 'triangulum-australe', name: 'Triangulum Australe', abbr: 'TrA', rarity: 'rare', stars: 3, archetype: 'verdant', anchor: 'Atria', blurb: 'A neat green triangle tucked beside the Pointers.' },
  { id: 'grus', name: 'Grus', abbr: 'Gru', rarity: 'rare', stars: 5, archetype: 'frost', anchor: 'Alnair', blurb: 'The Crane wades the frozen shallows of the southern sky.' },
  { id: 'vela', name: 'Vela', abbr: 'Vel', rarity: 'common', stars: 5, archetype: 'desert', anchor: 'Regor', blurb: 'The Sails of Argo, billowing over endless dust.' },
  { id: 'corvus', name: 'Corvus', abbr: 'Crv', rarity: 'rare', stars: 4, archetype: 'frost', anchor: 'Gienah Crv', blurb: 'The thirsty Crow, forever beside water it cannot reach.' },
  { id: 'cygnus', name: 'Cygnus', abbr: 'Cyg', rarity: 'rare', stars: 5, archetype: 'frost', anchor: 'Deneb', blurb: 'The Swan glides the icy Milky Way as the Northern Cross.' },
  { id: 'lyra', name: 'Lyra', abbr: 'Lyr', rarity: 'rare', stars: 5, archetype: 'verdant', anchor: 'Vega', blurb: 'Orpheus’ harp, whose music coaxes the green to grow.' },
  { id: 'tucana', name: 'Tucana', abbr: 'Tuc', rarity: 'rare', stars: 5, archetype: 'verdant', anchor: 'Alpha Tuc', blurb: 'The Toucan, a splash of the tropics among the stars.' },
  { id: 'canis-minor', name: 'Canis Minor', abbr: 'CMi', rarity: 'common', stars: 2, archetype: 'inferno', anchor: 'Procyon', blurb: 'The Lesser Dog, panting through the dog days’ heat.' },

  // --- Arc 2 (6–7 stars): the mid-size figures, the journey hardens ---
  { id: 'canis-major', name: 'Canis Major', abbr: 'CMa', rarity: 'common', stars: 6, archetype: 'inferno', anchor: 'Sirius', blurb: 'The Greater Dog, blazing under Sirius, brightest of all stars.' },
  { id: 'taurus', name: 'Taurus', abbr: 'Tau', rarity: 'common', stars: 7, archetype: 'inferno', anchor: 'Aldebaran', blurb: 'The Bull, horn-tip marked by the wreckage of a supernova.' },
  { id: 'carina', name: 'Carina', abbr: 'Car', rarity: 'common', stars: 7, archetype: 'desert', anchor: 'Canopus', blurb: 'The Keel of Argo, hull dragged across the dunes.' },
  { id: 'aquila', name: 'Aquila', abbr: 'Aql', rarity: 'rare', stars: 7, archetype: 'void', anchor: 'Altair', blurb: 'The Eagle, Zeus’ thunderbolt-bearer, soaring the void.' },
  { id: 'musca', name: 'Musca', abbr: 'Mus', rarity: 'rare', stars: 6, archetype: 'verdant', anchor: 'Alpha Mus', blurb: 'The Fly — the only insect among the constellations.' },
  { id: 'lupus', name: 'Lupus', abbr: 'Lup', rarity: 'rare', stars: 7, archetype: 'verdant', anchor: 'Alpha Lup', blurb: 'The Wolf, a wild beast prowling the green Milky Way.' },
  { id: 'ara', name: 'Ara', abbr: 'Ara', rarity: 'rare', stars: 7, archetype: 'inferno', anchor: 'Beta Ara', blurb: 'The Altar, its rising smoke said to form the Milky Way.' },
  { id: 'phoenix', name: 'Phoenix', abbr: 'Phe', rarity: 'rare', stars: 6, archetype: 'inferno', anchor: 'Ankaa', blurb: 'The firebird, reborn from its own ashes.' },
  { id: 'puppis', name: 'Puppis', abbr: 'Pup', rarity: 'common', stars: 7, archetype: 'desert', anchor: 'Naos', blurb: 'The Stern of Argo, riding high over the waste.' },
  { id: 'columba', name: 'Columba', abbr: 'Col', rarity: 'rare', stars: 6, archetype: 'frost', anchor: 'Phact', blurb: 'The Dove, sent out over the flood waters.' },

  // --- Arc 3 (8+ stars): the grand, sprawling figures of the deep voyage ---
  { id: 'centaurus', name: 'Centaurus', abbr: 'Cen', rarity: 'common', stars: 15, archetype: 'verdant', anchor: 'Rigil Kent', blurb: 'The Centaur, wrapping the Cross, home to our nearest star.' },
  { id: 'orion', name: 'Orion', abbr: 'Ori', rarity: 'common', stars: 9, archetype: 'inferno', anchor: 'Rigel', blurb: 'The Hunter, between blue Rigel and doomed red Betelgeuse.' },
  { id: 'scorpius', name: 'Scorpius', abbr: 'Sco', rarity: 'common', stars: 14, archetype: 'inferno', anchor: 'Antares', blurb: 'The Scorpion, its red heart Antares, rival of Mars.' },
  { id: 'sagittarius', name: 'Sagittarius', abbr: 'Sgr', rarity: 'common', stars: 17, archetype: 'void', anchor: 'Kaus Australis', blurb: 'The Archer, aimed at the black hole at the galaxy’s heart.' },
  { id: 'leo', name: 'Leo', abbr: 'Leo', rarity: 'common', stars: 9, archetype: 'desert', anchor: 'Regulus', blurb: 'The Lion of the savannah, the little king on the ecliptic.' },
  { id: 'gemini', name: 'Gemini', abbr: 'Gem', rarity: 'common', stars: 10, archetype: 'frost', anchor: 'Pollux', blurb: 'The Twins, frozen side by side, guardians of sailors.' },
  { id: 'virgo', name: 'Virgo', abbr: 'Vir', rarity: 'rare', stars: 9, archetype: 'verdant', anchor: 'Spica', blurb: 'The Maiden of the harvest, holding a sky full of galaxies.' },
  { id: 'pegasus', name: 'Pegasus', abbr: 'Peg', rarity: 'common', stars: 8, archetype: 'void', anchor: 'Alpheratz', blurb: 'The Winged Horse, the Great Square soaring the void.' },
  { id: 'capricornus', name: 'Capricornus', abbr: 'Cap', rarity: 'rare', stars: 8, archetype: 'frost', anchor: 'Deneb Algedi', blurb: 'The Sea-Goat, half-frozen in the cold deep.' },
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
  /** Pin to a specific arc (galaxies); otherwise derived from rarity. */
  arc?: Arc;
}

const FEATURES: readonly FeatureRow[] = [
  // Rare → arc 2 showpieces
  { id: 'jewel-box', name: 'Jewel Box Cluster', kind: 'deepsky', rarity: 'rare', archetype: 'frost', anchor: 'Kappa Crucis', blurb: 'A glittering casket of blue-white and ruby suns.' },
  { id: '47-tucanae', name: '47 Tucanae', kind: 'deepsky', rarity: 'rare', archetype: 'void', anchor: 'NGC 104', blurb: 'A million stars packed into one ancient globular ball.' },
  { id: 'pleiades', name: 'The Pleiades', kind: 'deepsky', rarity: 'rare', archetype: 'frost', anchor: 'Alcyone', blurb: 'The Seven Sisters, a cold blue knot of young stars.' },
  { id: 'coalsack', name: 'The Coalsack', kind: 'deepsky', rarity: 'rare', archetype: 'void', anchor: 'Coalsack Nebula', blurb: 'A void within the void — a dark nebula beside the Cross.' },
  { id: 'lagoon-nebula', name: 'Lagoon Nebula', kind: 'deepsky', rarity: 'rare', archetype: 'inferno', anchor: 'M8', blurb: 'A glowing furnace of star-birth in Sagittarius.' },
  { id: 'ptolemy-cluster', name: 'Ptolemy Cluster', kind: 'deepsky', rarity: 'rare', archetype: 'verdant', anchor: 'M7', blurb: 'A bright open scatter charted since antiquity.' },
  { id: 'southern-pleiades', name: 'Southern Pleiades', kind: 'deepsky', rarity: 'rare', archetype: 'frost', anchor: 'Theta Carinae', blurb: 'A cool sparkling cluster around Theta Carinae.' },
  { id: 'wishing-well', name: 'Wishing Well Cluster', kind: 'deepsky', rarity: 'rare', archetype: 'frost', anchor: 'NGC 3532', blurb: 'Scattered silver coins glimpsed at the bottom of a well.' },

  // Epic → arc 3 showpieces
  { id: 'eta-carinae', name: 'Eta Carinae Nebula', kind: 'deepsky', rarity: 'epic', archetype: 'inferno', anchor: 'Eta Carinae', blurb: 'A vast roiling nebula around a star poised to detonate.' },
  { id: 'omega-centauri', name: 'Omega Centauri', kind: 'deepsky', rarity: 'epic', archetype: 'void', anchor: 'NGC 5139', blurb: 'The grandest globular — ten million suns in one swarm.' },
  { id: 'tarantula-nebula', name: 'Tarantula Nebula', kind: 'deepsky', rarity: 'epic', archetype: 'inferno', anchor: '30 Doradus', blurb: 'A monstrous starburst blazing in a neighbour galaxy.' },
  { id: 'orion-nebula', name: 'Orion Nebula', kind: 'deepsky', rarity: 'epic', archetype: 'void', anchor: 'M42', blurb: 'A stellar nursery glowing in the Hunter’s sword.' },
  { id: 'centaurus-a', name: 'Centaurus A', kind: 'deepsky', rarity: 'epic', archetype: 'void', anchor: 'NGC 5128', blurb: 'A galaxy split by a dark dust lane, devouring another.' },
  { id: 'sculptor-galaxy', name: 'Sculptor Galaxy', kind: 'deepsky', rarity: 'epic', archetype: 'desert', anchor: 'NGC 253', blurb: 'A dusty starburst galaxy, the Sculptor’s grand work.' },
  { id: 'southern-pinwheel', name: 'Southern Pinwheel', kind: 'deepsky', rarity: 'epic', archetype: 'void', anchor: 'M83', blurb: 'A face-on spiral, arms wound tight with new stars.' },
  { id: 'helix-nebula', name: 'Helix Nebula', kind: 'deepsky', rarity: 'epic', archetype: 'void', anchor: 'NGC 7293', blurb: 'The Eye of God — a dying star’s exhaled shell.' },
  { id: 'sombrero-galaxy', name: 'Sombrero Galaxy', kind: 'deepsky', rarity: 'epic', archetype: 'desert', anchor: 'M104', blurb: 'A brilliant bulge ringed by a broad dark brim.' },

  // The two naked-eye galaxies — pinned to arc 3 as late-game grandeur
  { id: 'milky-way-core', name: 'Milky Way Core', kind: 'galaxy', rarity: 'epic', archetype: 'void', anchor: 'Galactic Centre', blurb: 'The blazing heart of our own galaxy, in Sagittarius.', arc: 3 },
  { id: 'magellanic-clouds', name: 'Magellanic Clouds', kind: 'galaxy', rarity: 'epic', archetype: 'void', anchor: 'LMC / SMC', blurb: 'Two dwarf galaxies circling the south celestial pole.', arc: 3 },
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
  const total = pool.reduce((s, t) => s + RARITY_C[t.rarity].weight, 0);
  let r = rng.float() * total;
  for (let i = 0; i < pool.length - 1; i++) {
    r -= RARITY_C[pool[i]!.rarity].weight;
    if (r <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
}

/** Convenience: the theme a run's current stop flies into, from its distance. */
export function themeForStop(seed: number | string, stopIndex: number, distanceFromStart: number): Theme {
  const rng = new Rng(`${seed}:theme:${stopIndex}`);
  return pickTheme(rng, arcForDistance(distanceFromStart));
}
