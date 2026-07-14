/**
 * STATIC COURSE SPECS + REGENERATION (GS-static-courses).
 *
 * This module is the GENERATION half of the static-course library: the catalogue of pinned specs and
 * the pure function that (re)builds a course from a spec through `generateCourse`. It imports NO frozen
 * data — so the regeneration script (`scripts/gen-static-courses.mjs`) can load it and (re)produce the
 * frozen JSON without a chicken-and-egg import cycle, and so a course can always be rebuilt from source
 * for a seasonal redesign or a rebalance.
 *
 * The PLAYABLE half (`staticCourses.ts`) loads the frozen JSON by default and re-exports everything
 * here, so callers still import from one place.
 */

import { generateCourse, type GenerateOptions } from './generate';
import type { Course } from './contract';
import type { BiomeArchetype } from './themes';

/** Difficulty tier of a Star Tour course — a label the star map + scorecard read (not a generation
 *  input; the geometry difficulty rides `opts.wildness`). */
export type StaticCourseTier = 'gentle' | 'testing' | 'brutal';

/** A named, fixed course: a pinned seed + generation options → the same full round every play. */
export interface StaticCourseSpec {
  /** Stable id (never reused) — how a mode / test / the frozen file asks for this course. */
  id: string;
  /** Human-facing course name (shown on the intro / scorecard). */
  name: string;
  /** The pinned generation seed — the whole course is a pure function of this + `opts` + version. */
  seed: string;
  /** Generation options. `holes` + `biome` are the identity; `compose` gives a designed routing. */
  opts: GenerateOptions;
  /** The constellation/theme this course sits on (a THEMES id) — keys its J2000 sky position on the
   *  Star Tour star map, its constellation backdrop, and its display flavour. Absent = no star-map
   *  placement (the flagship metal-18 predates this and keeps its frozen opts untouched). */
  themeId?: string;
  /** The world archetype the star map paints this course's planet + glyph from. */
  archetype?: BiomeArchetype;
  /** Difficulty tier label for the star map / scorecard. */
  tier?: StaticCourseTier;
  /** One-line course flavour for the star-map dossier. */
  blurb?: string;
}

/** Id of the flagship metal (Scrap Belt) 18-hole course. */
export const METAL_18_ID = 'metal-18';

/**
 * STAR TOUR HOLE DIFFICULTY (GS-star-tour-difficulty). A real golf course has teeth, and the higher
 * difficulties are what make Story Tour interesting — so every Star Tour course now plays its holes at
 * a MEDIUM-or-HARD wildness, rolled INDEPENDENTLY per hole (`opts.wildnessMix`, consumed by the
 * composer's `planWildnessMix`). A course therefore mixes medium and hard holes and can legitimately
 * come out all-medium or all-hard — fine for this solo records mode, which has no death-spiral survival
 * cut to protect (unlike the Voyage, whose arc + balance are left untouched). `STAR_TOUR_WILDNESS` is
 * the representative course-level value used for `meta.wildness` (the intro/scorecard number); the mix
 * is what actually drives each hole's geometry. `metal-18` is EXCLUDED — it is served from frozen JSON
 * and its opts are frozen, so it keeps its designed mid-wildness routing.
 */
const STAR_TOUR_MEDIUM = 0.6;
const STAR_TOUR_HARD = 0.85;
const STAR_TOUR_MIX: readonly number[] = [STAR_TOUR_MEDIUM, STAR_TOUR_HARD];
const STAR_TOUR_WILDNESS = (STAR_TOUR_MEDIUM + STAR_TOUR_HARD) / 2; // 0.725 — the meta/intro representative

/**
 * THE OLD COURSE AT ST ANDREWS (GS-earth) — the one real-world course, the home planet's destination.
 * Its real par-72 routing, pinned hole-by-hole via `parSequence` (GS-hole-plan) so the layout carries
 * the actual Old-Course rhythm — an out-and-back links of fourteen par-4s bracketing two par-3s (the
 * Short 8th, the High 11th) and two par-5s (the Long 5th, the Long 14th): 36 out, 36 back. Unlike the
 * other Star Tour courses it does NOT use `STAR_TOUR_MIX` — a real course wants the designed difficulty
 * ARC (the composer's mean-preserving build), so the round opens gentle and builds through the famous
 * closing stretch (the Road Hole 17th) at a fair, championship-links `wildness` rather than a random
 * medium/hard scatter.
 */
const ST_ANDREWS_PARS: readonly (3 | 4 | 5)[] = [4, 4, 4, 4, 5, 4, 4, 3, 4, 4, 3, 4, 4, 5, 4, 4, 4, 4]; // par 72 (out 36 / in 36)
const ST_ANDREWS_WILDNESS = 0.5; // a fair championship links — teeth via the arc + pots + wind, not chaos

/**
 * The static course catalogue. Content, not code — a new static course is a new row here (then run
 * `npm run gen:courses` to freeze it).
 *
 * `metal-18` — "Antlia Scrapworks", a full 18-hole round over the METAL world (biome `scrap-belt`,
 * the Scrap Belt archetype: low-gravity bombs, blast-crater bunkers, scrap-waste bands, and a
 * drifting-hull barranca forced carry). Composed to par 71 (front 35 / back 36; 5 par-3s, 9 par-4s,
 * 4 par-5s) with two drivable-par-4 signature holes and a mean-preserving difficulty arc. Mid
 * wildness (0.5) so the Scrap Belt's character reads without tipping into the deep-game brutality —
 * a course you can play again and again.
 */
export const STATIC_COURSES: readonly StaticCourseSpec[] = [
  {
    id: METAL_18_ID,
    name: 'Antlia Scrapworks',
    seed: 'gs-static:metal-18',
    // NOTE: opts is FROZEN — metal-18 has a frozen JSON generated from exactly these opts, so it must
    // never change (no themeId injected here or the frozen file drifts). The star-map metadata lives on
    // the spec fields below, which don't feed generation.
    opts: { biome: 'scrap-belt', holes: 18, compose: true, wildness: 0.5 },
    themeId: 'antlia',
    archetype: 'metal',
    tier: 'testing',
    blurb: 'A full round over the low-gravity scrap belt — bomb it off the derelict-metal graveyard.',
  },
  // --- Star Tour courses (GS-star-tour): one designed 18-hole round per world, populating the star
  // map. Each is content-as-data — a pinned seed + biome + a wildness that sets its difficulty tier.
  // They are NOT frozen (no JSON file), so `buildStaticCourse` regenerates them on demand through the
  // live generator (lean bundle; deterministic per GENERATOR_VERSION). `themeId` sets both the render
  // backdrop and the star-map placement. Validated in tests/static-courses.test.ts (every row must
  // regenerate to a fair, contract-valid course).
  {
    id: 'verdant-18', name: 'Lyra Meadows', seed: 'gs-static:verdant-18',
    opts: { biome: 'verdant-station', themeId: 'lyra', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'lyra', archetype: 'verdant', tier: 'gentle',
    blurb: "Orpheus' harp coaxes the green to grow — wide, welcoming parkland to learn your swing on.",
  },
  {
    id: 'desert-18', name: 'Vela Dunes', seed: 'gs-static:desert-18',
    opts: { biome: 'dust-belt', themeId: 'vela', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'vela', archetype: 'desert', tier: 'testing',
    blurb: 'The Sails of Argo billow over endless dust — long, open, and forever into the wind.',
  },
  {
    id: 'frost-18', name: 'Cygnus Links', seed: 'gs-static:frost-18',
    opts: { biome: 'ice-ring', themeId: 'cygnus', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'cygnus', archetype: 'frost', tier: 'testing',
    blurb: 'The Swan glides the icy Milky Way — exposed links golf where the crosswind never rests.',
  },
  {
    id: 'inferno-18', name: 'Orion Forge', seed: 'gs-static:inferno-18',
    opts: { biome: 'ember-world', themeId: 'orion', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'orion', archetype: 'inferno', tier: 'testing',
    blurb: 'The Hunter between blue Rigel and doomed Betelgeuse — molten doglegs and blast-crater sand.',
  },
  {
    id: 'crystal-18', name: 'Coronae Prism', seed: 'gs-static:crystal-18',
    opts: { biome: 'crystal-spires', themeId: 'corona-borealis', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'corona-borealis', archetype: 'crystal', tier: 'testing',
    blurb: 'The Northern Crown, a jewelled arc — true, fast crystal lies that reward pure precision.',
  },
  {
    id: 'tempest-18', name: 'Draco Gale', seed: 'gs-static:tempest-18',
    opts: { biome: 'tempest-reach', themeId: 'draco', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'draco', archetype: 'tempest', tier: 'brutal',
    blurb: 'The Dragon coiled in the eye of the storm — the wildest crosswinds in the galaxy.',
  },
  {
    id: 'fungal-18', name: 'Vulpecula Hollows', seed: 'gs-static:fungal-18',
    opts: { biome: 'spore-jungle', themeId: 'vulpecula', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'vulpecula', archetype: 'fungal', tier: 'testing',
    blurb: 'The Fox slinks through luminous spore-groves — the densest tree-lined chutes anywhere.',
  },
  {
    id: 'ocean-18', name: 'Eridanus Atolls', seed: 'gs-static:ocean-18',
    opts: { biome: 'tidal-archipelago', themeId: 'eridanus', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'eridanus', archetype: 'ocean', tier: 'testing',
    blurb: 'The great celestial River pours to the deep south — sea channels and island-hopping golf.',
  },
  {
    id: 'swamp-18', name: 'Hydra Mire', seed: 'gs-static:swamp-18',
    opts: { biome: 'toxic-mire', themeId: 'hydra', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'hydra', archetype: 'swamp', tier: 'testing',
    blurb: 'The Water-Serpent coils the acid mire — the heaviest air in the galaxy, so the ball flies short.',
  },
  {
    id: 'void-18', name: 'Pegasus Rift', seed: 'gs-static:void-18',
    opts: { biome: 'void-garden', themeId: 'pegasus', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'pegasus', archetype: 'void', tier: 'brutal',
    blurb: 'The Winged Horse soars the void — island pads over the abyss; miss the pad and you are gone.',
  },
  {
    id: 'cetus-18', name: 'Cetus Shelf', seed: 'gs-static:cetus-18',
    opts: { biome: 'cetus-deep', themeId: 'cetus', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'cetus', archetype: 'cetus', tier: 'brutal',
    blurb: 'The Whale sounds the star-ocean — clifftop plateaus over a starry sea, whales breaching below.',
  },
  {
    id: 'derelict-18', name: 'The Ghost Wreck', seed: 'gs-static:derelict-18',
    opts: { biome: 'derelict-ship', themeId: 'ghost-nebula', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'ghost-nebula', archetype: 'derelict', tier: 'brutal',
    blurb: 'A dead starship adrift in the Ghost Nebula — shoot the metal corridors across gaps of stars.',
  },
  {
    id: 'inferno2-18', name: 'Scorpius Sting', seed: 'gs-static:inferno2-18',
    opts: { biome: 'ember-world', themeId: 'scorpius', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'scorpius', archetype: 'inferno', tier: 'brutal',
    blurb: 'The Scorpion, red heart Antares — hooking doglegs that sting, blast-crater sand deep in.',
  },
  {
    id: 'verdant2-18', name: 'Centaurus Fairways', seed: 'gs-static:verdant2-18',
    opts: { biome: 'verdant-station', themeId: 'centaurus', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'centaurus', archetype: 'verdant', tier: 'gentle',
    blurb: 'The Centaur wraps the Cross, home to our nearest star — broad, tree-lined parkland.',
  },
  {
    id: 'void2-18', name: 'Sagittarius Core', seed: 'gs-static:void2-18',
    opts: { biome: 'void-garden', themeId: 'sagittarius', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'sagittarius', archetype: 'void', tier: 'brutal',
    blurb: 'The Archer aims at the black hole at the galaxy heart — the wildest carries over the abyss.',
  },
  {
    id: 'frost2-18', name: 'Gemini Ice', seed: 'gs-static:frost2-18',
    opts: { biome: 'ice-ring', themeId: 'gemini', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'gemini', archetype: 'frost', tier: 'testing',
    blurb: 'The Twins frozen side by side — slick ice-ring links where the read never sits still.',
  },
  {
    id: 'desert2-18', name: 'Leo Savannah', seed: 'gs-static:desert2-18',
    opts: { biome: 'dust-belt', themeId: 'leo', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'leo', archetype: 'desert', tier: 'testing',
    blurb: 'The Lion of the savannah, the little king — tight, windy dust with lion-mane bunkering.',
  },
  {
    id: 'ocean2-18', name: 'Delphinus Tides', seed: 'gs-static:ocean2-18',
    opts: { biome: 'tidal-archipelago', themeId: 'delphinus', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'delphinus', archetype: 'ocean', tier: 'testing',
    blurb: 'The Dolphin breaches the tidal sea of stars — sea channels and flanking lagoons.',
  },
  {
    id: 'metal2-18', name: 'Pyxis Foundry', seed: 'gs-static:metal2-18',
    opts: { biome: 'scrap-belt', themeId: 'pyxis', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'pyxis', archetype: 'metal', tier: 'testing',
    blurb: "The Mariner's Compass tumbles the scrap belt — low-gravity bombs over rusted machine hulls.",
  },
  {
    id: 'crystal2-18', name: 'Triangulum Wedge', seed: 'gs-static:crystal2-18',
    opts: { biome: 'crystal-spires', themeId: 'triangulum', holes: 18, compose: true, wildness: STAR_TOUR_WILDNESS, wildnessMix: STAR_TOUR_MIX },
    themeId: 'triangulum', archetype: 'crystal', tier: 'testing',
    blurb: 'A sharp crystal wedge of three bright stars — true, fast lies that punish a loose swing.',
  },
  // --- HOME (GS-earth): the Old Course at St Andrews. The star map's Earth landmark IS this course's
  // destination (`themeId: 'earth'` places it at the home planet, not a constellation). No `opts.themeId`
  // (the biome `earth-links` keys the render), a PINNED real par-72 routing, and the designed difficulty
  // arc (no `wildnessMix`). Regenerated on demand like the other tour rows (no frozen JSON).
  {
    id: 'standrews-18', name: 'The Old Course, St Andrews', seed: 'gs-static:standrews-18',
    opts: { biome: 'earth-links', holes: 18, compose: true, wildness: ST_ANDREWS_WILDNESS, parSequence: ST_ANDREWS_PARS },
    themeId: 'earth', archetype: 'earth', tier: 'testing',
    blurb: 'The home of golf on the Fife coast — a true Scottish links of pot bunkers, gorse and the wind off the North Sea, played over the same wild ground for six centuries.',
  },
];

/** Look up a static course spec by id (undefined if unknown). */
export function staticCourseSpec(id: string): StaticCourseSpec | undefined {
  return STATIC_COURSES.find((c) => c.id === id);
}

/**
 * REGENERATE a static course from its spec (or id) through the live generator — the redesign / season
 * / rebalance path, and the tool that produces the frozen JSON. Deterministic: same spec +
 * `GENERATOR_VERSION` → byte-identical `Course`. The spec's NAME overrides the generator's random star
 * name so the fixed course reads by its designed name. Throws if the id is unknown.
 *
 * The retry ladder mirrors `generateStopCourse`: a pinned seed a later generator version happens to
 * trip re-rolls to a deterministic valid course rather than throwing into the caller. The canonical
 * rows all succeed on attempt 0 today, so it's a forward-compat guard, not a live path.
 */
export function regenerateStaticCourse(spec: StaticCourseSpec | string): Course {
  const s = typeof spec === 'string' ? staticCourseSpec(spec) : spec;
  if (!s) throw new Error(`unknown static course id: ${String(spec)}`);
  const MAX_RETRIES = 8;
  let course: Course | undefined;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      course = generateCourse(attempt === 0 ? s.seed : `${s.seed}:regen${attempt}`, s.opts);
      break;
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) throw err;
    }
  }
  // Unreachable fallthrough guard for the type-checker (the loop returns or rethrows).
  if (!course) course = generateCourse(s.seed, s.opts);
  return { ...course, meta: { ...course.meta, name: s.name } };
}
