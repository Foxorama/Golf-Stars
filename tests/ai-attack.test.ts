import { describe, expect, it } from 'vitest';
import { attackTarget, playHole, pinOf, type PlayHoleOptions } from '../src/sim/round';
import { Rng } from '../src/sim/rng';
import {
  ENDLESS_ATTACK_GATE,
  currentCourse,
  endlessAttackArmed,
  startRun,
} from '../src/sim/rpg/run';
import {
  autoDecision,
  awaitingPutt,
  beginHole,
  holeResult,
  takePutt,
  takeShot,
} from '../src/sim/rpg/play';
import { netDispersion, puttSkillOf, startingLoadout, usableBag } from '../src/sim/rpg/economy';
import { dist } from '../src/sim/course/contract';

/**
 * GS-ai-attack: the pin-hunting auto-AI. The rules under test:
 *   1. attackPin off (absent OR false) is byte-for-byte the classic percentage play (contract 1).
 *   2. attackTarget returns the FLAG only on a green-reach shot (else the lay-up stands).
 *   3. It arms ONLY in the Unending Universe once the bar is bogey-or-tighter (hole 25+).
 *   4. The interactive auto driver resolves the identical attack (contract 2, auto ≡ interactive).
 *   5. The puttSkill option: {} is byte-identical; a boost sinks more (the perk now reaches the
 *      headless sim, closing the old interactive-only drift).
 */
describe('pin-hunting auto-AI (GS-ai-attack)', () => {
  const hole = currentCourse(startRun(3, 'unending')).holes[0]!;

  it('attackPin=false and absent are byte-identical to the classic play', () => {
    const base = playHole(hole, new Rng('atk'), {});
    const off = playHole(hole, new Rng('atk'), { attackPin: false });
    expect(off).toEqual(base);
  });

  it('puttSkill {} is byte-identical; a boost sinks more across seeds', () => {
    const base = playHole(hole, new Rng('ps'), {});
    const empty = playHole(hole, new Rng('ps'), { puttSkill: {} });
    expect(empty).toEqual(base);
    let basePutts = 0;
    let boostPutts = 0;
    for (let s = 0; s < 40; s++) {
      basePutts += playHole(hole, new Rng(`ps${s}`), {}).putts.length;
      boostPutts += playHole(hole, new Rng(`ps${s}`), {
        puttSkill: { makeChance: 0.98, lagFrac: 0.03, lagSd: 0.02 },
      }).putts.length;
    }
    expect(boostPutts).toBeLessThan(basePutts);
  });

  it('attackTarget: the flag on a green-reach shot, null beyond reach', () => {
    const loadout = startingLoadout();
    const bag = usableBag(loadout.bag, 'fairway', false);
    const flag = pinOf(hole);
    // From a spot 40yd short of the flag every bag reaches — attack.
    const near: [number, number] = [flag[0] - 40, flag[1]];
    expect(attackTarget(hole, near, bag, 1)).toEqual(flag);
    // From 4000yd out nothing reaches — lay up.
    const far: [number, number] = [flag[0] - 4000, flag[1]];
    expect(attackTarget(hole, far, bag, 1)).toBeNull();
    // Low gravity stretches the reach: a carry multiplier can turn a lay-up into a go.
    expect(attackTarget(hole, [flag[0] - 300, flag[1]], bag, 0.1)).toBeNull();
  });

  it('endlessAttackArmed: only the Unending Universe, only past the bogey bar', () => {
    const endless = startRun(5, 'unending');
    expect(ENDLESS_ATTACK_GATE).toBe(1);
    expect(endlessAttackArmed(endless, 0)).toBe(false); // hole 1: quad bar
    expect(endlessAttackArmed({ ...endless, holesSurvived: 23 }, 0)).toBe(false); // hole 24: double
    expect(endlessAttackArmed({ ...endless, holesSurvived: 24 }, 0)).toBe(true); // hole 25: bogey
    expect(endlessAttackArmed({ ...endless, holesSurvived: 24 }, 3)).toBe(true); // hole 28
    expect(endlessAttackArmed({ ...endless, holesSurvived: 100 }, 0)).toBe(true); // birdie wall
    const voyage = startRun(5, 'voyage');
    expect(endlessAttackArmed({ ...voyage, holesSurvived: 100 }, 0)).toBe(false);
  });

  it('auto ≡ interactive under attack: the auto driver resolves the identical hole', () => {
    const loadout = startingLoadout();
    const opts: PlayHoleOptions = {
      bag: loadout.bag,
      dispersionMult: netDispersion(loadout),
      puttSkill: puttSkillOf(loadout),
      attackPin: true,
    };
    for (let s = 0; s < 8; s++) {
      const headless = playHole(hole, new Rng(`par${s}`), opts);
      const rng = new Rng(`par${s}`);
      let p = beginHole(hole, 0);
      let guard = 0;
      while (!p.done && guard++ < 40) {
        p = awaitingPutt(p)
          ? takePutt(p, loadout, rng)
          : takeShot(p, autoDecision(p, loadout, true), loadout, rng, true);
      }
      const played = holeResult(p);
      expect(played.record.strokes).toBe(headless.record.strokes);
      expect(played.putts.length).toBe(headless.putts.length);
      expect(p.holed).toBe(headless.holed);
    }
  });

  it('an attacking approach finishes nearer the flag on average (the point of the mode)', () => {
    // Compare rest-distance to the flag of the FIRST green-reach shot, attack vs safe, many seeds.
    const loadout = startingLoadout();
    const flag = pinOf(hole);
    let atkSum = 0;
    let safeSum = 0;
    let n = 0;
    for (let s = 0; s < 60; s++) {
      const atk = playHole(hole, new Rng(`aim${s}`), { attackPin: true });
      const safe = playHole(hole, new Rng(`aim${s}`), {});
      const last = (ph: typeof atk) => ph.shots[ph.shots.length - 1];
      const a = last(atk);
      const b = last(safe);
      if (!a || !b) continue;
      atkSum += dist(a.rest, flag);
      safeSum += dist(b.rest, flag);
      n++;
    }
    expect(n).toBeGreaterThan(30);
    expect(atkSum / n).toBeLessThan(safeSum / n);
    void loadout;
  });
});
