import { describe, it, expect } from 'vitest';
import {
  bearing,
  dist,
  pathLength,
  pointInPoly,
  validateCourse,
} from '../src/sim/course/contract';
import { generateCourse } from '../src/sim/course/generate';

describe('geometry helpers', () => {
  it('dist and pathLength', () => {
    expect(dist([0, 0], [3, 4])).toBe(5);
    expect(pathLength([[0, 0], [0, 10], [0, 25]])).toBe(25);
  });

  it('bearing is degrees cw from +Y (up)', () => {
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(0); // straight up
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(90); // right
    expect(bearing([0, 0], [0, -1])).toBeCloseTo(180); // down
    expect(bearing([0, 0], [-1, 0])).toBeCloseTo(270); // left
  });

  it('pointInPoly', () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10]] as [number, number][];
    expect(pointInPoly([5, 5], square)).toBe(true);
    expect(pointInPoly([15, 5], square)).toBe(false);
  });
});

describe('generator emits contract-valid courses', () => {
  it('a fixed seed validates clean', () => {
    const course = generateCourse(1234);
    expect(validateCourse(course)).toEqual([]);
  });

  it('is deterministic: same seed → identical course', () => {
    expect(generateCourse(777)).toEqual(generateCourse(777));
  });

  it('different seeds produce different courses', () => {
    expect(generateCourse(1)).not.toEqual(generateCourse(2));
  });

  it('every hole has fairway + green + a legal par across many seeds', () => {
    for (let seed = 0; seed < 200; seed++) {
      const course = generateCourse(seed, { holes: 3, distanceFromStart: seed % 20 });
      expect(validateCourse(course)).toEqual([]);
      for (const h of course.holes) {
        expect(h.features.some((f) => f.kind === 'fairway')).toBe(true);
        expect(h.features.some((f) => f.kind === 'green')).toBe(true);
        expect(h.par).toBeGreaterThanOrEqual(3);
        expect(h.par).toBeLessThanOrEqual(5);
      }
    }
  });
});
