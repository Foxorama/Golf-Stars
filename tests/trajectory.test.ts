import { describe, it, expect } from 'vitest';
import { samplePolylineFlight } from '../src/render/trajectory';
import { NEUTRAL_ARC, arcShapeOf } from '../src/sim/flight';
import type { Vec } from '../src/sim/course/contract';

// GS-ship-pinball-flight: the renderer walks the sim's stored reflected polyline BY ARC LENGTH, so the ball
// tracks the exact straight-segment path the sim resolved (graphic ≡ physics). These pin the sampler.
describe('samplePolylineFlight — walks a reflected polyline by arc length', () => {
  // An L-shaped path: 100 yd east, then 100 yd north (a right-angle bulkhead carom).
  const path: Vec[] = [[0, 0], [100, 0], [100, 100]];

  it('t=0 is the start, t=1 is the final vertex', () => {
    expect(samplePolylineFlight(path, 0, 40).ground).toEqual([0, 0]);
    expect(samplePolylineFlight(path, 1, 40).ground).toEqual([100, 100]);
  });

  it('t=0.5 is the bend (half the 200-yd arc length), NOT the chord midpoint', () => {
    // Arc-length midpoint sits exactly on the corner vertex — a chord lerp would cut across to (75,25).
    expect(samplePolylineFlight(path, 0.5, 40).ground).toEqual([100, 0]);
  });

  it('samples mid-segment by arc length (t=0.25 → a quarter along the first leg)', () => {
    expect(samplePolylineFlight(path, 0.25, 40).ground).toEqual([50, 0]);
    expect(samplePolylineFlight(path, 0.75, 40).ground).toEqual([100, 50]);
  });

  it('height is the family arc — 0 at the ends, the apex at the family apex position', () => {
    expect(samplePolylineFlight(path, 0, 40).height).toBeCloseTo(0, 6);
    expect(samplePolylineFlight(path, 1, 40).height).toBeCloseTo(0, 6);
    // Arc-length fraction IS ground fraction, so the family profile applies unchanged: the peak sits
    // where the club peaks, not at the halfway vertex.
    expect(samplePolylineFlight(path, NEUTRAL_ARC.apexAt, 40).height).toBeCloseTo(40, 6);
    const wedge = arcShapeOf('SW');
    expect(samplePolylineFlight(path, wedge.apexAt, 40, wedge).height).toBeCloseTo(40, 6);
    expect(samplePolylineFlight(path, 0.95, 40, wedge).height).toBeLessThan(
      samplePolylineFlight(path, 0.95, 40, arcShapeOf('D')).height,
    );
  });

  it('a degenerate 1-point path returns that point (no crash)', () => {
    expect(samplePolylineFlight([[7, 9]], 0.5, 40).ground).toEqual([7, 9]);
  });
});
