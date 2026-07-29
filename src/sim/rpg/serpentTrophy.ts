/**
 * THE ROOT TALLY AND THE WORLD SERPENT HULL (GS-startour-serpent-trophy).
 *
 * GS-story-startour-champions hung a replay of the finale beneath Yggdrasil — a champion can drop back
 * to the root and fight their boss again, as often as they like. It banked NOTHING: no record, no
 * reward, not even a count. That is the right rule for CAMPAIGN state (a memory must not rewrite the
 * campaign it remembers) but it is the wrong rule for the PLAYER'S OWN history, which is why every
 * encounter now counts here instead of evaporating.
 *
 * The tally is a LIFETIME, CROSS-CAMPAIGN pair on the main save, exactly like `lifetimeAces`:
 *   - `bouts` — every root encounter resolved, won or lost. The honest denominator.
 *   - `wins`  — every one you took. The achievement's key.
 * It lives on the main save (never `gs_story`) BECAUSE one campaign per golfer means a slot can be
 * started over — a grind that could be erased by picking a golfer is not a grind anyone would do.
 *
 * **BEATEN INTO SUBMISSION** is the secret achievement at `SERPENT_TROPHY_WINS` wins: the world
 * serpent itself, broken to the bridle and flown as a ship (`SERPENT_SHIP_ID`). Awarding it is the
 * `aceShipUnlock` idiom — pure, idempotent, purely additive, and referentially unchanged when there is
 * nothing new to grant, so callers can cheaply detect "the player just earned it".
 *
 * Which BOSS the champion faced at the root (Jörmungandr for a Warden, the Warden Ark for a Herald) is
 * deliberately NOT part of the key: the two are one fight in one place, the road to the root is the
 * same length either way, and splitting the tally would make the achievement cost twice as much for a
 * player who finished both paths. The trophy is for wearing the root down, not for a species of boss.
 *
 * Pure + node-clean: no DOM, no rng, no save/localStorage. Guarded by `tests/serpent-trophy.test.ts`.
 */

/** The secret ship earned by `SERPENT_TROPHY_WINS` root victories — the world serpent as a hull. */
export const SERPENT_SHIP_ID = 'world-serpent';

/** Root victories needed for **Beaten into Submission**. A deliberately enormous grind — the ship it
 *  pays out is the last thing in the game to earn, so the number is the point. */
export const SERPENT_TROPHY_WINS = 1000;

/** The player's lifetime record at the root. Persisted on the MAIN save (v32), never on `gs_story`. */
export interface SerpentTally {
  /** Every root encounter resolved — won, lost, or repelled. */
  bouts: number;
  /** Every root encounter WON. The achievement gate reads this. */
  wins: number;
}

export const EMPTY_SERPENT_TALLY: SerpentTally = { bouts: 0, wins: 0 };

/** Record one resolved root encounter. Always counts the bout; counts the win only when it was won. */
export function recordSerpentBout(tally: SerpentTally, won: boolean): SerpentTally {
  return { bouts: tally.bouts + 1, wins: tally.wins + (won ? 1 : 0) };
}

/** Has the trophy been earned at this win count? */
export function serpentTrophyEarned(wins: number): boolean {
  return wins >= SERPENT_TROPHY_WINS;
}

/** Root victories still to go (0 once earned) — the readout under the Root card. */
export function serpentWinsRemaining(wins: number): number {
  return Math.max(0, SERPENT_TROPHY_WINS - wins);
}

/**
 * Grant the world-serpent hull once the win count clears the bar. Returns the owned list WITH the ship
 * on a newly-qualifying player, else the SAME list (referentially — so a caller can detect "nothing
 * changed" without a scan, the `aceShipUnlock` contract). Global ownership, like every ship.
 *
 * Deliberately gated on the COUNT rather than on "this bout was the thousandth": a player who somehow
 * arrives past the bar without the ship (an imported bundle, a hand-edited save, a future migration)
 * still gets what they earned on their very next root win, and re-winning after that is a no-op.
 */
export function serpentTrophyUnlock(ownedShips: readonly string[], wins: number): string[] {
  if (serpentTrophyEarned(wins) && !ownedShips.includes(SERPENT_SHIP_ID)) {
    return [...ownedShips, SERPENT_SHIP_ID];
  }
  return ownedShips as string[];
}
