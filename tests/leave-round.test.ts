/**
 * LEAVING FOR GOOD (GS-leave-round) — the exit that was missing.
 *
 * GS-save-slots gave every mode its own parked run and GS-story-round-resume gave a campaign its own
 * live round, and between them they made the game very good at never throwing anything away. Which
 * left no way to throw anything away. Every exit parked, so:
 *
 *  - a Story world round teed off by accident could only be escaped by starting the whole CAMPAIGN
 *    over — the one control that existed was `storyRestartCampaign`, and it destroys everything;
 *  - a Star Tour round you had lost interest in came back every time you opened the mode;
 *  - and there was no way at all to say "I am finished with this run".
 *
 * So there are two exits now, and the whole feature is that they say different things and do
 * different things. `resumePromise` words the one that parks; `abandonPrompt` words the one that
 * discards, and both read a pure function of the run rather than describing themselves — the rule
 * this codebase keeps re-learning (GS-one-description).
 *
 * Pure reducer tests: no DOM, no localStorage. The settings row and the confirm card are guarded in a
 * real browser by `tests/settings-sheet.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { initState, reduce, currentRoster, type UiState } from '../src/ui/game';
import { abandonCost, abandonTarget, campaignWithLiveRound, resumableState } from '../src/ui/resumable';
import { abandonPrompt, backIntent, resumePromise } from '../src/ui/back';
import { readSlot, slotKey } from '../src/sim/rpg/runSlots';
import { ASGARD_FORMAT, STROKEPLAY_FORMAT } from '../src/sim/rpg/formats';

const LARRY = 'longshot-larry';
const BO = 'backspin-bo';

/** Dismiss any beat the flow lands on, so a walkthrough can reach the golf. */
function pastBeats(s: UiState): UiState {
  let guard = 0;
  while (s.screen === 'lore' && guard++ < 8) s = reduce(s, { type: 'dismissLore' });
  return s;
}

/** Play `holes` complete holes of the current stop, attacking every shot. */
function playHoles(s: UiState, holes: number): UiState {
  s = reduce(s, { type: 'playInteractive' });
  let guard = 0;
  for (let h = 0; h < holes; h++) {
    while (s.play && !s.play.done && guard++ < 600) s = reduce(s, { type: 'autoShotHole' });
    s = reduce(s, { type: 'holeComplete' });
  }
  return s;
}

/** A live run in `format` with `characterId`, `holes` holes into its first stop. */
function inRun(seed: string, format: string, characterId: string, holes = 2): UiState {
  const picked = reduce(initState(seed), { type: 'start', format });
  return playHoles(pastBeats(reduce(picked, { type: 'selectCharacter', characterId })), holes);
}

/** A live STORY world round, `holes` holes in. */
function inStoryRound(seed: string, characterId = BO, holes = 2): UiState {
  let s = reduce(initState(seed), { type: 'openStory' });
  s = reduce(s, { type: 'selectCharacter', characterId });
  s = pastBeats(reduce(s, { type: 'storyPlayWorld', courseId: 'standrews-18' }));
  return playHoles(s, holes);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('what giving it up costs is a pure function of the run', () => {
  it('answers per mode, and answers NOTHING where leaving already forfeits', () => {
    expect(abandonCost('voyage')).toBe('run');
    expect(abandonCost('unending')).toBe('run');
    expect(abandonCost(STROKEPLAY_FORMAT)).toBe('round');
    // A story round is played on the strokeplay format, so — exactly as in `runModeOf`, whose
    // discrimination this mirrors — the flag has to be asked FIRST or a campaign round is filed as a
    // Star Tour one and offered the wrong sentence.
    expect(abandonCost(STROKEPLAY_FORMAT, true)).toBe('world');
    // Asgard: `resumeCost` already says leaving forfeits the tournament, so a second control here
    // would be the same button twice.
    expect(abandonCost(ASGARD_FORMAT)).toBeNull();
  });

  it('there is nothing to give up on the title, in a finished run, or on an untee-d star map', () => {
    const title = initState('nothing');
    expect(abandonTarget(title)).toBeNull(); // the placeholder run: no golfer has been picked
    expect(abandonPrompt(title)).toBeNull();

    const live = inRun('something', 'voyage', LARRY);
    expect(abandonTarget(live)).toBe('run');
    expect(abandonTarget({ ...live, run: { ...live.run, status: 'ended' } })).toBeNull();

    // A Star Tour golfer standing on the chart with no course pinned has played nothing — the same
    // judgement `slotTag` makes about whether a parked run is worth offering back.
    const onMap = reduce(reduce(initState('map'), { type: 'openStarTour' }), { type: 'selectCharacter', characterId: LARRY });
    expect(onMap.run.staticCourseId).toBeUndefined();
    expect(abandonTarget(onMap)).toBeNull();
  });

  it('names what you are actually giving up — the verb changes when the thing changes', () => {
    const run = abandonPrompt(inRun('verbs', 'voyage', LARRY))!;
    // A Voyage stop is four holes inside a run with no smaller unit to leave, so calling this
    // control "leave the round" would be a lie about what the button does.
    expect(run.label).toMatch(/run/i);
    expect(run.label).not.toMatch(/round/i);
    expect(run.confirmLabel).not.toMatch(/round/i);
    expect(run.body).toMatch(/pays out nothing/i);

    const world = abandonPrompt(inStoryRound('verbs-story'))!;
    expect(world.label).toMatch(/round/i);
    // The campaign is the thing a player is afraid of losing, so the promise has to name it.
    expect(world.body).toMatch(/campaign keeps everything/i);
  });

  it('the row and its confirm read the SAME sentence, so a control cannot promise something milder', () => {
    const copy = abandonPrompt(inRun('one-description', 'unending', BO))!;
    // The settings row's sub-line IS the confirm card's body — one field, two renderers.
    expect(copy.body.length).toBeGreaterThan(30);
    // …and it is emphatically not the PARK promise, which is the other exit's job.
    expect(copy.body).not.toBe(resumePromise(inRun('one-description', 'unending', BO)));
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('the confirm cannot be reached, or dodged, by accident', () => {
  it('refuses to raise itself when there is nothing to give up', () => {
    const title = initState('no-confirm');
    expect(reduce(title, { type: 'requestLeaveRound' }).pendingLeave).toBeUndefined();
  });

  it('back CANCELS it — a stray second press must never be able to discard a round', () => {
    const s = reduce(inRun('back-cancels', 'voyage', LARRY), { type: 'requestLeaveRound' });
    expect(s.pendingLeave).toBe(true);
    const intent = backIntent(s);
    expect(intent).toEqual({ kind: 'dismiss', action: { type: 'cancelLeaveRound' } });
    const cancelled = reduce(s, intent.kind === 'dismiss' ? intent.action : { type: 'cancelLeaveRound' });
    expect(cancelled.pendingLeave).toBeUndefined();
    expect(cancelled.screen).toBe(s.screen);
    expect(cancelled.play?.holeIndex).toBe(s.play?.holeIndex);
  });

  it('and it never survives onto the title', () => {
    const s = reduce(inRun('no-survive', 'voyage', LARRY), { type: 'requestLeaveRound' });
    expect(reduce(s, { type: 'toTitle' }).pendingLeave).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('leaving a Story world round hands the campaign back whole', () => {
  it('lands at the hub with the campaign intact and NOTHING on offer', () => {
    const s = inStoryRound('story-leave');
    expect(s.screen).toBe('playing');
    const before = s.story!;

    const left = reduce(s, { type: 'leaveRound' });
    expect(left.screen).toBe('story');
    // The campaign is byte-for-byte what it was, minus the round it is no longer part-way through.
    expect({ ...left.story!, liveRound: undefined }).toEqual({ ...before, liveRound: undefined });
    expect(left.story!.liveRound).toBeUndefined();
    // …and the offer is gone from what would be WRITTEN, not merely from the live object — the golfer
    // picker reads `state.campaigns`, so a round cleared in one and not the other is GS-resume-slot-loss
    // in the campaign's half.
    expect(campaignWithLiveRound(left)?.liveRound).toBeUndefined();
    expect(currentRoster(left).campaigns[BO]?.liveRound).toBeUndefined();
    expect(left.play).toBeUndefined();
  });

  it('re-entering that campaign opens the hub, not the tee it was abandoned on', () => {
    const left = reduce(inStoryRound('story-reenter'), { type: 'leaveRound' });
    const back = reduce(reduce(left, { type: 'toTitle' }), { type: 'storyContinueCampaign', characterId: BO });
    expect(back.screen).toBe('story');
    expect(back.play).toBeUndefined();
    // The world was never cleared, so it is still there to fly back to and play again — which is what
    // the promise says, and the reason this is not "start the campaign over".
    expect(back.story!.characterId).toBe(BO);
  });

  it('and it invents no run slot, nor touches one parked in another mode', () => {
    // Park a Voyage with Larry first — the shape of the bug GS-save-slots exists because of.
    let s = reduce(inRun('story-vs-voyage', 'voyage', LARRY), { type: 'toTitle' });
    const parked = readSlot(resumableState(s).runSlots, 'voyage', LARRY)!;

    s = reduce(s, { type: 'openStory' });
    s = reduce(s, { type: 'selectCharacter', characterId: BO });
    s = playHoles(pastBeats(reduce(s, { type: 'storyPlayWorld', courseId: 'standrews-18' })), 2);
    const left = reduce(s, { type: 'leaveRound' });

    const disk = resumableState(left);
    expect(Object.keys(disk.runSlots)).toEqual([slotKey('voyage', LARRY)]);
    expect(readSlot(disk.runSlots, 'voyage', LARRY)).toEqual(parked);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('leaving a Star Tour round posts nothing and empties its slot', () => {
  function teedOff(seed: string): UiState {
    let s = reduce(reduce(initState(seed), { type: 'openStarTour' }), { type: 'selectCharacter', characterId: LARRY });
    s = pastBeats(reduce(s, { type: 'pickStarTourCourse', courseId: 'standrews-18' }));
    return playHoles(s, 2);
  }

  it('hands the player back to the chart, not the title', () => {
    const left = reduce(teedOff('st-leave'), { type: 'leaveRound' });
    expect(left.screen).toBe('starTour');
    expect(left.play).toBeUndefined();
    // A fresh strokeplay run for the same golfer, so the chart's flight and pick machinery has
    // something clean to work on — and no course pinned, so there is nothing left to continue.
    expect(left.run.formatId).toBe(STROKEPLAY_FORMAT);
    expect(left.run.loadout.characterId).toBe(LARRY);
    expect(left.run.staticCourseId).toBeUndefined();
  });

  it('banks no record and no shards — the payout path is never entered', () => {
    const s = teedOff('st-nothing');
    const left = reduce(s, { type: 'leaveRound' });
    expect(left.strokePlayBest).toEqual(s.strokePlayBest);
    expect(left.lastStrokeRecord).toBeUndefined();
    expect(left.shards).toBe(s.shards);
  });

  it('empties the slot, so the mode does not offer the round back', () => {
    const s = teedOff('st-slot');
    // It really was parked before — otherwise this test proves nothing.
    expect(readSlot(resumableState(s).runSlots, 'startour', LARRY)).toBeDefined();
    const left = reduce(s, { type: 'leaveRound' });
    expect(readSlot(resumableState(left).runSlots, 'startour', LARRY)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('giving up a Voyage or Unending run ends it', () => {
  it('lands on the title with the slot emptied and nothing paid out', () => {
    const s = inRun('give-up', 'voyage', LARRY);
    expect(readSlot(resumableState(s).runSlots, 'voyage', LARRY)).toBeDefined();

    const left = reduce(s, { type: 'leaveRound' });
    expect(left.screen).toBe('title');
    expect(readSlot(resumableState(left).runSlots, 'voyage', LARRY)).toBeNull();
    // A run you walked away from cashes nothing out: `leaveRound` never calls `runEndUpdates`, which
    // is the only thing that pays a shard or posts a leaderboard row.
    expect(left.shards).toBe(s.shards);
    expect(left.bestStableford).toBe(s.bestStableford);
  });

  it('and leaves every other mode alone', () => {
    let s = reduce(inRun('give-up-others', 'voyage', LARRY), { type: 'toTitle' });
    const parked = readSlot(resumableState(s).runSlots, 'voyage', LARRY)!;
    s = playHoles(pastBeats(reduce(reduce(s, { type: 'start', format: 'unending' }), { type: 'selectCharacter', characterId: BO })), 2);

    const left = reduce(s, { type: 'leaveRound' });
    const disk = resumableState(left);
    expect(readSlot(disk.runSlots, 'endless', BO)).toBeNull();
    expect(readSlot(disk.runSlots, 'voyage', LARRY)).toEqual(parked);
  });
});
