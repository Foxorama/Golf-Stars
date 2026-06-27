import { describe, it, expect } from 'vitest';
import { generateCourse, validateCrossings } from '../src/sim/course/generate';
import { validateCourse } from '../src/sim/course/contract';
import { validateFairness } from '../src/sim/course/generate';
import { playHole, playCourse } from '../src/sim/round';
import { lieAt, lieInfo, roughLieOf } from '../src/sim/shot';
import { Rng } from '../src/sim/rng';
import { beginHole, takeShot, autoDecision, holeResult, type HolePlay } from '../src/sim/rpg/play';
import { startingLoadout, netDispersion } from '../src/sim/rpg/economy';
import { zoneProfile, difficultyPips, ZONES } from '../src/sim/course/zones';
import { archetypeFor, archetypeForBiome, THEMES, type BiomeArchetype } from '../src/sim/course/themes';
import { zoneHeroSVG } from '../src/render/zoneHero';
import { type Vec } from '../src/sim/course/contract';

const ARCHES: BiomeArchetype[] = ['verdant', 'desert', 'frost', 'inferno', 'void'];

describe('zone identity (GS-19)', () => {
  it('every archetype has a complete, well-formed profile', () => {
    for (const a of ARCHES) {
      const z = zoneProfile(a);
      expect(z.name.length).toBeGreaterThan(0);
      expect(z.signature.length).toBeGreaterThan(0);
      expect(z.inspiration.length).toBeGreaterThan(0);
      expect(z.brief.length).toBeGreaterThan(0);
      expect(z.hazards.length).toBeGreaterThanOrEqual(1);
      expect(z.benefits.length).toBeGreaterThanOrEqual(1);
      expect(z.difficulty).toBeGreaterThanOrEqual(1);
      expect(z.difficulty).toBeLessThanOrEqual(5);
    }
  });

  it('difficulty climbs verdant → void (the world ramp)', () => {
    expect(ZONES.verdant.difficulty).toBeLessThan(ZONES.inferno.difficulty);
    expect(ZONES.inferno.difficulty).toBeLessThanOrEqual(ZONES.void.difficulty);
  });

  it('difficultyPips renders 5 pips with the right fill', () => {
    expect(difficultyPips(3)).toBe('●●●○○');
    expect(difficultyPips(0)).toBe('○○○○○');
    expect(difficultyPips(5)).toBe('●●●●●');
    expect(difficultyPips(9).length).toBe(5); // clamped
  });

  it('archetypeFor resolves a theme id, falls back to biome, defaults verdant', () => {
    const t = THEMES.find((t) => t.archetype === 'void')!;
    expect(archetypeFor(t.id, 'verdant-station')).toBe('void'); // theme wins
    expect(archetypeFor(undefined, 'ember-world')).toBe('inferno'); // biome fallback
    expect(archetypeForBiome('nope')).toBe('verdant'); // unknown → verdant
  });
});

describe('zone hero art (procedural, deterministic)', () => {
  it('emits a valid, byte-stable SVG per archetype', () => {
    for (const a of ARCHES) {
      const svg = zoneHeroSVG(a, { width: 320, height: 150, seed: 7 });
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
      expect(svg).toContain('viewBox="0 0 320 150"');
      expect(zoneHeroSVG(a, { width: 320, height: 150, seed: 7 })).toBe(svg); // deterministic
    }
  });
});

describe('void lost-rough (fair early, brutal late)', () => {
  const offFeaturePoint = (hole: { green: Vec }): Vec => [hole.green[0] + 240, hole.green[1]]; // far off any island

  it('is NOT armed on calm void stops (off the fairway plays as ordinary rough)', () => {
    const c = generateCourse(3, { biome: 'void-garden', holes: 1, wildness: 0.3 });
    const h = c.holes[0]!;
    expect(roughLieOf(h)).toBe('rough');
    expect(lieInfo(lieAt(h, offFeaturePoint(h))).penalty).toBeUndefined();
  });

  it('IS armed on wild/deep void stops (off the fairway is lost to the void)', () => {
    const c = generateCourse(3, { biome: 'void-garden', holes: 1, wildness: 1 });
    const h = c.holes[0]!;
    expect(roughLieOf(h)).toBe('voidrough');
    expect(lieInfo(lieAt(h, offFeaturePoint(h))).penalty).toBe('voidlost');
  });

  it('the lost-rough actually bites but stays under the no-death-spiral bar', () => {
    let strokes = 0;
    let par = 0;
    let holes = 0;
    let penalties = 0;
    for (let s = 0; s < 120; s++) {
      const c = generateCourse(s + 9000, { biome: 'void-garden', holes: 3, wildness: 1 });
      for (const p of playCourse(c.holes, new Rng(`void:${s}`))) {
        strokes += p.record.strokes;
        par += p.record.par;
        holes++;
        penalties += p.stat.penalties;
      }
    }
    expect((strokes - par) / holes).toBeLessThan(1.0); // hard, but not a death machine
    expect(penalties).toBeGreaterThan(0); // the void genuinely swallows balls
  });
});

describe('lava rivers (forced carry)', () => {
  it('cross the centreline on ember par-4/5 stops, and every one is provably carryable', () => {
    let riverHoles = 0;
    for (let s = 0; s < 120; s++) {
      const c = generateCourse(s + 4000, { biome: 'ember-world', holes: 3, wildness: 1 });
      expect(validateCrossings(c)).toEqual([]); // carryable: safe shelf before & after each river
      expect(validateFairness(c)).toEqual([]); // sanctioned crossing doesn't trip the corridor guard
      expect(validateCourse(c)).toEqual([]);
      // validateCrossings already proves each river crosses the centreline with safe shelves either
      // side; here we just confirm rivers actually appear on the longer ember holes.
      riverHoles += c.holes.filter((h) => h.hazards.some((hz) => hz.kind === 'lavariver')).length;
    }
    expect(riverHoles).toBeGreaterThan(0); // they actually appear
  });

  it('the carry-aware AI keeps ember under the no-death-spiral bar (rivers bite but are fair)', () => {
    let strokes = 0;
    let par = 0;
    let holes = 0;
    let penalties = 0;
    for (let s = 0; s < 120; s++) {
      const c = generateCourse(s + 4000, { biome: 'ember-world', holes: 3, wildness: 1 });
      for (const p of playCourse(c.holes, new Rng(`ember:${s}`))) {
        strokes += p.record.strokes;
        par += p.record.par;
        holes++;
        penalties += p.stat.penalties;
      }
    }
    expect((strokes - par) / holes).toBeLessThan(1.0);
    expect(penalties).toBeGreaterThan(0); // some shots find the lava
  });
});

describe('auto ≡ interactive holds on the new signature worlds', () => {
  function driveAuto(state: HolePlay, loadout: ReturnType<typeof startingLoadout>, rng: Rng): HolePlay {
    let s = state;
    let guard = 0;
    while (!s.done && guard++ < 25) s = takeShot(s, autoDecision(s, loadout), loadout, rng);
    return s;
  }
  for (const biome of ['ember-world', 'void-garden']) {
    it(`${biome}: autoDecision reproduces playHole byte-for-byte`, () => {
      const lo = startingLoadout();
      let compared = 0;
      for (let seed = 0; seed < 60; seed++) {
        const hole = generateCourse(seed + 200, { biome, holes: 1, wildness: 1 }).holes[0]!;
        const driven = driveAuto(beginHole(hole), lo, new Rng(`${seed}:z`));
        if (!driven.done) continue;
        const ai = playHole(hole, new Rng(`${seed}:z`), { bag: lo.bag, dispersionMult: netDispersion(lo) });
        expect(holeResult(driven).record).toEqual(ai.record);
        compared++;
      }
      expect(compared).toBeGreaterThan(40);
    });
  }
});
