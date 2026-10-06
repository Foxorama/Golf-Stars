/**
 * THE DRIVING RANGE's three lesson holes (GS-driving-range) — the course half of the tutorial.
 *
 * Kept apart from `drivingRange.ts` for one reason: `runCourse.ts currentCourse` must serve this course,
 * and `drivingRange.ts` imports `run.ts` (to build the run), which imports `runCourse.ts`. Splitting the
 * course out keeps that a straight line instead of a cycle.
 *
 * Each hole has a JOB, and the job is the selection rule — never a pinned seed. A pinned seed is a
 * picture of one `GENERATOR_VERSION`: the first bump re-rolls it and the "hazards" lesson quietly
 * teaches on a hole with no water. So each slot walks a deterministic seed ladder through the live
 * generator and takes the FIRST hole that does the job:
 *
 *  1. `swing`   — a short par 3 with no penalty hazard: the first shot of the game should not be able
 *                 to cost a penalty stroke, and a par 3 reaches the green (and the putting lesson) fast.
 *  2. `hazards` — a par 4 with water on it: the lesson is about keeping the cone off something.
 *  3. `upgrades`— a STRAIGHT, not-thin par 4: full shots down an open line, where a spray zone you
 *                 switch off is a change you can see on the map rather than one hidden by a dogleg.
 *
 * Verdant Station because it is the calmest world in the game (3–4 mph of wind), it is the classic
 * parkland the rest of the galaxy is a variation on, and it has every hazard family the lesson names.
 * Pure + deterministic, and memoised: generation is not free and the course never changes in a build.
 */

import { generateCourse } from '../course/generate';
import type { Course, Hole } from '../course/contract';
import { LIE_INFO } from '../shot';
import { Rng } from '../rng';

/** The world the range is built on. */
export const RANGE_BIOME = 'verdant-station';
/** Its constellation — Crux, "the navigator's home beacon, lush and welcoming" — so the render layer
 *  dresses it as the verdant world every other stop is drawn against. */
const RANGE_THEME = 'crux';
/** Gentle: the low end of the generator's own range, so nothing on the range is a trick. */
const RANGE_WILDNESS = 0.1;
/** How far down the seed ladder a slot may look before it settles for its best fallback. */
const LADDER = 48;

/** Does this hole carry a penalty hazard (water / lava / void …)? The sim's own table decides. */
export function hasPenaltyHazard(hole: Hole): boolean {
  return hole.hazards.some((h) => !!LIE_INFO[h.kind]?.penalty);
}

function holeLength(h: Hole): number {
  return Math.hypot(h.green[0] - h.tee[0], h.green[1] - h.tee[1]);
}

interface Slot {
  key: string;
  parCap: 3 | 4;
  /** The hole does the job. */
  ok: (h: Hole) => boolean;
  /** Used only if the whole ladder misses — the closest thing to the job (lower is better). */
  score: (h: Hole) => number;
}

const SLOTS: readonly Slot[] = [
  {
    key: 'swing',
    parCap: 3,
    ok: (h) => h.par === 3 && !hasPenaltyHazard(h) && holeLength(h) >= 100 && holeLength(h) <= 165,
    score: (h) => (h.par === 3 ? 0 : 100) + (hasPenaltyHazard(h) ? 50 : 0) + Math.abs(holeLength(h) - 135) / 10,
  },
  {
    key: 'hazards',
    parCap: 4,
    ok: (h) => h.par === 4 && h.hazards.some((z) => z.kind === 'water') && holeLength(h) >= 290 && holeLength(h) <= 420,
    score: (h) => (h.par === 4 ? 0 : 100) + (hasPenaltyHazard(h) ? 0 : 50) + Math.abs(holeLength(h) - 360) / 10,
  },
  {
    key: 'upgrades',
    parCap: 4,
    // …and not the `thin` ribbon: this hole is played with deliberately wild balls, and the lesson is
    // that an upgrade makes them behave — not that a beginner can be sprayed into the trees all day.
    ok: (h) => h.par === 4 && /straight/.test(h.shapeId ?? '') && h.widthId !== 'thin' && holeLength(h) >= 300 && holeLength(h) <= 430,
    score: (h) => (h.par === 4 ? 0 : 100) + (/straight/.test(h.shapeId ?? '') ? 0 : 30) + Math.abs(holeLength(h) - 370) / 10,
  },
];

function pickHole(slot: Slot): Hole {
  let best: Hole | null = null;
  let bestScore = Infinity;
  for (let k = 0; k < LADDER; k++) {
    let hole: Hole | undefined;
    try {
      hole = generateCourse(`driving-range:${slot.key}:${k}`, {
        holes: 1,
        biome: RANGE_BIOME,
        wildness: RANGE_WILDNESS,
        parCap: slot.parCap,
      }).holes[0];
    } catch {
      continue; // the generator refuses an unfair hole by throwing; that is the next rung's job
    }
    if (!hole) continue;
    if (slot.ok(hole)) return hole;
    const s = slot.score(hole);
    if (s < bestScore) {
      bestScore = s;
      best = hole;
    }
  }
  if (!best) throw new Error(`driving range: no hole generated for slot ${slot.key}`);
  return best;
}

let cached: Course | null = null;

/** The range's three lesson holes as one course. Memoised; a fresh shallow copy per call so a caller
 *  that stamps holes (the run path does) cannot reach the cache. */
export function drivingRangeCourse(): Course {
  if (!cached) {
    cached = {
      seed: new Rng('driving-range').seed,
      rarity: 'common',
      biome: RANGE_BIOME,
      holes: SLOTS.map(pickHole),
      meta: { name: 'The Driving Range', distanceFromStart: 0, wildness: RANGE_WILDNESS, themeId: RANGE_THEME },
    };
  }
  return { ...cached, holes: [...cached.holes], meta: { ...cached.meta } };
}
