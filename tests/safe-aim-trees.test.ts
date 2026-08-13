/**
 * GS-safe-aim-trees — the interactive SAFE aim (🛟) gets the ball OUT.
 *
 * The lay-up is a corridor decision: it reasons about penalty hazards and corridor width, and a tree
 * is neither. So "play safe" from behind a stand aimed straight into it, and the only way out was for
 * the player to swing the aim round by hand and guess where the gap was. `safeAimTarget` asks the
 * sim's own knockdown walk whether the lay-up would actually fly, and when it would not, hunts a line
 * that gets the ball back onto playable ground.
 *
 * What this file pins:
 *   1. Wherever the lay-up flies clean, safe IS the lay-up — byte-for-byte (so the ordinary shot, and
 *      every treeless world, is untouched).
 *   2. Where it does not, the escape it picks flies clean, lands in bounds on non-penalty ground that
 *      is not the trouble it is escaping, and crosses no penalty hazard on the way.
 *   3. It never invents a target it cannot make good on: with no clean line in the fan it keeps the
 *      lay-up rather than aiming somewhere worse.
 *   4. The AUTO path never touches any of it — `autoDecision` pins the `layupTarget` it chose its club
 *      and power for as an explicit target, which is what keeps the interactive auto-finish resolving
 *      the headless `playHole` shot byte-for-byte (contract 2). The determinism suites
 *      (`play.test.ts`, `zones.test.ts`, `characters.test.ts`) are the end-to-end half of that claim;
 *      this is the structural half, so a refactor that drops the pin fails HERE, loudly, instead of
 *      surfacing as a seeded fixture drifting three files away.
 *   5. The one-entry memo can only ever return the answer the search would have recomputed.
 */
import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { aiClub, biomeCarryMult, layupTarget, safeAimTarget } from '../src/sim/round';
import { flightKnockdown, flightProfileOf } from '../src/sim/flight';
import { lieAt, lieInfo } from '../src/sim/shot';
import { inBounds } from '../src/sim/bounds';
import { CLUBS } from '../src/sim/clubs';
import { autoDecision, beginHole } from '../src/sim/rpg/play';
import { startingLoadout } from '../src/sim/rpg/economy';
import { dist, type Hole, type Vec } from '../src/sim/course/contract';

const bearingDeg = (a: Vec, b: Vec): number =>
  ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;

/** Would a shot at `target` be knocked out of the air? Asked of the sim's OWN walk, with the club the
 *  safe line is played with — the same question `safeAimTarget` asks, so this test measures the rule
 *  rather than a re-implementation of it. */
function knockedDown(h: Hole, ball: Vec, target: Vec): boolean {
  const cm = biomeCarryMult(h);
  const d = dist(ball, target);
  if (d < 1e-6) return false;
  const club = aiClub(h, ball, target, cm, CLUBS);
  return !!flightKnockdown(h, ball, target, bearingDeg(ball, target), d, club.carry, flightProfileOf(club.id));
}

/** True if the straight ball→target line crosses a penalty surface (the `clearLine` question). */
function crossesPenalty(h: Hole, ball: Vec, target: Vec): boolean {
  for (let i = 1; i < 20; i++) {
    const t = i / 20;
    const p: Vec = [ball[0] + (target[0] - ball[0]) * t, ball[1] + (target[1] - ball[1]) * t];
    if (lieInfo(lieAt(h, p)).penalty) return true;
  }
  return false;
}

/** A grid of ball positions across a hole's box — deliberately crude, because the interesting lies
 *  (rough beside a grove, deep in the trees) are exactly the ones a centreline walk never visits. */
function* positions(h: Hole): Generator<{ ball: Vec; lie: ReturnType<typeof lieAt> }> {
  for (let i = 0; i <= 6; i++) {
    for (let j = -4; j <= 4; j++) {
      const t = i / 6;
      const ball: Vec = [
        h.tee[0] + (h.green[0] - h.tee[0]) * t + j * 14,
        h.tee[1] + (h.green[1] - h.tee[1]) * t + j * 7,
      ];
      const lie = lieAt(h, ball);
      if (lie === 'green') continue;
      yield { ball, lie };
    }
  }
}

const WOODED = ['verdant-station', 'jungle-moon'] as const;

describe('the SAFE aim gets out of the trees (GS-safe-aim-trees)', () => {
  it('is the lay-up, byte-for-byte, wherever the lay-up flies clean', () => {
    let checked = 0;
    for (const seed of [1, 42, 999]) {
      for (const biome of WOODED) {
        const c = generateCourse(seed, { biome, holes: 9, wildness: 0.6 });
        for (const h of c.holes) {
          const cm = biomeCarryMult(h);
          for (const { ball, lie } of positions(h)) {
            const lay = layupTarget(h, ball, lie, CLUBS, cm);
            if (knockedDown(h, ball, lay)) continue;
            expect(safeAimTarget(h, ball, lie, CLUBS, cm)).toEqual(lay);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('finds a line that FLIES, onto ground worth standing on, whenever the lay-up is blocked', () => {
    let blocked = 0;
    let escaped = 0;
    for (const seed of [1, 7, 42, 999]) {
      for (const biome of WOODED) {
        for (const wildness of [0.3, 0.9]) {
          const c = generateCourse(seed, { biome, holes: 9, wildness });
          for (const h of c.holes) {
            const cm = biomeCarryMult(h);
            for (const { ball, lie } of positions(h)) {
              const lay = layupTarget(h, ball, lie, CLUBS, cm);
              if (!knockedDown(h, ball, lay)) continue;
              blocked++;
              const safe = safeAimTarget(h, ball, lie, CLUBS, cm);
              if (safe[0] === lay[0] && safe[1] === lay[1]) continue; // no clean line existed — case below
              escaped++;
              // The four things that make an escape an escape.
              expect(knockedDown(h, ball, safe), 'the escape must fly clean').toBe(false);
              expect(crossesPenalty(h, ball, safe), 'never punch OVER water/lava/the void').toBe(false);
              expect(inBounds(h, safe), 'never aim out of bounds').toBe(true);
              const land = lieAt(h, safe);
              expect(lieInfo(land).penalty, `escaped into ${land}`).toBeFalsy();
              expect(['trees', 'deeprough']).not.toContain(land);
            }
          }
        }
      }
    }
    // The blocked lay-up is not a corner case: it is ~14% of the positions a player can stand in on a
    // wooded world, which is why "safe" aiming into a canopy was worth fixing.
    expect(blocked).toBeGreaterThan(200);
    expect(escaped / blocked).toBeGreaterThan(0.9);
  });

  it('keeps the lay-up rather than inventing a target when nothing in the fan flies', () => {
    // The fall-back is the point: an escape that cannot be found must leave the player exactly where
    // the old aim left them, never at some worse-scoring point that also happens to be blocked.
    const c = generateCourse(5150, { biome: 'jungle-moon', holes: 9, wildness: 0.9 });
    for (const h of c.holes) {
      const cm = biomeCarryMult(h);
      for (const { ball, lie } of positions(h)) {
        const lay = layupTarget(h, ball, lie, CLUBS, cm);
        const safe = safeAimTarget(h, ball, lie, CLUBS, cm);
        const kept = safe[0] === lay[0] && safe[1] === lay[1];
        if (!kept) expect(knockedDown(h, ball, safe)).toBe(false);
      }
    }
  });

  it('the AUTO driver pins its own target, so the auto-finish never inherits the escape (contract 2)', () => {
    const lo = startingLoadout();
    for (const seed of [3, 77]) {
      const c = generateCourse(seed, { biome: 'jungle-moon', holes: 9, wildness: 0.7 });
      for (const h of c.holes) {
        const cm = biomeCarryMult(h);
        const play = beginHole(h, 0);
        const d = autoDecision(play, lo);
        expect(d.aim).toBe('safe');
        // The target is the LAY-UP — the point the club and the power below were chosen for — passed
        // explicitly so `aimTargetOf` can never resolve the player's escape for the auto path.
        expect(d.target).toEqual(layupTarget(h, play.ball, play.lie, CLUBS, cm));
      }
    }
  });

  it('the memo hands back the answer the search would have recomputed', () => {
    const c = generateCourse(42, { biome: 'jungle-moon', holes: 9, wildness: 0.7 });
    const h = c.holes[0]!;
    const cm = biomeCarryMult(h);
    // Same inputs twice → same answer (and a different copy, so no caller can write through the cache).
    for (const { ball, lie } of positions(h)) {
      const a = safeAimTarget(h, ball, lie, CLUBS, cm);
      const b = safeAimTarget(h, ball, lie, CLUBS, cm);
      expect(b).toEqual(a);
      expect(b).not.toBe(a);
      a[0] = 1e9;
      expect(safeAimTarget(h, ball, lie, CLUBS, cm)).toEqual(b);
    }
    // …and every input is part of the key: a shorter bag reaches less far, so it must be free to
    // answer differently, and interleaving the two must not let either see the other's answer.
    const shortBag = CLUBS.filter((cl) => cl.carry <= 150);
    for (const { ball, lie } of positions(h)) {
      const full = safeAimTarget(h, ball, lie, CLUBS, cm);
      const short = safeAimTarget(h, ball, lie, shortBag, cm);
      expect(safeAimTarget(h, ball, lie, CLUBS, cm)).toEqual(full);
      expect(safeAimTarget(h, ball, lie, shortBag, cm)).toEqual(short);
    }
  });
});
