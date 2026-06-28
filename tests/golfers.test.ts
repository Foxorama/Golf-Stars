import { describe, it, expect } from 'vitest';
import {
  GOLFERS,
  GOLFER_ARCHETYPES,
  getGolfer,
  getArchetype,
  championFor,
  golfersForArchetype,
  golferProfile,
  golferRating,
  golferLook,
  bossShotMods,
  golferDistanceBonus,
  profileToClubMods,
  golferHash,
} from '../src/sim/rpg/golfers';
import { THEMES } from '../src/sim/course/themes';
import { CHARACTERS } from '../src/sim/rpg/characters';

const HEX = /^#[0-9a-fA-F]{6}$/;

describe('golfer roster (GS-100)', () => {
  it('is a sizeable field (100–200 golfers)', () => {
    expect(GOLFERS.length).toBeGreaterThanOrEqual(100);
    expect(GOLFERS.length).toBeLessThanOrEqual(200);
  });

  it('has unique ids and unique names', () => {
    const ids = new Set(GOLFERS.map((g) => g.id));
    const names = new Set(GOLFERS.map((g) => g.name));
    expect(ids.size).toBe(GOLFERS.length);
    expect(names.size).toBe(GOLFERS.length);
  });

  it('every golfer references a real archetype', () => {
    for (const g of GOLFERS) expect(() => getArchetype(g.archetypeId)).not.toThrow();
  });

  it('every constellation theme has exactly one champion in its archetype', () => {
    const constellations = THEMES.filter((t) => t.kind === 'constellation');
    for (const t of constellations) {
      const champ = championFor(t.id);
      expect(champ, `champion for ${t.id}`).toBeDefined();
      expect(champ!.tier).toBe('champion');
      expect(champ!.home).toBe(t.id);
      expect(champ!.homeArchetype).toBe(t.archetype);
    }
    const champs = GOLFERS.filter((g) => g.tier === 'champion');
    expect(champs.length).toBe(constellations.length);
  });

  it('the 4 playable characters are mirrored into the field as rivals', () => {
    for (const c of CHARACTERS) {
      const mirror = GOLFERS.find((g) => g.mirrorsCharacter === c.id);
      expect(mirror, `mirror for ${c.id}`).toBeDefined();
      expect(mirror!.tier).toBe('star');
      expect(mirror!.look).toEqual(c.style);
    }
  });

  it('every golfer has a valid look (hex colours, positive build)', () => {
    for (const g of GOLFERS) {
      expect(g.look.cap, g.id).toMatch(HEX);
      expect(g.look.shirt, g.id).toMatch(HEX);
      expect(g.look.skin, g.id).toMatch(HEX);
      expect(g.look.build).toBeGreaterThan(0.5);
      expect(g.look.build).toBeLessThan(1.5);
      expect(golferLook(g.id)).toEqual(g.look);
    }
  });
});

describe('golfer archetypes', () => {
  it('every archetype has a complete 0–1 profile', () => {
    for (const a of GOLFER_ARCHETYPES) {
      for (const k of ['skill', 'power', 'accuracy', 'shortGame', 'nerve', 'consistency', 'wind'] as const) {
        expect(a.profile[k], `${a.id}.${k}`).toBeGreaterThanOrEqual(0);
        expect(a.profile[k], `${a.id}.${k}`).toBeLessThanOrEqual(1);
      }
      expect(a.profile.shapeBias).toBeGreaterThanOrEqual(-1);
      expect(a.profile.shapeBias).toBeLessThanOrEqual(1);
      expect(a.profile.flight).toBeGreaterThanOrEqual(-1);
      expect(a.profile.flight).toBeLessThanOrEqual(1);
    }
  });

  it('archetypes are mechanically distinct (no two share the exact profile)', () => {
    const seen = new Set<string>();
    for (const a of GOLFER_ARCHETYPES) {
      const key = JSON.stringify(a.profile);
      expect(seen.has(key), `${a.id} duplicates another profile`).toBe(false);
      seen.add(key);
    }
  });
});

describe('golfer profiles & ratings', () => {
  it('golferProfile is deterministic and clamped 0–1', () => {
    for (const g of GOLFERS.slice(0, 30)) {
      const a = golferProfile(g.id);
      const b = golferProfile(g.id);
      expect(a).toEqual(b);
      for (const k of ['skill', 'power', 'accuracy', 'shortGame', 'nerve', 'consistency', 'wind'] as const) {
        expect(a[k]).toBeGreaterThanOrEqual(0);
        expect(a[k]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('champions out-rate the field on average (skill correlates with tier)', () => {
    const champ = GOLFERS.filter((g) => g.tier === 'champion');
    const field = GOLFERS.filter((g) => g.tier === 'field');
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const champMean = mean(champ.map((g) => golferRating(g.id)));
    const fieldMean = mean(field.map((g) => golferRating(g.id)));
    expect(champMean).toBeGreaterThan(fieldMean);
  });

  it('same-archetype golfers still differ slightly (per-golfer jitter)', () => {
    const bombers = GOLFERS.filter((g) => g.archetypeId === 'bomber');
    expect(bombers.length).toBeGreaterThan(1);
    const profiles = new Set(bombers.map((g) => JSON.stringify(golferProfile(g.id))));
    expect(profiles.size).toBeGreaterThan(1);
  });
});

describe('boss shot derivation', () => {
  it('bossShotMods is deterministic and returns sane per-club mods', () => {
    for (const g of GOLFERS.slice(0, 20)) {
      const f = bossShotMods(g.id);
      const driver = f(250);
      const wedge = f(90);
      expect(f(250)).toEqual(driver); // deterministic
      for (const m of [driver, wedge]) {
        expect(m.dispMult).toBeGreaterThan(0.4);
        expect(m.dispMult).toBeLessThan(2);
        expect(Math.abs(m.angleBias)).toBeLessThan(0.2);
      }
      // The curve is stronger on the driver than the wedge (length-scaled).
      expect(Math.abs(driver.angleBias)).toBeGreaterThanOrEqual(Math.abs(wedge.angleBias));
    }
  });

  it('a fader curves right, a hooker curves left (shapeBias direction)', () => {
    const fader = profileToClubMods(golferProfile('champ:lyra'), 250); // metronome, slight fade
    void fader;
    const feather = GOLFERS.find((g) => g.mirrorsCharacter === 'feather-fade')!;
    const larry = GOLFERS.find((g) => g.mirrorsCharacter === 'longshot-larry')!;
    const featherDriver = bossShotMods(feather.id)(250); // fader archetype → +bias (right)
    expect(featherDriver.angleBias).toBeGreaterThan(0);
    // bomber archetype has a slight draw (−bias)
    expect(bossShotMods(larry.id)(250).angleBias).toBeLessThan(0);
  });

  it('distance bonus tracks power (bombers long, short hitters short)', () => {
    const larry = GOLFERS.find((g) => g.mirrorsCharacter === 'longshot-larry')!; // bomber
    const wedgeWiz = GOLFERS.find((g) => g.archetypeId === 'wedge')!;
    expect(golferDistanceBonus(larry.id)).toBeGreaterThan(golferDistanceBonus(wedgeWiz.id));
  });
});

describe('golferHash', () => {
  it('is a stable uint32', () => {
    expect(golferHash('abc')).toBe(golferHash('abc'));
    expect(golferHash('abc')).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(golferHash('abc'))).toBe(true);
  });
});

describe('lookups', () => {
  it('getGolfer / golfersForArchetype resolve', () => {
    expect(getGolfer('champ:crux')?.name).toBe('Sol Acrux');
    expect(getGolfer('nope')).toBeUndefined();
    const verdantHomes = golfersForArchetype('verdant');
    expect(verdantHomes.length).toBeGreaterThan(0);
    for (const g of verdantHomes) expect(g.homeArchetype).toBe('verdant');
  });
});
