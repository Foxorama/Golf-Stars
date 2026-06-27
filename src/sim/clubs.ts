/**
 * Bag taxonomy + club-selection logic.
 *
 * Reimplemented (not byte-ported — golf-finder's source isn't in this repo) from the
 * harvest manifest's behavioral spec: a longest→shortest club list with nominal
 * carries, a rolling per-club carry average, and a `suggestClub` with two modes:
 *   - 'reach':   the SHORTEST club that still carries the distance (most control).
 *   - 'nearest': the club whose carry is CLOSEST to the distance.
 *
 * Content-as-data: the bag is a table. RPG loot can unlock/upgrade clubs by editing
 * the player's bag rows — the engine never hardcodes a club.
 */

import type { Rarity } from './course/contract';

export interface Club {
  id: string;
  name: string;
  /** Nominal carry in yards. A player's bag may override this (upgrades/loot). */
  carry: number;
  /**
   * Loot SET/style this club came from (GS-clubs): 'starter' for the clubs you begin a run with,
   * a named set (e.g. 'tour') for a reward club. Absent ⇒ treated as the common 'starter' set. The
   * sim ignores this (carry is all it reads); it drives the reward-offer ownership rules + UI tint.
   */
  set?: string;
  /** Loot grade of this club (GS-clubs): a reward club may be rarer/better. Absent ⇒ 'common'. */
  rarity?: Rarity;
}

/**
 * Default 27-club taxonomy, ordered longest→shortest carry. Idealised (a real
 * bag holds 14) but this is a *taxonomy* the suggester maps distances onto; loot
 * trims/upgrades it later. Carries are strictly descending for a clean mapping.
 */
export const CLUBS: readonly Club[] = [
  { id: 'D', name: 'Driver', carry: 250 },
  { id: '3W', name: '3-Wood', carry: 235 },
  { id: '4W', name: '4-Wood', carry: 226 },
  { id: '5W', name: '5-Wood', carry: 217 },
  { id: '7W', name: '7-Wood', carry: 207 },
  { id: '9W', name: '9-Wood', carry: 197 },
  { id: '2H', name: '2-Hybrid', carry: 189 },
  { id: '3H', name: '3-Hybrid', carry: 181 },
  { id: '4H', name: '4-Hybrid', carry: 173 },
  { id: '5H', name: '5-Hybrid', carry: 165 },
  { id: '3i', name: '3-Iron', carry: 162 },
  { id: '4i', name: '4-Iron', carry: 158 },
  { id: '5i', name: '5-Iron', carry: 150 },
  { id: '6i', name: '6-Iron', carry: 142 },
  { id: '7i', name: '7-Iron', carry: 134 },
  { id: '8i', name: '8-Iron', carry: 125 },
  { id: '9i', name: '9-Iron', carry: 116 },
  { id: 'PW', name: 'Pitching Wedge', carry: 106 },
  { id: 'AW', name: 'Approach Wedge', carry: 96 },
  { id: 'GW', name: 'Gap Wedge', carry: 88 },
  { id: 'SW', name: 'Sand Wedge', carry: 78 },
  { id: 'LW', name: 'Lob Wedge', carry: 68 },
  { id: '58', name: '58° Wedge', carry: 58 },
  { id: '60', name: '60° Wedge', carry: 48 },
  { id: '64', name: '64° Wedge', carry: 38 },
  { id: 'chip', name: 'Chipper', carry: 20 },
  { id: 'putter', name: 'Putter', carry: 8 },
] as const;

export type ClubSelectMode = 'reach' | 'nearest';

/** Rolling per-club carry samples → learned averages. Pure, serialisable state. */
export interface ClubStats {
  /** clubId → recorded carry samples (yards). */
  samples: Record<string, number[]>;
}

export function emptyClubStats(): ClubStats {
  return { samples: {} };
}

/** Average of a club's recorded shots, or `undefined` if none recorded yet. */
export function clubAvg(stats: ClubStats, clubId: string): number | undefined {
  const s = stats.samples[clubId];
  if (!s || s.length === 0) return undefined;
  return s.reduce((a, b) => a + b, 0) / s.length;
}

/**
 * Effective carry the suggester trusts: the learned average if we have samples,
 * else the club's nominal carry. Mirrors golf-finder's `clubDist`.
 */
export function clubDist(club: Club, stats?: ClubStats): number {
  if (stats) {
    const avg = clubAvg(stats, club.id);
    if (avg !== undefined) return avg;
  }
  return club.carry;
}

/** Record a shot's actual carry for a club, returning new stats (immutable). */
export function addClubShot(stats: ClubStats, clubId: string, carry: number): ClubStats {
  const prev = stats.samples[clubId] ?? [];
  return { samples: { ...stats.samples, [clubId]: [...prev, carry] } };
}

/**
 * Suggest a club for a target distance.
 *   - 'reach':   shortest club whose (effective) carry >= distance. Falls back to the
 *                longest club if nothing reaches.
 *   - 'nearest': club whose effective carry is closest to the distance.
 * `bag` defaults to the full taxonomy; pass the player's bag to respect loot/upgrades.
 */
export function suggestClub(
  distance: number,
  mode: ClubSelectMode = 'reach',
  bag: readonly Club[] = CLUBS,
  stats?: ClubStats,
): Club {
  if (bag.length === 0) throw new Error('suggestClub: empty bag');

  if (mode === 'reach') {
    let best: Club | undefined;
    let bestCarry = Infinity;
    for (const c of bag) {
      const carry = clubDist(c, stats);
      if (carry >= distance && carry < bestCarry) {
        best = c;
        bestCarry = carry;
      }
    }
    // Nothing reaches → hand over the longest club available.
    if (!best) {
      best = bag.reduce((a, b) => (clubDist(b, stats) > clubDist(a, stats) ? b : a));
    }
    return best;
  }

  // nearest
  return bag.reduce((a, b) =>
    Math.abs(clubDist(b, stats) - distance) < Math.abs(clubDist(a, stats) - distance)
      ? b
      : a,
  );
}

export function clubById(id: string, bag: readonly Club[] = CLUBS): Club | undefined {
  return bag.find((c) => c.id === id);
}
