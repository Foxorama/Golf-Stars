/**
 * RUN SLOTS (GS-save-slots) — one parked run PER MODE, PER GOLFER, instead of the single `activeRun`
 * that four modes fought over.
 *
 * `fc_save.activeRun` was ONE snapshot. Voyage, the Unending Universe, Star Tour and Story Tour all
 * wrote through it, so starting anything discarded whatever else was parked — the player's mental
 * model ("a Voyage going with Larry and an Unending going with Bo") had never been true, and nothing
 * on screen said so. This module is the shape that makes it true, copied deliberately from
 * `storyRoster.ts`: a keyed table, one entry per (mode, golfer), edited one slot at a time.
 *
 * THE KEY IS `${mode}:${characterId}`, and the mode comes from the run's FORMAT (plus its
 * `storyRound` flag), never from whichever screen is up — so the same run parks in the same slot no
 * matter how it was reached.
 *
 * FOUR MODES, THREE SLOTS. Story Tour's progress is a `CampaignStore` in `fc_story`, which already
 * has this exact shape, its own migration, its own cache and its own backup handling; folding it in
 * would buy tidiness and cost a risky migration of the one blob you least want to touch. So a story
 * round has a mode (`lastPlayed` can point at it) but NO run slot — and that is what retires the
 * old "a Story Mode world round is NEVER the main-save resumable" exception. It was a workaround for
 * having one slot to protect; with a slot per mode there is nothing to protect, because a story run
 * simply maps to a mode that owns no slot.
 *
 * PURE + DOM-free (no `localStorage`, no rng, no clock) so vitest exercises the whole table
 * headlessly; `save/schema.ts` versions it and `ui/resumable.ts` decides what a live state parks.
 * Nothing here throws: a corrupt or partial blob degrades to the best honest reading of it, because
 * the alternative on a boot path is a bricked game.
 */

import { ASGARD_FORMAT, STROKEPLAY_FORMAT, getFormat } from './formats';
import type { RunSnapshot } from './runSerialise';

/** The four things a player can have going at once. */
export type RunMode = 'voyage' | 'endless' | 'startour' | 'story';

/** The three that park a `RunSnapshot` in `fc_save.runSlots`. Story's progress is `fc_story`. */
export type SlotMode = Exclude<RunMode, 'story'>;

/** Stable order for any surface that lists modes. */
export const RUN_MODES: readonly RunMode[] = ['voyage', 'endless', 'startour', 'story'];

/** What each mode is called on screen. A `Record` so a new mode fails to compile until it is named —
 *  the title's CONTINUE promises to say WHICH mode before you tap it, so an unnamed mode is a bug. */
export const RUN_MODE_LABEL: Record<RunMode, string> = {
  voyage: 'The Voyage',
  endless: 'Unending Universe',
  startour: 'Star Tour',
  story: 'Story Tour',
};

/** The little glyph each mode wears on the title card (matching the existing tiles). */
export const RUN_MODE_ICON: Record<RunMode, string> = {
  voyage: '🚀',
  endless: '🌌',
  startour: '🗺',
  story: '🌠',
};

/** `mode:characterId → the run parked there`. Persisted on `fc_save` (save v33). */
export type RunSlots = Record<string, RunSnapshot>;

/** The last mode + golfer actually played — what the title's CONTINUE offers. `mode` MAY be `'story'`
 *  (whose progress lives in `fc_story`), which is exactly why this is a pointer and not a snapshot. */
export interface LastPlayed {
  mode: RunMode;
  characterId: string;
}

/** A run with no golfer picked yet (a v1-era snapshot, or the title's placeholder). Keyed under the
 *  empty string so it still round-trips rather than being silently dropped; every surface that names
 *  a golfer already falls back to "Your golfer". */
export const UNKNOWN_GOLFER = '';

/** The slot key. One function, so the writer and every reader spell it the same way. */
export function slotKey(mode: SlotMode, characterId: string | undefined): string {
  return `${mode}:${characterId ?? UNKNOWN_GOLFER}`;
}

/** Split a key back into its parts, or `null` if it isn't one of ours (a hand-edited blob). */
export function parseSlotKey(key: string): { mode: SlotMode; characterId: string } | null {
  const i = key.indexOf(':');
  if (i <= 0) return null;
  const mode = key.slice(0, i);
  if (!isSlotMode(mode)) return null;
  return { mode, characterId: key.slice(i + 1) };
}

function isSlotMode(s: string): s is SlotMode {
  return s === 'voyage' || s === 'endless' || s === 'startour';
}

/** Is this one of the four modes? (Guards a persisted `lastPlayed.mode`.) */
export function isRunMode(s: unknown): s is RunMode {
  return s === 'voyage' || s === 'endless' || s === 'startour' || s === 'story';
}

/**
 * Which mode a run belongs to — the ONE derivation.
 *
 * `storyRound` wins because a Story Tour world round is played on the STROKEPLAY format (it is a
 * pinned static course), so the format alone would file it under Star Tour and let a campaign round
 * overwrite a parked free-roam round. Asgard returns `null`: the tournament run is ephemeral by
 * design (a mid-tournament quit resumes the SUSPENDED real run), so it belongs in no slot at all.
 */
export function runModeOf(formatId: string | undefined, storyRound?: boolean): RunMode | null {
  if (storyRound) return 'story';
  if (formatId === ASGARD_FORMAT) return null;
  if (formatId === STROKEPLAY_FORMAT) return 'startour';
  return getFormat(formatId).winnable ? 'voyage' : 'endless';
}

/** The mode a parked SNAPSHOT belongs to. A snapshot never carries `storyRound` (story rounds are
 *  never parked here), so this can only answer with a slot mode — or `null` for Asgard. */
export function slotModeOf(snap: RunSnapshot): SlotMode | null {
  const mode = runModeOf(snap.formatId);
  return mode && mode !== 'story' ? mode : null;
}

/** The run parked for this golfer in this mode, or `null`. */
export function readSlot(slots: RunSlots, mode: SlotMode, characterId: string | undefined): RunSnapshot | null {
  return slots[slotKey(mode, characterId)] ?? null;
}

/** Park a run, leaving every other slot untouched. Immutable, and it returns the SAME object when
 *  the snapshot is already exactly what is stored — so a no-op action can't churn the save. */
export function upsertSlot(
  slots: RunSlots,
  mode: SlotMode,
  characterId: string | undefined,
  snap: RunSnapshot,
): RunSlots {
  return { ...slots, [slotKey(mode, characterId)]: snap };
}

/** Empty a slot (a run that ended, or an explicit start-over). A no-op when nothing is parked there,
 *  returning the SAME object, so callers can lean on referential identity. */
export function clearSlot(slots: RunSlots, mode: SlotMode, characterId: string | undefined): RunSlots {
  const key = slotKey(mode, characterId);
  if (!(key in slots)) return slots;
  const next = { ...slots };
  delete next[key];
  return next;
}

/** Every golfer with a run parked in this mode (`characterId → snapshot`) — what a per-mode picker
 *  badges its cards from. */
export function slotsForMode(slots: RunSlots, mode: SlotMode): Record<string, RunSnapshot> {
  const out: Record<string, RunSnapshot> = {};
  for (const key of Object.keys(slots).sort()) {
    const parsed = parseSlotKey(key);
    if (parsed?.mode === mode) out[parsed.characterId] = slots[key]!;
  }
  return out;
}

/** How many runs are parked in total (the backup summary's "N runs in progress"). */
export function slotCount(slots: RunSlots): number {
  return Object.keys(slots).length;
}

/**
 * Read ANY persisted `runSlots` blob. Never throws — the worst case is an empty table.
 *
 * Entries are RE-KEYED off the snapshot itself (its format's mode + its own `characterId`), for the
 * same reason `migrateCampaignStore` re-keys a campaign to its protagonist: the key is an index, the
 * snapshot is the truth. That also collapses a hand-edited file pointing two keys at one run, and
 * quietly drops an Asgard snapshot that should never have been parked.
 */
export function migrateRunSlots(raw: unknown): RunSlots {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: RunSlots = {};
  for (const [, value] of Object.entries(raw as Record<string, unknown>)) {
    const snap = value as RunSnapshot | undefined;
    if (!snap || typeof snap !== 'object' || typeof snap.seed !== 'number') continue;
    const mode = slotModeOf(snap);
    if (!mode) continue;
    out[slotKey(mode, snap.characterId)] = snap;
  }
  return out;
}

/** Read a persisted `lastPlayed` pointer, dropping anything that isn't one of ours. */
export function migrateLastPlayed(raw: unknown): LastPlayed | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  if (!isRunMode(obj.mode)) return undefined;
  return { mode: obj.mode, characterId: typeof obj.characterId === 'string' ? obj.characterId : UNKNOWN_GOLFER };
}

/**
 * The badge shown against a golfer wherever a mode asks you to pick one (`Stop 7` · `Hole 34` ·
 * `Hole 12 of 18`), and the fuller line for a card with room.
 *
 * `null` = nothing worth continuing. Today that is a Star Tour session with no course teed off —
 * the same judgement the title's Continue card has always made — so the picker and the title cannot
 * disagree about whether a slot is real.
 *
 * Pure and derived from the SNAPSHOT, exactly like `campaignTag` is derived from the campaign, so no
 * two surfaces can describe the same parked run differently.
 */
export interface SlotTag {
  mode: SlotMode;
  /** Short badge for a crowded surface: `Stop 7` · `Hole 34` · `Hole 12/18`. */
  short: string;
  /** The full line for a card with room. */
  label: string;
}
export function slotTag(snap: RunSnapshot): SlotTag | null {
  const mode = slotModeOf(snap);
  if (!mode) return null;
  if (mode === 'startour') {
    // A Star Tour run with no course pinned is a golfer standing on the star map — nothing played,
    // nothing to continue.
    if (!snap.staticCourseId) return null;
    const hole = (snap.stopHoleIndex ?? 0) + 1;
    return { mode, short: `Hole ${hole}/18`, label: `Round in progress — hole ${hole} of 18` };
  }
  if (mode === 'voyage') {
    const stop = snap.stopIndex + 1;
    return { mode, short: `Stop ${stop}`, label: `In progress — stop ${stop}` };
  }
  const hole = (snap.holesSurvived ?? 0) + 1;
  return { mode, short: `Hole ${hole}`, label: `In progress — hole ${hole}` };
}

/** Every golfer's badge for one mode, for a picker that renders the whole roster at once. Golfers
 *  with no (continuable) run are simply absent. */
export function slotTags(slots: RunSlots, mode: SlotMode): Record<string, SlotTag> {
  const out: Record<string, SlotTag> = {};
  for (const [characterId, snap] of Object.entries(slotsForMode(slots, mode))) {
    const tag = slotTag(snap);
    if (tag) out[characterId] = tag;
  }
  return out;
}

/**
 * What starting a NEW run for this golfer in this mode would DESTROY, or `null` when it costs
 * nothing. The UI turns this into the confirmation; putting it here means the decision is
 * unit-testable and the screen cannot quietly disagree with what actually happens.
 *
 * This is `campaignOverwriteWarning` generalised, which is the point: the reducer-level overwrite
 * guard was right, it simply was not applied widely enough — which is exactly how #662 happened.
 */
export interface SlotOverwrite {
  mode: SlotMode;
  characterId: string;
  existing: RunSnapshot;
  tag: SlotTag;
}
export function slotOverwriteWarning(
  slots: RunSlots,
  mode: SlotMode,
  characterId: string | undefined,
): SlotOverwrite | null {
  const existing = readSlot(slots, mode, characterId);
  if (!existing) return null;
  const tag = slotTag(existing);
  // Nothing continuable ⇒ nothing to warn about; starting fresh simply replaces a dead slot.
  if (!tag) return null;
  return { mode, characterId: characterId ?? UNKNOWN_GOLFER, existing, tag };
}
