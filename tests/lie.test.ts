import { describe, it, expect } from 'vitest';
import { lieAt } from '../src/sim/shot';
import { generateCourse } from '../src/sim/course/generate';
import { pointInPoly, type Hole, type Vec } from '../src/sim/course/contract';

// A green deliberately overlapping the fairway slab — the bug shape: a point inside BOTH
// must read as the more-specific GREEN, not the broad fairway it sits on.
const overlap: Hole = {
  par: 4,
  tee: [0, 0],
  green: [0, 100],
  centreline: [[0, 0], [0, 100]],
  features: [
    { kind: 'fairway', poly: [[-20, 0], [20, 0], [20, 120], [-20, 120]] },
    { kind: 'green', poly: [[-12, 88], [12, 88], [12, 112], [-12, 112]] },
  ],
  hazards: [],
};

describe('lieAt surface precedence', () => {
  it('a point inside both green and fairway reads as GREEN (not fairway)', () => {
    const p: Vec = [0, 100]; // green centre, also inside the fairway slab
    expect(pointInPoly(p, overlap.features[0]!.poly)).toBe(true); // genuinely on the fairway too
    expect(pointInPoly(p, overlap.features[1]!.poly)).toBe(true);
    expect(lieAt(overlap, p)).toBe('green');
  });

  it('plain fairway (off the green) still reads as fairway', () => {
    expect(lieAt(overlap, [0, 40])).toBe('fairway');
  });

  it('scatter spice (ice/crystal/waste) on the fairway reads as the spice, not fairway', () => {
    const withIce: Hole = {
      ...overlap,
      features: [
        overlap.features[0]!,
        { kind: 'ice', poly: [[-5, 35], [5, 35], [5, 45], [-5, 45]] },
      ],
    };
    expect(lieAt(withIce, [0, 40])).toBe('ice');
  });

  it('every generated hole reads its own green/pin as green, never fairway', () => {
    for (let seed = 0; seed < 60; seed++) {
      for (const hole of generateCourse(seed, { holes: 4, distanceFromStart: seed % 10 }).holes) {
        // The pin and the green centroid are on the putting surface by construction.
        expect(lieAt(hole, hole.green)).toBe('green');
        expect(lieAt(hole, hole.pin!)).toBe('green');
      }
    }
  });
});
