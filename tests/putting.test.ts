import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import { playHole, onePutt, puttOutFrom, HOLE_OUT_RADIUS } from '../src/sim/round';
import { dist, type Vec } from '../src/sim/course/contract';
import { loadoutFromPerks, puttSkillOf, startingLoadout } from '../src/sim/rpg/economy';

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
      // When the hole is actually holed (not picked up at the cap), the last putt drops
      // at the pin and no earlier putt does.
      if (!played.pickedUp) {
        expect(putts[putts.length - 1]!.holed).toBe(true);
        expect(putts.slice(0, -1).every((p) => !p.holed)).toBe(true);
        expect(dist(putts[putts.length - 1]!.to, hole.green)).toBeLessThanOrEqual(0.001);
      }
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

describe('manual vs auto putting (shared model)', () => {
  const pin: Vec = [0, 0];
  const from: Vec = [0, 9]; // 9 yds out

  it('stepping onePutt by hand reproduces the auto putt-out exactly', () => {
    const auto = puttOutFrom(new Rng('putt'), from, pin, 6);
    // Manual: same seed, step onePutt until holed or budget spent.
    const rng = new Rng('putt');
    const log = [];
    let pos: Vec = from;
    let n = 0;
    while (dist(pos, pin) > HOLE_OUT_RADIUS && n < 6) {
      n++;
      const p = onePutt(rng, pos, pin);
      log.push(p);
      pos = p.to;
      if (p.holed) break;
    }
    expect(log).toEqual(auto.log);
    expect(n).toBe(auto.putts);
  });
});

describe('Auto-Caddie (legendary auto-putt perk)', () => {
  it('grants autoPutt and a steadier stroke', () => {
    const base = startingLoadout();
    expect(base.autoPutt).toBeFalsy();
    expect(puttSkillOf(base)).toEqual({});

    const caddie = loadoutFromPerks(['auto-caddie']);
    expect(caddie.autoPutt).toBe(true);
    expect(puttSkillOf(caddie).makeChance).toBeGreaterThan(0.85);
  });

  it('sinks putts in fewer strokes on average than the base stroke', () => {
    const tally = (skill: ReturnType<typeof puttSkillOf>): number => {
      let total = 0;
      for (let s = 0; s < 200; s++) {
        total += puttOutFrom(new Rng(`${s}:putt`), [0, 7] as Vec, [0, 0] as Vec, 6, skill).putts;
      }
      return total;
    };
    expect(tally(puttSkillOf(loadoutFromPerks(['auto-caddie'])))).toBeLessThan(tally(puttSkillOf(startingLoadout())));
  });
});
