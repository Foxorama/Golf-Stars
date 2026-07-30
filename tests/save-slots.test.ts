/**
 * SAVE SLOTS (GS-save-slots) — one parked run per MODE, per GOLFER.
 *
 * What this file guards is the thing that was never true and that nothing on screen admitted: "I have
 * a Voyage going with Larry and an Unending going with Bo". There was ONE `activeRun` and four modes
 * wrote through it, so starting anything discarded whatever else was parked.
 *
 * The central assertions are therefore (a) the modes are genuinely independent, (b) the v32 → v33
 * migration loses nobody's run, (c) `persist` and `toTitle` give the SAME answer because there is only
 * one function that answers — which is the specific bug that let a parked Voyage be lost by playing a
 * Story world and tapping Back — and (d) a destructive overwrite always goes through the confirm.
 *
 * Pure reducer + pure sim tests: no DOM, no localStorage.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { currentRoster, initState, modeSlotTags, reduce, type UiState } from '../src/ui/game';
import { resumableState, keepsHoleOnResume, liveRoundProgress, resumeCost } from '../src/ui/resumable';
import { migrate, defaultSave, SAVE_VERSION } from '../src/save/schema';
import {
  clearSlot,
  migrateRunSlots,
  readSlot,
  runModeOf,
  slotKey,
  slotTag,
  slotTags,
  slotOverwriteWarning,
  slotsForMode,
  upsertSlot,
  RUN_MODE_LABEL,
  type RunSlots,
} from '../src/sim/rpg/runSlots';
import { currentCourse, type RunSnapshot } from '../src/sim/rpg/run';
import { ASGARD_FORMAT, STROKEPLAY_FORMAT } from '../src/sim/rpg/formats';
import { defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { emptyCampaignStore, upsertCampaign } from '../src/sim/rpg/storyRoster';
import { characterScreen } from '../src/render/golferCards';

const FEATHER = 'feather-fade';
const LARRY = 'longshot-larry';
const BO = 'backspin-bo';

const snap = (over: Partial<RunSnapshot> = {}): RunSnapshot => ({
  seed: 5,
  formatId: 'unending',
  stopIndex: 2,
  distanceFromStart: 6,
  credits: 120,
  perks: [],
  ...over,
});

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

/**
 * WHAT WOULD ACTUALLY BE ON DISK right now.
 *
 * The reducer is not the save: `state.runSlots` is only rewritten at the moments a slot changes hands
 * (park, resume, confirmed start-over), while `persist()` calls `resumableState` after EVERY action
 * and writes whatever it returns. So a test that asserts on `state.runSlots` alone is asserting on a
 * cache, not on the save — and the bug this whole feature is about lived in exactly that gap. These
 * two helpers are the pure equivalents of the two writers, and the walkthroughs below assert through
 * them.
 */
const saved = (s: UiState) => resumableState(s);
/** …and the campaign half, the pure equivalent of `persistStory` → `writeStory` (an upsert of the
 *  LIVE campaign into the roster, leaving every other golfer's slot alone). */
const savedCampaigns = (s: UiState) => currentRoster(s);

/** Dismiss any story/lore beat the flow lands on, so a walkthrough can reach the golf. */
function pastBeats(s: UiState): UiState {
  let guard = 0;
  while (s.screen === 'lore' && guard++ < 8) s = reduce(s, { type: 'dismissLore' });
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('a run belongs to exactly one mode, and the format says which', () => {
  it('derives the mode from the format — and `storyRound` outranks it', () => {
    expect(runModeOf('voyage')).toBe('voyage');
    expect(runModeOf('unending')).toBe('endless');
    expect(runModeOf(STROKEPLAY_FORMAT)).toBe('startour');
    // A Story world round is played on the STROKEPLAY format (a pinned static course), so the format
    // alone would file it under Star Tour and let a campaign round overwrite a parked free-roam round.
    expect(runModeOf(STROKEPLAY_FORMAT, true)).toBe('story');
    // The Asgard tournament run is ephemeral by design — it belongs in no slot at all.
    expect(runModeOf(ASGARD_FORMAT)).toBeNull();
    // A retired format id folds into the default, exactly as `getFormat` does, so an old save resumes.
    expect(runModeOf('ladder')).toBe('endless');
  });

  it('keys, reads and clears one slot at a time without touching the others', () => {
    let slots: RunSlots = {};
    slots = upsertSlot(slots, 'voyage', LARRY, snap({ formatId: 'voyage' }));
    slots = upsertSlot(slots, 'endless', BO, snap({ holesSurvived: 33 }));
    expect(Object.keys(slots).sort()).toEqual([slotKey('endless', BO), slotKey('voyage', LARRY)]);
    expect(readSlot(slots, 'voyage', BO)).toBeNull(); // same golfer ≠ same mode, and vice versa
    slots = clearSlot(slots, 'voyage', LARRY);
    expect(readSlot(slots, 'voyage', LARRY)).toBeNull();
    expect(readSlot(slots, 'endless', BO)?.holesSurvived).toBe(33);
    // Clearing nothing returns the SAME object, so a no-op action can't churn the save.
    expect(clearSlot(slots, 'voyage', LARRY)).toBe(slots);
  });

  it('badges a slot with where the run got to, and refuses to badge one there is no point continuing', () => {
    expect(slotTag(snap({ formatId: 'voyage', stopIndex: 6 }))?.short).toBe('Stop 7');
    expect(slotTag(snap({ holesSurvived: 33 }))?.short).toBe('Hole 34');
    expect(
      slotTag(snap({ formatId: STROKEPLAY_FORMAT, staticCourseId: 'verdant-18', stopHoleIndex: 11 }))?.short,
    ).toBe('Hole 12/18');
    // A Star Tour run with no course pinned is a golfer standing on the star map — nothing played.
    expect(slotTag(snap({ formatId: STROKEPLAY_FORMAT }))).toBeNull();
    expect(slotTag(snap({ formatId: ASGARD_FORMAT }))).toBeNull();
  });

  it('every mode a slot can hold has a name, so CONTINUE can always say which one it means', () => {
    for (const mode of ['voyage', 'endless', 'startour', 'story'] as const) {
      expect(RUN_MODE_LABEL[mode].length).toBeGreaterThan(0);
    }
  });

  it('re-keys a persisted table off the snapshot itself — the key is an index, the run is the truth', () => {
    const table = migrateRunSlots({
      // Filed under the wrong mode by a hand-edited blob…
      'startour:longshot-larry': snap({ formatId: 'voyage', characterId: LARRY }),
      // …and an Asgard snapshot that should never have been parked at all.
      'voyage:feather-fade': snap({ formatId: ASGARD_FORMAT, characterId: FEATHER }),
      junk: null,
    });
    expect(Object.keys(table)).toEqual([slotKey('voyage', LARRY)]);
    expect(slotsForMode(table, 'voyage')[LARRY]?.characterId).toBe(LARRY);
    expect(migrateRunSlots('nonsense')).toEqual({});
  });

  it('warns about a slot it would destroy, and about nothing else', () => {
    const slots = upsertSlot({}, 'voyage', LARRY, snap({ formatId: 'voyage', stopIndex: 4 }));
    expect(slotOverwriteWarning(slots, 'voyage', LARRY)?.tag.short).toBe('Stop 5');
    expect(slotOverwriteWarning(slots, 'voyage', FEATHER)).toBeNull();
    expect(slotOverwriteWarning(slots, 'endless', LARRY)).toBeNull();
    expect(slotTags(slots, 'voyage')[LARRY]?.short).toBe('Stop 5');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('save v32 → v33 loses nobody a run', () => {
  it('files the single activeRun into its own slot and points CONTINUE at it', () => {
    expect(SAVE_VERSION).toBe(34);
    const v32 = {
      ...defaultSave(),
      version: 32,
      runSlots: undefined,
      activeRun: { seed: 7, formatId: 'voyage', characterId: LARRY, stopIndex: 5, distanceFromStart: 30, credits: 120, perks: ['gyro'] },
    } as unknown;
    const s = migrate(v32);
    expect(s.version).toBe(SAVE_VERSION);
    expect(readSlot(s.runSlots, 'voyage', LARRY)).toMatchObject({ seed: 7, stopIndex: 5, perks: ['gyro'] });
    expect(s.lastPlayed).toEqual({ mode: 'voyage', characterId: LARRY });
    // The field is GONE, not kept alongside — two descriptions of "the resumable run" is the bug.
    expect('activeRun' in s).toBe(false);
  });

  it('a v32 save with nothing parked migrates to an empty table and no pointer', () => {
    const s = migrate({ ...defaultSave(), version: 32, runSlots: undefined } as unknown);
    expect(s.runSlots).toEqual({});
    expect(s.lastPlayed).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('the modes no longer fight over one slot', () => {
  /** Park a run in `format` with `characterId`, ending back on the title. */
  function park(s: UiState, format: string, characterId: string): UiState {
    const picked = reduce(s, { type: 'start', format });
    const run = reduce(picked, { type: 'selectCharacter', characterId });
    return reduce(run, { type: 'toTitle' });
  }

  it('a Voyage and an Unending run coexist, each with their own golfer', () => {
    let s = park(initState('two-modes'), 'voyage', LARRY);
    s = park(s, 'unending', BO);
    expect(readSlot(s.runSlots, 'voyage', LARRY)?.formatId).toBe('voyage');
    expect(readSlot(s.runSlots, 'endless', BO)?.formatId).toBe('unending');
    expect(s.lastPlayed).toEqual({ mode: 'endless', characterId: BO });
    // …and CONTINUE resumes the one it names, not the other.
    const resumed = reduce(s, { type: 'resume' });
    expect(resumed.run.formatId).toBe('unending');
    expect(resumed.run.loadout.characterId).toBe(BO);
    expect(readSlot(resumed.runSlots, 'voyage', LARRY)).toBeDefined();
  });

  it('two golfers can each have a run going in the SAME mode', () => {
    let s = park(initState('two-golfers'), 'voyage', LARRY);
    s = park(s, 'voyage', FEATHER);
    expect(readSlot(s.runSlots, 'voyage', LARRY)).toBeDefined();
    expect(readSlot(s.runSlots, 'voyage', FEATHER)).toBeDefined();
  });

  it('merely CHOOSING a mode parks nothing and destroys nothing', () => {
    const parked = park(initState('look-only'), 'unending', BO);
    // "I'll just look at the Voyage" used to clear the one resume offer outright.
    const looking = reduce(parked, { type: 'start', format: 'voyage' });
    expect(readSlot(looking.runSlots, 'endless', BO)).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('there is ONE answer to "what does this state park"', () => {
  it('persist and toTitle both call it, and neither re-derives it (source scan)', () => {
    const persistSrc = readFileSync('src/app/persist.ts', 'utf8');
    const gameSrc = readFileSync('src/ui/game.ts', 'utf8');
    expect(persistSrc).toContain('resumableState');
    expect(gameSrc).toContain('resumableState');
    // The tell of a second description: `persist` used to build its own snapshot, with its own
    // Story/Asgard exceptions that `toTitle` did not have.
    expect(persistSrc).not.toContain('snapshotRun');
  });

  it('a parked Voyage SURVIVES playing a Story world and going back to the title', () => {
    // The open bug this redesign subsumes. `persist` knew a Story round must not overwrite the parked
    // run; `toTitle` did not, and overwrote `state.resumable` itself — which `persist` then wrote.
    const story = defaultStoryState(FEATHER);
    const voyage = snap({ formatId: 'voyage', characterId: LARRY, stopIndex: 4 });
    let s = initState(
      'story-vs-voyage',
      { runSlots: upsertSlot({}, 'voyage', LARRY, voyage), lastPlayed: { mode: 'voyage', characterId: LARRY } },
      undefined,
      story,
      upsertCampaign(emptyCampaignStore(), story),
    );
    s = reduce(s, { type: 'openStory' });
    s = reduce(s, { type: 'selectCharacter', characterId: FEATHER });
    expect(s.screen).toBe('story');
    s = reduce(s, { type: 'storyPlayWorld', courseId: 'standrews-18' });
    expect(s.run.storyRound).toBe(true);

    s = reduce(s, { type: 'toTitle' });
    expect(readSlot(s.runSlots, 'voyage', LARRY)).toEqual(voyage); // ← the bug
    // Story owns no slot (its save is the campaign), so all it moves is the pointer.
    expect(s.lastPlayed).toEqual({ mode: 'story', characterId: FEATHER });
    expect(readSlot(s.runSlots, 'startour', FEATHER)).toBeNull();
  });

  it('an Asgard tournament parks the SUSPENDED run, never the tournament', () => {
    const suspended = snap({ formatId: 'voyage', characterId: LARRY, stopIndex: 7 });
    const base = reduce(reduce(initState('asgard'), { type: 'start', format: 'voyage' }), {
      type: 'selectCharacter',
      characterId: LARRY,
    });
    const during: UiState = {
      ...base,
      run: { ...base.run, formatId: ASGARD_FORMAT },
      asgardReturn: suspended,
      runSlots: {},
    };
    const { runSlots, lastPlayed } = resumableState(during);
    expect(readSlot(runSlots, 'voyage', LARRY)).toEqual(suspended);
    expect(lastPlayed).toEqual({ mode: 'voyage', characterId: LARRY });
  });

  it('opening the star map with no course teed off does not eat the round parked there', () => {
    const round = snap({ formatId: STROKEPLAY_FORMAT, characterId: FEATHER, staticCourseId: 'verdant-18', stopHoleIndex: 9 });
    const base = initState('startour-open', {
      runSlots: upsertSlot({}, 'startour', FEATHER, round),
      lastPlayed: { mode: 'startour', characterId: FEATHER },
      starTourUnlocked: true,
    });
    const s = reduce(base, { type: 'openStarTour' });
    expect(resumableState(s).runSlots).toEqual(base.runSlots);
  });

  it('a run that has ENDED gives up its slot — a dead run is never offered back', () => {
    const started = reduce(reduce(initState('ended'), { type: 'start', format: 'voyage' }), {
      type: 'selectCharacter',
      characterId: LARRY,
    });
    const parked = resumableState(started).runSlots;
    expect(readSlot(parked, 'voyage', LARRY)).toBeDefined();
    const over: UiState = { ...started, runSlots: parked, run: { ...started.run, status: 'ended', endedReason: 'cut' } };
    expect(readSlot(resumableState(over).runSlots, 'voyage', LARRY)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('the overwrite guard is universal now, not story-only', () => {
  function parkedVoyage(): UiState {
    const s = reduce(reduce(initState('overwrite'), { type: 'start', format: 'voyage' }), {
      type: 'selectCharacter',
      characterId: LARRY,
    });
    // Play two holes before parking. A run parked at stop 0 with an empty card is INDISTINGUISHABLE
    // from a fresh one, so asserting `stopIndex` alone would pass with the continue-guard deleted —
    // the card is what makes "continued" a claim worth checking.
    return reduce(playHoles(s, 2), { type: 'toTitle' });
  }

  it('tapping a golfer who already has a run CONTINUES it — it never silently starts over', () => {
    const parked = parkedVoyage();
    const before = readSlot(parked.runSlots, 'voyage', LARRY)!;
    expect(before.stopPlayed).toHaveLength(2);
    const picker = reduce(parked, { type: 'start', format: 'voyage' });
    const cont = reduce(picker, { type: 'selectCharacter', characterId: LARRY });
    expect(cont.run.stopIndex).toBe(before.stopIndex);
    expect(cont.run.loadout.characterId).toBe(LARRY);
    // The card came back, and it teed up the hole it was left on rather than the first.
    expect(cont.screen).toBe('playing');
    expect(cont.play!.holeIndex).toBe(2);
    expect(cont.stopPlayed!.map((p) => p.record.strokes)).toEqual(before.stopPlayed!.map((p) => p.record.strokes));
  });

  it('a golfer with NO run in this mode simply starts theirs, and the other slot is untouched', () => {
    const picker = reduce(parkedVoyage(), { type: 'start', format: 'voyage' });
    const fresh = reduce(picker, { type: 'selectCharacter', characterId: FEATHER });
    expect(fresh.run.loadout.characterId).toBe(FEATHER);
    expect(fresh.run.stopIndex).toBe(0);
    expect(readSlot(fresh.runSlots, 'voyage', LARRY)).toBeDefined();
  });

  it('starting over needs the confirm, and cancelling leaves the run exactly where it was', () => {
    const picker = reduce(parkedVoyage(), { type: 'start', format: 'voyage' });
    const asked = reduce(picker, { type: 'slotRequestRestart', characterId: LARRY });
    expect(asked.slotOverwriteId).toBe(LARRY);
    // Cancel → nothing written.
    const cancelled = reduce(asked, { type: 'slotCancelRestart' });
    expect(cancelled.slotOverwriteId).toBeUndefined();
    expect(readSlot(cancelled.runSlots, 'voyage', LARRY)).toBeDefined();
    // Confirm → the slot is emptied THERE AND THEN, not left standing until a new run happens to
    // overwrite it, and the fresh run really is fresh.
    const restarted = reduce(asked, { type: 'selectCharacter', characterId: LARRY });
    expect(readSlot(restarted.runSlots, 'voyage', LARRY)).toBeNull();
    expect(restarted.run.stopIndex).toBe(0);
    expect(restarted.slotOverwriteId).toBeUndefined();
  });

  it('refuses to raise a confirm for a golfer with nothing to overwrite', () => {
    const picker = reduce(parkedVoyage(), { type: 'start', format: 'voyage' });
    expect(reduce(picker, { type: 'slotRequestRestart', characterId: FEATHER }).slotOverwriteId).toBeUndefined();
    // …and the confirm never survives onto the title, where the NEXT mode's first pick would use it.
    const asked = reduce(picker, { type: 'slotRequestRestart', characterId: LARRY });
    expect(reduce(asked, { type: 'toTitle' }).slotOverwriteId).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('the picker shows what a tap will do before it is tapped', () => {
  const tags = { [LARRY]: slotTag(snap({ formatId: 'voyage', stopIndex: 6 }))! };

  it('badges the golfer with a run going, and offers Continue rather than the start verb', () => {
    const html = characterScreen({}, { modeName: 'The Voyage', slotTags: tags });
    expect(html).toContain('▶ Stop 7');
    expect(html).toContain('Continue as');
    expect(html).toContain('slotRequestRestart');
    // A golfer with no run keeps the ordinary start verb, so the two states are distinguishable.
    expect(html).toContain('Voyage as');
  });

  it('renders byte-for-byte as it did before slots existed when no run is parked', () => {
    expect(characterScreen({}, { modeName: 'The Voyage' })).toBe(
      characterScreen({}, { modeName: 'The Voyage', slotTags: {} }),
    );
  });

  it('the start-over confirm carries the SAME pick action as the card, difficulty and all', () => {
    const html = characterScreen({}, {
      modeName: 'The Voyage',
      slotTags: tags,
      overwriteId: LARRY,
      ascension: { max: 5, sel: 3 },
    });
    expect(html).toContain('Start over as');
    expect(html).toContain('slotCancelRestart');
    // Built separately the confirm would quietly drop the Ascension the pills above it are showing.
    expect(html).toContain('"type":"selectCharacter","characterId":"longshot-larry","ascension":3');
  });

  it('shows no confirm for a golfer the picker has nothing parked for', () => {
    expect(characterScreen({}, { slotTags: {}, overwriteId: LARRY })).not.toContain('Start over as');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('what a resume promises — one rule, three honest answers', () => {
  it('every PARKED mode continues on the hole; the two that cannot say their own truth', () => {
    expect(resumeCost('voyage')).toBe('hole');
    expect(resumeCost('unending')).toBe('hole');
    expect(resumeCost(STROKEPLAY_FORMAT)).toBe('hole');
    // A Story world round owns no run slot — the campaign is saved, the round is replayed.
    expect(resumeCost(STROKEPLAY_FORMAT, true)).toBe('world');
    // The Asgard tournament is never persisted: leaving forfeits the attempt.
    expect(resumeCost(ASGARD_FORMAT)).toBe('forfeit');
    expect(keepsHoleOnResume('voyage')).toBe(true);
    expect(keepsHoleOnResume(ASGARD_FORMAT)).toBe(false);
  });

  it('carries the live hole + card for a run that continues on it', () => {
    let s = reduce(reduce(initState('progress'), { type: 'start', format: 'unending' }), {
      type: 'selectCharacter',
      characterId: BO,
    });
    s = reduce(s, { type: 'playInteractive' });
    expect(liveRoundProgress(s)).toEqual({ stopHoleIndex: 0, stopPlayed: [] });
    // …and none at all for a Story world round, which is not parked.
    const storyish: UiState = { ...s, run: { ...s.run, storyRound: true } };
    expect(liveRoundProgress(storyish)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('a parked run resumes on the hole it was left on, in every mode', () => {
  function parkAndResume(format: string, characterId: string, holes: number, seed: string) {
    const started = reduce(reduce(initState(seed), { type: 'start', format }), {
      type: 'selectCharacter',
      characterId,
    });
    const mid = playHoles(started, holes);
    const title = reduce(mid, { type: 'toTitle' });
    return { mid, resumed: reduce(title, { type: 'resume' }) };
  }

  it('an Unending stop keeps its card and tees up the hole you were on', () => {
    const { mid, resumed } = parkAndResume('unending', BO, 2, 'endless-resume');
    expect(mid.play!.holeIndex).toBe(2);
    expect(resumed.screen).toBe('playing');
    expect(resumed.play!.holeIndex).toBe(2);
    expect(resumed.stopPlayed).toHaveLength(2);
    expect(resumed.stopPlayed!.map((p) => p.record.strokes)).toEqual(mid.stopPlayed!.map((p) => p.record.strokes));
    // …and playing out from there still finishes the stop and scores every hole of it.
    let out = resumed;
    let guard = 0;
    while (out.screen === 'playing' && guard++ < 400) {
      while (out.play && !out.play.done && guard++ < 900) out = reduce(out, { type: 'autoShotHole' });
      out = reduce(out, { type: 'holeComplete' });
    }
    expect(out.played).toHaveLength(out.course.holes.length);
  });

  it('a Voyage stop does the same — the rule does not change with the mode', () => {
    const { mid, resumed } = parkAndResume('voyage', LARRY, 3, 'voyage-resume');
    expect(resumed.screen).toBe('playing');
    expect(resumed.play!.holeIndex).toBe(3);
    expect(resumed.stopPlayed).toHaveLength(3);
    expect(resumed.run.stopIndex).toBe(mid.run.stopIndex);
  });

  it('a matchplay BOSS stop rebuilds the duel standing rather than remembering it', () => {
    // Sit the run down on the voyage's Arc-I boss (stop index 2) rather than walking nine stops to it —
    // the stop is what is under test, not the road there.
    const base = reduce(reduce(initState('boss-resume'), { type: 'start', format: 'voyage' }), {
      type: 'selectCharacter',
      characterId: LARRY,
    });
    const bossRun = { ...base.run, stopIndex: 2 };
    let s: UiState = { ...base, run: bossRun, course: currentCourse(bossRun) };
    s = reduce(s, { type: 'playInteractive' });
    expect(s.match).toBeDefined(); // a matchplay boss really is armed here
    let guard = 0;
    for (let h = 0; h < 3; h++) {
      while (s.play && !s.play.done && guard++ < 600) s = reduce(s, { type: 'autoShotHole' });
      s = reduce(s, { type: 'holeComplete' });
    }
    const before = s.match!;
    expect(before.duels).toHaveLength(3);
    const resumed = reduce(reduce(s, { type: 'toTitle' }), { type: 'resume' });
    expect(resumed.screen).toBe('playing');
    expect(resumed.match).toBeDefined();
    // The boss's whole card comes off its OWN `:boss` stream, so it rebuilds byte-for-byte…
    expect(resumed.match!.bossId).toBe(before.bossId);
    expect(resumed.match!.bossHoles.map((h) => h.record.strokes)).toEqual(before.bossHoles.map((h) => h.record.strokes));
    // …and the standing folds back out of the cards the player actually banked.
    expect(resumed.match!.duels).toHaveLength(3);
    expect(resumed.match!.holesUp).toBe(before.holesUp);
    expect(resumed.match!.decided).toBe(before.decided);
    // A best-ball partner array must stay index-aligned with the holes played, or every later reveal
    // reads somebody else's card.
    if (before.partnerHoles) expect(resumed.match!.partnerHoles).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * SWITCHING GOLFERS INSIDE ONE MODE — the walkthrough, not the unit.
 *
 * The cases above each check one reducer decision. What a player actually does is a SEQUENCE, and
 * this is the sequence that used to cost them a run: open a mode, see a golfer you have a run going
 * with, pick somebody else instead, and play. Every assertion is made through `saved()` — what
 * `persist` would write — because `state.runSlots` is a cache and the bug lived in the gap.
 */
describe('walkthrough: changing golfer on the Voyage picker', () => {
  /** Start the Voyage as `who`, play `holes`, and park back on the title. */
  function parkVoyage(s: UiState, who: string, holes: number): UiState {
    const picker = reduce(s, { type: 'start', format: 'voyage' });
    const run = reduce(picker, { type: 'selectCharacter', characterId: who });
    return reduce(playHoles(run, holes), { type: 'toTitle' });
  }

  it('picking a DIFFERENT golfer starts theirs and leaves the first run byte-for-byte intact', () => {
    // Larry has a Voyage going, three holes into his first stop.
    const afterLarry = parkVoyage(initState('switch-voyage'), LARRY, 3);
    const larrySnap = readSlot(saved(afterLarry).runSlots, 'voyage', LARRY)!;
    expect(larrySnap.stopPlayed).toHaveLength(3);
    expect(saved(afterLarry).lastPlayed).toEqual({ mode: 'voyage', characterId: LARRY });

    // Re-enter the Voyage. The picker badges Larry — and ONLY Larry.
    const picker = reduce(afterLarry, { type: 'start', format: 'voyage' });
    expect(Object.keys(modeSlotTags(picker))).toEqual([LARRY]);
    expect(modeSlotTags(picker)[LARRY]!.short).toBe('Stop 1');

    // Tap FEATHER instead. She has no run, so she starts one — Larry's is not consulted, not
    // continued, and not touched.
    const feather = reduce(picker, { type: 'selectCharacter', characterId: FEATHER });
    expect(feather.run.loadout.characterId).toBe(FEATHER);
    expect(feather.run.stopIndex).toBe(0);
    expect(feather.screen).toBe('intro'); // a fresh run's intro, not Larry's mid-stop 'playing'
    expect(feather.stopPlayed).toBeUndefined();

    // Play her, park her, and check BOTH saves.
    const parked = reduce(playHoles(feather, 2), { type: 'toTitle' });
    const disk = saved(parked);
    expect(readSlot(disk.runSlots, 'voyage', LARRY)).toEqual(larrySnap); // untouched, field for field
    expect(readSlot(disk.runSlots, 'voyage', FEATHER)!.stopPlayed).toHaveLength(2);
    expect(readSlot(disk.runSlots, 'voyage', FEATHER)!.characterId).toBe(FEATHER);
    // Two runs, one mode, two golfers — and CONTINUE offers the one just played.
    expect(Object.keys(disk.runSlots).sort()).toEqual([slotKey('voyage', FEATHER), slotKey('voyage', LARRY)].sort());
    expect(disk.lastPlayed).toEqual({ mode: 'voyage', characterId: FEATHER });
    expect(reduce(parked, { type: 'resume' }).run.loadout.characterId).toBe(FEATHER);
  });

  it('continuing the FIRST golfer afterwards still lands on their own run, at their own hole', () => {
    let s = parkVoyage(initState('switch-back'), LARRY, 3);
    const larrySnap = readSlot(saved(s).runSlots, 'voyage', LARRY)!;
    s = reduce(reduce(s, { type: 'start', format: 'voyage' }), { type: 'selectCharacter', characterId: FEATHER });
    s = reduce(playHoles(s, 2), { type: 'toTitle' });

    // Back into the Voyage: both golfers are badged now, each with their own run.
    const picker = reduce(s, { type: 'start', format: 'voyage' });
    expect(Object.keys(modeSlotTags(picker)).sort()).toEqual([FEATHER, LARRY].sort());

    // Tap Larry — his card, his hole, not Feather's.
    const back = reduce(picker, { type: 'selectCharacter', characterId: LARRY });
    expect(back.screen).toBe('playing');
    expect(back.run.loadout.characterId).toBe(LARRY);
    expect(back.play!.holeIndex).toBe(3);
    expect(back.stopPlayed!.map((p) => p.record.strokes)).toEqual(larrySnap.stopPlayed!.map((p) => p.record.strokes));
    // Feather's run is still parked while Larry's is live.
    expect(readSlot(saved(back).runSlots, 'voyage', FEATHER)).toBeDefined();
  });

  /**
   * THE ONE THAT GOT AWAY (GS-resume-slot-loss).
   *
   * `resume` used to `clearSlot` the run it was picking up, on the reasoning that the offer had been
   * consumed and `persist` would re-park it from the live run on that very action. The re-park is
   * real; the conclusion was not. `resumableState` builds the save from `state.runSlots` PLUS the
   * live run, so the clear survived exactly as long as the live run stayed that golfer's — and
   * "‹ Change golfer" is the button whose whole job is to make it somebody else's.
   *
   * These walk it in the reducer, and they assert through `saved()` (what would be ON DISK) rather
   * than `state.runSlots`, because the gap between those two is where the bug lived. Every existing
   * walkthrough in this file went through `toTitle`, which folds `resumableState` back into the state
   * and healed the table — which is exactly why none of them caught it.
   */
  it('resuming a golfer and then CHANGING GOLFER keeps the resumed run (GS-resume-slot-loss)', () => {
    // Larry has a Voyage parked. Leaving from the intro (rather than mid-hole) is what makes the
    // resume land back on the intro, which is the only screen that offers "‹ Change golfer".
    let s = reduce(reduce(initState('resume-swap'), { type: 'start', format: 'voyage' }), {
      type: 'selectCharacter',
      characterId: LARRY,
    });
    s = reduce(s, { type: 'toTitle' });
    const larrySnap = readSlot(saved(s).runSlots, 'voyage', LARRY)!;
    expect(larrySnap).toBeDefined();

    // Re-enter, tap Larry — this is the resume that used to empty his slot.
    s = reduce(reduce(s, { type: 'start', format: 'voyage' }), { type: 'selectCharacter', characterId: LARRY });
    expect(s.screen).toBe('intro');
    expect(s.run.loadout.characterId).toBe(LARRY);
    // The table still holds him WHILE he is live. That is the invariant: `state.runSlots` is a
    // faithful superset of the save, never a subset of it.
    expect(readSlot(s.runSlots, 'voyage', LARRY), 'resume emptied the slot it just picked up').toBeDefined();
    expect(readSlot(saved(s).runSlots, 'voyage', LARRY)).toBeDefined();

    // Change your mind.
    s = reduce(s, { type: 'backToCharacter' });
    expect(s.screen).toBe('character');
    expect(readSlot(saved(s).runSlots, 'voyage', LARRY)).toBeDefined();

    // Pick somebody else. THIS is the action that used to write a save with no trace of Larry.
    s = reduce(s, { type: 'selectCharacter', characterId: FEATHER });
    expect(s.run.loadout.characterId).toBe(FEATHER);
    const disk = saved(s);
    expect(readSlot(disk.runSlots, 'voyage', LARRY), "Larry's parked run was lost").toEqual(larrySnap);
    expect(readSlot(disk.runSlots, 'voyage', FEATHER)).toBeDefined();

    // And it survives being played on and parked, which is where the player actually noticed.
    const parked = saved(reduce(playHoles(s, 1), { type: 'toTitle' }));
    expect(readSlot(parked.runSlots, 'voyage', LARRY)).toEqual(larrySnap);
    expect(readSlot(parked.runSlots, 'voyage', FEATHER)!.stopPlayed).toHaveLength(1);
  });

  it('a resume never DROPS a slot — the table may lead the save, never trail it', () => {
    // Stated as the general rule rather than the one path, because the specific path was reachable
    // only through the intro's Change golfer and the next such route would not be.
    for (const [format, mode] of [['voyage', 'voyage'], ['unending', 'endless']] as const) {
      let s = reduce(reduce(initState(`no-drop-${format}`), { type: 'start', format }), {
        type: 'selectCharacter',
        characterId: BO,
      });
      s = reduce(s, { type: 'toTitle' });
      const before = Object.keys(saved(s).runSlots);
      expect(before).toContain(slotKey(mode, BO));

      const resumed = reduce(s, { type: 'resume', mode, characterId: BO });
      expect(Object.keys(resumed.runSlots), `${format}: resume dropped a slot from the table`).toEqual(before);
      expect(Object.keys(saved(resumed).runSlots).sort()).toEqual(before.sort());
    }
  });

  it('a golfer with a run in ANOTHER mode is not badged here, and picking them starts a fresh one', () => {
    // Bo is deep in the Unending Universe; that must say nothing about Bo on the Voyage picker.
    const bo = reduce(reduce(initState('cross-mode-pick'), { type: 'start', format: 'unending' }), {
      type: 'selectCharacter',
      characterId: BO,
    });
    const parked = reduce(playHoles(bo, 2), { type: 'toTitle' });
    const boEndless = readSlot(saved(parked).runSlots, 'endless', BO)!;

    const picker = reduce(parked, { type: 'start', format: 'voyage' });
    expect(modeSlotTags(picker)).toEqual({}); // nothing parked in THIS mode
    const voyageBo = reduce(picker, { type: 'selectCharacter', characterId: BO });
    expect(voyageBo.screen).toBe('intro');
    expect(voyageBo.run.formatId).toBe('voyage');
    expect(voyageBo.run.stopIndex).toBe(0);

    const after = saved(reduce(playHoles(voyageBo, 2), { type: 'toTitle' }));
    // One golfer, two modes, two independent runs.
    expect(readSlot(after.runSlots, 'endless', BO)).toEqual(boEndless);
    expect(readSlot(after.runSlots, 'voyage', BO)!.formatId).toBe('voyage');
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * CROSSING FROM A RUN INTO A CAMPAIGN — the other walkthrough, and where the original bug lived.
 *
 * Story Tour is the mode that owns no run slot: its save is the `fc_story` roster. So this walks the
 * full path a player takes (Voyage → title → Story Tour → pick → play a world → title) and checks
 * BOTH writers afterwards — the run slots `persist` writes and the roster `persistStory` upserts —
 * including the case where it is the SAME golfer on both sides, whose two saves live in two different
 * keyspaces and must not know about each other.
 */
describe('walkthrough: Voyage → title → Story Tour', () => {
  /** A boot state holding campaigns, so the Story picker has a roster to be right about. */
  function booted(seed: string, ...stories: StoryState[]): UiState {
    const roster = stories.reduce((r, st) => upsertCampaign(r, st), emptyCampaignStore());
    return initState(seed, {}, undefined, stories[0], roster);
  }

  /** Park a Voyage run for `who`, ending on the title. */
  function parkVoyage(s: UiState, who: string, holes: number): UiState {
    const run = reduce(reduce(s, { type: 'start', format: 'voyage' }), { type: 'selectCharacter', characterId: who });
    return reduce(playHoles(run, holes), { type: 'toTitle' });
  }

  it('starting a DIFFERENT golfer’s campaign leaves the parked Voyage and every other campaign alone', () => {
    // Feather already has a campaign three chapters in; Larry has a Voyage going.
    const feathersCampaign = { ...defaultStoryState(FEATHER), chapter: 3, credits: 900 };
    let s = parkVoyage(booted('run-into-story', feathersCampaign), LARRY, 3);
    const larrySnap = readSlot(saved(s).runSlots, 'voyage', LARRY)!;

    // Into Story Tour, and pick BO — a golfer with no campaign at all.
    s = reduce(s, { type: 'openStory' });
    expect(s.screen).toBe('character');
    s = reduce(s, { type: 'selectCharacter', characterId: BO });
    expect(s.screen).toBe('story');
    expect(s.story!.characterId).toBe(BO);

    // Play one of Bo's world rounds and go back to the title.
    s = pastBeats(reduce(s, { type: 'storyPlayWorld', courseId: 'standrews-18' }));
    expect(s.run.storyRound).toBe(true);
    s = reduce(playHoles(s, 2), { type: 'toTitle' });

    const disk = saved(s);
    // 1. The Voyage is exactly where it was left. This is the bug that started the redesign.
    expect(readSlot(disk.runSlots, 'voyage', LARRY)).toEqual(larrySnap);
    // 2. A story round invents no run slot of its own — not under Bo, not under Star Tour.
    expect(Object.keys(disk.runSlots)).toEqual([slotKey('voyage', LARRY)]);
    expect(readSlot(disk.runSlots, 'startour', BO)).toBeNull();
    // 3. …but CONTINUE now points at the campaign, because that is genuinely what was last played.
    expect(disk.lastPlayed).toEqual({ mode: 'story', characterId: BO });
    // 4. Both campaigns are on disk, and Feather's is untouched.
    const roster = savedCampaigns(s);
    expect(Object.keys(roster.campaigns).sort()).toEqual([BO, FEATHER].sort());
    expect(roster.campaigns[FEATHER]).toEqual(feathersCampaign);
    // 5. …and CONTINUE really does resume the campaign rather than a run.
    const resumed = reduce(s, { type: 'resume' });
    expect(resumed.screen).toBe('story');
    expect(resumed.story!.characterId).toBe(BO);
    expect(readSlot(resumed.runSlots, 'voyage', LARRY)).toEqual(larrySnap);
  });

  it('the SAME golfer can hold a Voyage run AND a campaign — two keyspaces, neither aware of the other', () => {
    let s = parkVoyage(initState('same-golfer'), LARRY, 3);
    const larrySnap = readSlot(saved(s).runSlots, 'voyage', LARRY)!;

    // Larry again, this time in Story Tour.
    s = reduce(reduce(s, { type: 'openStory' }), { type: 'selectCharacter', characterId: LARRY });
    expect(s.screen).toBe('story');
    expect(s.story!.characterId).toBe(LARRY);
    s = pastBeats(reduce(s, { type: 'storyPlayWorld', courseId: 'standrews-18' }));
    s = reduce(playHoles(s, 2), { type: 'toTitle' });

    // Both saves survive, under keys that cannot collide.
    expect(readSlot(saved(s).runSlots, 'voyage', LARRY)).toEqual(larrySnap);
    expect(savedCampaigns(s).campaigns[LARRY]?.characterId).toBe(LARRY);
    expect(saved(s).lastPlayed).toEqual({ mode: 'story', characterId: LARRY });

    // Going back into the VOYAGE and tapping Larry gets the RUN, not the campaign.
    const picker = reduce(s, { type: 'start', format: 'voyage' });
    expect(modeSlotTags(picker)[LARRY]!.short).toBe('Stop 1');
    const back = reduce(picker, { type: 'selectCharacter', characterId: LARRY });
    expect(back.screen).toBe('playing');
    expect(back.run.formatId).toBe('voyage');
    expect(back.run.storyRound).toBeFalsy();
    expect(back.play!.holeIndex).toBe(3);
    // …and his campaign is still on disk while the run is live.
    expect(savedCampaigns(back).campaigns[LARRY]).toBeDefined();
  });

  it('re-entering Story Tour as a golfer who already has a campaign CONTINUES it, never overwrites', () => {
    const larrysCampaign = { ...defaultStoryState(LARRY), chapter: 2, credits: 640 };
    let s = parkVoyage(booted('story-continue', larrysCampaign), FEATHER, 2);
    const featherSnap = readSlot(saved(s).runSlots, 'voyage', FEATHER)!;

    s = reduce(reduce(s, { type: 'openStory' }), { type: 'selectCharacter', characterId: LARRY });
    expect(s.screen).toBe('story');
    expect(s.story!.chapter).toBe(2); // resumed, not restarted
    expect(s.story!.credits).toBe(640);
    // The Voyage run belonging to a different golfer is untouched throughout.
    expect(readSlot(saved(s).runSlots, 'voyage', FEATHER)).toEqual(featherSnap);
  });
});
