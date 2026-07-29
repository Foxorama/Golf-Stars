import { describe, expect, it } from 'vitest';
import {
  canWarpStop,
  currentCourse,
  finishStop,
  playStop,
  playStopWarp,
  resumeRun,
  snapshotRun,
  startRun,
} from '../src/sim/rpg/run';
import type { Run } from '../src/sim/rpg/run';
import {
  endlessRecordsByDepth,
  recordRange,
  warpBirdieHole,
  type EndlessRunRecord,
} from '../src/sim/rpg/endless';
import { migrate, SAVE_VERSION, defaultSave } from '../src/save/schema';
import { initState, reduce, type UiState } from '../src/ui/game';
import type { PlayedHole } from '../src/sim/round';

const played = (par: number, strokes: number, holed = true, pickedUp = false): PlayedHole =>
  ({
    record: { par, strokes },
    stat: { fairwayHit: null, gir: false, putts: 0 },
    shots: [],
    putts: [],
    holed,
    pickedUp,
  }) as unknown as PlayedHole;

describe('the hidden automatic-birdie rule (GS-warp)', () => {
  it('warpBirdieHole floors at birdie, lets a better score stand, and converts a pickup', () => {
    expect(warpBirdieHole(played(4, 7)).record.strokes).toBe(3); // blow-up → birdie
    expect(warpBirdieHole(played(5, 9, false, true))).toMatchObject({
      record: { par: 5, strokes: 4 },
      holed: true,
      pickedUp: false, // even a pickup becomes the birdie — warp can never bust
    });
    expect(warpBirdieHole(played(4, 2)).record.strokes).toBe(2); // a real eagle stands
    expect(warpBirdieHole(played(3, 1)).record.strokes).toBe(1); // an ace stands
    expect(warpBirdieHole(played(3, 3)).record.strokes).toBe(2); // par 3 floor is 2, never 0
  });

  it('canWarpStop: Unending only, contiguous prefix only, whole stop under the proven best', () => {
    const run = startRun(3, 'unending');
    expect(canWarpStop(run, 8, 4)).toBe(true); // fresh run, best 8 → first stop warpable
    expect(canWarpStop(run, 4, 4)).toBe(true); // exactly one proven stop
    expect(canWarpStop(run, 3, 4)).toBe(false); // stop would overshoot the proven best
    expect(canWarpStop(run, 0, 4)).toBe(false); // nothing proven yet
    // Once a real swing has been taken (survived past the warp prefix), warping is over.
    expect(canWarpStop({ ...run, holesSurvived: 4, warpedThrough: 0 }, 100, 4)).toBe(false);
    expect(canWarpStop({ ...run, holesSurvived: 4, warpedThrough: 4 }, 100, 4)).toBe(true);
    expect(canWarpStop(startRun(3, 'voyage'), 100, 4)).toBe(false); // the voyage never warps
  });

  it('a warped stop always survives, is deterministic, and keeps warpedThrough in lock-step', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const run = startRun(seed, 'unending');
      const a = playStopWarp(run);
      const b = playStopWarp(run);
      expect(a.result).toEqual(b.result);
      expect(a.run.status).toBe('active');
      expect(a.result.passed).toBe(true);
      expect(a.run.holesSurvived).toBe(currentCourse(run).holes.length);
      expect(a.run.warpedThrough).toBe(a.run.holesSurvived);
      // Every carded hole clears its bar by construction (birdie floor).
      for (const p of a.played) expect(p.record.strokes).toBeLessThanOrEqual(p.record.par + 4);
    }
  });

  it('warp plays the SAME :play stream — a surviving solo stop and a warped stop card the same golf', () => {
    // Find a seed whose solo first stop survives all 4 holes; its shot log must equal the warped
    // stop's (warp only FLOORS the record afterwards — same rng, same engine, same holes).
    for (let seed = 1; seed <= 30; seed++) {
      const run = startRun(seed, 'unending');
      const solo = playStop(run);
      if (solo.played.length !== currentCourse(run).holes.length || solo.run.status !== 'active') continue;
      const warped = playStopWarp(run);
      expect(warped.played.map((p) => p.shots.length)).toEqual(solo.played.map((p) => p.shots.length));
      for (let h = 0; h < solo.played.length; h++) {
        expect(warped.played[h]!.record.strokes).toBeLessThanOrEqual(solo.played[h]!.record.strokes);
      }
      return;
    }
    throw new Error('no surviving solo first stop found in 30 seeds');
  });

  it('a warped stop never banks milestone shards; a played one does', () => {
    const course = currentCourse(startRun(9, 'unending'));
    const base: Run = { ...startRun(9, 'unending'), holesSurvived: 38, warpedThrough: 38 };
    const birdies = course.holes.map((h) => played(h.par, Math.max(1, h.par - 1)));
    const warped = finishStop(base, course, birdies, { warp: true });
    expect(warped.run.holesSurvived).toBe(38 + course.holes.length); // crosses milestone 40…
    expect(warped.run.bonusShards).toBe(0); // …but banks nothing
    const soloCross = finishStop(base, course, birdies);
    expect(soloCross.run.bonusShards).toBe(40); // hand-played crossing banks the milestone
  });

  it('warpedThrough round-trips the snapshot (a resumed warped run keeps its range)', () => {
    let run = startRun(5, 'unending');
    run = { ...run, holesSurvived: 12, warpedThrough: 12, stopIndex: 3, distanceFromStart: 5 };
    expect(resumeRun(snapshotRun(run)).warpedThrough).toBe(12);
    // And an unwarped run stays unwarped through the trip.
    expect(resumeRun(snapshotRun(startRun(5, 'unending'))).warpedThrough).toBe(0);
  });
});

describe('the warp reducer flow + the range leaderboard (GS-warp)', () => {
  const toIntro = (best: number): UiState => {
    let s = initState(21, { endlessBestHoles: best });
    s = reduce(s, { type: 'start', format: 'unending' });
    s = reduce(s, { type: 'selectCharacter', characterId: 'feather-fade' });
    return s;
  };

  it('warpStop fast-forwards a stop to the result screen; unavailable past the proven best', () => {
    let s = toIntro(4);
    expect(s.screen).toBe('intro');
    s = reduce(s, { type: 'warpStop' });
    expect(s.screen).toBe('result');
    expect(s.run.holesSurvived).toBe(4);
    expect(s.run.warpedThrough).toBe(4);
    expect(s.run.status).toBe('active');
    // Travel on: the next stop would overshoot best=4, so warp is now a no-op.
    s = reduce(s, { type: 'continue' });
    if (s.screen === 'shop') s = reduce(s, { type: 'leaveShop' });
    if (s.screen === 'travel') s = reduce(s, { type: 'route', routeId: s.routes![0]!.id });
    expect(s.screen).toBe('intro');
    const blocked = reduce(s, { type: 'warpStop' });
    expect(blocked).toBe(s);
  });

  it('a warped run banks its record with the first hand-played hole as the range start', () => {
    let s = toIntro(4);
    s = reduce(s, { type: 'warpStop' });
    s = reduce(s, { type: 'continue' });
    if (s.screen === 'shop') s = reduce(s, { type: 'leaveShop' });
    if (s.screen === 'travel') s = reduce(s, { type: 'route', routeId: s.routes![0]!.id });
    // Play the rest for real until the run dies.
    let guard = 0;
    while (s.screen !== 'gameover' && guard++ < 3000) {
      if (s.screen === 'intro') s = reduce(s, { type: 'playInteractive' });
      else if (s.screen === 'playing')
        s = s.play && s.play.done ? reduce(s, { type: 'holeComplete' }) : reduce(s, { type: 'autoShotHole' });
      else if (s.screen === 'result') s = reduce(s, { type: 'continue' });
      else if (s.screen === 'shop') s = reduce(s, { type: 'leaveShop' });
      else if (s.screen === 'travel') s = reduce(s, { type: 'route', routeId: s.routes![0]!.id });
      else break;
    }
    expect(s.screen).toBe('gameover');
    const rec = s.endlessRuns[0]!;
    expect(rec.startHole).toBe(5); // warped through 4 → first hand-played hole is 5
    expect(rec.holes).toBeGreaterThanOrEqual(4);
    expect(recordRange(rec)).toBe(`5–${rec.holes}`);
  });

  it('endlessRecordsByDepth ranks the newest runs by furthest hole; recordRange reads honestly', () => {
    const rec = (holes: number, startHole?: number, gross = holes * 4): EndlessRunRecord => ({
      characterId: 'feather-fade',
      tier: 'common',
      holes,
      gross,
      par: holes * 4,
      ascension: 0,
      seed: holes,
      startHole,
    });
    const newestFirst = [rec(12), rec(49), rec(67, 50), rec(8)];
    const board = endlessRecordsByDepth(newestFirst, 10);
    expect(board.map((r) => r.holes)).toEqual([67, 49, 12, 8]);
    expect(recordRange(board[0]!)).toBe('50–67');
    expect(recordRange(board[1]!)).toBe('1–49');
    // The window is the NEWEST n, then sorted — an old deep run outside the window stays off.
    expect(endlessRecordsByDepth(newestFirst, 2).map((r) => r.holes)).toEqual([49, 12]);
  });

  it('save v16 migrates forward as pure stamps and old records read as unwarped', () => {
    const v16 = { ...defaultSave(), version: 16 } as unknown;
    const s = migrate(v16);
    expect(s.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(31);
    expect(recordRange({ characterId: 'x', tier: 'common', holes: 23, gross: 90, par: 92, ascension: 0, seed: 1 })).toBe('1–23');
  });
});
