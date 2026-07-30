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
import { initState, reduce, type UiState } from '../src/ui/game';
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
import { defaultStoryState } from '../src/sim/rpg/story';
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
    expect(SAVE_VERSION).toBe(33);
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
    return reduce(s, { type: 'toTitle' });
  }

  it('tapping a golfer who already has a run CONTINUES it — it never silently starts over', () => {
    const parked = parkedVoyage();
    const stopIndex = readSlot(parked.runSlots, 'voyage', LARRY)!.stopIndex;
    const picker = reduce(parked, { type: 'start', format: 'voyage' });
    const cont = reduce(picker, { type: 'selectCharacter', characterId: LARRY });
    expect(cont.run.stopIndex).toBe(stopIndex);
    expect(cont.run.loadout.characterId).toBe(LARRY);
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
