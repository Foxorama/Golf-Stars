/**
 * Persistence: localStorage is the ONLY copy, so export/import-to-JSON is not optional
 * (lesson from golf-finder). Keys are namespaced `gs_*`. Everything degrades safely when
 * `localStorage` is unavailable (Node/tests, private mode) — the sim never depends on it.
 */

import { defaultSave, migrate, type Save } from './schema';

export const SAVE_KEY = 'gs_save';

function store(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Load + migrate the save, or a fresh default if nothing/garbage is stored. */
export function loadSave(): Save {
  const s = store();
  if (!s) return defaultSave();
  const raw = s.getItem(SAVE_KEY);
  if (!raw) return defaultSave();
  try {
    return migrate(JSON.parse(raw));
  } catch {
    return defaultSave();
  }
}

/** Persist the save (stamps `savedAt`). Returns false if storage is unavailable. */
export function writeSave(save: Save): boolean {
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

// Save export/import lives in `save/backup.ts` + `app/saveTransfer.ts` (GS-save-transfer), NOT here.
//
// This file used to carry a `downloadSave` / `importAndStore` pair. They were never wired to any UI,
// and both were wrong for the job by the time one was needed: `downloadSave` wrote the MAIN SAVE
// only, which would have silently dropped a player's whole Story Tour campaign (`gs_story` is a
// separate blob), and `importAndStore` went through `importSave`, which swallows its errors and
// returns `defaultSave()` — so a wrong file would have reported success while wiping a real save.
// Removed rather than left lying around: a plausible-looking helper that quietly loses data is worse
// than no helper. See `docs/decisions/save-transfer.md`.
