/**
 * Story Mode — the persistent campaign spine (GS-story-save).
 *
 * `StoryState` is the SINGLE persistent progression for the standalone Story Mode campaign: identity,
 * a single credit purse, ownership (clubs/ships/gear/ship-upgrades/caddies), what's equipped, and story
 * progress (chapter, unlocked/cleared worlds, per-world best, trophies, seen beats). It persists to its
 * OWN save namespace (`gs_story`, see `src/app/storyPersist.ts`) with its OWN `STORY_VERSION` +
 * `migrateStory()` — deliberately SEPARATE from the main `SAVE_VERSION` blob so Voyage/Unending's save is
 * never at risk. See `docs/decisions/story-mode.md` for the full design + chunk roadmap.
 *
 * This module is PURE + DOM-free (no `window`, no rng, no side effects) so vitest can exercise the whole
 * progression model headlessly. Screens/persistence live in `src/app/*`; the golf round itself reuses the
 * shared engine (a Story round is an ordinary `Run` resolved by `playHole`/`takeShot`).
 *
 * Growth rule (mirrors the main save): a later chunk that persists a NEW field bumps `STORY_VERSION` and
 * adds a one-step migration in `migrateStory`. Keep every field's default a no-op so an old save upgrades
 * cleanly and a fresh campaign is well-formed.
 */

import { CLUBS, clubById, type Club } from '../clubs';
import { DEFAULT_CHARACTER_ID } from './characters';
import { DEFAULT_SHIP_ID } from './ships';

/** Current Story-Mode save version. Bump + add a `migrateStory` step when persisting a new field. */
export const STORY_VERSION = 1;

/** The five Galaxy Tournaments — collecting all five trophies forges the key to the other realm. */
export const STORY_CHAPTER_COUNT = 5;

/**
 * The default GREEN bag every new campaign starts with (GS-story-save): a lean 10-club starter you must
 * grow by BUYING clubs in world Pro Shops (unlike the other modes, which hand you the full bag). A
 * playable spread of distance + scoring + short-game, ordered longest→shortest. Balance of this exact
 * set is revisited in GS-story-clubs; every id must exist in `CLUBS`.
 */
export const DEFAULT_STORY_BAG: readonly string[] = [
  'D', '5W', '3H', '5i', '7i', '9i', 'PW', 'SW', 'chip', 'putter',
];

/** Effect-bearing equipment slots (GS-story-gear): one item per slot, each folds a `PlayerLoadout` field. */
export type GearSlot = 'glove' | 'hat' | 'shoes' | 'ball' | 'bag';
export const GEAR_SLOTS: readonly GearSlot[] = ['glove', 'hat', 'shoes', 'ball', 'bag'];

/** A per-world best score, for the revisit "play again" chase (records fold into revisit, no global board). */
export interface StoryWorldBest {
  toPar: number;
  strokes: number;
  par: number;
  seed: string;
}

/**
 * The whole persistent Story-Mode campaign. One object, one save. Every collection is a flat id list or a
 * plain map so it JSON-round-trips. Absent/empty = the honest fresh-campaign default.
 */
export interface StoryState {
  version: number;
  /** The single chosen protagonist for the campaign (Story Mode is single-protagonist). */
  characterId: string;

  /** The single persistent purse — earned on world clears, spent in Pro Shops. Never per-run reset. */
  credits: number;

  /** Story progress 0..STORY_CHAPTER_COUNT: how many Galaxy Tournaments won. Gates world unlock + difficulty. */
  chapter: number;
  /** Worlds the player may currently travel to (grows a few per story beat). */
  unlockedWorldIds: string[];
  /** Worlds already cleared — a revisit offers "play again" or straight to the Pro Shop. */
  clearedWorldIds: string[];
  /** Best score per world (revisit chase). Keyed by world/course id. */
  worldBest: Record<string, StoryWorldBest>;

  /** Owned clubs (grown by Pro-Shop purchases); `equippedBagIds` is the subset carried into a round. */
  ownedClubIds: string[];
  equippedBagIds: string[];

  /** Owned ships (start = station wagon) and the one currently flown. */
  ownedShipIds: string[];
  equippedShipId: string;
  /** Owned ship weapons/engines/upgrades (effect-bearing; feed travel + the finale space battle). */
  ownedShipUpgradeIds: string[];

  /** Owned effect-bearing gear and what's equipped per slot. */
  ownedGearIds: string[];
  equippedGear: Partial<Record<GearSlot, string>>;

  /** Caddies are HIRED ONCE and KEPT (no fire) — a permanent roster you choose the active one from. */
  hiredCaddyIds: string[];
  activeCaddyId?: string;

  /** The five tournament trophies. All five → the key to the other realm (Yggdrasil finale). */
  trophyIds: string[];

  /** One-off story-beat tracking (the `SeenLore` twin) so a beat fires exactly once. */
  seenStoryBeats: Record<string, true>;
}

/** A fresh campaign: the chosen golfer, the green bag, the station wagon, an empty purse, chapter 0. */
export function defaultStoryState(characterId: string = DEFAULT_CHARACTER_ID): StoryState {
  return {
    version: STORY_VERSION,
    characterId,
    credits: 0,
    chapter: 0,
    unlockedWorldIds: [],
    clearedWorldIds: [],
    worldBest: {},
    ownedClubIds: [...DEFAULT_STORY_BAG],
    equippedBagIds: [...DEFAULT_STORY_BAG],
    ownedShipIds: [DEFAULT_SHIP_ID],
    equippedShipId: DEFAULT_SHIP_ID,
    ownedShipUpgradeIds: [],
    ownedGearIds: [],
    equippedGear: {},
    hiredCaddyIds: [],
    trophyIds: [],
    seenStoryBeats: {},
  };
}

/**
 * Upgrade an unknown persisted blob to the current `StoryState`. Defensive by construction: every field
 * is coerced to a well-formed value off a fresh default, so a corrupt/partial/old blob can never crash the
 * campaign — the worst case is a clean fresh state. When `STORY_VERSION` grows, add the per-version steps
 * here (the main-save `migrate` pattern), but the field-by-field backfill below already tolerates additions.
 */
export function migrateStory(raw: unknown): StoryState {
  const base = defaultStoryState();
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Partial<StoryState>;
  const characterId = typeof s.characterId === 'string' ? s.characterId : base.characterId;
  return {
    version: STORY_VERSION,
    characterId,
    credits: num(s.credits, base.credits),
    chapter: clampInt(s.chapter, 0, STORY_CHAPTER_COUNT, base.chapter),
    unlockedWorldIds: strList(s.unlockedWorldIds),
    clearedWorldIds: strList(s.clearedWorldIds),
    worldBest: worldBestMap(s.worldBest),
    ownedClubIds: s.ownedClubIds ? strList(s.ownedClubIds) : [...base.ownedClubIds],
    equippedBagIds: s.equippedBagIds ? strList(s.equippedBagIds) : [...base.equippedBagIds],
    ownedShipIds: s.ownedShipIds ? uniq([base.equippedShipId, ...strList(s.ownedShipIds)]) : [...base.ownedShipIds],
    equippedShipId: typeof s.equippedShipId === 'string' ? s.equippedShipId : base.equippedShipId,
    ownedShipUpgradeIds: strList(s.ownedShipUpgradeIds),
    ownedGearIds: strList(s.ownedGearIds),
    equippedGear: gearMap(s.equippedGear),
    hiredCaddyIds: strList(s.hiredCaddyIds),
    ...(typeof s.activeCaddyId === 'string' ? { activeCaddyId: s.activeCaddyId } : {}),
    trophyIds: strList(s.trophyIds),
    seenStoryBeats: boolMap(s.seenStoryBeats),
  };
}

// ── Pure progression helpers (immutable: never mutate `story`, always return a new object) ──────────

/** Resolve the equipped bag ids to real `Club` rows (skips ids that aren't in the taxonomy). */
export function storyBagClubs(story: StoryState): Club[] {
  return story.equippedBagIds
    .map((id) => clubById(id))
    .filter((c): c is Club => !!c)
    .map((c) => ({ ...c }));
}

export function worldUnlocked(story: StoryState, worldId: string): boolean {
  return story.unlockedWorldIds.includes(worldId);
}
export function worldCleared(story: StoryState, worldId: string): boolean {
  return story.clearedWorldIds.includes(worldId);
}
export function hasTrophy(story: StoryState, trophyId: string): boolean {
  return story.trophyIds.includes(trophyId);
}
/** All five tournament trophies collected → the key to the other realm is forged (Yggdrasil finale). */
export function keyToOtherRealm(story: StoryState): boolean {
  return story.trophyIds.length >= STORY_CHAPTER_COUNT;
}

/** Unlock one or more worlds (idempotent). */
export function unlockWorlds(story: StoryState, worldIds: readonly string[]): StoryState {
  const next = uniq([...story.unlockedWorldIds, ...worldIds]);
  return next.length === story.unlockedWorldIds.length ? story : { ...story, unlockedWorldIds: next };
}

/** Award credits (floored at 0). */
export function addCredits(story: StoryState, amount: number): StoryState {
  return { ...story, credits: Math.max(0, story.credits + Math.round(amount)) };
}

/**
 * Record a world clear: mark it cleared, pay credits, and keep the best score for the revisit chase. A
 * lower `toPar` (tie → fewer strokes) replaces the stored best. Idempotent on the cleared-set.
 */
export function recordWorldClear(
  story: StoryState,
  worldId: string,
  result: StoryWorldBest,
  creditsEarned: number,
): StoryState {
  const cleared = story.clearedWorldIds.includes(worldId)
    ? story.clearedWorldIds
    : [...story.clearedWorldIds, worldId];
  const prev = story.worldBest[worldId];
  const better = !prev || result.toPar < prev.toPar || (result.toPar === prev.toPar && result.strokes < prev.strokes);
  return {
    ...story,
    clearedWorldIds: cleared,
    credits: Math.max(0, story.credits + Math.round(creditsEarned)),
    worldBest: better ? { ...story.worldBest, [worldId]: result } : story.worldBest,
  };
}

// ── coercion helpers ────────────────────────────────────────────────────────────────────────────

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.max(lo, Math.min(hi, n));
}
function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function uniq(v: readonly string[]): string[] {
  return [...new Set(v)];
}
function boolMap(v: unknown): Record<string, true> {
  const out: Record<string, true> = {};
  if (v && typeof v === 'object') for (const k of Object.keys(v as object)) if ((v as Record<string, unknown>)[k]) out[k] = true;
  return out;
}
function gearMap(v: unknown): Partial<Record<GearSlot, string>> {
  const out: Partial<Record<GearSlot, string>> = {};
  if (v && typeof v === 'object') {
    for (const slot of GEAR_SLOTS) {
      const id = (v as Record<string, unknown>)[slot];
      if (typeof id === 'string') out[slot] = id;
    }
  }
  return out;
}
function worldBestMap(v: unknown): Record<string, StoryWorldBest> {
  const out: Record<string, StoryWorldBest> = {};
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v as object)) {
      const b = (v as Record<string, unknown>)[k];
      if (b && typeof b === 'object') {
        const o = b as Partial<StoryWorldBest>;
        if (typeof o.toPar === 'number' && typeof o.strokes === 'number') {
          out[k] = {
            toPar: o.toPar,
            strokes: o.strokes,
            par: num(o.par, 72),
            seed: typeof o.seed === 'string' ? o.seed : '',
          };
        }
      }
    }
  }
  return out;
}

/** Every club in the default green bag must exist in the taxonomy — a cheap invariant for tests. */
export function defaultBagIsValid(): boolean {
  return DEFAULT_STORY_BAG.every((id) => CLUBS.some((c) => c.id === id));
}
