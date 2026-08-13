import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { dist, type Hole, type Vec } from '../src/sim/course/contract';
import { autoAimTarget, autoAimClub, aiClub, safeAimTarget, suggestPlayerClub, layupTarget, pinOf, biomeCarryMult, forcedCarry } from '../src/sim/round';
import { beginHole, previewShot, type ShotDecision } from '../src/sim/rpg/play';
import { startingLoadout } from '../src/sim/rpg/economy';
import { applyBagTier } from '../src/sim/rpg/bag';
import { CLUBS, clubDist, type Club } from '../src/sim/clubs';
import { clubTotalReach, flightCarryScale, flightKnockdown, flightProfileOf } from '../src/sim/flight';
import { lieAt, lieInfo } from '../src/sim/shot';
import type { FeatureKind } from '../src/sim/course/contract';

/** The longest-carry usable (non-putter) club in a bag — the driver in the default bag. */
function longestClub(bag = CLUBS) {
  return bag.filter((c) => c.id !== 'putter').reduce((a, b) => (clubDist(b) > clubDist(a) ? b : a));
}

/** Point a fraction t (arc length) along the centreline — mirrors the generator's centrePoint. */
function alongAt(line: Vec[], t: number): Vec {
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    const l = Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
    segLens.push(l);
    total += l;
  }
  let want = total * Math.max(0, Math.min(1, t));
  for (let i = 1; i < line.length; i++) {
    const l = segLens[i - 1]!;
    if (want <= l || i === line.length - 1) {
      const f = l === 0 ? 0 : want / l;
      const a = line[i - 1]!;
      const b = line[i]!;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    want -= l;
  }
  return line[0]!;
}

/** Shortest distance from a point to the centreline polyline (how far off-corridor the aim is). */
function distToCentreline(hole: Hole, p: Vec): number {
  let best = Infinity;
  for (let i = 0; i <= 80; i++) best = Math.min(best, dist(p, alongAt(hole.centreline, i / 80)));
  return best;
}

/** Max TOTAL reach the default bag can finish at from the tee (yards) — mirrors round.ts maxReachOf.
 *  Reads `clubTotalReach`, not the club's bare number: the number is a nominal CARRY and the ball runs
 *  out past it, so the bare number understates the finish by the legacy roll (GS-carry-roll-real). */
function maxNominalReach(carryMult: number): number {
  let max = 0;
  for (const c of CLUBS) if (c.id !== 'putter') max = Math.max(max, clubTotalReach(c.id, c.carry));
  return max * carryMult;
}

/** Where a club's FULL swing down the ball→target line first LANDS (yards from the ball) — the flight,
 *  not the finish. The number every carry decision must be measured against (contract 5's coupling). */
function flightCarryOf(club: Club, carryMult: number, lie: FeatureKind = 'tee'): number {
  return clubDist(club) * flightCarryScale(club.id, clubDist(club)) * carryMult * lieInfo(lie).carryMult;
}

/** Would this club's flight to `land` be swatted out of the air by a canopy (GS-auto-aim-trees)? Asked
 *  of the sim's OWN walk — the same `flightKnockdown` that resolves the shot — so these guards measure
 *  the rule rather than a re-implementation of it. */
function knockedDown(h: Hole, from: Vec, land: Vec, club: Club, carry: number): boolean {
  const bearing = ((Math.atan2(land[0] - from[0], land[1] - from[1]) * 180) / Math.PI + 360) % 360;
  return !!flightKnockdown(h, from, land, bearing, carry, clubDist(club), flightProfileOf(club.id));
}

describe('smart default aim (GS-default-aim)', () => {
  it('is a pure function of the hole/ball/lie/bag (determinism)', () => {
    const c = generateCourse(4242, { biome: 'verdant-station', holes: 6, wildness: 0.5 });
    for (const h of c.holes) {
      const cm = biomeCarryMult(h);
      expect(autoAimTarget(h, h.tee, 'tee', CLUBS, cm)).toEqual(autoAimTarget(h, h.tee, 'tee', CLUBS, cm));
    }
  });

  it('a par 3 attacks the FLAG (unchanged from the old default)', () => {
    let par3s = 0;
    for (let s = 0; s < 60; s++) {
      const c = generateCourse(s + 11000, { biome: 'verdant-station', holes: 6, wildness: 0.5 });
      for (const h of c.holes) {
        if (h.par !== 3) continue;
        par3s++;
        expect(autoAimTarget(h, h.tee, 'tee', CLUBS, biomeCarryMult(h))).toEqual(pinOf(h));
      }
    }
    expect(par3s).toBeGreaterThan(10);
  });

  it('a par 4/5 TEE shot aims DOWN the corridor — near the centreline, forward, within a drive', () => {
    let checked = 0;
    let offCorridorIfAttacking = 0; // holes where attacking the pin would sit well off the centreline
    for (let s = 0; s < 120; s++) {
      let c;
      try {
        c = generateCourse(s + 12000, { holes: 4, wildness: 0.7 });
      } catch {
        continue; // benign raw-throw config — production retries it
      }
      for (const h of c.holes) {
        if (h.par < 4 || h.widthId?.startsWith('island')) continue; // island-hop holes have no fairway corridor
        const cm = biomeCarryMult(h);
        const reach = maxNominalReach(cm);
        const t = autoAimTarget(h, h.tee, 'tee', CLUBS, cm);
        checked++;
        // Progress toward the green, never aimed past it, and reachable in one drive.
        expect(dist(t, h.green)).toBeLessThanOrEqual(dist(h.tee, h.green) + 1e-6);
        expect(dist(h.tee, t)).toBeLessThanOrEqual(reach + 1e-6);
        // The aim sits ON the corridor (a real "down the fairway" line), not out in the rough.
        expect(distToCentreline(h, t)).toBeLessThan(18);
        // Where the straight line to the flag would land well off the centreline (a dogleg), the smart
        // aim is meaningfully closer to the corridor than that pin line — the whole point of the change.
        const pinDir = pinOf(h);
        const pinLine: Vec = [
          h.tee[0] + (pinDir[0] - h.tee[0]) * Math.min(1, (reach * 0.88) / (dist(h.tee, pinDir) || 1)),
          h.tee[1] + (pinDir[1] - h.tee[1]) * Math.min(1, (reach * 0.88) / (dist(h.tee, pinDir) || 1)),
        ];
        if (distToCentreline(h, pinLine) > 22) {
          offCorridorIfAttacking++;
          expect(distToCentreline(h, t)).toBeLessThan(distToCentreline(h, pinLine));
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
    // The dogleg improvement is LIVE: some holes genuinely punish an attack-the-pin tee line.
    expect(offCorridorIfAttacking).toBeGreaterThan(0);
  });

  it('a reachable NON-tee approach attacks the flag (best shot at the hole)', () => {
    let checked = 0;
    for (let s = 0; s < 120; s++) {
      let c;
      try {
        c = generateCourse(s + 13000, { holes: 4, wildness: 0.5 });
      } catch {
        continue;
      }
      for (const h of c.holes) {
        if (h.par < 4 || h.widthId?.startsWith('island')) continue;
        const cm = biomeCarryMult(h);
        // Sit the ball on a fairway station ~90 yds short of the green — comfortably within reach.
        const near: Vec = alongAt(h.centreline, 0.98);
        const back: Vec = alongAt(h.centreline, 0.72);
        const ball: Vec = dist(back, pinOf(h)) < maxNominalReach(cm) ? back : near;
        if (dist(ball, pinOf(h)) > maxNominalReach(cm)) continue;
        checked++;
        expect(autoAimTarget(h, ball, 'fairway', CLUBS, cm)).toEqual(pinOf(h));
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it("auto ≡ interactive: previewShot 'auto' resolves the SAME target the resolver returns (contract 2)", () => {
    const c = generateCourse(777, { biome: 'verdant-station', holes: 6, wildness: 0.6 });
    const lo = startingLoadout();
    for (const h of c.holes) {
      if (h.par < 4) continue;
      const play = beginHole(h, 0);
      const cm = biomeCarryMult(h);
      const tgt = autoAimTarget(h, play.ball, play.lie, CLUBS, cm);
      const dAuto: ShotDecision = { clubId: 'D', aim: 'auto', power: 1 };
      const dExplicit: ShotDecision = { clubId: 'D', aim: 'attack', target: tgt, power: 1 };
      // The 'auto' aim and an explicit free-target at the same point yield an identical contemplated cone.
      expect(previewShot(play, dAuto, lo)).toEqual(previewShot(play, dExplicit, lo));
    }
  });

  it('the default club (autoAimClub) never clubs DOWN off the tee — driver on an open corridor', () => {
    let checked = 0;
    let driverPicks = 0;
    const driver = longestClub();
    for (let s = 0; s < 120; s++) {
      let c;
      try {
        c = generateCourse(s + 14000, { holes: 4, wildness: 0.6 });
      } catch {
        continue;
      }
      for (const h of c.holes) {
        if (h.par < 4 || h.widthId?.startsWith('island')) continue;
        const cm = biomeCarryMult(h);
        const tgt = autoAimTarget(h, h.tee, 'tee', CLUBS, cm);
        const pick = autoAimClub(h, h.tee, 'tee', CLUBS, cm);
        // The whole bug: defaulting to a 5-wood. The fix NEVER pre-arms a club shorter than the auto
        // sim's club-down `aiClub` default — on an OPEN corridor it bombs the driver, on a forced-carry
        // drive it lays up with `aiClub` (never over-clubbing into the hazard).
        const oldDefault = aiClub(h, h.tee, tgt, cm, CLUBS);
        // …with ONE exception, and it is a rule rather than a let-off: `aiClub` reasons about REACHING
        // the target and never asks where the ball comes DOWN, so on a hole with a second hazard past
        // the first (a lava field beyond the river, the void past a ship's deck) its club reaches the
        // target by landing in the water. `autoAimClub` reads the landing, so it steps DOWN below
        // `aiClub` — correctly: a stroke short in the rough beats a penalty drop. Assert the real
        // invariant, that a step-down is always FORCED — every longer club would be short of the far
        // bank or wet on arrival (measured: 3 step-downs in 1,083 tee shots, all forced).
        // GS-auto-aim-trees added the SECOND reason a longer club can be illegal — a canopy swats it
        // out of the air — so the guard grew a clause rather than a let-off: the assertion is still
        // "every longer club was unplayable", it now knows about the other way to be unplayable.
        if (clubDist(pick) < clubDist(oldDefault) - 1e-6) {
          const fc = forcedCarry(h, h.tee, tgt);
          const legalLonger = CLUBS.filter((c) => c.id !== 'putter' && clubDist(c) > clubDist(pick)).filter((c) => {
            const carry = flightCarryOf(c, cm);
            if (fc && carry < fc.carry) return false; // short of the far bank — not a legal carry club
            const u = dist(h.tee, tgt) || 1;
            const land: Vec = [h.tee[0] + ((tgt[0] - h.tee[0]) / u) * carry, h.tee[1] + ((tgt[1] - h.tee[1]) / u) * carry];
            if (lieInfo(lieAt(h, land)).penalty) return false; // wet on arrival
            return !knockedDown(h, h.tee, land, c, carry); // …and it has to get there through the air
          });
          expect(legalLonger.map((c) => c.id), `clubbed down to ${pick.id} with legal longer clubs left`).toEqual([]);
        }
        checked++;
        if (pick.id === driver.id) driverPicks++;
      }
    }
    expect(checked).toBeGreaterThan(50);
    // Most open par-4/5 tee shots now pre-arm the driver (the fix); the rest are forced-carry lay-ups.
    expect(driverPicks / checked).toBeGreaterThan(0.5);
  });

  it('a forced-CARRY tee drive takes the DRIVER (not a clubbed-down wood) when it clears the hazard', () => {
    // The reported bug: a long par-4 tee shot whose aim line flies over a river/creek defaulted to a
    // 5-wood — `autoAimClub` clubbed DOWN to the shortest club that reached the carry landing, even
    // though the driver flew the hazard easily (and further). A player takes MORE club to carry, not
    // less. Uses the epic bag (the 'Phoenix' set the bug was seen on) so a real driver is in the bag.
    const bag = applyBagTier(startingLoadout(), 'epic').bag;
    const driver = bag.filter((c) => c.id !== 'putter').reduce((a, b) => (clubDist(b) > clubDist(a) ? b : a));
    let carries = 0;
    let driverPicks = 0;
    for (let s = 0; s < 300; s++) {
      let c;
      try {
        c = generateCourse(s + 50000, { holes: 6, wildness: 0.6, compose: true });
      } catch {
        continue;
      }
      for (const h of c.holes) {
        if (h.par < 4 || h.widthId?.startsWith('island')) continue;
        const cm = biomeCarryMult(h);
        const tgt = autoAimTarget(h, h.tee, 'tee', bag, cm);
        if (dist(tgt, pinOf(h)) <= 1) continue; // a green attack, not a positioning drive
        const fc = forcedCarry(h, h.tee, tgt);
        if (!fc) continue; // only the forced-carry drives — the ones the bug hit
        carries++;
        const pick = autoAimClub(h, h.tee, 'tee', bag, cm);
        // The picked club must ALWAYS carry past the hazard's far bank (never drop a soft club into it),
        // measured on its FLIGHT — the coupling contract 5 names: a forced carry is cleared in the AIR,
        // the run cannot be counted on to span water. (This read the club's bare NUMBER before, which is
        // a nominal carry the ball runs out past — so it was the wrong quantity on both sides of the
        // split: too lax while `carryFrac` sat below 0.847, too strict above it. GS-carry-roll-real.)
        expect(flightCarryOf(pick, cm)).toBeGreaterThanOrEqual(fc.carry - 1e-6);
        if (pick.id === driver.id) driverPicks++;
      }
    }
    expect(carries).toBeGreaterThan(50);
    // The overwhelming majority of forced-carry drives the driver clears now pre-arm the DRIVER (a few
    // legitimately step down: the driver can't clear, or would overshoot into a second hazard).
    expect(driverPicks / carries).toBeGreaterThan(0.9);
  });

  it('a reachable approach pre-arms the green-COVERAGE club (never a club short of the green)', () => {
    let checked = 0;
    for (let s = 0; s < 120; s++) {
      let c;
      try {
        c = generateCourse(s + 15000, { holes: 4, wildness: 0.5 });
      } catch {
        continue;
      }
      for (const h of c.holes) {
        if (h.par < 4 || h.widthId?.startsWith('island')) continue;
        const cm = biomeCarryMult(h);
        const back: Vec = alongAt(h.centreline, 0.72);
        const near: Vec = alongAt(h.centreline, 0.98);
        const ball: Vec = dist(back, pinOf(h)) < maxNominalReach(cm) ? back : near;
        if (dist(ball, pinOf(h)) > maxNominalReach(cm)) continue;
        checked++;
        // Auto aims at the flag here → the club is the green-coverage suggestion (the MOST club that
        // still holds the green), matching the attack suggestion — NOT the auto sim's club-down pick.
        const pick = autoAimClub(h, ball, 'fairway', CLUBS, cm);
        const cover = suggestPlayerClub(h, ball, 'fairway', CLUBS, { carryMult: cm });
        // …unless a canopy eats the coverage club (GS-auto-aim-trees), in which case the pick steps
        // DOWN to the longest club that still holds the green AND gets there through the air. Never
        // UP — flying the green to dodge a tree trades a knockdown for the back-of-green trouble
        // GS-green-backstop exists to make expensive. So the assertion is two-sided: it is the
        // coverage club, or it is shorter and the coverage club was provably knocked down.
        if (pick.id !== cover.id) {
          expect(clubDist(pick), `${pick.id} is LONGER than the coverage club ${cover.id}`).toBeLessThan(
            clubDist(cover),
          );
          const carry = flightCarryOf(cover, cm);
          const u = dist(ball, pinOf(h)) || 1;
          const land: Vec = [
            ball[0] + ((pinOf(h)[0] - ball[0]) / u) * carry,
            ball[1] + ((pinOf(h)[1] - ball[1]) / u) * carry,
          ];
          expect(
            knockedDown(h, ball, land, cover, carry),
            `stepped off the coverage club ${cover.id} → ${pick.id} with nothing in the way`,
          ).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('autoAimClub is deterministic (pure of hole/ball/lie/bag)', () => {
    const c = generateCourse(4242, { biome: 'verdant-station', holes: 6, wildness: 0.5 });
    for (const h of c.holes) {
      const cm = biomeCarryMult(h);
      expect(autoAimClub(h, h.tee, 'tee', CLUBS, cm)).toEqual(autoAimClub(h, h.tee, 'tee', CLUBS, cm));
    }
  });

  it("'safe' is unchanged (still the corridor lay-up), so only 'auto' is new behaviour", () => {
    const c = generateCourse(999, { holes: 6, wildness: 0.8 });
    for (const h of c.holes) {
      if (h.par < 4) continue;
      const cm = biomeCarryMult(h);
      // The safe target still delegates to layupTarget exactly — no drift introduced by the refactor.
      const play = beginHole(h, 0);
      const lo = startingLoadout();
      const safeCone = previewShot(play, { clubId: 'D', aim: 'safe', power: 1 }, lo);
      const layupCone = previewShot(play, { clubId: 'D', aim: 'attack', target: layupTarget(h, play.ball, play.lie, CLUBS, cm), power: 1 }, lo);
      expect(safeCone).toEqual(layupCone);
    }
  });
});

/**
 * GS-auto-aim-trees — the DEFAULT aim (◎) does not pre-arm a shot into timber.
 *
 * The other half of GS-safe-aim-trees, and a different job: where 🛟 goes ROUND a stand, auto LAYS UP
 * SHORT of it, because auto's whole purpose is to position down the hole (turning the default line
 * sideways would point the map off the corridor). Two seams do it — `fliesTo`/`unblockedClub` gate the
 * flag before attacking it, and `longestCarryClub`'s canopy clause steps the pre-armed club down to
 * one that gets there through the air.
 *
 * The invariant is NOT "no shot is ever knocked down" — a bag can be genuinely trapped behind a wall of
 * trees, and inventing a target it cannot make good on is the failure this feature avoids, not the one
 * it commits. It is: **if the shot auto pre-arms gets eaten, nothing in the bag could have flown that
 * line.** Measured over 29,343 positions on wooded worlds, eaten shots fell 16.04% → 6.63% and tee
 * shots 6 → 0, with 77.8% of what remains being the trapped case.
 */
describe('the default aim does not pre-arm a shot into timber (GS-auto-aim-trees)', () => {
  /** Where the pre-armed club's full swing lands aiming at `t`, and whether a canopy eats it. */
  const armedShotEaten = (h: Hole, ball: Vec, lie: FeatureKind): boolean => {
    const cm = biomeCarryMult(h);
    const t = autoAimTarget(h, ball, lie, CLUBS, cm);
    const club = autoAimClub(h, ball, lie, CLUBS, cm);
    const d = dist(ball, t);
    if (d < 1e-6) return false;
    const carry = flightCarryOf(club, cm, lie);
    const land: Vec = [ball[0] + ((t[0] - ball[0]) / d) * carry, ball[1] + ((t[1] - ball[1]) / d) * carry];
    return knockedDown(h, ball, land, club, carry);
  };
  /**
   * Was there a PLAYABLE club for this line the aim passed over? Restates the rule from the outside —
   * the flight has to get there (the new canopy clause), clear any bank it must carry, and come down
   * somewhere that is not a penalty — the same three clauses, and the same restating the older
   * "never clubs DOWN" guard above already does. That is what makes "the step-down was FORCED" an
   * assertion rather than a trust exercise.
   */
  const anyClubPlayable = (h: Hole, ball: Vec, t: Vec, lie: FeatureKind): boolean => {
    const cm = biomeCarryMult(h);
    const d = dist(ball, t);
    if (d < 1e-6) return true;
    const fc = forcedCarry(h, ball, t);
    for (const c of CLUBS) {
      if (c.id === 'putter') continue;
      const carry = flightCarryOf(c, cm, lie);
      if (fc && carry < fc.carry) continue; // short of the far bank
      const land: Vec = [ball[0] + ((t[0] - ball[0]) / d) * carry, ball[1] + ((t[1] - ball[1]) / d) * carry];
      if (lieInfo(lieAt(h, land)).penalty) continue; // wet on arrival
      if (!knockedDown(h, ball, land, c, carry)) return true;
    }
    return false;
  };
  /** The CANOPY question alone — what the green-attack gate asks, where a club is chosen on TOTAL and
   *  carrying short of a creek to release onto the green has always been good golf. */
  const anyClubFlies = (h: Hole, ball: Vec, t: Vec, lie: FeatureKind): boolean => {
    const cm = biomeCarryMult(h);
    const d = dist(ball, t);
    if (d < 1e-6) return true;
    for (const c of CLUBS) {
      if (c.id === 'putter') continue;
      const carry = flightCarryOf(c, cm, lie);
      const land: Vec = [ball[0] + ((t[0] - ball[0]) / d) * carry, ball[1] + ((t[1] - ball[1]) / d) * carry];
      if (!knockedDown(h, ball, land, c, carry)) return true;
    }
    return false;
  };
  /** Max TOTAL reach from THIS lie — mirrors round.ts `maxReachOf`, which scales by the lie (a shot
   *  from rough reaches less far, so a green that looks reachable from the fairway is not). */
  const reachFrom = (cm: number, lie: FeatureKind): number => maxNominalReach(cm) * lieInfo(lie).carryMult;
  const wooded = (seed: number, wildness: number): Hole[] => {
    try {
      return generateCourse(seed, { biome: 'jungle-moon', holes: 9, wildness }).holes;
    } catch {
      return [];
    }
  };
  /** A grid of ball positions — the interesting lies are beside the corridor, not on it. */
  function* positions(h: Hole): Generator<{ ball: Vec; lie: FeatureKind }> {
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

  it('a par-4/5 TEE shot is never pre-armed into a canopy', () => {
    let checked = 0;
    for (const seed of [1, 7, 42, 999, 5150]) {
      for (const wildness of [0.3, 0.7]) {
        for (const h of wooded(seed, wildness)) {
          if (h.par < 4 || h.widthId?.startsWith('island')) continue;
          checked++;
          if (!armedShotEaten(h, h.tee, 'tee')) continue;
          // The one permitted exception, and it must be PROVED: the bag is trapped.
          const t = autoAimTarget(h, h.tee, 'tee', CLUBS, biomeCarryMult(h));
          expect(anyClubPlayable(h, h.tee, t, 'tee'), 'pre-armed a tee shot into trees it could have avoided').toBe(false);
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('every shot it pre-arms flies, unless nothing in the bag could have', () => {
    let checked = 0;
    let eaten = 0;
    for (const seed of [1, 42, 999]) {
      for (const h of wooded(seed, 0.6)) {
        const cm = biomeCarryMult(h);
        for (const { ball, lie } of positions(h)) {
          checked++;
          if (!armedShotEaten(h, ball, lie)) continue;
          eaten++;
          const t = autoAimTarget(h, ball, lie, CLUBS, cm);
          // A par 3 always attacks the flag — there is nowhere else to aim, and the blocked cone over
          // it says "shape this one". Everywhere else an eaten shot has to be a trapped bag, and what
          // counts as trapped depends on which shot this is:
          if (h.par <= 3) continue;
          if (dist(t, pinOf(h)) <= 1) {
            // A GREEN ATTACK, where the pick is capped at the coverage club: flying the green to dodge
            // a tree trades a knockdown for the back-of-green trouble GS-green-backstop exists to make
            // expensive, so a longer club being available is not a miss. Trapped here means nothing at
            // or below the coverage club gets there through the air.
            const cover = suggestPlayerClub(h, ball, lie, CLUBS, { carryMult: cm });
            const under = CLUBS.filter((c) => c.id !== 'putter' && clubDist(c) <= clubDist(cover));
            const flying = under.filter((c) => {
              const carry = flightCarryOf(c, cm, lie);
              const d = dist(ball, t) || 1;
              const land: Vec = [ball[0] + ((t[0] - ball[0]) / d) * carry, ball[1] + ((t[1] - ball[1]) / d) * carry];
              return !knockedDown(h, ball, land, c, carry);
            });
            expect(flying.map((c) => c.id), `${lie} lie: capped-out clubs that would have flown`).toEqual([]);
          } else {
            // A POSITIONING shot: nothing in the bag may be playable on that line.
            expect(anyClubPlayable(h, ball, t, lie), `${lie} lie: pre-armed a shot the bag could have flown`).toBe(false);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
    // Sanity that the census is looking at a hard enough sample to mean anything.
    expect(eaten).toBeGreaterThan(0);
  });

  it('the flag is still attacked whenever a club can fly there, and abandoned only when none can', () => {
    let attacks = 0;
    let laidUp = 0;
    for (const seed of [3, 42, 777]) {
      for (const h of wooded(seed, 0.6)) {
        if (h.par < 4) continue;
        const cm = biomeCarryMult(h);
        for (const { ball, lie } of positions(h)) {
          // Comfortably inside the reach this lie actually has, so the assertion never rides the
          // boundary of the reachable-green branch it is about.
          if (lie === 'tee' || dist(ball, pinOf(h)) > reachFrom(cm, lie) * 0.9) continue;
          const t = autoAimTarget(h, ball, lie, CLUBS, cm);
          const flies = anyClubFlies(h, ball, pinOf(h), lie);
          if (flies) {
            // Unchanged behaviour: a reachable green is attacked.
            expect(t).toEqual(pinOf(h));
            attacks++;
          } else if (dist(t, pinOf(h)) > 1) {
            // Abandoned — and then it is a LAY-UP down the hole, never a turn: that is 🛟's job.
            laidUp++;
            expect(dist(ball, t), 'a lay-up must be a real positioning shot, not a token nudge').toBeGreaterThan(20);
          }
        }
      }
    }
    expect(attacks).toBeGreaterThan(50);
    expect(laidUp, 'the trapped-green case never fired — the sample is too easy to prove anything').toBeGreaterThan(0);
  });

  it('steps the club DOWN to one that gets there — and the step-down really was forced', () => {
    let stepped = 0;
    for (const seed of [1, 42, 999, 5150]) {
      for (const h of wooded(seed, 0.6)) {
        const cm = biomeCarryMult(h);
        for (const { ball, lie } of positions(h)) {
          const t = autoAimTarget(h, ball, lie, CLUBS, cm);
          const pick = autoAimClub(h, ball, lie, CLUBS, cm);
          const d = dist(ball, t);
          if (d < 1e-6) continue;
          // Every LONGER club that was passed over must have been unplayable — eaten, wet on arrival,
          // or short of a bank it had to carry. (The wet/bank half is the pre-existing rule; this
          // asserts the canopy half did not start rejecting clubs for no reason.)
          for (const c of CLUBS) {
            if (c.id === 'putter' || clubDist(c) <= clubDist(pick)) continue;
            const carry = flightCarryOf(c, cm, lie);
            const land: Vec = [ball[0] + ((t[0] - ball[0]) / d) * carry, ball[1] + ((t[1] - ball[1]) / d) * carry];
            const fc = forcedCarry(h, ball, t);
            const legal =
              (!fc || carry >= fc.carry) && !lieInfo(lieAt(h, land)).penalty && !knockedDown(h, ball, land, c, carry);
            if (legal) {
              // Legal longer club left on the table is only allowed on a green attack, where the pick
              // is capped at the coverage club so a blocked approach can never fly the green.
              expect(dist(t, pinOf(h)), `${pick.id} left a legal longer club (${c.id}) unpicked`).toBeLessThanOrEqual(1);
            }
          }
          if (knockedDown(h, ball, [ball[0] + ((t[0] - ball[0]) / d) * flightCarryOf(longestClub(), cm, lie), ball[1] + ((t[1] - ball[1]) / d) * flightCarryOf(longestClub(), cm, lie)], longestClub(), flightCarryOf(longestClub(), cm, lie)) && pick.id !== longestClub().id) {
            stepped++;
          }
        }
      }
    }
    // The feature has to actually FIRE, or every assertion above is vacuously true.
    expect(stepped, 'the club never stepped down off a canopy-eaten driver — is the clause wired?').toBeGreaterThan(20);
  });

  it('the memo hands back the answer the search would have recomputed', () => {
    const h = wooded(42, 0.6)[0]!;
    const cm = biomeCarryMult(h);
    const shortBag = CLUBS.filter((c) => c.carry <= 150);
    for (const { ball, lie } of positions(h)) {
      const a = autoAimTarget(h, ball, lie, CLUBS, cm);
      const b = autoAimTarget(h, ball, lie, CLUBS, cm);
      expect(b).toEqual(a);
      expect(b).not.toBe(a); // a copy out, so no caller can write through the cache
      a[0] = 1e9;
      expect(autoAimTarget(h, ball, lie, CLUBS, cm)).toEqual(b);
      // Every input is part of the key, and the two modes get their own entry — interleaving auto with
      // safe (which the player does by tapping ◎) must not let either see the other's answer.
      const short = autoAimTarget(h, ball, lie, shortBag, cm);
      safeAimTarget(h, ball, lie, CLUBS, cm);
      expect(autoAimTarget(h, ball, lie, CLUBS, cm)).toEqual(b);
      expect(autoAimTarget(h, ball, lie, shortBag, cm)).toEqual(short);
    }
  });
});
