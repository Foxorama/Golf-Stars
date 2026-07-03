/**
 * Salvage club find (GS-journey-fx-3) — the LOOT a debris / wreck / mining lane hands you.
 *
 * A salvage route used to bank a trivial +1…+8 Star Shards — noise against a Trade Market where a
 * ship runs 60…1000 shards, so the "reward" moved the needle on nothing and made the lane a dull
 * pick. The rebrand: a salvage lane now SCAVENGES A CLUB — a rare/epic/legendary club the golfer
 * doesn't already carry, equipped for the rest of the run. That's a reward you feel THIS run (it
 * fills a bag gap or upgrades your reach right now), and it survives deeper → more distance → more
 * run-end shards anyway, so meta progress rides survival instead of a flat drip.
 *
 * Resume-safe for free: the find is an existing shop `CLUB_ITEM`, so applying it records the item's
 * perk id on the loadout and `loadoutFromPerks` re-equips it on resume — no new save field.
 *
 * Determinism: the pick runs on a PRIVATE Rng stream seeded from the run+stop+event, never a shared
 * sim/render stream, so attaching a find to a lane perturbs no existing draw order (contract 1). It's
 * paid at TRAVEL, touching neither course generation nor the shot stream, so fairness/no-death-spiral
 * are untouched (and a found club only ever RAISES Stableford, never spirals).
 */

import { Rng } from '../rng';
import type { Rarity } from '../course/contract';
import { offerableClubs, type PlayerLoadout } from './economy';

/** Credits paid when the bag already holds every candidate club at the find's rarity — the salvage
 *  never comes up empty. Rarity-scaled so a legendary lane's dud still stings less than its find. */
const CONSOLATION: Record<Rarity, number> = {
  common: 40,
  rare: 60,
  epic: 120,
  legendary: 220,
};

export interface SalvageFind {
  /** The shop `CLUB_ITEM` id to apply — equips the club AND records its perk (resume-safe). */
  clubItemId?: string;
  /** The found club's display name (route card + arrival toast). */
  clubName?: string;
  /** The found club's rarity (card accent). */
  rarity?: Rarity;
  /** Credits paid instead when no fresh club of the rarity was available (bag already full). */
  consolationCredits?: number;
}

/**
 * Resolve a salvage lane's club find for a loadout. Reuses `offerableClubs` — the shop's own filter
 * for "a club you don't carry, or a genuine distance/putter upgrade, respecting golfer refusals + the
 * bag-tier floor" — so a find can never hand you a club you'd never use. Prefers a brand-NEW club type
 * (a true find) over a same-type upgrade. Pays a rarity-scaled credit consolation if the pool is empty.
 * Pure & deterministic in `seed`.
 */
export function salvageClubFind(loadout: PlayerLoadout, want: Rarity, seed: string): SalvageFind {
  const rng = new Rng(seed);
  const pool = offerableClubs(loadout).filter((it) => it.rarity === want);
  const carried = new Set(loadout.bag.map((c) => c.id));
  const fresh = pool.filter((it) => it.clubType && !carried.has(it.clubType));
  const from = fresh.length > 0 ? fresh : pool;
  if (from.length === 0) return { consolationCredits: CONSOLATION[want] };
  const pick = from[rng.int(0, from.length - 1)]!;
  return { clubItemId: pick.id, clubName: pick.name, rarity: pick.rarity };
}
