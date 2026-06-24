/**
 * Rarity grading — harvested from golf-finder's RARITY_C / rarCol. Already an RPG
 * loot grading scheme; we reuse it for course rarity, biome tiers, and item drops.
 * Content-as-data: a new tier is a new row.
 */

import type { Rarity } from '../course/contract';

export interface RarityInfo {
  /** Accent colour for cards / UI tint. */
  col: string;
  /** Relative drop weight (higher = more common). */
  weight: number;
  /** Display order, common→legendary. */
  order: number;
}

export const RARITY_C: Record<Rarity, RarityInfo> = {
  common: { col: '#5b8bd0', weight: 60, order: 0 }, // blue
  rare: { col: '#2bb673', weight: 28, order: 1 }, // green/teal
  epic: { col: '#9b59d0', weight: 9, order: 2 }, // purple
  legendary: { col: '#e08a2b', weight: 3, order: 3 }, // orange
};

export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export function rarCol(r: Rarity): string {
  return RARITY_C[r].col;
}
