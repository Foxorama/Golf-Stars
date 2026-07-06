import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { rollOut } from '../src/sim/round';
import { dist, type Vec } from '../src/sim/course/contract';
import { biomeById } from '../src/sim/course/biomes';

describe('green slope (GS-greens-3)', () => {
  it('every hole gets a deterministic green slope within the biome max', () => {
    const max = biomeById('ice-ring')!.greenSlopeMax!;
    for (let s = 0; s < 60; s++) {
      const a = generateCourse(s + 41000, { biome: 'ice-ring', holes: 3 });
      const b = generateCourse(s + 41000, { biome: 'ice-ring', holes: 3 });
      a.holes.forEach((h, i) => {
        expect(h.greenSlope).toBeDefined();
        const mag = Math.hypot(h.greenSlope![0], h.greenSlope![1]);
        expect(mag).toBeLessThanOrEqual(max + 1e-9);
        // determinism: same seed → same slope vector
        expect(h.greenSlope).toEqual(b.holes[i]!.greenSlope);
      });
    }
  });

  it('a downhill roll on the green runs FURTHER than the same energy uphill', () => {
    let downSum = 0;
    let upSum = 0;
    for (let s = 0; s < 80; s++) {
      const h = generateCourse(s + 42000, { biome: 'ice-ring', holes: 1 }).holes[0]!;
      const sl = h.greenSlope!;
      const mag = Math.hypot(sl[0], sl[1]) || 1;
      const u: Vec = [sl[0] / mag, sl[1] / mag];
      const down = rollOut(h, h.green, u, 9, 'green'); // rolling downhill
      const up = rollOut(h, h.green, [-u[0], -u[1]], 9, 'green'); // rolling uphill
      downSum += Math.abs(down.roll);
      upSum += Math.abs(up.roll);
      // Path consistency on a contoured hole (GS-green-contour-2 round 2): |roll| is the ARC
      // length, so the chord to rest can only be shorter. (No fixed lower bound here: with the
      // GS-green-contour-3 gravity creep a downhill roll can settle back toward its start when a
      // hollow sits behind the touchdown — the orbit-guard lower bound lives on the fixed fixture
      // in green-contour.test.ts instead.)
      expect(dist(down.rest, h.green)).toBeLessThanOrEqual(Math.abs(down.roll) + 1e-6);
    }
    expect(downSum).toBeGreaterThan(upSum * 1.3); // downhill clearly outruns uphill on average
  });

  it('backspin can never climb far up a slope (no weird uphill spin)', () => {
    for (let s = 0; s < 80; s++) {
      const gen = generateCourse(s + 43000, { biome: 'ice-ring', holes: 1 }).holes[0]!;
      // The strict invariant is a PLANE property, asserted on a lobe-stripped hole: with contour
      // lobes live (GS-green-contour-2) the roll honestly reads the LOCAL ground, and "uphill on
      // the plane" can cross a hollow's dip — bounded separately below.
      const h = { ...gen, greenContour: undefined };
      const sl = h.greenSlope!;
      const mag = Math.hypot(sl[0], sl[1]) || 1;
      const uphill: Vec = [-sl[0] / mag, -sl[1] / mag]; // toward the high side
      // A strong backspin (K<0) whose travel direction is UPHILL: travel = -dir, so aim dir downhill.
      const down: Vec = [sl[0] / mag, sl[1] / mag];
      const r = rollOut(h, h.green, down, -14, 'green'); // checks back uphill
      // How far did it climb up the slope? (projection of the move onto the uphill direction.)
      const moved: Vec = [r.rest[0] - h.green[0], r.rest[1] - h.green[1]];
      const climbed = moved[0] * uphill[0] + moved[1] * uphill[1];
      expect(climbed).toBeLessThan(8); // brakes hard uphill — never a long uphill spin
      // WITH the contours the climb stays bounded: a local hollow can carry the check a touch past
      // the plane's brake, but never a runaway uphill spin.
      const rc = rollOut(gen, gen.green, down, -14, 'green');
      const movedC: Vec = [rc.rest[0] - gen.green[0], rc.rest[1] - gen.green[1]];
      expect(movedC[0] * uphill[0] + movedC[1] * uphill[1]).toBeLessThan(12);
    }
  });
});
