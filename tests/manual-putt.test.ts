import { describe, it, expect } from 'vitest';
import {
  manualPutt,
  MANUAL_IDEAL_PACE,
  DEFAULT_MANUAL_BAND,
  type PuttSkill,
} from '../src/sim/round';
import { Rng } from '../src/sim/rng';
import { dist, type Vec } from '../src/sim/course/contract';
import { loadoutFromPerks, puttSkillOf, startingLoadout } from '../src/sim/rpg/economy';
import { metaStartingLoadout } from '../src/sim/rpg/meta';

const pin: Vec = [0, 0];

/** Make rate of a perfect-pace putt of length `d` over many seeds, at a given skill. */
function makeRate(d: number, skill: PuttSkill, seeds = 300): number {
  let made = 0;
  for (let s = 0; s < seeds; s++) {
    const p = manualPutt(new Rng(`mp:${s}`), [0, d] as Vec, pin, { pace: MANUAL_IDEAL_PACE }, skill);
    if (p.holed) made++;
  }
  return made / seeds;
}

describe('manual putt (pace meter) — skill, not luck', () => {
  it('a perfect-pace short putt drops reliably', () => {
    expect(makeRate(1.5, {})).toBeGreaterThan(0.9);
  });

  it('too soft leaves it short (not holed)', () => {
    const p = manualPutt(new Rng('soft'), [0, 6] as Vec, pin, { pace: 0.3 }, {});
    expect(p.holed).toBe(false);
    expect(dist(p.to, pin)).toBeGreaterThan(2); // well short of the cup
  });

  it('too firm runs it well past (not holed)', () => {
    const p = manualPutt(new Rng('firm'), [0, 6] as Vec, pin, { pace: 1.6 }, {});
    expect(p.holed).toBe(false);
    expect(dist(p.to, pin)).toBeGreaterThan(2); // sailed past
  });

  it('a wider make-band (a putter upgrade) sinks more long putts at the same pace', () => {
    const narrow = makeRate(20, { manualBand: DEFAULT_MANUAL_BAND });
    const wide = makeRate(20, { manualBand: 0.4 });
    expect(wide).toBeGreaterThan(narrow);
  });

  it('is deterministic given the same input + seed', () => {
    const a = manualPutt(new Rng('det'), [0, 9] as Vec, pin, { pace: 1.1 }, {});
    const b = manualPutt(new Rng('det'), [0, 9] as Vec, pin, { pace: 1.1 }, {});
    expect(a).toEqual(b);
  });
});

describe('putting upgrades raise the skill', () => {
  it('a base loadout returns no skill override (byte-for-byte auto/headless)', () => {
    expect(puttSkillOf(startingLoadout())).toEqual({});
  });

  it('shop putter perks raise the make window and tighten the stroke', () => {
    const grip = puttSkillOf(loadoutFromPerks(['putting-grip']));
    const tour = puttSkillOf(loadoutFromPerks(['tour-putter']));
    expect(grip.manualBand!).toBeGreaterThan(DEFAULT_MANUAL_BAND);
    expect(grip.makeChance!).toBeGreaterThan(0.85);
    // The epic flat-stick is a bigger lift than a single grip.
    expect(tour.manualBand!).toBeGreaterThan(grip.manualBand!);
    // Stacking grips compounds.
    expect(puttSkillOf(loadoutFromPerks(['putting-grip', 'putting-grip'])).manualBand!).toBeGreaterThan(grip.manualBand!);
  });

  it('the Putting Coach meta upgrade starts the run a steadier putter', () => {
    const coached = puttSkillOf(metaStartingLoadout({ 'putting-coach': 2 }));
    expect(coached.manualBand!).toBeGreaterThan(DEFAULT_MANUAL_BAND);
  });

  it('a bigger make-window upgrade actually sinks more putts', () => {
    const base = makeRate(18, puttSkillOf(startingLoadout()));
    const upgraded = makeRate(18, puttSkillOf(loadoutFromPerks(['tour-putter'])));
    expect(upgraded).toBeGreaterThan(base);
  });
});
