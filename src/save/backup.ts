/**
 * Save transfer (GS-save-transfer) — the ONE portable representation of everything a player owns.
 *
 * `localStorage` is the only copy of a Golf Stars save, and it is scoped to an ORIGIN. The browser
 * build and the Android shell are two different origins (Capacitor serves from `https://localhost`),
 * so a save made on the website is genuinely invisible to the app and vice versa. Moving between
 * them — or off a phone before an uninstall — needs a file, and this is that file.
 *
 * A backup is a BUNDLE, not a save, because a save is not all of it: the campaign lives in its own
 * `gs_story` blob and the preferences in `gs_settings`. Exporting `gs_save` alone would silently
 * drop a player's whole Story Tour progress, which is the kind of "worked, but lost half your stuff"
 * failure a backup feature exists to prevent.
 *
 * PURE by design (no `localStorage`, no DOM, no rng), so the format is unit-testable in node and the
 * app layer owns the reading/writing — see `app/saveTransfer.ts`.
 */

import { migrate, type Save } from './schema';
import { migrateStory, type StoryState } from '../sim/rpg/story';

/** Marks a file as ours. A JSON file that doesn't carry this (and isn't a recognisable legacy bare
 *  save) is rejected rather than guessed at. */
export const BACKUP_KIND = 'golf-stars-backup';

/** Bundle format version — INDEPENDENT of `SAVE_VERSION`. This is the envelope; the save inside it
 *  carries its own version and is migrated by the existing `migrate()` chain on import. */
export const BACKUP_VERSION = 1;

export interface Backup {
  kind: typeof BACKUP_KIND;
  version: number;
  /** ISO timestamp, informational — shown on the import confirmation so a player can tell two
   *  backup files apart. Never used for ordering or logic. */
  exportedAt: string;
  save: Save;
  /** The Story Tour campaign, when one exists. `null` is a real value here (no campaign), and is
   *  applied as "clear the campaign" — importing a pre-Story backup onto a device WITH a campaign
   *  must not silently leave the old one behind pretending it came with the file. */
  story: StoryState | null;
  /** Player preferences. Optional: they're the least important part of the bundle and a file
   *  without them still restores everything that matters. */
  settings: Record<string, unknown> | null;
}

/** Thrown by `parseBackup` when a file cannot be trusted. Carries a player-facing `message` — the
 *  import UI shows it verbatim, so it must read as an explanation, not a stack trace. */
export class BackupError extends Error {}

export interface BackupParts {
  save: Save;
  story: StoryState | null;
  settings: Record<string, unknown> | null;
  /** Passed in rather than read from the clock so this module stays pure (and `Date.now()` is banned
   *  in deterministic paths — see CLAUDE.md). The app layer stamps it. */
  exportedAt: string;
}

/** Serialise a bundle to the JSON text that becomes the downloaded file. */
export function buildBackup(parts: BackupParts): string {
  const backup: Backup = {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: parts.exportedAt,
    save: parts.save,
    story: parts.story,
    settings: parts.settings,
  };
  return JSON.stringify(backup, null, 2);
}

/**
 * Parse + migrate a backup file. **Throws `BackupError`** on anything it cannot trust.
 *
 * Throwing is the whole point. `importSave` in `schema.ts` swallows its errors and returns
 * `defaultSave()` — correct for a boot path (a corrupt blob should not brick the game) and
 * catastrophic for an import path, where it would quietly replace a real save with an empty one and
 * report success. An import must refuse rather than guess.
 *
 * Accepts two shapes:
 *  - a bundle (`kind: 'golf-stars-backup'`);
 *  - a BARE save object — what `exportSave()` has always emitted — so a file written by any older
 *    build still restores. It carries no campaign, which is honest: there wasn't one in the file.
 */
export function parseBackup(json: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new BackupError("That file isn't valid JSON — it may be truncated or not a save file.");
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BackupError("That file doesn't look like a Golf Stars save.");
  }
  const obj = raw as Record<string, unknown>;

  // A bundle written by this feature.
  if (obj.kind === BACKUP_KIND) {
    if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
      throw new BackupError(
        `That backup was made by a newer version of Golf Stars (format ${String(obj.version)}). Update the game, then import it.`,
      );
    }
    return {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
      save: migrateSaveOrThrow(obj.save),
      story: migrateStoryOrNull(obj.story),
      settings: plainObjectOrNull(obj.settings),
    };
  }

  // A legacy bare save (`exportSave` output): recognised by carrying a numeric schema `version`.
  if (typeof obj.version === 'number') {
    return {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      exportedAt: typeof obj.savedAt === 'string' ? obj.savedAt : '',
      save: migrateSaveOrThrow(obj),
      story: null,
      settings: null,
    };
  }

  throw new BackupError("That file doesn't look like a Golf Stars save.");
}

function migrateSaveOrThrow(raw: unknown): Save {
  if (!raw || typeof raw !== 'object') {
    throw new BackupError('That backup is missing its save data.');
  }
  try {
    return migrate(raw);
  } catch {
    throw new BackupError("That save couldn't be read — it may be from an incompatible version.");
  }
}

/** A campaign that won't migrate is dropped rather than failing the whole import: the main save is
 *  the bulk of a player's progress, and refusing everything because the Story blob is odd would be a
 *  worse trade. The import summary reports what actually came through. */
function migrateStoryOrNull(raw: unknown): StoryState | null {
  if (!raw || typeof raw !== 'object') return null;
  try {
    return migrateStory(raw);
  } catch {
    return null;
  }
}

function plainObjectOrNull(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/** A short, player-facing description of what's in a backup — shown on the confirm step BEFORE it
 *  overwrites anything, so you can tell you picked the right file (and spot the moment you're about
 *  to restore an empty one over a real save). */
export function describeBackup(b: Backup): string[] {
  const s = b.save;
  const lines: string[] = [];
  lines.push(`✦ ${(s.shards ?? 0).toLocaleString()} Star Shards`);
  lines.push(`🏆 Best ${s.bestStableford ?? 0} pts · Ascension A${s.maxAscension ?? 0}`);
  const ships = s.ownedShips?.length ?? 0;
  const apparel = s.ownedApparel?.length ?? 0;
  if (ships || apparel) lines.push(`🚀 ${ships} ship${ships === 1 ? '' : 's'} · 👕 ${apparel} cosmetic${apparel === 1 ? '' : 's'}`);
  if (s.activeRun) lines.push('▶ A run in progress');
  lines.push(b.story ? `📖 Story Tour — chapter ${b.story.chapter ?? 1}` : '📖 No Story Tour campaign');
  return lines;
}
