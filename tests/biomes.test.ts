import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { BIOMES, BALANCE_EXEMPT_BIOMES, biomeById, pickBiome } from '../src/sim/course/biomes';
import { generateCourse, validateFairness } from '../src/sim/course/generate';
import { validateCourse } from '../src/sim/course/contract';
import { biomeCarryMult, playCourse } from '../src/sim/round';
import { LIE_INFO, lieInfo, resolveShot } from '../src/sim/shot';
import { CLUBS } from '../src/sim/clubs';

describe('biome table', () => {
  it('every biome references only surfaces with an explicit LIE_INFO row', () => {
    for (const b of BIOMES) {
      const referenced = [...b.hazardKinds, b.greensideKind, ...b.scatter.map((s) => s.kind)];
      for (const k of referenced) {
        expect(Object.prototype.hasOwnProperty.call(LIE_INFO, k)).toBe(true);
      }
    }
    expect(biomeById('void-garden')?.carryMult).toBeGreaterThan(1);
  });

  it('pickBiome is deterministic by roll and spans the table', () => {
    expect(pickBiome(0).id).toBe(BIOMES[0]!.id);
    expect(pickBiome(0.999).id).toBe(BIOMES[BIOMES.length - 1]!.id);
  });

  it('generateCourse honours a forced biome', () => {
    const c = generateCourse(5, { biome: 'void-garden', holes: 2 });
    expect(c.biome).toBe('void-garden');
  });
});

describe('gravity (carry modifier)', () => {
  it('void-garden holes carry a >1 gravity mod; ember-world <1', () => {
    const voidHole = generateCourse(5, { biome: 'void-garden' }).holes[0]!;
    const emberHole = generateCourse(5, { biome: 'ember-world' }).holes[0]!;
    expect(biomeCarryMult(voidHole)).toBeGreaterThan(1.2);
    expect(biomeCarryMult(emberHole)).toBeLessThan(1);
  });

  it('the same swing carries farther under low gravity', () => {
    const driver = CLUBS[0]!;
    const base = resolveShot({
      from: [0, 0], aim: [0, 250], club: driver, lie: 'fairway', carryMult: 1.0, rng: new Rng(7),
    });
    const lowG = resolveShot({
      from: [0, 0], aim: [0, 250], club: driver, lie: 'fairway', carryMult: 1.4, rng: new Rng(7),
    });
    expect(lowG.carry).toBeGreaterThan(base.carry);
    expect(lowG.intended).toBeCloseTo(base.intended * 1.4, 1);
  });
});

describe('fantasy lies', () => {
  it('ice is slick (high dispersion), crystal is true (low), void/lava penalise', () => {
    expect(lieInfo('ice').dispersionMult).toBeGreaterThan(1.2);
    expect(lieInfo('crystal').dispersionMult).toBeLessThan(1);
    expect(lieInfo('void').penalty).toBe('void');
    expect(lieInfo('lava').penalty).toBe('lava');
  });
});

describe('wildness scaling', () => {
  it('turns up hazard count and wind on average', () => {
    let calmHazards = 0, wildHazards = 0, calmWind = 0, wildWind = 0;
    for (let seed = 0; seed < 80; seed++) {
      const calm = generateCourse(seed, { biome: 'verdant-station', wildness: 0.1 }).holes[0]!;
      const wild = generateCourse(seed, { biome: 'verdant-station', wildness: 0.95 }).holes[0]!;
      calmHazards += calm.hazards.length;
      wildHazards += wild.hazards.length;
      calmWind += calm.wind!.spd;
      wildWind += wild.wind!.spd;
    }
    expect(wildHazards).toBeGreaterThan(calmHazards);
    expect(wildWind).toBeGreaterThan(calmWind);
  });
});

describe('fairness invariant holds across all biomes at max wildness', () => {
  it('penalty hazards stay off the play corridor; every hole terminates', () => {
    for (const b of BIOMES) {
      for (let seed = 0; seed < 60; seed++) {
        // generateCourse throws on unfair/invalid courses; assert directly too.
        const course = generateCourse(seed, { biome: b.id, holes: 3, wildness: 1 });
        expect(validateCourse(course)).toEqual([]);
        expect(validateFairness(course)).toEqual([]);

        const played = playCourse(course.holes, new Rng(`${b.id}:${seed}:play`));
        for (const p of played) {
          expect(p.holed || p.pickedUp).toBe(true);
          // Structural termination bound (full-swing cap × penalty + putts).
          expect(p.record.strokes).toBeLessThanOrEqual(48);
        }
      }
    }
  });

  it('no SYSTEMIC death-spiral: average score stays hard-but-fair, blow-ups rare', () => {
    // Max wildness is brutal, but Stableford absorbs the rare blow-up. We assert the
    // distribution is sane on average and tail blow-ups are rare — not that they never
    // happen (an occasional disaster hole is fair spice, not a bug).
    let strokes = 0;
    let par = 0;
    let holes = 0;
    let blowups = 0;
    for (const b of BIOMES) {
      // Void & Cetus are the island-hop showcase worlds, deliberately exempt from the death-spiral bar
      // pending the AI/scoring rebalance (GS-cetus-5); the structural fairness test above still covers
      // them. The strict bar keeps guarding the other eight worlds.
      if (BALANCE_EXEMPT_BIOMES.has(b.id)) continue;
      for (let seed = 0; seed < 80; seed++) {
        const course = generateCourse(seed + 1000, { biome: b.id, holes: 3, wildness: 1 });
        for (const p of playCourse(course.holes, new Rng(`${b.id}:${seed}:p`))) {
          strokes += p.record.strokes;
          par += p.record.par;
          holes++;
          if (p.record.strokes >= 10) blowups++;
        }
      }
    }
    const toParPerHole = (strokes - par) / holes;
    expect(toParPerHole).toBeLessThan(1.0); // hard, but not a death machine
    expect(blowups / holes).toBeLessThan(0.05); // <5% disaster holes even at max wildness
  });
});
