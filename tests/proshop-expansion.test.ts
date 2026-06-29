import { describe, it, expect } from 'vitest';
import {
  CLUB_SETS,
  clubItem,
  clubItemId,
  clubSetById,
  equippedGearTheme,
  loadoutFromPerks,
  netDispersion,
  shopItem,
  startingLoadout,
  SHOP_ITEMS,
} from '../src/sim/rpg/economy';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, type PlayHoleOptions } from '../src/sim/round';
import { playTotals } from '../src/sim/score';
import { Rng } from '../src/sim/rng';
import { NAMED_CADDY_IDS } from '../src/sim/rpg/economy';
import { itemArtSVG, itemArtKind, CADDY_ART_IDS } from '../src/render/itemArt';

const HAZARD_PENALTIES = new Set(['water', 'lava', 'lavariver', 'void', 'voidlost', 'creek', 'frozenpond']);

/** Build the player hole-options from a loadout, threading the new GS-proshop-2 fields. */
function optsFor(perks: string[]): PlayHoleOptions {
  const lo = loadoutFromPerks(perks);
  return {
    bag: lo.bag,
    dispersionMult: netDispersion(lo),
    windResist: lo.windResist,
    backspinBoost: lo.backspinBoost,
    hazardImmune: lo.hazardImmune,
  };
}

/** Count penalty strokes of a hazard family across many wild stops in a hazard-heavy biome. */
function hazardPenalties(perks: string[], biome: string, seeds = 120): number {
  const opts = optsFor(perks);
  let penalties = 0;
  for (let s = 0; s < seeds; s++) {
    const c = generateCourse(`${biome}:${s}`, { holes: 6, biome, wildness: 1 });
    const played = playCourse(c.holes, new Rng(`${c.seed}:play`), opts);
    for (const p of played)
      for (const shot of p.shots) if (shot.penalty && HAZARD_PENALTIES.has(shot.penalty)) penalties++;
  }
  return penalties;
}

describe('GS-proshop-2 — new gameplay-changing items', () => {
  it('the new items resolve and apply their loadout fields', () => {
    expect(shopItem('wind-cheater')).toBeTruthy();
    expect(loadoutFromPerks(['wind-cheater']).windResist).toBeCloseTo(0.3);
    // wind-cheater stacks and CAPS at 0.6
    expect(loadoutFromPerks(['wind-cheater', 'wind-cheater']).windResist).toBeCloseTo(0.6);
    expect(loadoutFromPerks(['wind-cheater', 'wind-cheater', 'wind-cheater']).windResist).toBeCloseTo(0.6);

    expect(loadoutFromPerks(['spin-milled']).backspinBoost).toBeCloseTo(0.07);

    expect(loadoutFromPerks(['rangefinder']).clubSuggest).toBe(true);
    expect(loadoutFromPerks(['tour-spikes']).lieRelief).toBeCloseTo(0.35);
  });

  it('hazard-skip balls record the right immune kinds (and combine)', () => {
    expect(loadoutFromPerks(['floater-balls']).hazardImmune).toEqual(['water']);
    expect(loadoutFromPerks(['magma-balls']).hazardImmune).toEqual(['lava']);
    expect(loadoutFromPerks(['void-walkers']).hazardImmune!.sort()).toEqual(['void', 'voidlost']);
    const all = loadoutFromPerks(['floater-balls', 'magma-balls', 'void-walkers']).hazardImmune!;
    for (const k of ['water', 'lava', 'void', 'voidlost']) expect(all).toContain(k);
  });

  it('a base loadout carries none of the new fields (byte-for-byte default)', () => {
    const lo = startingLoadout();
    expect(lo.windResist).toBeUndefined();
    expect(lo.backspinBoost).toBeUndefined();
    expect(lo.hazardImmune).toBeUndefined();
  });

  it('Floater Balls save WATER penalties (verdant creeks/ponds)', () => {
    const base = hazardPenalties([], 'verdant-station');
    const floater = hazardPenalties(['floater-balls'], 'verdant-station');
    expect(base).toBeGreaterThan(0); // the biome actually produces water penalties
    expect(floater).toBeLessThan(base);
  });

  it('Magma Skimmers save LAVA penalties (ember world)', () => {
    const base = hazardPenalties([], 'ember-world');
    const magma = hazardPenalties(['magma-balls'], 'ember-world');
    expect(base).toBeGreaterThan(0);
    expect(magma).toBeLessThan(base);
  });

  it('Void-Walker balls save VOID penalties (void garden)', () => {
    const base = hazardPenalties([], 'void-garden');
    const voidImmune = hazardPenalties(['void-walkers'], 'void-garden');
    expect(base).toBeGreaterThan(0);
    expect(voidImmune).toBeLessThan(base);
  });

  it('carrying every hazard ball never LOWERS mean per-stop Stableford', () => {
    const mean = (perks: string[], biome: string): number => {
      const opts = optsFor(perks);
      let sf = 0;
      let n = 0;
      for (let s = 0; s < 120; s++) {
        const c = generateCourse(`${biome}:${s}`, { holes: 6, biome, wildness: 1 });
        const played = playCourse(c.holes, new Rng(`${c.seed}:play`), opts);
        sf += playTotals(played.map((p) => p.record)).stableford;
        n++;
      }
      return sf / n;
    };
    const all = ['floater-balls', 'magma-balls', 'void-walkers'];
    // Removing penalties can only ever help (or be neutral) — never hurt.
    expect(mean(all, 'verdant-station')).toBeGreaterThanOrEqual(mean([], 'verdant-station') - 1e-9);
    expect(mean(all, 'ember-world')).toBeGreaterThanOrEqual(mean([], 'ember-world') - 1e-9);
  });
});

describe('GS-proshop-2 — themed club sets', () => {
  it('the legendary Solar Storm distance set exists, plus the re-themed Planet/Phoenix labels', () => {
    expect(clubSetById('solar')).toMatchObject({ rarity: 'legendary', theme: 'solarstorm', distanceOnly: true });
    expect(clubSetById('tour')!.theme).toBe('planet');
    expect(clubSetById('masters')!.theme).toBe('phoenix');
    // Solar is distance-only → it generates a Driver item but no scoring-iron item.
    expect(clubItem(clubItemId('solar', 'D'))).toBeTruthy();
    expect(clubItem(clubItemId('solar', '7i'))).toBeUndefined();
  });

  it('a Solar Storm driver is the biggest reach upgrade', () => {
    const solarD = clubItem(clubItemId('solar', 'D'))!;
    const lo = solarD.apply(startingLoadout());
    const driver = lo.bag.find((c) => c.id === 'D')!;
    expect(driver.carry).toBeGreaterThan(startingLoadout().bag.find((c) => c.id === 'D')!.carry + 16);
    expect(driver.set).toBe('solar');
    expect(driver.rarity).toBe('legendary');
  });

  it('equippedGearTheme picks the RAREST themed set in the bag', () => {
    expect(equippedGearTheme(startingLoadout())).toBeUndefined();
    const planet = loadoutFromPerks([clubItemId('tour', 'D')]);
    expect(equippedGearTheme(planet)?.theme).toBe('planet');
    const both = loadoutFromPerks([clubItemId('tour', 'D'), clubItemId('solar', 'D')]);
    expect(equippedGearTheme(both)?.theme).toBe('solarstorm'); // legendary outranks rare
  });
});

describe('GS-proshop-2 — procedural item art', () => {
  it('every shop item renders a deterministic SVG', () => {
    for (const it of SHOP_ITEMS) {
      const svg = itemArtSVG(it.id, it.rarity);
      expect(svg).toContain('<svg');
      expect(svg).toBe(itemArtSVG(it.id, it.rarity)); // deterministic
    }
  });

  it('reward clubs render their set theme', () => {
    for (const set of CLUB_SETS) {
      if (set.offerable === false) continue;
      const svg = itemArtSVG(clubItemId(set.set, 'D'), set.rarity, set.theme);
      expect(svg).toContain('<svg');
    }
    expect(itemArtKind('club:solar:D')).toBe('club');
  });

  it('flavoured balls and shafts map to the right art kind', () => {
    expect(itemArtKind('floater-balls')).toBe('ball');
    expect(itemArtKind('power-cell')).toBe('shaft');
    expect(itemArtKind('rangefinder')).toBe('rangefinder');
    expect(itemArtKind('tour-spikes')).toBe('shoes');
    expect(itemArtKind('auto-caddie')).toBe('caddy');
  });

  it('EVERY named caddy has a bespoke portrait (never the generic bag glyph)', () => {
    // The machine-checked rule: add a named caddy without bespoke shop art and this reds.
    for (const id of NAMED_CADDY_IDS) expect(CADDY_ART_IDS).toContain(id);
    // …and each renders a DISTINCT figure.
    const svgs = NAMED_CADDY_IDS.map((id) => itemArtSVG(id, 'epic'));
    expect(new Set(svgs).size).toBe(NAMED_CADDY_IDS.length);
  });
});
