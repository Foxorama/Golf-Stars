import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse } from '../src/sim/round';
import { playTotals } from '../src/sim/score';
import {
  STARTING_HANDICAP,
  handicapDispersion,
  netDispersion,
  startingLoadout,
  loadoutFromPerks,
} from '../src/sim/rpg/economy';

describe('handicap model (RPG shot resolution)', () => {
  it('lower handicap = tighter dispersion factor, clamped to [0,36]', () => {
    expect(handicapDispersion(0)).toBeLessThan(handicapDispersion(18));
    expect(handicapDispersion(18)).toBeLessThan(handicapDispersion(36));
    expect(handicapDispersion(-10)).toBe(handicapDispersion(0)); // clamp
    expect(handicapDispersion(99)).toBe(handicapDispersion(36)); // clamp
  });

  it('net dispersion stacks handicap skill with equipment', () => {
    const lo = startingLoadout();
    expect(netDispersion(lo)).toBeCloseTo(handicapDispersion(STARTING_HANDICAP));
    const tighter = { ...lo, dispersionMult: 0.85 };
    expect(netDispersion(tighter)).toBeCloseTo(handicapDispersion(STARTING_HANDICAP) * 0.85);
  });

  it('the Pro Coach card lowers handicap (rebuilds from perks)', () => {
    const lo = loadoutFromPerks(['pro-coach']);
    expect(lo.handicap).toBe(STARTING_HANDICAP - 6);
    expect(loadoutFromPerks([]).handicap).toBe(STARTING_HANDICAP);
  });

  it('a lower handicap scores better on average (skill matters)', () => {
    const meanStableford = (handicap: number): number => {
      const lo = { ...startingLoadout(), handicap };
      let sf = 0;
      for (let s = 0; s < 200; s++) {
        const c = generateCourse(`${s}:h`, { holes: 6, distanceFromStart: s % 12 });
        const played = playCourse(c.holes, new Rng(`${c.seed}:play`), {
          bag: lo.bag,
          dispersionMult: netDispersion(lo),
        });
        sf += playTotals(played.map((p) => p.record)).stableford;
      }
      return sf / 200;
    };
    // Scratch (0) should out-score a 30-handicap over many stops.
    expect(meanStableford(0)).toBeGreaterThan(meanStableford(30));
  });
});
