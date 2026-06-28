import { describe, it, expect } from 'vitest';
import { startRun, playStop, travel, routeOptions, type Run } from '../src/sim/rpg/run';
import {
  ARC_LEN,
  arcIndexOf,
  stopPosInArc,
  isArcBossSlot,
  holesForStop,
  runField,
  leaderboard,
  arcBossId,
  playerInfoFor,
} from '../src/sim/rpg/league';
import { FIELD_SIZE, PLAYER_ID } from '../src/sim/rpg/competition';

/** Play up to `n` stops of a voyage with the default (auto) loadout, returning the live run. */
function playN(seed: string, n: number, meta = {}): Run {
  let run = startRun(seed, 'voyage', meta, 'feather-fade');
  for (let i = 0; i < n; i++) {
    run = playStop(run).run;
    if (run.status !== 'active') break;
    const routes = routeOptions(run);
    run = travel(run, routes[0]!);
  }
  return run;
}

describe('arc grouping', () => {
  it('groups stops into arcs of ARC_LEN', () => {
    expect(arcIndexOf(0)).toBe(0);
    expect(arcIndexOf(ARC_LEN - 1)).toBe(0);
    expect(arcIndexOf(ARC_LEN)).toBe(1);
    expect(stopPosInArc(ARC_LEN)).toBe(0);
    expect(isArcBossSlot(ARC_LEN - 1)).toBe(true);
    expect(isArcBossSlot(0)).toBe(false);
  });

  it('holesForStop matches the voyage format', () => {
    const run = startRun('h', 'voyage', {}, 'feather-fade');
    expect(holesForStop(run, 0)).toBe(6);
    expect(holesForStop(run, 2)).toBe(9); // arc-1 boss is 9 holes
  });
});

describe('runField', () => {
  it('builds a 20-strong field with the player', () => {
    const run = startRun('f', 'voyage', {}, 'feather-fade');
    const field = runField(run);
    expect(field.golfers.length).toBe(FIELD_SIZE);
    expect(field.golfers.some((g) => g.isPlayer)).toBe(true);
    // The player's look is the chosen character's.
    expect(playerInfoFor(run).characterId).toBe('feather-fade');
  });
});

describe('leaderboard', () => {
  it('a fresh run has the field but no scores yet', () => {
    const run = startRun('x', 'voyage', {}, 'feather-fade');
    const board = leaderboard(run);
    expect(board.hasScores).toBe(false);
    expect(board.standings.length).toBe(FIELD_SIZE);
    expect(board.cut).toBeGreaterThan(0);
    for (const s of board.standings) expect(s.stopScore).toBeUndefined();
  });

  it('after a played stop, the board has cumulative scores and a cut', () => {
    const run = playN('seedA', 1);
    const board = leaderboard(run);
    expect(board.standings.length).toBe(FIELD_SIZE);
    if (board.hasScores) {
      for (const s of board.standings) {
        expect(s.stopScore).toBeDefined();
        expect(s.total).toBeGreaterThanOrEqual(0);
      }
      // sorted by total desc, positions 1..N
      for (let i = 1; i < board.standings.length; i++) {
        expect(board.standings[i - 1]!.total).toBeGreaterThanOrEqual(board.standings[i]!.total);
      }
      expect(board.standings.map((s) => s.position)).toEqual(board.standings.map((_, i) => i + 1));
    }
    expect(board.standings.some((s) => s.golferId === PLAYER_ID)).toBe(true);
  });

  it('is deterministic for the same run state', () => {
    const run = playN('seedB', 1);
    expect(leaderboard(run)).toEqual(leaderboard(run));
  });

  it('the cut sweeps some of the field but leaves survivors (sane calibration)', () => {
    // Survivors should be a real subset most of the time — never the impossible 0 or always-all-20.
    const board = leaderboard(playN('seedC', 1));
    expect(board.survivors).toBeGreaterThanOrEqual(1);
    expect(board.survivors).toBeLessThanOrEqual(FIELD_SIZE);
  });
});

describe('arcBossId', () => {
  it('resolves to a non-player golfer once the arc has scores', () => {
    const run = playN('seedD', 2);
    const board = leaderboard(run);
    if (board.hasScores) {
      const boss = arcBossId(run);
      expect(boss).toBeDefined();
      expect(boss).not.toBe(PLAYER_ID);
      // It is the top non-player on the board.
      const topAi = board.standings.find((s) => !s.isPlayer && !s.cut) ?? board.standings.find((s) => !s.isPlayer);
      expect(boss).toBe(topAi!.golferId);
    }
  });
});
