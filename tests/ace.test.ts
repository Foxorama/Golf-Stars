import { describe, it, expect } from 'vitest';
import {
  ACE_CREDIT_BONUS,
  ACE_TALENT_ID,
  aceCount,
  aceCreditBonus,
  grantAceTalent,
  creditsForStop,
  talentItem,
  talentsForArchetype,
  startingLoadout,
  loadoutFromPerks,
} from '../src/sim/rpg/economy';
import { startRun, finishStop, snapshotRun, resumeRun, bossRewards } from '../src/sim/rpg/run';
import { playTotals } from '../src/sim/score';

/** A passing 6-hole stop (all birdies) — optionally with the FIRST hole aced (the tee shot holed). */
function stopWith(ace: boolean): { record: { par: number; strokes: number }; holed: boolean; pickedUp: boolean }[] {
  const holes = Array.from({ length: 6 }, () => ({ record: { par: 4, strokes: 3 }, holed: true, pickedUp: false }));
  if (ace) holes[0] = { record: { par: 3, strokes: 1 }, holed: true, pickedUp: false };
  return holes;
}

const course = { holes: new Array(6).fill(0), biome: 'x', rarity: 'common' } as never;

describe('hole-in-one reward (GS-ace)', () => {
  it('aceCount + aceCreditBonus only count a tee shot holed (strokes === 1)', () => {
    expect(aceCount(stopWith(false))).toBe(0);
    expect(aceCount(stopWith(true))).toBe(1);
    // A holed shot that took more than one stroke (a chip-in) is NOT an ace.
    expect(aceCount([{ record: { strokes: 2 }, holed: true }])).toBe(0);
    expect(aceCreditBonus(stopWith(true))).toBe(ACE_CREDIT_BONUS);
    expect(aceCreditBonus(stopWith(false))).toBe(0);
  });

  it("grantAceTalent stacks Ace's Touch — tighter per ace, identity at zero", () => {
    const base = startingLoadout();
    expect(grantAceTalent(base, 0)).toBe(base); // no ace → byte-for-byte the same object
    const one = grantAceTalent(base, 1);
    expect(one.dispersionMult).toBeLessThan(base.dispersionMult);
    expect(one.perks.filter((p) => p === ACE_TALENT_ID)).toHaveLength(1);
    const two = grantAceTalent(base, 2);
    expect(two.dispersionMult).toBeLessThan(one.dispersionMult); // a second ace stacks tighter
    expect(two.perks.filter((p) => p === ACE_TALENT_ID)).toHaveLength(2);
  });

  it("Ace's Touch is never offered in the shop or by a boss (ace-only)", () => {
    expect(talentItem(ACE_TALENT_ID)).toBeDefined(); // but resolvable, so it rebuilds on resume
    for (const arch of ['inferno', 'frost', 'desert', 'void', 'verdant']) {
      const { themed, generic } = talentsForArchetype(arch);
      expect([...themed, ...generic].some((t) => t.id === ACE_TALENT_ID)).toBe(false);
    }
    const run = startRun('ace-boss', 'voyage', {}, 'feather-fade');
    const rewards = bossRewards({ ...run, stopIndex: 2, distanceFromStart: 4 }, 'inferno');
    expect(rewards.some((r) => r.id === ACE_TALENT_ID)).toBe(false);
  });

  it('finishStop pays the ace jackpot + applies the talent, and records result.aces', () => {
    const run = startRun('ace-finish');
    const before = run.loadout.dispersionMult;
    const { run: scored, result } = finishStop(run, course, stopWith(true) as never);
    expect(result.aces).toBe(1);
    // Credits = the Stableford payout WITH the ace bonus folded into the pre-multiplier base.
    const sf = playTotals(stopWith(true).map((p) => p.record)).stableford;
    expect(scored.credits).toBe(run.credits + creditsForStop(sf, 1, ACE_CREDIT_BONUS));
    // The Ace's Touch talent is applied + recorded on the perks (so it rebuilds on resume).
    expect(scored.loadout.dispersionMult).toBeLessThan(before);
    expect(scored.loadout.perks).toContain(ACE_TALENT_ID);
  });

  it('a stop with no ace is unchanged — no bonus, no talent (the no-regression guard)', () => {
    const run = startRun('ace-none');
    const { run: scored, result } = finishStop(run, course, stopWith(false) as never);
    expect(result.aces).toBe(0);
    const sf = playTotals(stopWith(false).map((p) => p.record)).stableford;
    expect(scored.credits).toBe(run.credits + creditsForStop(sf, 1, 0));
    expect(scored.loadout.dispersionMult).toBe(run.loadout.dispersionMult);
    expect(scored.loadout.perks).not.toContain(ACE_TALENT_ID);
  });

  it('the ace talent survives snapshot/resume (rebuilt from perks)', () => {
    const run = startRun('ace-resume');
    const { run: scored } = finishStop(run, course, stopWith(true) as never);
    const resumed = resumeRun(snapshotRun(scored));
    // The resumed loadout carries the same stacked precision the live run had.
    expect(resumed.loadout.dispersionMult).toBeCloseTo(scored.loadout.dispersionMult, 10);
    expect(resumed.loadout.perks).toContain(ACE_TALENT_ID);
    // And loadoutFromPerks alone rebuilds it identically.
    expect(loadoutFromPerks([ACE_TALENT_ID]).dispersionMult).toBeLessThan(startingLoadout().dispersionMult);
  });
});
