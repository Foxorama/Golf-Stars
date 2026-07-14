/**
 * STATIC COURSE LIBRARY (GS-static-courses) — the PLAYABLE surface.
 *
 * A static course is a NAMED, fixed full round: the SAME layout every play (a designed, repeatable
 * 18-hole course you can learn and replay), pinned by a `StaticCourseSpec` (`seed`/`opts`) and rebuilt
 * on demand through the live generator (`regenerateStaticCourse`). Because the spec is fixed, a build is
 * DETERMINISTIC — the same layout every play WITHIN a `GENERATOR_VERSION` (a version bump re-rolls it,
 * the accepted cost of an unfrozen lean bundle for a casual records chase).
 *
 * NO COURSE IS FROZEN (GS-biome-variety). A course COULD be frozen to a byte-identical JSON via
 * `scripts/gen-static-courses.mjs` + a `FROZEN_COURSES` row (the mechanism below is kept for that), but
 * freezing all ~15 tour courses would add ~2.5 MB to the bundle, so every course — including the
 * flagship `metal-18` (Antlia Scrapworks), formerly the ONE frozen exception — now regenerates from its
 * spec. This keeps the 18-hole formats uniform (no frozen exception) and lets each course reflect the
 * latest per-world design (e.g. the GS-biome-variety Scrap Belt crater fields).
 *
 * Two entry points, both here:
 *   • `buildStaticCourse(id)` / `metalEighteen()` — the default (regenerates from the pinned spec).
 *   • `buildStaticCourse(id, { regenerate: true })` / `regenerateStaticCourse(id)` — identical today
 *     (both regenerate); the flag stays for callers that want to force a rebuild past any future freeze.
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

export { METAL_18_ID, STATIC_COURSES, regenerateStaticCourse, staticCourseSpec };
export type { StaticCourseSpec };

/**
 * Frozen course data, keyed by id. Currently EMPTY — no course is frozen (see the module note); every
 * build regenerates from its spec. To freeze a course, `import <id>.json` and add a row here (and run
 * `npm run gen:courses` to produce the file), which `buildStaticCourse` will then deep-clone + serve.
 */
const FROZEN_COURSES: Readonly<Record<string, Course>> = {};

/**
 * Build a static course by id (or spec). Regenerates from the pinned spec through the live generator —
 * the same designed round every play within a generator version. `{ regenerate: true }` is identical
 * today (both paths regenerate); it forces a rebuild if the id is ever frozen (a `FROZEN_COURSES` row).
 * A frozen course is deep-CLONED so the run path's in-place hole stamping can't corrupt the singleton.
 * Throws if the id is unknown.
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
  if (!frozen) return regenerateStaticCourse(resolved); // not frozen ⇒ build from source (the norm)
  // Deep-CLONE a frozen singleton: the run path stamps holes in place (armTentHoles,
  // applyEffectPhysics, per-hole biomeMods), so handing back the shared import would leak that
  // mutation into the next play. structuredClone keeps each build independent.
  return structuredClone(frozen);
}

/** Convenience: the flagship 18-hole metal (Scrap Belt) course, regenerated from its pinned spec. */
export function metalEighteen(): Course {
  return buildStaticCourse(METAL_18_ID);
}
