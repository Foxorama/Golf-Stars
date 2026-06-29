import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, playHole, pickBetterExec, type ExecResult } from '../src/sim/round';
import { playTotals } from '../src/sim/score';
import { Rng } from '../src/sim/rng';
import { characterShotMods } from '../src/sim/rpg/characters';
import { scrambleOptsFor, startRun, currentBoss, teamDuelSetupForRun } from '../src/sim/rpg/run';

describe('co-op scramble bosses (GS-scramble)', () => {
  it('pickBetterExec prefers holed, then fewer penalties, then closer to the flag', () => {
    const flag: [number, number] = [0, 0];
    const mk = (over: Partial<ExecResult>): ExecResult => ({
      log: {} as any,
      ballAfter: [10, 0],
      lieAfter: 'fairway',
      restLie: 'fairway',
      penaltyStrokes: 0,
      holed: false,
      ...over,
    });
    // Partner closer → partner kept.
    expect(pickBetterExec(mk({ ballAfter: [20, 0] }), mk({ ballAfter: [5, 0] }), flag).partnerKept).toBe(true);
    // Player avoided a penalty the partner took → player kept even if partner is closer.
    expect(
      pickBetterExec(mk({ ballAfter: [20, 0], penaltyStrokes: 0 }), mk({ ballAfter: [5, 0], penaltyStrokes: 1 }), flag)
        .partnerKept,
    ).toBe(false);
    // Partner holed → partner kept.
    expect(pickBetterExec(mk({ ballAfter: [20, 0] }), mk({ holed: true }), flag).partnerKept).toBe(true);
  });

  it('a scramble (best-of-two) scores at least as well as solo, on average better', () => {
    const partner = characterShotMods('huang-woo-hook');
    let solo = 0;
    let scram = 0;
    const N = 24;
    for (let s = 0; s < N; s++) {
      const c = generateCourse(`bsc:${s}`, { holes: 9, distanceFromStart: 8 });
      const a = playCourse(c.holes, new Rng(`bsc:${s}:p`), {});
      const b = playCourse(c.holes, new Rng(`bsc:${s}:p`), { scramble: { partnerMods: partner } });
      solo += playTotals(a.map((p) => p.record)).stableford;
      scram += playTotals(b.map((p) => p.record)).stableford;
    }
    expect(scram).toBeGreaterThan(solo);
  });

  it('scramble OFF is byte-for-byte the solo hole (no extra rng)', () => {
    const c = generateCourse('bsc:eq', { holes: 6, distanceFromStart: 5 });
    const a = playHole(c.holes[0]!, new Rng('z'), {});
    const b = playHole(c.holes[0]!, new Rng('z'), { scramble: undefined });
    expect(a).toEqual(b);
  });

  it('scrambleOptsFor arms only when the player is the underdog on a SCRAMBLE team duel', () => {
    let run = startRun(5, 'voyage', {}, 'feather-fade');
    expect(scrambleOptsFor(run)).toBeUndefined(); // stop 0, not a boss
    // Jump to the Arc-II team-duel boss (stop 5).
    run = { ...run, stopIndex: 5 };
    expect(currentBoss(run)?.team).toBe('random');
    const setup = teamDuelSetupForRun(run)!;
    expect(setup).toBeDefined();
    expect(['scramble', 'bestball']).toContain(setup.format);
    // With no arc history the player defaults to the underdog (gets the assist).
    expect(setup.partnerSide).toBe('player');
    // The player's solo ball scrambles ONLY when the resolved format is scramble.
    if (setup.format === 'scramble') {
      expect(scrambleOptsFor(run)?.partnerMods).toBeTypeOf('function');
    } else {
      expect(scrambleOptsFor(run)).toBeUndefined(); // best-ball is a parallel ball, not per-shot scramble
    }
    // The Arc-I boss (stop 2) is a solo matchplay boss → no team setup, no scramble.
    expect(teamDuelSetupForRun({ ...run, stopIndex: 2 })).toBeUndefined();
    expect(scrambleOptsFor({ ...run, stopIndex: 2 })).toBeUndefined();
  });
});
