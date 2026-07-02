/**
 * Route events — the risk/reward CHARACTER of a jump (GS-14, rebalanced GS-routes).
 *
 * Travel used to differ only by distance. A roguelite lives or dies on the *choice* at each node,
 * so every onward route carries an EVENT: a themed, content-as-data modifier on the stop you fly
 * INTO. The original two levers (credits ×, cut Δ) made every lane the same shape — "a bit more pay
 * for a bit more cut" — so a green common often beat a rare. The rebalance fixes that on two fronts:
 *
 *   1. FOUR pure levers so lanes are functionally DISTINCT, with REAL downsides (no free lunch):
 *      • `creditMult` — scales the credits earned at the stop (the per-run currency).
 *      • `cutDelta`   — shifts that stop's cut line (the fail-gate risk).
 *      • `creditToll` — credits paid UP FRONT on travel (a genuine cost — the rich lanes bite back).
 *      • `shardBonus` — permanent shards banked on travel, kept even if you then bust (the meta /
 *        "banker" lane — guaranteed progress traded for a poor per-run payout).
 *      Calm lanes are now SAFE-BUT-POOR (creditMult ≤ ~1.05): safety costs you payout, so a common
 *      is a different proposition from a rare, never a strictly-better one.
 *
 *   2. RARITY = STAKES. The reward CEILING rises monotonically with rarity (common → small, rare →
 *      moderate, epic → big, legendary → jackpot) and so does the risk, so courting a rare/epic is a
 *      real gamble, not a strict upgrade. The per-arc SLOT draw (`drawArcRouteEvents`) then controls
 *      how often each rarity shows up: gentle commons early, rares/epics/legendaries deep.
 *
 * Two kinds, mirroring the catalogue:
 *   • RECURRING (`ROUTE_EVENTS`) — the backbone, drawn every jump, `minArc`-tiered (calm drifts early,
 *     flares/quasars late).
 *   • UNIQUE (`UNIQUE_EVENTS`) — one-off dated showpieces (eclipses, the Apophis flyby): the richest,
 *     deadliest lanes, gated to the deep arc and offered AT MOST ONCE per run (the run tracks fired ids).
 *
 * Fairness by construction: events touch ONLY the economy/cut/meta, never course generation — so the
 * no-death-spiral + fairness validators are untouched. `drawArcRouteEvents` guarantees at least one
 * lower-risk OUT every jump, so a node is never an all-or-nothing trap.
 */

import { Rng } from '../rng';
import type { Rarity } from '../course/contract';
import { RARITY_C, RARITIES } from './loot';
import { arcForDistance, type Arc } from '../course/themes';

/** Functional family of a lane — drives the card's accent + icon + how it READS. Content-as-data. */
export type EventCategory =
  | 'calm' //   safe but poor — an OUT (cut ≤ 0, modest pay)
  | 'payout' // the classic gamble — more credits for a higher cut
  | 'toll' //   pay credits up front for an outsized return (the rich lanes bite)
  | 'salvage'; // guaranteed permanent shards, traded for a poor per-run payout (the banker lane)

export interface RouteEvent {
  id: string;
  label: string;
  /** One-line effect summary, shown on the route card. */
  desc: string;
  /** Italic flavour / lore line — atmosphere, shown under the effect. */
  lore: string;
  /** Glyph shown big on the card + as the choice's planet on the starmap. */
  icon: string;
  /** Functional family — accent colour + grouping. */
  category: EventCategory;
  /** Loot grade — tints the route card AND gates the per-arc slot draw (rarer = scarcer & juicier). */
  rarity: Rarity;
  /** Multiplies credits earned at the stop reached by this route (1 = neutral). */
  creditMult: number;
  /** Added to that stop's cut line: >0 = harder to survive, <0 = easier (0 = neutral). */
  cutDelta: number;
  /** Credits paid UP FRONT on travel (a genuine cost — the rich/risky lanes charge admission). 0 = free. */
  creditToll?: number;
  /** Permanent shards banked on travel, kept even on a later bust (the meta/banker lane). 0 = none. */
  shardBonus?: number;
  /** Earliest arc this event can appear in (accents the arcs — high stakes come later). Default 1. */
  minArc?: Arc;
  /** A one-off dated event: offered at most once per run (tracked on the run). Default false. */
  unique?: boolean;
}

/** The neutral baseline — stop 0 (no jump yet) and any run without a pending event use this. */
export const DEFAULT_EVENT: RouteEvent = {
  id: 'open-space',
  label: 'Open Space',
  desc: 'Quiet vacuum. Nothing for, nothing against.',
  lore: 'The void hums. The wagon drifts on.',
  icon: '🛰️',
  category: 'calm',
  rarity: 'common',
  creditMult: 1,
  cutDelta: 0,
};

/**
 * Recurring events — the backbone, drawn every jump. Arc-tiered by `minArc` so the early game stays
 * gentle and the deep game turns deadly. Within each rarity the reward CEILING rises with the tier;
 * calm lanes are deliberately POOR so safety has a price.
 */
export const ROUTE_EVENTS: readonly RouteEvent[] = [
  // ============================================================================================
  // ARC 1 — available from the first jump (minArc 1). All mild: cutDelta ≤ 1 so the opener is gentle.
  // ============================================================================================

  // --- commons: the safe-but-poor OUTS + small treats ---
  {
    id: 'calm-drift',
    label: 'Calm Drift',
    desc: 'Cut −1 · credits −5%. Steady, modest pickings.',
    lore: 'A forgiving little system. Wide skies, thin wallets.',
    icon: '🌌',
    category: 'calm',
    rarity: 'common',
    creditMult: 0.95,
    cutDelta: -1,
    minArc: 1,
  },
  {
    id: 'new-moon',
    label: 'New Moon',
    desc: 'Cut −1. The read comes easy; the take is even.',
    lore: 'Dark, clear skies. You can see the line a mile off.',
    icon: '🌑',
    category: 'calm',
    rarity: 'common',
    creditMult: 1,
    cutDelta: -1,
    minArc: 1,
  },
  {
    id: 'stellar-tailwind',
    label: 'Stellar Tailwind',
    desc: 'Cut −1. A friendly current carries you in.',
    lore: 'The solar wind is at your back the whole way down.',
    icon: '🌬️',
    category: 'calm',
    rarity: 'common',
    creditMult: 1,
    cutDelta: -1,
    minArc: 1,
  },
  {
    id: 'quiet-vacuum',
    label: 'Quiet Vacuum',
    desc: 'Credits −10% · +1 shard. Scrounge a little salvage.',
    lore: 'Nothing out here but you and a few drifting offcuts.',
    icon: '🧊',
    category: 'salvage',
    rarity: 'common',
    creditMult: 0.9,
    cutDelta: 0,
    shardBonus: 1,
    minArc: 1,
  },
  {
    id: 'full-moon',
    label: 'Full Moon',
    desc: 'Credits +15%. A bright, generous night.',
    lore: 'The whole course glows silver. Easy to feel rich.',
    icon: '🌕',
    category: 'payout',
    rarity: 'common',
    creditMult: 1.15,
    cutDelta: 0,
    minArc: 1,
  },
  {
    id: 'meteor-drizzle',
    label: 'Meteor Drizzle',
    desc: 'Credits +25% · cut +1. A light shower, a light gamble.',
    lore: 'A scatter of streaks overhead. Pretty, and a touch tense.',
    icon: '☄️',
    category: 'payout',
    rarity: 'common',
    creditMult: 1.25,
    cutDelta: 1,
    minArc: 1,
  },
  {
    id: 'aurora-veil',
    label: 'Aurora Veil',
    desc: 'Cut −1. A calm curtain of light eases the read.',
    lore: 'Soft green light ripples across the canopy of space.',
    icon: '💫',
    category: 'calm',
    rarity: 'common',
    creditMult: 1,
    cutDelta: -1,
    minArc: 1,
  },
  {
    id: 'star-nursery',
    label: 'Star Nursery',
    desc: 'Credits +20%. A bright, fertile pocket of new suns.',
    lore: 'Young stars blaze in a cloud of glowing gas. Good hunting.',
    icon: '🌟',
    category: 'payout',
    rarity: 'common',
    creditMult: 1.2,
    cutDelta: 0,
    minArc: 1,
  },
  {
    id: 'debris-drift',
    label: 'Debris Drift',
    desc: 'Credits −8% · +1 shard. Pick the field clean.',
    lore: 'A slow tumble of old wreckage. Worth a poke if you’re patient.',
    icon: '🛰️',
    category: 'salvage',
    rarity: 'common',
    creditMult: 0.92,
    cutDelta: 0,
    shardBonus: 1,
    minArc: 1,
  },
  {
    id: 'frost-drift',
    label: 'Frost Drift',
    desc: 'Cut −1 · credits −5%. Cold, quiet, forgiving.',
    lore: 'Frost sifts down through dead-still air and freezes onto the fairways.',
    icon: '❄️',
    category: 'calm',
    rarity: 'common',
    creditMult: 0.95,
    cutDelta: -1,
    minArc: 1,
  },
  {
    id: 'stardust-wake',
    label: 'Stardust Wake',
    desc: 'Credits +15%. Fly the comet’s glittering wake.',
    lore: 'The tail dust settles in charged, shimmering drifts. The turf itself sparkles.',
    icon: '✨',
    category: 'payout',
    rarity: 'common',
    creditMult: 1.15,
    cutDelta: 0,
    minArc: 1,
  },
  {
    id: 'gravity-eddy',
    label: 'Gravity Eddy',
    desc: 'Credits +20%. A heavy little pocket of space.',
    lore: 'A dense stray moon parks itself overhead. Everything feels a club heavier.',
    icon: '🪐',
    category: 'payout',
    rarity: 'common',
    creditMult: 1.2,
    cutDelta: 0,
    minArc: 1,
  },

  // --- rares: scarce early treasure (mild risk) ---
  {
    id: 'trade-lane',
    label: 'Trade Lane',
    desc: 'Credits +35% · toll 10. Pay the lane fee, reap the trade.',
    lore: 'A busy shipping corridor. Everyone here is buying or selling.',
    icon: '🚚',
    category: 'toll',
    rarity: 'rare',
    creditMult: 1.35,
    cutDelta: 0,
    creditToll: 10,
    minArc: 1,
  },
  {
    id: 'ion-storm',
    label: 'Ion Storm',
    desc: 'Credits +40% · cut +1. Ride the charge.',
    lore: 'Sheets of blue fire crackle along the hull.',
    icon: '⚡',
    category: 'payout',
    rarity: 'rare',
    creditMult: 1.4,
    cutDelta: 1,
    minArc: 1,
  },

  // --- epic: a lucky early jackpot (rare to roll this early) ---
  {
    id: 'cosmic-jackpot',
    label: 'Cosmic Jackpot',
    desc: 'Credits +70% · cut +1. An early windfall.',
    lore: 'A glittering pocket of the galaxy nobody else has found yet.',
    icon: '💎',
    category: 'payout',
    rarity: 'epic',
    creditMult: 1.7,
    cutDelta: 1,
    minArc: 1,
  },

  // ============================================================================================
  // ARC 2 — the journey hardens (minArc 2). Bigger swings, the first brutal lanes.
  // ============================================================================================

  // --- rares ---
  {
    id: 'meteor-belt',
    label: 'Meteor Belt',
    desc: 'Credits +30% · cut +1. Rough passage.',
    lore: 'You thread the wagon through a churn of slow rock.',
    icon: '🪨',
    category: 'payout',
    rarity: 'rare',
    creditMult: 1.3,
    cutDelta: 1,
    minArc: 2,
  },
  {
    id: 'perseids',
    label: 'Perseid Stream',
    desc: 'Credits +40% · cut +1. A steady shower lights the lane.',
    lore: 'Old comet dust, burning bright on the way past.',
    icon: '🌠',
    category: 'payout',
    rarity: 'rare',
    creditMult: 1.4,
    cutDelta: 1,
    minArc: 2,
  },
  {
    id: 'asteroid-mining',
    label: 'Asteroid Claim',
    desc: 'Credits −10% · +4 shards. Bank the ore, whatever happens next.',
    lore: 'Stake a rock, work it dry. Slow money, but it’s yours forever.',
    icon: '⛏️',
    category: 'salvage',
    rarity: 'rare',
    creditMult: 0.9,
    cutDelta: 0,
    shardBonus: 4,
    minArc: 2,
  },
  {
    id: 'pulsar-wake',
    label: 'Pulsar Wake',
    desc: 'Credits +45% · cut +1. Surf the lighthouse beam.',
    lore: 'A dead star sweeps its beam past, ticking like a clock.',
    icon: '🌀',
    category: 'payout',
    rarity: 'rare',
    creditMult: 1.45,
    cutDelta: 1,
    minArc: 2,
  },
  {
    id: 'comet-fragment',
    label: 'Comet Fragment',
    desc: 'Credits −10% · +4 shards. Net the ice, bank it forever.',
    lore: 'A shard of a broken comet, dirty ice and frozen ore.',
    icon: '🔭',
    category: 'salvage',
    rarity: 'rare',
    creditMult: 0.9,
    cutDelta: 0,
    shardBonus: 4,
    minArc: 2,
  },
  {
    id: 'gravity-slingshot',
    label: 'Gravity Slingshot',
    desc: 'Credits +55% · cut +2. Whip around the giant.',
    lore: 'You fall toward the planet, screaming, and are flung out the far side.',
    icon: '🪐',
    category: 'payout',
    rarity: 'rare',
    creditMult: 1.55,
    cutDelta: 2,
    minArc: 2,
  },
  {
    id: 'hail-belt',
    label: 'Hail Belt',
    desc: 'Credits +35% · cut +1. Thread the frozen churn.',
    lore: 'A ring of dirty ice, glittering and grinding. It rimes everything it touches.',
    icon: '❄️',
    category: 'payout',
    rarity: 'rare',
    creditMult: 1.35,
    cutDelta: 1,
    minArc: 2,
  },
  {
    id: 'neutron-tide',
    label: 'Neutron Tide',
    desc: 'Credits +45% · cut +1. Ride the dead star’s pull.',
    lore: 'A spoonful of it outweighs your ship. The ball knows it, too.',
    icon: '🪐',
    category: 'payout',
    rarity: 'rare',
    creditMult: 1.45,
    cutDelta: 1,
    minArc: 2,
  },
  {
    id: 'comet-dust-run',
    label: 'Comet Dust Run',
    desc: 'Credits +40% · cut +1. Skim the glittering tail.',
    lore: 'Close enough to fly through the tail itself. The dust rains down after you.',
    icon: '☄️',
    category: 'payout',
    rarity: 'rare',
    creditMult: 1.4,
    cutDelta: 1,
    minArc: 2,
  },
  {
    id: 'cryo-harvest',
    label: 'Cryo Harvest',
    desc: 'Credits −10% · +4 shards. Mine the glacier moonlet.',
    lore: 'Ancient ice, clean as glass. It sells forever.',
    icon: '🧊',
    category: 'salvage',
    rarity: 'rare',
    creditMult: 0.9,
    cutDelta: 0,
    shardBonus: 4,
    minArc: 2,
  },
  {
    id: 'wreckers-claim',
    label: 'Wrecker’s Claim',
    desc: 'Credits −5% · +3 shards. Strip the debris field.',
    lore: 'Somebody’s fleet died here. Their loss, your salvage rights.',
    icon: '🛰️',
    category: 'salvage',
    rarity: 'rare',
    creditMult: 0.95,
    cutDelta: 0,
    shardBonus: 3,
    minArc: 2,
  },

  // --- epics ---
  {
    id: 'geminids',
    label: 'Geminid Storm',
    desc: 'Credits +50% · cut +1. The year’s richest shower.',
    lore: 'The sky tears itself apart with light.',
    icon: '✨',
    category: 'payout',
    rarity: 'epic',
    creditMult: 1.5,
    cutDelta: 1,
    minArc: 2,
  },
  {
    id: 'supermoon',
    label: 'Supermoon',
    desc: 'Credits +60% · cut +1. A swollen Moon floods the sky.',
    lore: 'It hangs huge and close, pulling the very tide of the course.',
    icon: '🌝',
    category: 'payout',
    rarity: 'epic',
    creditMult: 1.6,
    cutDelta: 1,
    minArc: 2,
  },
  {
    id: 'derelict-cache',
    label: 'Derelict Cache',
    desc: 'Credits +45% · cut +1 · +3 shards. A salvage haul.',
    lore: 'A dead freighter, holds still full. A tense, profitable boarding.',
    icon: '🛸',
    category: 'salvage',
    rarity: 'epic',
    creditMult: 1.45,
    cutDelta: 1,
    shardBonus: 3,
    minArc: 2,
  },
  {
    id: 'black-market',
    label: 'Black Market',
    desc: 'Credits +90% · cut +1 · toll 25. Pay the broker, double down.',
    lore: 'A station that isn’t on any chart. Bring credits; ask no questions.',
    icon: '🏴',
    category: 'toll',
    rarity: 'epic',
    creditMult: 1.9,
    cutDelta: 1,
    creditToll: 25,
    minArc: 2,
  },

  // --- legendary: an early-ish jackpot lane (very rare to roll in arc 2) ---
  {
    id: 'wandering-comet',
    label: 'Wandering Comet',
    desc: 'Credits +120% · cut +2 · +5 shards. Hitch the great tail.',
    lore: 'A lone comet on a thousand-year orbit. You will not pass it again.',
    icon: '☄️',
    category: 'payout',
    rarity: 'legendary',
    creditMult: 2.2,
    cutDelta: 2,
    shardBonus: 5,
    minArc: 2,
  },

  // ============================================================================================
  // ARC 3 — the deep voyage (minArc 3). High stakes, the deadliest standing lanes.
  // ============================================================================================

  // --- epics ---
  {
    id: 'iss-pass',
    label: 'Station Flyby',
    desc: 'Credits +70% · cut +2. A sunlit salvage window streaks past.',
    lore: 'A vast orbital glints overhead — a narrow, lucrative window to dock.',
    icon: '🛰️',
    category: 'payout',
    rarity: 'epic',
    creditMult: 1.7,
    cutDelta: 2,
    minArc: 3,
  },
  {
    id: 'solar-flare',
    label: 'Solar Flare',
    desc: 'Credits +80% · cut +2. High stakes, hard light.',
    lore: 'The star throws a tongue of plasma your way. Best be quick.',
    icon: '🔆',
    category: 'payout',
    rarity: 'epic',
    creditMult: 1.8,
    cutDelta: 2,
    minArc: 3,
  },
  {
    id: 'planetary-conjunction',
    label: 'Planetary Conjunction',
    desc: 'Credits +95% · cut +2. Two worlds align.',
    lore: 'A rare alignment opens a corridor between the gravity wells.',
    icon: '🌗',
    category: 'payout',
    rarity: 'epic',
    creditMult: 1.95,
    cutDelta: 2,
    minArc: 3,
  },
  {
    id: 'void-rift',
    label: 'Void Rift',
    desc: 'Credits +120% · cut +2 · toll 40. Pay the rift, gamble big.',
    lore: 'A tear in space, edged in violet. Throw credits in; pray more come out.',
    icon: '🕳️',
    category: 'toll',
    rarity: 'epic',
    creditMult: 2.2,
    cutDelta: 2,
    creditToll: 40,
    minArc: 3,
  },

  {
    id: 'galactic-core',
    label: 'Galactic Core',
    desc: 'Credits +90% · cut +2. Dive toward the blazing hub.',
    lore: 'A million crowded suns roar at the heart of the galaxy.',
    icon: '🎆',
    category: 'payout',
    rarity: 'epic',
    creditMult: 1.9,
    cutDelta: 2,
    minArc: 3,
  },
  {
    id: 'white-dwarf-passage',
    label: 'White Dwarf Passage',
    desc: 'Credits +110% · cut +2 · toll 35. Squeeze past the dense little star.',
    lore: 'Small, white-hot, and heavier than reason. Pay the pilot’s guild or go around.',
    icon: '🪐',
    category: 'toll',
    rarity: 'epic',
    creditMult: 2.1,
    cutDelta: 2,
    creditToll: 35,
    minArc: 3,
  },
  {
    id: 'glacial-veil',
    label: 'Glacial Veil',
    desc: 'Credits +85% · cut +2. A frozen curtain across the deep.',
    lore: 'A sheet of drifting ice crystals a thousand miles wide, lit from behind.',
    icon: '❄️',
    category: 'payout',
    rarity: 'epic',
    creditMult: 1.85,
    cutDelta: 2,
    minArc: 3,
  },
  {
    id: 'junker-armada',
    label: 'Junker Armada',
    desc: 'Credits +50% · cut +2 · +4 shards. Board the drifting fleet.',
    lore: 'A hundred dead hulls in convoy formation, still flying nowhere.',
    icon: '🛸',
    category: 'salvage',
    rarity: 'epic',
    creditMult: 1.5,
    cutDelta: 2,
    shardBonus: 4,
    minArc: 3,
  },

  // --- legendaries: the jackpot standing lanes ---
  {
    id: 'mars-opposition',
    label: 'Mars at Opposition',
    desc: 'Credits +130% · cut +3. The red planet blazes all night.',
    lore: 'It burns at its closest and brightest. The whole sky is on fire.',
    icon: '🔴',
    category: 'payout',
    rarity: 'legendary',
    creditMult: 2.3,
    cutDelta: 3,
    minArc: 3,
  },
  {
    id: 'aurora-australis',
    label: 'Aurora Australis',
    desc: 'Credits +150% · cut +3 · +8 shards. The southern lights erupt.',
    lore: 'Curtains of green and violet pour over the pole. A jackpot lane.',
    icon: '🌈',
    category: 'payout',
    rarity: 'legendary',
    creditMult: 2.5,
    cutDelta: 3,
    shardBonus: 8,
    minArc: 3,
  },
  {
    id: 'quasar-beacon',
    label: 'Quasar Beacon',
    desc: 'Credits +170% · cut +3 · toll 60. The brightest thing in the sky.',
    lore: 'A black hole, feeding, screaming light across a billion years. Costly to ride.',
    icon: '💠',
    category: 'toll',
    rarity: 'legendary',
    creditMult: 2.7,
    cutDelta: 3,
    creditToll: 60,
    minArc: 3,
  },
  {
    id: 'rogue-planet',
    label: 'Rogue Planet',
    desc: 'Credits +140% · cut +3. A sunless giant crosses your path.',
    lore: 'No star, no sky, no mercy — just mass, moving fast through the dark.',
    icon: '🪐',
    category: 'payout',
    rarity: 'legendary',
    creditMult: 2.4,
    cutDelta: 3,
    minArc: 3,
  },
  {
    id: 'great-comet-harvest',
    label: 'Great Comet Harvest',
    desc: 'Credits +100% · cut +2 · +8 shards. Net the mother lode of tail dust.',
    lore: 'A comet the size of a nation, shedding riches with every mile.',
    icon: '☄️',
    category: 'salvage',
    rarity: 'legendary',
    creditMult: 2.0,
    cutDelta: 2,
    shardBonus: 8,
    minArc: 3,
  },
];

/**
 * Unique one-off events — the catalogue's dated showpieces (eclipses, the Apophis flyby). The
 * richest, deadliest lanes, gated to the deep arc and offered AT MOST ONCE per run. Scarce by their
 * loot weight + once-per-run guard, so they surface rarely without special-casing.
 */
export const UNIQUE_EVENTS: readonly RouteEvent[] = [
  {
    id: 'penumbral-eclipse',
    label: 'Penumbral Eclipse',
    desc: 'Credits +65% · cut +1. A one-off haul.',
    lore: 'The Moon slips into shadow, just the once. Seen, then gone.',
    icon: '🌒',
    category: 'payout',
    rarity: 'rare',
    creditMult: 1.65,
    cutDelta: 1,
    minArc: 3,
    unique: true,
  },
  {
    id: 'comet-apparition',
    label: 'Comet Apparition',
    desc: 'Credits +95% · cut +2 · +6 shards. Seen but once.',
    lore: 'A comet swings through on its long, lonely arc. A lifetime event.',
    icon: '☄️',
    category: 'salvage',
    rarity: 'epic',
    creditMult: 1.95,
    cutDelta: 2,
    shardBonus: 6,
    minArc: 3,
    unique: true,
  },
  {
    id: 'partial-lunar-eclipse',
    label: 'Partial Lunar Eclipse',
    desc: 'Credits +105% · cut +2. One night only.',
    lore: 'A bite taken from the Moon, red at the edge.',
    icon: '🌗',
    category: 'payout',
    rarity: 'epic',
    creditMult: 2.05,
    cutDelta: 2,
    minArc: 3,
    unique: true,
  },
  {
    id: 'total-solar-eclipse',
    label: 'Total Solar Eclipse',
    desc: 'Credits +160% · cut +3 · +10 shards. The day goes dark.',
    lore: 'A once-in-a-run totality — the corona blazes round a black sun.',
    icon: '🌘',
    category: 'salvage',
    rarity: 'legendary',
    creditMult: 2.6,
    cutDelta: 3,
    shardBonus: 10,
    minArc: 3,
    unique: true,
  },
  {
    id: 'apophis-flyby',
    label: 'Apophis Flyby',
    desc: 'Credits +200% · cut +4 · toll 50. The richest, deadliest lane of all.',
    lore: 'A god-rock screams past, close enough to touch. You will remember this one.',
    icon: '🪨',
    category: 'toll',
    rarity: 'legendary',
    creditMult: 3.0,
    cutDelta: 4,
    creditToll: 50,
    minArc: 3,
    unique: true,
  },
  {
    id: 'deep-freeze',
    label: 'The Deep Freeze',
    desc: 'Credits +60% · cut +1 · +7 shards. A once-a-run pocket of ancient cold.',
    lore: 'Space itself frosted over. Nothing has moved here for a million years.',
    icon: '🧊',
    category: 'salvage',
    rarity: 'epic',
    creditMult: 1.6,
    cutDelta: 1,
    shardBonus: 7,
    minArc: 3,
    unique: true,
  },
  {
    id: 'event-horizon',
    label: 'Event Horizon',
    desc: 'Credits +180% · cut +4 · toll 70. Skirt the point of no return.',
    lore: 'The last lane before the dark. Everything is heavier here, even your nerve.',
    icon: '🕳️',
    category: 'toll',
    rarity: 'legendary',
    creditMult: 2.8,
    cutDelta: 4,
    creditToll: 70,
    minArc: 3,
    unique: true,
  },
];

const ALL_EVENTS: readonly RouteEvent[] = [...ROUTE_EVENTS, ...UNIQUE_EVENTS];

/** Is this a lower-risk lane (cut not raised)? `drawArcRouteEvents` always offers at least one. */
export function isCalm(e: RouteEvent): boolean {
  return e.cutDelta <= 0;
}

export function routeEvent(id: string): RouteEvent | undefined {
  return ALL_EVENTS.find((e) => e.id === id);
}

const eventMinArc = (e: RouteEvent): Arc => e.minArc ?? 1;

/**
 * The pool of events available at a given galaxy distance: recurring events tiered in by `minArc`,
 * plus any UNFIRED unique one-offs whose arc has opened. Deeper = richer + deadlier. Pure.
 */
export function eventPool(distanceFromStart: number, firedUniqueIds: readonly string[] = []): RouteEvent[] {
  const arc = arcForDistance(distanceFromStart);
  const fired = new Set(firedUniqueIds);
  const recurring = ROUTE_EVENTS.filter((e) => eventMinArc(e) <= arc);
  const uniques = UNIQUE_EVENTS.filter((e) => eventMinArc(e) <= arc && !fired.has(e.id));
  return [...recurring, ...uniques];
}

// --- The per-arc slot draw (GS-routes) ------------------------------------------------------------
//
// Each jump offers three lanes whose RARITIES follow an arc-tiered distribution, so the loot feel
// ramps with the journey (commons early → rares/epics/legendaries deep). A slot names a BASE rarity
// and an upgrade CHAIN: `chain[k]` is the probability of climbing one more tier given you climbed the
// previous one (gated, so a legendary needs every link). The spec (locked with the design):
//   • Arc 1: two commons + a wildcard (≈82% common / 14% rare / 4% epic).
//   • Arc 2: a common, a CROSSOVER (≈50/50 common↔rare, rares may reach epic/legendary), and a
//     rare (→epic →legendary) — so "1–2 commons and 1–2 rares", with a sliver of epic/legendary.
//   • Arc 3: two rares (→epic →legendary) + an epic (→legendary, higher) — up to THREE legendaries.
// Arc 3 is the steady-state ("baseline going ahead") for the endless / ascension formats.

interface SlotSpec {
  base: Rarity;
  /** Gated upgrade probabilities, one per tier above `base`. */
  chain: number[];
}

const ARC_SLOTS: Record<Arc, SlotSpec[]> = {
  1: [
    { base: 'common', chain: [] },
    { base: 'common', chain: [0.16] }, // a second wildcard nudge: ~16% rare (a touch of variety early)
    { base: 'common', chain: [0.28, 0.26] }, // wildcard: ~28% rare, ~7% epic (raised from 18/22)
  ],
  2: [
    { base: 'common', chain: [0.22] }, // the "safe" slot can now flash a rare
    { base: 'common', chain: [0.58, 0.28, 0.12] }, // crossover: 58% → rare, then epic, then legendary
    { base: 'rare', chain: [0.3, 0.12] }, // rare → epic (30%) → legendary (12%)
  ],
  3: [
    { base: 'rare', chain: [0.32, 0.38] }, // rare → epic (32%) → legendary (38%)
    { base: 'rare', chain: [0.32, 0.38] },
    { base: 'epic', chain: [0.42] }, // epic → legendary (42%)
  ],
};

const orderOf = (r: Rarity): number => RARITY_C[r].order;

/**
 * Swap duplicate-category picks for an unused event of the SAME rarity in a fresh category, so the
 * three drawn lanes span distinct reward families (calm / payout / toll / salvage) where the pool
 * allows — making each jump a real decision. Same-rarity only ⇒ the rarity distribution is preserved
 * (the per-arc mix + triple-legendary ceiling tests still hold). Mutates `picks`/`used` in place.
 */
function diversifyCategories(rng: Rng, picks: RouteEvent[], pool: readonly RouteEvent[], used: Set<string>): void {
  const seen = new Set<EventCategory>();
  for (let i = 0; i < picks.length; i++) {
    if (!seen.has(picks[i]!.category)) {
      seen.add(picks[i]!.category);
      continue;
    }
    const want = picks[i]!.rarity;
    const cands = pool.filter((e) => !used.has(e.id) && e.rarity === want && !seen.has(e.category));
    if (cands.length > 0) {
      const repl = cands[rng.int(0, cands.length - 1)]!;
      used.delete(picks[i]!.id);
      used.add(repl.id);
      picks[i] = repl;
    }
    seen.add(picks[i]!.category);
  }
}

/** Resolve a slot to a concrete rarity by walking its gated upgrade chain on the supplied rng. */
function rollSlotRarity(rng: Rng, slot: SlotSpec): Rarity {
  let o = orderOf(slot.base);
  for (const p of slot.chain) {
    if (o >= RARITIES.length - 1) break;
    if (rng.float() < p) o++;
    else break;
  }
  return RARITIES[o]!;
}

/**
 * Pick a DISTINCT event of (preferably) `target` rarity from `pool`, excluding `usedIds`. Falls back
 * toward COMMON first (a missing high tier degrades to the nearest lower one — never harder than asked),
 * then upward if even commons are exhausted. Returns undefined only if the whole pool is used up.
 */
function pickOfRarity(rng: Rng, pool: readonly RouteEvent[], target: Rarity, usedIds: Set<string>): RouteEvent | undefined {
  const free = pool.filter((e) => !usedIds.has(e.id));
  if (free.length === 0) return undefined;
  const want = orderOf(target);
  // Search order: the target tier, then down toward common, then up toward legendary.
  const orders: number[] = [];
  for (let d = 0; d < RARITIES.length; d++) {
    if (want - d >= 0) orders.push(want - d);
    if (want + d < RARITIES.length && d > 0) orders.push(want + d);
  }
  for (const o of orders) {
    const tier = free.filter((e) => orderOf(e.rarity) === o);
    if (tier.length > 0) return tier[rng.int(0, tier.length - 1)]!;
  }
  return free[rng.int(0, free.length - 1)];
}

/**
 * Draw the three route events for a jump, with the rarity mix dictated by the arc (`ARC_SLOTS`).
 * Deterministic in `rng`.
 *
 * Safety net: arcs 1 & 2 GUARANTEE at least one lower-risk OUT (a cut ≤ 0 lane) — if the draw
 * produced none, the lowest-stakes slot is swapped for a calm event — so the early game is never an
 * all-or-nothing trap. Arc 3 (the deep voyage / the endless & ascension steady state) does NOT: its
 * lanes can ALL be high-stakes (up to three legendaries), which is the whole point of the late game —
 * commit to a gamble or bank the run. Calm rares still surface there naturally, just not guaranteed.
 */
export function drawArcRouteEvents(rng: Rng, arc: Arc, pool: readonly RouteEvent[]): RouteEvent[] {
  const slots = ARC_SLOTS[arc] ?? ARC_SLOTS[3];
  const used = new Set<string>();
  const picks: RouteEvent[] = [];
  for (const slot of slots) {
    const rarity = rollSlotRarity(rng, slot);
    const ev = pickOfRarity(rng, pool, rarity, used);
    if (!ev) break;
    used.add(ev.id);
    picks.push(ev);
  }
  // Spread the lanes across DISTINCT reward CATEGORIES so the three choices read as genuinely
  // different bets — a safe out, a payout gamble, a salvage/toll play — instead of three
  // near-identical commons ("there was no choice really"). Same-rarity swaps only, so the arc rarity
  // mix (and the deep triple-legendary ceiling) is untouched; deterministic in `rng`.
  diversifyCategories(rng, picks, pool, used);
  // Ensure an out (early arcs only). If none of the picks is calm, replace the lowest-stakes one.
  if (arc < 3 && picks.length > 0 && !picks.some(isCalm)) {
    const stakes = (e: RouteEvent) => e.cutDelta * 10 + e.creditMult; // lower = safer/poorer
    let swapAt = 0;
    for (let i = 1; i < picks.length; i++) if (stakes(picks[i]!) < stakes(picks[swapAt]!)) swapAt = i;
    const without = new Set(picks.filter((_, i) => i !== swapAt).map((e) => e.id));
    const ceiling = orderOf(picks[swapAt]!.rarity);
    const calmFree = pool.filter((e) => isCalm(e) && !without.has(e.id));
    // Prefer a calm event no rarer than the slot we're replacing (keeps the arc's feel), else any calm.
    const sameOrLower = calmFree.filter((e) => orderOf(e.rarity) <= ceiling);
    const fromList = sameOrLower.length > 0 ? sameOrLower : calmFree;
    if (fromList.length > 0) picks[swapAt] = fromList[rng.int(0, fromList.length - 1)]!;
  }
  return picks;
}

const CALM_EVENTS = ROUTE_EVENTS.filter(isCalm);

/**
 * Flat rarity-weighted draw of `n` distinct events (legacy / utility — used by tests and any caller
 * that wants the old behaviour). Guarantees a calm option. `drawArcRouteEvents` is the live path.
 */
export function drawRouteEvents(
  rng: Rng,
  n: number,
  fromPool: readonly RouteEvent[] = ROUTE_EVENTS,
): RouteEvent[] {
  const pool = [...fromPool];
  const picks: RouteEvent[] = [];
  while (picks.length < n && pool.length > 0) {
    const total = pool.reduce((s, e) => s + RARITY_C[e.rarity].weight, 0);
    let r = rng.float() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= RARITY_C[pool[idx]!.rarity].weight;
      if (r <= 0) break;
    }
    picks.push(pool.splice(idx, 1)[0]!);
  }
  if (picks.length > 0 && !picks.some(isCalm)) {
    picks[picks.length - 1] = CALM_EVENTS[rng.int(0, CALM_EVENTS.length - 1)]!;
  }
  return picks;
}
