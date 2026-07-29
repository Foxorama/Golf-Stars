/**
 * Versioned save schema. Every persisted blob carries a `version` and passes through
 * `migrate()` on load. v2 added the RPG meta-loop (resumable run snapshot + furthest
 * distance); v3 adds persistent meta-progression (Star Shards + permanent upgrade levels,
 * GS-12) and drops v2's dead always-zero `credits` field. The migrate chain runs one step
 * at a time (v1→v2→v3).
 */

import type { RunSnapshot } from '../sim/rpg/run';
import type { MetaUpgrades } from '../sim/rpg/meta';
import type { BagTier } from '../sim/rpg/bag';
import type { EndlessRunRecord } from '../sim/rpg/endless';
import type { StrokePlayBest } from '../sim/rpg/strokePlay';
import type { SeenLore } from '../sim/rpg/lore';
import { DEFAULT_SHIP_ID, SHIPS } from '../sim/rpg/ships';
import { APPAREL } from '../sim/rpg/apparel';
import type { CosmeticRarity } from '../sim/rpg/cosmetics';
import { CHARACTERS } from '../sim/rpg/characters';
import type { ReputationByCharacter } from '../sim/rpg/factions';

export const SAVE_VERSION = 32;

/** v1 — the vertical-slice save (kept for the migration path). */
export interface SaveV1 {
  version: 1;
  runSeed?: number;
  distanceFromStart: number;
  credits: number;
  bestStableford: number;
  savedAt?: string;
}

/** v2 — adds the meta-loop. */
export interface SaveV2 {
  version: 2;
  /** Banked meta-currency (always 0 in practice — dropped in v3). */
  credits: number;
  bestStableford: number;
  /** Furthest galaxy distance ever reached. */
  bestDistance: number;
  /** In-progress run, if any (loadout rebuilt from its perks on resume). */
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v3 — adds persistent meta-progression (Star Shards + permanent upgrade levels). */
export interface SaveV3 {
  version: 3;
  bestStableford: number;
  /** Furthest galaxy distance ever reached. */
  bestDistance: number;
  /** Persistent meta-currency, spent at the Outpost on permanent upgrades. */
  shards: number;
  /** Owned permanent upgrade levels (id → level). */
  metaUpgrades: MetaUpgrades;
  /** In-progress run, if any (loadout rebuilt from its perks + meta on resume). */
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v4 — adds the Ascension difficulty ladder (GS-ascension): the highest tier unlocked by winning. */
export interface SaveV4 {
  version: 4;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  /** Highest Ascension level unlocked (0 = base; +1 each time you win at the current top tier). */
  maxAscension: number;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v5 — adds the lifetime hole-in-one tally (GS-ace): a permanent, cross-run bragging-rights record. */
export interface SaveV5 {
  version: 5;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  /** Holes-in-one made across every run, ever (a permanent badge of honour). */
  lifetimeAces: number;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v6 — repurposes Star Shards from permanent stat upgrades to the cosmetic Trade Market (GS-garage):
 *  the owned spaceship fleet + the selected ship, plus the market's rotating-offer seed. `metaUpgrades`
 *  is kept for old-save compat (the Outpost stat-spend is retired; any grandfathered levels still apply). */
export interface SaveV6 {
  version: 6;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  lifetimeAces: number;
  /** Owned cosmetic ship ids (always includes the default Woody Wagon). */
  ownedShips: string[];
  /** The ship currently flown on the journey map. */
  selectedShip: string;
  /** The Trade Market's rotating-offer seed — bumps on each completed run so the stock refreshes. */
  marketSeed: number;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v7 — adds the cosmetic WARDROBE (GS-cosmetics): owned hats & shirts + the equipped piece per slot. */
export interface SaveV7 {
  version: 7;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  lifetimeAces: number;
  ownedShips: string[];
  selectedShip: string;
  marketSeed: number;
  /** Owned cosmetic apparel ids (hats + shirts). Empty = the golfer wears its character colours. */
  ownedApparel: string[];
  /** The equipped hat / shirt apparel ids (undefined = character default for that slot). */
  equippedHat?: string;
  equippedShirt?: string;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v8 — adds the permanent default-bag tier (GS-bag-tiers): the loot rarity all default clubs are
 *  re-stamped to (rare/epic/legendary), bought with Star Shards once the Ascension gate is cleared. */
export interface SaveV8 {
  version: 8;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  lifetimeAces: number;
  ownedShips: string[];
  selectedShip: string;
  marketSeed: number;
  ownedApparel: string[];
  equippedHat?: string;
  equippedShirt?: string;
  /** The owned default-bag tier ('common' = the un-upgraded starter bag). */
  bagTier: BagTier;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v9 — adds per-character ascension-victory club unlocks (GS-ascension-clubs): each golfer's
 *  permanently-unlocked extra starting clubs (characterId → club type ids), won by clearing a voyage. */
export interface SaveV9 {
  version: 9;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  lifetimeAces: number;
  ownedShips: string[];
  selectedShip: string;
  marketSeed: number;
  ownedApparel: string[];
  equippedHat?: string;
  equippedShirt?: string;
  bagTier: BagTier;
  /** Per-character permanently-unlocked clubs (characterId → club type ids), grown one club per voyage
   *  win with that golfer. Absent/empty = every golfer plays its signature starting bag. */
  unlockedClubsByCharacter: Record<string, string[]>;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v10 — splits cosmetic OUTFITTING per character (GS-clubhouse): the Trade Market still grants global
 *  OWNERSHIP (ownedShips/ownedApparel), but the equipped ship + hat + shirt are now chosen PER golfer in
 *  the Clubhouse — so each of the four characters can fly a different ride and wear a different look. The
 *  old global `selectedShip`/`equippedHat`/`equippedShirt` become per-character maps; the rotating ship
 *  market + its `marketSeed` are retired in favour of a full browsable catalogue. */
export interface SaveV10 {
  version: 10;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  lifetimeAces: number;
  /** Owned cosmetic ship ids (always includes the default Woody Wagon) — global, bought at the market. */
  ownedShips: string[];
  /** Owned cosmetic apparel ids (hats + shirts) — global, bought at the market. */
  ownedApparel: string[];
  /** The ship each character flies on the journey map (characterId → ship id). Absent → the default wagon. */
  shipByCharacter: Record<string, string>;
  /** The hat each character wears (characterId → apparel id). Absent → that character's default look. */
  hatByCharacter: Record<string, string>;
  /** The shirt each character wears (characterId → apparel id). Absent → that character's default look. */
  shirtByCharacter: Record<string, string>;
  bagTier: BagTier;
  unlockedClubsByCharacter: Record<string, string[]>;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v11 — adds PANTS to the wardrobe (GS-pants-outfit): a third apparel slot, equipped per character in
 *  the Clubhouse exactly like the hat & shirt. The Trade Market sells pants for global ownership
 *  (the existing `ownedApparel` pool covers all three slots); only the equip map is new. */
export interface SaveV11 {
  version: 11;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  lifetimeAces: number;
  ownedShips: string[];
  /** Owned cosmetic apparel ids (hats + shirts + pants) — global, bought at the market. */
  ownedApparel: string[];
  shipByCharacter: Record<string, string>;
  hatByCharacter: Record<string, string>;
  shirtByCharacter: Record<string, string>;
  /** The pants each character wears (characterId → apparel id). Absent → that character's default legs. */
  pantsByCharacter: Record<string, string>;
  bagTier: BagTier;
  unlockedClubsByCharacter: Record<string, string[]>;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v12 — adds the Clubhouse-lounge shuffle counter (GS-clubhouse-lounge): the golfers mill around a
 *  bar/fireplace lounge, and `clubhouseVisit` (bumped once per finished run) seeds where each one
 *  stands, so it looks like they moved while you were away. Purely cosmetic — nothing sim-facing. */
export interface SaveV12 {
  version: 12;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  lifetimeAces: number;
  ownedShips: string[];
  ownedApparel: string[];
  shipByCharacter: Record<string, string>;
  hatByCharacter: Record<string, string>;
  shirtByCharacter: Record<string, string>;
  pantsByCharacter: Record<string, string>;
  bagTier: BagTier;
  unlockedClubsByCharacter: Record<string, string[]>;
  /** Runs finished so far (GS-clubhouse-lounge) — the seed that reshuffles the lounge each time home. */
  clubhouseVisit: number;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v13 — the Unending Universe (GS-unending): the lifetime-best survived-hole count (drives the
 *  Evergreen cosmetic unlocks + the title-card progress tease) and the per-character cosmetic GOLF
 *  BAG equip map (the new 'bag' apparel slot, outfitted in the Clubhouse like hat/shirt/pants). */
export interface SaveV13 {
  version: 13;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  lifetimeAces: number;
  ownedShips: string[];
  ownedApparel: string[];
  shipByCharacter: Record<string, string>;
  hatByCharacter: Record<string, string>;
  shirtByCharacter: Record<string, string>;
  pantsByCharacter: Record<string, string>;
  /** The cosmetic golf bag each character carries (characterId → apparel id). Absent → no bag. */
  golfBagByCharacter: Record<string, string>;
  bagTier: BagTier;
  unlockedClubsByCharacter: Record<string, string[]>;
  clubhouseVisit: number;
  /** Most holes ever survived in one Unending-Universe run (GS-unending) — the unlock ladder key. */
  endlessBestHoles: number;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v14 — per-character Ascension clears (GS-ascension-clubs fix): the highest Ascension tier EACH
 *  golfer has personally cleared (characterId → cleared-tier+1), so the victory club unlock is gated
 *  per character instead of off the single global `maxAscension`. Without it only the FIRST golfer to
 *  clear a tier ever earned a club; now every golfer has their own unlock ladder. `maxAscension` stays
 *  global (difficulty selection + bag tiers). */
export interface SaveV14 {
  version: 14;
  bestStableford: number;
  bestDistance: number;
  shards: number;
  metaUpgrades: MetaUpgrades;
  maxAscension: number;
  /** Per-character highest Ascension cleared (+1), keyed by characterId — the club-unlock gate. */
  maxAscensionByCharacter: Record<string, number>;
  lifetimeAces: number;
  ownedShips: string[];
  ownedApparel: string[];
  shipByCharacter: Record<string, string>;
  hatByCharacter: Record<string, string>;
  shirtByCharacter: Record<string, string>;
  pantsByCharacter: Record<string, string>;
  golfBagByCharacter: Record<string, string>;
  bagTier: BagTier;
  unlockedClubsByCharacter: Record<string, string[]>;
  clubhouseVisit: number;
  endlessBestHoles: number;
  activeRun?: RunSnapshot;
  savedAt?: string;
}

/** v15 adds the Marmot Bartender clubhouse unlock (GS-tent-interactions): earned the first time a
 *  golf ball ever bonks the marmot trade-tent. Once true, a marmot tends the 19th-hole bar and a golf
 *  ball sits on the counter — a permanent, cross-run cosmetic (never re-lockable). */
export interface SaveV15 extends Omit<SaveV14, 'version'> {
  version: 15;
  /** The Marmot Bartender is unlocked (a marmot tent has been bonked at least once). */
  marmotBartender: boolean;
}

/** v16 adds the Unending-Universe golf-scoring records (GS-golf-score): a rolling history of finished
 *  endless runs, each stamped with its starting CLUB SET (the leaderboard difficulty), the golfer, and
 *  the round's holes/gross/par — the data behind the "last runs" leaderboard. Purely additive; existing
 *  fields are untouched. */
export interface SaveV16 extends Omit<SaveV15, 'version'> {
  version: 16;
  /** Finished Unending-Universe runs, newest first (capped) — the personal last-runs leaderboard. */
  endlessRuns: EndlessRunRecord[];
}

/** v17 stamps WARP (GS-warp) onto the persisted shapes: `EndlessRunRecord.startHole` (the board's
 *  "50–67" range start — absent = played from the first tee) and `RunSnapshot.warpedThrough` (so a
 *  resumed warped run keeps its range). Both fields are OPTIONAL and absent on old data, so the
 *  migration is a pure version stamp; existing records read as unwarped ("1–N"), which is true. */
export interface SaveV17 extends Omit<SaveV16, 'version'> {
  version: 17;
}

/** v18 stamps the ship-fuel system (GS-fuel) onto the persisted shape: `RunSnapshot.fuel` (the tank
 *  gauge, so a resumed run keeps it). The field is OPTIONAL and absent on old data, so the migration
 *  is a pure version stamp; a pre-fuel active run resumes with the format's fresh starting tank
 *  (generous — an old save can never resume already stranded). */
export interface SaveV18 extends Omit<SaveV17, 'version'> {
  version: 18;
}

/** v19 stamps the sector scan (GS-fuel-4) onto the persisted shape: `RunSnapshot.routeScans` (scans
 *  burnt at the parked stop, so a resume re-draws the exact lane offer the player paid fuel for).
 *  Optional and absent on old data, so the migration is a pure version stamp; an old run resumes on
 *  the classic scan-0 offer, which is true (it never scanned). */
export interface SaveV19 extends Omit<SaveV18, 'version'> {
  version: 19;
}

/** v20 adds the Marmot's TIP JAR fill (GS-tent-tips): a running total of balls the Marmot has pocketed
 *  from trade tents, drawn as golf balls in the 19th-Hole tip jar. It ACCUMULATES across runs (never
 *  reset per run); the clubhouse renders the fill-to-a-half-dozen-then-cash-out cycle off `marmotTips %
 *  (CAP + 1)`, and on the cash-out visit the Marmot slips off to play the spaceport par-3 (bar + jar
 *  empty). Seeded at 0 for existing saves — the count is earned in play, never granted retroactively. */
export interface SaveV20 extends Omit<SaveV19, 'version'> {
  version: 20;
  /** Running total of balls the Marmot has pocketed — the tip jar's fill cycles off it (GS-tent-tips). */
  marmotTips: number;
}

/** v21 adds character-specific caddy-faction REPUTATION (GS-caddy-factions): hiring a caddy earns
 *  standing with their faction, firing one burns it. Hidden groundwork — persisted + moved by the
 *  reducer, but nothing in the UI reads it yet. Seeded empty for existing saves (earned in play). The
 *  in-progress-run snapshot also gains an optional `firedCaddies` list, absent on old runs (nobody
 *  fired). */
export interface SaveV21 extends Omit<SaveV20, 'version'> {
  version: 21;
  /** characterId → factionId → reputation. Empty until a caddy is hired/fired. */
  reputationByCharacter: ReputationByCharacter;
}

/** v22 adds the per-character cosmetic DRIVER equip map (GS-thor): the new 'driver' apparel slot — the
 *  club skin each golfer swings (e.g. Thor's Hammer), outfitted in the Clubhouse like hat/shirt/pants/bag.
 *  Seeded empty for existing saves (the driver is earned, never granted retroactively). */
export type SaveV22 = Omit<SaveV21, 'version'> & {
  version: 22;
  /** The cosmetic driver each character swings (GS-thor): characterId → apparel id ('driver' slot).
   *  Absent → the plain club head. Outfitted in the Clubhouse like the other slots. */
  driverByCharacter: Record<string, string>;
};

/** v23 adds the per-golfer starting bag-tier map (GS-wardrobe-bagtier): each golfer's chosen
 *  Unending-Universe difficulty, picked in the Clubhouse wardrobe's bag slot. Absent → the owned
 *  `bagTier` (the best unlocked bag). Seeded empty for existing saves (everyone follows the owned tier
 *  until they pick otherwise). */
export type SaveV23 = Omit<SaveV22, 'version'> & {
  version: 23;
  /** characterId → BagTier. Absent entry → the owned `bagTier`. Clamped to the owned tier at read time. */
  bagTierByCharacter: Record<string, BagTier>;
};

/** v24 stamps the resumable-run FINISHED-STOP HISTORY (GS-voyage-field) onto the persisted shape:
 *  `RunSnapshot.history` (the completed `StopResult`s the positional cut, arc leaderboard and boss
 *  team-duel underdog side are computed from). Optional and absent on old data, so the migration is a
 *  pure version stamp; a pre-history run resumes with an empty history exactly as it did before the fix
 *  (still zeroing that resumed board — but no NEW save can carry the bug forward). */
export type SaveV24 = Omit<SaveV23, 'version'> & {
  version: 24;
};

/** v25 cuts every Trade Market price 40% (GS-trade-rebalance) and, on the migration, REFUNDS the
 *  difference on already-owned cosmetics + the owned bag tier straight into `shards` — plus stamps a
 *  one-off `priceRefund` notice so the game can tell the player about the change + the credit. The
 *  field is present only until the player dismisses the notice (then cleared); absent on new saves
 *  (`defaultSave` never sets it) and on returning players who owned nothing to refund. */
export type SaveV25 = Omit<SaveV24, 'version'> & {
  version: 25;
  /** Star Shards refunded by the 40% Trade Market price cut — drives the one-off "prices dropped, here's
   *  your refund" notice. Cleared to `undefined` once the player closes it. */
  priceRefund?: number;
};

/** v26 merges the two pirate factions into one (Space Pirates + Planet Pirates → Space Bandits). The
 *  only persisted trace of either is a per-character REPUTATION key, so the migration folds any
 *  `space-pirates` + `planet-pirates` standing into `space-bandits` (summing them) and drops the dead
 *  keys — a returning player keeps the (hidden) crew standing they'd built. Pure version stamp for any
 *  save that never courted a pirate crew. Shape is unchanged (reputation is a free-form id→number map). */
export type SaveV26 = Omit<SaveV25, 'version'> & {
  version: 26;
};

/** v27 adds the STAR TOUR personal course-record leaderboards (GS-star-tour): the player's best-ever
 *  18-hole stroke-play round on EACH static course, keyed by course id. Drives both Star Tour boards
 *  (per-course best + best rounds overall). Seeded empty for existing saves — records are earned in
 *  play, never granted. Purely additive; existing fields untouched. */
export type SaveV27 = Omit<SaveV26, 'version'> & {
  version: 27;
  /** courseId → the best round ever finished on that course. A course's record is only ever replaced by
   *  a better one, never evicted. Empty until the first Star Tour round is played. */
  strokePlayBest: StrokePlayBest;
};

/** v28 adds the LORE progress set (GS-lore): the ids of one-off story beats the player has already
 *  seen, so each fires exactly once ever (across every run + mode). Seeded empty for existing saves —
 *  a returning player is simply eligible for any beat they haven't hit yet. Purely additive. */
export type SaveV28 = Omit<SaveV27, 'version'> & {
  version: 28;
  /** id → true for every lore event already shown. */
  seenLore: SeenLore;
};

/** v29 stamps STAR TOUR mid-round resume (GS-star-tour-resume) onto the persisted shape: the in-progress
 *  stroke-play round now carries its completed scorecard + the hole reached (`RunSnapshot.stopHoleIndex` +
 *  `stopPlayed`), so a parked Star Tour round continues from where it left off instead of restarting from
 *  the 1st tee. Both fields are optional and absent on every pre-v29 / non-strokeplay save, so the
 *  migration is a pure version stamp — an old parked round simply resumes the pre-fix way (restart the
 *  stop). Shape is unchanged (they live on the opaque `activeRun` snapshot, passed through untouched). */
export type SaveV29 = Omit<SaveV28, 'version'> & {
  version: 29;
};

/** v30 adds the PERMANENT Star Tour unlock (GS-story-startour-unlock): once the Story Tour finale has
 *  been won even once, the free-roam records chase stays available forever — starting a NEW campaign
 *  (which resets the campaign's own `completed` flag) no longer relocks it. Distinct from `strokePlayBest`
 *  (the records) and the campaign save (`gs_story`); this lives on the main save so it outlives any single
 *  campaign. Seeded false for existing saves and backfilled from a live completed campaign at boot. */
export type SaveV30 = Omit<SaveV29, 'version'> & {
  version: 30;
  /** The Story Tour campaign has been completed at least once → Star Tour is permanently available. */
  starTourUnlocked: boolean;
};

/** v31 stamps the STAR TOUR CHAMPION mark (GS-story-startour-champions) onto banked course records: a
 *  `StrokePlayRecord` now carries an optional `champion` flag saying the round was played by a finished
 *  Story Tour protagonist with the loadout they finished with. It is DESCRIPTIVE — ranking, board keying
 *  and `isBetterStroke` are all untouched — so the migration is a pure version stamp. Old records simply
 *  lack the flag, which reads as "we don't know", the honest answer for a round banked before the mark
 *  existed. */
export type SaveV31 = Omit<SaveV30, 'version'> & {
  version: 31;
};

/** v32 adds the LIFETIME ROOT TALLY (GS-startour-serpent-trophy): every Star Tour encounter with the
 *  serpent at the root of Yggdrasil now counts — `serpentBouts` (every one resolved) and `serpentWins`
 *  (every one taken), the key to the secret **Beaten into Submission** achievement at 1,000 wins. It
 *  lives on the MAIN save rather than `gs_story` on purpose: one campaign per golfer means a slot can
 *  be started over, and a thousand-fight grind that a golfer pick could erase is one nobody would run.
 *  Seeded at 0 for existing saves — the count is earned in play, never granted retroactively (a player
 *  who has already replayed the root a hundred times starts from zero, which is the same rule every
 *  other tally in the game has shipped under). */
export type SaveV32 = Omit<SaveV31, 'version'> & {
  version: 32;
  /** Root encounters resolved, won or lost — the honest denominator. */
  serpentBouts: number;
  /** Root encounters WON — the achievement gate. */
  serpentWins: number;
};

/** The current save shape (alias so call sites don't pin a version number). */
export type Save = SaveV32;

export function defaultSave(): Save {
  return {
    version: SAVE_VERSION,
    bestStableford: 0,
    bestDistance: 0,
    shards: 0,
    metaUpgrades: {},
    maxAscension: 0,
    maxAscensionByCharacter: {},
    lifetimeAces: 0,
    ownedShips: [DEFAULT_SHIP_ID],
    ownedApparel: [],
    shipByCharacter: {},
    hatByCharacter: {},
    shirtByCharacter: {},
    pantsByCharacter: {},
    golfBagByCharacter: {},
    driverByCharacter: {},
    bagTier: 'common',
    bagTierByCharacter: {},
    unlockedClubsByCharacter: {},
    clubhouseVisit: 0,
    endlessBestHoles: 0,
    marmotBartender: false,
    marmotTips: 0,
    endlessRuns: [],
    reputationByCharacter: {},
    strokePlayBest: {},
    seenLore: {},
    starTourUnlocked: false,
    serpentBouts: 0,
    serpentWins: 0,
  };
}

/** v1 → v2: fold the loose run fields into the new shape. */
function v1ToV2(s: SaveV1): SaveV2 {
  return {
    version: 2,
    credits: s.credits ?? 0,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.distanceFromStart ?? 0,
    activeRun:
      s.runSeed !== undefined
        ? {
            seed: s.runSeed,
            stopIndex: 0,
            distanceFromStart: s.distanceFromStart ?? 0,
            credits: s.credits ?? 0,
            perks: [],
          }
        : undefined,
    savedAt: s.savedAt,
  };
}

/** v2 → v3: drop the dead `credits` field, seed empty meta-progression. */
function v2ToV3(s: SaveV2): SaveV3 {
  return {
    version: 3,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: 0,
    metaUpgrades: {},
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v3 → v4: seed the Ascension ladder at 0 (nothing unlocked yet). */
function v3ToV4(s: SaveV3): SaveV4 {
  return {
    version: 4,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: 0,
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v4 → v5: seed the lifetime ace tally at 0 (no aces recorded yet). */
function v4ToV5(s: SaveV4): SaveV5 {
  return {
    version: 5,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: s.maxAscension ?? 0,
    lifetimeAces: 0,
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v5 → v6: seed the cosmetic fleet (own just the default wagon) + a fresh market seed. */
function v5ToV6(s: SaveV5): SaveV6 {
  return {
    version: 6,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: s.maxAscension ?? 0,
    lifetimeAces: s.lifetimeAces ?? 0,
    ownedShips: [DEFAULT_SHIP_ID],
    selectedShip: DEFAULT_SHIP_ID,
    marketSeed: 0,
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v6 → v7: seed an empty wardrobe (no apparel owned, character-default look). */
function v6ToV7(s: SaveV6): SaveV7 {
  return {
    version: 7,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: s.maxAscension ?? 0,
    lifetimeAces: s.lifetimeAces ?? 0,
    ownedShips: s.ownedShips && s.ownedShips.length ? s.ownedShips : [DEFAULT_SHIP_ID],
    selectedShip: s.selectedShip ?? DEFAULT_SHIP_ID,
    marketSeed: s.marketSeed ?? 0,
    ownedApparel: [],
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v7 → v8: seed the un-upgraded common default-bag tier (nothing bought yet). */
function v7ToV8(s: SaveV7): SaveV8 {
  return {
    version: 8,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: s.maxAscension ?? 0,
    lifetimeAces: s.lifetimeAces ?? 0,
    ownedShips: s.ownedShips && s.ownedShips.length ? s.ownedShips : [DEFAULT_SHIP_ID],
    selectedShip: s.selectedShip ?? DEFAULT_SHIP_ID,
    marketSeed: s.marketSeed ?? 0,
    ownedApparel: s.ownedApparel ?? [],
    equippedHat: s.equippedHat,
    equippedShirt: s.equippedShirt,
    bagTier: 'common',
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v8 → v9: seed an empty per-character club-unlock map (no ascension-victory clubs won yet). */
function v8ToV9(s: SaveV8): SaveV9 {
  return {
    version: 9,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: s.maxAscension ?? 0,
    lifetimeAces: s.lifetimeAces ?? 0,
    ownedShips: s.ownedShips && s.ownedShips.length ? s.ownedShips : [DEFAULT_SHIP_ID],
    selectedShip: s.selectedShip ?? DEFAULT_SHIP_ID,
    marketSeed: s.marketSeed ?? 0,
    ownedApparel: s.ownedApparel ?? [],
    equippedHat: s.equippedHat,
    equippedShirt: s.equippedShirt,
    bagTier: s.bagTier ?? 'common',
    unlockedClubsByCharacter: {},
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v9 → v10: split cosmetics per character. The old GLOBAL ship/hat/shirt selection is seeded onto
 *  EVERY character so an existing player's look is preserved exactly (each golfer starts in the ship +
 *  outfit they last flew/wore), then they can diverge per character. The retired `marketSeed` is dropped. */
function v9ToV10(s: SaveV9): SaveV10 {
  const ship = s.selectedShip && s.selectedShip !== DEFAULT_SHIP_ID ? s.selectedShip : undefined;
  const shipByCharacter: Record<string, string> = {};
  const hatByCharacter: Record<string, string> = {};
  const shirtByCharacter: Record<string, string> = {};
  for (const ch of CHARACTERS) {
    if (ship) shipByCharacter[ch.id] = ship;
    if (s.equippedHat) hatByCharacter[ch.id] = s.equippedHat;
    if (s.equippedShirt) shirtByCharacter[ch.id] = s.equippedShirt;
  }
  return {
    version: 10,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: s.maxAscension ?? 0,
    lifetimeAces: s.lifetimeAces ?? 0,
    ownedShips: s.ownedShips && s.ownedShips.length ? s.ownedShips : [DEFAULT_SHIP_ID],
    ownedApparel: s.ownedApparel ?? [],
    shipByCharacter,
    hatByCharacter,
    shirtByCharacter,
    bagTier: s.bagTier ?? 'common',
    unlockedClubsByCharacter: s.unlockedClubsByCharacter ?? {},
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v10 → v11: seed an empty per-character pants map (no pants equipped yet; existing owned apparel,
 *  ships, hats & shirts are preserved untouched). */
function v10ToV11(s: SaveV10): SaveV11 {
  return {
    version: 11,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: s.maxAscension ?? 0,
    lifetimeAces: s.lifetimeAces ?? 0,
    ownedShips: s.ownedShips && s.ownedShips.length ? s.ownedShips : [DEFAULT_SHIP_ID],
    ownedApparel: s.ownedApparel ?? [],
    shipByCharacter: s.shipByCharacter ?? {},
    hatByCharacter: s.hatByCharacter ?? {},
    shirtByCharacter: s.shirtByCharacter ?? {},
    pantsByCharacter: {},
    bagTier: s.bagTier ?? 'common',
    unlockedClubsByCharacter: s.unlockedClubsByCharacter ?? {},
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v11 → v12: seed the Clubhouse-lounge shuffle counter at zero (the default arrangement); everything
 *  else is preserved untouched. */
function v11ToV12(s: SaveV11): SaveV12 {
  return {
    version: 12,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: s.maxAscension ?? 0,
    lifetimeAces: s.lifetimeAces ?? 0,
    ownedShips: s.ownedShips && s.ownedShips.length ? s.ownedShips : [DEFAULT_SHIP_ID],
    ownedApparel: s.ownedApparel ?? [],
    shipByCharacter: s.shipByCharacter ?? {},
    hatByCharacter: s.hatByCharacter ?? {},
    shirtByCharacter: s.shirtByCharacter ?? {},
    pantsByCharacter: s.pantsByCharacter ?? {},
    bagTier: s.bagTier ?? 'common',
    unlockedClubsByCharacter: s.unlockedClubsByCharacter ?? {},
    clubhouseVisit: 0,
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v12 → v13: seed the Unending-Universe progress at zero + an empty per-character bag map;
 *  everything else is preserved untouched. */
function v12ToV13(s: SaveV12): SaveV13 {
  return {
    version: 13,
    bestStableford: s.bestStableford ?? 0,
    bestDistance: s.bestDistance ?? 0,
    shards: s.shards ?? 0,
    metaUpgrades: s.metaUpgrades ?? {},
    maxAscension: s.maxAscension ?? 0,
    lifetimeAces: s.lifetimeAces ?? 0,
    ownedShips: s.ownedShips && s.ownedShips.length ? s.ownedShips : [DEFAULT_SHIP_ID],
    ownedApparel: s.ownedApparel ?? [],
    shipByCharacter: s.shipByCharacter ?? {},
    hatByCharacter: s.hatByCharacter ?? {},
    shirtByCharacter: s.shirtByCharacter ?? {},
    pantsByCharacter: s.pantsByCharacter ?? {},
    golfBagByCharacter: {},
    bagTier: s.bagTier ?? 'common',
    unlockedClubsByCharacter: s.unlockedClubsByCharacter ?? {},
    clubhouseVisit: s.clubhouseVisit ?? 0,
    endlessBestHoles: 0,
    activeRun: s.activeRun,
    savedAt: s.savedAt,
  };
}

/** v13 → v14: seed each character's personal Ascension-clear ladder empty. Existing golfers start at
 *  zero and earn their first per-character club on their next new clear — nobody is retroactively
 *  granted or locked out. Everything else is preserved. */
function v13ToV14(s: SaveV13): SaveV14 {
  return { ...s, version: 14, maxAscensionByCharacter: {} };
}

/** v14 → v15: nobody has the Marmot Bartender yet — it's earned in play, so start locked. */
function v14ToV15(s: SaveV14): SaveV15 {
  return { ...s, version: 15, marmotBartender: false };
}

/** v15 → v16: no endless runs recorded yet — the history starts empty and fills as runs finish. */
function v15ToV16(s: SaveV15): SaveV16 {
  return { ...s, version: 16, endlessRuns: [] };
}

/** v16 → v17: pure version stamp — warp's fields (`startHole`, `warpedThrough`) are optional and
 *  absent on every pre-warp save, which correctly reads as "never warped". */
function v16ToV17(s: SaveV16): SaveV17 {
  return { ...s, version: 17 };
}

/** v17 → v18: pure version stamp — the fuel field (`RunSnapshot.fuel`) is optional and absent on
 *  every pre-fuel save; `resumeRun` grants such a run the format's fresh starting tank. */
function v17ToV18(s: SaveV17): SaveV18 {
  return { ...s, version: 18 };
}

/** v18 → v19: pure version stamp — the sector-scan field (`RunSnapshot.routeScans`) is optional and
 *  absent on every pre-scan save; `resumeRun` reads that as the classic scan-0 lane offer. */
function v18ToV19(s: SaveV18): SaveV19 {
  return { ...s, version: 19 };
}

/** v19 → v20: the tip jar starts empty — nobody has a run-worth of pocketed balls recorded yet, so the
 *  count seeds at 0 (an unlocked Marmot Bartender simply gets an empty "Tips" jar until it pockets more). */
function v19ToV20(s: SaveV19): SaveV20 {
  return { ...s, version: 20, marmotTips: 0 };
}

/** v20 → v21: nobody has courted a faction yet — reputation starts empty and is earned in play by
 *  hiring/firing caddies. */
function v20ToV21(s: SaveV20): SaveV21 {
  return { ...s, version: 21, reputationByCharacter: {} };
}

/** v21 → v22: seed an empty per-character driver map — nobody has earned a cosmetic driver (Thor's
 *  Hammer) yet; it's won on Asgard, never granted retroactively. */
function v21ToV22(s: SaveV21): SaveV22 {
  return { ...s, version: 22, driverByCharacter: {} };
}

/** v22 → v23: seed an empty per-golfer bag-tier map — every golfer follows the owned bag tier until the
 *  player picks a per-golfer difficulty in the wardrobe (GS-wardrobe-bagtier). */
function v22ToV23(s: SaveV22): SaveV23 {
  return { ...s, version: 23, bagTierByCharacter: {} };
}

/** v23 → v24: pure version stamp — the finished-stop history (`RunSnapshot.history`) is optional and
 *  absent on every pre-history save; `resumeRun` reads that as an empty history (the pre-fix behaviour,
 *  which zeroed a resumed run's arc board). */
function v23ToV24(s: SaveV23): SaveV24 {
  return { ...s, version: 24 };
}

/** The Trade Market prices BEFORE the GS-trade-rebalance 40% cut — snapshotted here so the refund is
 *  computed against the historical prices, immune to any future price edit to the live catalogues. The
 *  live catalogues are used only to identify which owned ids exist / were earned (never bought) / their
 *  rarity — none of which the price cut changed. */
const OLD_APPAREL_TIER_COST: Record<CosmeticRarity, number> = { common: 15, rare: 50, epic: 120, legendary: 280, mythic: 500 };
const OLD_SHIP_TIER_COST: Record<CosmeticRarity, number> = { common: 0, rare: 60, epic: 140, legendary: 300, mythic: 1000 };
const OLD_SHIP_COST_BY_ID: Record<string, number> = { 'chopper-thunderbolt': 1250 };
const OLD_BAG_COST: Record<Exclude<BagTier, 'common'>, number> = { rare: 500, epic: 2000, legendary: 10000 };
/** The refund on one item = 40% of its old price (= old − new after the 40% cut). All current prices
 *  divide cleanly, so this is an exact integer. */
const priceRefundOf = (oldCost: number): number => Math.round(oldCost * 0.4);

/** v24 → v25: cut the Trade Market 40% and refund the difference on everything the player already owns
 *  (cosmetics + the owned bag tier) into `shards`, stamping a one-off `priceRefund` notice. Earned/free
 *  rides & garments (live `cost === 0`) are skipped — they were never paid for. A player who owned
 *  nothing gets no refund and no notice (`priceRefund` stays absent). Runs exactly once (the migration
 *  is version-gated), so the credit can't double-apply. */
function v24ToV25(s: SaveV24): SaveV25 {
  let refund = 0;
  for (const id of s.ownedShips ?? []) {
    const ship = SHIPS.find((x) => x.id === id);
    if (!ship || ship.cost === 0) continue; // default wagon / earned aces — free, nothing to refund
    refund += priceRefundOf(OLD_SHIP_COST_BY_ID[id] ?? OLD_SHIP_TIER_COST[ship.rarity]);
  }
  for (const id of s.ownedApparel ?? []) {
    const item = APPAREL.find((x) => x.id === id);
    if (!item || item.cost === 0) continue; // earned/secret garments (e.g. Thor's Hammer) — never bought
    refund += priceRefundOf(OLD_APPAREL_TIER_COST[item.rarity]);
  }
  if (s.bagTier && s.bagTier !== 'common') refund += priceRefundOf(OLD_BAG_COST[s.bagTier]);
  return {
    ...s,
    version: 25,
    shards: (s.shards ?? 0) + refund,
    priceRefund: refund > 0 ? refund : undefined,
  };
}

/** The retired pirate faction ids and the merged id they fold into (v26 — Space Bandits merge). Named
 *  here so the migration is immune to any later rename of the live faction rows. */
const MERGED_PIRATE_IDS = ['space-pirates', 'planet-pirates'] as const;
const SPACE_BANDITS_ID = 'space-bandits';

/** v25 → v26: merge the two pirate factions' per-character reputation into `space-bandits`. For each
 *  character, sum any `space-pirates` + `planet-pirates` standing onto `space-bandits` and drop the old
 *  keys. A character who never courted a pirate crew is untouched; the rest of the save is preserved. */
function v25ToV26(s: SaveV25): SaveV26 {
  const merged: ReputationByCharacter = {};
  for (const [charId, factions] of Object.entries(s.reputationByCharacter ?? {})) {
    const next: Record<string, number> = {};
    let banditRep = 0;
    for (const [factionId, rep] of Object.entries(factions ?? {})) {
      if ((MERGED_PIRATE_IDS as readonly string[]).includes(factionId)) banditRep += rep;
      else next[factionId] = rep;
    }
    // Fold the summed pirate standing onto any existing space-bandits standing (there won't be one on a
    // real v25 save, but be defensive against an edited/forward-stamped blob).
    if (banditRep !== 0 || SPACE_BANDITS_ID in next) {
      next[SPACE_BANDITS_ID] = (next[SPACE_BANDITS_ID] ?? 0) + banditRep;
    }
    merged[charId] = next;
  }
  return { ...s, version: 26, reputationByCharacter: merged };
}

/** v26 → v27: seed an empty Star Tour course-record map — no rounds played yet; records are earned in
 *  play. Everything else is preserved untouched. */
function v26ToV27(s: SaveV26): SaveV27 {
  return { ...s, version: 27, strokePlayBest: {} };
}

/** v27 → v28: seed an empty lore-progress set — no story beats seen yet. Everything else preserved. */
function v27ToV28(s: SaveV27): SaveV28 {
  return { ...s, version: 28, seenLore: {} };
}

/** v28 → v29: pure version stamp — the Star Tour mid-round-resume fields (`RunSnapshot.stopHoleIndex` +
 *  `stopPlayed`) are optional and absent on every pre-v29 save; such a parked round resumes by restarting
 *  the stop, exactly as it did before the feature. */
function v28ToV29(s: SaveV28): SaveV29 {
  return { ...s, version: 29 };
}

/** v29 → v30: seed the permanent Star Tour unlock (GS-story-startour-unlock) as NOT-yet-earned. The
 *  flag is set true the moment the Story Tour finale is first won, and — unlike the campaign's own
 *  `completed` flag (wiped when a NEW campaign begins) — it survives forever, so starting a fresh
 *  campaign never relocks the free-roam reward. A returning player mid-completed-campaign has the flag
 *  seeded at boot from their live `gs_story` (`storyComplete`), so nobody who already earned it loses it. */
function v29ToV30(s: SaveV29): SaveV30 {
  return { ...s, version: 30, starTourUnlocked: false };
}

/** v30 → v31: a pure version stamp. `StrokePlayRecord.champion` is optional and purely descriptive, so
 *  every existing record stays exactly as banked — unmarked, which is the honest reading of a round
 *  played before the game recorded whether a champion set it. Nothing about ranking changes. */
function v30ToV31(s: SaveV30): SaveV31 {
  return { ...s, version: 31 };
}

/** v31 → v32: seed the root tally at zero (GS-startour-serpent-trophy). Nothing is granted for replays
 *  fought before the game counted them — the same rule `lifetimeAces` and the endless-hole ladder ship
 *  under — and the very next root win begins the count. */
function v31ToV32(s: SaveV31): SaveV32 {
  return { ...s, version: 32, serpentBouts: 0, serpentWins: 0 };
}

/**
 * Migrate an unknown persisted blob up to the current version, one step at a time. Each
 * future version bump adds another `if (s.version === N)` step in sequence.
 */
export function migrate(raw: unknown): Save {
  if (!raw || typeof raw !== 'object') return defaultSave();
  let s = raw as { version?: number } & Record<string, unknown>;

  if (s.version === 1) s = v1ToV2(s as unknown as SaveV1) as unknown as typeof s;
  if (s.version === 2) s = v2ToV3(s as unknown as SaveV2) as unknown as typeof s;
  if (s.version === 3) s = v3ToV4(s as unknown as SaveV3) as unknown as typeof s;
  if (s.version === 4) s = v4ToV5(s as unknown as SaveV4) as unknown as typeof s;
  if (s.version === 5) s = v5ToV6(s as unknown as SaveV5) as unknown as typeof s;
  if (s.version === 6) s = v6ToV7(s as unknown as SaveV6) as unknown as typeof s;
  if (s.version === 7) s = v7ToV8(s as unknown as SaveV7) as unknown as typeof s;
  if (s.version === 8) s = v8ToV9(s as unknown as SaveV8) as unknown as typeof s;
  if (s.version === 9) s = v9ToV10(s as unknown as SaveV9) as unknown as typeof s;
  if (s.version === 10) s = v10ToV11(s as unknown as SaveV10) as unknown as typeof s;
  if (s.version === 11) s = v11ToV12(s as unknown as SaveV11) as unknown as typeof s;
  if (s.version === 12) s = v12ToV13(s as unknown as SaveV12) as unknown as typeof s;
  if (s.version === 13) s = v13ToV14(s as unknown as SaveV13) as unknown as typeof s;
  if (s.version === 14) s = v14ToV15(s as unknown as SaveV14) as unknown as typeof s;
  if (s.version === 15) s = v15ToV16(s as unknown as SaveV15) as unknown as typeof s;
  if (s.version === 16) s = v16ToV17(s as unknown as SaveV16) as unknown as typeof s;
  if (s.version === 17) s = v17ToV18(s as unknown as SaveV17) as unknown as typeof s;
  if (s.version === 18) s = v18ToV19(s as unknown as SaveV18) as unknown as typeof s;
  if (s.version === 19) s = v19ToV20(s as unknown as SaveV19) as unknown as typeof s;
  if (s.version === 20) s = v20ToV21(s as unknown as SaveV20) as unknown as typeof s;
  if (s.version === 21) s = v21ToV22(s as unknown as SaveV21) as unknown as typeof s;
  if (s.version === 22) s = v22ToV23(s as unknown as SaveV22) as unknown as typeof s;
  if (s.version === 23) s = v23ToV24(s as unknown as SaveV23) as unknown as typeof s;
  if (s.version === 24) s = v24ToV25(s as unknown as SaveV24) as unknown as typeof s;
  if (s.version === 25) s = v25ToV26(s as unknown as SaveV25) as unknown as typeof s;
  if (s.version === 26) s = v26ToV27(s as unknown as SaveV26) as unknown as typeof s;
  if (s.version === 27) s = v27ToV28(s as unknown as SaveV27) as unknown as typeof s;
  if (s.version === 28) s = v28ToV29(s as unknown as SaveV28) as unknown as typeof s;
  if (s.version === 29) s = v29ToV30(s as unknown as SaveV29) as unknown as typeof s;
  if (s.version === 30) s = v30ToV31(s as unknown as SaveV30) as unknown as typeof s;
  if (s.version === 31) s = v31ToV32(s as unknown as SaveV31) as unknown as typeof s;

  if (s.version !== SAVE_VERSION) {
    // Unknown / unsupported version: start clean rather than guess at a shape.
    return defaultSave();
  }

  // Defensive backfill so a partial blob can't crash the loader.
  const v14 = s as unknown as Partial<SaveV32>;
  const ownedShips = v14.ownedShips && v14.ownedShips.length ? v14.ownedShips : [DEFAULT_SHIP_ID];
  const ownedApparel = v14.ownedApparel ?? [];
  const bagTier: BagTier = v14.bagTier ?? 'common';
  // Drop any per-character equip that references an unowned item (so a stale/edited blob can't show a
  // ship/garment the player doesn't actually own).
  const sanitize = (m: Record<string, string> | undefined, owned: string[]): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [id, item] of Object.entries(m ?? {})) if (owned.includes(item)) out[id] = item;
    return out;
  };
  return {
    version: SAVE_VERSION,
    bestStableford: v14.bestStableford ?? 0,
    bestDistance: v14.bestDistance ?? 0,
    shards: v14.shards ?? 0,
    metaUpgrades: v14.metaUpgrades ?? {},
    maxAscension: v14.maxAscension ?? 0,
    maxAscensionByCharacter: v14.maxAscensionByCharacter ?? {},
    lifetimeAces: v14.lifetimeAces ?? 0,
    ownedShips,
    ownedApparel,
    shipByCharacter: sanitize(v14.shipByCharacter, ownedShips),
    hatByCharacter: sanitize(v14.hatByCharacter, ownedApparel),
    shirtByCharacter: sanitize(v14.shirtByCharacter, ownedApparel),
    pantsByCharacter: sanitize(v14.pantsByCharacter, ownedApparel),
    golfBagByCharacter: sanitize(v14.golfBagByCharacter, ownedApparel),
    driverByCharacter: sanitize(v14.driverByCharacter, ownedApparel),
    bagTier,
    bagTierByCharacter:
      v14.bagTierByCharacter && typeof v14.bagTierByCharacter === 'object' ? v14.bagTierByCharacter : {},
    unlockedClubsByCharacter: v14.unlockedClubsByCharacter ?? {},
    clubhouseVisit: v14.clubhouseVisit ?? 0,
    endlessBestHoles: v14.endlessBestHoles ?? 0,
    marmotBartender: v14.marmotBartender ?? false,
    marmotTips: v14.marmotTips ?? 0,
    endlessRuns: Array.isArray(v14.endlessRuns) ? v14.endlessRuns : [],
    reputationByCharacter:
      v14.reputationByCharacter && typeof v14.reputationByCharacter === 'object' ? v14.reputationByCharacter : {},
    strokePlayBest:
      v14.strokePlayBest && typeof v14.strokePlayBest === 'object' ? v14.strokePlayBest : {},
    seenLore: v14.seenLore && typeof v14.seenLore === 'object' ? v14.seenLore : {},
    starTourUnlocked: v14.starTourUnlocked === true,
    // GS-startour-serpent-trophy: the lifetime root tally. Defensively floored + integerised — a
    // hand-edited or truncated blob must not hand out (or hide) the thousand-win grail on a NaN.
    serpentBouts: Math.max(0, Math.floor(Number(v14.serpentBouts) || 0)),
    serpentWins: Math.max(0, Math.floor(Number(v14.serpentWins) || 0)),
    priceRefund: typeof v14.priceRefund === 'number' && v14.priceRefund > 0 ? v14.priceRefund : undefined,
    activeRun: v14.activeRun,
    savedAt: v14.savedAt,
  };
}

/** Serialise a save to a JSON string (the export path). */
export function exportSave(save: Save): string {
  return JSON.stringify(save, null, 2);
}

/** Parse + migrate a JSON string into a valid Save (the import path). */
export function importSave(json: string): Save {
  try {
    return migrate(JSON.parse(json));
  } catch {
    return defaultSave();
  }
}
