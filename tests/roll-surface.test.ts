import { describe, it, expect } from 'vitest';
import { rollOut, surfaceFirmness, SURFACE_FIRMNESS } from '../src/sim/round';
import { lieAt } from '../src/sim/shot';
import type { FeatureKind, Hole, Vec } from '../src/sim/course/contract';

/** A 300-yd lane built from NON-overlapping y-bands, so each surface reads true (no precedence
 *  shadowing). Bunker/water go in `hazards` (lieAt checks those first); the rest are features. */
function lane(bands: { kind: FeatureKind; y0: number; y1: number }[]): Hole {
  const features: Hole['features'] = [];
  const hazards: Hole['hazards'] = [];
  for (const b of bands) {
    const poly: Vec[] = [[-30, b.y0], [30, b.y0], [30, b.y1], [-30, b.y1]];
    if (b.kind === 'bunker' || b.kind === 'water') hazards.push({ kind: b.kind, poly });
    else features.push({ kind: b.kind, poly });
  }
  return { par: 5, tee: [0, 0], green: [0, 300], centreline: [[0, 0], [0, 300]], features, hazards };
}

const dir: Vec = [0, 1]; // roll straight up the lane
const td: Vec = [0, 100];
const FW = (y0: number, y1: number) => ({ kind: 'fairway' as const, y0, y1 });
const RG = (y0: number, y1: number) => ({ kind: 'rough' as const, y0, y1 });

describe('surface-aware roll integration (run on / brake)', () => {
  it('the same energy runs far on fairway and dies in rough', () => {
    const fw = lane([FW(0, 300)]);
    const rough = lane([FW(0, 90), RG(90, 300)]);
    const onFairway = rollOut(fw, td, dir, 30, lieAt(fw, td)).roll;
    const onRough = rollOut(rough, td, dir, 30, lieAt(rough, td)).roll;
    expect(lieAt(rough, td)).toBe('rough'); // sanity: it really lands in rough
    expect(onFairway).toBeGreaterThan(onRough * 1.5); // fairway runs much further for equal energy
    expect(onRough).toBeGreaterThan(0);
  });

  it('landing in rough then running ONTO fairway keeps going (vs all-rough)', () => {
    const allRough = lane([FW(0, 90), RG(90, 300)]);
    const roughThenFw = lane([FW(0, 90), RG(90, 105), FW(105, 300)]); // short rough collar, then fairway
    const a = rollOut(allRough, td, dir, 30, lieAt(allRough, td)).roll;
    const b = rollOut(roughThenFw, td, dir, 30, lieAt(roughThenFw, td)).roll;
    expect(b).toBeGreaterThan(a); // reaching the fairway lets it run on
  });

  it('running off the fairway INTO rough brakes it short (vs all-fairway)', () => {
    const allFw = lane([FW(0, 300)]);
    const fwThenRough = lane([FW(0, 110), RG(110, 300)]); // fairway, then rough downrange
    const a = rollOut(allFw, td, dir, 30, lieAt(allFw, td)).roll;
    const b = rollOut(fwThenRough, td, dir, 30, lieAt(fwThenRough, td)).roll;
    expect(b).toBeLessThan(a); // the rough brakes the run-out
  });

  it('a bunker in the run-out path catches the ball (object interaction on the ground)', () => {
    const hole = lane([FW(0, 300), { kind: 'bunker', y0: 118, y1: 150 }]);
    const out = rollOut(hole, td, dir, 40, lieAt(hole, td));
    expect(lieAt(hole, out.rest)).toBe('bunker'); // it ran into sand and stopped there
    expect(out.roll).toBeLessThan(40); // didn't roll the full distance
  });

  it('preserves the roll invariant dist(rest,touchdown) === |roll|', () => {
    const hole = lane([FW(0, 130), RG(130, 300)]);
    const out = rollOut(hole, td, dir, 30, lieAt(hole, td));
    const d = Math.hypot(out.rest[0] - td[0], out.rest[1] - td[1]);
    expect(d).toBeCloseTo(Math.abs(out.roll), 5);
  });
});

describe('landing firmness (bounce feel data)', () => {
  it('firm surfaces sit above soft ones', () => {
    expect(surfaceFirmness('fairway')).toBeGreaterThan(surfaceFirmness('rough'));
    expect(surfaceFirmness('ice')).toBeGreaterThan(surfaceFirmness('fairway'));
    expect(surfaceFirmness('bunker')).toBeLessThan(surfaceFirmness('rough'));
    expect(SURFACE_FIRMNESS.fairway).toBeGreaterThan(0);
  });
});
