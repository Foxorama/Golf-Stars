/**
 * Ship-corridor WALLS (GS-ship-walls, redesigned GS-ship-corridor) — the derelict world's signature:
 * towering METAL BULKHEADS lining the hull-deck corridor. They stand TALLER than any golf shot can
 * fly (see `WALL_HEIGHT` below), so there is NO hitting over them — every ball that leaves the deck
 * sideways RICOCHETS off the bulkhead and comes back onto the corridor. You are sealed inside the
 * ship's passageway. If a bounce sends the ball into the OTHER wall, it bounces again — hit two
 * walls, bounce twice. The floor and walls are metal, so a bounce runs LIVELY (a firm ricochet).
 *
 * PURE & deterministic (no rng — a function of the hole geometry, like the tents / OB box), so it
 * adds ZERO rng draws and every non-derelict world is byte-for-byte unchanged. The walls are STAMPED
 * onto the hole by the generator from the SAME ribbon edges it draws (`hole.walls`), so the sim
 * bounces off exactly the wall the renderer paints — the graphic IS the physics (contract 5). The
 * bounce is resolved in the shared `executeShot`, so auto ≡ interactive byte-for-byte (contract 2).
 *
 * Walls only ever SAVE a ball that would be lost to space (off-deck is the `voidlost` penalty), so
 * they only raise mean per-stop Stableford — the death-spiral bar can only improve (contract 4).
 *
 * NB — the per-segment collisions in this file are NOT the FLIGHT bounce, and NOT the containment
 * GUARANTEE. Two parallel wall rails per corridor section can't form a closed fence on a hull that zigzags
 * with hard-angular corners, so a share of shots leak off-hull through the corner openings and past the chain
 * ends. The real derelict physics treats the DRAWN DECK as the true bulkhead, in `round.ts`:
 * `firstSolidDeparture`/`shipFlightPath` bounce the FLIGHT at the first point it runs out of hull
 * (GS-ship-wall-bounce / GS-ship-wall-phantom), and `containToDeck` is the rest backstop
 * (GS-ship-corridor-contain — see docs/decisions/sim-generator.md). What lives here is the ROLLING
 * ricochet (`wallRollBounce`, the ground pinball) and the shared `wallReflect` maths those callers use.
 * The old per-segment FLIGHT collision (`wallFlightHit`) is gone: it was the aim cone's private
 * predictor, it disagreed with the sim on 42% of real bounces, and a second source of truth for one
 * bounce is exactly how the cone came to promise clean shots the ball never played
 * (GS-ship-wall-phantom). Change the wall FEEL here; do NOT try to make these segments watertight —
 * that's the trap five attempts fell into.
 */

import type { Vec, ShipWall } from './course/contract';
import { dist } from './course/contract';

export type { ShipWall };

/**
 * Wall height (yards). A golf shot's apex is hard-capped at `ARC_FEEL.peakMax` (60 yd) in `flight.ts`,
 * so a bulkhead standing at 72 yd is UN-CLEARABLE by any club at any power — the ball can never sail
 * over it, it always bounces back onto the deck. This is the whole point of the derelict ship: you play
 * golf INSIDE its corridors, walled in on both sides. (Was 13 yd, a "tall tent" a lofted wedge could
 * skip; a dead ship's bulkheads rise to the overhead, so nothing gets over them.)
 */
export const WALL_HEIGHT = 72;
/** Bounce run-out energy floor (fairway-equivalent yards) so a metal ricochet is lively, not dead. */
export const WALL_BOUNCE_MIN = 8;
/**
 * Energy kept across a ROLLING ricochet (GS-ship-pinball). A ball rolling into a bulkhead doesn't
 * stop dead — it bounces off and keeps rolling, wall-to-wall, until friction + the per-bounce loss
 * bleed the momentum away. Metal is lively (0.82), so a fast ball pinballs several times; a slow one
 * dies after a bounce or two. <1 guarantees the pinball always terminates.
 */
export const WALL_ROLL_RESTITUTION = 0.82;

const norm = (v: Vec): Vec => {
  const m = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / m, v[1] / m];
};

/**
 * Reflect a horizontal travel direction `d` off a wall with inward normal `N`. A ball moving INTO the
 * wall (`d·N < 0`, i.e. heading outward toward space) reflects back inward (`d − 2(d·N)N`); a ball
 * already moving inward is left alone. Returns a UNIT direction. Pure.
 */
export function wallReflect(N: Vec, d: Vec): Vec {
  const dot = d[0] * N[0] + d[1] * N[1];
  if (dot >= -0.02) return norm(d); // grazing / already heading inward → no bounce
  return norm([d[0] - 2 * dot * N[0], d[1] - 2 * dot * N[1]]);
}

/** Intersection point of segments AB and CD, or null. Pure. */
export function segHit(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const r0 = b[0] - a[0], r1 = b[1] - a[1];
  const s0 = d[0] - c[0], s1 = d[1] - c[1];
  const den = r0 * s1 - r1 * s0;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s1 - (c[1] - a[1]) * s0) / den;
  const u = ((c[0] - a[0]) * r1 - (c[1] - a[1]) * r0) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + r0 * t, a[1] + r1 * t];
}

export interface WallHit {
  wall: ShipWall;
  /** Impact point (course space). */
  point: Vec;
  /** Reflected UNIT travel direction (after all bounces). */
  dir: Vec;
  /** Carry (yards) to the impact. */
  carry: number;
  /** Flight fraction at impact (0..1). */
  t: number;
  /** How many walls were struck this flight (1 or 2 — "hit two walls, bounce twice"). */
  bounces: number;
}

/** The wall a rolling segment `a→b` crosses OUTWARD (toward space) plus the impact point — the
 *  ricochet the pinball run-out reflects off. Returns the NEAREST such wall to `a`, or null. Pure. */
export function wallRollBounce(walls: readonly ShipWall[], a: Vec, b: Vec): { wall: ShipWall; point: Vec } | null {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const tvx = dx / L, tvy = dy / L;
  let best: { wall: ShipWall; point: Vec } | null = null;
  let bestD = Infinity;
  for (const w of walls) {
    if (tvx * w.normal[0] + tvy * w.normal[1] >= -0.02) continue; // rolling inward / parallel → no bounce
    const x = segHit(a, b, w.a, w.b);
    if (!x) continue;
    const d = dist(a, x);
    if (d < bestD) { bestD = d; best = { wall: w, point: x }; }
  }
  return best;
}

/** Whether the segment `a→b` crosses any wall from its inner side to its outer side (a rolling ball
 *  running up against a wall). Returns the wall it first hits, or null. Pure. Thin wrapper over
 *  `wallRollBounce` for callers that only need the wall (the aim probe / tests). */
export function wallRollHit(walls: readonly ShipWall[], a: Vec, b: Vec): ShipWall | null {
  return wallRollBounce(walls, a, b)?.wall ?? null;
}
