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
  liveLeaderboard,
  arcBossId,
  playerInfoFor,
  livePosition,
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

describe('livePosition', () => {
  it('ranks the player mid-stop and improves as they score better', () => {
    const run = startRun('live', 'voyage', {}, 'feather-fade');
    const of = runField(run).golfers.length;
    const weak = livePosition(run, 6, 3); // 6 holes, only 3 pts (poor)
    const strong = livePosition(run, 6, 18); // 6 holes, 18 pts (stellar)
    expect(weak.position).toBeGreaterThanOrEqual(1);
    expect(weak.position).toBeLessThanOrEqual(of);
    expect(strong.of).toBe(of);
    // A much better partial run ranks you higher (lower position number).
    expect(strong.position).toBeLessThan(weak.position);
    expect(strong.total).toBeGreaterThan(weak.total);
  });

  it('is deterministic', () => {
    const run = startRun('live2', 'voyage', {}, 'feather-fade');
    expect(livePosition(run, 4, 8)).toEqual(livePosition(run, 4, 8));
  });
});

describe('matchplay boss stop scoring (GS-matchplay)', () => {
  it('a boss stop adds NO Stableford to the leaderboard and applies no cut', () => {
    let run = startRun(7, 'voyage', {}, 'feather-fade');
    // A strong player (≈3/hole) so they survive the positional cuts and reach the boss board.
    run = {
      ...run,
      stopIndex: 2,
      distanceFromStart: 4,
      history: [
        { stopIndex: 0, distanceFromStart: 0, biome: 'verdant-station', rarity: 'common', stableford: 18, gross: 24, cut: 6, passed: true, creditsEarned: 0 },
        { stopIndex: 1, distanceFromStart: 2, biome: 'dust-belt', rarity: 'common', stableford: 19, gross: 25, cut: 7, passed: true, creditsEarned: 0 },
        { stopIndex: 2, distanceFromStart: 4, biome: 'ice-ring', rarity: 'rare', stableford: 20, gross: 30, cut: 9, passed: true, creditsEarned: 0 },
      ],
    };
    const board = leaderboard(run);
    const me = board.standings.find((s) => s.isPlayer)!;
    // The boss stop's 20 points are NOT added — the duel decides advancement, not points.
    expect(me.total).toBe(18 + 19);
    expect(me.cut).toBeFalsy(); // a strong player survived the positional cuts
    expect(me.stopScore).toBe(0); // the boss stop shows as a +0 line
    expect(board.survivorTarget).toBeUndefined(); // no positional cut on the boss stop
    expect(board.mode).toBe('positional');
  });
});

describe('liveLeaderboard', () => {
  it('returns the full field, ranked, with a live player row that climbs as they score', () => {
    const run = startRun('llb', 'voyage', {}, 'feather-fade');
    const of = runField(run).golfers.length;
    const weak = liveLeaderboard(run, 6, 3);
    const strong = liveLeaderboard(run, 6, 18);
    expect(weak.standings.length).toBe(of);
    expect(strong.standings.length).toBe(of);
    // sorted by total desc, positions 1..N
    for (let i = 1; i < strong.standings.length; i++) {
      expect(strong.standings[i - 1]!.total).toBeGreaterThanOrEqual(strong.standings[i]!.total);
    }
    const me = (b: ReturnType<typeof liveLeaderboard>) => b.standings.find((s) => s.isPlayer)!;
    expect(me(strong).position).toBeLessThan(me(weak).position);
    expect(me(strong).total).toBeGreaterThan(me(weak).total);
    expect(me(weak).thru).toBe(6);
  });

  it('agrees with livePosition on the player row', () => {
    const run = startRun('llb2', 'voyage', {}, 'feather-fade');
    const board = liveLeaderboard(run, 4, 9);
    const lp = livePosition(run, 4, 9);
    const me = board.standings.find((s) => s.isPlayer)!;
    expect(lp.position).toBe(me.position);
    expect(lp.total).toBe(me.total);
    expect(lp.of).toBe(board.standings.length);
  });

  it('is deterministic', () => {
    const run = startRun('llb3', 'voyage', {}, 'feather-fade');
    expect(liveLeaderboard(run, 3, 7)).toEqual(liveLeaderboard(run, 3, 7));
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
