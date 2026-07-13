/**
 * STATIC COURSE LIBRARY (GS-static-courses) — the PLAYABLE surface.
 *
 * A static course is a NAMED, fixed full round: the SAME layout every play, so a future game mode can
 * offer a designed, repeatable 18-hole course you can learn and replay. Unlike the procedural run path
 * (a fresh seed each stop), a static course is served from a FROZEN JSON data file
 * (`./static/<id>.json`, produced by `scripts/gen-static-courses.mjs`), so it stays byte-identical
 * FOREVER — even across `GENERATOR_VERSION` bumps that would re-roll a from-seed course.
 *
 * Two ways to get a course, both here:
 *   • `buildStaticCourse(id)` / `metalEighteen()` — load the FROZEN data (the default; truly static).
 *   • `buildStaticCourse(id, { regenerate: true })` / `regenerateStaticCourse(id)` — rebuild from the
 *     pinned spec through the live generator (a seasonal redesign / rebalance / a spec with no frozen
 *     file yet). `npm run gen:courses` re-freezes the JSON from the same path.
 *
 * The spec catalogue + the regeneration function live in `./staticCourseSpecs.ts` (no frozen-data
 * dependency, so the freezer script can bootstrap); this module re-exports them, so callers still
 * import everything from one place.
 *
 * DELIBERATELY UNWIRED: nothing in the run/format path imports this module, so every existing mode is
 * byte-for-byte unchanged (contract 1 holds trivially — no shared rng stream is touched). The future
 * mode opts in by calling `buildStaticCourse`. No new `_gs*`/URL hook, so no test-hub wiring is needed.
 */

import type { Course } from './contract';
import {
  METAL_18_ID,
  STATIC_COURSES,
  regenerateStaticCourse,
  staticCourseSpec,
  type StaticCourseSpec,
} from './staticCourseSpecs';
import metal18Frozen from './static/metal-18.json';

export { METAL_18_ID, STATIC_COURSES, regenerateStaticCourse, staticCourseSpec };
export type { StaticCourseSpec };

/** Frozen course data, keyed by id. A new static course adds its `<id>.json` import + a row here. */
const FROZEN_COURSES: Readonly<Record<string, Course>> = {
  [METAL_18_ID]: metal18Frozen as unknown as Course,
};

/**
 * Build a static course by id (or spec). Returns the FROZEN data — the same designed round every play,
 * stable across generator versions. Pass `{ regenerate: true }` to rebuild it from the pinned spec
 * through the live generator instead (a redesign / rebalance). If a spec exists but has no frozen file
 * yet, it transparently regenerates. Throws if the id is unknown.
 */
export function buildStaticCourse(
  spec: StaticCourseSpec | string,
  opts: { regenerate?: boolean } = {},
): Course {
  const id = typeof spec === 'string' ? spec : spec.id;
  const resolved = typeof spec === 'string' ? staticCourseSpec(spec) : spec;
  if (!resolved) throw new Error(`unknown static course id: ${String(spec)}`);
  if (opts.regenerate) return regenerateStaticCourse(resolved);
  const frozen = FROZEN_COURSES[id];
  if (!frozen) return regenerateStaticCourse(resolved); // no frozen file yet ⇒ build from source
  // Deep-CLONE the frozen singleton: the run path stamps holes in place (armTentHoles,
  // applyEffectPhysics, per-hole biomeMods), so handing back the shared import would leak that
  // mutation into the next play. structuredClone keeps each build independent.
  return structuredClone(frozen);
}

/** Convenience: the flagship 18-hole metal (Scrap Belt) course, from frozen data. */
export function metalEighteen(): Course {
  return buildStaticCourse(METAL_18_ID);
}
