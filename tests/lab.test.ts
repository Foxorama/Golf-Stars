import { describe, it, expect } from 'vitest';
import {
  summary,
  histogram,
  dispersionStudy,
  buildLoadout,
  scoreHarness,
} from '../src/test/lab';

/**
 * Guards the Sim Lab engine that powers the test hub (standards/TEST-HUB-STANDARD.md). The lab
 * only orchestrates the real sim, so these assert the orchestration (stats, determinism) AND
 * re-confirm a couple of game invariants THROUGH the lab — proof the hub measures real physics,
 * not a fiction.
 */

describe('lab stats helpers', () => {
  it('summary computes mean/sd/percentiles', () => {
    const s = summary([0, 0, 10, 10]);
    expect(s.n).toBe(4);
    expect(s.mean).toBe(5);
    expect(s.sd).toBe(5);
    expect(s.min).toBe(0);
    expect(s.max).toBe(10);
    expect(summary([]).n).toBe(0); // empty is safe
  });

  it('histogram bins cover all samples', () => {
    const bins = histogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(bins).toHaveLength(5);
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(10);
  });
});

describe('dispersion study (real resolveShot)', () => {
  it('is deterministic for a fixed seed', () => {
    const a = dispersionStudy('D', { n: 200, seed: 42 });
    const b = dispersionStudy('D', { n: 200, seed: 42 });
    expect(b.samples).toEqual(a.samples);
  });

  it('longer clubs spray wider than short clubs (per-club wildness)', () => {
    const driver = dispersionStudy('D', { n: 1500, seed: 7 });
    const wedge = dispersionStudy('SW', { n: 1500, seed: 7 });
    // Lateral spread, as a fraction of intended carry, must be larger for the driver.
    expect(driver.lateral.sd / driver.intended).toBeGreaterThan(wedge.lateral.sd / wedge.intended);
    expect(driver.intended).toBeGreaterThan(200); // driver ≈ 250 on fairway
  });

  it('a forgiveness build tightens the cone (skill is visible in the lab)', () => {
    const raw = dispersionStudy('D', { n: 1500, seed: 9 });
    const skilled = dispersionStudy('D', {
      n: 1500,
      seed: 9,
      loadout: buildLoadout({ handicap: 18, perks: ['gyro', 'pro-coach'] }).loadout,
    });
    expect(skilled.lateral.sd).toBeLessThan(raw.lateral.sd);
  });
});

describe('loadout builder (real loadoutFromPerks / meta)', () => {
  it('Pro Coach lowers handicap and net dispersion', () => {
    const base = buildLoadout({ handicap: 18 });
    const coached = buildLoadout({ handicap: 18, perks: ['pro-coach'] });
    expect(coached.handicap).toBe(12);
    expect(coached.netDispersion).toBeLessThan(base.netDispersion);
  });

  it('Tour Bag meta boosts distance clubs only', () => {
    const plain = buildLoadout({});
    const bagged = buildLoadout({ meta: { 'tour-bag': 1 } });
    const driverPlain = plain.clubs.find((c) => c.id === 'D')!.carry;
    const driverBag = bagged.clubs.find((c) => c.id === 'D')!.carry;
    const wedgePlain = plain.clubs.find((c) => c.id === 'SW')!.carry;
    const wedgeBag = bagged.clubs.find((c) => c.id === 'SW')!.carry;
    expect(driverBag).toBe(driverPlain + 6);
    expect(wedgeBag).toBe(wedgePlain); // scoring clubs untouched
  });

  it('stacks a stackable perk by repeating its id', () => {
    const one = buildLoadout({ handicap: 18, perks: ['caddie-lesson'] });
    const three = buildLoadout({ handicap: 18, perks: ['caddie-lesson', 'caddie-lesson', 'caddie-lesson'] });
    expect(one.handicap).toBe(16);
    expect(three.handicap).toBe(12);
  });
});

describe('scoring harness (real simulateRun)', () => {
  it('is deterministic', () => {
    const a = scoreHarness({ seeds: 20 });
    const b = scoreHarness({ seeds: 20 });
    expect(b.meanStablefordPerStop).toBe(a.meanStablefordPerStop);
  });

  it('a skill upgrade raises mean per-stop Stableford (the balance invariant)', () => {
    const base = scoreHarness({ seeds: 50 });
    const upgraded = scoreHarness({ seeds: 50, meta: { 'steady-grip': 2 }, perks: ['pro-coach'] });
    expect(upgraded.meanStablefordPerStop).toBeGreaterThan(base.meanStablefordPerStop);
  });
});
