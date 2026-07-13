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
}

/** Id of the flagship metal (Scrap Belt) 18-hole course. */
export const METAL_18_ID = 'metal-18';

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
    opts: { biome: 'scrap-belt', holes: 18, compose: true, wildness: 0.5 },
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
