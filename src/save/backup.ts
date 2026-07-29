/**
 * Save transfer (GS-save-transfer) — the ONE portable representation of everything a player owns.
 *
 * `localStorage` is the only copy of a save, and it is scoped to an ORIGIN. The browser
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
import { GAME_TITLE } from '../brand';
import {
  campaignCount,
  campaignList,
  emptyCampaignStore,
  migrateCampaignStore,
  type CampaignStore,
} from '../sim/rpg/storyRoster';
import { getCharacter } from '../sim/rpg/characters';

/** Marks a file as ours. A JSON file that doesn't carry this (and isn't a recognisable legacy bare
 *  save) is rejected rather than guessed at.
 *
 *  **Deliberately NOT renamed with the product** (GS-release-identity). This string is stamped into
 *  every backup file every player has ever exported; it is an on-disk IDENTIFIER, not a label.
 *  Renaming it would make every existing backup unreadable — the precise failure this feature
 *  exists to prevent. `tests/brand.test.ts` pins it. */
export const BACKUP_KIND = 'golf-stars-backup';

/** Bundle format version — INDEPENDENT of `SAVE_VERSION`. This is the envelope; the save inside it
 *  carries its own version and is migrated by the existing `migrate()` chain on import.
 *
 *  v1 → v2 (GS-story-campaign-slots): the single `story` campaign became a `campaigns` ROSTER (one per
 *  golfer). Bumping is the POINT, not a formality: an older build reading a v2 file trips its own
 *  `version > BACKUP_VERSION` check and refuses with "made by a newer version" — a loud,
 *  correct failure. Had we smuggled the roster through the old `story` field instead, that build would
 *  have handed a roster to `migrateStory` and silently restored ONE mangled campaign while reporting
 *  success, which is exactly the class of failure a backup feature exists to prevent. */
export const BACKUP_VERSION = 2;

export interface Backup {
  kind: typeof BACKUP_KIND;
  version: number;
  /** ISO timestamp, informational — shown on the import confirmation so a player can tell two
   *  backup files apart. Never used for ordering or logic. */
  exportedAt: string;
  save: Save;
  /** Every Story Tour campaign (GS-story-campaign-slots), keyed by golfer. An EMPTY roster is a real
   *  value (no campaigns), and is applied as "clear the campaigns" — importing a pre-Story backup onto
   *  a device WITH campaigns must not silently leave the old ones behind pretending they came with the
   *  file. A v1 bundle's single `story` is folded in here as a one-slot roster, so there is exactly ONE
   *  in-memory representation of a player's campaigns and no second description to drift. */
  campaigns: CampaignStore;
  /** Player preferences. Optional: they're the least important part of the bundle and a file
   *  without them still restores everything that matters. */
  settings: Record<string, unknown> | null;
}

/** Thrown by `parseBackup` when a file cannot be trusted. Carries a player-facing `message` — the
 *  import UI shows it verbatim, so it must read as an explanation, not a stack trace. */
export class BackupError extends Error {}

export interface BackupParts {
  save: Save;
  campaigns: CampaignStore;
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
    campaigns: parts.campaigns,
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
 *  - a bundle (`kind: 'golf-stars-backup'`), v1 or v2 — a v1 file's single `story` campaign is folded
 *    into a one-slot roster, so every backup ever written by this game still restores its campaign;
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
    throw new BackupError(`That file doesn't look like a ${GAME_TITLE} save.`);
  }
  const obj = raw as Record<string, unknown>;

  // A bundle written by this feature.
  if (obj.kind === BACKUP_KIND) {
    if (typeof obj.version !== 'number' || obj.version > BACKUP_VERSION) {
      throw new BackupError(
        `That backup was made by a newer version of ${GAME_TITLE} (format ${String(obj.version)}). Update the game, then import it.`,
      );
    }
    return {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '',
      save: migrateSaveOrThrow(obj.save),
      // v1 carried ONE campaign under `story`; v2 carries the roster under `campaigns`. Both land in
      // the same place — `migrateCampaignStore` adopts a bare `StoryState` as a one-slot roster, which
      // is the identical code path a pre-roster `gs_story` blob takes on load.
      campaigns: migrateCampaignsOrEmpty(obj.campaigns ?? obj.story),
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
      campaigns: emptyCampaignStore(),
      settings: null,
    };
  }

  throw new BackupError(`That file doesn't look like a ${GAME_TITLE} save.`);
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

/** Campaigns that won't migrate are dropped rather than failing the whole import: the main save is
 *  the bulk of a player's progress, and refusing everything because the Story blob is odd would be a
 *  worse trade. The import summary reports what actually came through. */
function migrateCampaignsOrEmpty(raw: unknown): CampaignStore {
  if (!raw || typeof raw !== 'object') return emptyCampaignStore();
  try {
    return migrateCampaignStore(raw);
  } catch {
    return emptyCampaignStore();
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
  // GS-story-campaign-slots: a bundle can now carry SEVERAL campaigns, and importing replaces the lot.
  // Name each golfer and say where they got to — a player about to overwrite three campaigns with one
  // deserves to see that before they tap, not after. Champions are called out (★) because a champion is
  // also a Star Tour character.
  const campaigns = campaignList(b.campaigns);
  if (campaigns.length === 0) {
    lines.push('📖 No Story Tour campaign');
  } else {
    lines.push(`📖 ${campaigns.length} Story Tour campaign${campaigns.length === 1 ? '' : 's'}`);
    for (const c of campaigns) {
      const who = getCharacter(c.characterId)?.name ?? c.characterId;
      lines.push(c.completed ? `   ★ ${who} — complete (Star Tour champion)` : `   · ${who} — chapter ${c.chapter ?? 1}`);
    }
  }
  return lines;
}

/** How many campaigns a bundle carries — for the import confirmation's "this replaces N campaigns". */
export function backupCampaignCount(b: Backup): number {
  return campaignCount(b.campaigns);
}
