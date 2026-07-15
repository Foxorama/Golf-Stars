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
import type { AimMode, HolePlay, ScrambleShot } from '../sim/rpg/play';
import type { HoleDuel } from '../sim/rpg/match';
import type { Rng } from '../sim/rng';

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
  // nine-hole stroke-play tournament against the Warriors Three.
  | 'asgardMap'
  | 'asgardResult'
  // GS-star-tour: the free-roam star map course picker, then the stroke-play round's record recap.
  | 'starTour'
  | 'strokeResult'
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
  /** The lore beat currently being shown on the `'lore'` screen (GS-lore) — its id, resolved to its
   *  presentation via `loreEventById`. Transient (never persisted); set by the arrival lore gate,
   *  cleared on dismiss. */
  pendingLoreId?: string;
  /** A pending caddy SWAP awaiting confirmation (GS-caddy-factions): the player clicked a new caddy
   *  while one is already on the bag, so the shop shows a "they won't be happy to be fired" warning
   *  before the hire goes through. Transient (never persisted); cleared on confirm/cancel. */
  pendingFireCaddy?: { newId: string; oldId: string };
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
  | { type: 'exitStarTour' } // GS-star-tour: leave the star map back to the title
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
  /** Star Shards refunded by the GS-trade-rebalance 40% Trade Market price cut — set by the save
   *  migration, drives the one-off "prices dropped, here's your refund" notice. */
  priceRefund?: number;
}
