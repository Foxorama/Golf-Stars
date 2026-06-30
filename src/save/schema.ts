/**
 * Versioned save schema. Every persisted blob carries a `version` and passes through
 * `migrate()` on load. v2 added the RPG meta-loop (resumable run snapshot + furthest
 * distance); v3 adds persistent meta-progression (Star Shards + permanent upgrade levels,
 * GS-12) and drops v2's dead always-zero `credits` field. The migrate chain runs one step
 * at a time (v1→v2→v3).
 */

import type { RunSnapshot } from '../sim/rpg/run';
import type { MetaUpgrades } from '../sim/rpg/meta';
import type { BagTier } from '../sim/rpg/bag';
import { DEFAULT_SHIP_ID } from '../sim/rpg/ships';

export const SAVE_VERSION = 8;

/** v1 — the vertical-slice save (kept for the migration path). */
export interface SaveV1 {
  version: 1;
  runSeed?: number;
  distanceFromStart: number;
  credits: number;
  bestStableford: number;
  savedAt?: string;
}

/** v2 — adds the meta-loop. */
export interface SaveV2 {
  version: 2;
  /** Banked meta-currency (always 0 in practice — dropped in v3). */
  credits: number;
  bestStableford: number;
  /** Furthest galaxy distance ever reached. */
  bestDistance: number;
  /** In-progress run, if any (loadout rebuilt from its perks on resume). */
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v3 — adds persistent meta-progression (Star Shards + permanent upgrade levels). */
export interface SaveV3 {
  version: 3;
  bestStableford: number;
  /** Furthest galaxy distance ever reached. */
  bestDistance: number;
  /** Persistent meta-currency, spent at the Outpost on permanent upgrades. */
  shards: number;
  /** Owned permanent upgrade levels (id → level). */
  metaUpgrades: MetaUpgrades;
  /** In-progress run, if any (loadout rebuilt from its perks + meta on resume). */
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v4 — adds the Ascension difficulty ladder (GS-ascension): the highest tier unlocked by winning. */
export interface SaveV4 {
  version: 4;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  /** Highest Ascension level unlocked (0 = base; +1 each time you win at the current top tier). */
  maxAscension: number;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v5 — adds the lifetime hole-in-one tally (GS-ace): a permanent, cross-run bragging-rights record. */
export interface SaveV5 {
  version: 5;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  /** Holes-in-one made across every run, ever (a permanent badge of honour). */
  lifetimeAces: number;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v6 — repurposes Star Shards from permanent stat upgrades to the cosmetic Trade Market (GS-garage):
 *  the owned spaceship fleet + the selected ship, plus the market's rotating-offer seed. `metaUpgrades`
 *  is kept for old-save compat (the Outpost stat-spend is retired; any grandfathered levels still apply). */
export interface SaveV6 {
  version: 6;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  lifetimeAces: number;
  /** Owned cosmetic ship ids (always includes the default Woody Wagon). */
  ownedShips: string[];
  /** The ship currently flown on the journey map. */
  selectedShip: string;
  /** The Trade Market's rotating-offer seed — bumps on each completed run so the stock refreshes. */
  marketSeed: number;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v7 — adds the cosmetic WARDROBE (GS-cosmetics): owned hats & shirts + the equipped piece per slot. */
export interface SaveV7 {
  version: 7;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  lifetimeAces: number;
  ownedShips: string[];
  selectedShip: string;
  marketSeed: number;
  /** Owned cosmetic apparel ids (hats + shirts). Empty = the golfer wears its character colours. */
  ownedApparel: string[];
  /** The equipped hat / shirt apparel ids (undefined = character default for that slot). */
  equippedHat?: string;
  equippedShirt?: string;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v8 — adds the permanent default-bag tier (GS-bag-tiers): the loot rarity all default clubs are
 *  re-stamped to (rare/epic/legendary), bought with Star Shards once the Ascension gate is cleared. */
export interface SaveV8 {
  version: 8;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  lifetimeAces: number;
  ownedShips: string[];
  selectedShip: string;
  marketSeed: number;
  ownedApparel: string[];
  equippedHat?: string;
  equippedShirt?: string;
  /** The owned default-bag tier ('common' = the un-upgraded starter bag). */
  bagTier: BagTier;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** The current save shape (alias so call sites don't pin a version number). */
export type Save = SaveV8;

export function defaultSave(): Save {
  return {
    version: SAVE_VERSION,
    bestStableford: 0,
    bestDistance: 0,
    shards: 0,
    metaUpgrades: {},
    maxAscension: 0,
    lifetimeAces: 0,
    ownedShips: [DEFAULT_SHIP_ID],
    selectedShip: DEFAULT_SHIP_ID,
    marketSeed: 0,
    ownedApparel: [],
    bagTier: 'common',
  };
}

/** v1 → v2: fold the loose run fields into the new shape. */
function v1ToV2(s: SaveV1): SaveV2 {
  return {
    version: 2,
    credits: s.credits ?? 0,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.distanceFromStart ?? 0,
    activeRun:
      s.runSeed !== undefined
        ? {
            seed: s.runSeed,
            stopIndex: 0,
            distanceFromStart: s.distanceFromStart ?? 0,
            credits: s.credits ?? 0,
            perks: [],
          }
        : undefined,
    savedAt: s.savedAt,
  };
}

/** v2 → v3: drop the dead `credits` field, seed empty meta-progression. */
function v2ToV3(s: SaveV2): SaveV3 {
  return {
    version: 3,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: 0,
    metaUpgrades: {},
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v3 → v4: seed the Ascension ladder at 0 (nothing unlocked yet). */
function v3ToV4(s: SaveV3): SaveV4 {
  return {
    version: 4,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: 0,
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v4 → v5: seed the lifetime ace tally at 0 (no aces recorded yet). */
function v4ToV5(s: SaveV4): SaveV5 {
  return {
    version: 5,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: s.maxAscension ?? 0,
    lifetimeAces: 0,
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v5 → v6: seed the cosmetic fleet (own just the default wagon) + a fresh market seed. */
function v5ToV6(s: SaveV5): SaveV6 {
  return {
    version: 6,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: s.maxAscension ?? 0,
    lifetimeAces: s.lifetimeAces ?? 0,
    ownedShips: [DEFAULT_SHIP_ID],
    selectedShip: DEFAULT_SHIP_ID,
    marketSeed: 0,
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v6 → v7: seed an empty wardrobe (no apparel owned, character-default look). */
function v6ToV7(s: SaveV6): SaveV7 {
  return {
    version: 7,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: s.maxAscension ?? 0,
    lifetimeAces: s.lifetimeAces ?? 0,
    ownedShips: s.ownedShips && s.ownedShips.length ? s.ownedShips : [DEFAULT_SHIP_ID],
    selectedShip: s.selectedShip ?? DEFAULT_SHIP_ID,
    marketSeed: s.marketSeed ?? 0,
    ownedApparel: [],
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v7 → v8: seed the un-upgraded common default-bag tier (nothing bought yet). */
function v7ToV8(s: SaveV7): SaveV8 {
  return {
    version: 8,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: s.maxAscension ?? 0,
    lifetimeAces: s.lifetimeAces ?? 0,
    ownedShips: s.ownedShips && s.ownedShips.length ? s.ownedShips : [DEFAULT_SHIP_ID],
    selectedShip: s.selectedShip ?? DEFAULT_SHIP_ID,
    marketSeed: s.marketSeed ?? 0,
    ownedApparel: s.ownedApparel ?? [],
    equippedHat: s.equippedHat,
    equippedShirt: s.equippedShirt,
    bagTier: 'common',
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/**
 * Migrate an unknown persisted blob up to the current version, one step at a time. Each
 * future version bump adds another `if (s.version === N)` step in sequence.
 */
export function migrate(raw: unknown): Save {
  if (!raw || typeof raw !== 'object') return defaultSave();
  let s = raw as { version?: number } & Record<string, unknown>;

  if (s.version === 1) s = v1ToV2(s as unknown as SaveV1) as unknown as typeof s;
  if (s.version === 2) s = v2ToV3(s as unknown as SaveV2) as unknown as typeof s;
  if (s.version === 3) s = v3ToV4(s as unknown as SaveV3) as unknown as typeof s;
  if (s.version === 4) s = v4ToV5(s as unknown as SaveV4) as unknown as typeof s;
  if (s.version === 5) s = v5ToV6(s as unknown as SaveV5) as unknown as typeof s;
  if (s.version === 6) s = v6ToV7(s as unknown as SaveV6) as unknown as typeof s;
  if (s.version === 7) s = v7ToV8(s as unknown as SaveV7) as unknown as typeof s;

  if (s.version !== SAVE_VERSION) {
    // Unknown / unsupported version: start clean rather than guess at a shape.
    return defaultSave();
  }

  // Defensive backfill so a partial blob can't crash the loader.
  const v8 = s as unknown as Partial<SaveV8>;
  const ownedShips = v8.ownedShips && v8.ownedShips.length ? v8.ownedShips : [DEFAULT_SHIP_ID];
  const ownedApparel = v8.ownedApparel ?? [];
  const bagTier: BagTier = v8.bagTier ?? 'common';
  return {
    version: SAVE_VERSION,
    bestStableford: v8.bestStableford ?? 0,
    bestDistance: v8.bestDistance ?? 0,
    shards: v8.shards ?? 0,
    metaUpgrades: v8.metaUpgrades ?? {},
    maxAscension: v8.maxAscension ?? 0,
    lifetimeAces: v8.lifetimeAces ?? 0,
    ownedShips,
    selectedShip: v8.selectedShip && ownedShips.includes(v8.selectedShip) ? v8.selectedShip : DEFAULT_SHIP_ID,
    marketSeed: v8.marketSeed ?? 0,
    ownedApparel,
    equippedHat: v8.equippedHat && ownedApparel.includes(v8.equippedHat) ? v8.equippedHat : undefined,
    equippedShirt: v8.equippedShirt && ownedApparel.includes(v8.equippedShirt) ? v8.equippedShirt : undefined,
    bagTier,
    activeRun: v8.activeRun,
    savedAt: v8.savedAt,
  };
}

/** Serialise a save to a JSON string (the export path). */
export function exportSave(save: Save): string {
  return JSON.stringify(save, null, 2);
}

/** Parse + migrate a JSON string into a valid Save (the import path). */
export function importSave(json: string): Save {
  try {
    return migrate(JSON.parse(json));
  } catch {
    return defaultSave();
  }
}
