import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { dist, pointInPoly, type Hole } from '../src/sim/course/contract';
import { pinOf } from '../src/sim/round';

function greenPolyOf(hole: Hole) {
  return hole.features.find((f) => f.kind === 'green')!.poly;
}

describe('pin placement (GS-6)', () => {
  it('every generated hole gets a pin that sits inside the green polygon', () => {
    for (let seed = 0; seed < 60; seed++) {
      const c = generateCourse(seed, { holes: 6, distanceFromStart: seed % 12 });
      for (const hole of c.holes) {
        expect(hole.pin).toBeDefined();
        expect(pointInPoly(hole.pin!, greenPolyOf(hole))).toBe(true);
      }
    }
  });

  it('the pin is deterministic from the seed', () => {
    const a = generateCourse(4242, { holes: 6 });
    const b = generateCourse(4242, { holes: 6 });
    a.holes.forEach((h, i) => expect(h.pin).toEqual(b.holes[i]!.pin));
  });

  it('pins genuinely vary from the green centroid (front/back/tucked flags)', () => {
    let offCentre = 0;
    let total = 0;
    for (let seed = 0; seed < 40; seed++) {
      for (const hole of generateCourse(seed, { holes: 6 }).holes) {
        total++;
        if (dist(hole.pin!, hole.green) > 1) offCentre++;
      }
    }
    // The vast majority should be meaningfully off-centre — a centroid pin is the rare case.
    expect(offCentre / total).toBeGreaterThan(0.9);
  });

  it('the sim aims at the pin, not the centroid', () => {
    const hole = generateCourse(7, { holes: 1 }).holes[0]!;
    expect(pinOf(hole)).toEqual(hole.pin);
  });

  it('pinOf falls back to the centroid for a hole without a generated pin', () => {
    const hole = generateCourse(7, { holes: 1 }).holes[0]!;
    const { pin: _omit, ...noPin } = hole;
    expect(pinOf(noPin as Hole)).toEqual(hole.green);
  });

  it('a course with an off-green pin fails validation (fairness guard)', () => {
    // The generator never does this; assert the contract catches a malformed pin.
    const c = generateCourse(1, { holes: 1 });
    const hole = c.holes[0]!;
    const farPin: [number, number] = [hole.green[0] + 9999, hole.green[1]];
    const bad = { ...c, holes: [{ ...hole, pin: farPin }] };
    // validateCourse is re-exported via the contract; import lazily to keep this focused.
    return import('../src/sim/course/contract').then(({ validateCourse }) => {
      expect(validateCourse(bad).some((e) => /pin is outside the green/.test(e))).toBe(true);
    });
  });
});
