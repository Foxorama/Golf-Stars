/**
 * CAN *THIS BUILD* READ WHAT IS ON THE DEVICE? (GS-save-integrity)
 *
 * `save/durability.ts` answers a different question — will the browser KEEP what we write. This one
 * is the mirror of it: the bytes are there, and we do not understand them. Three ways that happens,
 * and until this module existed all three ended the same way, with the real save destroyed:
 *
 *  1. **`newer`** — a save written by a later build. `migrate()` is forward-only, so an unrecognised
 *     version fell through to `defaultSave()`, and the next ordinary write laid that empty save over
 *     the real one. The narrow routes are a stale CDN copy or an offline boot on a retired worker;
 *     the WIDE one is the Capacitor shell, which never auto-updates and is its own origin, so
 *     "export from the browser, import into the app" is the documented workflow AND was a
 *     data-loss path the moment the two builds differed by a schema version.
 *  2. **`foreign`** — a blob that parses but is not ours. itch.io serves every HTML5 game from one
 *     shared CDN origin, so `fc_save` sits in a bucket shared with every other game on the platform
 *     (reports/release-pipeline-2026-07-30.md). Nothing stops a neighbour writing that key. The old
 *     behaviour read it as garbage, started fresh, and then overwrote THEIR data too.
 *  3. **`corrupt`** — bytes that are not JSON at all (a truncated write, a quota kill mid-`setItem`).
 *
 * THE RULE, and it is the whole module: **this build never overwrites data it could not fully
 * read.** A fault puts the save layer in READ-ONLY — the game stays completely playable, nothing is
 * persisted, the title screen says so, and the Save data section offers the stored bytes as a
 * download. Refusing to write is not a degraded mode chosen for safety's sake; a save we cannot
 * parse is one we cannot merge into, so writing is *guessing*, and the thing being guessed over may
 * be a hundred hours of somebody's campaign.
 *
 * Deliberately NOT a quarantine copy under a second key: it would double the blob inside a shared
 * quota (see 2), and it would need a row in PRIVACY.md's table, which `tests/privacy.test.ts`
 * machine-checks. Leaving the original untouched achieves the same thing and stores nothing new.
 *
 * The one write that is still allowed is an IMPORT, because it is the deliberate, confirmed,
 * replace-everything action and it is the player's way out. `clearFault()` is called by
 * `applyBackup` before it writes — an import resolves the fault by definition.
 *
 * Node-safe and DOM-free: the verdict is set by the storage layer and read by the title screen and
 * the settings sheet, and the copy is built here so those two surfaces cannot drift.
 */

import { GAME_TITLE } from '../brand';

/** Which blob failed, so the message can name it. `fc_settings` is absent on purpose: it merges over
 *  defaults and holds no progress, so an unreadable one costs a player their preferences, not a save. */
export type FaultedBlob = 'save' | 'story';

export type SaveFault =
  /** Written by a later build. `found` is the version we read and could not handle. */
  | { why: 'newer'; blob: FaultedBlob; found: number }
  /** Parsed, but not this game's data. */
  | { why: 'foreign'; blob: FaultedBlob }
  /** Not parseable at all. */
  | { why: 'corrupt'; blob: FaultedBlob };

/**
 * The live verdict. A mutable module singleton for the same reason `storageHealth` is one:
 * cross-module `let` reassignment is illegal in ESM, and the storage layer, the title screen and the
 * settings sheet all need whatever the boot read found.
 *
 * `raw` is the stored text, kept ONLY in memory and only so the rescue download can hand the player
 * the exact bytes. It is never re-written to storage.
 */
export const saveIntegrity: { fault: SaveFault | null; raw: string | null } = { fault: null, raw: null };

/** Latch a fault found while reading. First fault wins: the main save is read before the campaigns,
 *  and if both are from a newer build the player needs one message, not a queue of them. */
export function recordFault(fault: SaveFault, raw: string | null): void {
  if (saveIntegrity.fault) return;
  saveIntegrity.fault = fault;
  saveIntegrity.raw = raw;
}

/** Clear the verdict. ONLY an import may call this — it replaces every blob, so whatever we could not
 *  read is being deliberately and knowingly discarded by the player. */
export function clearFault(): void {
  saveIntegrity.fault = null;
  saveIntegrity.raw = null;
}

/** Is the save layer refusing writes? The single predicate every writer and every surface asks. */
export function readOnly(): boolean {
  return saveIntegrity.fault !== null;
}

/** Test seam: reset the singleton between cases. */
export function resetIntegrityForTests(): void {
  clearFault();
}

const BLOB_NAME: Record<FaultedBlob, string> = {
  save: 'save',
  story: 'Story Tour campaigns',
};

/**
 * What happened, in the player's terms — a PURE sentence so the title alert and the settings sheet
 * say the same thing. Never speculative: each arm names the actual cause we detected.
 */
export function faultHeadline(fault: SaveFault): string {
  const what = BLOB_NAME[fault.blob];
  switch (fault.why) {
    case 'newer':
      return `This device holds a ${what} from a newer version of ${GAME_TITLE}.`;
    case 'foreign':
      return `The ${what} stored here wasn't written by ${GAME_TITLE}.`;
    case 'corrupt':
      return `The ${what} stored here couldn't be read.`;
  }
}

/** Why it is worth the player's attention, and what the game is doing about it. */
export function faultExplanation(fault: SaveFault): string {
  switch (fault.why) {
    case 'newer':
      return `Rather than overwrite progress it can't read, the game has stopped saving. Update to the latest version and it will load normally.`;
    case 'foreign':
      return `On itch.io every browser game shares one storage area, so this is most likely another game's data under the same name. The game has stopped saving rather than overwrite it.`;
    case 'corrupt':
      return `The stored data is damaged — usually a save interrupted part-way through writing. The game has stopped saving so the remains aren't overwritten.`;
  }
}

/** The way out, in both places it is offered. Kept here so neither surface invents a different one. */
export function faultRescue(fault: SaveFault): string {
  return fault.why === 'newer'
    ? `You can download the stored data as a file first — then update, and import it.`
    : `You can download the stored data as a file, in case it can be recovered — then import a backup to start saving again.`;
}
