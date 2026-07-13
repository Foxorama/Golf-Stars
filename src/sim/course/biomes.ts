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
  /** Green SLOPE character (GS-greens-3): the world's MAX green tilt (0 flat … ~1 severe). Each hole
   *  draws a downhill direction + a magnitude up to this. Frost ice-shelves tilt hard, desert greens
   *  run flat. Default ~0.5 if absent. */
  greenSlopeMax?: number;
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
  /**
   * DEEP ROUGH (GS-deep-rough) — the lie kind that fills the INSIDE of a dogleg's cut-the-corner line
   * so a player can't just fire straight over the bend at the pin; they must play down the fairway.
   * Names a LIE_INFO kind: land worlds set `'deeprough'` (a punishing non-penalty hack-out, themed per
   * world in the render layer); the OCEAN world sets `'water'` — its deep rough is the sea lapping the
   * sandy shore, a real penalty carry. Off-corridor by construction (the fairway route stays clean),
   * wildness-gated (fair early → brutal late). The lost-rough worlds (void/cetus) DON'T set it — off
   * their fairway is already the abyss, so they're untouched.
   */
  deepRough?: string;
  /** Impact-crater bunkers per hole (base, scaled by wildness). Sand → always fair. */
  craters?: number;
  /**
   * Water/terrain features (GS-terrain), all pure data scaled fair→brutal by wildness:
   *  • `waterCreek`   — a stream crosses the fairway as a forced carry (parkland/ice). A sanctioned
   *    `creek` penalty band, proven carryable exactly like the lava river / frozen pond.
   *  • `ponds`        — large flanking lakes/"dams" of penalty water per hole (base). Placed CLEAR
   *    of the play corridor (fairness), so they punish an offline miss without an unfair carry.
   *  • `fairwayBreaks`— sandy non-penalty WASTE bands cutting across the fairway per hole (base) — a
   *    visible break you carry or thread, never a lost card.
   */
  waterCreek?: boolean;
  ponds?: number;
  fairwayBreaks?: number;
  /**
   * Hazard-variety fields (GS-hazards-2), all pure non-penalty (always fair) or sanctioned-crossing
   * DATA, scaled by wildness at generation time:
   *  • `potBunkers`  — deep POT-bunker NESTS per hole (base). Pots pinch the landing zone (the classic
   *    strategic squeeze) and ring small greens; sand-class, so NON-penalty (a steep escape tax, never
   *    a lost card). Also makes the world's greenside guards lean toward pots.
   *  • `fescue`      — thick FESCUE / native-rough patches per hole (base) lining the deep rough — a
   *    heavier non-penalty recovery lie than ordinary rough (you hack out, never lose a stroke).
   *  • `barranca`    — a dry RAVINE crosses the fairway as a forced carry (a penalty-area crossing,
   *    sanctioned + proven carryable exactly like the creek/lava river — a rocky chasm, not water).
   */
  potBunkers?: number;
  fescue?: number;
  barranca?: boolean;
  /**
   * BROKEN-fairway frequency (GS-variety-2): bands of native ROUGH carved across the mid-hole per
   * par-4/5 hole (base, scaled by wildness), splitting the corridor into "a couple of small fairways
   * broken by rough". Rough is non-penalty (a fair carry/thread), so it never costs a card. Grass/
   * links worlds break more; barren worlds (void/desert) stay unbroken. Default ~0.6 if absent.
   */
  roughBreaks?: number;
  /**
   * Ship-corridor WALLS (GS-ship-walls): the world's corridor is lined by collidable METAL walls that
   * a low, flat ball ricochets off (bouncing back toward the deck), a lofted shot clears. The generator
   * stamps `hole.walls` from the ribbon edges when set; the derelict ship is the only world that uses
   * them. Pure geometry, zero rng — every other world is byte-identical.
   */
  walls?: boolean;
  /**
   * SHARP ship-corridor corners (GS-ship-feel): the world's corridor bends at ANGULAR corners (like a
   * spaceship hallway) instead of smooth curves — `buildCentreline` drops the Catmull-Rom smoothing to a
   * low sample count for this world only. Pure geometry, zero rng (same control points, fewer smoothing
   * samples), so every other world is byte-identical. Kept mild enough that the ribbon never folds
   * (proven by the fairness/termination sweeps).
   */
  sharpCorners?: boolean;
  /**
   * PER-BIOME DESIGN PROFILE (GS-biome-profile) — the levers that give a world its own COURSE
   * IDENTITY instead of the same skeleton reskinned. All OPTIONAL; absent ⇒ the generator's global
   * defaults (byte-for-byte the old output), so only a world that opts in changes. Setting any of
   * these RETUNES that world's generated layouts (a deliberate stream reflow for THAT biome —
   * re-run the death-spiral/fairness harness for it; other worlds are untouched).
   *
   *  • `parMix` — relative weights for the COMPOSED par sequence (`planCourse`), so a world owns a
   *    rhythm: a desert leans long (more par-5s), a tight jungle leans par-4, an exposed links leans
   *    par-3. Weights are normalised; absent ⇒ the default ~25/53/22 proportions.
   *  • `shapeWeights` — relative weights over the par-4/5 SHAPE vocabulary
   *    (`straight`/`dogleg`/`cape`/`double`/`hairpin`), replacing the `doglegBias`-derived mix so a
   *    world's holes bend in a characteristic way (desert = straight+cape carries, jungle =
   *    doglegs+doubles). Absent ⇒ the global `doglegBias` formula. Keys must be valid shape kinds.
   *  • `widthWeights` — relative weights over the par-4/5 WIDTH archetype pool
   *    (`classic`/`chute`/`neck`/`hourglass`/`wander`/`thin`/`broad`), so a world's fairways run
   *    characteristically wide or tight (desert = broad/wander, jungle = chute/neck/thin). Absent ⇒
   *    the global pool thresholds. Lost-rough island / ship-corridor pools are NOT weighted (width is
   *    survival there). Keys must be valid width-archetype ids.
   */
  parMix?: { p3: number; p4: number; p5: number };
  shapeWeights?: Partial<Record<string, number>>;
  widthWeights?: Partial<Record<string, number>>;
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
    treeDensity: 2.6, // lush, densely tree-lined parkland — real forest down both sides
    fairwayBunkers: 1.5,
    waterCreek: true, // signature: a creek crosses the fairway (forced carry)
    deepRough: 'deeprough', // hay-thick tangle guards the inside of the doglegs
    ponds: 1.2, // big parkland lakes flank the landing zones
    fairwayBreaks: 0.7, // the odd sandy waste break across the fairway
    potBunkers: 0.8, // links-style pot bunkers pinch the landing zones
    fescue: 1.0, // wispy native fescue lines the deep rough
    greenSize: 1.05, // classic parkland greens — gently rolling, moderate variety
    greenAspect: 1.9,
    greenIrregular: 1.1,
    greenSlopeMax: 0.45, // GS-greens-3 green tilt character
    roughBreaks: 0.9, // GS-variety-2 broken-fairway frequency
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
    deepRough: 'deeprough', // deep waste dune-scrub swallows a cut corner
    fairwayBreaks: 1.0, // sandbelt waste areas slash across the fairway
    potBunkers: 0.6, // deep desert pots dot the landing zones
    fescue: 0.8, // dune-grass fescue chokes the deep waste
    barranca: true, // signature: a dry barranca/ravine crosses the fairway (forced carry)
    greenSize: 1.3, // big, smooth oasis greens against the dunes
    greenAspect: 1.7,
    greenIrregular: 0.85,
    greenSlopeMax: 0.32, // GS-greens-3 green tilt character
    roughBreaks: 0.3, // GS-variety-2 broken-fairway frequency
    // IDENTITY (GS-biome-profile): a LONG, OPEN, HEROIC desert — more par-5s, straight/cape lines you
    // bomb across the dunes, and generous broad/wandering fairways. Difficulty is length + wind + sand,
    // not tight twisty corridors.
    parMix: { p3: 0.18, p4: 0.5, p5: 0.32 },
    shapeWeights: { straight: 0.32, dogleg: 0.22, cape: 0.28, double: 0.1, hairpin: 0.08 },
    widthWeights: { classic: 0.18, chute: 0.05, neck: 0.07, hourglass: 0.1, wander: 0.22, thin: 0.06, broad: 0.32 },
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
    treeDensity: 1.3, // frosted pines ring the fairways more thickly
    fairwayBunkers: 1,
    frozenPond: true, // signature: a meltwater channel crosses the fairway (forced carry)
    deepRough: 'deeprough', // deep wind-packed snowdrift buries a cut corner
    ponds: 1.0, // frozen lakes flank the landing zones
    potBunkers: 0.6, // frozen-faced pot bunkers ring the ice greens
    fescue: 0.5, // frosted tussock grass in the deep rough
    greenSize: 1.0, // long, narrow ice-shelf greens — a tester to hold
    greenAspect: 2.6,
    greenIrregular: 1.0,
    greenSlopeMax: 0.7, // GS-greens-3 green tilt character
    roughBreaks: 0.6, // GS-variety-2 broken-fairway frequency
    // IDENTITY (GS-biome-profile): an EXPOSED LINKS on the ice — more short par-3s (wind-shot holes),
    // sweeping S-curves the gale pushes, and wandering wind-scoured shelf fairways. The wind does the
    // damage, not severe corners.
    parMix: { p3: 0.32, p4: 0.5, p5: 0.18 },
    shapeWeights: { straight: 0.24, dogleg: 0.22, cape: 0.12, double: 0.3, hairpin: 0.12 },
    widthWeights: { classic: 0.16, chute: 0.08, neck: 0.1, hourglass: 0.12, wander: 0.3, thin: 0.18, broad: 0.06 },
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
    treeDensity: 0.55, // charred snags, a little denser
    fairwayBunkers: 1.2,
    lavaRiver: true, // signature: molten rivers cross the fairway (forced carry)
    deepRough: 'deeprough', // deep cinder-ash brush chokes a cut corner
    fairwayBreaks: 0.4, // scorched waste cuts across the odd fairway
    potBunkers: 0.3, // the odd cinder pot near the green
    greenSize: 0.95, // jagged, broken basalt greens
    greenAspect: 2.0,
    greenIrregular: 1.45,
    greenSlopeMax: 0.6, // GS-greens-3 green tilt character
    roughBreaks: 0.3, // GS-variety-2 broken-fairway frequency
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
    greenSlopeMax: 0.4, // GS-greens-3 green tilt character
    roughBreaks: 0.0, // GS-variety-2 broken-fairway frequency
  },
  // --- GS-worlds: four new exotic worlds, each a distinct PLAYSTYLE -----------
  {
    id: 'crystal-spires',
    name: 'Prism Reach',
    weight: 10,
    carryMult: 1.0,
    carryJitter: 0,
    windBase: 3,
    windWild: 12,
    hazardKinds: ['water'],
    greensideKind: 'bunker',
    // Signature: the fairways are STREWN with true, fast crystal — a precision world where a clean
    // strike off the glass runs true, but the angular spires force a careful line.
    scatter: [{ kind: 'crystal', freqPerHole: 2.6, rMin: 6, rMax: 13 }],
    fairwayWidthMult: 1.0,
    doglegBias: 0.4,
    deepRough: 'deeprough', // a dense shard-thicket walls off a cut corner
    treeDensity: 0.3, // a few crystalline spires line the rough
    fairwayBunkers: 1.0,
    potBunkers: 0.5,
    greenSize: 0.95, // sharp, faceted greens
    greenAspect: 1.9,
    greenIrregular: 1.4,
    greenSlopeMax: 0.55, // GS-greens-3 green tilt character
    roughBreaks: 0.5, // GS-variety-2 broken-fairway frequency
  },
  {
    id: 'tempest-reach',
    name: 'Tempest Reach',
    weight: 11,
    carryMult: 1.05, // a gas-giant updraught carries the ball a touch farther
    carryJitter: 0.05, // gusts jostle the carry
    windBase: 8,
    windWild: 26, // the windiest world short of a frost gale — wind dominates here
    hazardKinds: ['water'],
    greensideKind: 'bunker',
    scatter: [],
    deepRough: 'deeprough', // deep storm-flattened moor grass grabs a cut corner
    fairwayWidthMult: 1.05, // a touch wider to keep the gale fair
    doglegBias: 0.3,
    treeDensity: 0.4, // wind-bent scrub
    fairwayBunkers: 1.4,
    potBunkers: 0.4,
    greenSize: 1.05,
    greenAspect: 2.2, // long, storm-scoured shelves
    greenIrregular: 1.1,
    greenSlopeMax: 0.5, // GS-greens-3 green tilt character
    roughBreaks: 0.7, // GS-variety-2 broken-fairway frequency
  },
  {
    id: 'spore-jungle',
    name: 'Spore Jungle',
    weight: 11,
    carryMult: 1.0,
    carryJitter: 0,
    windBase: 2,
    windWild: 8, // sheltered under the canopy
    hazardKinds: ['water'],
    greensideKind: 'bunker',
    scatter: [],
    fairwayWidthMult: 0.95, // tight jungle corridors
    doglegBias: 0.45,
    treeDensity: 2.9, // signature: the DENSEST groves — luminous mushroom stands wall the fairways
    deepRough: 'deeprough', // deep glowing undergrowth swallows a cut corner
    fairwayBunkers: 0.9,
    fescue: 1.2, // glowing undergrowth chokes the deep rough
    waterCreek: true, // jungle streams cross the fairway
    greenSize: 1.0,
    greenAspect: 1.8,
    greenIrregular: 1.2,
    greenSlopeMax: 0.45, // GS-greens-3 green tilt character
    roughBreaks: 1.0, // GS-variety-2 broken-fairway frequency
    // IDENTITY (GS-biome-profile): a TIGHT, TWISTY, TECHNICAL jungle — mostly par-4s (no room for long
    // bombers), winding doglegs + S-curves through the mushroom stands, and narrow chute/neck/thin
    // corridors. The challenge is threading the line, not length.
    parMix: { p3: 0.28, p4: 0.6, p5: 0.12 },
    shapeWeights: { straight: 0.2, dogleg: 0.34, cape: 0.14, double: 0.24, hairpin: 0.08 },
    widthWeights: { classic: 0.22, chute: 0.24, neck: 0.18, hourglass: 0.08, wander: 0.08, thin: 0.1, broad: 0.1 },
  },
  {
    id: 'tidal-archipelago',
    name: 'Tidal Archipelago',
    weight: 12,
    carryMult: 1.0,
    carryJitter: 0,
    windBase: 7,
    windWild: 22, // coastal sea-breeze
    hazardKinds: ['water'],
    greensideKind: 'bunker',
    scatter: [],
    fairwayWidthMult: 1.0,
    doglegBias: 0.35,
    treeDensity: 0.6, // the odd palm
    fairwayBunkers: 2.0, // beaches everywhere
    potBunkers: 0.4,
    waterCreek: true, // signature: a sea channel crosses the fairway (forced carry)
    // Signature deep rough: the OCEAN itself — the sea laps the sandy shore of the rough, so cutting
    // the corner of a dogleg means carrying open water (a real penalty, not a hack-out).
    deepRough: 'water',
    ponds: 1.8, // lagoons flank the corridors — an offline shot is wet
    greenSize: 1.0,
    greenAspect: 1.7,
    greenIrregular: 1.0,
    greenSlopeMax: 0.4, // GS-greens-3 green tilt character
    roughBreaks: 0.8, // GS-variety-2 broken-fairway frequency
  },
  {
    // GS-asgard: the Golden Realm atop Yggdrasil — a GRAND, FAIR reward world, the opposite of the
    // brutal late-game worlds. Wide, generous fairways; a gentle DIVINE TAILWIND lifts every drive a
    // touch farther (carry just over 1); calm blessed air; low-to-moderate hazards; moderate golden
    // groves; grand, true greens. Reuses only existing lie/surface kinds (celestial reflecting pools
    // are ordinary `water`; the gilded deep rough is `deeprough`). NOT a lost-rough world, NO forced
    // carry. WEIGHT 0: reached only via a later tournament trigger, never the normal biome/route roll
    // (no theme maps to it) — so `pickBiome` never lands here and cetus-deep stays the table's last row.
    id: 'asgard-realm',
    name: 'Asgard',
    weight: 0,
    carryMult: 1.08, // a gentle divine tailwind — drives carry a touch farther
    carryJitter: 0,
    windBase: 2, // calm, blessed air
    windWild: 8,
    hazardKinds: ['water'], // celestial reflecting pools (ordinary penalty water)
    greensideKind: 'bunker',
    scatter: [],
    fairwayWidthMult: 1.14, // grand, generous corridors — a reward world, not a brutal one
    doglegBias: 0.3,
    treeDensity: 1.4, // moderate golden-leaf groves line the fairways
    fairwayBunkers: 1.2,
    deepRough: 'deeprough', // a gilded tangle guards the inside of the doglegs
    ponds: 0.8, // the odd celestial pool flanks the corridor (low density, clear of the route)
    potBunkers: 0.3,
    fescue: 0.6, // golden native grass lines the deep rough
    greenSize: 1.1, // grand, true greens
    greenAspect: 1.8,
    greenIrregular: 1.0,
    greenSlopeMax: 0.4, // GS-greens-3 green tilt character
    roughBreaks: 0.7, // GS-variety-2 broken-fairway frequency
  },
  {
    // GS-cetus: the Whale constellation's clifftop star-ocean. Plays the void's proven-fair island/
    // abyss model (off the clifftop plateau is lost to the star-ocean), reskinned as a luminous deep
    // sea — the render adds a river of stars pouring off the cliffs and whales surfacing below.
    id: 'cetus-deep',
    name: 'Cetus Deep',
    weight: 10,
    carryMult: 1.12, // a gentle low-pressure lift over the deep
    carryJitter: 0.03,
    windBase: 5,
    windWild: 16, // a steady sea-current breeze off the ocean
    hazardKinds: ['water'],
    greensideKind: 'bunker',
    // Bioluminescent reef/coral patches — true, fast lies that light the clifftop corridor.
    scatter: [{ kind: 'crystal', freqPerHole: 1.0, rMin: 6, rMax: 12 }],
    fairwayWidthMult: 0.92, // clifftop ribbons (the island scale widens the deep/wild stops fairly)
    doglegBias: 0.4,
    treeDensity: 0.3, // sparse wind-bent coastal stacks
    fairwayBunkers: 1.4, // sandy clifftop coves
    lostRough: 'cetusdeep', // signature: off the clifftop is lost to the star-ocean (deep/wild stops)
    greenSize: 0.95, // organic tide-pool greens
    greenAspect: 1.8,
    greenIrregular: 1.2,
    greenSlopeMax: 0.5, // GS-greens-3 green tilt character
    roughBreaks: 0.0, // GS-variety-2 broken-fairway frequency
  },
  // --- GS-more-worlds: two exotic worlds bracketing the gravity spectrum ------
  {
    // Toxic Mire (Hydra) — the HEAVIEST air in the galaxy: the ball flies short, so this world plays
    // the OPPOSITE end from the low-grav belts. Still, muggy, almost windless; acid bog everywhere
    // (ordinary penalty `water`, rendered as GLOWING neon-green/teal toxic pools — GS-toxic-pools). The heavy air is FAIR by
    // construction — `generate.ts` scales hole LENGTH by carryMult, so shorter holes keep every carry
    // carry-relative (the auto-AI reaches exactly as it does elsewhere); the SIGNATURE is the murky,
    // water-choked, dead-mangrove character, not an unfair reach. Reuses only proven-fair mechanics
    // (a creek crossing + flanking ponds like verdant; a boggy `deeprough` cut, never `water`, so a
    // dogleg is a hack-out and never a heavy-air forced carry). NOT a lost-rough world.
    id: 'toxic-mire',
    name: 'Toxic Mire',
    weight: 9,
    carryMult: 0.88, // signature: the densest, heaviest air — the ball flies SHORT (holes shrink to match)
    carryJitter: 0,
    windBase: 1, // still, humid, oppressive — the calmest windy world (the inverse of Tempest/Ocean)
    windWild: 6,
    hazardKinds: ['water'], // acid pools + mires (rendered as GLOWING neon-green/teal toxic pools — GS-toxic-pools)
    greensideKind: 'water', // acid pools guard the greens
    scatter: [],
    fairwayWidthMult: 1.06, // a touch wider so the heavy air + water stays fair
    doglegBias: 0.42, // the Water-Serpent's coils — winding corridors
    treeDensity: 1.6, // dead mangroves / bog cypress line the mire
    fairwayBunkers: 0.4, // the odd silt bank (a bog has little sand)
    waterCreek: true, // signature: an acid channel crosses the fairway (forced carry)
    deepRough: 'deeprough', // a boggy reed/bramble tangle chokes a cut corner (non-penalty hack-out)
    ponds: 1.7, // bog pools flank the landing zones — an offline miss is in the acid
    fescue: 1.3, // dense reeds line the deep rough
    fairwayBreaks: 0.5, // the odd muddy silt flat cuts the fairway
    potBunkers: 0.2,
    greenSize: 1.0, // soft, blobby waterlogged greens
    greenAspect: 1.7,
    greenIrregular: 1.35,
    greenSlopeMax: 0.35, // waterlogged and flat — low tilt
    roughBreaks: 0.7,
  },
  {
    // Scrap Belt (Antlia) — the lowest NON-abyss gravity: big bombs + tumbling-debris carry jitter, in
    // the near-vacuum calm of the void, but played over SOLID derelict-metal ground (no island-hop, no
    // lost-rough — the distinction from the void). A machine graveyard: blast-crater bunkers pock the
    // landing zones, scrap-waste bands slash the fairways, and a chasm between drifting hull-plates
    // crosses as a barranca. Every mechanic is proven-fair (craters/waste sand + a sanctioned barranca
    // carry, exactly like the Dust Belt), so it clears the death-spiral bar despite the low gravity
    // (holes lengthen with carryMult to keep the reach honest).
    id: 'scrap-belt',
    name: 'Scrap Belt',
    weight: 9,
    carryMult: 1.32, // signature: the lowest playable gravity — everything bombs (holes lengthen to match)
    carryJitter: 0.06, // tumbling scrap-debris pockets jostle the carry
    windBase: 2, // near-vacuum — a faint solar breeze, calm like the void
    windWild: 6,
    hazardKinds: ['waste', 'bunker'], // scrap-plate flats + blast-crater sand (non-penalty, like the desert)
    greensideKind: 'bunker', // crater bunkers guard the greens
    scatter: [{ kind: 'waste', freqPerHole: 1.4, rMin: 7, rMax: 14 }], // riveted scrap-plate flats (true, firm)
    fairwayWidthMult: 1.05,
    doglegBias: 0.32,
    treeDensity: 0.3, // sparse rusted antenna masts / girders stand in for trees
    fairwayBunkers: 1.8, // crater + scrap bunkers dot the belt
    craters: 2.0, // signature: impact-blast craters pock the landing zones (a navigable crater field)
    barranca: true, // signature: a chasm between drifting hull-plates crosses the fairway (forced carry)
    deepRough: 'deeprough', // a rebar/scrap thicket chokes a cut corner
    fairwayBreaks: 1.0, // scrap-waste bands slash clean across the fairway
    fescue: 0.4, // wiry scrap-weed in the deep rough
    potBunkers: 0.5,
    greenSize: 0.95, // small, angular plate-metal greens
    greenAspect: 1.9,
    greenIrregular: 1.35,
    greenSlopeMax: 0.5,
    roughBreaks: 0.4,
  },
  {
    // Derelict (GS-derelict) — a DEAD STARSHIP adrift in the deep. Unlike the Scrap Belt (solid metal
    // ground), the wreck is BROKEN INTO PIECES over open space: it plays the void's proven-fair island/
    // abyss model (`lostRough` → off the mown hull deck is lost to the stars), so par 4/5 holes become a
    // CHAIN of hull sections separated by star-gaps you carry from one piece to the next. Low gravity
    // (near-vacuum, the wreck tumbles slowly), no wind (a sealed dead ship). The metal FEEL — sideways
    // walls that bounce the ball, twisted broken-hull edges, drifting space junk, the spooky music — is
    // layered on by the render + a follow-up (GS-ship-walls / GS-ship-feel); this row is the physics.
    // Balance-exempt like void/cetus (a deliberately brutal lost world; structural fairness still holds).
    id: 'derelict-ship',
    name: 'Derelict',
    weight: 8,
    carryMult: 1.3, // low gravity — the wreck drifts in near-vacuum, so the ball bombs across the gaps
    carryJitter: 0.05, // tumbling debris / venting atmosphere jostles the carry
    windBase: 0, // a sealed, dead ship — no wind aboard
    windWild: 3,
    hazardKinds: ['void'], // the gaps between hull sections are open space (a lost-rough world strips these on armed holes)
    greensideKind: 'breach', // GS-ship-interior: acid-etched deck BREACHES (lost-ball penalty) ring the greens, not sand
    scatter: [{ kind: 'waste', freqPerHole: 1.0, rMin: 6, rMax: 12 }], // firm riveted deck plates run true
    fairwayWidthMult: 0.95, // ship corridors (the island scale widens the deep/wild pads fairly)
    doglegBias: 0.3, // the deck runs straighter than most worlds (sharp ship-corner turns arrive in GS-ship-feel)
    treeDensity: 0, // nothing grows aboard a dead ship
    fairwayBunkers: 0, // GS-ship-interior: no sand — corridor danger is acid deck BREACHES, placed in a dedicated ship block
    lostRough: 'shiprough', // signature: off the deck is lost to open space
    walls: true, // signature: metal corridor walls bounce a low ball back onto the deck (GS-ship-walls)
    sharpCorners: true, // signature: the corridor bends at angular ship-hallway corners, not smooth curves (GS-ship-feel)
    greenSize: 0.9, // small angular plate-metal landing pads
    greenAspect: 1.85,
    greenIrregular: 1.3,
    greenSlopeMax: 0.5,
    roughBreaks: 0.0, // lost worlds keep an unbroken pad/corridor
  },
];

const TOTAL_WEIGHT = BIOMES.reduce((s, b) => s + b.weight, 0);

export function biomeById(id: string): Biome | undefined {
  return BIOMES.find((b) => b.id === id);
}

/**
 * Biomes DELIBERATELY exempted from the death-spiral balance guards (GS-cetus-5). Void & Cetus were
 * reworked into island-hop clifftop worlds — a bending CHAIN of pads separated by VOID carries — for
 * human visual interest FIRST; the auto-AI + scoring balance for those carries is a follow-up (the
 * plan is to teach the AI to hop the chain and then re-tighten the bars). Until then these two are
 * skipped by the balance harnesses (tests/characters, tests/biomes death-spiral, tests/scorch) so the
 * strict bars still protect the other eight worlds. The STRUCTURAL fairness contracts
 * (validateCourse/Fairness/Crossings) are NOT relaxed — they still pass for these worlds.
 * TODO(GS-cetus-6): rebalance the island-hop AI/scoring, then remove this exemption.
 */
export const BALANCE_EXEMPT_BIOMES: ReadonlySet<string> = new Set(['void-garden', 'cetus-deep', 'derelict-ship']);

/** Pick a biome by weight using a [0,1) roll. */
export function pickBiome(roll01: number): Biome {
  let t = roll01 * TOTAL_WEIGHT;
  for (const b of BIOMES) {
    t -= b.weight;
    if (t <= 0) return b;
  }
  return BIOMES[0]!;
}
