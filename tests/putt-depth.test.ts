import { describe, it, expect } from 'vitest';
import {
  manualPutt,
  puttBandDistanceFactor,
  DEFAULT_PUTT_RANGE,
  DEFAULT_MANUAL_BAND,
  type PuttSkill,
} from '../src/sim/round';
import { Rng } from '../src/sim/rng';
import type { Vec } from '../src/sim/course/contract';
import { generateCourse } from '../src/sim/course/generate';
import { loadoutFromPerks, puttSkillOf, startingLoadout } from '../src/sim/rpg/economy';

const pin: Vec = [0, 0];

/** Make rate at length `d` across many seeds AND a spread of paces around ideal, so the pace MAKE
 *  band (not just the fixed-ideal case) is actually exercised. */
function makeRate(d: number, skill: PuttSkill, slope?: Vec): number {
  const paces = [0.9, 0.96, 1.0, 1.03, 1.06, 1.1, 1.14, 1.2];
  let made = 0;
  let n = 0;
  for (let s = 0; s < 200; s++) {
    for (const pace of paces) {
      n++;
      if (manualPutt(new Rng(`pd:${s}:${pace}`), [0, d] as Vec, pin, { pace, aim: 0 }, skill, slope).holed) made++;
    }
  }
  return made / n;
}

describe('putt make-band distance factor (GS-putt-depth)', () => {
  it('is a full band within the putter range, then tapers monotonically to a floor', () => {
    // Full within the confident range.
    expect(puttBandDistanceFactor(2, DEFAULT_PUTT_RANGE)).toBe(1);
    expect(puttBandDistanceFactor(DEFAULT_PUTT_RANGE, DEFAULT_PUTT_RANGE)).toBe(1);
    // Shrinks beyond it.
    const at12 = puttBandDistanceFactor(12, DEFAULT_PUTT_RANGE);
    const at24 = puttBandDistanceFactor(24, DEFAULT_PUTT_RANGE);
    expect(at12).toBeLessThan(1);
    expect(at24).toBeLessThan(at12);
    // Never collapses to nothing (a long putt is hard, not impossible).
    expect(puttBandDistanceFactor(200, DEFAULT_PUTT_RANGE)).toBeGreaterThan(0.2);
  });

  it('a bigger putter range holds a wider band at the same distance', () => {
    const base = puttBandDistanceFactor(20, DEFAULT_PUTT_RANGE);
    const long = puttBandDistanceFactor(20, DEFAULT_PUTT_RANGE + 10);
    expect(long).toBeGreaterThan(base);
  });
});

describe('a better putter holes more from distance (GS-putt-depth)', () => {
  it('a tap-in is unaffected by the putter range (within range = byte-for-byte flat band)', () => {
    // Inside the confident range the factor is 1 for either putter, so the same seeds hole identically.
    const baseSkill: PuttSkill = { manualBand: DEFAULT_MANUAL_BAND, puttRange: DEFAULT_PUTT_RANGE };
    const longSkill: PuttSkill = { manualBand: DEFAULT_MANUAL_BAND, puttRange: DEFAULT_PUTT_RANGE + 10 };
    expect(makeRate(3, baseSkill)).toBe(makeRate(3, longSkill));
  });

  it('past the range, a longer-range putter (same timing band) sinks more long putts', () => {
    const baseSkill: PuttSkill = { manualBand: DEFAULT_MANUAL_BAND, puttRange: DEFAULT_PUTT_RANGE };
    const longSkill: PuttSkill = { manualBand: DEFAULT_MANUAL_BAND, puttRange: DEFAULT_PUTT_RANGE + 12 };
    const base = makeRate(18, baseSkill);
    const long = makeRate(18, longSkill);
    expect(long).toBeGreaterThan(base);
  });

  it('a full putter upgrade (wider band AND range) clearly beats the base flat-stick from distance', () => {
    const base = makeRate(16, puttSkillOf(startingLoadout()));
    const upgraded = makeRate(16, puttSkillOf(loadoutFromPerks(['pinseeker-putter'])));
    expect(upgraded).toBeGreaterThan(base * 1.15);
  });
});

describe('putter upgrades extend the confident range (GS-putt-depth)', () => {
  it('a base loadout still returns no skill override (byte-for-byte auto/headless)', () => {
    expect(puttSkillOf(startingLoadout())).toEqual({});
  });

  it('putter perks raise puttRange above the default', () => {
    const grip = puttSkillOf(loadoutFromPerks(['putting-grip']));
    const tour = puttSkillOf(loadoutFromPerks(['tour-putter']));
    expect(grip.puttRange!).toBeGreaterThan(DEFAULT_PUTT_RANGE);
    expect(tour.puttRange!).toBeGreaterThan(grip.puttRange!);
  });
});

describe('harder stops tilt the greens more (GS-putt-depth)', () => {
  it('a wild course averages a steeper green slope than a calm one, same seeds', () => {
    let calmSum = 0;
    let wildSum = 0;
    const n = 120;
    for (let s = 0; s < n; s++) {
      const calm = generateCourse(s + 51000, { biome: 'verdant-station', holes: 1, wildness: 0.05 }).holes[0]!;
      const wild = generateCourse(s + 51000, { biome: 'verdant-station', holes: 1, wildness: 1 }).holes[0]!;
      calmSum += Math.hypot(calm.greenSlope![0], calm.greenSlope![1]);
      wildSum += Math.hypot(wild.greenSlope![0], wild.greenSlope![1]);
    }
    expect(wildSum).toBeGreaterThan(calmSum * 1.15);
  });
});
