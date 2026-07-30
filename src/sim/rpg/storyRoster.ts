/**
 * The Story-Tour CAMPAIGN ROSTER (GS-story-campaign-slots) — one campaign PER GOLFER, not one campaign
 * full stop.
 *
 * Story Tour used to hold a SINGLE `StoryState` in `fc_story`. Picking a golfer for a new campaign
 * overwrote it the instant you tapped a card — so a finished Feather Fade campaign, and with it the
 * developed champion that Star Tour free-roams as (`GS-story-startour-champion`), evaporated the
 * moment you fancied a run as Larry. That is the bug this module exists to close.
 *
 * THE MODEL: `characterId → StoryState`. One slot per golfer, because that is what makes every rule
 * the feature needs fall out of one decision rather than three:
 *  - four golfers ⇒ four independent campaigns, and starting Larry's can never touch Feather's;
 *  - a STAR TOUR CHAMPION *is* that golfer's completed slot (`championCampaigns`) — never a second
 *    copy of a loadout that can drift out of step with the campaign it was taken from, so a champion
 *    who keeps shopping after the finale keeps improving, which is the honest reading of "the full
 *    loadout the player had at the end";
 *  - and "starting over as a golfer you already finished with replaces your Star Tour character" is
 *    then not a rule at all, merely a description of overwriting that golfer's one slot. The UI owes
 *    the player a WARNING (`campaignOverwriteWarning`), never a special case.
 *
 * PURE + DOM-free (no `localStorage`, no rng, no clock) so vitest exercises the whole roster
 * headlessly; `src/save/storyStore.ts` owns the one localStorage key and `src/app/persist.ts` the
 * write-after-every-action. Nothing here throws: a corrupt or partial blob degrades to the best
 * honest reading of it, because the alternative on a boot path is a bricked game.
 */

import { migrateStory, storyComplete, STORY_VERSION, type StoryState } from './story';

/** Roster envelope version — INDEPENDENT of `STORY_VERSION` (which versions each campaign INSIDE it).
 *  Bump only when the CONTAINER's shape changes, and add a step to `migrateCampaignStore`. */
export const CAMPAIGN_STORE_VERSION = 1;

/** Every campaign the player owns, keyed by protagonist. Persists to `fc_story` (the same key the old
 *  single campaign used — see `migrateCampaignStore` for why that is safe). */
export interface CampaignStore {
  version: number;
  /** `characterId → that golfer's one campaign`. A golfer with no entry has never been played. */
  campaigns: Record<string, StoryState>;
  /** The golfer whose campaign "Continue" resumes — the last one actually PLAYED in Story Tour.
   *  Deliberately NOT moved by Star Tour: free-roaming as a champion must never re-point the campaign
   *  you are half-way through. Absent/unknown ⇒ `activeCampaign` falls back to the only campaign, or
   *  none. */
  activeId?: string;
}

/** A roster with nothing in it — a player who has never started a campaign. */
export function emptyCampaignStore(): CampaignStore {
  return { version: CAMPAIGN_STORE_VERSION, campaigns: {} };
}

/**
 * Is this a PRE-ROSTER single campaign rather than a roster? A `StoryState` carries `characterId` and
 * no `campaigns` map.
 *
 * The ONE place that question is answered (GS-save-integrity). It used to be inline in
 * `migrateCampaignStore` alone, which was fine while it had one asker; the version check is a second
 * asker, and it got the answer wrong the first time by re-deriving it — the two shapes' top-level
 * `version` fields mean different things, so shape must be decided before the number is read.
 */
function isBareCampaignBlob(obj: Record<string, unknown>): boolean {
  return !obj.campaigns && typeof obj.characterId === 'string';
}

/**
 * Was this blob written by a LATER build? (GS-save-integrity) Returns the offending version, or
 * `null` when everything here is something we understand.
 *
 * `migrateStory` is field-by-field and never looks at `version`, which makes it beautifully robust
 * for a boot path and quietly LOSSY in one direction: a campaign from a newer build keeps every
 * field this build knows and silently drops the rest, then writes the truncated version back. The
 * main save's failure was loud and total; this one is a slow puncture, and it needed the same answer
 * — don't overwrite what you can't fully read.
 *
 * Checks the ENVELOPE and every campaign inside it, because the two version independently (a schema
 * bump inside a campaign does not move `CAMPAIGN_STORE_VERSION`). Pure, so the storage layer's
 * refusal and this decision are testable apart.
 */
export function campaignStoreTooNew(raw: unknown): number | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  // WHICH SHAPE this is has to be decided by `isBareCampaignBlob` and nowhere else. The two shapes
  // both carry a top-level `version` meaning DIFFERENT things — a roster's is the envelope's
  // (currently 1), a bare campaign's is its `STORY_VERSION` (currently 7) — so reading the number
  // before knowing the shape flags every legacy campaign in existence as "from the future".
  if (isBareCampaignBlob(obj)) {
    const v = obj.version;
    return typeof v === 'number' && Number.isFinite(v) && v > STORY_VERSION ? v : null;
  }

  const envelope = obj.version;
  if (typeof envelope === 'number' && Number.isFinite(envelope) && envelope > CAMPAIGN_STORE_VERSION) {
    return envelope;
  }
  const rawMap = obj.campaigns;
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return null;
  for (const entry of Object.values(rawMap as object)) {
    if (!entry || typeof entry !== 'object') continue;
    const v = (entry as { version?: unknown }).version;
    if (typeof v === 'number' && Number.isFinite(v) && v > STORY_VERSION) return v;
  }
  return null;
}

/**
 * Read ANY persisted `fc_story` blob as a roster. Never throws — the worst case is an empty roster.
 *
 * Accepts three shapes, and the middle one is the whole reason this function is careful:
 *  1. a ROSTER (`{ campaigns: {...} }`) — migrate each campaign through `migrateStory`;
 *  2. a LEGACY BARE `StoryState` — every campaign saved before this feature. It is adopted as a
 *     one-slot roster under its own `characterId`, so upgrading the game NEVER loses the campaign a
 *     player already has. This is the single most important line in the module;
 *  3. anything else (null, a string, an array, junk) — an empty roster.
 *
 * A slot whose key disagrees with the campaign's own `characterId` is re-keyed to the campaign (the
 * campaign is the truth; the key is an index), which also collapses a hand-edited file that pointed
 * two keys at one golfer.
 */
export function migrateCampaignStore(raw: unknown): CampaignStore {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyCampaignStore();
  const obj = raw as Record<string, unknown>;

  // (2) A legacy bare campaign: a `StoryState` carries `characterId` and no `campaigns` map.
  if (isBareCampaignBlob(obj)) {
    return adoptLegacyCampaign(obj);
  }

  // (1) A roster.
  const campaigns: Record<string, StoryState> = {};
  const rawMap = obj.campaigns;
  if (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
    for (const key of Object.keys(rawMap as object)) {
      const entry = (rawMap as Record<string, unknown>)[key];
      if (!entry || typeof entry !== 'object') continue;
      const story = migrateStory(entry);
      // Re-key to the campaign's OWN protagonist: the key is an index, the campaign is the truth.
      const id = story.characterId || key;
      campaigns[id] = { ...story, characterId: id };
    }
  }
  const activeId = typeof obj.activeId === 'string' && campaigns[obj.activeId] ? obj.activeId : undefined;
  return { version: CAMPAIGN_STORE_VERSION, campaigns, ...(activeId ? { activeId } : {}) };
}

/** Wrap a pre-roster single campaign as a one-slot roster. Split out so the legacy path is nameable
 *  in a test and obvious in a diff — it is the "nobody loses a save" guarantee. */
function adoptLegacyCampaign(raw: object): CampaignStore {
  const story = migrateStory(raw);
  const id = story.characterId;
  if (!id) return emptyCampaignStore();
  return { version: CAMPAIGN_STORE_VERSION, campaigns: { [id]: story }, activeId: id };
}

/** Insert or replace a golfer's campaign. Immutable, and it deliberately does NOT move `activeId` —
 *  Star Tour persists the champion it is free-roaming as after every action, and that must not
 *  re-point the "Continue" a player left mid-chapter (use `setActiveCampaign` for that). */
export function upsertCampaign(store: CampaignStore, story: StoryState): CampaignStore {
  const id = story.characterId;
  if (!id) return store;
  return { ...store, campaigns: { ...store.campaigns, [id]: story } };
}

/** Point "Continue" at a golfer's campaign. A no-op for a golfer with no campaign, so a stale id can
 *  never orphan the roster. */
export function setActiveCampaign(store: CampaignStore, characterId: string): CampaignStore {
  if (!store.campaigns[characterId]) return store;
  return { ...store, activeId: characterId };
}

/** Drop a golfer's campaign entirely (an explicit, confirmed delete). Clears `activeId` if it pointed
 *  there, so the roster is never left pointing at a slot that is gone. */
export function deleteCampaign(store: CampaignStore, characterId: string): CampaignStore {
  if (!store.campaigns[characterId]) return store;
  const campaigns = { ...store.campaigns };
  delete campaigns[characterId];
  const keepActive = store.activeId && store.activeId !== characterId && campaigns[store.activeId];
  return { version: store.version, campaigns, ...(keepActive ? { activeId: store.activeId } : {}) };
}

/** A golfer's campaign, or `null`. */
export function campaignFor(store: CampaignStore, characterId: string): StoryState | null {
  return store.campaigns[characterId] ?? null;
}

/** The campaign "Continue" resumes: the flagged one, else the first in stable order.
 *
 *  It returns `null` ONLY for a genuinely empty roster. Falling back rather than refusing is
 *  deliberate: this is what the boot read hands to `state.story`, and returning `null` while campaigns
 *  exist would present a player who owns two of them with "Begin a new campaign" and no way back to
 *  either. Which campaign to resume when several exist is a question for the PICKER (which reads the
 *  roster directly), never for a boot path — so the boot path always has an answer, and a pointer that
 *  has been set explicitly always wins. */
export function activeCampaign(store: CampaignStore): StoryState | null {
  if (store.activeId) {
    const s = store.campaigns[store.activeId];
    if (s) return s;
  }
  return campaignList(store)[0] ?? null;
}

/** Every campaign, in a STABLE order (by `characterId`) so a roster renders identically across reloads
 *  — object key order is an implementation detail we decline to depend on. */
export function campaignList(store: CampaignStore): StoryState[] {
  return Object.keys(store.campaigns)
    .sort()
    .map((k) => store.campaigns[k]!)
    .filter(Boolean);
}

/** How many campaigns exist. */
export function campaignCount(store: CampaignStore): number {
  return Object.keys(store.campaigns).length;
}

/** The STAR TOUR CHAMPIONS: every campaign whose finale has been won. These — and only these — are the
 *  golfers free-roam offers, each carrying the bag / gear / caddy / ship they finished the campaign
 *  with. Stable order, same as `campaignList`. */
export function championCampaigns(store: CampaignStore): StoryState[] {
  return campaignList(store).filter((s) => storyComplete(s));
}

/** Is this golfer a Star Tour champion? */
export function isChampion(store: CampaignStore, characterId: string): boolean {
  const s = campaignFor(store, characterId);
  return !!s && storyComplete(s);
}

/**
 * Is a round being played AS a champion — the loaded campaign is finished AND it belongs to the golfer
 * holding the club? (GS-story-startour-champions.)
 *
 * Both halves matter. A completed campaign can be loaded while a DIFFERENT golfer plays (Story Tour
 * itself never does that, but the star map is entered from several places), and stamping that round as
 * a champion's would put a ★ on a record set with a starting bag. This is what `resolveStrokePlay` banks
 * into `StrokePlayRecord.champion`, and it is pure so the answer is testable rather than inferred from
 * whichever screen happened to be up.
 */
export function championRound(story: StoryState | null | undefined, characterId: string | undefined): boolean {
  return !!story && !!characterId && story.characterId === characterId && storyComplete(story);
}

/** Has ANY campaign been completed? (The roster's own answer to "is Star Tour earned" — the main save's
 *  permanent `starTourUnlocked` flag is still the gate, so a player who completed the campaign under
 *  the old single-slot save and then started over keeps their unlock.) */
export function hasChampion(store: CampaignStore): boolean {
  return championCampaigns(store).length > 0;
}

/**
 * The CAMPAIGN TAG shown against a golfer wherever Story Tour asks you to pick one
 * (GS-story-campaign-picker) — so "do I have a run going, and with whom?" is answered by looking at
 * the roster instead of remembering it.
 *
 * Pure and derived from the campaign itself, so the clubhouse figure's badge, the inspect card's line
 * and any future surface cannot disagree about what state a campaign is in. `null` = this golfer has
 * no campaign (nothing to say; picking them simply starts one).
 *
 * NOTE this is Story-Tour-only by construction: it takes a roster, and no other mode has one. The
 * `character` screen is SHARED with Voyage / Unending / Star Tour, so its badges must be passed in
 * rather than looked up by the renderer — a renderer that fetched the roster itself would tag golfers
 * on every mode's picker.
 */
export interface CampaignTag {
  kind: 'in-progress' | 'complete';
  /** Short badge for a crowded surface (the clubhouse figure): `Chp 3` · `Prologue` · `★ Complete`. */
  short: string;
  /** The full line for a card with room: `In progress — Chapter 3` · `Complete — Star Tour champion`. */
  label: string;
  /** Chapter reached, 0 = the Earth prologue. */
  chapter: number;
}
export function campaignTag(store: CampaignStore, characterId: string): CampaignTag | null {
  const story = campaignFor(store, characterId);
  if (!story) return null;
  if (storyComplete(story)) {
    return { kind: 'complete', short: '★ Complete', label: 'Complete — Star Tour champion', chapter: story.chapter };
  }
  // Chapter 0 is the Earth prologue — "Chapter 0" would read as a bug, so name the thing it actually is.
  const where = story.chapter <= 0 ? 'Prologue' : `Chapter ${story.chapter}`;
  return {
    kind: 'in-progress',
    short: story.chapter <= 0 ? 'Prologue' : `Chp ${story.chapter}`,
    label: `In progress — ${where}`,
    chapter: story.chapter,
  };
}

/** Every golfer's tag in one map, for a picker that renders the whole roster at once. Golfers with no
 *  campaign are simply absent. */
export function campaignTags(store: CampaignStore): Record<string, CampaignTag> {
  const out: Record<string, CampaignTag> = {};
  for (const story of campaignList(store)) {
    const tag = campaignTag(store, story.characterId);
    if (tag) out[story.characterId] = tag;
  }
  return out;
}

/** What starting a NEW campaign for this golfer would DESTROY, or `null` when it costs nothing (no
 *  campaign, so nothing to overwrite). The UI turns this into the confirmation; putting it here means
 *  the decision is unit-testable and the screen cannot quietly disagree with what actually happens.
 *
 *  `champion: true` is the severe case the player must not stumble into — overwriting a COMPLETED
 *  campaign also replaces that golfer's Star Tour character. */
export interface CampaignOverwrite {
  characterId: string;
  /** The campaign that would be replaced. */
  existing: StoryState;
  /** It is a completed campaign ⇒ the Star Tour champion goes with it. */
  champion: boolean;
  /** Chapter reached, for the confirmation copy. */
  chapter: number;
}
export function campaignOverwriteWarning(store: CampaignStore, characterId: string): CampaignOverwrite | null {
  const existing = campaignFor(store, characterId);
  if (!existing) return null;
  return {
    characterId,
    existing,
    champion: storyComplete(existing),
    chapter: existing.chapter,
  };
}
