/**
 * Play-bounds / out-of-bounds geometry (GS-refactor-split).
 *
 * The course-space OB box that bounds a hole's whole terrain, the in/out test against it,
 * and the marker geometry (corners + evenly-spaced stakes) the renderers draw along it.
 * A pure LEAF: depends only on the course contract, so it imports nothing from round.ts and
 * cannot form a cycle. 'sim/round' re-exports the whole surface, so external consumers keep
 * importing from there unchanged.
 */

import { dist, type Hole, type Vec } from './course/contract';

/**
 * Out-of-bounds boundary: the course-space box bounding ALL of a hole's terrain
 * (features, hazards, centreline, tee, green), expanded by a generous, hole-size-scaled
 * margin so only genuinely wild shots — well clear of any drawn terrain — count as OB.
 * Pure. (Fairness invariant: penalty surfaces stay off the corridor; OB is the boundary
 * for shots sprayed off the whole map, where stroke-and-distance is the fair golf rule.)
 */
export function playBounds(hole: Hole): { min: Vec; max: Vec } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const eat = (p: Vec): void => {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  };
  for (const f of hole.features) for (const p of f.poly) eat(p);
  for (const f of hole.hazards) for (const p of f.poly) eat(p);
  for (const p of hole.centreline) eat(p);
  eat(hole.tee);
  eat(hole.green);
  const span = Math.max(maxX - minX, maxY - minY, dist(hole.tee, hole.green));
  // Generous, but CAPPED so a long par-5 doesn't fling the boundary (and its drawn OB
  // stakes) absurdly far out — the cap keeps OB a real, readable edge you can see and aim
  // away from, while still only catching genuinely wild shots clear of all the terrain.
  const m = Math.min(Math.max(40, span * 0.25), 90);
  return { min: [minX - m, minY - m], max: [maxX + m, maxY + m] };
}

/** True if a point is inside the hole's out-of-bounds boundary. */
export function inBounds(hole: Hole, p: Vec): boolean {
  const b = playBounds(hole);
  return p[0] >= b.min[0] && p[0] <= b.max[0] && p[1] >= b.min[1] && p[1] <= b.max[1];
}

/** The four corners of the OB box (course-space), CW from the tee-side min corner. The
 *  renderers draw white OB stakes along these edges — the boundary the OB penalty uses. */
export function playBoundsCorners(hole: Hole): [Vec, Vec, Vec, Vec] {
  const b = playBounds(hole);
  return [
    [b.min[0], b.min[1]],
    [b.max[0], b.min[1]],
    [b.max[0], b.max[1]],
    [b.min[0], b.max[1]],
  ];
}

/** Evenly-spaced OB stake positions (course-space) around the boundary, ~`spacing` yards
 *  apart. Render-only marker geometry: the stakes sit EXACTLY where stroke-and-distance
 *  begins, so seeing them reads true to the penalty. Pure. */
export function obStakes(hole: Hole, spacing = 28): Vec[] {
  const corners = playBoundsCorners(hole);
  const pts: Vec[] = [];
  for (let e = 0; e < 4; e++) {
    const p = corners[e]!;
    const q = corners[(e + 1) % 4]!;
    const n = Math.max(2, Math.round(dist(p, q) / spacing));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return pts;
}
