/**
 * UI reducer STATE + ACTION types (extracted from game.ts, GS-refactor-split).
 *
 * The screen enum, the `UiState` shape, the matchplay `MatchUi`, the `Action` union, and the
 * `MetaProgress` init bag — the pure type surface the reducer maps over. No runtime code, so this is
 * a leaf every reducer module imports without a cycle; game.ts re-exports every public type, so
 * existing `import … from '../ui/game'` sites are unchanged. A pure move — the shapes are identical
 * to when they lived inside game.ts.
 */

import type { Course } from '../sim/course/contract';
import type { PlayedHole, PuttControl } from '../sim/round';
import type { BossReward, Route, Run, RunSnapshot, StopResult, TeamDuelSetup } from '../sim/rpg/run';
import type { EndlessRunRecord } from '../sim/rpg/endless';
import type { StrokePlayBest, StrokePlayRecord } from '../sim/rpg/strokePlay';
import type { SalvageFind } from '../sim/rpg/salvage';
import type { MetaUpgrades } from '../sim/rpg/meta';
import type { BagTier } from '../sim/rpg/bag';
import type { ClubUnlockReward } from '../sim/rpg/club-unlock';
import type { ReputationByCharacter } from '../sim/rpg/factions';
import type { SeenLore } from '../sim/rpg/lore';
import type { StoryState } from '../sim/rpg/story';
import type { CampaignStore } from '../sim/rpg/storyRoster';
import type { FriendRivalVoice } from '../sim/rpg/storyBetrayal';
import type { MidroundOmen } from '../sim/rpg/storyMidround';
import type { TournamentAftermath } from '../sim/rpg/storyAftermath';
import type { QuestBeat } from '../sim/rpg/storyQuestBeat';
import type { QualifierFormatId } from '../sim/rpg/storyQualifierFormats';
import type { AimMode, HolePlay, ScrambleShot } from '../sim/rpg/play';
import type { HoleDuel } from '../sim/rpg/match';
import type { Rng } from '../sim/rng';

/** The rooms aboard your ship (GS-story-ship-interior), in walk order. `bridge` is the entry room. */
export const SHIP_ROOMS = ['bridge', 'lounge', 'weapons', 'engine', 'locker'] as const;
export type ShipRoom = (typeof SHIP_ROOMS)[number];

export type Screen =
  | 'title'
  | 'character'
  | 'intro'
  | 'playing'
  | 'result'
  | 'bossReward'
  | 'shop'
  | 'travel'
  | 'gameover'
  | 'trademarket'
  | 'clubhouseHall'
  | 'clubhouse'
  | 'starmart'
  // GS-asgard: the Bifröst interlude — the Himinbjörg reveal map, then the win/lose result of the
  // nine-hole stroke-play tournament on The Warrior's Tee.
  | 'asgardMap'
  | 'asgardResult'
  // GS-star-tour: the free-roam star map course picker, then the stroke-play round's record recap.
  | 'starTour'
  | 'strokeResult'
  // GS-story-startour-champions: which CHAMPION to free-roam as, when more than one campaign is finished.
  // Only ever reached with 2+ champions — one flies straight to the map, none takes the classic flow.
  | 'starTourChampion'
  // GS-story: the standalone Story Mode campaign HUB (its own persistent progression, `gs_story` save) and
  // the recap shown after clearing a world round (the prologue's victory grows into it). The star-map
  // navigator REUSES the Star Tour `starTour` screen in a story context (GS-story-map).
  | 'story'
  | 'storyResult'
  // GS-story-econ: a cleared world's Pro Shop (spend credits on themed clubs, grow the green bag).
  | 'storyShop'
  // GS-story-locker: the campaign locker — build the bag from owned clubs + swap equipped gear.
  | 'storyLocker'
  // GS-story-ships: the spaceport shipyard — buy + fly ships.
  | 'storyShipyard'
  // GS-story-ship-interior: step INSIDE your ship from the star map — rooms (bridge/engine/weapons/lounge/
  // locker) with allies wandering, so you can manage the loadout on a long trip without flying home.
  | 'shipInterior'
  // GS-story-tournament: a chapter's Galaxy Tournament — the lobby (host/rival/Sigil) and the win/lose recap.
  | 'storyTournament'
  | 'storyTournamentResult'
  // GS-story-aftermath: the post-result confrontation beat for a back-half Sigil (Scorpius withdraws, the
  // key forges, …), win or loss, shown after the scorecard and before the interlude / clubhouse.
  | 'storyTournamentAftermath'
  // GS-story-tournament-midpop: the halftime (after hole 9) rival brag/curse pop in an 18-hole major.
  | 'storyTournamentPop'
  // GS-story-midround-omen: the pre-Choice betrayal foreshadow at the Ch.3 major's turn (before the pop).
  | 'storyMidBeat'
  // GS-story-caddy-quest-dialogue: the caddy's mid-round beat at the turn of THEIR quest round (quest-only).
  | 'storyQuestBeat'
  // GS-story-quest-offer-beat: the ally's PITCH beat, shown before a quest round tees off (either entry path).
  | 'storyQuestOffer'
  // GS-story-yggdrasil: the finale — the Jörmungandr battle briefing and its victory/defeat recap.
  | 'storyFinale'
  | 'storyFinaleResult'
  // GS-story-chapters: The Choice after Chapter 3 — stay a Warden or join the Coil (become a Herald).
  | 'storyChoice'
  // GS-story-midchapter: the emotional interlude between the route majors (win a friend back / sever one).
  | 'storyInterlude'
  // GS-story-parrot-bar: "The Crow's Nest" — the Parrot's cantina; tap for campaign-adaptive chatter.
  | 'storyBar'
  // GS-lore: a one-off story-beat popup shown on arrival at a stop (e.g. Driver Dan at the derelict).
  | 'lore';

export interface UiState {
  run: Run;
  screen: Screen;
  /** The current stop's course. */
  course: Course;
  /** Played holes from the last `play` (for the scorecard + animation). */
  played?: PlayedHole[];
  lastResult?: StopResult;
  /** Onward routes, populated on the travel screen. */
  routes?: Route[];
  /** The club a SALVAGE lane just looted on arrival (GS-salvage-mystery) — a TRANSIENT reveal (never
   *  persisted), computed from the PRE-travel loadout in the `route` action so the blind gamble pays off
   *  with a "you looted X" moment on the stop intro. `undefined` when the arriving lane wasn't salvage.
   *  Recomputed each jump; a page-reload resume simply shows no reveal (the club is still in the bag). */
  salvageReveal?: SalvageFind;
  /**
   * The outfitter's stock for this stop (item ids), fixed on entry so buying doesn't
   * reshuffle the cards. Live cost/stack state is recomputed from `run` at render time.
   */
  shopOffer?: string[];
  /** How many times the current shop's stock has been rerolled (GS-shop-reroll) — drives the salt + cost. */
  shopRerolls?: number;
  /** Which hole the play view is showing (0-based). */
  viewHole: number;
  /** A saved in-progress run that the title screen can resume, if any. */
  resumable?: RunSnapshot;
  // --- interactive shot-by-shot play (the 'playing' screen) ---
  /** Current hole being played interactively. */
  play?: HolePlay;
  /** Deterministic RNG for the current stop (mutated as shots resolve). */
  holeRng?: Rng;
  /** Holes completed so far this stop. */
  stopPlayed?: PlayedHole[];
  // Meta-progression (persisted across runs).
  bestStableford: number;
  bestDistance: number;
  /** Persistent currency spent at the Outpost on permanent upgrades (GS-12). */
  shards: number;
  /** Owned permanent upgrade levels (id → level). */
  metaUpgrades: MetaUpgrades;
  /** Shards earned by the run that just ended — shown on the gameover screen. */
  lastRunShards?: number;
  /** Highest Ascension tier unlocked (GS-ascension) — selectable on the title for a voyage. */
  maxAscension: number;
  /** Highest Ascension tier EACH golfer has personally cleared (+1), keyed by characterId
   *  (GS-ascension-clubs fix). Gates the per-character victory club unlock independently of the global
   *  `maxAscension`, so every golfer has its own unlock ladder (not just the first to clear a tier). */
  maxAscensionByCharacter: Record<string, number>;
  /** Lifetime holes-in-one made across every run (GS-ace) — a permanent, cross-run record. */
  lifetimeAces: number;
  /** The owned permanent default-bag tier (GS-bag-tiers) — the BEST bag you've unlocked, and the ceiling
   *  every per-golfer pick is clamped to. 'common' = the un-upgraded starter bag. */
  bagTier: BagTier;
  /** Per-golfer starting bag tier (GS-wardrobe-bagtier): characterId → BagTier, chosen in the Clubhouse
   *  wardrobe so each golfer can run its OWN Unending-Universe difficulty. Absent → the owned `bagTier`
   *  (the best unlocked bag). Always clamped to the owned tier — a weaker pick is the sterner test, never
   *  a free upgrade. The Voyage ignores it (its difficulty is Ascension) and always plays the owned tier. */
  bagTierByCharacter: Record<string, BagTier>;
  /** Owned cosmetic ships (GS-garage) — always includes the default Woody Wagon. Global ownership. */
  ownedShips: string[];
  /** Owned cosmetic apparel ids (GS-cosmetics) — hats + shirts bought at the Trade Market. Global. */
  ownedApparel: string[];
  /** The ship each character flies on the journey map (GS-clubhouse): characterId → ship id. Absent →
   *  the default Woody Wagon. Outfitted per golfer in the Clubhouse. */
  shipByCharacter: Record<string, string>;
  /** The hat / shirt / pants each character wears (characterId → apparel id). Absent → default look. */
  hatByCharacter: Record<string, string>;
  shirtByCharacter: Record<string, string>;
  pantsByCharacter: Record<string, string>;
  /** The cosmetic golf bag each character carries (GS-unending): characterId → apparel id ('bag'
   *  slot). Absent → no bag on the stage. Outfitted in the Clubhouse like the other slots. */
  golfBagByCharacter: Record<string, string>;
  /** The cosmetic driver each character swings (GS-thor): characterId → apparel id ('driver' slot).
   *  Absent → the plain club head. Outfitted in the Clubhouse like the other slots. */
  driverByCharacter: Record<string, string>;
  /** The character whose Clubhouse (garage + wardrobe) is open for outfitting (transient — not saved). */
  manageCharacterId?: string;
  /** Matchplay duel state on a boss stop (GS-100): the opponent + their pre-played ball + the duel. */
  match?: MatchUi;
  /** A pending interactive SCRAMBLE shot (GS-team-duel) — or a fortune-teller MULLIGAN (GS-tent-
   *  interactions, `mulligan` flag) — awaiting the player's ball choice. */
  scrambleChoice?: ScrambleShot;
  /** A fortune-teller tent granted a free mulligan (GS-tent-interactions): the NEXT tee shot resolves
   *  two of the player's own balls and they keep the better line. Consumed on that tee shot. */
  mulliganPending?: boolean;
  /** A StarMart tent's pop-up shop (GS-tent-interactions): the item ids on offer (spend shards). Set
   *  when the shop opens mid-hole; cleared on leave. */
  starmartOffer?: string[];
  /** StarMart reroll count this visit (shard cost ramps). */
  starmartRerolls?: number;
  /** Boss-reward choices to pick from after beating a boss (GS-talents) — shown on the bossReward screen. */
  bossReward?: BossReward[];
  /** Per-character ascension-victory club unlocks (GS-ascension-clubs): each golfer's permanently-unlocked
   *  extra starting clubs (characterId → club type ids), grown one per voyage win with that golfer. */
  unlockedClubsByCharacter: Record<string, string[]>;
  /** The ascension-victory reward from the run that just WON (GS-ascension-clubs) — a newly-unlocked club
   *  (or a Shard consolation if the character's bag was already full). Shown on the victory screen. */
  lastClubUnlock?: ClubUnlockReward;
  /** Finished-run counter (GS-clubhouse-lounge) — bumped once per run end; seeds where the golfers stand
   *  in the Clubhouse lounge, so they appear to have milled around while you were away. Cosmetic only. */
  clubhouseVisit: number;
  /** Most holes ever survived in one Unending-Universe run (GS-unending) — persisted; the key the
   *  Evergreen cosmetic unlocks + the title-card progress read. */
  endlessBestHoles: number;
  /** The Marmot Bartender clubhouse unlock (GS-tent-interactions) — persisted; set the first time a
   *  ball bonks the marmot trade-tent, after which a marmot tends the 19th-hole bar. */
  marmotBartender: boolean;
  /** Balls the Marmot pocketed in the CURRENT run (GS-tent-tips) — persisted; bumped on each marmot-tent
   *  bonk, reset when a new run begins. Drawn as golf balls in the clubhouse tip jar; when it fills the
   *  jar the Marmot is off playing the spaceport par-3 (bar + jar empty) until the next run. */
  marmotTips: number;
  /** Finished Unending-Universe runs (GS-golf-score), newest first — the personal last-runs
   *  leaderboard: holes reached + golf score + golfer, grouped by starting CLUB SET. Persisted. */
  endlessRuns: EndlessRunRecord[];
  /** STAR TOUR course records (GS-star-tour): the player's best 18-hole stroke-play round on each static
   *  course, keyed by course id. Drives the per-course + best-rounds-overall boards. Persisted. */
  strokePlayBest: StrokePlayBest;
  /** Character-specific caddy-faction REPUTATION (GS-caddy-factions): characterId → factionId → rep.
   *  Persisted; moved by the shop when a caddy is hired (+1) or fired (−3). Deliberately HIDDEN — no
   *  screen reads it yet; it's groundwork for future faction perks/events. */
  reputation: ReputationByCharacter;
  /** One-off LORE beats already seen (GS-lore): id → true. Persisted, so each story beat fires exactly
   *  once ever, across every run + mode. `pickLoreEvent` reads this to decide eligibility; `dismissLore`
   *  adds the just-shown beat's id. */
  seenLore: SeenLore;
  /** The PERMANENT Star Tour unlock (GS-story-startour-unlock): true once the Story Tour finale has been
   *  won at least once. Persisted on the MAIN save (not the campaign's `gs_story`), so beginning a fresh
   *  campaign — which resets that campaign's own `completed` flag — never relocks the free-roam reward.
   *  The title gate shows the live Star Tour tile when this is set OR the current campaign is complete. */
  starTourUnlocked: boolean;
  /** The lore beat currently being shown on the `'lore'` screen (GS-lore) — its id, resolved to its
   *  presentation via `loreEventById`. Transient (never persisted); set by the arrival lore gate,
   *  cleared on dismiss. */
  pendingLoreId?: string;
  /** A pending caddy SWAP awaiting confirmation (GS-caddy-factions): the player clicked a new caddy
   *  while one is already on the bag, so the shop shows a "they won't be happy to be fired" warning
   *  before the hire goes through. Transient (never persisted); cleared on confirm/cancel. */
  pendingFireCaddy?: { newId: string; oldId: string };
  /** A pending LEAVE-THE-ROUND confirmation (GS-android-back): the player pressed the Android back
   *  button (or Escape) while in a run, so the app shows a confirm card before parking the run and
   *  returning to the title. Transient (never persisted); cleared on confirm/cancel and by `toTitle`.
   *  See `ui/back.ts` — the confirm exists because leaving mid-stop replays that stop, not because
   *  anything is lost (`toTitle` keeps the run resumable). */
  pendingExit?: boolean;
  /** The suspended real run (GS-asgard): when an eagle-or-better on Rainbow Road opens the Bifröst, the
   *  current run is snapshotted here while the Asgard tournament plays in `run`. Restored (perks edited)
   *  on the tournament's end. The Asgard run is never persisted, so a mid-tournament quit resumes THIS. */
  asgardReturn?: RunSnapshot;
  /** A one-off Trade Market price-cut notice (GS-trade-rebalance): the Star Shards refunded by the 40%
   *  price cut, stamped by the save migration. When set (> 0), the app shows a dismissable "prices
   *  dropped, here's your refund" card; closing it dispatches `dismissPriceNotice`, which clears it (and
   *  persist writes the cleared save, so it never shows again). Absent on new saves / nothing-to-refund. */
  priceRefund?: number;
  /** The finished Asgard tournament result (GS-asgard) — shown on the result splash. */
  asgardOutcome?: { won: boolean; playerTotal: number; par: number; field: { name: string; total: number }[] };
  /** A one-shot banner shown on the journey map after returning from Asgard (GS-asgard): the victory or
   *  the "better luck next time" note. Cleared when the player travels on. Transient. */
  asgardBanner?: 'won' | 'lost';
  /** STAR TOUR (GS-star-tour): the course + weather the player has selected on the star map, carried
   *  from `pickStarTourCourse` through character select into `startRun`. Transient (not persisted). */
  starTourPick?: { courseId: string; effect?: string };
  /** STAR TOUR (GS-star-tour): the just-finished round's banked record — shown on the strokeResult recap
   *  with `strokeIsRecord` (did it set a NEW course best?). Transient. */
  lastStrokeRecord?: StrokePlayRecord;
  strokeIsRecord?: boolean;
  /** The Asgard tournament was launched from the Star Tour's hidden Yggdrasil (GS-star-tour-yggdrasil),
   *  not from a Rainbow-Road eagle mid-voyage — so there is no suspended journey to resume. `leaveAsgard`
   *  reads this to return to the star map instead of a travel screen. Transient (never persisted). */
  asgardFromStarTour?: boolean;
  /** GS-story: the active Story Mode campaign, when the player is in Story Mode. Persisted to its OWN
   *  `gs_story` save blob (NOT the main `gs_save`), loaded into state at boot if a campaign exists, and
   *  written back by the app after each action. Absent ⇒ no campaign started on this device. */
  story?: StoryState;
  /** GS-story-campaign-slots: EVERY campaign the player owns, one per golfer (`gs_story` holds the
   *  roster; `state.story` is whichever of its slots is currently being played). Hydrated at boot from
   *  `loadCampaignStore()` and kept in step by the reducer, because the reducer is the only place that
   *  may decide a DESTRUCTIVE write: `selectCharacter` has to know whether a golfer already has a
   *  campaign before it creates one over the top, and a guard that lived in the app layer would be one
   *  the reducer could contradict. */
  campaigns: CampaignStore;
  /** GS-story: the golfer picker is open in a STORY TOUR context — the player is choosing whose campaign
   *  to play (continue a saved one, or begin a golfer's first). Distinguishes it from picking a golfer for
   *  Voyage/Unending/Star Tour, which share the `character` screen: `selectCharacter` reads this to
   *  resolve a campaign instead of building a run, and it is what gates the campaign badges so no other
   *  mode's picker tags its golfers. Transient (never persisted). */
  pendingStoryNew?: boolean;
  /** GS-story-campaign-picker: the golfer whose "start over" confirmation is raised. Set only when that
   *  golfer ALREADY has a campaign, so the write it guards is genuinely destructive. Transient. */
  storyOverwriteId?: string;
  /** GS-story-clubhouse: the golfer whose stats/abilities overlay is open in the Earth clubhouse (picker or
   *  prologue hub). Absent ⇒ no overlay. Transient (never persisted). */
  storyInspectId?: string;
  /** GS-char-lore: the golfer whose LORE popup is open on a character-select screen (tap their portrait).
   *  Mode-agnostic — set from the card grid (Voyage/Unending/Star Tour) and the Story clubhouse alike.
   *  Absent ⇒ no popup. Transient (never persisted). */
  characterLoreId?: string;
  /** GS-story-prologue: the just-finished Story world round's recap payload (the `storyResult` screen). The
   *  prologue's victory grows into the Mothership/Parrot scene here. Transient. */
  lastStoryRound?: {
    courseId: string;
    toPar: number;
    strokes: number;
    par: number;
    credits: number;
    /** This clear advanced the story chapter (the prologue → Chapter 1). */
    advancedChapter: boolean;
    /** This was the prologue (the Earth World Tour final). */
    wasPrologue: boolean;
    /** GS-story-quests: the ally side quest this round fulfilled (its recap offers the reward), or absent. */
    questId?: string;
    /** GS-story-qualifiers: when this world was a QUALIFYING EVENT (a chapter world, not the Sigil venue),
     *  the field result — your finishing place, the field, the top-N bar, whether you qualified, and the
     *  running "n of 2 events qualified" progress toward the tournament. Absent on a non-qualifier round. */
    qualifier?: {
      chapter: number;
      place: number;
      fieldSize: number;
      need: number;
      qualified: boolean;
      qualifiedCount: number;
      neededCount: number;
      /** The board, in finishing order. `points` is present on a STABLEFORD event (higher wins). Empty on a
       *  matchplay event, which has a scoreline instead of a board. */
      leaderboard: { name: string; gross: number; points?: number; kind: 'ghost' | 'player' }[];
      /** GS-story-qualifier-formats: the shape this event was drawn as, for the recap headline. */
      formatId: QualifierFormatId;
      formatName: string;
      /** The tour-mate you played it beside, on a paired format. */
      partnerName?: string;
      pairing?: 'scramble' | 'bestball';
      /** Scored in points (higher wins), so the recap labels the column right. */
      stableford?: boolean;
      /** Your posted score in the format's units (strokes, or points). Absent on a matchplay event. */
      playerScore?: number;
      /** Your team's gross on a paired stroke/Stableford event. */
      teamGross?: number;
      /** How many holes your partner's ball beat yours (best-ball colour). */
      partnerCountedHoles?: number;
      /** A matchplay event's result — plus the pair you faced, since there's no board to read them off. */
      match?: { scoreline: string; playerWon: boolean; halved: boolean; thru: number; holesUp: number; opponents: string };
    };
  };
  /** GS-story-tournament: the just-finished Galaxy Tournament recap (the `storyTournamentResult` screen). */
  lastStoryTournament?: {
    chapter: number;
    name: string;
    /** GS-story-venue-services: the world the major was played at — the recap offers ITS Pro Shop /
     *  Shipyard / friend, so a win doesn't fly you home past the shop you just earned the credits for. */
    venueId: string;
    sigilName: string;
    prize: string;
    rivalName: string;
    playerGross: number;
    rivalGross: number;
    won: boolean;
    /** The trophy id won (for the Sigil ceremony cinematic — GS-story-sigil-ceremony). */
    sigilId?: string;
    /** True when this win took the fifth Sigil (the campaign is complete). */
    finalSigil: boolean;
    /** The venue's total par (for the scoreboard's to-par column). */
    par?: number;
    /** GS-story-tournament-field: the FULL finished leaderboard (rival + your three friends + you), sorted
     *  low-gross-first — the "all competitors" scoreboard for the victory recap. */
    leaderboard?: { name: string; gross: number; kind: 'rival' | 'friend' | 'player' }[];
    /** GS-story-partners: on a TEAM Sigil (Scramble/Best-ball), the partner + format for the recap copy —
     *  "You & Feather · scramble" and how many holes the partner's ball counted. Absent = a solo major. */
    team?: { partnerName: string; format: 'scramble' | 'bestball'; playerSolo: number; partnerCountedHoles: number };
    /** GS-story-sigil-formats: a MATCHPLAY Sigil — the recap reads the scoreline, not a stroke total.
     *  `kind:'singles'` = Ch.3 (just you vs the rival); `kind:'team'` = the Ch.5 2v2 scramble matchplay
     *  (You & <ally> vs <betrayer/friends> & <champion>). Absent = a stroke/team-stroke major. */
    match?: {
      kind: 'singles' | 'team';
      scoreline: string;
      thru: number;
      holesUp: number;
      /** team (Ch.5) only: your partner + the opposing pair + path. */
      allyName?: string;
      oppNames?: [string, string];
      herald?: boolean;
    };
  };
  /** GS-story-tournament-midpop: the halftime (after hole 9) rival pop payload — the rival BRAGS when
   *  ahead / CURSES you when behind, over the standings through nine. Transient (the `storyTournamentPop`
   *  screen reads it; cleared on "play on"). */
  storyTournamentMidPop?: {
    rivalId: string;
    rivalName: string;
    /** The rival is ahead (fewer strokes) → they brag; else they curse you (you're beating them). */
    brag: boolean;
    playerThru: number;
    rivalThru: number;
    /** GS-story-sigil-rivals: set when the rival is one of the playable FRIENDS — their golfer id (draw
     *  their real figure) + which betrayal-voice context they speak (`confront` = the heartbroken Warden
     *  friend, `corrupt` = the Coil-garbed defector, who also wears the corrupted tint). */
    rivalGolferId?: string;
    rivalVoice?: FriendRivalVoice;
    rivalCorrupted?: boolean;
    /** GS-story-sigil-live: set on a MATCHPLAY Sigil — the halftime standing is the MATCH state (holes
     *  up, from the same resolver streams as the finish); `playerThru`/`rivalThru` then carry holes WON
     *  per side, not stroke counts. `team` = the 2v2 finale (label the sides as teams). */
    match?: { holesUp: number; thru: number; team: boolean };
  };
  /** GS-story-midround-omen: the pre-Choice betrayal foreshadow shown at the Ch.3 major's turn (the
   *  `storyMidBeat` screen), BEFORE the halftime rival pop. Carries the assembled beat (the future
   *  betrayer + why + their voice lines); on continue it's marked seen and flows into the pop. Transient. */
  pendingMidBeat?: MidroundOmen;
  /** GS-story-aftermath: the post-result confrontation beat for a back-half Sigil (the `storyTournamentAftermath`
   *  screen), shown after the scorecard and before the interlude / clubhouse. Set on the divert, cleared on
   *  continue. Transient; back-half (Ch.4/5) majors only, so a trunk major never carries it. */
  pendingAftermath?: TournamentAftermath;
  /** GS-story-caddy-quest-dialogue: the caddy's mid-round beat shown at the turn of their quest round (the
   *  `storyQuestBeat` screen). Set on the divert, cleared on continue → the next hole tees up. Transient;
   *  quest-only, so it never appears in a tournament / main-story round. */
  pendingQuestBeat?: QuestBeat;
  /** GS-story-quest-offer-beat: the ally's PITCH beat shown the instant before a quest round tees off (the
   *  `storyQuestOffer` screen). Set on both round-start diverts (`playStoryQuest` from the clubhouse AND
   *  `storyStartQuest` from the star map), cleared on continue → the round intro (via `withLoreGate`), so the
   *  first story beat always plays regardless of path and never doubles. Transient; quest-only. */
  pendingQuestOffer?: QuestBeat;
  /** GS-story-yggdrasil: the finale recap payload (win/lose + which gate fell short). Transient.
   *  GS-story-champion-cosmetics: a WIN also carries the champion set the ending just hung in the global
   *  wardrobe — `championUnlocked` is only the genuinely NEW ids, so finishing the same path a second time
   *  announces nothing (an empty list = no reveal panel), while `championSet` names the outfit either way. */
  lastStoryFinale?: {
    won: boolean;
    failReason?: 'firepower' | 'defence' | 'repelled';
    strike?: 'clean' | 'graze';
    championUnlocked?: string[];
    championSet?: string;
  };
  /** GS-story-econ: the world whose Pro Shop is open (the `storyShop` screen). Transient. */
  storyShopWorldId?: string;
  /** GS-story-shop-access: the screen the Pro Shop was opened FROM, so exiting returns there — the star map
   *  (a dossier tap) or the world-clear recap. Transient. */
  storyShopReturn?: Screen;
  /** GS-story-ship-vendors: the ship-vendor world whose shipyard is open (buy mode). Absent ⇒ the clubhouse
   *  HANGAR (equip an owned ship only, no buying). Transient. */
  storyShipyardWorldId?: string;
  /** GS-story-ship-vendors: the screen the shipyard was opened FROM, so exiting returns there. Transient. */
  storyShipyardReturn?: Screen;
  /** GS-story-econ: the shop item whose lore card is open (over the rack). Absent ⇒ no card. Transient. */
  storyItemInspectId?: string;
  /** GS-story-ship-interior: the room you're in aboard the ship (bridge/engine/weapons/lounge/locker).
   *  Transient. */
  shipRoom?: string;
  /** GS-story-ship-interior: the screen the ship interior was entered FROM (the star map), so exiting
   *  returns there. Transient. */
  shipInteriorReturn?: Screen;
  /** GS-story-ship-interior: a bumped counter each time you board — reshuffles which room each ally is in,
   *  so the crew appears to have moved about between visits. Transient. */
  shipVisit?: number;
  /** GS-story-locker: the screen the locker was opened FROM (clubhouse or the ship interior), so exiting
   *  returns there. Transient. */
  storyLockerReturn?: Screen;
  /** GS-story-parrot-bar: the Parrot's chatter tap-count at the bar (0 = greeting; each tap advances,
   *  wrapping through the eligible lines). Transient — reset to 0 each time the bar is opened, never saved. */
  storyBarTalk?: number;
  /** GS-story-map-nav: the screen the Galaxy Tournament lobby was opened FROM — the clubhouse banner OR the
   *  star-map venue dossier (fly directly to the Sigil) — so backing out of the lobby returns there instead
   *  of always dumping to the clubhouse. Transient (never persisted). Absent ⇒ the clubhouse. */
  storyTournamentReturn?: Screen;
  /** GS-story-partners: the friend chosen as your PARTNER in the team-Sigil lobby (Scramble/Best-ball),
   *  before you tee off. Transient (carried onto the run at tee-off; the locked pick persists on StoryState).
   *  Absent ⇒ default to your first tour-mate. */
  storyPartnerPick?: string;
  /** GS-story-sigil5-npc: the FINALE partner chosen in the Ch.5 2v2 lobby — a loyal tour-mate (Warden) or a
   *  Coil champion (Herald: Voss/Venoma/Scorpius, minus the one on your bag). Transient (carried onto the run
   *  at tee-off as `storyTournamentPartner`; validated on read, so a stale pick from a prior run is ignored).
   *  Absent ⇒ the deterministic default (`loyalAllyId` / `coilChampionExcluding`). */
  storyFinalePartner?: string;
  /** GS-story-allies: the recruited crew ally whose talk card is open on the clubhouse (undefined ⇒ none).
   *  Transient (never persisted). */
  storyAllyInspectId?: string;
  /** GS-story-allies: the open ally card's banter tap-count (0 = first line; each tap advances, wrapping).
   *  Transient — reset to 0 when a card opens, never saved. */
  storyAllyTalk?: number;
}

/** The matchplay duel a boss stop is played as (GS-100), incl. team duels (GS-team-duel). */
export interface MatchUi {
  /** The opponent golfer id (the leaderboard leader). */
  bossId: string;
  /** The boss's (team-scored) ball on each hole of the stop (pre-computed; revealed hole by hole). */
  bossHoles: PlayedHole[];
  /** Hole-by-hole duel results so far. */
  duels: HoleDuel[];
  /** Holes up from the player's view (+ player, − boss). */
  holesUp: number;
  /** Match mathematically decided (up by more than remain). */
  decided: boolean;
  /** Match over (decided early or all holes played). */
  finished: boolean;
  /** Team-duel setup (GS-team-duel): format, which side has the partner, partner ids. Absent ⇒ solo duel. */
  setup?: TeamDuelSetup;
  /** The player's partner's parallel ball per completed hole (best-ball only) — for "which counted" display. */
  partnerHoles?: PlayedHole[];
}

export type Action =
  | { type: 'start'; format: string; ascension?: number }
  | { type: 'selectCharacter'; characterId: string; ascension?: number; bagTier?: BagTier } // pick a golfer (+ their Ascension tier for a voyage / starting club set for the Unending Universe), then begin the run
  | { type: 'backToCharacter' } // GS-intro-split: from the stop intro, step back to re-pick the golfer
  | { type: 'resume' }
  | { type: 'play' } // auto-play the whole stop (watch)
  | { type: 'warpStop' } // GS-warp: fast-forward this stop under the hidden auto-birdie rule
  | { type: 'playInteractive' } // play shot-by-shot
  | { type: 'shot'; clubId: string; aim: AimMode; target?: [number, number]; power?: number }
  | { type: 'chooseScrambleBall'; pick: 'player' | 'partner' } // keep a ball in an interactive scramble (GS-team-duel)
  | { type: 'putt'; control?: PuttControl } // take one putt — with a pace-meter control = manual skill
  | { type: 'autoShotHole' } // AI-finish the current hole
  | { type: 'holeComplete' } // advance to next hole / score the stop
  | { type: 'continue' }
  | { type: 'crossBifrost' } // GS-asgard: cross the Bifröst from the Himinbjörg map into the Asgard tournament
  | { type: 'leaveAsgard' } // GS-asgard: leave the Golden Realm (win or lose) and resume the suspended run
  | { type: 'openStarTour' } // GS-star-tour: open the free-roam star map course picker
  | { type: 'pickStarTourCourse'; courseId: string; effect?: string } // choose a course + weather → character select
  | { type: 'selectStarTourChampion'; characterId: string } // GS-story-startour-champions: free-roam as this finished campaign's protagonist
  | { type: 'exitStarTour' } // GS-star-tour: leave the star map back to the title
  | { type: 'openStory' } // GS-story: enter Story Mode — opens the golfer picker (campaigns are per golfer, so "which campaign" and "which golfer" are one question)
  // GS-story-campaign-picker: resume the saved campaign of a named golfer, from the picker.
  | { type: 'storyContinueCampaign'; characterId: string }
  // GS-story-campaign-picker: ask to START OVER as a golfer who already has a campaign → raises the
  // confirmation. Refused when there is no campaign, so it can never be a second way to create one.
  | { type: 'storyRequestRestart'; characterId: string }
  | { type: 'storyCancelRestart' }
  // GS-story-campaign-picker: CREATE this golfer's campaign — fresh, or the CONFIRMED replacement of an
  // existing one (which `storyOverwriteId` must name, or the reducer refuses). Overwrites exactly one slot.
  | { type: 'storyRestartCampaign'; characterId: string }
  | { type: 'storyNewCampaign' } // GS-story: begin a fresh campaign (pick a golfer) — overwrites the saved one on completion
  | { type: 'exitStory' } // GS-story: leave the Story Mode hub back to the title
  // GS-story-prologue: tee off a Story world round from the hub. `partnerId` (GS-story-qualifier-partner-pick)
  // is the tour-mate the player chose on the star-map dossier for a PAIRED qualifying event — validated on
  // read against the roster, so an absent/stale id falls back to the draw's suggestion.
  | { type: 'storyPlayWorld'; courseId: string; partnerId?: string }
  | { type: 'storyRoundContinue' } // GS-story-prologue: dismiss the world-round recap back to the campaign hub
  | { type: 'storyInspectGolfer'; characterId: string } // GS-story-clubhouse: open a golfer's stats/abilities overlay
  | { type: 'storyCloseInspect' } // GS-story-clubhouse: close the golfer stats overlay
  | { type: 'showCharacterLore'; characterId: string } // GS-char-lore: open a golfer's lore popup from a select screen
  | { type: 'closeCharacterLore' } // GS-char-lore: close the golfer lore popup
  | { type: 'storySwitchGolfer'; characterId: string } // GS-story-clubhouse: change your protagonist (pre-tee-off, prologue only)
  | { type: 'openStoryMap' } // GS-story-map: open the galaxy star-map navigator (the Star Tour screen, story context)
  | { type: 'exitStoryMap' } // GS-story-map: back to the clubhouse from the star map
  | { type: 'openStoryShop'; worldId: string } // GS-story-econ: open a cleared world's Pro Shop from its dossier
  | { type: 'hireStoryCaddy'; worldId: string; caddyId: string } // GS-story-caddies: recruit the friend who waits at a cleared world
  | { type: 'setStoryCaddy'; caddyId?: string } // GS-story-caddies: choose which owned caddy carries the bag (Locker)
  | { type: 'exitStoryShop' } // GS-story-econ: close the Pro Shop back to the star map
  | { type: 'storyInspectItem'; itemId: string } // GS-story-econ: tap a shop item → its lore card
  | { type: 'storyCloseItem' } // GS-story-econ: dismiss the item lore card
  | { type: 'storyBuyItem'; itemId: string } // GS-story-econ: buy the inspected item (spend credits, grow the bag)
  | { type: 'openStoryLocker' } // GS-story-locker: open the campaign locker (bag builder + gear) from the clubhouse
  | { type: 'exitStoryLocker' } // GS-story-locker: back to the clubhouse from the locker
  | { type: 'storyEquipClub'; clubId: string } // GS-story-locker: put an owned club into the bag
  | { type: 'storyUnequipClub'; clubId: string } // GS-story-locker: take a club out of the bag (to the bench)
  | { type: 'storyEquipGear'; gearId: string } // GS-story-locker: equip an owned gear item in its slot
  | { type: 'storyUnequipGear'; slot: string } // GS-story-locker: empty a gear slot
  | { type: 'openStoryShipyard'; worldId?: string } // GS-story-ship-vendors: worldId ⇒ that vendor world's shipyard (buy); absent ⇒ the clubhouse Hangar (equip only)
  | { type: 'exitStoryShipyard' } // GS-story-ships: back to the clubhouse from the shipyard
  | { type: 'storyBuyShip'; shipId: string } // GS-story-ships: buy a ship (spend credits, fly it)
  | { type: 'storyEquipShip'; shipId: string } // GS-story-ships: fly an owned ship
  | { type: 'storyBuyUpgrade'; upgradeId: string } // GS-story-ship-upgrades: buy a ship weapon/engine/shield
  | { type: 'openShipInterior' } // GS-story-ship-interior: board your ship from the star map
  | { type: 'exitShipInterior' } // GS-story-ship-interior: leave the ship back to the star map
  | { type: 'shipInteriorGoto'; room: string } // GS-story-ship-interior: walk to a room aboard the ship
  | { type: 'openStoryTournament' } // GS-story-tournament: open the chapter's Galaxy Tournament lobby
  | { type: 'exitStoryTournament' } // GS-story-tournament: back to the clubhouse from the lobby
  | { type: 'storyPlayTournament' } // GS-story-tournament: tee off the tournament round (vs the rival)
  | { type: 'selectStoryPartner'; characterId: string } // GS-story-partners: pick your team-Sigil partner in the lobby
  | { type: 'selectFinalePartner'; characterId: string } // GS-story-sigil5-npc: pick your Ch.5 finale ally (loyal friend / Coil champion)
  | { type: 'tournamentPopContinue' } // GS-story-tournament-midpop: dismiss the halftime rival pop, play on
  | { type: 'storyMidBeatContinue' } // GS-story-midround-omen: dismiss the pre-Choice foreshadow → the pop
  | { type: 'storyAftermathContinue' } // GS-story-aftermath: dismiss the post-Sigil confrontation beat → interlude/clubhouse
  | { type: 'storyQuestBeatContinue' } // GS-story-caddy-quest-dialogue: dismiss the caddy mid-round beat → play on
  | { type: 'storyQuestOfferContinue' } // GS-story-quest-offer-beat: dismiss the ally's pitch → fly out, tee up the quest round
  | { type: 'storyTournamentContinue' } // GS-story-tournament: dismiss the win/lose recap
  | { type: 'openStoryFinale' } // GS-story-yggdrasil: open the finale battle briefing (five Sigils in hand)
  | { type: 'exitStoryFinale' } // GS-story-yggdrasil: back to the clubhouse from the briefing
  | { type: 'engageStoryFinale'; strike?: 'clean' | 'graze'; outcome?: 'won' | 'lost' } // GS-story-yggdrasil/-battle-2: resolve the battle → recap (strike = finisher quality; outcome = the live fight's own result, clamped under the gate verdict — an armed loss is a costless 'repelled')
  | { type: 'storyFinaleContinue' } // GS-story-yggdrasil: dismiss the recap (to clubhouse; victory → title)
  | { type: 'chooseAlignment'; alignment: 'warden' | 'herald' } // GS-story-chapters: The Choice after Ch.3
  | { type: 'storyInterludeContinue' } // GS-story-midchapter: dismiss the emotional interlude (apply its outcome)
  | { type: 'openStoryBar' } // GS-story-parrot-bar: enter the Parrot's cantina from the clubhouse
  | { type: 'exitStoryBar' } // GS-story-parrot-bar: back to the clubhouse from the bar
  | { type: 'parrotBarNext' } // GS-story-parrot-bar: tap the Parrot for the next line (advance the chatter)
  | { type: 'storyInspectAlly'; caddyId: string } // GS-story-allies: tap a recruited crew ally → their talk card
  | { type: 'storyAllyTalk'; caddyId: string } // GS-story-allies: cycle the open ally's banter line
  | { type: 'storyCloseAlly' } // GS-story-allies: dismiss the ally talk card
  | { type: 'acceptStoryQuest'; questId: string } // GS-story-quests: accept an ally's side quest (from their card)
  | { type: 'claimCharacterQuest'; charId: string } // GS-story-charquests: claim a friend's signature club
  | { type: 'playStoryQuest' } // GS-story-quests: tee off the active quest's round (the ally's home world)
  | { type: 'storyStartQuest'; courseId: string } // GS-story-map-nav: from the star-map dossier, accept (if needed) + tee off the quest that plays on this world
  | { type: 'completeStoryQuest' } // GS-story-quests: claim the quest reward on the round recap
  | { type: 'playYggdrasilRealm'; realmId: string } // GS-star-tour-yggdrasil: play a Norse realm off the World Tree (Asgard only, today)
  | { type: 'dismissLore' } // GS-lore: close the story-beat popup (marks it seen) and continue to the stop intro
  | { type: 'pickBossReward'; index: number } // claim a talent / permanent reward after beating a boss
  | { type: 'buy'; id: string; confirmFire?: boolean } // confirmFire: the caddy-swap warning was accepted (GS-caddy-factions)
  | { type: 'cancelFireCaddy' } // dismiss the caddy-swap "they won't be happy" warning without hiring (GS-caddy-factions)
  | { type: 'rerollShop' } // pay credits to redraw the outfitter's stock (GS-shop-reroll)
  | { type: 'leaveShop' }
  | { type: 'openStarmart' } // a StarMart tent's pop-up shop opens mid-hole (GS-tent-interactions)
  | { type: 'buyStarmart'; id: string } // buy a StarMart item with shards
  | { type: 'rerollStarmart' } // pay shards to redraw the StarMart rack
  | { type: 'leaveStarmart' } // close the StarMart and keep playing the hole
  | { type: 'route'; routeId: number }
  | { type: 'scanRoutes' } // burn fuel to redraw the three onward lanes (GS-fuel-4 sector scan)
  | { type: 'buyFuel'; units: number } // top the ship's tank up with credits (GS-fuel) — Pro Shop / journey depot
  | { type: 'strand' } // out of fuel AND credits with no payable lane (GS-fuel): the run ends stranded
  | { type: 'bank' } // cash out the run (push-your-luck): bank credits→shards, end the run
  | { type: 'viewHole'; hole: number }
  | { type: 'openMarket' } // visit the between-run Trade Market (buy ships/apparel/bags) (GS-clubhouse)
  | { type: 'closeMarket' } // back to the title from the Trade Market
  | { type: 'openClubhouseHall' } // enter the Clubhouse — the hall of all four golfers (GS-clubhouse)
  | { type: 'closeClubhouseHall' } // back to the title from the Clubhouse hall
  | { type: 'openClubhouse'; characterId: string } // outfit one character's garage + wardrobe (GS-clubhouse)
  | { type: 'closeClubhouse' } // back to the title from the Clubhouse
  | { type: 'clubhouseBackToHall' } // back to the hall (pick another golfer) from one golfer's Clubhouse
  | { type: 'buyShip'; id: string } // buy a cosmetic ship with shards (global ownership) (GS-garage)
  | { type: 'selectShip'; id: string } // fly a different owned ship on the managed character (Clubhouse)
  | { type: 'buyApparel'; id: string } // buy a cosmetic hat/shirt/pants with shards (global ownership) (GS-cosmetics)
  | { type: 'equipApparel'; id: string } // wear an owned hat/shirt/pants on the managed character (toggles off)
  | { type: 'dismissPriceNotice' } // close the one-off Trade Market price-cut / refund notice (GS-trade-rebalance)
  | { type: 'buyBagTier'; tier: BagTier } // buy a permanent default-bag upgrade with shards (GS-bag-tiers)
  | { type: 'setCharacterBagTier'; tier: BagTier } // pick the managed golfer's Unending-Universe starting bag tier (GS-wardrobe-bagtier)
  | { type: 'requestExit' } // GS-android-back: raise the "leave this round?" confirm (back pressed in a run)
  | { type: 'cancelExit' } // GS-android-back: dismiss that confirm and stay in the round
  | { type: 'toTitle' } // back to the title from anywhere (GS-settings-nav) — an underway run stays resumable
  | { type: 'restart'; seed?: number | string };

export interface MetaProgress {
  bestStableford?: number;
  bestDistance?: number;
  shards?: number;
  metaUpgrades?: MetaUpgrades;
  maxAscension?: number;
  maxAscensionByCharacter?: Record<string, number>;
  lifetimeAces?: number;
  ownedShips?: string[];
  ownedApparel?: string[];
  shipByCharacter?: Record<string, string>;
  hatByCharacter?: Record<string, string>;
  shirtByCharacter?: Record<string, string>;
  pantsByCharacter?: Record<string, string>;
  golfBagByCharacter?: Record<string, string>;
  driverByCharacter?: Record<string, string>;
  bagTier?: BagTier;
  bagTierByCharacter?: Record<string, BagTier>;
  unlockedClubsByCharacter?: Record<string, string[]>;
  clubhouseVisit?: number;
  endlessBestHoles?: number;
  marmotBartender?: boolean;
  marmotTips?: number;
  endlessRuns?: EndlessRunRecord[];
  reputationByCharacter?: ReputationByCharacter;
  strokePlayBest?: StrokePlayBest;
  seenLore?: SeenLore;
  /** The permanent Star Tour unlock (GS-story-startour-unlock) — earned on the first Story finale win. */
  starTourUnlocked?: boolean;
  /** Star Shards refunded by the GS-trade-rebalance 40% Trade Market price cut — set by the save
   *  migration, drives the one-off "prices dropped, here's your refund" notice. */
  priceRefund?: number;
}
