/**
 * Save transfer, app layer (GS-save-transfer) — the browser/DOM half of `save/backup.ts`.
 *
 * Reads the three persisted blobs (`fc_save` / `fc_story` / `fc_settings`) into a bundle, and writes
 * a bundle back. Nothing here is pure: it touches `localStorage`, the clipboard and an `<a download>`,
 * which is exactly why the FORMAT lives in `save/backup.ts` and only the plumbing lives here.
 *
 * Why both a file download AND a clipboard copy: a blob-URL `<a download>` is reliable in a real
 * browser and *not* reliable inside the Capacitor WebView, which has no download manager wired up by
 * default. The export path therefore offers both and never claims success it can't verify — the
 * clipboard route is the one that always works in the shell, and the file route is the one that
 * survives a long save being truncated by a paste buffer.
 */

import { loadSave, writeSave } from '../save/storage';
import { loadCampaignStore, writeCampaignStore, clearStory, invalidateCampaignCache } from '../save/storyStore';
import { buildBackup, type Backup } from '../save/backup';
import { campaignCount } from '../sim/rpg/storyRoster';
// The key comes from `settings.ts`, which OWNS it. This module used to declare its own copy of the
// literal, so the rename (GS-release-identity) had two places to land and only one obvious one —
// exactly the second-description bug this codebase keeps paying for. Import, never re-spell.
import { SETTINGS_KEY } from '../settings';
import { legacyKeyFor } from '../save/legacyKeys';

function store(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Everything the player owns, as the JSON text of a backup file. Reads the PERSISTED blobs, so
 *  callers must flush the live state first (`persist()` / `persistStory()`) — app.ts does. */
export function currentBackupJSON(): string {
  let settings: Record<string, unknown> | null = null;
  try {
    const s = store();
    const raw = s?.getItem(SETTINGS_KEY) ?? s?.getItem(legacyKeyFor(SETTINGS_KEY));
    if (raw) settings = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* preferences are the optional part of the bundle — never fail an export over them */
  }
  return buildBackup({
    save: loadSave(),
    campaigns: loadCampaignStore(),
    settings,
    exportedAt: new Date().toISOString(),
  });
}

/** A filename a player can tell apart in a Downloads folder — dated, no clock-time precision needed.
 *  Cosmetic only: `parseBackup` recognises a file by its `kind` field, never its name, so backups
 *  exported under the old product name still import (GS-release-identity). */
export function backupFilename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `far-carry-save-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.json`;
}

/** Offer the backup as a file download. Returns false when the environment gives us no way to do it
 *  (no DOM) — the caller then falls back to the clipboard rather than reporting a success. */
export function downloadBackup(json: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename();
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on a later tick: some WebViews are still reading the blob when click() returns, and
    // revoking synchronously produced an empty file.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

/** Copy the backup to the clipboard — the route that works inside the Android shell. Async because
 *  the async Clipboard API is the only one available on a secure origin without a document.exec
 *  fallback; resolves false so the UI can say so honestly rather than silently doing nothing. */
export async function copyBackupToClipboard(json: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(json);
    return true;
  } catch {
    return false;
  }
}

/** Parse a file's text into a bundle. Re-exported so the UI imports one module, and so the throwing
 *  contract (`BackupError`) is the ONLY way an import can fail — never a silent default save. */
export { parseBackup, describeBackup, BackupError, type Backup } from '../save/backup';

/**
 * Write a parsed bundle over the local blobs. Destructive and deliberately so — the caller must have
 * confirmed with the player first.
 *
 * The campaigns are written OR CLEARED to match the file: a backup that carries no campaign must not
 * leave the device's existing ones in place, or a player restoring an old file would end up with a
 * save and campaigns that never coexisted — a state neither device was ever in. The roster REPLACES
 * the local one wholesale rather than merging: a merge would have to invent an answer for "both sides
 * have a Feather Fade campaign", and silently picking one is precisely the guess an import must not
 * make. `describeBackup` lists what is in the file so the choice is the player's, made before the write.
 */
export function applyBackup(b: Backup): void {
  writeSave(b.save);
  if (campaignCount(b.campaigns) > 0) writeCampaignStore(b.campaigns);
  else clearStory();
  // The roster cache is module state in `storyStore`; both writes above keep it in step, but drop it
  // anyway so a future call can never serve a pre-import roster back to the write-after-every-action.
  invalidateCampaignCache();
  if (b.settings) {
    try {
      store()?.setItem(SETTINGS_KEY, JSON.stringify(b.settings));
    } catch {
      /* preferences are optional — a restored save with default settings is still a restored save */
    }
  }
}
