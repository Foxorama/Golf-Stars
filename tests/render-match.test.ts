import { describe, it, expect } from 'vitest';
import { holeProjector } from '../src/render/project';
import { generateCourse } from '../src/sim/course/generate';
import { pointInPoly, dist, type Vec } from '../src/sim/course/contract';

describe('projector inverse (tap/drag aiming + render match)', () => {
  const hole = generateCourse(1234).holes[0]!;

  it('unproject is the inverse of project (whole-hole fit)', () => {
    const proj = holeProjector(hole, { width: 320, height: 460 });
    for (const p of [hole.tee, hole.green, [hole.tee[0] + 30, hole.tee[1] + 90]] as Vec[]) {
      const [sx, sy] = proj.project(p);
      const back = proj.unproject(sx, sy);
      expect(dist(p, back)).toBeLessThan(1e-6);
    }
  });

  it('unproject is the inverse of project (focus/zoom fit)', () => {
    const proj = holeProjector(hole, { width: 320, height: 460, focus: hole.tee, viewRadius: 180 });
    for (const p of [hole.tee, [hole.tee[0] + 20, hole.tee[1] + 40], [hole.tee[0] - 50, hole.tee[1] + 120]] as Vec[]) {
      const [sx, sy] = proj.project(p);
      const back = proj.unproject(sx, sy);
      expect(dist(p, back)).toBeLessThan(1e-6);
    }
  });

  it('focus mode centres the focus point (ball low, by bias)', () => {
    const W = 320;
    const H = 460;
    const proj = holeProjector(hole, { width: W, height: H, focus: hole.green, viewRadius: 100, focusBias: 0.62 });
    const [x, y] = proj.project(hole.green);
    expect(x).toBeCloseTo(W / 2, 3);
    expect(y).toBeCloseTo(H * 0.62, 3);
  });
});

describe('render match: a ball on a surface draws on that surface', () => {
  // The projection is affine, so point-in-polygon is preserved course→screen: a ball inside
  // the green polygon is drawn inside the drawn green. This is what makes the on-green
  // (auto-)putt marker line up with the green graphic. Verified across several seeds/holes.
  for (const seed of [1, 7, 42, 1234]) {
    it(`seed ${seed}: the pin and green centroid project inside the drawn green polygon`, () => {
      const course = generateCourse(seed);
      for (const hole of course.holes) {
        const greenPoly = hole.features.find((f) => f.kind === 'green')!.poly;
        const pin = hole.pin ?? hole.green;
        // Course-space sanity (validateCourse already guarantees the pin is on the green).
        expect(pointInPoly(pin, greenPoly)).toBe(true);
        // Screen-space: the SAME projector maps both, so inside stays inside.
        const proj = holeProjector(hole, { width: 320, height: 460, focus: pin, viewRadius: 60 });
        const screenPoly = greenPoly.map((p) => proj.project(p));
        expect(pointInPoly(proj.project(pin), screenPoly)).toBe(true);
        expect(pointInPoly(proj.project(hole.green), screenPoly)).toBe(true);
      }
    });
  }
});
