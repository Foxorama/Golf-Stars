import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import { playHole } from '../src/sim/round';
import { dist } from '../src/sim/course/contract';

describe('putting path (GS-4)', () => {
  it('putt log is continuous, ends holed, and matches the putt count', () => {
    let checked = 0;
    for (let seed = 0; seed < 60 && checked < 40; seed++) {
      const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      const played = playHole(hole, new Rng(`${seed}:play`));
      const putts = played.putts;
      // Count matches the stat.
      expect(putts.length).toBe(played.stat.putts);
      if (putts.length === 0) continue;
      checked++;
      // Continuity: each putt starts where the previous ended.
      for (let i = 1; i < putts.length; i++) {
        expect(putts[i]!.from).toEqual(putts[i - 1]!.to);
      }
      // Exactly the last putt is holed, and it finishes at the pin.
      expect(putts[putts.length - 1]!.holed).toBe(true);
      expect(putts.slice(0, -1).every((p) => !p.holed)).toBe(true);
      expect(dist(putts[putts.length - 1]!.to, hole.green)).toBeLessThanOrEqual(0.001);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('is deterministic for a fixed seed', () => {
    const hole = generateCourse(1234, { holes: 1 }).holes[0]!;
    const a = playHole(hole, new Rng('1234:play')).putts;
    const b = playHole(hole, new Rng('1234:play')).putts;
    expect(a).toEqual(b);
  });

  it('putts get monotonically closer to the pin (a lag never overshoots farther)', () => {
    const hole = generateCourse(3, { holes: 1 }).holes[0]!;
    const putts = playHole(hole, new Rng('3:play')).putts;
    for (let i = 1; i < putts.length; i++) {
      const prev = dist(putts[i - 1]!.from, hole.green);
      const here = dist(putts[i]!.from, hole.green);
      expect(here).toBeLessThanOrEqual(prev + 0.001);
    }
  });
});
