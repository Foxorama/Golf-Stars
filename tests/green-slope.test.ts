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
      // The straight-roll invariant survives slope modulation.
      expect(dist(down.rest, h.green)).toBeCloseTo(Math.abs(down.roll), 5);
    }
    expect(downSum).toBeGreaterThan(upSum * 1.3); // downhill clearly outruns uphill on average
  });

  it('backspin can never climb far up a slope (no weird uphill spin)', () => {
    for (let s = 0; s < 80; s++) {
      const h = generateCourse(s + 43000, { biome: 'ice-ring', holes: 1 }).holes[0]!;
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
    }
  });
});
