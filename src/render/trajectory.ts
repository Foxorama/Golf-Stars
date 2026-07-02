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
}

export const DEFAULT_FLIGHT_FEEL: FlightFeel = {
  minMs: 380,
  maxMs: 1100,
  msPerYard: 3,
  peakFrac: 0.13,
  peakMin: 4,
  peakMax: 60,
};

/** Arc peak height (yards) for a given carry. */
export function arcPeak(carry: number, feel: FlightFeel = DEFAULT_FLIGHT_FEEL): number {
  return Math.max(feel.peakMin, Math.min(feel.peakMax, Math.abs(carry) * feel.peakFrac));
}

/** Flight animation duration (ms) for a given carry. */
export function flightDurationMs(carry: number, feel: FlightFeel = DEFAULT_FLIGHT_FEEL): number {
  return Math.max(feel.minMs, Math.min(feel.maxMs, Math.abs(carry) * feel.msPerYard));
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

export function easeOutCubic(t: number): number {
  const u = 1 - Math.max(0, Math.min(1, t));
  return 1 - u * u * u;
}
