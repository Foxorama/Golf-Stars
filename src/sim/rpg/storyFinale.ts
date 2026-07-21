/**
 * Story-Tour FINALE (GS-story-yggdrasil) — the Jörmungandr space battle, the campaign climax that SPENDS
 * the Combat Rating you've been stockpiling in the shipyard. Five Sigils forge the key to Yggdrasil's Dark
 * Root (`keyToOtherRealm`); there the Cthulhu-corrupted world-serpent waits. You engage with your ARMED
 * ship — and the outcome is decided by how well you outfitted it across categories, then sealed with a
 * golf finisher into the serpent's eye.
 *
 * PURE + DOM-free (the battle CINEMATIC is a render-layer overlay; this is the deterministic resolution the
 * screens + cinematic read). Two gates, so arming ACROSS categories matters (not one maxed line):
 *   • BREACH  — WEAPON rating must crack the serpent's hide.
 *   • SURVIVE — ENGINE + SHIELD rating must weather its coils.
 * Pass both and the softened serpent exposes its eye; the golf finisher lands and the universe is saved
 * (`completed`). Fall short and the battle tells you exactly what to arm before the rematch — no RNG, no
 * soft-lock: a fully-stocked shipyard clears both gates with headroom.
 */

import { combatRating, categoryRating } from './storyShipUpgrades';
import { keyToOtherRealm, type StoryState } from './story';

/** Weapon rating needed to breach the hide (≈ scatter + railgun, or the nova orb alone). */
export const FINALE_BREACH_NEED = 26;
/** Engine + shield rating needed to survive the coils (a shield or two + an engine). */
export const FINALE_SURVIVE_NEED = 30;

export interface FinaleResult {
  /** Can the battle even be attempted (five Sigils in hand)? */
  unlocked: boolean;
  /** Already won (the campaign is complete)? */
  alreadyWon: boolean;
  weaponRating: number;
  defenceRating: number;
  /** GS-story-battle-2: engines alone — they drive the weapon RECHARGE speed in the live battle. */
  engineRating: number;
  combatRating: number;
  breachOk: boolean;
  surviveOk: boolean;
  /** The verdict if engaged now. */
  won: boolean;
  /** Why a loss happens, for the briefing + defeat guidance. */
  failReason?: 'firepower' | 'defence';
}

/** Resolve the finale for a campaign state (pure). Deterministic — purely a function of the arsenal. */
export function finaleResult(story: StoryState): FinaleResult {
  const weaponRating = categoryRating(story, 'weapon');
  const engineRating = categoryRating(story, 'engine');
  const defenceRating = engineRating + categoryRating(story, 'shield');
  const breachOk = weaponRating >= FINALE_BREACH_NEED;
  const surviveOk = defenceRating >= FINALE_SURVIVE_NEED;
  const won = breachOk && surviveOk;
  return {
    unlocked: keyToOtherRealm(story),
    alreadyWon: story.completed === true,
    weaponRating,
    defenceRating,
    engineRating,
    combatRating: combatRating(story),
    breachOk,
    surviveOk,
    won,
    failReason: won ? undefined : !breachOk ? 'firepower' : 'defence',
  };
}

/**
 * GS-story-battle-2 — the LIVE battle tuning, derived purely from the arsenal so the fight (and the
 * briefing that quotes it) actually CONSUMES the shipyard: every point of rating past the gate floor
 * makes the real fight measurably better. One source for both the battle overlay and the briefing
 * readout (the briefing IS the physics).
 *
 *   • WEAPONS  → volleys to fell the serpent / shatter the wards. Below the breach gate the hide holds
 *     BY CONSTRUCTION (the serpent can be ground to a sliver but never dropped — the deterministic
 *     verdict stays the gates); at the floor it takes `FINALE_FLOOR_SHOTS`; every rating point past the
 *     floor shaves it toward `FINALE_MIN_SHOTS`.
 *   • ENGINES + SHIELDS → strikes the shields absorb before collapse. Below the survive gate a couple of
 *     hits end it; past the floor the pool deepens.
 *   • ENGINES alone → the weapon RECHARGE speed (a nimbler ship cycles its guns faster), so engines have
 *     a battle role distinct from the shield pool.
 */
export interface FinaleBattleTuning {
  /** Direct hits to fell the serpent (Warden) / shatter all wards (Herald). */
  shotsToKill: number;
  /** Un-dodged strikes the shields absorb before collapse. */
  lungesToBreak: number;
  /** Milliseconds to recharge one weapon charge (engine-scaled). */
  rechargeMs: number;
}

/** The serpent's / blockade's strike cadence at the start of the fight (ms between strikes) — here in
 *  the sim so the winnable-by-construction margin is machine-checkable against the same numbers the
 *  battle overlay imports. */
export const FINALE_ATTACK_PERIOD_MS = 2600;
export const FINALE_TELEGRAPH_MS = 800;

export const FINALE_FLOOR_SHOTS = 13; // volleys to kill at exactly the breach floor
export const FINALE_MIN_SHOTS = 5; // a maxed arsenal still needs a real volley
export const FINALE_HOPELESS_SHOTS = 46; // under-breach: the hide holds (unkillable by construction)
export const FINALE_FLOOR_LUNGES = 10; // strikes absorbed at exactly the survive floor
export const FINALE_MAX_LUNGES = 24;

export function finaleBattleTuning(
  weaponRating: number,
  defenceRating: number,
  engineRating: number,
): FinaleBattleTuning {
  const breached = weaponRating >= FINALE_BREACH_NEED;
  const shotsToKill = breached
    ? Math.max(FINALE_MIN_SHOTS, Math.round(FINALE_FLOOR_SHOTS - (weaponRating - FINALE_BREACH_NEED) * 0.12))
    : FINALE_HOPELESS_SHOTS;
  const survives = defenceRating >= FINALE_SURVIVE_NEED;
  const lungesToBreak = survives
    ? Math.min(FINALE_MAX_LUNGES, Math.round(FINALE_FLOOR_LUNGES + (defenceRating - FINALE_SURVIVE_NEED) * 0.16))
    : Math.max(2, Math.round(defenceRating / 10));
  const rechargeMs = Math.max(560, 1000 - engineRating * 11);
  return { shotsToKill, lungesToBreak, rechargeMs };
}

/** Is the finale available to engage — five Sigils in hand and not yet beaten? */
export function finaleUnlocked(story: StoryState): boolean {
  return keyToOtherRealm(story) && story.completed !== true;
}

/** Mark the campaign WON (pure) — the finale is beaten, the universe saved. Sets `completed`, which is
 *  what `storyComplete` reads (unlocking the free-roam Star Tour reward). */
export function winFinale(story: StoryState): StoryState {
  return story.completed === true ? story : { ...story, completed: true };
}
