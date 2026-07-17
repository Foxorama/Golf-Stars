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
  const defenceRating = categoryRating(story, 'engine') + categoryRating(story, 'shield');
  const breachOk = weaponRating >= FINALE_BREACH_NEED;
  const surviveOk = defenceRating >= FINALE_SURVIVE_NEED;
  const won = breachOk && surviveOk;
  return {
    unlocked: keyToOtherRealm(story),
    alreadyWon: story.completed === true,
    weaponRating,
    defenceRating,
    combatRating: combatRating(story),
    breachOk,
    surviveOk,
    won,
    failReason: won ? undefined : !breachOk ? 'firepower' : 'defence',
  };
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
