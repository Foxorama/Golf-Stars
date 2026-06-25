/**
 * Route events — the risk/reward character of a jump (GS-14).
 *
 * Travel used to differ only by distance. A roguelite lives or dies on the *choice* at each
 * node, so every onward route now carries an EVENT: a themed, content-as-data modifier that
 * tweaks the stop you fly INTO. Two pure levers, both felt:
 *   • `creditMult` — scales the credits earned there (progression — the game's currency).
 *   • `cutDelta`   — shifts that stop's cut line (the fail gate — the risk you're taking).
 * A flare pays big but raises the bar you must clear; a calm drift is a safe, low-pay lane.
 *
 * Fairness by construction: events touch ONLY the economy/cut, never course generation — so the
 * no-death-spiral + fairness validators are untouched, and the round always reads "wild but fair".
 * `routeOptions` guarantees at least one calm option every jump, so there's always an out.
 */

import { Rng } from '../rng';
import type { Rarity } from '../course/contract';
import { RARITY_C } from './loot';

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
 * The event table. Spread from safe-but-poor (calm, easier cut) to high-stakes (rich payout,
 * brutal cut) so the travel screen is a genuine gamble. A calm event has `cutDelta <= 0`.
 */
export const ROUTE_EVENTS: readonly RouteEvent[] = [
  {
    id: 'stellar-tailwind',
    label: 'Stellar Tailwind',
    desc: 'A friendly current — easier cut (−1) and a little extra pay (+10% credits).',
    rarity: 'common',
    creditMult: 1.1,
    cutDelta: -1,
  },
  {
    id: 'calm-drift',
    label: 'Calm Drift',
    desc: 'A gentle, forgiving system — the cut drops by 1. Steady, modest pickings.',
    rarity: 'common',
    creditMult: 1,
    cutDelta: -1,
  },
  {
    id: 'trade-lane',
    label: 'Trade Lane',
    desc: 'Busy shipping route — +30% credits, no change to the cut.',
    rarity: 'rare',
    creditMult: 1.3,
    cutDelta: 0,
  },
  {
    id: 'meteor-belt',
    label: 'Meteor Belt',
    desc: 'Rough passage — +15% credits but the cut tightens by 1.',
    rarity: 'rare',
    creditMult: 1.15,
    cutDelta: 1,
  },
  {
    id: 'derelict-cache',
    label: 'Derelict Cache',
    desc: 'A salvage haul — +45% credits, but a tense landing (cut +1).',
    rarity: 'epic',
    creditMult: 1.45,
    cutDelta: 1,
  },
  {
    id: 'solar-flare',
    label: 'Solar Flare',
    desc: 'High stakes — +70% credits, but the cut spikes by 2.',
    rarity: 'epic',
    creditMult: 1.7,
    cutDelta: 2,
  },
  {
    id: 'pulsar-jackpot',
    label: 'Pulsar Jackpot',
    desc: 'A gambler’s lane — credits more than double (+120%), but the cut soars by 3.',
    rarity: 'legendary',
    creditMult: 2.2,
    cutDelta: 3,
  },
];

/** Is this a low-risk lane (cut not raised)? `routeOptions` always offers at least one. */
export function isCalm(e: RouteEvent): boolean {
  return e.cutDelta <= 0;
}

const CALM_EVENTS = ROUTE_EVENTS.filter(isCalm);

export function routeEvent(id: string): RouteEvent | undefined {
  return ROUTE_EVENTS.find((e) => e.id === id);
}

/**
 * Draw `n` DISTINCT events, rarity-weighted (rarer = scarcer). Guarantees at least one calm
 * (an out) by swapping the last pick for a random calm event when the draw produced none —
 * so a jump is never an all-or-nothing trap. Deterministic in the supplied `rng`.
 */
export function drawRouteEvents(rng: Rng, n: number): RouteEvent[] {
  const pool = [...ROUTE_EVENTS];
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
