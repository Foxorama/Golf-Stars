import { describe, it, expect } from 'vitest';
import { startRun, playStop, type Run } from '../src/sim/rpg/run';
import { runField, leaderboard, liveLeaderboard, holesForStop } from '../src/sim/rpg/league';
import { buildVoyageField, arcCut, arcSurvivorTarget, PLAYER_ID, type ArcStopSlice } from '../src/sim/rpg/competition';

const LOOK = { cap: '#fff', shirt: '#000', skin: '#caa182', build: 1 };

describe('persistent voyage field (GS-voyage-field)', () => {
  it('the field is ONE identical set of golfers across every stop of the voyage', () => {
    let run = startRun('field-stable', 'voyage');
    const ids0 = runField(run).golfers.map((g) => g.id).sort();
    // Walk the whole voyage and assert the field never changes composition.
    for (let i = 0; i < 8 && run.status === 'active'; i++) {
      const ids = runField(run).golfers.map((g) => g.id).sort();
      expect(ids).toEqual(ids0);
      const played = playStop(run);
      run = played.run;
    }
    // buildVoyageField is itself stable for a given seed/player.
    const a = buildVoyageField('x', { name: 'You', look: LOOK }).golfers.map((g) => g.id);
    const b = buildVoyageField('x', { name: 'You', look: LOOK }).golfers.map((g) => g.id);
    expect(a).toEqual(b);
  });

  it('the cut ramps the field down to exactly TWO (you + one rival) for the final', () => {
    const field = buildVoyageField('ramp', { name: 'You', look: LOOK });
    const holes = [6, 7, 9, 6, 7, 9, 6, 7]; // voyage stop sizes through stop 7
    const slices: ArcStopSlice[] = holes.map((h, stopIndex) => ({
      stopIndex,
      archetype: 'verdant',
      holeCount: h,
      playerSF: h * 5, // a dominant player → always survives the cut
      isBoss: stopIndex === 2 || stopIndex === 5,
      target: arcSurvivorTarget(stopIndex),
    }));
    const result = arcCut(field, 'ramp', slices);
    expect(result.playerAlive).toBe(true);
    const alive = result.standings.filter((s) => !s.cut);
    expect(alive.length).toBe(2); // the final two
    expect(alive.some((s) => s.golferId === PLAYER_ID)).toBe(true);
    expect(alive.filter((s) => !s.isPlayer).length).toBe(1); // exactly one rival → 1st v 2nd matchplay
  });
});

describe('leaderboard score continuity (no double-count jump)', () => {
  // The reported bug: a golfer showed "+2" for the stop but their TOTAL jumped by 4 at the start of a
  // new stop. The live partial over a stop's full holes MUST equal the completed-stop contribution to
  // the cumulative board — otherwise the total visibly leaps at the boundary.
  it('a completed stop adds exactly the live partial to every golfer total (no leap)', () => {
    let run: Run = startRun('continuity', 'voyage');
    for (let s = 0; s < 4 && run.status === 'active'; s++) {
      const beforeTotals = new Map(leaderboard(run).standings.map((r) => [r.golferId, r.total]));
      const holes = holesForStop(run, run.stopIndex);
      const played = playStop(run);
      const playerSF = played.result.stableford;
      // The live board at the FINAL hole of the stop = cumulative-before + this stop's full partial.
      const live = liveLeaderboard(run, holes, playerSF);
      const next = played.run;
      // After the stop is committed to history, the cumulative board for each golfer must equal the
      // live partial we just showed — no jump.
      const afterTotals = new Map(leaderboard(next).standings.map((r) => [r.golferId, r.total]));
      for (const row of live.standings) {
        // Boss stops add nothing (matchplay/scramble) — skip the leap check there (both are flat).
        if (played.result.cut === undefined) continue;
        const after = afterTotals.get(row.golferId);
        if (after === undefined) continue;
        expect(after).toBe(row.total);
        // And the increment over the pre-stop total is never negative (monotonic).
        const before = beforeTotals.get(row.golferId) ?? 0;
        expect(after).toBeGreaterThanOrEqual(before);
      }
      run = next;
    }
  });
});
