/**
 * Versioned save schema. Every persisted blob carries a `version` and passes through
 * `migrate()` on load. v2 adds the RPG meta-loop (a resumable run snapshot + furthest
 * distance) and migrates v1 blobs forward — the first real exercise of the chain the
 * kit insisted on from day one.
 */

import type { RunSnapshot } from '../sim/rpg/run';

export const SAVE_VERSION = 2;

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
  /** Banked meta-currency. */
  credits: number;
  bestStableford: number;
  /** Furthest galaxy distance ever reached. */
  bestDistance: number;
  /** In-progress run, if any (loadout rebuilt from its perks on resume). */
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** The current save shape (alias so call sites don't pin a version number). */
export type Save = SaveV2;

export function defaultSave(): Save {
  return { version: SAVE_VERSION, credits: 0, bestStableford: 0, bestDistance: 0 };
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

/**
 * Migrate an unknown persisted blob up to the current version, one step at a time. Each
 * future version bump adds another `if (s.version === N)` step in sequence.
 */
export function migrate(raw: unknown): Save {
  if (!raw || typeof raw !== 'object') return defaultSave();
  let s = raw as { version?: number } & Record<string, unknown>;

  if (s.version === 1) s = v1ToV2(s as unknown as SaveV1) as unknown as typeof s;

  if (s.version !== SAVE_VERSION) {
    // Unknown / unsupported version: start clean rather than guess at a shape.
    return defaultSave();
  }

  // Defensive backfill so a partial blob can't crash the loader.
  const v2 = s as unknown as Partial<SaveV2>;
  return {
    version: SAVE_VERSION,
    credits: v2.credits ?? 0,
    bestStableford: v2.bestStableford ?? 0,
    bestDistance: v2.bestDistance ?? 0,
    activeRun: v2.activeRun,
    savedAt: v2.savedAt,
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
