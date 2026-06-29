/**
 * Persistent meta-progression (GS-12) — "Star Shards" earned across runs.
 *
 * RETIRED FROM THE UI (GS-garage): Star Shards no longer buy these permanent STAT upgrades — that
 * spend moved to the cosmetic Trade Market (ships.ts), and the stat effects (−hcp, +distance, −spray,
 * +credits, putt) now live in the in-run Pro Shop (economy.ts) as buyable perks. `META_UPGRADES` +
 * `applyMeta` are KEPT only so (a) old saves that already bought levels keep them (startRun still folds
 * them) and (b) tests can construct a boosted loadout. Nothing in the game offers them anymore.
 *
 * Pure & data-driven. The save still persists shards + any grandfathered per-upgrade LEVELS (a Record
 * id→level); `startRun` bakes them into the starting loadout/credits.
 */

import {
  STARTING_CREDITS,
  boostDistanceClubs,
  startingLoadout,
  type PlayerLoadout,
} from './economy';
import type { Rarity } from '../course/contract';

/** Owned permanent upgrades: id → level (0 = not owned). */
export type MetaUpgrades = Record<string, number>;

export interface MetaUpgrade {
  id: string;
  name: string;
  desc: string;
  /** Loot grade — tints the Outpost card. */
  rarity: Rarity;
  maxLevel: number;
  /** Shard cost of the FIRST level; ramps geometrically per level already owned. */
  baseCost: number;
  costGrowth?: number;
  /** Apply ONE level's effect to the starting loadout (folded `level` times). */
  applyLevel(loadout: PlayerLoadout): PlayerLoadout;
  /** Per-level starting-credit bonus, if any (handled outside the loadout). */
  creditBonus?: number;
}

/** Geometric shard-cost ramp per level already owned. */
export const META_COST_GROWTH = 1.6;

export const META_UPGRADES: readonly MetaUpgrade[] = [
  {
    id: 'vet-hands',
    name: 'Veteran Hands',
    desc: 'Begin each run at −2 handicap (tighter from the first tee)',
    rarity: 'rare',
    maxLevel: 5, // 18 → 8 handicap floor for the start; Caddie Lessons take it lower in-run
    baseCost: 30,
    applyLevel: (m) => ({ ...m, handicap: Math.max(0, m.handicap - 2) }),
  },
  {
    id: 'tour-bag',
    name: 'Tour Bag',
    desc: 'Start with +6 yds on your distance clubs',
    rarity: 'rare',
    maxLevel: 4,
    baseCost: 35,
    // Bake +6 into the current distance clubs AND record it on distanceClubBonus, so a reward
    // distance club bought later in the run inherits the same bonus (GS-clubs).
    applyLevel: (m) => ({
      ...m,
      bag: boostDistanceClubs(m.bag, 6),
      distanceClubBonus: (m.distanceClubBonus ?? 0) + 6,
    }),
  },
  {
    id: 'steady-grip',
    name: 'Steady Grip',
    desc: 'Start 4% tighter on every club',
    rarity: 'epic',
    maxLevel: 4,
    baseCost: 45,
    applyLevel: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.96 }),
  },
  {
    id: 'deep-pockets',
    name: 'Deep Pockets',
    desc: 'Start each run with +40 credits for the outfitter',
    rarity: 'common',
    maxLevel: 5,
    baseCost: 25,
    creditBonus: 40,
    applyLevel: (m) => m, // credits are applied via metaStartingCredits, not the loadout
  },
  {
    id: 'putting-coach',
    name: 'Putting Coach',
    desc: 'Begin each run a steadier putter — a wider make window from the first green',
    rarity: 'rare',
    maxLevel: 4,
    baseCost: 30,
    applyLevel: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.08 }),
  },
];

export function metaUpgrade(id: string): MetaUpgrade | undefined {
  return META_UPGRADES.find((u) => u.id === id);
}

/** Level owned of an upgrade (0 if none). */
export function metaLevel(meta: MetaUpgrades, id: string): number {
  return meta[id] ?? 0;
}

/** Shard cost of the NEXT level, given how many are already owned. */
export function metaUpgradeCost(u: MetaUpgrade, ownedLevel: number): number {
  return Math.round(u.baseCost * Math.pow(u.costGrowth ?? META_COST_GROWTH, ownedLevel));
}

/** Can the next level be bought right now? (under max level AND affordable). */
export function canBuyMeta(u: MetaUpgrade, ownedLevel: number, shards: number): boolean {
  return ownedLevel < u.maxLevel && shards >= metaUpgradeCost(u, ownedLevel);
}

/** Buy one level of an upgrade. No-op (same object) if maxed or unaffordable. */
export function buyMetaUpgrade(
  meta: MetaUpgrades,
  shards: number,
  id: string,
): { meta: MetaUpgrades; shards: number } {
  const u = metaUpgrade(id);
  if (!u) return { meta, shards };
  const lvl = metaLevel(meta, id);
  if (!canBuyMeta(u, lvl, shards)) return { meta, shards };
  return { meta: { ...meta, [id]: lvl + 1 }, shards: shards - metaUpgradeCost(u, lvl) };
}

/**
 * Fold every owned meta-upgrade level onto a given base loadout. Pure. Used both for the neutral
 * starting loadout AND on top of a chosen golfer's loadout (GS-clubs), so meta (e.g. Tour Bag) bakes
 * into the character's own starting bag rather than a discarded default one.
 */
export function applyMeta(meta: MetaUpgrades, base: PlayerLoadout): PlayerLoadout {
  let m = base;
  for (const u of META_UPGRADES) {
    const lvl = metaLevel(meta, u.id);
    for (let i = 0; i < lvl; i++) m = u.applyLevel(m);
  }
  return m;
}

/** The (neutral) starting loadout with every owned meta-upgrade level baked in. Pure. */
export function metaStartingLoadout(meta: MetaUpgrades = {}): PlayerLoadout {
  return applyMeta(meta, startingLoadout());
}

/** Starting credits including any Deep Pockets bonus. Pure. */
export function metaStartingCredits(meta: MetaUpgrades = {}): number {
  let c = STARTING_CREDITS;
  for (const u of META_UPGRADES) {
    if (u.creditBonus) c += u.creditBonus * metaLevel(meta, u.id);
  }
  return c;
}
