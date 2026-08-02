/**
 * Current-stop course generation (extracted from run.ts, GS-refactor-split).
 *
 * Turns a `Run` at its current stop into the `Course` awaiting the player: the deterministic stop
 * seed + retry guard, the star-travel theme resolution (`currentTheme`/`routeTheme`), and the
 * `currentCourse` pipeline (split-biome stitching, tent arming, effect physics, Rainbow Course). Pure &
 * deterministic; the only run dependency is the `Run` TYPE (erased at compile, so no runtime import
 * cycle). run.ts re-exports every public symbol here, so existing importers are unchanged. Behaviour
 * is byte-for-byte identical to when this lived inside run.ts — a pure move (same rng streams, same
 * draw order).
 */

import { Rng } from '../rng';
import { generateCourse } from '../course/generate';
import type { Course } from '../course/contract';
import {
  EFFECT_WIND_CAP,
  effectWindMult,
  effectCarryMult,
  effectBiomeAffinity,
  WEATHER_AFFINITY_BOOST,
  routeDifficulty,
  routeEffect,
} from './effects';
import { applyRainbowRoad } from './rainbow';
import {
  themeForStop,
  resolveBiome,
  arcForDistance,
  pickTheme,
  pickThemeFrom,
  themesForArc,
  type BiomeArchetype,
  type Theme,
} from '../course/themes';
import { getFormat, stopSpecFor, type StopSpec } from './formats';
import { buildStaticCourse } from '../course/staticCourses';
import { staticCourseSpec, regenerateStaticCourse } from '../course/staticCourseSpecs';
import type { Run } from './run';

/** Deterministic seed for the course at the current stop. */
export function stopSeed(run: Run): string {
  return `${run.seed}:stop:${run.stopIndex}`;
}

/**
 * Generate a stop's course, RETRYING with a reseeded variant if the generator throws (GS-cetus-gaps
 * hardening). `generateCourse` proves fairness by construction and THROWS on a violation rather than
 * shipping an unfair hole — but a rare void island-hop config (~0.1% at galaxy depth) can still trip
 * `validateIslandHops` (a dropped sliver pad fuses two void carries into one over-long gap). At the RPG
 * boundary that uncaught throw crashes the whole run, so here we never let it escape: a thrown seed is
 * ALWAYS an unfair course we'd never show, so deterministically reseeding and regenerating is strictly
 * better than a hard crash. Deterministic (same run → same retry ladder, so auto ≡ interactive and
 * resume both hold), and byte-for-byte unchanged on the 99.9% happy path (attempt 0 succeeds). Only if
 * every retry fails — astronomically unlikely (~0.001^N) — does the last throw propagate, preserving the
 * invariant that an invalid course is never dealt. The proper fix is `separateIslandGaps` respecting the
 * validator's merge threshold in the same units; this is the safe production guard until then.
 */
export function generateStopCourse(seed: string, opts: Parameters<typeof generateCourse>[1]): Course {
  const MAX_RETRIES = 8;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return generateCourse(attempt === 0 ? seed : `${seed}:regen${attempt}`, opts);
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) throw err;
    }
  }
  // Unreachable (the loop either returns or rethrows on the last attempt), but satisfies the type.
  return generateCourse(seed, opts);
}

/**
 * The star-travel theme the current stop flies into (GS-17). The lane you chose at the previous
 * travel screen determines the world (GS-journey-biome) — so honour `pendingTheme` if set. At stop 0
 * (no jump taken yet) or on an old resume it falls back to the deterministic `themeForStop` draw,
 * keeping the very first stop byte-for-byte identical to the old behaviour.
 */
export function currentTheme(run: Run): Theme {
  return run.pendingTheme ?? themeForStop(run.seed, run.stopIndex, run.distanceFromStart);
}

/**
 * The world a route lane flies into (GS-journey-biome). Drawn from the ARC of the distance the jump
 * REACHES (`reachedDistance`), so a deeper jump lands a later-arc, wilder world. Keyed by route id on
 * its own rng stream, so attaching it to `routeOptions` leaves the existing `:routes:` draw order
 * (distances + events) byte-for-byte unchanged. Pure & deterministic.
 *
 * `avoid` (GS-journey-variety) is a set of biome ARCHETYPES this lane must steer clear of — the
 * other lanes' worlds plus the world you're standing on — so the three branch planets read as three
 * genuinely different destinations instead of "ember world, ember world, ember world". A colliding
 * first draw is replaced by ONE rarity-weighted redraw over the arc pool FILTERED to permitted
 * archetypes (this lane's own stream — extra draws perturb nothing else), so distinctness is
 * guaranteed whenever the arc offers enough archetypes (every arc has ≥7; the avoid set is ≤3).
 * Only if the filter empties the pool does the first draw stand.
 *
 * `effect` (GS-weather-affinity) is the lane's SKY, if known: when it's a weather with a biome affinity
 * (`effectBiomeAffinity`) the draw is softly biased toward a fitting world, so a blizzard tends to reach
 * a cold world and a dust storm a desert. It's a WEIGHT boost inside the same single draw (same rng
 * count), applied to the first pick AND the avoid-redraw alike; an absent/affinity-less effect makes the
 * boost a no-op, so those lanes stay byte-for-byte the pre-affinity draw. Weather itself is unchanged —
 * this only nudges which WORLD a weathered lane flies into, on this lane's own (separate) rng stream.
 */
export function routeTheme(
  seed: number | string,
  stopIndex: number,
  routeId: number,
  reachedDistance: number,
  avoid?: ReadonlySet<BiomeArchetype>,
  effect?: string,
): Theme {
  const rng = new Rng(`${seed}:routetheme:${stopIndex}:${routeId}`);
  const arc = arcForDistance(reachedDistance);
  const affinity = effectBiomeAffinity(effect);
  const boost = affinity
    ? (t: Theme): number => (affinity.includes(t.archetype) ? WEATHER_AFFINITY_BOOST : 1)
    : undefined;
  const first = pickTheme(rng, arc, boost);
  if (!avoid || !avoid.has(first.archetype)) return first;
  const cands = themesForArc(arc).filter((t) => !avoid.has(t.archetype));
  return cands.length > 0 ? pickThemeFrom(rng, cands, boost) : first;
}

/** The course awaiting the player at the current stop (shaped by the run format + theme). */
export function currentCourse(run: Run): Course {
  // STAR TOUR (GS-star-tour): a stroke-play round plays a PINNED static course, not a generated stop.
  // Serve the fixed designed 18-hole layout and apply the chosen weather sky as pure physics
  // (`applyEffectPhysics` — wind/carry only, no geometry change, so the course records stay comparable).
  // The weather is stamped on the meta so the renderer/HUD read it. Gated on `staticCourseId`, which no
  // other format sets → the generated path below is byte-for-byte unchanged.
  if (run.staticCourseId) {
    const effect = run.staticEffect ?? 'none';
    // GS-story-quest-9: an ally SIDE QUEST is a shorter NINE-hole round on their home world — and a DISTINCT
    // layout from the 18 you cleared to recruit them (a quest-salted seed + holes:9), never a replay of the
    // same holes.
    // GS-story-qualifier-formats: a QUALIFYING EVENT is nine holes too, on its own salt — so the chapter's
    // three events are a single sitting each and the format variety gets room to breathe, while the Sigil
    // majors keep the full 18 that makes them majors. Deterministic per world (a replay is the same test,
    // so improving your finishing place is a fair second attempt). A normal world round / Star-Tour round
    // (neither flag set) is byte-for-byte the pinned 18.
    const nineHoleSalt = run.storyQuest ? 'quest' : run.storyQualifier ? 'qualifier' : undefined;
    const spec = nineHoleSalt ? staticCourseSpec(run.staticCourseId) : undefined;
    const course = spec
      ? regenerateStaticCourse({ ...spec, seed: `${spec.seed}:${nineHoleSalt}`, opts: { ...spec.opts, holes: 9 } })
      : buildStaticCourse(run.staticCourseId);
    const withEffect = applyEffectPhysics(course, effect);
    return armTentHoles(
      { ...withEffect, meta: { ...withEffect.meta, effect } },
      effect,
    );
  }
  const spec = stopSpecFor(getFormat(run.formatId), run.stopIndex);
  const theme = currentTheme(run);
  // The chosen journey route (GS-journey-fx) makes the world it flew into wilder/gentler AND brings an
  // atmospheric effect — both derived from the CURRENT stop's pending event (already round-tripped on
  // resume), so no new run/save state. Stop 0 / no event ⇒ boost 0, effect 'none' (byte-for-byte old).
  const wildnessBoost = routeDifficulty(run.pendingEvent);
  const effect = routeEffect(run.pendingEvent);
  // Rainbow Course (GS-rainbow-road-2): when the legendary Rainbow Ball is armed the whole run plays as
  // RAINBOW ROAD, so reshape every generated stop into a fair, wide ribbon with no hazards (see
  // `applyRainbowRoad`). Applied LAST — a pure, rng-free post-generation transform on the finished,
  // already-validated course, gated on the loadout flag — so a base run is byte-for-byte unchanged and
  // both the sim and the renderer read the one widened geometry (the "graphic IS physics" contract).
  const finish = (c: Course): Course => (run.loadout?.rainbowRoad ? applyRainbowRoad(c) : c);
  // GS-variation: a split-biome stop CROSSES TWO WORLDS — the front holes are this stop's theme, the
  // back holes a different theme of the same arc. Each half is generated independently and stitched,
  // every hole stamped with its own biome/themeId so it renders + plays as its world.
  if (spec.splitBiome && spec.holes >= 2) {
    return finish(armTentHoles(applyEffectPhysics(stitchSplitCourse(run, spec.holes, spec.parCap, theme, wildnessBoost, effect), effect), effect));
  }
  return finish(
    armTentHoles(
      applyEffectPhysics(
        generateStopCourse(stopSeed(run), {
          holes: spec.holes,
          parCap: spec.parCap,
          distanceFromStart: run.distanceFromStart,
          // The theme resolves to a rarity-tiered, flavoured biome (GS-17b) and tags the course (GS-17).
          biomeRow: resolveBiome(theme),
          themeId: theme.id,
          wildnessBoost,
          effect,
          // Compose the stop into a designed routing (GS-compose): planned par sequence, a signature
          // short/long hole, adjacent-shape contrast and a mean-preserving difficulty arc — so a
          // multi-hole stop stops reading as the same 2–3 holes repeated.
          compose: true,
        }),
        effect,
      ),
      effect,
    ),
  );
}

/**
 * Pitch the trade-market tent ring on EVERY hole of the stop (GS-tent-interactions). Tents live only
 * on a `tradeMarket` route, so the "market" is the whole world you've stopped in — a trade camp at
 * each green for however many holes the mode runs (6 for a voyage stop, 4 for the Unending Universe,
 * or whatever a future mode sets). A single surprise hole made the mechanic too rare to feel like a
 * market; stamping the whole stop makes the tradeMarket lane read as its trade-camp world while the
 * per-hole effect shuffle (`assignTentEffects`) keeps each green's colour→effect mapping distinct.
 * `tents:true` is a pure post-generation stamp (no rng draw, so the generated course is byte-for-byte
 * unchanged); both the headless sim and the interactive driver read it, so they agree on the tents. A
 * non-tradeMarket effect returns the course untouched.
 */
function armTentHoles(course: Course, effect: string): Course {
  if (effect !== 'tradeMarket' || course.holes.length === 0) return course;
  return { ...course, holes: course.holes.map((hole) => ({ ...hole, tents: true })) };
}

/**
 * The course effect's NUMERIC physics hooks (GS-journey-variety wind; GS-journey-fx-2 carry): scale
 * every hole's generated wind by `effectWindMult` (clamped to the generator's own max band) and fold
 * `effectCarryMult` in as a `biomeMods` carry row — the SAME mechanism low-gravity biomes use, so
 * `biomeCarryMult` feeds the HUD range preview, club suggestions, AI and shot physics one identical
 * number. Both are PURE post-generation transforms (no rng, no geometry), so `validateFairness`/
 * `validateCrossings` are untouched and auto ≡ interactive holds by construction (the transformed
 * numbers ARE the course data). A neutral effect returns the course object UNCHANGED (byte-for-byte
 * the old path).
 */
function applyEffectPhysics(course: Course, effect: string): Course {
  const wind = effectWindMult(effect);
  const carry = effectCarryMult(effect);
  if (wind === 1 && carry === 1) return course;
  return {
    ...course,
    holes: course.holes.map((h) => {
      let out = h;
      if (wind !== 1 && out.wind) {
        out = { ...out, wind: { ...out.wind, spd: Math.min(EFFECT_WIND_CAP, Math.max(0, out.wind.spd * wind)) } };
      }
      if (carry !== 1) {
        out = { ...out, biomeMods: [...(out.biomeMods ?? []), { kind: 'carry', value: carry, note: effect }] };
      }
      return out;
    }),
  };
}

/** Stamp every hole of a course with its biome/theme render keys (GS-variation). Pure. */
function stampHoles(course: Course): Course {
  return { ...course, holes: course.holes.map((h) => ({ ...h, biome: course.biome, themeId: course.meta.themeId })) };
}

/**
 * Build a two-world stop (GS-variation): front holes from `themeA`, back holes from a DISTINCT theme
 * of the same arc, concatenated into one Course. Holes carry their own biome/themeId so both renderer
 * and per-hole physics (biomeMods) read the right world. Deterministic from the run + stop. The
 * course's top-level identity is the front theme (the card leads with it); `meta.split` flags it.
 */
function stitchSplitCourse(
  run: Run,
  holes: number,
  parCap: StopSpec['parCap'],
  themeA: Theme,
  wildnessBoost = 0,
  effect = 'none',
): Course {
  const front = Math.ceil(holes / 2);
  const back = holes - front;
  const arc = arcForDistance(run.distanceFromStart);
  // A second, distinct theme of the same arc — distinct by ARCHETYPE, not just id (GS-journey-variety),
  // so the two halves read as two visibly different worlds: a colliding draw is replaced by one
  // rarity-weighted redraw over the arc pool minus the front archetype (arcs have ≥7 archetypes).
  const pick = new Rng(`${run.seed}:split:${run.stopIndex}`);
  let themeB = pickTheme(pick, arc);
  if (themeB.archetype === themeA.archetype) {
    const cands = themesForArc(arc).filter((t) => t.archetype !== themeA.archetype);
    if (cands.length > 0) themeB = pickThemeFrom(pick, cands);
  }
  const a = stampHoles(
    generateStopCourse(`${stopSeed(run)}:front`, {
      holes: front,
      parCap,
      distanceFromStart: run.distanceFromStart,
      biomeRow: resolveBiome(themeA),
      themeId: themeA.id,
      wildnessBoost,
      effect,
      compose: true, // GS-compose: design the half's routing (par sequence, signature, difficulty arc)
    }),
  );
  const b = stampHoles(
    generateStopCourse(`${stopSeed(run)}:back`, {
      holes: back,
      parCap,
      distanceFromStart: run.distanceFromStart,
      biomeRow: resolveBiome(themeB),
      themeId: themeB.id,
      wildnessBoost,
      effect,
      compose: true, // GS-compose: design the half's routing (par sequence, signature, difficulty arc)
    }),
  );
  return {
    ...a,
    holes: [...a.holes, ...b.holes],
    // Lead with the front theme's identity; flag the split + record the back theme for the UI.
    meta: { ...a.meta, themeId: themeA.id, split: { backThemeId: themeB.id, frontHoles: front } },
  };
}
