/**
 * Versioned save schema — from v1, on purpose.
 *
 * golf-finder learned the hard way that retrofitting schema versioning is painful, so
 * every persisted blob carries a `version` and goes through `migrate()` on load, even
 * though there's nothing to migrate yet. When the shape changes, add a step here — the
 * loader never assumes the current shape.
 */

export const SAVE_VERSION = 1;

/** The persisted game state. Grows over time; always behind a version + migrate(). */
export interface SaveV1 {
  version: 1;
  /** Active run seed, if a run is in progress. */
  runSeed?: number;
  /** Galaxy distance travelled this run. */
  distanceFromStart: number;
  /** Soft currency earned across the run. */
  credits: number;
  /** Best Stableford total ever recorded (meta-progression hook). */
  bestStableford: number;
  /** ISO-ish timestamp the save was written (filled by the storage layer). */
  savedAt?: string;
}

/** The current save shape (alias so call sites don't pin a version number). */
export type Save = SaveV1;

export function defaultSave(): Save {
  return {
    version: SAVE_VERSION,
    distanceFromStart: 0,
    credits: 0,
    bestStableford: 0,
  };
}

/**
 * Migrate an unknown persisted blob up to the current version. Today it's a no-op for
 * v1 and a reset-to-default for anything unrecognised; tomorrow each version bump adds
 * one `if (s.version === N) { ...; s.version = N+1 }` step in sequence.
 */
export function migrate(raw: unknown): Save {
  if (!raw || typeof raw !== 'object') return defaultSave();
  const s = raw as Partial<SaveV1> & { version?: number };

  // Future migrations chain here, e.g.:
  //   if (s.version === 1) { /* transform to v2 */ s.version = 2; }

  if (s.version !== SAVE_VERSION) {
    // Unknown/older-than-supported: start clean rather than guess at a shape.
    return defaultSave();
  }

  // Fill any missing fields defensively (a partial blob shouldn't crash the loader).
  return {
    version: SAVE_VERSION,
    runSeed: s.runSeed,
    distanceFromStart: s.distanceFromStart ?? 0,
    credits: s.credits ?? 0,
    bestStableford: s.bestStableford ?? 0,
    savedAt: s.savedAt,
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
