import { describe, it, expect } from 'vitest';
import { shotSpread, sprayBlocking } from '../src/sim/round';
import { flightKnockdown } from '../src/sim/flight';
import { renderHoleSVG } from '../src/render/holeView';
import { CLUBS } from '../src/sim/clubs';
import type { Hole, Vec } from '../src/sim/course/contract';

const driver = CLUBS.find((c) => c.id === 'D')!;

/** A synthetic straight-up hole; `treeBlobs` drop tall obstacles onto the shot corridor. */
function holeWithTrees(treeBlobs: Vec[][]): Hole {
  return {
    par: 4,
    tee: [0, 0],
    green: [0, 400],
    centreline: [
      [0, 0],
      [0, 400],
    ],
    features: [{ kind: 'fairway', poly: [[-40, 0], [40, 0], [40, 400], [-40, 400]] }],
    hazards: treeBlobs.map((poly) => ({ kind: 'trees' as const, poly })),
  };
}

/** A big tree wall square centred at (cx, cy) with half-size `h` (blob radius ≈ 1.41·h). */
const blob = (cx: number, cy: number, h: number): Vec[] => [
  [cx - h, cy - h],
  [cx + h, cy - h],
  [cx + h, cy + h],
  [cx - h, cy + h],
];

describe('sprayBlocking (GS-spray-block, pure)', () => {
  // One tall grove dead on the line at 100y: tall enough (canopy ≈ 32y) that the whole driver
  // carry window flies below it, so the cone's centre is blocked while the flanks stay clear.
  const hole = holeWithTrees([blob(0, 100, 12)]);
  const spread = shotSpread(hole, [0, 0], 'tee', [0, 400], driver, {});

  it('returns [] when the hole has no tall obstacles', () => {
    const clear = holeWithTrees([]);
    expect(sprayBlocking(clear, shotSpread(clear, [0, 0], 'tee', [0, 400], driver, {}))).toEqual([]);
  });

  it('marks the wooded centre of the cone blocked and leaves the flanks clear', () => {
    const regions = sprayBlocking(hole, spread);
    expect(regions.length).toBe(1);
    const r = regions[0]!;
    // The grove sits on the bearing → the blocked run straddles angle 0 but is NOT the whole cone.
    expect(r.a0).toBeLessThan(0);
    expect(r.a1).toBeGreaterThan(0);
    // The cone's outer flanks stay unshaded (the safe line). Note the blocked run is WIDER than the
    // grove's straight-ray shadow: a sprayed shot launches along the bearing and curves out, so an
    // angled miss still passes near the centreline early in flight — exactly the sim's physics.
    const edge = Math.max(Math.abs(r.a0), r.a1);
    expect(edge).toBeLessThan(0.3); // cone edge ≈ ±0.40 rad
    // Every sample's radial interval lives inside the drawn carry window.
    for (const sm of r.samples) {
      expect(sm.r0).toBeGreaterThanOrEqual(spread.carryLow - 1e-6);
      expect(sm.r1).toBeLessThanOrEqual(spread.carryHigh + 1e-6);
      expect(sm.r1).toBeGreaterThan(sm.r0);
    }
  });

  it('agrees with the sim: a shaded landing is one flightKnockdown would knock down, a clear one is not', () => {
    const regions = sprayBlocking(hole, spread);
    const mid = regions[0]!.samples[Math.floor(regions[0]!.samples.length / 2)]!;
    const at = (a: number, r: number): Vec => [Math.sin(a) * r, Math.cos(a) * r];
    const rIn = (mid.r0 + mid.r1) / 2;
    expect(
      flightKnockdown(hole, [0, 0], at(mid.a, rIn), spread.bearing, rIn, spread.nominalCarry),
    ).not.toBeNull();
    // Well outside every region at the same radius: flies clean.
    const clearA = regions[0]!.a1 + 0.15;
    expect(
      flightKnockdown(hole, [0, 0], at(clearA, rIn), spread.bearing, rIn, spread.nominalCarry),
    ).toBeNull();
  });

  it('drops angular slivers below the minimum span (no 1-px blockers)', () => {
    // The real blocked run is ~0.2+ rad wide; demanding a 1-rad minimum span must drop it.
    expect(sprayBlocking(hole, spread, undefined, { minSpanRad: 1 })).toEqual([]);
  });

  it('merges two blocked runs across a sub-threshold clear gap (no barcode striping)', () => {
    // Two groves flanking the line: two distinct runs with a clear slot between them.
    const twin = holeWithTrees([blob(-20, 100, 9), blob(20, 100, 9)]);
    const s = shotSpread(twin, [0, 0], 'tee', [0, 400], driver, {});
    const split = sprayBlocking(twin, s, undefined, { mergeGapRad: 0.001, minSpanRad: 0.01 });
    expect(split.length).toBe(2);
    // With a merge threshold wider than the slot they fuse into ONE readable region.
    const merged = sprayBlocking(twin, s, undefined, { mergeGapRad: 0.5, minSpanRad: 0.01 });
    expect(merged.length).toBe(1);
    expect(merged[0]!.a0).toBeCloseTo(split[0]!.a0, 6);
    expect(merged[0]!.a1).toBeCloseTo(split[1]!.a1, 6);
  });

  it('is deterministic and rng-free', () => {
    expect(sprayBlocking(hole, spread)).toEqual(sprayBlocking(hole, spread));
  });
});

describe('blocked-zone render (SVG overlay)', () => {
  const hole = holeWithTrees([blob(0, 100, 12)]);
  const spread = shotSpread(hole, [0, 0], 'tee', [0, 400], driver, {});
  const view = { width: 360, height: 640, focus: [0, 0] as Vec, viewRadius: spread.carryHigh * 0.36 };

  it('shades the blocked part of the cone and keeps the safe bands drawn', () => {
    const svg = renderHoleSVG(hole, { ...view, spray: spread });
    expect(svg).toContain('rgba(14,26,16,0.60)'); // the canopy shade
    expect(svg).toContain('rgba(95,212,90,0.30)'); // the green band still draws (the safe read)
  });

  it('draws no shade when the cone is clear of trees', () => {
    const clear = holeWithTrees([]);
    const s = shotSpread(clear, [0, 0], 'tee', [0, 400], driver, {});
    const svg = renderHoleSVG(clear, { ...view, spray: s });
    expect(svg).not.toContain('rgba(14,26,16,0.60)');
  });
});
