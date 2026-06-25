import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, MAX_OVER_PAR } from '../src/sim/round';
import { playTotals } from '../src/sim/score';

describe('max-score / pick-up rule', () => {
  it('no hole ever exceeds par + MAX_OVER_PAR', () => {
    for (let seed = 0; seed < 200; seed++) {
      const course = generateCourse(seed, { holes: 6, wildness: 1 });
      for (const p of playCourse(course.holes, new Rng(`${seed}:play`))) {
        expect(p.record.strokes).toBeLessThanOrEqual(p.record.par + MAX_OVER_PAR);
      }
    }
  });

  it('picked-up holes are flagged and scored exactly par + MAX_OVER_PAR', () => {
    let pickups = 0;
    for (let seed = 0; seed < 300; seed++) {
      const course = generateCourse(seed, { holes: 6, wildness: 1 });
      for (const p of playCourse(course.holes, new Rng(`${seed}:play`))) {
        if (p.pickedUp) {
          pickups++;
          expect(p.holed).toBe(false);
          expect(p.record.strokes).toBe(p.record.par + MAX_OVER_PAR);
        }
      }
    }
    expect(pickups).toBeGreaterThan(0); // the cap actually triggers at max wildness
  });

  it('the cap does not change Stableford (a +4 hole already scores 0, like any blow-up)', () => {
    // A hole at par+2..+anything all score 0 Stableford, so capping gross at +4 leaves the
    // Stableford total — and therefore the cut — unchanged.
    const recs = [
      { par: 4, strokes: 4 }, // 2 pts
      { par: 4, strokes: 8 }, // blow-up → 0
      { par: 5, strokes: 9 }, // capped blow-up (+4) → 0
    ];
    expect(playTotals(recs).stableford).toBe(2);
  });
});
