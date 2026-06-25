import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, playHole } from '../src/sim/round';
import { playTotals } from '../src/sim/score';
import { psAggregate } from '../src/sim/stats';

describe('round simulation (the vertical slice)', () => {
  it('plays a fixed-seed hole to completion, reproducibly', () => {
    const course = generateCourse(1234);
    const hole = course.holes[0]!;

    const a = playHole(hole, new Rng('1234:play'));
    const b = playHole(hole, new Rng('1234:play'));

    // Same seed → byte-identical play (record, shots, everything).
    expect(a.record).toEqual(b.record);
    expect(a.shots.length).toBe(b.shots.length);

    // The ball is always holed and the score is sane.
    expect(a.holed || a.pickedUp).toBe(true);
    expect(a.record.strokes).toBeGreaterThanOrEqual(1);
    expect(a.record.strokes).toBeLessThanOrEqual(12);
    expect(a.stat.putts).toBeGreaterThanOrEqual(0);
  });

  it('produces a scored, contract-valid round across many seeds', () => {
    for (let seed = 0; seed < 100; seed++) {
      const course = generateCourse(seed, { holes: 3 });
      const played = playCourse(course.holes, new Rng(`${seed}:play`));

      expect(played).toHaveLength(3);
      for (const p of played) {
        expect(p.holed || p.pickedUp).toBe(true);
        expect(p.record.strokes).toBeGreaterThanOrEqual(1);
        expect(p.record.strokes).toBeLessThan(20);
      }

      const totals = playTotals(played.map((p) => p.record));
      expect(totals.holesPlayed).toBe(3);
      expect(totals.stableford).toBeGreaterThanOrEqual(0);

      // Stats engine consumes the same play records without throwing.
      const stats = psAggregate(played.map((p) => p.stat));
      expect(stats.holes).toBe(3);
      expect(stats.totalStrokes).toBe(totals.gross);
    }
  });

  it('regression pin: seed 1234 plays to a known score', () => {
    const course = generateCourse(1234);
    const played = playHole(course.holes[0]!, new Rng('1234:play'));
    // Pin the exact outcome so any change to RNG/sim/generator is caught.
    expect({
      par: played.record.par,
      strokes: played.record.strokes,
      putts: played.stat.putts,
      penalties: played.stat.penalties,
    }).toMatchInlineSnapshot(`
      {
        "par": 3,
        "penalties": 0,
        "putts": 1,
        "strokes": 3,
      }
    `);
  });
});
