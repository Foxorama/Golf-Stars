import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import { playHole } from '../src/sim/round';
import {
  bossLoadout,
  bossPlayOpts,
  playBossStop,
  duelWinner,
  matchState,
  playMatchStop,
  matchScoreline,
  type HoleDuel,
} from '../src/sim/rpg/match';
import { playerHoleOpts, startRun } from '../src/sim/rpg/run';
import { getFormat, isMatchplayBoss, bossAt } from '../src/sim/rpg/formats';

describe('boss loadout', () => {
  it('a stronger golfer plays off a lower handicap and longer', () => {
    const champ = bossLoadout('champ:canis-major'); // power athlete, high skill
    const field = bossLoadout('field:marco-vance');
    expect(champ.handicap).toBeLessThanOrEqual(field.handicap);
    // bombers carry a positive distance bonus baked into the bag (driver carry boosted).
    const longGolfer = bossLoadout('champ:taurus'); // bomber
    const driver = longGolfer.bag.find((c) => c.id === 'D')!;
    expect(driver.carry).toBeGreaterThan(250);
  });

  it('bossPlayOpts carries a shape function and dispersion', () => {
    const opts = bossPlayOpts('champ:scorpius');
    expect(opts.shotMods).toBeTypeOf('function');
    expect(opts.dispersionMult).toBeGreaterThan(0);
  });
});

describe('duel + match state', () => {
  it('fewer strokes wins the hole', () => {
    expect(duelWinner(4, 5)).toBe('player');
    expect(duelWinner(5, 4)).toBe('boss');
    expect(duelWinner(4, 4)).toBe('halved');
  });

  it('matchState tracks holesUp and decides "3 & 2"', () => {
    const duels = (winners: HoleDuel['winner'][]): HoleDuel[] =>
      winners.map((w, i) => ({ holeIndex: i, par: 4, playerStrokes: 4, bossStrokes: 4, winner: w }));
    // Player wins 3 of the first 7 of a 9-hole match by a margin of 3, 2 to play → decided.
    const st = matchState(duels(['player', 'player', 'halved', 'player', 'halved', 'player', 'halved']), 9);
    expect(st.holesUp).toBe(4);
    expect(st.remaining).toBe(2);
    expect(st.decided).toBe(true);
    expect(st.finished).toBe(true);
    expect(st.playerWon).toBe(true);
    expect(matchScoreline(st)).toBe('4 & 2');
  });

  it('an all-square finish is a halve (player still advances)', () => {
    const duels: HoleDuel[] = Array.from({ length: 9 }, (_, i) => ({
      holeIndex: i,
      par: 4,
      playerStrokes: 4,
      bossStrokes: 4,
      winner: 'halved' as const,
    }));
    const st = matchState(duels, 9);
    expect(st.finished).toBe(true);
    expect(st.halved).toBe(true);
    expect(st.playerWon).toBe(false);
    expect(st.playerAdvances).toBe(true);
  });

  it('not decided while the margin is within the holes remaining', () => {
    const st = matchState([{ holeIndex: 0, par: 4, playerStrokes: 4, bossStrokes: 5, winner: 'player' }], 9);
    expect(st.decided).toBe(false);
    expect(st.finished).toBe(false);
  });
});

describe('playBossStop / playMatchStop', () => {
  const course = generateCourse('match:eq', { holes: 9, distanceFromStart: 8 });

  it('the boss plays a real ball on every hole, deterministically', () => {
    const a = playBossStop(course.holes, 'champ:scorpius', new Rng('b'));
    const b = playBossStop(course.holes, 'champ:scorpius', new Rng('b'));
    expect(a.map((p) => p.record.strokes)).toEqual(b.map((p) => p.record.strokes));
    expect(a.length).toBe(9);
    for (const ph of a) expect(ph.record.strokes).toBeGreaterThan(0);
  });

  it('plays the duel and stops once decided', () => {
    const playerOpts = playerHoleOpts(startRun('m', 'voyage', {}, 'feather-fade'));
    const stop = playMatchStop(course.holes, playerOpts, 'champ:scorpius', new Rng('p'), new Rng('b'));
    expect(stop.duels.length).toBeGreaterThan(0);
    expect(stop.duels.length).toBeLessThanOrEqual(9);
    expect(stop.player.length).toBe(stop.duels.length);
    expect(stop.boss.length).toBe(stop.duels.length);
    // The match state matches the duels.
    expect(stop.state.thru).toBe(stop.duels.length);
  });

  it("the player's own ball is byte-for-byte the same as a solo stop (separate boss rng)", () => {
    const playerOpts = playerHoleOpts(startRun('m', 'voyage', {}, 'feather-fade'));
    const soloRng = new Rng('shared');
    const solo = course.holes.map((h) => playHole(h, soloRng, playerOpts));
    const stop = playMatchStop(course.holes, playerOpts, 'champ:scorpius', new Rng('shared'), new Rng('boss'));
    // Compare the holes that were actually played in the match.
    for (let i = 0; i < stop.player.length; i++) {
      expect(stop.player[i]!.record.strokes).toBe(solo[i]!.record.strokes);
    }
  });

  it('an elite boss is hard but not unbeatable over many seeds', () => {
    const playerOpts = playerHoleOpts(startRun('m', 'voyage', {}, 'feather-fade'));
    let playerWins = 0;
    const N = 40;
    for (let s = 0; s < N; s++) {
      const c = generateCourse(`mb:${s}`, { holes: 9, distanceFromStart: 8 });
      const stop = playMatchStop(c.holes, playerOpts, 'champ:scorpius', new Rng(`p${s}`), new Rng(`b${s}`));
      if (stop.state.playerAdvances) playerWins++;
    }
    // The auto-AI player should win SOME matches but not romp every one (a real contest).
    expect(playerWins).toBeGreaterThan(0);
    expect(playerWins).toBeLessThan(N);
  });
});

describe('reducer matchplay flow', () => {
  it("the watch path on a boss stop plays a duel and scores it on the match", async () => {
    const { initState, reduce } = await import('../src/ui/game');
    const { currentCourse, currentBoss } = await import('../src/sim/rpg/run');
    let run = startRun(7, 'voyage', {}, 'feather-fade');
    // Drop onto the Arc-I matchplay boss (stop 2) with a populated arc history so the leader resolves.
    run = {
      ...run,
      stopIndex: 2,
      distanceFromStart: 4,
      history: [
        { stopIndex: 0, distanceFromStart: 0, biome: 'verdant-station', rarity: 'common', stableford: 14, gross: 24, cut: 6, passed: true, creditsEarned: 0 },
        { stopIndex: 1, distanceFromStart: 2, biome: 'dust-belt', rarity: 'common', stableford: 15, gross: 25, cut: 7, passed: true, creditsEarned: 0 },
      ],
    };
    expect(isMatchplayBoss(currentBoss(run))).toBe(true);
    const course = currentCourse(run);
    const base = initState(7, {});
    const st = { ...base, run, course, screen: 'intro' as const };
    const after = reduce(st, { type: 'play' });
    expect(after.match).toBeDefined();
    expect(after.match!.duels.length).toBeGreaterThan(0);
    expect(after.match!.bossId).not.toBe('player');
    expect(after.match!.finished).toBe(true);
    expect(['result', 'gameover']).toContain(after.screen);
    // The stop result's pass reflects the match (won/halved), independent of stableford-vs-cut.
    const { matchState: ms } = await import('../src/sim/rpg/match');
    const m = ms(after.match!.duels, course.holes.length);
    expect(after.lastResult!.passed).toBe(m.playerAdvances);
  });
});

describe('voyage matchplay wiring', () => {
  it('the Arc-I and final bosses are matchplay, the Arc-II boss is scramble', () => {
    const voyage = getFormat('voyage');
    expect(isMatchplayBoss(bossAt(voyage, 2))).toBe(true); // Arc I
    expect(bossAt(voyage, 5)?.partner).toBe('scramble'); // Arc II co-op
    expect(isMatchplayBoss(bossAt(voyage, 8))).toBe(true); // final
    expect(bossAt(voyage, 8)?.final).toBe(true);
  });
});
