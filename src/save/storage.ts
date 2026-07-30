/**
 * Persistence: localStorage is the ONLY copy, so export/import-to-JSON is not optional
 * (lesson from golf-finder). Keys are namespaced `fc_*`. Everything degrades safely when
 * `localStorage` is unavailable (Node/tests, private mode) — the sim never depends on it.
 */

import { defaultSave, readSave, type Save } from './schema';
import { legacyKeyFor } from './legacyKeys';
import { readOnly, recordFault, saveIntegrity } from './integrity';

export const SAVE_KEY = 'fc_save';

function store(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Load the save, or a fresh default when there is nothing stored.
 *
 * A default is ALSO what comes back when there is something stored that this build cannot read — but
 * in that case a fault is latched first (GS-save-integrity), which puts `writeSave` into read-only.
 * That ordering is the whole fix: the function used to return an indistinguishable default and the
 * next ordinary persist laid it over a real save. "Nothing here" and "something here I don't
 * understand" now diverge at the only place that can still tell them apart.
 */
export function loadSave(): Save {
  const s = store();
  if (!s) return defaultSave();
  const raw = s.getItem(SAVE_KEY) ?? s.getItem(legacyKeyFor(SAVE_KEY));
  if (!raw) return defaultSave();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    recordFault({ why: 'corrupt', blob: 'save' }, raw);
    return defaultSave();
  }
  const read = readSave(parsed);
  if (read.ok) return read.save;
  recordFault(
    read.why === 'newer' ? { why: 'newer', blob: 'save', found: read.found } : { why: 'foreign', blob: 'save' },
    raw,
  );
  return defaultSave();
}

/**
 * Persist the save (stamps `savedAt`). Returns false if storage is unavailable — or if the save layer
 * is READ-ONLY because boot found data it could not read.
 *
 * Returning false rather than throwing is deliberate and costs nothing: every caller already handles
 * a false from the storage-unavailable case (private mode, Node), so read-only rides the contract
 * that has been there since v1.
 */
export function writeSave(save: Save): boolean {
  if (readOnly()) return false;
  const s = store();
  if (!s) return false;
  const stamped: Save = { ...save, savedAt: new Date().toISOString() };
  try {
    s.setItem(SAVE_KEY, JSON.stringify(stamped));
    return true;
  } catch {
    return false;
  }
}

/** The exact stored bytes that could not be read, for the rescue download. `null` when there is no
 *  fault — there is nothing to rescue from a save that loaded fine. */
export function unreadableSaveText(): string | null {
  return saveIntegrity.fault ? saveIntegrity.raw : null;
}

// Save export/import lives in `save/backup.ts` + `app/saveTransfer.ts` (GS-save-transfer), NOT here.
//
// This file used to carry a `downloadSave` / `importAndStore` pair. They were never wired to any UI,
// and both were wrong for the job by the time one was needed: `downloadSave` wrote the MAIN SAVE
// only, which would have silently dropped a player's whole Story Tour campaign (`fc_story` is a
// separate blob), and `importAndStore` went through `importSave`, which swallows its errors and
// returns `defaultSave()` — so a wrong file would have reported success while wiping a real save.
// Removed rather than left lying around: a plausible-looking helper that quietly loses data is worse
// than no helper. See `docs/decisions/save-transfer.md`.
