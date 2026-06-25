import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, playHole, HOLE_OUT_RADIUS } from '../src/sim/round';
import { dist } from '../src/sim/course/contract';

describe('bounce & roll-out (GS feedback #2)', () => {
  it('shots record a rest position reached by rolling (signed) from touchdown', () => {
    let sawRoll = false;
    let sawCheck = false;
    for (let seed = 0; seed < 60 && (!sawRoll || !sawCheck); seed++) {
      const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      for (const s of playHole(hole, new Rng(`${seed}:play`)).shots) {
        if (s.penalty) continue;
        // `roll` is SIGNED (long clubs run forward, wedges check back); the rest is that
        // many yards from touchdown, so the distance equals its magnitude.
        expect(dist(s.rest, s.result.landing)).toBeCloseTo(Math.abs(s.roll), 1);
        if (s.roll > 0.5) sawRoll = true;
        if (s.roll < -0.5) sawCheck = true; // a wedge spun back
      }
    }
    expect(sawRoll).toBe(true);
    expect(sawCheck).toBe(true); // backspin happens somewhere across these seeds
  });

  it('is deterministic (same seed → same roll & rest)', () => {
    const hole = generateCourse(7, { holes: 1 }).holes[0]!;
    const a = playHole(hole, new Rng('7:play')).shots.map((s) => [s.roll, s.rest]);
    const b = playHole(hole, new Rng('7:play')).shots.map((s) => [s.roll, s.rest]);
    expect(a).toEqual(b);
  });
});

describe('hole-outs (GS feedback #3)', () => {
  it('chip-ins/aces are possible: some shot holes out across seeds, at the cup', () => {
    let holeouts = 0;
    for (let seed = 0; seed < 300; seed++) {
      const course = generateCourse(seed, { holes: 6 });
      for (const p of playCourse(course.holes, new Rng(`${seed}:play`))) {
        p.shots.forEach((s, i) => {
          if (s.holed) {
            holeouts++;
            // A holed shot is the last shot of the hole and needs no putts.
            expect(i).toBe(p.shots.length - 1);
            expect(p.stat.putts).toBe(0);
          }
        });
      }
    }
    expect(holeouts).toBeGreaterThan(0);
  });

  it('a holed shot leaves the ball within the hole-out radius of the green', () => {
    for (let seed = 0; seed < 300; seed++) {
      const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      const played = playHole(hole, new Rng(`${seed}:play`));
      const holer = played.shots.find((s) => s.holed);
      if (holer) {
        expect(dist(holer.rest, hole.green)).toBeLessThanOrEqual(HOLE_OUT_RADIUS + 1e-6);
      }
    }
  });
});
