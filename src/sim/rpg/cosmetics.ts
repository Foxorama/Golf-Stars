/**
 * Cosmetic rarity — a SUPERSET of the sim's loot `Rarity` that adds a top **mythic** tier (GS-cosmetics).
 *
 * Mythic is deliberately kept OUT of the sim's `Rarity` (clubs/perks/loot drops) — it would ripple into
 * the rarity-weighted loot sampling, the depth-bias curve, and the economy balance for no reason. It
 * exists ONLY for cosmetics (ships + apparel), which never touch the sim, so a new tier here is free of
 * balance/fairness implications. Content-as-data: a new cosmetic = a new row keyed by this rarity.
 */

import type { Rarity } from '../course/contract';
import { rarCol } from './loot';

/** The cosmetic grading: the loot tiers plus a top `mythic` tier above legendary. */
export type CosmeticRarity = Rarity | 'mythic';

export interface CosmeticRarityInfo {
  /** Accent colour for the card ring / UI tint. */
  col: string;
  /** Relative draw weight in a rarity-weighted offer (higher = shows more often; mythic is scarce). */
  weight: number;
  /** Display order, common→mythic. */
  order: number;
}

export const COSMETIC_RARITY: Record<CosmeticRarity, CosmeticRarityInfo> = {
  common: { col: rarCol('common'), weight: 40, order: 0 }, // green
  rare: { col: rarCol('rare'), weight: 26, order: 1 }, // blue
  epic: { col: rarCol('epic'), weight: 14, order: 2 }, // purple
  legendary: { col: rarCol('legendary'), weight: 6, order: 3 }, // orange
  mythic: { col: '#ff4fd8', weight: 2, order: 4 }, // hot magenta — the rarest, super-cool tier
};

/** Ordered list, common→mythic. */
export const COSMETIC_RARITIES: CosmeticRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

/** Accent colour for a cosmetic rarity (handles `mythic`, where `rarCol` would fail to type-check). */
export function cosmeticRarCol(r: CosmeticRarity): string {
  return COSMETIC_RARITY[r].col;
}

/** Display order of a cosmetic rarity. */
export function cosmeticRarOrder(r: CosmeticRarity): number {
  return COSMETIC_RARITY[r].order;
}

/** Is this the top, mythic tier? (Drives the extra-flashy card glow / aura.) */
export function isMythic(r: CosmeticRarity): boolean {
  return r === 'mythic';
}
