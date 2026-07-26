/**
 * Ball-flight trajectory math — PURE (no DOM, no time), so it's unit-tested. The Canvas2D
 * play view feeds it a normalised progress `t` and gets back the ball's ground position
 * and arc height; all the imperative drawing/timing lives in `playView`.
 *
 * Arcade, not sim: the arc is a simple parabola whose peak scales with carry (longer shots
 * fly higher), capped so a chip stays low and a drive soars without leaving the frame.
 */

import type { Vec } from '../sim/course/contract';
import { flightControl, flightGround, arcHeight } from '../sim/flight';

export { flightControl, flightGround, arcHeight } from '../sim/flight';

export interface FlightFeel {
  /** Min/max flight animation duration (ms). */
  minMs: number;
  maxMs: number;
  /** Animation ms per yard of carry (between the min/max clamps). */
  msPerYard: number;
  /** Arc peak height as a fraction of carry. */
  peakFrac: number;
  /** Arc peak clamp (yards). */
  peakMin: number;
  peakMax: number;
  /** Ground speed at the LANDING as a fraction of the flight's average (GS-flight-pace). A real
   *  drive sheds roughly a third of its horizontal speed to drag between launch and landing; the
   *  drawn arc used to shed ALL of it (see `flightT`). 1 = perfectly constant ground speed. */
  flightDragTaper: number;
}

export const DEFAULT_FLIGHT_FEEL: FlightFeel = {
  minMs: 380,
  maxMs: 1100,
  msPerYard: 3,
  peakFrac: 0.13,
  peakMin: 4,
  peakMax: 60,
  flightDragTaper: 0.72,
};

/** Arc peak height (yards) for a given carry. */
export function arcPeak(carry: number, feel: FlightFeel = DEFAULT_FLIGHT_FEEL): number {
  return Math.max(feel.peakMin, Math.min(feel.peakMax, Math.abs(carry) * feel.peakFrac));
}

/** Flight animation duration (ms) for a given carry. */
export function flightDurationMs(carry: number, feel: FlightFeel = DEFAULT_FLIGHT_FEEL): number {
  return Math.max(feel.minMs, Math.min(feel.maxMs, Math.abs(carry) * feel.msPerYard));
}

/**
 * Animation progress → the flight curve's Bézier PARAMETER (GS-flight-pace).
 *
 * The drawn flight is a quadratic Bézier, and `flightControl` puts the control point at the landing's
 * projection onto the shot bearing — so for a shot that finishes ON its line (the overwhelming
 * majority) the control point sits exactly ON the landing and the curve degenerates to
 *
 *     P(t) = from + (2t − t²)·(landing − from)
 *
 * whose ground speed is `2(1 − t)`: **twice the average at the strike and exactly ZERO at the
 * landing**. Measured on the drawn arc, the ball covers 75% of its ground in the first HALF of the
 * animation, 99% by t = 0.9, and then hangs almost stationary in the air for the final tenth before
 * touching down at 2% of its average speed. It rockets off the club and floats down — the opposite of
 * a struck golf ball, and the biggest single reason the shot did not feel like one.
 *
 * It also poisoned everything downstream: the run-out chain starts from the ball's measured arrival
 * speed (GS-runout-feel's "no velocity step from strike to rest"), and that speed was being measured
 * at the bottom of this collapse. The chain was faithfully continuous from a broken number.
 *
 * This maps animation time to the parameter so the GROUND advances at a near-constant rate, tapering
 * only as far as drag would take it (`flightDragTaper` — a real drive loses roughly a third of its
 * horizontal speed between launch and landing, not all of it). The drawn PATH is untouched: the same
 * `t` still feeds both the ground and `arcHeight`, so every (ground, height) pair the sim's knockdown
 * walk tests is a pair the renderer still draws — contract 5 holds exactly. Only the pacing changes.
 *
 * `samplePolylineFlight` (the derelict's pinball flight) deliberately does NOT go through this: it
 * already walks its path by ARC LENGTH, which is to say it was already right.
 */
export function flightT(u: number, feel: FlightFeel = DEFAULT_FLIGHT_FEEL): number {
  const uu = u < 0 ? 0 : u > 1 ? 1 : u;
  const taper = Math.max(0.05, Math.min(1, feel.flightDragTaper));
  // Ground fraction under a linear speed ramp from 1 to `taper`, normalised to unit mean.
  const c = 1 / (1 - (1 - taper) / 2);
  const g = Math.min(1, c * (uu - ((1 - taper) * uu * uu) / 2));
  // …and invert the Bézier's own ground fraction, 2t − t², to reach it.
  return 1 - Math.sqrt(Math.max(0, 1 - g));
}

export interface FlightSample {
  /** Ground position in course-space (yards), linear from→landing. */
  ground: Vec;
  /** Height above the ground (yards), a sine parabola peaking at t=0.5. */
  height: number;
}

/** Sample the flight at normalised progress `t` ∈ [0,1] (straight ground line — putts/legacy). */
export function sampleFlight(from: Vec, landing: Vec, t: number, peak: number): FlightSample {
  const tt = Math.max(0, Math.min(1, t));
  return {
    ground: [from[0] + (landing[0] - from[0]) * tt, from[1] + (landing[1] - from[1]) * tt],
    height: Math.sin(Math.PI * tt) * peak,
  };
}

/**
 * Sample the CURVED flight at progress `t`: the ground follows a quadratic Bézier that launches
 * along the shot bearing and curves to the landing (the fade/hook banana), and the height follows
 * the family-shaped arc whose apex the SIM resolved (`shot.result.apex`; `apexT` is the club
 * family's peak position — `flightApexT(flightProfileOf(club.id))`, GS-flight-3, defaulting to the
 * classic symmetric arc). Both come from the shared `sim/flight` geometry, so the ball the player
 * watches tower/bore + clear/clip a tree is exactly the ball the sim computed. Pure.
 */
export function sampleCurvedFlight(
  from: Vec,
  landing: Vec,
  bearingDeg: number,
  t: number,
  apex: number,
  apexT = 0.5,
): FlightSample {
  const tt = Math.max(0, Math.min(1, t));
  const control = flightControl(from, landing, bearingDeg);
  return { ground: flightGround(from, control, landing, tt), height: arcHeight(apex, tt, apexT) };
}

/**
 * Sample the ship-corridor PINBALL flight at progress `t`: the ground walks the STRAIGHT-segment polyline
 * the sim resolved (`shot.flightPath`, tee → each bulkhead ricochet → landing) BY ARC LENGTH, so the ball
 * tracks the exact reflected path the sim computed — the graphic IS the physics (contract 5). The height is
 * the same family-shaped arc as the banana, spanning the whole polyline (one rise-and-fall over the carom).
 * Used only on the derelict, where the flight cracks off metal instead of curving. Pure.
 */
export function samplePolylineFlight(path: Vec[], t: number, apex: number, apexT = 0.5): FlightSample {
  const tt = Math.max(0, Math.min(1, t));
  const height = arcHeight(apex, tt, apexT);
  if (path.length < 2) return { ground: path[0] ?? [0, 0], height };
  let total = 0;
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  let want = total * tt;
  for (let i = 1; i < path.length; i++) {
    const seg = Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
    if (want <= seg || i === path.length - 1) {
      const u = seg > 1e-9 ? Math.min(1, want / seg) : 0;
      const a = path[i - 1]!;
      const b = path[i]!;
      return { ground: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], height };
    }
    want -= seg;
  }
  return { ground: path[path.length - 1]!, height };
}

export function easeOutCubic(t: number): number {
  const u = 1 - Math.max(0, Math.min(1, t));
  return 1 - u * u * u;
}
