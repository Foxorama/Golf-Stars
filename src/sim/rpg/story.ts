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
import { clubSetById, buildRewardClub } from './economy';
import { DEFAULT_CHARACTER_ID } from './characters';
import { DEFAULT_SHIP_ID } from './ships';

/** Current Story-Mode save version. Bump + add a `migrateStory` step when persisting a new field. */
export const STORY_VERSION = 5;

/** The player's PATH (GS-story-chapters) — chosen at The Choice after Chapter 3. `warden` re-consecrates
 *  and protects (redeem Venoma); `herald` desecrates and serves the Coil (crush your former allies). Absent
 *  until chosen. Drives the back-half tournament variants + the two finale endings. */
export type StoryAlignment = 'warden' | 'herald';

/** The five Galaxy Tournaments — collecting all five trophies forges the key to the other realm. */
export const STORY_CHAPTER_COUNT = 5;

/** The Earth opening: the final round of the World Tour (the Old Course at St Andrews). Clearing it is the
 *  prologue — it recruits you into the campaign and advances chapter 0 → 1. See the story bible. */
export const PROLOGUE_COURSE_ID = 'standrews-18';

/** A Story Mode destination on the star chart (GS-story-map): a static course + the chapter that unlocks it.
 *  Difficulty rises across the chapters (gentle → brutal, per each course's own tier). Content-as-data — a
 *  new destination is a row, never an engine edit; the render layer reads the course's name/tier/archetype
 *  from `staticCourseSpec(courseId)`. Tournament worlds + the alignment-split back-half route land later. */
export interface StoryWorld {
  courseId: string;
  /** The chapter at which this world appears on the chart (1 = available right after the prologue). */
  unlockChapter: number;
}
export const STORY_WORLDS: readonly StoryWorld[] = [
  // Chapter 1 — the gentle opening cluster (the Emerald Invitational + warm-ups).
  { courseId: 'verdant-18', unlockChapter: 1 }, // Lyra Meadows
  { courseId: 'verdant2-18', unlockChapter: 1 }, // Centaurus Fairways
  { courseId: 'desert-18', unlockChapter: 1 }, // Vela Dunes
  // Chapter 2 — the Forge (fire) opens up.
  { courseId: 'inferno-18', unlockChapter: 2 }, // Orion Forge
  { courseId: 'inferno2-18', unlockChapter: 2 }, // Scorpius Sting
  { courseId: 'frost-18', unlockChapter: 2 }, // Cygnus Links
  // Chapter 3 — the Storm.
  { courseId: 'tempest-18', unlockChapter: 3 }, // Draco Gale
  { courseId: 'crystal-18', unlockChapter: 3 }, // Coronae Prism
  { courseId: 'fungal-18', unlockChapter: 3 }, // Vulpecula Hollows
  // Chapter 4 — the deep sky.
  { courseId: 'ocean-18', unlockChapter: 4 }, // Eridanus Atolls
  { courseId: 'void2-18', unlockChapter: 4 }, // Sagittarius Core
  { courseId: 'crystal2-18', unlockChapter: 4 }, // Triangulum Wedge
  // Chapter 5 — the serpent's reaches.
  { courseId: 'swamp-18', unlockChapter: 5 }, // Hydra Mire
  { courseId: 'derelict-18', unlockChapter: 5 }, // The Ghost Wreck
  { courseId: 'cetus-18', unlockChapter: 5 }, // Cetus Shelf
];

/** Is this world charted (available to travel to) at the given chapter? */
export function storyWorldUnlocked(w: StoryWorld, chapter: number): boolean {
  return w.unlockChapter <= chapter;
}
/** Look up a story destination by its course id. */
export function storyWorldById(courseId: string): StoryWorld | undefined {
  return STORY_WORLDS.find((w) => w.courseId === courseId);
}

/** Payout scaling levers (GS-story-econ2 — the review economy pass, `reports/story-mode-review-2026-07-18.md`).
 *  A world's pay now rides its DIFFICULTY (its unlock chapter — a brutal late world pays more than a gentle
 *  early one, so tackling hard worlds is worth it) and a REVISIT pays a reduced TOP-UP (so re-flying the
 *  easiest world you own on repeat isn't the optimal road to the finale arsenal — the grind loop the flat
 *  economy invited). Both default to no-ops (`chapter` 1, not a revisit) so the classic flat pay is intact. */
export const CHAPTER_CREDIT_STEP = 0.15; // per chapter past the first: Ch.1 ×1.0 → Ch.5 ×1.6
export const REVISIT_CREDIT_MULT = 0.4; // a re-flown, already-cleared world pays a top-up, not the full purse

/** Context for `storyRoundCredits` (all optional → the classic flat pay). `chapter` is the WORLD's difficulty
 *  tier (its unlock chapter, 1..5), NOT the player's current chapter — so an easy Ch.1 world stays cheap even
 *  late in the run. `revisit` = this world was already cleared before this round. */
export interface RoundPayContext {
  chapter?: number;
  revisit?: boolean;
}

/** Credits paid for clearing a world round: a solid base, sweetened for going under par, floored so even a
 *  scrappy win pays — then scaled by the world's difficulty tier and dropped to a top-up on a revisit
 *  (GS-story-econ2). `toPar` negative = under par. An empty context is byte-for-byte the classic flat pay. */
export function storyRoundCredits(toPar: number, ctx: RoundPayContext = {}): number {
  const BASE = 200;
  const PER_STROKE_UNDER = 15;
  const raw = Math.max(100, Math.round(BASE - toPar * PER_STROKE_UNDER));
  const chapter = Math.max(1, Math.round(ctx.chapter ?? 1));
  const chapterMult = 1 + CHAPTER_CREDIT_STEP * (chapter - 1);
  const revisitMult = ctx.revisit ? REVISIT_CREDIT_MULT : 1;
  return Math.max(1, Math.round(raw * chapterMult * revisitMult));
}

/** The difficulty tier (unlock chapter, 1..5) of a world for payout scaling — its `STORY_WORLDS` row, or 1
 *  for anything off the chart (the Earth prologue). */
export function storyWorldChapter(courseId: string): number {
  return storyWorldById(courseId)?.unlockChapter ?? 1;
}

/**
 * GS-story-worlddiff — the WEATHER a Story world plays under, scaled by its difficulty TIER (unlock chapter)
 * so deep worlds are genuinely harder, not just longer. A rising, fair WIND: pure physics (wind/carry only,
 * no geometry, `applyEffectPhysics`), so it never touches the layout — records/Star-Tour stay comparable —
 * and wind reads true off the shot bearing (club up, aim off), the strategic axis the review asked for
 * ("difficulty is just length" was the complaint). Deliberately PURE wind/carry effects (no craters / lies /
 * tents). Ch.1 worlds play calm; the sky stiffens to the wildest storm by Ch.5 — which also reads as the
 * galaxy fraying as the serpent stirs. Scaled by the WORLD (tier), not the run chapter, so a given world's
 * difficulty is stable (a revisit is the same test, `worldBest` stays comparable). The Earth prologue (tier
 * 1, off-chart) stays calm. Returns a `CourseEffectId` string (the sim reads it through `run.staticEffect`).
 */
const STORY_TIER_EFFECT: readonly string[] = ['none', 'solarWind', 'solarStorm', 'dustStorm', 'ionStorm'];
export function storyWorldEffect(courseId: string): string {
  const tier = Math.max(1, Math.min(STORY_TIER_EFFECT.length, storyWorldChapter(courseId)));
  return STORY_TIER_EFFECT[tier - 1] ?? 'none';
}

/**
 * Resolve a completed world round into the campaign (pure): record the clear (+credits, +best-score for the
 * revisit chase), and — if this was the PROLOGUE (Earth, chapter 0) — advance to chapter 1. Immutable.
 */
export function completeStoryRound(
  story: StoryState,
  courseId: string,
  result: StoryWorldBest,
  creditsEarned: number,
  /** GS-story-quality (finding D): a QUEST round replays the ally's home world at 9 holes (par ~36), so it
   *  must NOT overwrite the world's 18-hole `worldBest` (which the revisit chase + dossier read). Pass
   *  `false` for a quest round — credits + cleared still bank, only the best-score write is skipped. */
  recordBest = true,
): { story: StoryState; advancedChapter: boolean; wasPrologue: boolean } {
  let next = recordWorldClear(story, courseId, result, creditsEarned, recordBest);
  const wasPrologue = story.chapter === 0 && courseId === PROLOGUE_COURSE_ID;
  if (wasPrologue) next = { ...next, chapter: 1 };
  return { story: next, advancedChapter: wasPrologue, wasPrologue };
}

/**
 * The default GREEN bag every new campaign starts with (GS-story-save): a lean 10-club starter you must
 * grow by BUYING clubs in world Pro Shops (unlike the other modes, which hand you the full bag). A
 * playable spread of distance + scoring + short-game, ordered longest→shortest. Balance of this exact
 * set is revisited in GS-story-clubs; every id must exist in `CLUBS`.
 */
export const DEFAULT_STORY_BAG: readonly string[] = [
  'D', '5W', '3H', '5i', '7i', '9i', 'PW', 'SW', 'chip', 'putter',
];

/** A real bag holds 14 clubs. Pro-Shop purchases grow the green bag up to this many EQUIPPED clubs
 *  (extra owned clubs wait in the locker for a swap — GS-story-clubs). Buying a club for a TYPE you
 *  already carry UPGRADES it in place (no size cost); a NEW type appends until the bag is full. */
export const MAX_STORY_BAG = 14;

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

  /** The campaign has been WON (the Yggdrasil finale beaten) — unlocks the free-roam Star Tour on the title
   *  (GS-story-startour-unlock: play the story, then travel the whole galaxy for records). Default false. */
  completed: boolean;

  /** The chosen PATH (GS-story-chapters), set at The Choice after Chapter 3. Absent = not yet chosen (the
   *  shared trunk, Chapters 1–3). Drives the back-half tournament variants + the finale ending. */
  alignment?: StoryAlignment;

  /** GS-story-partners: the PARTNER golfer chosen for each TEAM Sigil (Scramble Ch.1 / Best-ball Ch.2), a
   *  playable-character id. Locked in when you tee off that major; drives the betrayal branch after The
   *  Choice (`betrayerId` = the odd one out of these two picks). Absent until chosen. */
  sigil1Partner?: string;
  sigil2Partner?: string;

  /** GS-story-quests: the ally SIDE QUEST currently accepted (one at a time), or absent. */
  activeQuestId?: string;
  /** GS-story-quests: ally side quests already completed (their rewards granted). */
  completedQuestIds: string[];

  /** GS-story-qualifiers: the player's BEST finish (place + field size) in each qualifying event, keyed by
   *  the event's world/course id. Qualifying (top-N) in two of a chapter's events unlocks its Galaxy
   *  Tournament. Empty = nothing qualified yet. */
  qualifierResults: Record<string, { place: number; field: number }>;
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
    completed: false,
    completedQuestIds: [],
    qualifierResults: {},
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
    completed: s.completed === true,
    ...(s.alignment === 'warden' || s.alignment === 'herald' ? { alignment: s.alignment } : {}),
    ...(typeof s.sigil1Partner === 'string' ? { sigil1Partner: s.sigil1Partner } : {}),
    ...(typeof s.sigil2Partner === 'string' ? { sigil2Partner: s.sigil2Partner } : {}),
    ...(typeof s.activeQuestId === 'string' ? { activeQuestId: s.activeQuestId } : {}),
    completedQuestIds: strList(s.completedQuestIds),
    qualifierResults: qualifierMap(s.qualifierResults),
  };
}

/** Has the campaign been WON — the Star Tour free-roam reward is unlocked? True once the FINALE is beaten
 *  (`completed`, GS-story-yggdrasil). Note the five Sigils forge the KEY to the finale (`keyToOtherRealm`),
 *  but the campaign isn't complete until the Jörmungandr battle is won — that's what unlocks Star Tour. */
export function storyComplete(story: StoryState): boolean {
  return story.completed === true;
}

/** The Story-Tour bar's name by path (GS-story-bar-name): the Warden bar is the PARROT'S PERCH (the
 *  Prognostic Parrot tends it); the Herald sanctum bar is THE CROW'S NEST (the Carrion Crow tends it). One
 *  source so the clubhouse sign, the hotspot, the bar screen + scene all agree. */
export function storyBarName(herald: boolean): string {
  return herald ? "The Crow's Nest" : "The Parrot's Perch";
}

// ── Pure progression helpers (immutable: never mutate `story`, always return a new object) ──────────

/**
 * NAMED quest-reward clubs (GS-story-quest-club): a friend's signature gift carries its OWN name into the
 * BAG (not the generic "Solar Storm Sand Wedge"), and every quest reward is the SAME tier so no ally's gift
 * is worse than another's (the parity fix). Each maps a `quest:<key>` id → a base club (all legendary
 * `solar` stats for parity) + the custom display name. Owned as the `quest:<key>` id; `resolveStoryClub`
 * rebuilds the base club and overrides the name. Keeping the name here (single source) keeps the recap +
 * the bag in sync. Referenced from `storyQuests.ts` (which imports this — no cycle, story.ts imports nothing
 * from there).
 */
export const NAMED_STORY_CLUBS: Record<string, { base: string; name: string }> = {
  // Ally side-quest gifts (GS-story-quest-club).
  'quest:dan': { base: 'club:solar:D', name: "The Long Haul — Dan's Driver" },
  'quest:sandy': { base: 'club:solar:SW', name: "Sand-Saver's Second" },
  'quest:chipinski': { base: 'club:solar:PW', name: 'The Phoenix Scalpel' },
  'quest:penelope': { base: 'club:solar:putter', name: 'The Star-Reader' },
  'quest:sam': { base: 'club:solar:3W', name: 'Conviction' },
  'quest:mole': { base: 'club:solar:7i', name: 'The Dowser' },
  // Galaxy-Tournament (major) prize clubs (GS-story-tournament-reward): the promised prize is a NAMED,
  // solar-tier club that lands in the bag with its own name (the majors used to announce a club and never
  // hand it over — the Emerald Invitational bug). Distinct base TYPES from the quest gifts so they don't
  // shove an ally's gift out of the bag.
  'major:emerald': { base: 'club:solar:5W', name: 'The Verdant Wood' },
  'major:ember': { base: 'club:solar:D', name: 'The Forgefire Driver' },
  // GS-story-quality: the Storm prize is a SET of irons (it always read "Irons" but landed as one club).
  // The flagship 5-iron carries the wind-reading signature effect (`STORY_CLUB_EFFECTS['major:storm']`);
  // the 7 + 9 are matched set members (solar irons, no extra effect, so the wind bonus never stacks). All
  // three are granted together — see `storyRewardSetIds` / the tournament grant.
  'major:storm': { base: 'club:solar:5i', name: 'The Galewarden Irons · 5' },
  'major:storm:7i': { base: 'club:solar:7i', name: 'The Galewarden Irons · 7' },
  'major:storm:9i': { base: 'club:solar:9i', name: 'The Galewarden Irons · 9' },
  // GS-story-charquests: a friend's SIGNATURE club, earned once you've partnered them in a team Sigil and
  // shared the round. Distinct base TYPES from the ally/major gifts so a signature never shoves another
  // reward out of the bag. Solar-tier for parity, named for the friend + their home.
  'charquest:feather-fade': { base: 'club:solar:6i', name: 'The Trade Wind — Feather’s Iron' },
  'charquest:huang-woo-hook': { base: 'club:solar:8i', name: 'The Busan Scalpel — Huang-Woo’s Iron' },
  'charquest:longshot-larry': { base: 'club:solar:3i', name: 'The Perth Bomb — Larry’s Driving Iron' },
  'charquest:backspin-bo': { base: 'club:solar:GW', name: 'The Portland Check — Bo’s Wedge' },
};

/** GS-story-quality: reward ids that grant a matched SET of clubs (not a single one). A set-reward's
 *  primary id maps to the full list of member ids granted together; any other id grants just itself. Today
 *  only the Storm major's Galewarden Irons is a set (a 5/7/9 iron trio). */
export const STORY_REWARD_SETS: Record<string, readonly string[]> = {
  'major:storm': ['major:storm', 'major:storm:7i', 'major:storm:9i'],
};

/** The full list of club ids a reward grants — a matched set for a set-reward, else just the id itself. */
export function storyRewardSetIds(id: string): readonly string[] {
  return STORY_REWARD_SETS[id] ?? [id];
}

/** The real `club:<set>:<type>` base id a Story-owned club id maps to — a `quest:<key>` reward resolves to
 *  its base; any other id is itself. Used wherever art/theme/type is derived off the id. */
export function storyRewardBaseId(id: string): string {
  return NAMED_STORY_CLUBS[id]?.base ?? id;
}

/**
 * Resolve a Story-owned club id to a real `Club`. A PLAIN id (`'3W'`, `'putter'`) resolves off the
 * taxonomy; a THEMED reward id (`club:<set>:<type>`, e.g. `club:tour:3W`) rebuilds the themed reward
 * club (its carry bonus + set/rarity + "Planet 3-Wood" name) through the shared reward machinery, so a
 * bought Pro-Shop club plays exactly as the same Voyage reward would; a NAMED quest reward (`quest:<key>`)
 * rebuilds its base club and overrides the name with the ally's signature. Unknown ids → undefined. Pure.
 */
export function resolveStoryClub(id: string): Club | undefined {
  const named = NAMED_STORY_CLUBS[id];
  const realId = named?.base ?? id;
  if (realId.startsWith('club:')) {
    const [, setId, type] = realId.split(':');
    const set = clubSetById(setId);
    if (set && type && clubById(type)) {
      const club = buildRewardClub(set, type);
      return named ? { ...club, name: named.name } : club;
    }
    return undefined;
  }
  const base = clubById(realId);
  return base ? { ...base } : undefined;
}

/** The bag TYPE an owned-club id occupies (for one-per-type dedupe): a themed/quest id's base type, else
 *  the id itself. `club:tour:3W` → `'3W'`, `quest:sandy` → `'SW'`, `'putter'` → `'putter'`. */
export function storyClubType(id: string): string {
  const realId = storyRewardBaseId(id);
  return realId.startsWith('club:') ? realId.split(':')[2] ?? realId : realId;
}

/** Resolve the equipped bag ids to real `Club` rows (themed-aware; skips ids that resolve to nothing). */
export function storyBagClubs(story: StoryState): Club[] {
  return story.equippedBagIds
    .map((id) => resolveStoryClub(id))
    .filter((c): c is Club => !!c);
}

/** Is the equipped bag full (can take no NEW type)? */
export function storyBagFull(story: StoryState): boolean {
  return story.equippedBagIds.length >= MAX_STORY_BAG;
}

/**
 * Take a club OUT of the bag (pure, GS-story-locker): remove this exact owned id from `equippedBagIds`.
 * The club stays owned (it goes to the bench); a no-op if it isn't equipped. Used by the locker to make
 * room when the bag is full so a different owned club can go in.
 */
export function unequipStoryClub(story: StoryState, clubId: string): StoryState {
  if (!story.equippedBagIds.includes(clubId)) return story;
  return { ...story, equippedBagIds: story.equippedBagIds.filter((id) => id !== clubId) };
}

/**
 * Equip an owned club id into the bag (pure). One club per TYPE: a themed upgrade for a type already
 * carried REPLACES it in place (no size change); a NEW type is appended only if the bag has room
 * (< `MAX_STORY_BAG`). The equipped list is kept ordered longest→shortest by resolved carry so the bag
 * reads cleanly. Returns the story unchanged if the club can't resolve or the bag is full for a new type.
 */
export function equipStoryClub(story: StoryState, clubId: string): StoryState {
  const club = resolveStoryClub(clubId);
  if (!club) return story;
  const type = storyClubType(clubId);
  const without = story.equippedBagIds.filter((id) => storyClubType(id) !== type);
  const wasCarried = without.length !== story.equippedBagIds.length;
  if (!wasCarried && without.length >= MAX_STORY_BAG) return story; // full, and this is a new type
  const nextIds = [...without, clubId].sort((a, b) => {
    const ca = resolveStoryClub(a)?.carry ?? 0;
    const cb = resolveStoryClub(b)?.carry ?? 0;
    return cb - ca;
  });
  return { ...story, equippedBagIds: nextIds };
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

/** Set the player's PATH at The Choice (GS-story-chapters). Idempotent per value; only ever set once in
 *  practice (the reducer gates it to the unchosen post-Chapter-3 moment). */
export function chooseAlignment(story: StoryState, alignment: StoryAlignment): StoryState {
  return story.alignment === alignment ? story : { ...story, alignment };
}

/** GS-story-partners: record the PARTNER chosen for a team Sigil (chapter 1 → `sigil1Partner`, chapter 2 →
 *  `sigil2Partner`). Idempotent; a no-op for any other chapter. The pick is locked when the major tees off. */
export function setSigilPartner(story: StoryState, chapter: number, charId: string): StoryState {
  if (chapter === 1) return story.sigil1Partner === charId ? story : { ...story, sigil1Partner: charId };
  if (chapter === 2) return story.sigil2Partner === charId ? story : { ...story, sigil2Partner: charId };
  return story;
}

/** The partner locked in for a team Sigil (chapter 1 or 2), or undefined. */
export function sigilPartner(story: StoryState, chapter: number): string | undefined {
  if (chapter === 1) return story.sigil1Partner;
  if (chapter === 2) return story.sigil2Partner;
  return undefined;
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
  /** Whether to update the stored best score. `false` (a quest round) banks credits + marks cleared but
   *  leaves `worldBest` untouched, so a 9-hole quest can't clobber the 18-hole record. */
  recordBest = true,
): StoryState {
  const cleared = story.clearedWorldIds.includes(worldId)
    ? story.clearedWorldIds
    : [...story.clearedWorldIds, worldId];
  const prev = story.worldBest[worldId];
  const better = recordBest && (!prev || result.toPar < prev.toPar || (result.toPar === prev.toPar && result.strokes < prev.strokes));
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
function qualifierMap(v: unknown): Record<string, { place: number; field: number }> {
  const out: Record<string, { place: number; field: number }> = {};
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v as object)) {
      const r = (v as Record<string, unknown>)[k];
      if (r && typeof r === 'object') {
        const o = r as { place?: unknown; field?: unknown };
        if (typeof o.place === 'number' && Number.isFinite(o.place)) {
          out[k] = { place: Math.max(1, Math.round(o.place)), field: typeof o.field === 'number' ? Math.max(1, Math.round(o.field)) : 0 };
        }
      }
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
