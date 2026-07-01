/**
 * THE COURSE CONTRACT — frozen interface (Starter Kit §4).
 *
 * The generator EMITS this, the renderer CONSUMES it, the sim SCORES it. As long
 * as this shape holds, generator and renderer can each be rewritten forever without
 * touching the other. Do not bend the contract to a renderer convenience or a
 * generator shortcut — extend it deliberately.
 *
 * Units: course-space units are YARDS (matches club carries in `clubs.ts`). The
 * origin and axis orientation are arbitrary; the renderer rotates tee→green up-screen.
 */

/** A point in course-space (yards). [x, y]. NOT lat/lng — this is a game, not a map. */
export type Vec = [number, number];

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

/**
 * Surface kind. The known golf surfaces are spelled out; `string` stays open on
 * purpose so fantasy surfaces (lava, crystal, void, antigrav…) slot in as DATA plus
 * a lie/physics modifier — exactly how golf-finder extends its lie table.
 */
export type FeatureKind =
  | 'fairway'
  | 'green'
  | 'tee'
  | 'bunker'
  | 'water'
  | 'rough'
  | 'waste'
  | (string & {});

export interface Feature {
  kind: FeatureKind;
  /** Closed polygon (course-space). First≠last; the renderer closes it. */
  poly: Vec[];
  /**
   * Marks a PENALTY hazard as a SANCTIONED exception to `validateFairness` (GS-variety-2) — a
   * greenside lava/water/void RING that deliberately hugs the green off the approach line. Unlike a
   * flanking pond (which must clear the whole play corridor), a ring blob is proven fair by
   * `validateGreenApproach` instead (the pin stays reachable down a penalty-free approach lane).
   * Absent/false ⇒ the ordinary "clear of the corridor" fairness rule applies. Render-agnostic.
   */
  sanctioned?: boolean;
}

/**
 * A biome/wildness modifier attached to a hole. Open-ended by design — `kind` keys
 * into the physics/lie modifier table, `value` parameterises it (e.g. a low-gravity
 * carry multiplier of 1.4, a moving-green speed). Kept as data so a new biome is a
 * new row, not an engine edit.
 */
export interface BiomeMod {
  kind: string;
  value?: number;
  note?: string;
}

export interface Wind {
  /** Direction the wind blows TOWARD, in degrees clockwise from +Y (up-screen). */
  dir: number;
  /** Speed in mph (arcade units; the wind math reads it off the shot bearing). */
  spd: number;
}

export interface Hole {
  par: number;
  tee: Vec;
  /** Green centroid (its generated centre) — the geometric anchor, NOT the flag. */
  green: Vec;
  /**
   * Flag position within the green polygon (GS-6). The sim aims/holes/putts at this, not
   * the centroid, so front/back/tucked pins make the approach read differently. Optional
   * for back-compat: a hole without one falls back to the centroid (see round.ts `pin`).
   */
  pin?: Vec;
  /** Play-line, tee→green. The renderer rotates this to point up-screen. >= 2 points. */
  centreline: Vec[];
  /** Generated terrain polygons (the OSM analogue). */
  features: Feature[];
  /** Drawn last / on top of features, per golf-finder's layer rule. */
  hazards: Feature[];
  wind?: Wind;
  biomeMods?: BiomeMod[];
  /**
   * Per-hole biome/theme identity (GS-variation): on a SPLIT-biome stop the back holes belong to a
   * different world than the front, so each hole carries its own render keys. Absent ⇒ the hole uses
   * the course-level biome/themeId (the original single-world behaviour). Render-only — physics ride
   * `biomeMods`.
   */
  biome?: string;
  themeId?: string;
  /**
   * Hole-design template id (GS-shapes-2): which archetype the generator drew — 'straight',
   * 'dogleg-l/r', 's-curve', 'hairpin-l/r', 'cape-l/r', 'double-l/r', plus a length class prefix
   * for par variants ('drivable', 'long-3', 'short-3', 'reachable-5', 'three-shot-5', …). Render/UI
   * label + variety tests read it; the sim never branches on it (physics ride the geometry). Optional
   * for back-compat — a hole without one is unlabelled.
   */
  shapeId?: string;
  /**
   * Green SLOPE (GS-greens-3): the green's dominant tilt as a DOWNHILL vector in course space — its
   * direction is downhill (the fall line), its magnitude is steepness (~0 flat … ~1 severe). The sim
   * reads it so the approach roll runs out downhill / checks uphill (and never spins weirdly UP a
   * slope), and putts BREAK along it; the renderer shades the high/low sides + draws fall-line arrows.
   * Drawn from a SIDE rng (like the pin) so adding it leaves existing courses' terrain byte-identical.
   * Optional for back-compat: a hole without one plays flat.
   */
  greenSlope?: Vec;
}

export interface CourseMeta {
  name: string;
  /** Galaxy distance from the run's start — drives difficulty/wildness scaling. */
  distanceFromStart: number;
  /** 0..1ish knob the generator turns up as you travel further. */
  wildness: number;
  /** Star-travel theme id (GS-17) the stop flew into; the render layer keys flavour off it. */
  themeId?: string;
  /** Atmospheric course effect (GS-journey-fx) the chosen route brought — a render-only flavour key
   *  ('moonlight' | 'meteorShower' | …). Absent ⇒ no effect. See sim/rpg/effects.ts CourseEffectId. */
  effect?: string;
  /** Split-biome stop (GS-variation): the back holes belong to a different world. The back theme id +
   *  how many front holes precede it. Absent ⇒ a single-world stop. */
  split?: { backThemeId: string; frontHoles: number };
}

export interface Course {
  /** Reproducible: same seed (+ same generator version) → same course. */
  seed: number;
  rarity: Rarity;
  /** Drives art + lie/physics mods. */
  biome: string;
  holes: Hole[];
  meta: CourseMeta;
}

// --- Small geometry helpers shared by generator, renderer, and sim ----------

export function dist(a: Vec, b: Vec): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Total length of a polyline (e.g. a centreline) in course-space units. */
export function pathLength(pts: Vec[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1]!, pts[i]!);
  return total;
}

/**
 * Bearing in degrees clockwise from +Y (up), to match `Wind.dir`. atan2(dx, dy)
 * gives the angle measured from +Y toward +X (clockwise), which is the screen-up
 * convention the renderer and wind math share.
 */
export function bearing(from: Vec, to: Vec): number {
  const deg = (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Shortest distance from point `p` to the segment a→b. */
export function segDist(p: Vec, a: Vec, b: Vec): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

/** Shortest distance from point `p` to a polyline (min over its segments). */
export function polylineDist(p: Vec, line: Vec[]): number {
  let min = Infinity;
  for (let i = 1; i < line.length; i++) min = Math.min(min, segDist(p, line[i - 1]!, line[i]!));
  return min;
}

/** Standard ray-casting point-in-polygon. Used by the lie read. */
export function pointInPoly(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]![0];
    const yi = poly[i]![1];
    const xj = poly[j]![0];
    const yj = poly[j]![1];
    const intersect =
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Validate a course against the contract. Pure; returns a list of problems
 * (empty = valid). The generator and tests both call this so a malformed course
 * can never silently reach the renderer or the scorer.
 */
export function validateCourse(c: Course): string[] {
  const errs: string[] = [];
  if (!Number.isFinite(c.seed)) errs.push('seed is not finite');
  if (c.holes.length === 0) errs.push('course has no holes');
  c.holes.forEach((h, i) => {
    const tag = `hole[${i}]`;
    if (!(h.par >= 3 && h.par <= 6)) errs.push(`${tag}: par ${h.par} out of [3,6]`);
    if (h.centreline.length < 2) errs.push(`${tag}: centreline needs >= 2 points`);
    const greenFeature = h.features.find((f) => f.kind === 'green');
    if (!greenFeature) errs.push(`${tag}: no green feature`);
    if (!h.features.some((f) => f.kind === 'fairway'))
      errs.push(`${tag}: no fairway feature`);
    // A pin, if placed, must sit on the green so it's puttable and never tucked off-surface.
    if (h.pin && greenFeature && !pointInPoly(h.pin, greenFeature.poly))
      errs.push(`${tag}: pin is outside the green polygon`);
    [...h.features, ...h.hazards].forEach((f, fi) => {
      if (f.poly.length < 3)
        errs.push(`${tag}: feature[${fi}] (${f.kind}) poly needs >= 3 points`);
    });
  });
  return errs;
}
