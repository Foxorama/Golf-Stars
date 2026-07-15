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

  it('the three arc bosses ESCALATE — Arc-II harder than Arc-I, the final harder again (GS-boss-escalation)', () => {
    // Arc rank 0/1/2 = the Arc-I / Arc-II / Arc-III (final) boss. Higher rank = tighter, longer, and the
    // final (rank 2) pin-hunts even at A0. Rank 0 is byte-identical to the classic boss.
    expect(bossLoadout(boss.id, false, { arcRank: 0 })).toEqual(bossLoadout(boss.id));
    let prevHcp = Infinity;
    let prevDisp = Infinity;
    let prevDrive = 0;
    for (const arcRank of [0, 1, 2]) {
      const lo = bossLoadout(boss.id, false, { arcRank });
      expect(lo.handicap).toBeLessThanOrEqual(prevHcp);
      expect(lo.dispersionMult).toBeLessThanOrEqual(prevDisp);
      const drive = Math.max(...lo.bag.map((c) => c.carry));
      expect(drive).toBeGreaterThanOrEqual(prevDrive);
      prevHcp = lo.handicap;
      prevDisp = lo.dispersionMult;
      prevDrive = drive;
    }
    // The final is STRICTLY sharper than the Arc-I boss on every knob (a real climb, even at A0).
    const arc1 = bossLoadout(boss.id, false, { arcRank: 0 });
    const final = bossLoadout(boss.id, false, { arcRank: 2 });
    expect(final.handicap).toBeLessThan(arc1.handicap);
    expect(final.dispersionMult).toBeLessThan(arc1.dispersionMult);
    expect(Math.max(...final.bag.map((c) => c.carry))).toBeGreaterThan(Math.max(...arc1.bag.map((c) => c.carry)));
    // The final boss pin-hunts even at A0; Arc-I/II at A0 stay the percentage player.
    expect(bossPlayOpts(boss.id, false, { arcRank: 0 }).attackPin).toBe(false);
    expect(bossPlayOpts(boss.id, false, { arcRank: 1 }).attackPin).toBe(false);
    expect(bossPlayOpts(boss.id, false, { arcRank: 2 }).attackPin).toBe(true);
    // The final boss actually scores better than the Arc-I boss across seeds (the escalation bites).
    let arc1Strokes = 0;
    let finalStrokes = 0;
    for (let s = 0; s < 30; s++) {
      const c = currentCourse({ ...startRun(s, 'voyage'), stopIndex: 2 });
      for (const h of c.holes) {
        arc1Strokes += playHole(h, new Rng(`e${s}`), bossPlayOpts(boss.id, false, { arcRank: 0 })).record.strokes;
        finalStrokes += playHole(h, new Rng(`e${s}`), bossPlayOpts(boss.id, false, { arcRank: 2 })).record.strokes;
      }
    }
    expect(finalStrokes).toBeLessThan(arc1Strokes);
  });

  it('bossEdgeForRun derives the arc rank from the boss cutBonus (Arc-I 0 → final 2)', () => {
    const run = startRun(3, 'voyage', {}, 'feather-fade', 0);
    // Voyage boss stops: 2 (Arc-I, cutBonus 1), 5 (Arc-II, 2), 8 (final, 3) → ranks 0, 1, 2.
    expect(bossEdgeForRun({ ...run, stopIndex: 2 }).arcRank).toBe(0);
    expect(bossEdgeForRun({ ...run, stopIndex: 5 }).arcRank).toBe(1);
    expect(bossEdgeForRun({ ...run, stopIndex: 8 }).arcRank).toBe(2);
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
    expect(bossEdgeForRun(run)).toEqual({ ascension: 8, bagTier: run.bagTier, arcRank: 0 });

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
