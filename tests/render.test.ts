import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { holeProjector } from '../src/render/project';
import {
  arcPeak,
  flightDurationMs,
  sampleFlight,
  easeOutCubic,
  DEFAULT_FLIGHT_FEEL,
} from '../src/render/trajectory';
import type { Vec } from '../src/sim/course/contract';

describe('holeProjector (pure)', () => {
  const hole = generateCourse(1234).holes[0]!;

  it('fits the hole inside the view with padding', () => {
    const W = 360;
    const H = 640;
    const proj = holeProjector(hole, { width: W, height: H, padding: 24 });
    for (const p of [hole.tee, hole.green, ...hole.centreline]) {
      const [x, y] = proj.project(p);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(W);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(H);
    }
  });

  it('puts the green above the tee (play-line points up-screen)', () => {
    const proj = holeProjector(hole);
    const tee = proj.project(hole.tee);
    const green = proj.project(hole.green);
    expect(green[1]).toBeLessThan(tee[1]); // smaller y = higher on screen
  });

  it('is deterministic', () => {
    const a = holeProjector(hole).project(hole.green);
    const b = holeProjector(hole).project(hole.green);
    expect(a).toEqual(b);
  });

  it('reorients with `up` so the target sits above the ball even when long of the green', () => {
    // Ball BEYOND the green: project past it along the tee→green line. With tee→green-up the pin
    // would be BELOW the ball on screen; the follow-cam passes ball→pin as `up` to keep it above.
    const pin = hole.green;
    const beyond: Vec = [pin[0] + (pin[0] - hole.tee[0]), pin[1] + (pin[1] - hole.tee[1])];
    const up: Vec = [pin[0] - beyond[0], pin[1] - beyond[1]];

    const fixed = holeProjector(hole, { focus: beyond, viewRadius: 120 });
    // Tee→green-up: the pin is below the (lower-biased) ball — backwards to aim at.
    expect(fixed.project(pin)[1]).toBeGreaterThan(fixed.project(beyond)[1]);

    const reoriented = holeProjector(hole, { focus: beyond, viewRadius: 120, up });
    // Pin-up: the pin is now ABOVE the ball on screen (smaller y), so the shot points up.
    expect(reoriented.project(pin)[1]).toBeLessThan(reoriented.project(beyond)[1]);
    // unproject stays the exact inverse under the rotated frame.
    const back = reoriented.unproject(...reoriented.project(pin));
    expect(back[0]).toBeCloseTo(pin[0], 6);
    expect(back[1]).toBeCloseTo(pin[1], 6);
  });

  it('falls back to tee→green when `up` is degenerate (ball at the pin)', () => {
    const a = holeProjector(hole, { focus: hole.green, viewRadius: 80 }).project(hole.tee);
    const b = holeProjector(hole, { focus: hole.green, viewRadius: 80, up: [0, 0] }).project(hole.tee);
    expect(b).toEqual(a);
  });
});

describe('trajectory (pure)', () => {
  const from: Vec = [0, 0];
  const to: Vec = [10, 200];

  it('sampleFlight hits the endpoints with ~zero height', () => {
    const peak = arcPeak(200);
    const start = sampleFlight(from, to, 0, peak);
    const end = sampleFlight(from, to, 1, peak);
    expect(start.ground).toEqual(from);
    expect(start.height).toBeCloseTo(0);
    expect(end.ground[0]).toBeCloseTo(to[0]);
    expect(end.ground[1]).toBeCloseTo(to[1]);
    expect(end.height).toBeCloseTo(0);
  });

  it('peaks at the midpoint', () => {
    const peak = arcPeak(200);
    const mid = sampleFlight(from, to, 0.5, peak);
    expect(mid.height).toBeCloseTo(peak);
    expect(mid.ground).toEqual([5, 100]);
  });

  it('arcPeak scales with carry but stays clamped', () => {
    expect(arcPeak(10)).toBe(DEFAULT_FLIGHT_FEEL.peakMin); // tiny chip floored
    expect(arcPeak(99999)).toBe(DEFAULT_FLIGHT_FEEL.peakMax); // capped
    expect(arcPeak(200)).toBeGreaterThan(arcPeak(100));
  });

  it('flightDurationMs scales with carry within clamps', () => {
    expect(flightDurationMs(0)).toBe(DEFAULT_FLIGHT_FEEL.minMs);
    expect(flightDurationMs(99999)).toBe(DEFAULT_FLIGHT_FEEL.maxMs);
    expect(flightDurationMs(200)).toBeGreaterThan(flightDurationMs(120));
  });

  it('easeOutCubic maps 0→0 and 1→1 monotonically', () => {
    expect(easeOutCubic(0)).toBeCloseTo(0);
    expect(easeOutCubic(1)).toBeCloseTo(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // eases out
  });

  it('clamps t outside [0,1]', () => {
    const peak = arcPeak(200);
    expect(sampleFlight(from, to, -1, peak).ground).toEqual(from);
    expect(sampleFlight(from, to, 2, peak).ground[1]).toBeCloseTo(to[1]);
  });
});
