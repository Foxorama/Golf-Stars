/**
 * Story Mode persistence (GS-story-save wiring) — the `StoryState` campaign lives in its OWN localStorage
 * key (`gs_story`), entirely SEPARATE from the main `gs_save` blob, so Voyage/Unending's save is never
 * touched by Story Mode (and vice-versa). Same degrade-safe contract as `save/storage.ts`: everything
 * no-ops when localStorage is unavailable (Node/tests, private mode), and a corrupt blob loads as `null`
 * (no campaign) rather than crashing — `migrateStory` then rebuilds a clean state on new-game.
 */

import { migrateStory, type StoryState } from '../sim/rpg/story';

export const STORY_KEY = 'gs_story';

function store(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Is a saved campaign present? (Cheap check for the title tile's New vs Continue framing.) */
export function hasStory(): boolean {
  const s = store();
  return !!s && s.getItem(STORY_KEY) != null;
}

/** Load + migrate the campaign, or `null` if nothing/garbage is stored (⇒ no campaign yet). */
export function loadStory(): StoryState | null {
  const s = store();
  if (!s) return null;
  const raw = s.getItem(STORY_KEY);
  if (!raw) return null;
  try {
    return migrateStory(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persist the campaign. Returns false if storage is unavailable. */
export function writeStory(story: StoryState): boolean {
  const s = store();
  if (!s) return false;
  try {
    s.setItem(STORY_KEY, JSON.stringify(story));
    return true;
  } catch {
    return false;
  }
}

/** Wipe the campaign entirely (a hard "start over" / abandon). */
export function clearStory(): void {
  const s = store();
  try {
    s?.removeItem(STORY_KEY);
  } catch {
    /* ignore */
  }
}

/** Serialise the campaign to pretty JSON (export-to-file groundwork, parity with the main save). */
export function exportStory(story: StoryState): string {
  return JSON.stringify(story, null, 2);
}

/** Parse + migrate an imported campaign JSON (throws on invalid JSON; migrate makes the shape safe). */
export function importStory(json: string): StoryState {
  return migrateStory(JSON.parse(json));
}
