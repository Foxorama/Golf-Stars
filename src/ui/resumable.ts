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
import type { StoryLiveRound, StoryState } from '../sim/rpg/story';
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
 *  - `hole`  — the run parks and continues on the hole you were on. EVERY mode: Voyage, Unending,
 *    Star Tour, and — since GS-story-round-resume — Story Tour. This is the DECIDED rule, chosen over
 *    "replay the stop" because mixed rules are worse than any single rule: a player who learns one
 *    mode's behaviour would lose a round in whichever mode they learned second.
 *  - `forfeit` — the Asgard tournament, which is never persisted by design: leaving forfeits the
 *    attempt and hands back the suspended run it interrupted.
 *
 * There used to be a third, `world`: a Story round was replayed from its first tee, because the
 * campaign owned no run slot. It was an honest promise about a behaviour that was simply too harsh —
 * eighteen holes in, leaving for any reason cost the lot — so the behaviour changed rather than the
 * wording. The campaign now carries its own `liveRound`, and "one rule, every mode" is a description
 * instead of an aspiration.
 *
 * Every exit surface reads this — the back-button confirm AND the settings sheet's return-to-title —
 * so no screen can quietly promise something the resume does not do.
 */
export type ResumeCost = 'hole' | 'forfeit';

export function resumeCost(formatId: string | undefined, storyRound?: boolean): ResumeCost {
  // GS-story-round-resume: a Story world round used to cost the whole round ('world'). It no longer
  // does — the campaign carries its own `liveRound`, so story resumes on its hole like everything
  // else, and the "one rule, every mode" promise below is now literally true rather than aspirational.
  if (storyRound) return 'hole';
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

/**
 * WHAT THE CAMPAIGN PARKS — the `fc_story` twin of `resumableState` (GS-story-round-resume).
 *
 * A Story world round owns no run slot in `fc_save`: GS-save-slots deliberately kept the two blobs
 * apart, so the round's progress belongs in the campaign it is part of. This is the ONE function that
 * decides what that campaign should hold right now, and it is called by BOTH writers — `persistStory`
 * (which runs after every action) and `toTitle` (which folds the answer back into the live state).
 *
 * That is not ceremony. `persistStory` writing one thing while the in-memory campaign says another is
 * exactly the shape of GS-resume-slot-loss: the picker reads `state.campaigns`, so a round recorded to
 * disk but not to state is a round the Continue button cannot see. One function, both callers, no gap.
 *
 * `undefined` in ⇒ `undefined` out: a session with no campaign loaded writes no campaign.
 */
export function campaignWithLiveRound(state: UiState): StoryState | undefined {
  const story = state.story;
  if (!story) return undefined;
  const round = liveStoryRound(state);
  // Nothing in progress ⇒ the field is REMOVED, not left stale. Finishing a round, or walking back to
  // the clubhouse, must clear the offer — the same rule that empties a slot when a run ends. Returning
  // the identical object when there is nothing to change keeps a no-op action from churning the blob.
  if (!round) return story.liveRound ? { ...story, liveRound: undefined } : story;
  return { ...story, liveRound: round };
}

/** The live Story world round, or `undefined` when the player is not part-way through one. */
export function liveStoryRound(state: UiState): StoryLiveRound | undefined {
  const run = state.run;
  if (!run.storyRound || !run.staticCourseId || !state.play) return undefined;
  // A finished round has already banked itself into the campaign at `resolveStoryRound`; re-offering
  // it would put the player back on a tee they have walked off.
  if (run.status !== 'active') return undefined;
  return {
    courseId: run.staticCourseId,
    stopHoleIndex: state.play.holeIndex,
    stopPlayed: state.stopPlayed ?? [],
    ...(run.storyTournamentPartner ? { partnerId: run.storyTournamentPartner } : {}),
  };
}
