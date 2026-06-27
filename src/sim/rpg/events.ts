/**
 * Route events — the risk/reward character of a jump (GS-14), themed from the night-sky
 * catalogue and split into recurring vs. unique (GS-17c).
 *
 * Travel used to differ only by distance. A roguelite lives or dies on the *choice* at each
 * node, so every onward route carries an EVENT: a themed, content-as-data modifier that tweaks
 * the stop you fly INTO. Two pure levers, both felt:
 *   • `creditMult` — scales the credits earned there (progression — the game's currency).
 *   • `cutDelta`   — shifts that stop's cut line (the fail gate — the risk you're taking).
 *
 * Two kinds, mirroring the catalogue (the player's original ask):
 *   • RECURRING (`ROUTE_EVENTS`) — meteor showers, moon phases, flares, tailwinds: the backbone,
 *     drawn every jump. `minArc` ACCENTS THE ARCS — calm drifts early, brutal flares/aurora late.
 *   • UNIQUE (`UNIQUE_EVENTS`) — the one-off dated events (eclipses, the Apophis flyby): the richest,
 *     deadliest lanes, gated to the deep arc and offered AT MOST ONCE per run (the run tracks which
 *     have fired). They're scarce by their loot weight, so no special injection logic is needed.
 *
 * Fairness by construction: events touch ONLY the economy/cut, never course generation — so the
 * no-death-spiral + fairness validators are untouched. `routeOptions` guarantees at least one calm
 * option every jump, so there's always an out.
 */

import { Rng } from '../rng';
import type { Rarity } from '../course/contract';
import { RARITY_C } from './loot';
import { arcForDistance, type Arc } from '../course/themes';

export interface RouteEvent {
  id: string;
  label: string;
  /** One-line flavour + effect, shown on the route card. */
  desc: string;
  /** Loot grade — tints the route card AND weights the draw (rarer = scarcer & juicier). */
  rarity: Rarity;
  /** Multiplies credits earned at the stop reached by this route (1 = neutral). */
  creditMult: number;
  /** Added to that stop's cut line: >0 = harder to survive, <0 = easier (0 = neutral). */
  cutDelta: number;
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
  rarity: 'common',
  creditMult: 1,
  cutDelta: 0,
};

/**
 * Recurring events — the backbone, drawn every jump. Spread from safe-but-poor (calm, easier cut)
 * to high-stakes (rich payout, brutal cut), and arc-tiered so the early game stays gentle. A calm
 * event has `cutDelta <= 0` (an "out"). Themed from the catalogue's recurring + meteor-shower cards.
 */
export const ROUTE_EVENTS: readonly RouteEvent[] = [
  // --- Arc 1: calm/mild — the opening lanes ---
  {
    id: 'stellar-tailwind',
    label: 'Stellar Tailwind',
    desc: 'A friendly current — easier cut (−1) and a little extra pay (+10% credits).',
    rarity: 'common',
    creditMult: 1.1,
    cutDelta: -1,
    minArc: 1,
  },
  {
    id: 'calm-drift',
    label: 'Calm Drift',
    desc: 'A gentle, forgiving system — the cut drops by 1. Steady, modest pickings.',
    rarity: 'common',
    creditMult: 1,
    cutDelta: -1,
    minArc: 1,
  },
  {
    id: 'new-moon',
    label: 'New Moon',
    desc: 'Dark, clear skies — the read comes easy (cut −1). A calm, even-paid lane.',
    rarity: 'rare',
    creditMult: 1.05,
    cutDelta: -1,
    minArc: 1,
  },
  {
    id: 'full-moon',
    label: 'Full Moon',
    desc: 'A bright, generous night — +15% credits, no change to the cut.',
    rarity: 'common',
    creditMult: 1.15,
    cutDelta: 0,
    minArc: 1,
  },
  {
    id: 'trade-lane',
    label: 'Trade Lane',
    desc: 'Busy shipping route — +30% credits, no change to the cut.',
    rarity: 'rare',
    creditMult: 1.3,
    cutDelta: 0,
    minArc: 1,
  },

  // --- Arc 2: the journey hardens ---
  {
    id: 'meteor-belt',
    label: 'Meteor Belt',
    desc: 'Rough passage — +15% credits but the cut tightens by 1.',
    rarity: 'rare',
    creditMult: 1.15,
    cutDelta: 1,
    minArc: 2,
  },
  {
    id: 'perseids',
    label: 'Perseid Stream',
    desc: 'A steady shower lights the lane — +25% credits, cut +1.',
    rarity: 'rare',
    creditMult: 1.25,
    cutDelta: 1,
    minArc: 2,
  },
  {
    id: 'geminids',
    label: 'Geminid Storm',
    desc: 'The year’s richest shower — +35% credits, but the cut tightens by 1.',
    rarity: 'epic',
    creditMult: 1.35,
    cutDelta: 1,
    minArc: 2,
  },
  {
    id: 'supermoon',
    label: 'Supermoon',
    desc: 'A swollen Moon floods the sky — +50% credits, cut +1.',
    rarity: 'epic',
    creditMult: 1.5,
    cutDelta: 1,
    minArc: 2,
  },
  {
    id: 'derelict-cache',
    label: 'Derelict Cache',
    desc: 'A salvage haul — +45% credits, but a tense landing (cut +1).',
    rarity: 'epic',
    creditMult: 1.45,
    cutDelta: 1,
    minArc: 2,
  },

  // --- Arc 3: high-stakes — the deep voyage ---
  {
    id: 'iss-pass',
    label: 'Station Flyby',
    desc: 'A sunlit salvage window streaks overhead — +60% credits, cut +2.',
    rarity: 'epic',
    creditMult: 1.6,
    cutDelta: 2,
    minArc: 3,
  },
  {
    id: 'solar-flare',
    label: 'Solar Flare',
    desc: 'High stakes — +70% credits, but the cut spikes by 2.',
    rarity: 'epic',
    creditMult: 1.7,
    cutDelta: 2,
    minArc: 3,
  },
  {
    id: 'planetary-conjunction',
    label: 'Planetary Conjunction',
    desc: 'Two worlds align — +90% credits, cut +2.',
    rarity: 'epic',
    creditMult: 1.9,
    cutDelta: 2,
    minArc: 3,
  },
  {
    id: 'mars-opposition',
    label: 'Mars at Opposition',
    desc: 'The red planet blazes all night — credits +110%, cut +3.',
    rarity: 'legendary',
    creditMult: 2.1,
    cutDelta: 3,
    minArc: 3,
  },
  {
    id: 'aurora-australis',
    label: 'Aurora Australis',
    desc: 'The southern lights erupt — a jackpot lane (+130% credits), but the cut soars by 3.',
    rarity: 'legendary',
    creditMult: 2.3,
    cutDelta: 3,
    minArc: 3,
  },
];

/**
 * Unique one-off events — the catalogue's dated showpieces (eclipses, the Apophis flyby). The
 * richest, deadliest lanes, gated to the deep arc and offered AT MOST ONCE per run. Scarce by their
 * loot weight, so they surface rarely without special-casing.
 */
export const UNIQUE_EVENTS: readonly RouteEvent[] = [
  {
    id: 'penumbral-eclipse',
    label: 'Penumbral Eclipse',
    desc: 'The Moon slips into shadow — a one-off haul (+65% credits), cut +1.',
    rarity: 'rare',
    creditMult: 1.65,
    cutDelta: 1,
    minArc: 3,
    unique: true,
  },
  {
    id: 'comet-apparition',
    label: 'Comet Apparition',
    desc: 'A comet swings through once — +90% credits, cut +2. Seen but once.',
    rarity: 'epic',
    creditMult: 1.9,
    cutDelta: 2,
    minArc: 3,
    unique: true,
  },
  {
    id: 'partial-lunar-eclipse',
    label: 'Partial Lunar Eclipse',
    desc: 'A bite taken from the Moon — +100% credits, cut +2. One night only.',
    rarity: 'epic',
    creditMult: 2.0,
    cutDelta: 2,
    minArc: 3,
    unique: true,
  },
  {
    id: 'total-solar-eclipse',
    label: 'Total Solar Eclipse',
    desc: 'The day goes dark — a once-in-a-run jackpot (+160% credits), cut +3.',
    rarity: 'legendary',
    creditMult: 2.6,
    cutDelta: 3,
    minArc: 3,
    unique: true,
  },
  {
    id: 'apophis-flyby',
    label: 'Apophis Flyby',
    desc: 'An asteroid screams past — the richest, deadliest lane of all (+200% credits), cut +4.',
    rarity: 'legendary',
    creditMult: 3.0,
    cutDelta: 4,
    minArc: 3,
    unique: true,
  },
];

const ALL_EVENTS: readonly RouteEvent[] = [...ROUTE_EVENTS, ...UNIQUE_EVENTS];

/** Is this a low-risk lane (cut not raised)? `routeOptions` always offers at least one. */
export function isCalm(e: RouteEvent): boolean {
  return e.cutDelta <= 0;
}

const CALM_EVENTS = ROUTE_EVENTS.filter(isCalm);

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

/**
 * Draw `n` DISTINCT events from `pool`, rarity-weighted (rarer = scarcer). Guarantees at least one
 * calm (an out) by swapping the last pick for a random calm event when the draw produced none — so
 * a jump is never an all-or-nothing trap. Deterministic in the supplied `rng`. Defaults to the full
 * recurring table so the low-level draw stays usable on its own.
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
