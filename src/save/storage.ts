/**
 * Persistence: localStorage is the ONLY copy, so export/import-to-JSON is not optional
 * (lesson from golf-finder). Keys are namespaced `gs_*`. Everything degrades safely when
 * `localStorage` is unavailable (Node/tests, private mode) — the sim never depends on it.
 */

import { defaultSave, exportSave, importSave, migrate, type Save } from './schema';

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

/** Download the save as a JSON file (browser only). */
export function downloadSave(save: Save, filename = 'golf-stars-save.json'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([exportSave(save)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Import a save from JSON text and persist it. Returns the loaded save. */
export function importAndStore(json: string): Save {
  const save = importSave(json);
  writeSave(save);
  return save;
}
