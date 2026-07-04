import { describe, expect, it } from 'vitest';
import {
  BOSS_ATTACK_ASCENSION,
  bossLoadout,
  bossPlayOpts,
  playMatchStop,
} from '../src/sim/rpg/match';
import { GOLFERS, golferProfile } from '../src/sim/rpg/golfers';
import { Rng } from '../src/sim/rng';
import { bossEdgeForRun, currentCourse, playerHoleOpts, startRun } from '../src/sim/rpg/run';
import { playHole } from '../src/sim/round';

/**
 * GS-boss-scale: bosses sharpen with the run's Ascension tier and bring the run's bag rarity
 * (gear parity), so the duels keep pace with the player's growing build. The contract under test:
 *   1. A0 + common bag is the CLASSIC boss, byte-for-byte (no edge, no attack, stock putting).
 *   2. Each knob moves the right way as the tier rises (handicap ↓, dispersion ↓, distance ↑).
 *   3. Gear parity: the boss's bag re-stamps to the run's tier.
 *   4. The whole edge actually plays better golf (mean strokes ↓ across seeds).
 */
describe('ascension-scaled bosses (GS-boss-scale)', () => {
  // The sharpest golfer in the roster (leaderboard leaders are the top-rated) — skill+accuracy is
  // the same pair bossLoadout's handicap reads.
  const rate = (id: string) => golferProfile(id).skill + golferProfile(id).accuracy;
  const boss = [...GOLFERS].sort((a, b) => rate(b.id) - rate(a.id))[0]!;

  it('A0 + common bag is the classic boss, byte-for-byte', () => {
    const classic = bossLoadout(boss.id);
    const a0 = bossLoadout(boss.id, false, { ascension: 0, bagTier: 'common' });
    expect(a0).toEqual(classic);
    const opts = bossPlayOpts(boss.id, false, { ascension: 0, bagTier: 'common' });
    expect(opts.attackPin).toBe(false);
    expect(opts.puttSkill).toEqual({});
    // And the played ball is identical.
    const hole = currentCourse(startRun(7, 'voyage')).holes[0]!;
    const classicBall = playHole(hole, new Rng('boss'), bossPlayOpts(boss.id));
    const a0Ball = playHole(hole, new Rng('boss'), opts);
    expect(a0Ball).toEqual(classicBall);
  });

  it('the knobs move the right way as the tier rises', () => {
    let prevHcp = Infinity;
    let prevDisp = Infinity;
    let prevDrive = 0;
    for (const asc of [0, 4, 8, 12]) {
      const lo = bossLoadout(boss.id, false, { ascension: asc });
      expect(lo.handicap).toBeLessThanOrEqual(prevHcp);
      expect(lo.dispersionMult).toBeLessThanOrEqual(prevDisp);
      const drive = Math.max(...lo.bag.map((c) => c.carry));
      expect(drive).toBeGreaterThanOrEqual(prevDrive);
      prevHcp = lo.handicap;
      prevDisp = lo.dispersionMult;
      prevDrive = drive;
    }
    // Strictly sharper end-to-end.
    expect(bossLoadout(boss.id, false, { ascension: 12 }).dispersionMult).toBeLessThan(1);
    expect(Math.max(...bossLoadout(boss.id, false, { ascension: 12 }).bag.map((c) => c.carry))).toBeGreaterThan(
      Math.max(...bossLoadout(boss.id).bag.map((c) => c.carry)),
    );
    // Pin-hunting flips on at the attack tier.
    expect(bossPlayOpts(boss.id, false, { ascension: BOSS_ATTACK_ASCENSION - 1 }).attackPin).toBe(false);
    expect(bossPlayOpts(boss.id, false, { ascension: BOSS_ATTACK_ASCENSION }).attackPin).toBe(true);
  });

  it('gear parity: the boss bag re-stamps to the run bag tier', () => {
    const common = bossLoadout(boss.id, false, { bagTier: 'common' });
    const epic = bossLoadout(boss.id, false, { bagTier: 'epic' });
    // Same club types, longer sticks (the epic set adds carry over the starter set).
    expect(epic.bag.map((c) => c.id).sort()).toEqual(common.bag.map((c) => c.id).sort());
    const carryOf = (lo: typeof common, id: string) => lo.bag.find((c) => c.id === id)!.carry;
    for (const c of common.bag) expect(carryOf(epic, c.id)).toBeGreaterThanOrEqual(c.carry);
    expect(Math.max(...epic.bag.map((c) => c.carry))).toBeGreaterThan(Math.max(...common.bag.map((c) => c.carry)));
  });

  it('bossEdgeForRun plumbs the run tier + bag; the scaled duel is deterministic and plays better', () => {
    const run = startRun(11, 'voyage', {}, 'feather-fade', 8);
    expect(bossEdgeForRun(run)).toEqual({ ascension: 8, bagTier: run.bagTier });

    const holes = currentCourse(run).holes;
    const playerOpts = playerHoleOpts(run);
    const duel = (edge: { ascension: number }) =>
      playMatchStop(holes, playerOpts, boss.id, new Rng('p'), new Rng('b'), false, edge);
    // Deterministic: same inputs, same duel.
    expect(duel({ ascension: 8 })).toEqual(duel({ ascension: 8 }));
    // The edge plays better golf on average across seeds (not per-seed — golf is noisy).
    let classic = 0;
    let sharpened = 0;
    for (let s = 0; s < 30; s++) {
      const c = currentCourse(startRun(s, 'voyage'));
      for (const h of c.holes) {
        classic += playHole(h, new Rng(`c${s}`), bossPlayOpts(boss.id)).record.strokes;
        sharpened += playHole(h, new Rng(`c${s}`), bossPlayOpts(boss.id, false, { ascension: 12, bagTier: 'legendary' })).record.strokes;
      }
    }
    expect(sharpened).toBeLessThan(classic);
  });
});
