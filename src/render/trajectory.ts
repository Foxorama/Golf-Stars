/**
 * Ball-flight trajectory math — PURE (no DOM, no time), so it's unit-tested. The Canvas2D
 * play view feeds it a normalised progress `t` and gets back the ball's ground position
 * and arc height; all the imperative drawing/timing lives in `playView`.
 *
 * Arcade, not sim: the arc is a simple parabola whose peak scales with carry (longer shots
 * fly higher), capped so a chip stays low and a drive soars without leaving the frame.
 */

import type { Vec } from '../sim/course/contract';
import { flightControl, flightGround, flightParamAt, arcHeight, NEUTRAL_ARC, type ArcShape } from '../sim/flight';

export { flightControl, flightGround, flightParamAt, flightGroundFrac, arcHeight, arcShapeOf, arrivalAngleDeg } from '../sim/flight';
export type { ArcShape } from '../sim/flight';

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
 * Animation progress → the fraction of its GROUND the ball has covered (GS-flight-pace).
 *
 * Progress through the animation is not progress along the shot: a real drive leaves the clubface
 * far faster than it arrives, so a ball drawn at constant ground speed reads as floating and one
 * drawn on the curve's own parameter (`2t − t²`, see `flightGroundFrac`) is worse still — it covers
 * 75% of its ground in the first HALF of the animation, 99% by t = 0.9, and touches down at 2% of
 * its average speed. It rockets off the club and hangs, which is the opposite of a struck golf ball.
 *
 * This spends the animation clock so the ground advances under a linear speed ramp, tapering only as
 * far as drag would take it (`flightDragTaper` — a drive loses roughly a third of its horizontal
 * speed between launch and landing, not all of it). Pure pacing: the PATH is untouched, and both the
 * height and the ground position are read off the ground fraction this returns, so every (ground,
 * height) pair the sim's knockdown walk tests is one the renderer draws — contract 5 holds exactly.
 *
 * `samplePolylineFlight` (the derelict's pinball flight) deliberately does NOT go through this: it
 * already walks its path by ARC LENGTH, which is to say it was already right.
 */
export function flightGroundAt(u: number, feel: FlightFeel = DEFAULT_FLIGHT_FEEL): number {
  const uu = u < 0 ? 0 : u > 1 ? 1 : u;
  const taper = Math.max(0.05, Math.min(1, feel.flightDragTaper));
  // Ground fraction under a linear speed ramp from 1 to `taper`, normalised to unit mean.
  const c = 1 / (1 - (1 - taper) / 2);
  return Math.min(1, c * (uu - ((1 - taper) * uu * uu) / 2));
}

/** Animation progress → the flight curve's Bézier PARAMETER: `flightGroundAt` put through the
 *  ground↔parameter conversion. Only the curve evaluation wants this; everything else works in
 *  ground fraction. */
export function flightT(u: number, feel: FlightFeel = DEFAULT_FLIGHT_FEEL): number {
  return flightParamAt(flightGroundAt(u, feel));
}

export interface FlightSample {
  /** Ground position in course-space (yards), linear from→landing. */
  ground: Vec;
  /** Height above the ground (yards). */
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
 * Sample the CURVED flight once the ball has covered ground fraction `g` of its carry: the ground
 * follows a quadratic Bézier that launches along the shot bearing and curves to the landing (the
 * fade/hook banana), and the height follows the club family's real flight profile scaled to the apex
 * the SIM resolved (`shot.result.apex`; `shape` is `arcShapeOf(club.id)`, GS-flight-shape). Both come
 * from the shared `sim/flight` geometry, so the ball the player watches tower/bore + clear/clip a
 * tree is exactly the ball the sim computed.
 *
 * INDEXED BY GROUND, NOT BY THE CURVE'S PARAMETER — pass `flightGroundAt(u)`, never `flightT(u)`.
 * Pure.
 */
export function sampleCurvedFlight(
  from: Vec,
  landing: Vec,
  bearingDeg: number,
  g: number,
  apex: number,
  shape: ArcShape = NEUTRAL_ARC,
): FlightSample {
  const gg = Math.max(0, Math.min(1, g));
  const control = flightControl(from, landing, bearingDeg);
  return { ground: flightGround(from, control, landing, flightParamAt(gg)), height: arcHeight(apex, gg, shape) };
}

/**
 * Sample the ship-corridor PINBALL flight at progress `t`: the ground walks the STRAIGHT-segment polyline
 * the sim resolved (`shot.flightPath`, tee → each bulkhead ricochet → landing) BY ARC LENGTH, so the ball
 * tracks the exact reflected path the sim computed — the graphic IS the physics (contract 5). Arc-length
 * fraction IS ground fraction, so `t` feeds the family flight profile directly (one rise-and-fall over the
 * whole carom). Used only on the derelict, where the flight cracks off metal instead of curving. Pure.
 */
export function samplePolylineFlight(path: Vec[], t: number, apex: number, shape: ArcShape = NEUTRAL_ARC): FlightSample {
  const tt = Math.max(0, Math.min(1, t));
  const height = arcHeight(apex, tt, shape);
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
