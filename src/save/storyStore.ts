/**
 * Story Mode persistence (GS-story-save wiring; GS-story-campaign-slots roster) — the campaigns live in
 * their OWN localStorage key (`gs_story`), entirely SEPARATE from the main `gs_save` blob, so
 * Voyage/Unending's save is never touched by Story Mode (and vice-versa). Same degrade-safe contract as
 * `save/storage.ts`: everything no-ops when localStorage is unavailable (Node/tests, private mode), and a
 * corrupt blob loads as an EMPTY ROSTER rather than crashing.
 *
 * GS-story-campaign-slots: the key now holds a `CampaignStore` — one campaign PER GOLFER — instead of a
 * single `StoryState`. It is the SAME KEY on purpose: `migrateCampaignStore` adopts a pre-roster bare
 * campaign as a one-slot roster, so upgrading the game keeps the campaign a player already has, and the
 * backup bundle's blob list is unchanged. Two rules worth keeping straight:
 *
 *  - `writeCampaign` READ-MODIFIES-WRITES. It is called after every action, so it must never serialise a
 *    roster built from stale memory — one action would silently drop every other golfer's campaign. A
 *    module-level cache makes that read cheap; `invalidateCampaignCache()` drops it whenever something
 *    outside this module writes the key (a backup import).
 *  - `writeCampaign` does NOT move `activeId`. Star Tour persists the champion it is free-roaming as on
 *    every action, and that must not re-point the "Continue" of a campaign you are half-way through.
 *    Moving the pointer is `setActiveCampaignId`, called from the Story Tour entry path alone.
 */

import {
  activeCampaign,
  emptyCampaignStore,
  migrateCampaignStore,
  setActiveCampaign,
  upsertCampaign,
  type CampaignStore,
} from '../sim/rpg/storyRoster';
import { type StoryState } from '../sim/rpg/story';

export const STORY_KEY = 'gs_story';

function store(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** The parsed roster, cached so the write-after-every-action doesn't re-parse the blob each time.
 *  `null` = not yet read this session. */
let cache: CampaignStore | null = null;

/** Drop the cache — call after anything writes `gs_story` from outside this module (backup import), or
 *  the next `writeCampaign` would resurrect the pre-import roster from memory. */
export function invalidateCampaignCache(): void {
  cache = null;
}

/** Load the whole campaign roster (migrating a legacy single campaign in). Never throws. */
export function loadCampaignStore(): CampaignStore {
  if (cache) return cache;
  const s = store();
  if (!s) return emptyCampaignStore();
  let raw: string | null = null;
  try {
    raw = s.getItem(STORY_KEY);
  } catch {
    return emptyCampaignStore();
  }
  if (!raw) return (cache = emptyCampaignStore());
  try {
    return (cache = migrateCampaignStore(JSON.parse(raw)));
  } catch {
    return (cache = emptyCampaignStore());
  }
}

/** Persist a whole roster (a backup import; the roster-level edits). Returns false if storage is
 *  unavailable — and in that case the cache is left ALONE, so "no localStorage" stays the pure no-op it
 *  has always been rather than quietly becoming an in-memory store whose contents leak between callers.
 *  The cache is only ever a mirror of what is actually on disk. */
export function writeCampaignStore(next: CampaignStore): boolean {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(STORY_KEY, JSON.stringify(next));
    cache = next;
    return true;
  } catch {
    cache = null; // the write failed — the cache would be a lie about what is stored
    return false;
  }
}

/** Is any campaign present? (Cheap check for the title tile's New vs Continue framing.) */
export function hasStory(): boolean {
  return Object.keys(loadCampaignStore().campaigns).length > 0;
}

/** The campaign "Continue" resumes — the active slot, or the only one when there is exactly one.
 *  `null` when there is no campaign, or when several exist and none is flagged (⇒ show the picker). */
export function loadStory(): StoryState | null {
  return activeCampaign(loadCampaignStore());
}

/** Upsert ONE golfer's campaign, leaving every other slot — and the `activeId` pointer — untouched.
 *  This is the after-every-action write. */
export function writeStory(story: StoryState): boolean {
  return writeCampaignStore(upsertCampaign(loadCampaignStore(), story));
}

/** Point "Continue" at a golfer's campaign (the Story Tour entry path only). */
export function setActiveCampaignId(characterId: string): boolean {
  return writeCampaignStore(setActiveCampaign(loadCampaignStore(), characterId));
}

/** Wipe EVERY campaign. Only a backup import (which replaces the roster wholesale) should do this —
 *  a "start over" replaces one golfer's slot, it does not clear the roster. */
export function clearStory(): void {
  cache = null;
  const s = store();
  try {
    s?.removeItem(STORY_KEY);
  } catch {
    /* ignore */
  }
}

/** Serialise the roster to pretty JSON (parity with the main save's export). */
export function exportCampaigns(store_: CampaignStore): string {
  return JSON.stringify(store_, null, 2);
}

/** Parse + migrate an imported roster JSON (throws on invalid JSON; migrate makes the shape safe). */
export function importCampaigns(json: string): CampaignStore {
  return migrateCampaignStore(JSON.parse(json));
}
