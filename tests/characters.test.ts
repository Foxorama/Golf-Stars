import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, playHole } from '../src/sim/round';
import { resolveShot } from '../src/sim/shot';
import { playTotals } from '../src/sim/score';
import { CLUBS } from '../src/sim/clubs';
import { startingLoadout, netDispersion } from '../src/sim/rpg/economy';
import {
  CHARACTERS,
  DEFAULT_CHARACTER_ID,
  applyCharacter,
  characterShotMods,
  getCharacter,
} from '../src/sim/rpg/characters';
import { startRun, snapshotRun, resumeRun, playStop } from '../src/sim/rpg/run';
import { beginHole, takeShot, autoDecision, holeResult } from '../src/sim/rpg/play';

/** Mean per-stop Stableford for a golfer over a fixed spread of seeded stops — the balance metric
 *  (CLAUDE.md: NOT full-run distance). Mirrors the run/shop balance harness, plus the character. */
function meanStableford(characterId: string | undefined, n = 400): number {
  const lo = applyCharacter(characterId, startingLoadout());
  const shotMods = characterShotMods(characterId);
  let sf = 0;
  for (let s = 0; s < n; s++) {
    const c = generateCourse(`${s}:stop`, { holes: 6, distanceFromStart: s % 12 });
    const played = playCourse(c.holes, new Rng(`${c.seed}:play`), {
      bag: lo.bag,
      dispersionMult: netDispersion(lo),
      shotMods,
    });
    sf += playTotals(played.map((p) => p.record)).stableford;
  }
  return sf / n;
}

/** Mean strokes-over-par per hole over many wild stops — the no-death-spiral bar (< 1.0). */
function meanToParPerHole(characterId: string | undefined, n = 300): number {
  const lo = applyCharacter(characterId, startingLoadout());
  const shotMods = characterShotMods(characterId);
  let over = 0;
  let holes = 0;
  for (let s = 0; s < n; s++) {
    const c = generateCourse(`${s}:wild`, { holes: 6, wildness: 1 });
    const played = playCourse(c.holes, new Rng(`${c.seed}:play`), {
      bag: lo.bag,
      dispersionMult: netDispersion(lo),
      shotMods,
    });
    for (const p of played) {
      over += p.record.strokes - p.record.par;
      holes++;
    }
  }
  return over / holes;
}

const carryOf = (bag: { id: string; carry: number }[], id: string): number =>
  bag.find((c) => c.id === id)!.carry;

describe('character roster (GS-18)', () => {
  it('every character is well-formed and ids are unique & stable', () => {
    const ids = CHARACTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_CHARACTER_ID);
    for (const ch of CHARACTERS) {
      expect(ch.name).toBeTruthy();
      expect(ch.pros.length).toBeGreaterThan(0);
      expect(ch.cons.length).toBeGreaterThan(0);
      expect(ch.style.cap).toMatch(/^#/);
      // clubMods is total: defined and neutral-typed for every club in the bag.
      for (const c of CLUBS) {
        const m = ch.clubMods(c.carry);
        expect(Number.isFinite(m.dispMult)).toBe(true);
        expect(Number.isFinite(m.angleBias)).toBe(true);
        expect(Number.isFinite(m.rollFracDelta)).toBe(true);
      }
    }
  });

  it('applyCharacter stamps the id and is a no-op for an unknown/empty id', () => {
    const base = startingLoadout();
    expect(applyCharacter(undefined, base)).toBe(base);
    expect(applyCharacter('nobody', base)).toBe(base);
    const lo = applyCharacter('feather-fade', base);
    expect(lo.characterId).toBe('feather-fade');
  });
});

describe('character balance — each viable, none dominant (CLAUDE.md balance rule)', () => {
  const base = meanStableford(undefined);
  const perChar = CHARACTERS.map((ch) => ({ id: ch.id, mean: meanStableford(ch.id) }));

  it('no golfer death-spirals: every one beats the no-death bar on wild courses', () => {
    for (const ch of CHARACTERS) {
      const toPar = meanToParPerHole(ch.id);
      expect(toPar, `${ch.id} toPar/hole ${toPar.toFixed(3)}`).toBeLessThan(1.0);
    }
  });

  it('every golfer scores in a viable band around the neutral baseline', () => {
    for (const { id, mean } of perChar) {
      // Within ±18% of the characterless baseline — a clear identity, never a trap or an "easy mode".
      expect(Math.abs(mean - base) / base, `${id} mean ${mean.toFixed(2)} vs base ${base.toFixed(2)}`).toBeLessThan(
        0.18,
      );
    }
  });

  it('the roster clusters: best and worst golfer are close in mean Stableford', () => {
    const means = perChar.map((p) => p.mean);
    const spread = (Math.max(...means) - Math.min(...means)) / base;
    expect(spread, `roster spread ${(spread * 100).toFixed(1)}% — ${JSON.stringify(perChar)}`).toBeLessThan(0.2);
  });
});

describe('characters actually play differently (the shapes are real)', () => {
  const neutralBag = startingLoadout().bag;

  it('Longshot Larry bombs the distance clubs; Backspin Bo is shorter off the tee', () => {
    const larry = applyCharacter('longshot-larry', startingLoadout()).bag;
    const bo = applyCharacter('backspin-bo', startingLoadout()).bag;
    expect(carryOf(larry, 'D')).toBeGreaterThan(carryOf(neutralBag, 'D'));
    expect(carryOf(larry, '3W')).toBeGreaterThan(carryOf(neutralBag, '3W'));
    expect(carryOf(bo, 'D')).toBeLessThan(carryOf(neutralBag, 'D'));
    // Bo's scoring irons/wedges are untouched in length — only the big sticks shrink.
    expect(carryOf(bo, 'PW')).toBe(carryOf(neutralBag, 'PW'));
  });

  it('Feather Fade pushes the ball RIGHT of a straight shot (a fade)', () => {
    const driver = CLUBS.find((c) => c.id === 'D')!;
    const bias = getCharacter('feather-fade')!.clubMods(driver.carry).angleBias;
    expect(bias).toBeGreaterThan(0);
    // Fire the SAME rng with and without her bias — her ball finishes to the bearing's right.
    const from: [number, number] = [0, 0];
    const aim: [number, number] = [0, 200]; // straight up the screen (bearing 0)
    let rightCount = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const straight = resolveShot({ from, aim, club: driver, lie: 'fairway', rng: new Rng(`f${i}`) });
      const faded = resolveShot({ from, aim, club: driver, lie: 'fairway', angleBias: bias, rng: new Rng(`f${i}`) });
      if (faded.landing[0] > straight.landing[0]) rightCount++;
    }
    expect(rightCount).toBe(N); // the bias shifts every paired shot the same way
  });

  it('Huang-Woo hooks the long clubs LEFT but stripes the irons tighter', () => {
    const ch = getCharacter('huang-woo-hook')!;
    const driver = ch.clubMods(CLUBS.find((c) => c.id === 'D')!.carry);
    const iron = ch.clubMods(CLUBS.find((c) => c.id === '7i')!.carry);
    expect(driver.angleBias).toBeLessThan(0); // hook left off the tee
    expect(driver.dispMult).toBeGreaterThan(1); // wider with the big sticks
    expect(iron.dispMult).toBeLessThan(1); // surgical irons
  });

  it('Backspin Bo adds check to the scoring clubs (more backspin from 5-iron down)', () => {
    const ch = getCharacter('backspin-bo')!;
    expect(ch.clubMods(CLUBS.find((c) => c.id === '7i')!.carry).rollFracDelta).toBeLessThan(0);
    expect(ch.clubMods(CLUBS.find((c) => c.id === 'PW')!.carry).rollFracDelta).toBeLessThan(0);
    // The driver (above the 5-iron) is unaffected by the backspin trait.
    expect(ch.clubMods(CLUBS.find((c) => c.id === 'D')!.carry).rollFracDelta).toBe(0);
  });
});

describe('character determinism — auto ≡ interactive, byte-for-byte (with a golfer)', () => {
  for (const ch of CHARACTERS) {
    it(`${ch.id}: interactive auto-play matches playHole exactly`, () => {
      const lo = applyCharacter(ch.id, startingLoadout());
      const shotMods = characterShotMods(ch.id);
      let compared = 0;
      for (let seed = 0; seed < 60; seed++) {
        const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
        let driven = beginHole(hole);
        let guard = 0;
        const rng = new Rng(`${seed}:play`);
        while (!driven.done && guard++ < 25) driven = takeShot(driven, autoDecision(driven, lo), lo, rng);
        if (!driven.done) continue;
        const ai = playHole(hole, new Rng(`${seed}:play`), {
          bag: lo.bag,
          dispersionMult: netDispersion(lo),
          shotMods,
        });
        expect(holeResult(driven).record).toEqual(ai.record);
        expect(holeResult(driven).stat).toEqual(ai.stat);
        compared++;
      }
      expect(compared).toBeGreaterThan(40);
    });
  }
});

describe('character persistence — survives snapshot/resume', () => {
  it('the chosen golfer round-trips through a run snapshot, shape intact', () => {
    const run = startRun(99, undefined, {}, 'longshot-larry');
    expect(run.loadout.characterId).toBe('longshot-larry');
    const driverCarry = run.loadout.bag.find((c) => c.id === 'D')!.carry;

    const snap = snapshotRun(run);
    expect(snap.characterId).toBe('longshot-larry');

    const resumed = resumeRun(snap);
    expect(resumed.loadout.characterId).toBe('longshot-larry');
    // The distance tweak (and so the whole shape) is rebuilt, not lost.
    expect(resumed.loadout.bag.find((c) => c.id === 'D')!.carry).toBe(driverCarry);
  });

  it('playStop reproduces identically from a resumed run (the golfer shape persists)', () => {
    const run = startRun(7, undefined, {}, 'backspin-bo');
    const a = playStop(run);
    const b = playStop(resumeRun(snapshotRun(run)));
    expect(a.result.stableford).toBe(b.result.stableford);
    expect(a.result.gross).toBe(b.result.gross);
  });
});
