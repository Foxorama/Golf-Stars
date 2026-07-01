import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { playHole } from '../src/sim/round';
import { Rng } from '../src/sim/rng';
import { characterShotMods } from '../src/sim/rpg/characters';
import {
  bestBallHole,
  playSideHole,
  playBossSideStop,
  playTeamMatchStop,
  betterPlayedHole,
  bossPlayOpts,
  type TeamSetup,
} from '../src/sim/rpg/match';
import { resolveTeamFormat, isTeamDuelBoss, getFormat, bossAt } from '../src/sim/rpg/formats';
import { startRun, currentCourse, teamDuelSetupForRun, underdogSide, playStop, scrambleOptsFor } from '../src/sim/rpg/run';
import { initState, reduce, type UiState } from '../src/ui/game';
import { shotView, holeResult } from '../src/sim/rpg/play';

/** A UiState parked at the Arc-II team-duel boss (stop 5) of the first seed whose format matches. */
function bossUiState(format: 'scramble' | 'bestball'): UiState {
  for (let seed = 1; seed < 200; seed++) {
    const picked = reduce(initState(seed), { type: 'start', format: 'voyage' });
    const s0 = reduce(picked, { type: 'selectCharacter', characterId: 'feather-fade' });
    const run = { ...s0.run, stopIndex: 5 };
    const setup = teamDuelSetupForRun(run);
    if (setup?.format === format && setup.partnerSide === 'player') {
      return { ...s0, run, course: currentCourse(run), screen: 'intro' };
    }
  }
  throw new Error(`no ${format} boss seed found`);
}

const partner = characterShotMods('huang-woo-hook');
const baseOpts = {}; // a plain loadout (CLUBS bag, neutral dispersion)

describe('team-duel format resolution (GS-team-duel)', () => {
  it('resolveTeamFormat: explicit passes through, random is deterministic + one of the two', () => {
    const boss = bossAt(getFormat('voyage'), 5)!;
    expect(boss.team).toBe('random');
    expect(isTeamDuelBoss(boss)).toBe(true);
    // Random → a stable choice per seed.
    for (const seed of [1, 2, 7, 42, 99]) {
      const f = resolveTeamFormat(boss, seed);
      expect(['scramble', 'bestball']).toContain(f);
      expect(resolveTeamFormat(boss, seed)).toBe(f); // deterministic
    }
    // Explicit team values pass straight through; a non-team boss → undefined.
    expect(resolveTeamFormat({ ...boss, team: 'scramble' }, 5)).toBe('scramble');
    expect(resolveTeamFormat({ ...boss, team: 'bestball' }, 5)).toBe('bestball');
    expect(resolveTeamFormat({ ...boss, team: undefined }, 5)).toBeUndefined();
    // Both formats are actually reachable across seeds (random isn't stuck on one).
    const seen = new Set([...Array(40).keys()].map((s) => resolveTeamFormat(boss, s)));
    expect(seen.has('scramble')).toBe(true);
    expect(seen.has('bestball')).toBe(true);
  });
});

describe('team-duel scoring engine (GS-team-duel)', () => {
  it('underdogSide: the lower-ranked (bigger position number) side gets the partner', () => {
    // Opponent ranked higher (smaller number) → player is the underdog → player gets the assist.
    expect(underdogSide(5, 2)).toBe('player');
    // Player ranked higher → boss gets the partner.
    expect(underdogSide(2, 5)).toBe('boss');
  });

  it('bestBallHole keeps the better of the two balls, replicating the player+partner draws', () => {
    const c = generateCourse('tdc:1', { holes: 6, distanceFromStart: 6 });
    const h = c.holes[0]!;
    // Reference: play the two balls myself on a fresh rng in the same order.
    const ref = new Rng('tdc:1:p');
    const a = playHole(h, ref, baseOpts);
    const b = playHole(h, ref, { ...baseOpts, shotMods: partner });
    const better = a.record.strokes <= b.record.strokes ? a : b;
    // The engine, on an equivalently-seeded rng, must produce the same kept hole.
    const bb = bestBallHole(h, new Rng('tdc:1:p'), baseOpts, partner);
    expect(bb.played.record.strokes).toBe(better.record.strokes);
    expect(bb.played.record.strokes).toBeLessThanOrEqual(Math.max(a.record.strokes, b.record.strokes));
    expect(bb.partnerKept).toBe(b.record.strokes < a.record.strokes);
  });

  it('playSideHole: solo === playHole byte-for-byte; scramble === playHole with scramble opts', () => {
    const c = generateCourse('tdc:2', { holes: 6, distanceFromStart: 6 });
    const h = c.holes[0]!;
    // Solo (no partner) draws nothing extra.
    const solo = playSideHole(h, new Rng('z'), baseOpts, undefined, 'bestball');
    expect(solo.played).toEqual(playHole(h, new Rng('z'), baseOpts));
    expect(solo.partnerKept).toBe(false);
    // Scramble side === a scramble hole.
    const scr = playSideHole(h, new Rng('z'), baseOpts, partner, 'scramble');
    expect(scr.played).toEqual(playHole(h, new Rng('z'), { ...baseOpts, scramble: { partnerMods: partner } }));
  });

  it('betterPlayedHole prefers fewer strokes (ties keep the first)', () => {
    const mk = (strokes: number) => ({ record: { par: 4, strokes }, stat: {} as any, shots: [], putts: [], holed: false, pickedUp: false });
    expect(betterPlayedHole(mk(5), mk(4)).record.strokes).toBe(4);
    expect(betterPlayedHole(mk(4), mk(5)).record.strokes).toBe(4);
    expect(betterPlayedHole(mk(4), mk(4)).record.strokes).toBe(4); // tie → first
  });

  it('playTeamMatchStop runs the duel hole-by-hole and is deterministic', () => {
    const c = generateCourse('tdc:3', { holes: 9, distanceFromStart: 10 });
    const setup: TeamSetup = { format: 'bestball', partnerSide: 'player', playerPartnerMods: partner };
    const oppId = 'sirius'; // any valid golfer id resolves via getGolfer; a missing one falls back
    const run = () =>
      playTeamMatchStop(c.holes, baseOpts, oppId, setup, new Rng(`${c.seed}:play`), new Rng(`${c.seed}:boss`));
    const a = run();
    const b = run();
    expect(a.duels.length).toBeGreaterThan(0);
    expect(a.duels.length).toBeLessThanOrEqual(c.holes.length);
    expect(a.state.thru).toBe(a.duels.length);
    // Deterministic: same seeds → identical duel + state.
    expect(b.duels.map((d) => d.winner)).toEqual(a.duels.map((d) => d.winner));
    expect(b.state).toEqual(a.state);
  });

  it('playBossSideStop returns one (team-scored) hole per hole on the boss stream', () => {
    const c = generateCourse('tdc:4', { holes: 9, distanceFromStart: 10 });
    const setup: TeamSetup = { format: 'scramble', partnerSide: 'boss', bossPartnerMods: partner };
    const boss = playBossSideStop(c.holes, 'rigel', setup, new Rng(`${c.seed}:boss`));
    expect(boss.length).toBe(c.holes.length);
    expect(boss.every((h) => h.record.strokes > 0)).toBe(true);
  });

  it('the home-zone edge sharpens the boss (lower handicap, more distance)', () => {
    const plain = bossPlayOpts('rigel', false);
    const home = bossPlayOpts('rigel', true);
    // dispersion (handicap-derived) should be no worse, and distance clubs carry further.
    expect(home.dispersionMult!).toBeLessThanOrEqual(plain.dispersionMult!);
    const longestPlain = Math.max(...plain.bag!.map((c) => c.carry));
    const longestHome = Math.max(...home.bag!.map((c) => c.carry));
    expect(longestHome).toBeGreaterThan(longestPlain);
  });
});

describe('team-duel run wiring (GS-team-duel)', () => {
  it('teamDuelSetupForRun resolves a deterministic setup at the Arc-II boss', () => {
    const run = { ...startRun(11, 'voyage', {}, 'feather-fade'), stopIndex: 5 };
    const setup = teamDuelSetupForRun(run)!;
    expect(setup).toBeDefined();
    expect(['scramble', 'bestball']).toContain(setup.format);
    // No arc history → the player defaults to the underdog (gets the partner + a partner id/mods).
    expect(setup.partnerSide).toBe('player');
    expect(setup.playerPartnerId).toBeTypeOf('string');
    expect(setup.playerPartnerMods).toBeTypeOf('function');
    expect(setup.bossPartnerMods).toBeUndefined();
    // Deterministic.
    const again = teamDuelSetupForRun(run)!;
    expect(again.format).toBe(setup.format);
    expect(again.partnerSide).toBe(setup.partnerSide);
    expect(again.opponentId).toBe(setup.opponentId);
    // scrambleOptsFor only arms the player's solo ball when it's a SCRAMBLE underdog.
    if (setup.format === 'scramble') expect(scrambleOptsFor(run)?.partnerMods).toBeTypeOf('function');
    else expect(scrambleOptsFor(run)).toBeUndefined();
  });

  it('a headless team-duel boss stop completes and passes on the match (not a Stableford cut)', () => {
    const run = { ...startRun(11, 'voyage', {}, 'feather-fade'), stopIndex: 5 };
    const { run: next, result, played } = playStop(run);
    expect(played.length).toBeGreaterThan(0);
    // The stop is scored by the duel: passed reflects winning/halving, not a Stableford threshold.
    expect(typeof result.passed).toBe('boolean');
    // The Arc-II boss is non-final: winning the duel keeps the run ALIVE (awaiting travel); losing ends it.
    if (result.passed) expect(next.status).toBe('active');
    else expect(next.status).toBe('ended');
  });
});

describe('interactive team-duel reducer (GS-team-duel)', () => {
  it('scramble: a swing offers a two-ball CHOICE (uncommitted); choosing advances one team stroke', () => {
    let s = bossUiState('scramble');
    s = reduce(s, { type: 'playInteractive' });
    expect(s.screen).toBe('playing');
    expect(s.match?.setup?.format).toBe('scramble');
    // A full swing resolves BOTH balls and awaits the player's pick — it does NOT advance the hole.
    const v = shotView(s.play!, s.run.loadout);
    s = reduce(s, { type: 'shot', clubId: v.attackClubId, aim: 'attack' });
    expect(s.scrambleChoice).toBeDefined();
    expect(s.scrambleChoice!.player).toBeDefined();
    expect(s.scrambleChoice!.partner).toBeDefined();
    expect(s.play!.shots.length).toBe(0); // not committed yet
    // A second swing while choosing is a no-op (you must pick first).
    const mid = reduce(s, { type: 'shot', clubId: v.attackClubId, aim: 'attack' });
    expect(mid.scrambleChoice).toBe(s.scrambleChoice);
    // Choosing the partner's ball commits exactly one team stroke and clears the choice.
    s = reduce(s, { type: 'chooseScrambleBall', pick: 'partner' });
    expect(s.scrambleChoice).toBeUndefined();
    expect(s.play!.shots.length).toBe(1);
    expect(s.play!.partnerKept).toBe(true);
    expect(s.play!.strokes).toBe(1);
  });

  it('scramble: auto-finish auto-keeps the better ball (no choice card needed)', () => {
    let s = bossUiState('scramble');
    s = reduce(s, { type: 'playInteractive' });
    // Pending a pick, auto-finish resolves it and plays the hole out.
    const v = shotView(s.play!, s.run.loadout);
    s = reduce(s, { type: 'shot', clubId: v.attackClubId, aim: 'attack' });
    expect(s.scrambleChoice).toBeDefined();
    s = reduce(s, { type: 'autoShotHole' });
    expect(s.scrambleChoice).toBeUndefined();
    expect(s.play!.done).toBe(true);
  });

  it('best-ball: the partner ball resolves the MOMENT the hole is done (the end-of-hole reveal), and holeComplete records the better', () => {
    let s = bossUiState('bestball');
    s = reduce(s, { type: 'playInteractive' });
    expect(s.match?.setup?.format).toBe('bestball');
    // Before any hole finishes, nothing of the partner exists — no mid-hole spoiler to show.
    expect(s.match!.partnerHoles!.length).toBe(0);
    // Auto-finish the first hole (no per-shot choice in best-ball).
    s = reduce(s, { type: 'autoShotHole' });
    expect(s.play!.done).toBe(true);
    // The partner's parallel ball is ALREADY resolved (GS-team-duel reveal) — the end-of-hole
    // screen shows both cards from this state, before `holeComplete` fires.
    expect(s.match!.partnerHoles!.length).toBe(1);
    const raw = holeResult(s.play!);
    const partnerBall = s.match!.partnerHoles![0]!;
    // A second done-state action must NOT re-draw the partner ball (rng-stream guard).
    const again = reduce(s, { type: 'autoShotHole' });
    expect(again.match!.partnerHoles!.length).toBe(1);
    s = reduce(s, { type: 'holeComplete' });
    // The recorded team hole is exactly the better of the two balls (ties keep the player's).
    expect(s.match!.partnerHoles!.length).toBe(1);
    const recorded = s.stopPlayed?.[0] ?? s.played?.[0];
    expect(recorded!.record.strokes).toBe(Math.min(raw.record.strokes, partnerBall.record.strokes));
  });

  it('best-ball: the interactive stop resolves the SAME duel as the watch path (auto ≡ interactive)', () => {
    const base = bossUiState('bestball');
    // Watch path: one action plays the whole team-duel stop.
    const watch = reduce(base, { type: 'play' });
    // Interactive path: auto-finish each hole, completing hole by hole.
    let s = reduce(base, { type: 'playInteractive' });
    let guard = 0;
    while (s.screen === 'playing' && guard++ < 40) {
      s = s.play!.done ? reduce(s, { type: 'holeComplete' }) : reduce(s, { type: 'autoShotHole' });
    }
    expect(s.screen).not.toBe('playing');
    // Same holes, same winners, same scoreline — the reveal timing moved, the stream didn't.
    expect(s.match!.duels.map((d) => [d.playerStrokes, d.bossStrokes, d.winner])).toEqual(
      watch.match!.duels.map((d) => [d.playerStrokes, d.bossStrokes, d.winner]),
    );
    expect(s.match!.holesUp).toBe(watch.match!.holesUp);
    expect(s.lastResult!.passed).toBe(watch.lastResult!.passed);
  });
});
