/**
 * Pre-rename storage keys (GS-release-identity).
 *
 * The game shipped its persistence under a `gs_*` namespace while it was called Golf Stars.
 * The rename moved every key to `fc_*` so a player who opens devtools, or exports a save, sees
 * one consistent product — decided BEFORE launch precisely because doing it after would mean
 * migrating real players' data instead of a handful of test devices.
 *
 * "No saves exist yet" was very nearly true and not quite: the dev machine and the play-testers'
 * phones each hold one. So the read path is FORWARD-COMPATIBLE rather than a hard cutover —
 * every loader tries the new key, then falls back to the old one. Writes only ever go to the new
 * key, so the first save after an update completes the move on its own.
 *
 * This is the same shape the rest of the save layer already uses: `migrateCampaignStore` adopts a
 * pre-roster bare `StoryState`, and `parseBackup` folds a v1 bundle's single campaign into a
 * one-slot roster. Old input is accepted; new output is canonical.
 *
 * **This module is a one-way street with an expiry.** It exists to carry devices across a single
 * rename. Nothing new should ever be added here — a second legacy namespace means the rename
 * happened twice, which is a decision to revisit, not a case to handle.
 */

/** The namespace every persisted key used before the rename. */
const LEGACY_PREFIX = 'gs_';

/** The namespace every persisted key uses now. */
const CURRENT_PREFIX = 'fc_';

/**
 * The pre-rename spelling of a current key — `fc_save` → `gs_save`.
 *
 * Takes the CURRENT key rather than a bare name so a caller cannot drift: the fallback is
 * derived from the constant the loader already reads, so a key that gets renamed again can only
 * ever produce a matching legacy lookup.
 */
export function legacyKeyFor(currentKey: string): string {
  return currentKey.startsWith(CURRENT_PREFIX)
    ? LEGACY_PREFIX + currentKey.slice(CURRENT_PREFIX.length)
    : currentKey;
}
