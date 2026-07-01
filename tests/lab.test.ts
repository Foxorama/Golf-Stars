import { describe, it, expect } from 'vitest';
import {
  summary,
  histogram,
  dispersionStudy,
  buildLoadout,
  caddyEffects,
  scoreHarness,
  themeStudy,
  allThemeStudies,
} from '../src/test/lab';
import { THEMES, resolveBiome, themeById } from '../src/sim/course/themes';
import { NAMED_CADDY_IDS } from '../src/sim/rpg/economy';

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

describe('caddy effects are demoable in the Lab (GS-caddy harness rule)', () => {
  // The machine-checked "a new caddy must show up in the test harness" rule: every NAMED caddy folds
  // a field into the loadout, and caddyEffects() must surface it. Add a caddy without a Lab effect
  // and this reds the build — the I4 atomic-change rule, enforced.
  it('every named caddy surfaces at least one effect', () => {
    expect(NAMED_CADDY_IDS.length).toBeGreaterThan(0);
    for (const id of NAMED_CADDY_IDS) {
      const lo = buildLoadout({ perks: [id] }).loadout;
      const effects = caddyEffects(lo);
      expect(effects.length, `caddy "${id}" surfaces no Lab effect — add it to caddyEffects()`).toBeGreaterThan(0);
    }
  });

  it('a base loadout has no caddy effects', () => {
    expect(caddyEffects(buildLoadout({}).loadout)).toEqual([]);
  });

  it('the guard caddies report a redirect rate in the dispersion study', () => {
    const base = dispersionStudy('D', { n: 1200, seed: 5, loadout: buildLoadout({}).loadout });
    expect(base.redirectRate).toBeUndefined(); // no guard → not measured

    const sheep = dispersionStudy('D', { n: 1200, seed: 5, loadout: buildLoadout({ perks: ['convict-sheep'] }).loadout });
    expect(sheep.guardKind).toBe('boomerang');
    expect(sheep.redirectRate).toBeGreaterThan(0); // some right misses get knocked back
    expect(sheep.samples.some((s) => s.redirected && s.origLateral !== undefined)).toBe(true);
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

  it('rebuilds repeated perk ids by applying each (back-compat with old stacked saves)', () => {
    // Items are one-shot uniques now (GS-proshop-variety), but loadoutFromPerks still folds every id in
    // the array — so an old save that stacked a −4 Caddie Lesson twice resolves the full −8 on rebuild.
    const one = buildLoadout({ handicap: 18, perks: ['caddie-lesson'] });
    const two = buildLoadout({ handicap: 18, perks: ['caddie-lesson', 'caddie-lesson'] });
    expect(one.handicap).toBe(14);
    expect(two.handicap).toBe(10);
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

describe('theme browser (real resolveBiome)', () => {
  it('themeStudy reports the resolved biome physics for a theme', () => {
    const t = themeById('sagittarius')!;
    const study = themeStudy('sagittarius');
    const biome = resolveBiome(t);
    expect(study.name).toBe(t.name);
    expect(study.arc).toBe(t.arc);
    expect(study.rarity).toBe(t.rarity);
    expect(study.hasFigure).toBe(true); // a constellation draws a sky figure
    expect(study.biome.carryMult).toBeCloseTo(biome.carryMult);
    expect(study.biome.windWild).toBeCloseTo(biome.windWild);
  });

  it('allThemeStudies covers every theme; deep-sky/galaxy have no figure', () => {
    const all = allThemeStudies();
    expect(all.length).toBe(THEMES.length);
    const deepSky = all.find((s) => s.id === 'orion-nebula')!;
    expect(deepSky.hasFigure).toBe(false);
  });

  it('themeStudy throws on an unknown theme', () => {
    expect(() => themeStudy('not-a-theme')).toThrow();
  });
});
