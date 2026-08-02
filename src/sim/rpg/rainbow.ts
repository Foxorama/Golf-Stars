/**
 * The Rainbow Course course transform (GS-rainbow-road-2) — a PURE, deterministic post-generation
 * reshaping of a stop's course, applied by `currentCourse` ONLY when the legendary Rainbow Ball is
 * armed (`loadout.rainbowRoad`). It never touches the generator or its rng, so a base run is
 * byte-for-byte unchanged; the whole transform is gated behind the ball being owned.
 *
 * Two things happen, both keeping the "graphic IS the physics" contract intact (the SAME hole the
 * renderer draws is the one the sim scores):
 *
 *  1. **Widen the road.** Rainbow Course plays every OTHER surface as the OOB void, so a thin biome
 *     corridor is brutal — a good shot lands on the ribbon and rolls off into space. Grow the
 *     fairway/green/tee polygons outward (like Cetus/Void's generous island platforms), so the road
 *     is a fair, landable ribbon whose width matches the difficulty of flying it. Because we grow the
 *     actual `hole.features` polygons, the sim's `lieAt` and the renderer's ribbon read one geometry.
 *
 *  2. **Clear every hazard.** Bunkers/water/trees/rough scatter don't belong on a glowing rainbow
 *     ribbon through the stars, and — worse — a hazard sitting UNDER the widened road would read as a
 *     hidden trap (the renderer drops it as OOB space, but `lieAt`'s precedence would still return the
 *     hazard, a graphic≠physics violation). Off the ribbon is already OOB, so every hazard is
 *     redundant: strip them all, leaving a clean road ⇒ off-road boundary.
 *
 * Pure geometry, no rng draws — so the transform is deterministic and adds NOTHING to any seeded
 * stream (it runs after generation + validation, on a course that already proved fair).
 */

import type { Course, Feature, Hole, Vec } from '../course/contract';

/** How far (yards) to grow each road surface outward under Rainbow Course. */
const FAIRWAY_WIDEN = 10;
const GREEN_WIDEN = 5;
const TEE_WIDEN = 3;

/** Signed area of a closed polygon (winding sign for the offset bisector direction). */
function signedArea(pts: Vec[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/**
 * Grow a closed polygon OUTWARD by a uniform perpendicular `margin` (yards) — a mitred edge-normal
 * offset (the pure-sim twin of the renderer's `offsetPoly`, so the widened road the sim scores is the
 * exact shape the ribbon is drawn on). The miter is clamped so a reflex vertex on a wiggly ribbon
 * can't spike. `margin <= 0` or a degenerate polygon returns a copy unchanged.
 */
export function growPolygon(pts: Vec[], margin: number): Vec[] {
  const n = pts.length;
  if (n < 3 || margin <= 0) return pts.slice();
  const sign = signedArea(pts) >= 0 ? 1 : -1;
  const out: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]!;
    const cur = pts[i]!;
    const next = pts[(i + 1) % n]!;
    let e1x = cur[0] - prev[0];
    let e1y = cur[1] - prev[1];
    let e2x = next[0] - cur[0];
    let e2y = next[1] - cur[1];
    const l1 = Math.hypot(e1x, e1y) || 1;
    const l2 = Math.hypot(e2x, e2y) || 1;
    e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
    const n1x = -e1y; const n1y = e1x; // left edge-normals
    const n2x = -e2y; const n2y = e2x;
    let bx = n1x + n2x;
    let by = n1y + n2y;
    const bl = Math.hypot(bx, by) || 1;
    bx /= bl; by /= bl;
    const cos = bx * n1x + by * n1y || 1;
    // Negative distance grows outward (winding-signed); clamp the miter length like `offsetPoly`.
    let m = (-margin * sign) / cos;
    const cap = 4 * margin;
    if (m > cap) m = cap;
    else if (m < -cap) m = -cap;
    out.push([cur[0] + bx * m, cur[1] + by * m]);
  }
  return out;
}

/** The outward-grow margin for a road surface, or 0 (leave untouched) for everything else. */
function widenFor(kind: string): number {
  if (kind === 'fairway') return FAIRWAY_WIDEN;
  if (kind === 'green') return GREEN_WIDEN;
  if (kind === 'tee') return TEE_WIDEN;
  return 0;
}

/** Reshape ONE hole for Rainbow Course: grow the road surfaces, drop every hazard. Pure. */
function rainbowHole(hole: Hole): Hole {
  const features: Feature[] = hole.features.map((f) => {
    const m = widenFor(f.kind);
    return m > 0 ? { ...f, poly: growPolygon(f.poly, m) } : f;
  });
  // Off the ribbon is already OOB, so every hazard is redundant AND (once the road is widened over it)
  // a hidden trap the renderer wouldn't draw — clear them all for a clean road/void boundary.
  return { ...hole, features, hazards: [] };
}

/**
 * Apply the Rainbow Course transform to a whole stop's course (widen the road, clear hazards on every
 * hole). Pure + deterministic; called by `currentCourse` only when the Rainbow Ball is armed.
 */
export function applyRainbowRoad(course: Course): Course {
  return { ...course, holes: course.holes.map(rainbowHole) };
}
