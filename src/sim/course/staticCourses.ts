/**
 * STATIC COURSE LIBRARY (GS-static-courses).
 *
 * Every existing mode builds each stop from a FRESH seed (`generateStopCourse`), so no two plays
 * are the same course. A *static* course is the opposite: a NAMED, fixed full round built from a
 * PINNED seed + options, so it is byte-identical every time it's played (within a `GENERATOR_VERSION`,
 * exactly like every other seeded course in the game). This is the raw material for a future game
 * mode — a designed, repeatable 18-hole course you can learn and replay — kept as DATA so a new
 * static course is a new row, not an engine edit.
 *
 * DELIBERATELY UNWIRED: nothing in the run/format path imports this module, so every existing mode is
 * byte-for-byte unchanged (contract 1 holds trivially — no shared rng stream is touched). The future
 * mode opts in by calling `buildStaticCourse`; until then this is inert content sitting ready.
 *
 * Determinism: `buildStaticCourse` mirrors `generateStopCourse`'s retry ladder so a pinned seed that
 * a later generator version happens to trip re-rolls to a deterministic valid course rather than
 * throwing into the caller — the canonical courses below all succeed on attempt 0 today, so the ladder
 * is a forward-compatibility guard, not a live code path.
 */

import { generateCourse, type GenerateOptions } from './generate';
import type { Course } from './contract';

/** A named, fixed course: a pinned seed + generation options → the same full round every play. */
export interface StaticCourseSpec {
  /** Stable id (never reused) — how a mode / test asks for this course. */
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
 * The static course catalogue. Content, not code — a new static course is a new row here.
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
 * Build a static course from its spec (or id). Deterministic: same spec + `GENERATOR_VERSION` →
 * byte-identical `Course`. The course NAME from the spec overrides the generator's random star name,
 * so the fixed course reads by its designed name. Throws if the id is unknown.
 */
export function buildStaticCourse(spec: StaticCourseSpec | string): Course {
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

/** Convenience: build the flagship 18-hole metal (Scrap Belt) course. */
export function metalEighteen(): Course {
  return buildStaticCourse(METAL_18_ID);
}
