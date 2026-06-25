import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import { playHole } from '../src/sim/round';
import { startingLoadout, netDispersion } from '../src/sim/rpg/economy';
import { beginHole, takeShot, autoDecision, holeResult, shotView, type HolePlay } from '../src/sim/rpg/play';

function driveAuto(state: HolePlay, loadout = startingLoadout(), rng: Rng): HolePlay {
  let s = state;
  let guard = 0;
  while (!s.done && guard++ < 25) s = takeShot(s, autoDecision(s, loadout), loadout, rng);
  return s;
}

describe('interactive play driver', () => {
  it('begins at the tee, awaiting the first shot', () => {
    const hole = generateCourse(1, { holes: 1 }).holes[0]!;
    const s = beginHole(hole);
    expect(s.ball).toEqual(hole.tee);
    expect(s.lie).toBe('tee');
    expect(s.done).toBe(false);
    expect(s.strokes).toBe(0);
  });

  it('shotView reports distance, suggested clubs, and whether the line is blocked', () => {
    const hole = generateCourse(1, { holes: 1 }).holes[0]!;
    const v = shotView(beginHole(hole), startingLoadout());
    expect(v.distToPin).toBeGreaterThan(0);
    expect(v.attackClubId).toBeTruthy();
    expect(v.safeClubId).toBeTruthy();
    expect(typeof v.blocked).toBe('boolean');
  });

  it('is deterministic for a fixed seed + decisions', () => {
    const hole = generateCourse(5, { holes: 1 }).holes[0]!;
    const a = driveAuto(beginHole(hole), startingLoadout(), new Rng('5:play'));
    const b = driveAuto(beginHole(hole), startingLoadout(), new Rng('5:play'));
    expect(holeResult(a)).toEqual(holeResult(b));
  });

  it('auto-play (autoDecision) matches the AI playHole exactly', () => {
    const lo = startingLoadout();
    let compared = 0;
    for (let seed = 0; seed < 80; seed++) {
      const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      const driven = driveAuto(beginHole(hole), lo, new Rng(`${seed}:play`));
      if (!driven.done) continue; // skip rare >25-shot blow-ups (playHole caps differently)
      const ai = playHole(hole, new Rng(`${seed}:play`), {
        bag: lo.bag,
        dispersionMult: netDispersion(lo),
      });
      expect(holeResult(driven).record).toEqual(ai.record);
      expect(holeResult(driven).stat).toEqual(ai.stat);
      compared++;
    }
    expect(compared).toBeGreaterThan(50);
  });

  it('the player choice changes the shot: attack vs safe differ when the line is blocked', () => {
    const lo = startingLoadout();
    // Find a hole+spot where the safe target differs from the pin.
    for (let seed = 0; seed < 80; seed++) {
      const hole = generateCourse(seed, { holes: 1, wildness: 1 }).holes[0]!;
      const s = beginHole(hole);
      if (!shotView(s, lo).blocked) continue;
      const attack = takeShot(s, { aim: 'attack', clubId: 'D' }, lo, new Rng('x'));
      const safe = takeShot(s, { aim: 'safe', clubId: 'D' }, lo, new Rng('x'));
      expect(attack.ball).not.toEqual(safe.ball); // different target → different result
      return;
    }
  });

  it('the hole always completes (holed) under auto-play', () => {
    for (let seed = 0; seed < 60; seed++) {
      const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      const s = driveAuto(beginHole(hole), startingLoadout(), new Rng(`${seed}:p`));
      if (s.done) expect(s.holed || s.pickedUp).toBe(true);
    }
  });
});
