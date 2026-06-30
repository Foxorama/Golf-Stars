/**
 * Apparel — the cosmetic HATS and SHIRTS your golfer wears (GS-cosmetics).
 *
 * Like the cosmetic ship fleet (`ships.ts`), apparel is pure CONTENT AS DATA: an id, the SLOT it fills
 * (hat or shirt), the cosmetic SET it belongs to (some pieces pair into a set, some stand alone), a
 * rarity (= price tier, up to the top `mythic`), and a render `look` that BOTH the wardrobe SVG card
 * (`render/apparelArt.ts`) and the on-course canvas golfer (`render/playView.ts drawGolfer`) key off,
 * so what you buy is what you wear. New garment = new row.
 *
 * NOTHING here touches the sim — apparel is cosmetic, so there are no balance/fairness implications.
 * Bought with Star Shards at the Trade Market's wardrobe; the full catalogue is browsable (no rotating
 * offer — you pick the look you want), one piece equipped per slot.
 */

import type { CosmeticRarity } from './cosmetics';
import { COSMETIC_RARITY } from './cosmetics';

export type ApparelSlot = 'hat' | 'shirt';

/** Hat silhouettes the drawer renders (canvas + SVG share these shape names). */
export type HatShape = 'cap' | 'bucket' | 'visor' | 'tophat' | 'crown' | 'helmet' | 'halo';
/** Shirt silhouettes the drawer renders. */
export type ShirtShape = 'polo' | 'striped' | 'jersey' | 'spacesuit' | 'cosmic';

/** The vector look a garment renders as — a shape family + palette + optional aura for the top tiers. */
export interface ApparelLook {
  shape: HatShape | ShirtShape;
  /** Primary fabric colour. */
  color: string;
  /** Secondary trim / brim / stripe colour. */
  accent?: string;
  /** A glowing aura colour (legendary/mythic only) — the drawer adds a soft halo + sparkle. */
  glow?: string;
}

export interface Apparel {
  id: string;
  name: string;
  /** Which body slot it fills. */
  slot: ApparelSlot;
  /** The cosmetic SET it belongs to (a family; some sets span a matching hat + shirt). */
  set: string;
  /** Price tier — gates the rarity ring + shard cost. */
  rarity: CosmeticRarity;
  /** One-line flavour for the wardrobe card. */
  blurb: string;
  /** Shard price. */
  cost: number;
  look: ApparelLook;
}

/** Shard prices per rarity tier (the wardrobe economy). Mythic is the headline 500-shard splurge. */
export const APPAREL_COST: Record<CosmeticRarity, number> = {
  common: 15,
  rare: 50,
  epic: 120,
  legendary: 280,
  mythic: 500,
};

export const APPAREL: readonly Apparel[] = [
  // ===== HATS ==========================================================================
  {
    id: 'cap-classic',
    name: 'Classic Cap',
    slot: 'hat',
    set: 'Rookie',
    rarity: 'common',
    blurb: 'A trusty ball cap. Keeps the twin suns out of your eyes.',
    cost: APPAREL_COST.common,
    look: { shape: 'cap', color: '#3f7fd0', accent: '#2a5694' },
  },
  {
    id: 'bucket-safari',
    name: 'Safari Bucket',
    slot: 'hat',
    set: 'Rookie',
    rarity: 'common',
    blurb: 'Wide-brimmed and breezy. Ready for any dust belt.',
    cost: APPAREL_COST.common,
    look: { shape: 'bucket', color: '#b7a36a', accent: '#7c6c3e' },
  },
  {
    id: 'visor-tour',
    name: 'Tour Visor',
    slot: 'hat',
    set: 'Tour',
    rarity: 'rare',
    blurb: 'The pro look. Pairs with the Tour polo.',
    cost: APPAREL_COST.rare,
    look: { shape: 'visor', color: '#f4f6fb', accent: '#22407a' },
  },
  {
    id: 'tophat-ace',
    name: 'Ace Top Hat',
    slot: 'hat',
    set: 'Gentleman',
    rarity: 'epic',
    blurb: 'For the golfer who sinks it in style.',
    cost: APPAREL_COST.epic,
    look: { shape: 'tophat', color: '#15161c', accent: '#c0392b' },
  },
  {
    id: 'crown-champion',
    name: "Champion's Crown",
    slot: 'hat',
    set: 'Champion',
    rarity: 'epic',
    blurb: 'Solid gold. You earned the right to gloat.',
    cost: APPAREL_COST.epic,
    look: { shape: 'crown', color: '#f4c542', accent: '#b8860b' },
  },
  {
    id: 'helmet-astro',
    name: 'Astronaut Helmet',
    slot: 'hat',
    set: 'Astronaut',
    rarity: 'legendary',
    blurb: 'Sealed visor, gold tint. Half of the classic space suit.',
    cost: APPAREL_COST.legendary,
    look: { shape: 'helmet', color: '#e8edf5', accent: '#ffd36b', glow: '#bfe3ff' },
  },
  {
    id: 'crown-supernova',
    name: 'Supernova Crown',
    slot: 'hat',
    set: 'Supernova',
    rarity: 'mythic',
    blurb: 'A halo of caught starlight. The crown of the Supernova set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'halo', color: '#ff7bf0', accent: '#fff0a0', glow: '#ff4fd8' },
  },

  // ===== SHIRTS ========================================================================
  {
    id: 'polo-classic',
    name: 'Classic Polo',
    slot: 'shirt',
    set: 'Rookie',
    rarity: 'common',
    blurb: 'Crisp, collared, dependable.',
    cost: APPAREL_COST.common,
    look: { shape: 'polo', color: '#2f6fb0', accent: '#1d4a7a' },
  },
  {
    id: 'tee-striped',
    name: 'Striped Tee',
    slot: 'shirt',
    set: 'Rookie',
    rarity: 'common',
    blurb: 'Bold bands. Easy to spot from orbit.',
    cost: APPAREL_COST.common,
    look: { shape: 'striped', color: '#d8543c', accent: '#f4f1e6' },
  },
  {
    id: 'polo-tour',
    name: 'Tour Polo',
    slot: 'shirt',
    set: 'Tour',
    rarity: 'rare',
    blurb: 'Performance fabric. Pairs with the Tour visor.',
    cost: APPAREL_COST.rare,
    look: { shape: 'polo', color: '#f4f6fb', accent: '#22407a' },
  },
  {
    id: 'jersey-neon',
    name: 'Neon Jersey',
    slot: 'shirt',
    set: 'Neon',
    rarity: 'epic',
    blurb: 'Electric panels that hum under the stars.',
    cost: APPAREL_COST.epic,
    look: { shape: 'jersey', color: '#1d2030', accent: '#2bf0c0', glow: '#2bf0c0' },
  },
  {
    id: 'suit-space',
    name: 'Space Suit',
    slot: 'shirt',
    set: 'Astronaut',
    rarity: 'legendary',
    blurb: 'The traditional pressure suit — life support and chest panel. Pairs with the helmet.',
    cost: APPAREL_COST.legendary,
    look: { shape: 'spacesuit', color: '#eef1f6', accent: '#d23b32', glow: '#bfe3ff' },
  },
  {
    id: 'suit-supernova',
    name: 'Supernova Suit',
    slot: 'shirt',
    set: 'Supernova',
    rarity: 'mythic',
    blurb: 'A living nebula stitched into fabric. The body of the Supernova set.',
    cost: APPAREL_COST.mythic,
    look: { shape: 'cosmic', color: '#3a1d6e', accent: '#ff7bf0', glow: '#ff4fd8' },
  },
];

const BY_ID: Record<string, Apparel> = Object.fromEntries(APPAREL.map((a) => [a.id, a]));

export function apparelById(id: string | undefined): Apparel | undefined {
  return id ? BY_ID[id] : undefined;
}

/** Every garment that fills a given slot, ordered by ascending rarity then catalogue order. */
export function apparelForSlot(slot: ApparelSlot): Apparel[] {
  return APPAREL.filter((a) => a.slot === slot).sort(
    (a, b) => COSMETIC_RARITY[a.rarity].order - COSMETIC_RARITY[b.rarity].order,
  );
}

/** Can this garment be bought? (Affordable + not already owned.) */
export function canBuyApparel(item: Apparel | undefined, shards: number, owned: readonly string[]): boolean {
  return !!item && shards >= item.cost && !owned.includes(item.id);
}

/**
 * The set a garment belongs to is COMPLETE when both its matching pieces are equipped (a hat + a shirt
 * of the same set). Used to award the "set bonus" sparkle on the wardrobe + the on-course aura. Returns
 * the set name if the currently-equipped hat & shirt are the two halves of one multi-piece set.
 */
export function equippedSet(hatId: string | undefined, shirtId: string | undefined): string | undefined {
  const hat = apparelById(hatId);
  const shirt = apparelById(shirtId);
  if (hat && shirt && hat.set === shirt.set) {
    // Only multi-piece sets count (Rookie spans many standalone basics — don't treat it as a "set").
    const setPieces = APPAREL.filter((a) => a.set === hat.set);
    const slots = new Set(setPieces.map((a) => a.slot));
    if (hat.set !== 'Rookie' && slots.has('hat') && slots.has('shirt')) return hat.set;
  }
  return undefined;
}
