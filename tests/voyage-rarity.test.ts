import { describe, it, expect } from 'vitest';
import {
  shopOffer,
  startRun,
  voyageRarityBias,
  voyageShopProgress,
  shopRarityBias,
  rarityDepthBias,
  type Run,
} from '../src/sim/rpg/run';
import { shopItem, CLUB_ITEMS, startingLoadout } from '../src/sim/rpg/economy';
import type { Rarity } from '../src/sim/course/contract';

function rarityOf(id: string): Rarity | undefined {
  return shopItem(id)?.rarity ?? CLUB_ITEMS.find((c) => c.id === id)?.rarity;
}

/** Fraction of each rarity across every voyage shop offer at a given stop, over many seeds. */
function mix(stopIndex: number, perks: string[] = []): Record<Rarity, number> {
  const counts: Record<Rarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 };
  let total = 0;
  for (let seed = 0; seed < 300; seed++) {
    const run: Run = {
      ...startRun(seed, 'voyage'),
      stopIndex,
      distanceFromStart: Math.round(stopIndex * 1.5),
      loadout: { ...startingLoadout(), perks: [...perks] },
    };
    for (const o of shopOffer(run)) {
      const r = rarityOf(o.item.id);
      if (r) { counts[r]++; total++; }
    }
  }
  return {
    common: counts.common / total,
    rare: counts.rare / total,
    epic: counts.epic / total,
    legendary: counts.legendary / total,
  };
}

describe('voyageRarityBias (GS-voyage-rarity) — pure schedule', () => {
  it('commons are flat (×1) at every point in the voyage', () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) expect(voyageRarityBias('common', p)).toBe(1);
  });

  it('rare/epic rise monotonically with voyage progress', () => {
    for (const r of ['rare', 'epic'] as Rarity[]) {
      expect(voyageRarityBias(r, 0)).toBeLessThan(1); // suppressed at the first shop
      expect(voyageRarityBias(r, 0.5)).toBeGreaterThan(voyageRarityBias(r, 0));
      expect(voyageRarityBias(r, 1)).toBeGreaterThan(voyageRarityBias(r, 0.5));
      expect(voyageRarityBias(r, 1)).toBeGreaterThan(1); // favoured at the last shop
    }
  });

  it('the legendary tail is shut at the start, opens after boss 1, and peaks (bounded) at the end', () => {
    expect(voyageRarityBias('legendary', 0)).toBe(0); // no legendaries in the opening shops
    expect(voyageRarityBias('legendary', 0.1)).toBe(0); // still shut just before the tail opens
    // Between boss 1 & 2 (progress ≈ 0.3–0.55) it is a small, non-zero taste…
    expect(voyageRarityBias('legendary', 0.45)).toBeGreaterThan(0);
    // …and it keeps climbing into arc 3.
    expect(voyageRarityBias('legendary', 1)).toBeGreaterThan(voyageRarityBias('legendary', 0.45));
  });

  it('voyageShopProgress runs 0 at the first shop → 1 at the final pre-boss shop', () => {
    // The voyage is 9 stops (0..8); stop 8 is the boss with no shop, so stop 7 is the last shop.
    expect(voyageShopProgress(0, 9)).toBe(0);
    expect(voyageShopProgress(7, 9)).toBe(1);
    expect(voyageShopProgress(8, 9)).toBe(1); // clamped
  });

  it('shopRarityBias routes the voyage through its schedule and endless formats through distance', () => {
    const voyage = startRun(1, 'voyage');
    const flat = startRun(1, 'flat');
    // Voyage first shop uses the stop schedule (legendary shut at progress 0).
    expect(shopRarityBias({ ...voyage, stopIndex: 0 }, 'legendary')).toBe(0);
    // Endless format falls back to the galaxy-distance ramp.
    expect(shopRarityBias({ ...flat, distanceFromStart: 5 }, 'epic')).toBe(rarityDepthBias('epic', 5));
  });
});

describe('voyage shop rarity mix (GS-voyage-rarity) — end to end', () => {
  it('the FIRST shop is mostly green with a blue — epics/legendaries essentially absent', () => {
    const m = mix(0);
    expect(m.common).toBeGreaterThan(0.5); // mostly green
    expect(m.rare).toBeGreaterThan(0.2); // with a healthy blue
    expect(m.epic + m.legendary).toBeLessThan(0.05); // barely any purple/orange
    expect(m.legendary).toBe(0); // no legendaries before boss 1
  });

  it('between boss 1 & 2 there is a small chance of epic AND legendary', () => {
    // Arc 2 shops (stops 2–4). Purple clearly present, orange a small taste.
    const arc2 = mix(4);
    expect(arc2.epic).toBeGreaterThan(0.1); // a real purple chance
    expect(arc2.legendary).toBeGreaterThan(0); // a small orange chance
    expect(arc2.legendary).toBeLessThan(0.1); // but only a taste
  });

  it('the epic AND legendary chance is HIGHER after boss 2 than before it', () => {
    const arc2 = mix(3); // between the bosses
    const arc3 = mix(6); // after boss 2
    expect(arc3.epic).toBeGreaterThan(arc2.epic);
    expect(arc3.legendary).toBeGreaterThan(arc2.legendary);
  });

  it('the LAST shop is halfish blue / halfish purple with a real (minority) legendary chance', () => {
    const m = mix(7);
    expect(m.common).toBeLessThan(0.15); // green all but gone
    expect(m.rare).toBeGreaterThan(0.25); // strong blue…
    expect(m.epic).toBeGreaterThan(0.25); // …matched by strong purple
    // "halfish / halfish": blue and purple are within a reasonable band of each other.
    expect(Math.abs(m.rare - m.epic)).toBeLessThan(0.2);
    expect(m.legendary).toBeGreaterThan(0.05); // a genuine legendary chance…
    expect(m.legendary).toBeLessThan(0.35); // …but still the minority
  });

  it('a character sees a few purple offers and at least one legendary across a voyage', () => {
    // Expected count of purple/legendary CARDS across the shops of a run (stops 0..7).
    let purple = 0;
    let legendary = 0;
    for (let stop = 0; stop <= 7; stop++) {
      const m = mix(stop);
      purple += m.epic * 4; // SHOP_OFFER_SIZE cards per shop
      legendary += m.legendary * 4;
    }
    expect(purple).toBeGreaterThan(3); // "a few purple items"
    expect(legendary).toBeGreaterThan(1); // "between 1–4 legendary items"
  });
});
