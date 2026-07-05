import type { GreenLobe, Vec } from './course/contract';

/**
 * GS-green-contour-2 — the SHARED contour field.
 *
 * A contoured surface is a dominant tilt PLANE plus a handful of radial mound/hollow LOBES. This
 * module is the single source for both views of that surface:
 *
 *  - `slopeFieldAt` — the local DOWNHILL vector (what the ball feels): the plane plus each lobe's
 *    radial gradient. The putt resolver integrates it, the green roll-out brakes/boosts off it,
 *    and the renderer's fall-line arrows sample it — the graphic IS the physics.
 *  - `heightFieldAt` — the field's closed-form POTENTIAL (relative elevation, yards·slope units):
 *    exactly the surface whose gradient is `-slopeFieldAt`. The renderer's topo isolines and
 *    relief shading are drawn from it, so the rings the player reads are the same landform the
 *    ball rolls on.
 *
 * Deliberately green-agnostic: nothing here knows about greens. Today the generator only emits
 * lobes on greens (`Hole.greenContour`), but the same field is the intended foundation for
 * contoured FAIRWAYS later — a fairway contour would be a new `Hole` field feeding these same
 * functions, no new math. Pure, DOM-free, zero rng.
 */

/** A contour lobe — today's `GreenLobe`, named for what it will also be on fairways. */
export type ContourLobe = GreenLobe;

/**
 * The LOCAL slope (downhill vector, course space) of the contour field at `p`: the dominant
 * `plane` plus each lobe's radial gradient. A mound's (h > 0) downhill points away from its
 * crest, a hollow's (h < 0) toward its centre; each lobe's magnitude ramps 0 → |h| out to its
 * radius `r` (profile u·e^((1−u²)/2), peaking exactly at the flank) and fades smoothly beyond,
 * so the field is continuous everywhere. No lobes → exactly the plane.
 */
export function slopeFieldAt(p: Vec, plane?: Vec, lobes?: readonly ContourLobe[]): Vec {
  let sx = plane ? plane[0] : 0;
  let sy = plane ? plane[1] : 0;
  if (lobes) {
    for (const l of lobes) {
      const dx = p[0] - l.c[0];
      const dy = p[1] - l.c[1];
      const d = Math.hypot(dx, dy);
      if (d < 1e-6 || l.r < 1e-6) continue;
      const u = d / l.r;
      const m = l.h * u * Math.exp((1 - u * u) / 2); // 0 at the crest, peaks at |h| on the flank (u=1)
      sx += (dx / d) * m;
      sy += (dy / d) * m;
    }
  }
  return [sx, sy];
}

/**
 * The RELATIVE ELEVATION of the contour field at `p` — the closed-form potential whose gradient
 * is `-slopeFieldAt` (slope is the DOWNHILL vector, so height falls along it). The plane
 * contributes `-(plane·p)`; each lobe contributes `h·r·e^((1−u²)/2)` — a smooth bump of height
 * `h·r·√e` at the crest whose radial derivative is exactly the lobe's slope profile. Units are
 * slope-units·yards; only DIFFERENCES are meaningful (there is no absolute datum), which is all
 * the isoline/relief art needs. Pure, zero rng.
 */
export function heightFieldAt(p: Vec, plane?: Vec, lobes?: readonly ContourLobe[]): number {
  let h = plane ? -(plane[0] * p[0] + plane[1] * p[1]) : 0;
  if (lobes) {
    for (const l of lobes) {
      if (l.r < 1e-6) continue;
      const dx = p[0] - l.c[0];
      const dy = p[1] - l.c[1];
      const u = Math.hypot(dx, dy) / l.r;
      h += l.h * l.r * Math.exp((1 - u * u) / 2);
    }
  }
  return h;
}
