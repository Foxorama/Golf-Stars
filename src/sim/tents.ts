/**
 * Trade-camp TENTS (GS-tents) — the journey "trade market" route's signature, a row of bright,
 * COLLIDABLE tents pitched around the green that the ball can RICOCHET off.
 *
 * This replaces the old screen-space horizon "trade caravan" decoration (a flat row of dome
 * silhouettes drawn in `weather.ts`) which floated at a fixed screen position — it sat above the
 * controls on the decision map and hung in mid-air during the flight, and read as nonsense. A tent
 * camp belongs ON the ground, AT the green, where it can actually matter to the shot.
 *
 * Two ideas, both PURE & deterministic (no rng — a function of the hole geometry, like the OB box or
 * the constellation backdrop), so attaching them changes no rng stream and needs no save migration:
 *
 *  1. PLACEMENT — an arc of ridge tents around the SIDES and BACK of the green, deliberately leaving
 *     the tee-facing APPROACH window clear (so a normal approach is never blocked → "wild but fair").
 *     Each tent's roof RIDGE runs tangent to the green, so its two roof planes face radially IN (toward
 *     the green) and OUT (away) — which is what makes a ball off the back of the green ricochet back
 *     toward it (a lucky save) and a side clip squirt sideways (chaos). Bright colours, content-as-data.
 *
 *  2. COLLISION — like the tree knockdown (`flight.ts`), ARC HEIGHT decides it: a low/flat shot whose
 *     curved flight crosses a tent below the roof there is knocked down and BOUNCES off the roof plane
 *     it hit (reflect the horizontal direction across the slope's outward normal); a lofted wedge sails
 *     over the roof and lands clean. Non-penalty — a bounce only relocates the ball, never costs a
 *     stroke. The bounce is resolved in the shared `executeShot`, so auto ≡ interactive byte-for-byte.
 *
 * Gated to the trade-market course effect at the call sites (`playerHoleOpts` / the interactive
 * driver); a hole without it never builds tents, so every other course is byte-for-byte unchanged.
 */

import type { Hole, Vec } from './course/contract';
import { dist, pointInPoly } from './course/contract';
import { arcApex, arcHeight, ARC_FEEL, flightApexT, flightControl, flightGround, type FlightProfile } from './flight';

export interface TradeTent {
  /** Footprint centre (course space). */
  c: Vec;
  /** Footprint radius (yards). */
  r: number;
  /** Unit vector along the roof RIDGE — the two roof planes face ±perp(ridge). */
  ridge: Vec;
  /** Outward (radially away from the green) unit normal — the axis the roof slopes fall along. */
  out: Vec;
  /** Apex height (yards) at the ridge — a flat shot below this gets bounced; a high one clears. */
  roofH: number;
  /** Colour index (0..) for the bright tent canvas — render-only. */
  hue: number;
}

/** Footprint radius of a tent (yards). */
export const TENT_R = 5.5;
/** Roof apex height (yards). Tuned so a flat mid/long approach clips a back tent (and ricochets) but a
 *  lofted wedge sails over — the same loft-clears-it risk/reward as the tree canopy. */
export const TENT_ROOF_H = 11;
/** How many tents ring the green. */
export const TENT_COUNT: number = 5;
/** Half-width (degrees) of the clear approach window kept open in FRONT of the green (fairness). */
const FRONT_GAP_DEG = 50;
/** Bounce run-out energy floor (fairway-equivalent yards) so a ricochet is lively, not a dead stop. */
export const TENT_BOUNCE_MIN = 9;

const norm = (v: Vec): Vec => {
  const m = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / m, v[1] / m];
};

/** The green's approach direction (unit) — the way the ball travels INTO the green along the
 *  centreline. The clear front window is kept open on the side this points FROM. */
function approachDir(hole: Hole): Vec {
  const cl = hole.centreline;
  const a = cl[cl.length - 2] ?? hole.tee;
  const b = cl[cl.length - 1] ?? hole.green;
  return norm([b[0] - a[0], b[1] - a[1]]);
}

/** Rough radius of the green feature (mean centroid→vertex), or a sensible fallback. */
function greenRadius(hole: Hole): number {
  const g = hole.features.find((f) => f.kind === 'green');
  if (!g || g.poly.length < 3) return 12;
  let r = 0;
  for (const p of g.poly) r += dist(p, hole.green);
  return r / g.poly.length;
}

/**
 * The trade-camp tents for a hole — deterministic, no rng. An arc of `TENT_COUNT` tents around the
 * green, skipping a clear window of ±`FRONT_GAP_DEG` on the approach side. Empty for a green with no
 * room (degenerate). Pure: same hole → same tents, byte-stable across reloads.
 */
export function tradeTents(hole: Hole): TradeTent[] {
  const green = hole.green;
  const gR = greenRadius(hole);
  const radius = gR + TENT_R + 6; // a gap off the green edge so they ring it, not crowd it
  // The approach comes FROM the reverse of approachDir; keep the window centred there clear.
  const ad = approachDir(hole);
  const frontAngle = Math.atan2(-ad[0], -ad[1]); // bearing of the tee-facing side (atan2(dx,dy))
  const gap = (FRONT_GAP_DEG * Math.PI) / 180;
  // Spread the tents across the ALLOWED arc (the full circle minus the front window).
  const span = 2 * Math.PI - 2 * gap;
  const tents: TradeTent[] = [];
  for (let i = 0; i < TENT_COUNT; i++) {
    // Walk from just past the front gap, around the back, to just before it on the other side.
    const frac = TENT_COUNT === 1 ? 0.5 : i / (TENT_COUNT - 1);
    const ang = frontAngle + gap + frac * span;
    const dir: Vec = [Math.sin(ang), Math.cos(ang)]; // radial outward (same convention as bearing)
    const c: Vec = [green[0] + dir[0] * radius, green[1] + dir[1] * radius];
    const out = norm(dir);
    const ridge: Vec = [-out[1], out[0]]; // tangent: roof planes face radially in/out
    tents.push({ c, r: TENT_R, ridge, out, roofH: TENT_ROOF_H, hue: i });
  }
  return tents;
}

/** Roof height (yards) of a tent at course point `p`: peak at the ridge line, sloping to 0 at the
 *  eaves (the footprint edge along the outward normal). Pure. */
export function tentRoofHeight(t: TradeTent, p: Vec): number {
  const off = Math.abs((p[0] - t.c[0]) * t.out[0] + (p[1] - t.c[1]) * t.out[1]); // ⟂ distance from ridge
  const frac = 1 - off / t.r;
  return frac <= 0 ? 0 : t.roofH * frac;
}

/**
 * Reflect a horizontal travel direction off the tent roof plane it struck at `p`. The roof slope on
 * the side of the ridge the ball hit has outward normal `N = side·out`; a ball moving INTO it
 * (`d·N < 0`) reflects (`d − 2(d·N)N`), so a ball off the back of the green bounces back toward it and
 * a side clip squirts away. A grazing ball (`d·N ≥ 0`) is just nudged outward so it clears the tent.
 * Returns a UNIT direction. Pure.
 */
export function tentReflect(t: TradeTent, p: Vec, d: Vec): Vec {
  const side = (p[0] - t.c[0]) * t.out[0] + (p[1] - t.c[1]) * t.out[1] >= 0 ? 1 : -1;
  const N: Vec = [t.out[0] * side, t.out[1] * side];
  const dot = d[0] * N[0] + d[1] * N[1];
  if (dot >= -0.04) return norm([d[0] + N[0] * 0.7, d[1] + N[1] * 0.7]);
  return norm([d[0] - 2 * dot * N[0], d[1] - 2 * dot * N[1]]);
}

export interface TentHit {
  /** Which tent was struck. */
  tent: TradeTent;
  /** Impact point (course space) — where the ball met the roof. */
  point: Vec;
  /** Reflected UNIT travel direction the ball ricochets along. */
  dir: Vec;
  /** Carry (yards) to the impact. */
  carry: number;
  /** Flight fraction at impact (0..1). */
  t: number;
}

/**
 * Walk the curved flight path and return the EARLIEST tent the ball clips — the first footprint it
 * crosses while its arc height there is below the roof. A ball already starting inside a tent (a
 * previous bounce) doesn't re-trigger on that tent. Pure, no rng — the SAME curved path the renderer
 * draws, so a ball drawn hitting a tent is a ball the sim bounced. Returns null if it flies clean.
 */
export function tentFlightHit(
  tents: readonly TradeTent[],
  from: Vec,
  landing: Vec,
  bearingDeg: number,
  carry: number,
  nominalCarry: number,
  profile: FlightProfile,
  steps = 26,
): TentHit | null {
  if (!tents.length || carry <= 0) return null;
  // Broad phase: only tents near the straight launch→landing chord can matter.
  const near = tents.filter((t) => {
    const inside = pointInPoly(from, tentPoly(t));
    const d = pointToSeg(t.c, from, landing);
    return !inside && d <= t.r + 4;
  });
  if (!near.length) return null;

  const control = flightControl(from, landing, bearingDeg);
  const apex = arcApex(carry, nominalCarry, ARC_FEEL, profile.peakMult);
  const apexT = flightApexT(profile);
  let prev = from;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const pos = flightGround(from, control, landing, t);
    const h = arcHeight(apex, t, apexT);
    for (const tent of near) {
      // Inside the footprint AND below the roof there → a clip. Use the segment's nearer point so the
      // impact reads as the near roof face.
      if (insideTent(tent, pos) && h < tentRoofHeight(tent, pos)) {
        const inDir = norm([pos[0] - prev[0], pos[1] - prev[1]]);
        return {
          tent,
          point: pos,
          dir: tentReflect(tent, pos, inDir),
          carry: dist(from, pos),
          t,
        };
      }
    }
    prev = pos;
  }
  return null;
}

/** Whether a point lies within a tent footprint (a circle). */
export function insideTent(t: TradeTent, p: Vec): boolean {
  return dist(p, t.c) <= t.r;
}

/** A coarse polygon approximation of a tent footprint (for point-in-poly broad-phase reuse). */
function tentPoly(t: TradeTent): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pts.push([t.c[0] + Math.cos(a) * t.r, t.c[1] + Math.sin(a) * t.r]);
  }
  return pts;
}

/** Point→segment distance (local copy to avoid importing the whole contract surface here). */
function pointToSeg(p: Vec, a: Vec, b: Vec): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}
