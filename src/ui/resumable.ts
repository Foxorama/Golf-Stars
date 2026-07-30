/**
 * THE ONE ANSWER TO "WHAT DOES THIS STATE PARK?" (GS-save-slots).
 *
 * There used to be two, and they disagreed. `app/persist.ts` was careful — a Story world round and an
 * Asgard tournament both passed the EXISTING offer through instead of snapshotting over it — while
 * `toTitle` in `ui/game.ts` had neither check and overwrote `state.resumable` itself, which `persist`
 * then faithfully wrote. Park a Voyage, play a Story world, hit Back to title: the Voyage was gone.
 *
 * So this module is the single source, and BOTH call it. That is the non-negotiable rule of the
 * feature: two descriptions of this decision is the bug it exists because of.
 *
 * It is deliberately a PURE function of `UiState` (no localStorage, no DOM, no clock), so
 * `tests/save-slots.test.ts` can assert the policy directly rather than through a browser.
 */

import type { UiState } from './gameState';
import { snapshotRun } from '../sim/rpg/run';
import type { RoundProgress } from '../sim/rpg/run';
import { ASGARD_FORMAT } from '../sim/rpg/formats';
import {
  clearSlot,
  runModeOf,
  slotModeOf,
  slotTag,
  upsertSlot,
  type LastPlayed,
  type RunSlots,
} from '../sim/rpg/runSlots';

/** What the save should hold right now: every parked run, and the pointer CONTINUE reads. */
export interface Resumable {
  runSlots: RunSlots;
  lastPlayed?: LastPlayed;
}

/**
 * WHAT LEAVING COSTS — the one description, in three cases (GS-save-slots).
 *
 *  - `hole`  — the run parks and continues on the hole you were on. Every parked mode: Voyage,
 *    Unending, Star Tour. This is the DECIDED rule, chosen over "replay the stop" because mixed rules
 *    are worse than any single rule — a player who learns one mode's behaviour would lose a run in
 *    another. It is also strictly less forgiving than the restart-the-stop resume it replaces.
 *  - `world` — a Story Tour world round. The campaign is saved (`fc_story`) but the ROUND is not: it
 *    owns no run slot, so the world is replayed from its first tee. A uniform promise is what the
 *    player is owed; a uniform LIE is not an acceptable way to get one, so this case says its own
 *    truth everywhere it is stated.
 *  - `forfeit` — the Asgard tournament, which is never persisted by design: leaving forfeits the
 *    attempt and hands back the suspended run it interrupted.
 *
 * Every exit surface reads this — the back-button confirm AND the settings sheet's return-to-title —
 * so no screen can quietly promise something the resume does not do.
 */
export type ResumeCost = 'hole' | 'world' | 'forfeit';

export function resumeCost(formatId: string | undefined, storyRound?: boolean): ResumeCost {
  if (storyRound) return 'world';
  if (formatId === ASGARD_FORMAT) return 'forfeit';
  return 'hole';
}

/** Does this run continue on the hole it was left on? */
export function keepsHoleOnResume(formatId: string | undefined, storyRound?: boolean): boolean {
  return resumeCost(formatId, storyRound) === 'hole';
}

/** The live in-progress round to carry on a snapshot — the hole reached plus the completed-hole card.
 *  Only for a run that continues on its hole; the other two costs park no round to continue. */
export function liveRoundProgress(state: UiState): RoundProgress | undefined {
  if (!state.play || !keepsHoleOnResume(state.run.formatId, state.run.storyRound)) return undefined;
  return { stopHoleIndex: state.play.holeIndex, stopPlayed: state.stopPlayed ?? [] };
}

/**
 * Fold the LIVE run into the parked slots.
 *
 * Five cases, and each is a rule rather than an exception:
 *  - **Asgard.** The tournament run is ephemeral (a mid-tournament quit resumes the SUSPENDED real
 *    run with the Rainbow Ball intact), so what gets parked is `asgardReturn`, in the slot the real
 *    run belongs to.
 *  - **A Story world round.** Its mode is `'story'`, and story owns no slot — the campaign is
 *    `fc_story`. So it moves the CONTINUE pointer and touches nothing else. This is what replaced the
 *    old "a Story round is NEVER the main-save resumable" exception: there is no longer anything to
 *    protect it from.
 *  - **A finished run.** Its slot is emptied. A dead run must never be offered back.
 *  - **Nothing worth continuing** — the title's placeholder run (no golfer), or a Star Tour session
 *    with no course teed off. The slots are left ALONE, which is the fix for opening the star map
 *    quietly eating the round you had parked there. `slotTag` is the same predicate the title card and
 *    the picker badge use, so all three agree about whether a slot is real.
 *  - **Anything else** parks in its own `mode:golfer` slot and moves the pointer.
 */
export function resumableState(state: UiState): Resumable {
  const unchanged: Resumable = { runSlots: state.runSlots, lastPlayed: state.lastPlayed };
  const run = state.run;

  // Asgard: park the suspended real run, never the tournament.
  if (run.formatId === ASGARD_FORMAT) {
    const snap = state.asgardReturn;
    const mode = snap ? slotModeOf(snap) : null;
    if (!snap || !mode || !slotTag(snap)) return unchanged;
    return {
      runSlots: upsertSlot(state.runSlots, mode, snap.characterId, snap),
      lastPlayed: { mode, characterId: snap.characterId ?? '' },
    };
  }

  const characterId = run.loadout.characterId;
  if (!characterId) return unchanged; // the title's placeholder run — nothing has been chosen yet
  const mode = runModeOf(run.formatId, run.storyRound);
  if (!mode) return unchanged;

  if (mode === 'story') {
    // The campaign IS the save (`fc_story`); all this owes the main save is "you were last here".
    return { runSlots: state.runSlots, lastPlayed: { mode, characterId } };
  }

  if (run.status !== 'active') {
    // Won, cut, banked or stranded — the ledger is banked and the run is over.
    return { runSlots: clearSlot(state.runSlots, mode, characterId), lastPlayed: state.lastPlayed };
  }

  const snap = snapshotRun(run, liveRoundProgress(state));
  if (!slotTag(snap)) return unchanged;
  return { runSlots: upsertSlot(state.runSlots, mode, characterId, snap), lastPlayed: { mode, characterId } };
}
