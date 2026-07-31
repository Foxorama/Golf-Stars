import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import { chipInPath, hasBackspin, playCourse, playHole, pinOf, shotSpread, sprayTotalHigh, HOLE_OUT_RADIUS } from '../src/sim/round';
import { characterShotMods } from '../src/sim/rpg/characters';
import { CLUBS } from '../src/sim/clubs';
import { dist, type Vec } from '../src/sim/course/contract';

describe('bounce & roll-out (GS feedback #2)', () => {
  it('shots record a rest position reached by rolling (signed) from touchdown', () => {
    let sawRoll = false;
    for (let seed = 0; seed < 60 && !sawRoll; seed++) {
      const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      for (const s of playHole(hole, new Rng(`${seed}:play`)).shots) {
        if (s.penalty) continue;
        // `roll` is SIGNED (long clubs run forward, wedges check to a stop) and is measured as ARC
        // length along the run-out — which on a CONTOURED green CURLS (GS-green-contour-2). So the
        // straight-line chord from touchdown to rest is the arc's chord: never longer, and shorter by
        // more the further the ball runs and the more the green tilts. Assert that relationship,
        // rather than a fixed epsilon that only held while every club ran the same short distance
        // (GS-runout-club gave the long irons 19.8% run against the old flat 11.1%, and a 30-yard
        // curled run bows past a 0.05yd tolerance).
        const chord = dist(s.rest, s.result.landing);
        expect(chord).toBeLessThanOrEqual(Math.abs(s.roll) + 1e-6);
        expect(chord).toBeGreaterThan(Math.abs(s.roll) * 0.9 - 0.05);
        if (s.roll > 0.5) sawRoll = true;
      }
    }
    expect(sawRoll).toBe(true);
  });

  it('a plain player never spins the ball BACK, but Backspin Bo does (GS-backspin-optin)', () => {
    let plainCheck = false;
    let boCheck = false;
    const bo = characterShotMods('backspin-bo');
    for (let seed = 0; seed < 120 && !boCheck; seed++) {
      const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      for (const s of playHole(hole, new Rng(`${seed}:play`)).shots) {
        if (!s.penalty && s.roll < -0.5) plainCheck = true; // baseline: should never happen
      }
      for (const s of playHole(hole, new Rng(`${seed}:play`), { shotMods: bo }).shots) {
        if (!s.penalty && s.roll < -0.5) boCheck = true; // Bo zips it back
      }
    }
    expect(plainCheck).toBe(false); // no universal wedge backspin any more
    expect(boCheck).toBe(true); // backspin lives on for Bo
  });

  it('is deterministic (same seed → same roll & rest)', () => {
    const hole = generateCourse(7, { holes: 1 }).holes[0]!;
    const a = playHole(hole, new Rng('7:play')).shots.map((s) => [s.roll, s.rest]);
    const b = playHole(hole, new Rng('7:play')).shots.map((s) => [s.roll, s.rest]);
    expect(a).toEqual(b);
  });
});

describe('hole-outs (GS feedback #3)', () => {
  it('chip-ins/aces are possible: some shot holes out across seeds, at the cup', () => {
    let holeouts = 0;
    for (let seed = 0; seed < 300; seed++) {
      const course = generateCourse(seed, { holes: 6 });
      for (const p of playCourse(course.holes, new Rng(`${seed}:play`))) {
        p.shots.forEach((s, i) => {
          if (s.holed) {
            holeouts++;
            // A holed shot is the last shot of the hole and needs no putts.
            expect(i).toBe(p.shots.length - 1);
            expect(p.stat.putts).toBe(0);
          }
        });
      }
    }
    expect(holeouts).toBeGreaterThan(0);
  });

  it('a holed shot leaves the ball within the hole-out radius of the pin', () => {
    for (let seed = 0; seed < 300; seed++) {
      const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      const played = playHole(hole, new Rng(`${seed}:play`));
      const holer = played.shots.find((s) => s.holed);
      if (holer) {
        expect(dist(holer.rest, pinOf(hole))).toBeLessThanOrEqual(HOLE_OUT_RADIUS + 1e-6);
      }
    }
  });
});

/**
 * GS-chipin-roll / GS-spin-gate — the ball lands and then rolls PROPERLY.
 *
 * Two reports in one sentence: *"the backspin roll and contoured greens, especially with Chipinski
 * caddie makes the ball do some really weird rolling… instead of rolling around like some crazed
 * magnet."* Both halves turned out to be structural.
 */
describe('a Dr Chipinski chip-in actually rolls to the hole (GS-chipin-roll)', () => {
  it('rests IN the cup, not where it would have stopped', () => {
    // The bug: the caddy set the next ball position to the pin but left `rest` and `rollPath` at the
    // natural resting spot, so the drawn ball stopped an average of four yards short — measured 3.0 to
    // 5.8 yards from a cup of radius 1.2 — and the hole-out explosion fired there, on bare ground.
    let seen = 0;
    for (let seed = 0; seed < 400 && seen < 8; seed++) {
      const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      for (const s of playHole(hole, new Rng(`${seed}:p`), { chipIn: 1 }).shots) {
        if (!s.chipIn) continue;
        seen++;
        expect(dist(s.rest, pinOf(hole)), `seed ${seed}`).toBeCloseTo(0, 6);
        expect(s.rollPath, `seed ${seed}`).toBeDefined();
        const path = s.rollPath!;
        expect(dist(path[path.length - 1]!, pinOf(hole)), `seed ${seed} path end`).toBeCloseTo(0, 6);
      }
    }
    expect(seen, 'no chip-ins found to check').toBeGreaterThan(3);
  });

  it('the recorded run is the WHOLE arc it travelled, so the drawn walk reaches the cup', () => {
    // The play view walks `rollPath` by arc length scaled to |roll|. If |roll| were left at the natural
    // run, the walk would stop short of the appended trickle and the ball would freeze beside the hole.
    let seen = 0;
    for (let seed = 0; seed < 400 && seen < 8; seed++) {
      const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      for (const s of playHole(hole, new Rng(`${seed}:p`), { chipIn: 1 }).shots) {
        if (!s.chipIn) continue;
        seen++;
        let arc = 0;
        const path = s.rollPath!;
        for (let i = 1; i < path.length; i++) arc += dist(path[i]!, path[i - 1]!);
        expect(Math.abs(s.roll), `seed ${seed}`).toBeCloseTo(arc, 4);
        // Forward-signed: the journey ends ahead of the pitch mark, in the hole. A "−4yd check" on a
        // ball that finished forward in the cup is not a description of anything.
        expect(s.roll, `seed ${seed}`).toBeGreaterThan(0);
      }
    }
    expect(seen).toBeGreaterThan(3);
  });

  it('BREAKS on the way in rather than tracking to the cup like a magnet', () => {
    // The last few yards have to read as golf on a contoured green, so the trickle is bowed by the
    // green's own perpendicular slope — the same field that breaks a putt.
    const hole = generateCourse(19, { holes: 1 }).holes[0]!;
    expect(hole.greenContour?.length ?? 0, 'seed 19 should be a contoured green').toBeGreaterThan(0);
    let bowed = false;
    for (const s of playHole(hole, new Rng('19:p'), { chipIn: 1 }).shots) {
      if (!s.chipIn) continue;
      const path = s.rollPath!;
      const a = path[0]!;
      const b = path[path.length - 1]!;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      let bow = 0;
      for (const p of path) bow = Math.max(bow, Math.abs(((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / L));
      if (bow > 0.05) bowed = true;
    }
    expect(bowed, 'the trickle into the cup never curled').toBe(true);
  });

  it('chipInPath is pure geometry: same inputs, same curve, and it ends exactly on the cup', () => {
    const hole = generateCourse(19, { holes: 1 }).holes[0]!;
    const from: Vec = [pinOf(hole)[0] + 4, pinOf(hole)[1] + 3];
    const a = chipInPath(hole, from, pinOf(hole));
    const b = chipInPath(hole, from, pinOf(hole));
    expect(a.path).toEqual(b.path);
    expect(dist(a.path[a.path.length - 1]!, pinOf(hole))).toBeCloseTo(0, 9);
    expect(a.path[0]).toEqual(from);
    expect(a.length).toBeGreaterThan(0);
  });
});

/**
 * GS-decision-frame-carry — `sprayTotalHigh` is the ONE fold from a cone's far CARRY to where the ball
 * actually FINISHES. Two callers now ask it (the club suggestion, which needs to know the ball stops by
 * the back of the green, and the shot camera, which has to frame where the ball comes to rest), and
 * they had drifted apart: the camera was framing on the bare `carryHigh`.
 */
describe('where a sprayed shot finishes (GS-decision-frame-carry)', () => {
  const hole = generateCourse(4242, { holes: 1 }).holes[0]!;
  const sprayFor = (id: string) =>
    shotSpread(hole, hole.tee, 'tee', hole.green, CLUBS.find((c) => c.id === id)!);

  it('is the far carry PLUS the run the club’s family releases — never the carry alone', () => {
    for (const id of ['D', '3W', '5i', '9i']) {
      const sp = sprayFor(id);
      expect(sprayTotalHigh(sp), `${id} must finish past its landing`).toBeGreaterThan(sp.carryHigh);
    }
  });

  it('ladders with the run, so the driver gains most and the wedge barely moves', () => {
    const gain = (id: string) => {
      const sp = sprayFor(id);
      return sprayTotalHigh(sp) / sp.carryHigh - 1;
    };
    // GS-runout-ladder: driver 14% ▸ wood 10.5% ▸ hybrid 7.5% ▸ long iron 6.5% ▸ short iron 5.5% ▸
    // wedge = the legacy taper. The camera's zoom-out is exactly this, club by club.
    expect(gain('D')).toBeCloseTo(0.14, 6);
    expect(gain('D')).toBeGreaterThan(gain('3W'));
    expect(gain('3W')).toBeGreaterThan(gain('5i'));
    expect(gain('5i')).toBeGreaterThan(gain('9i'));
    expect(gain('SW')).toBeLessThan(0.05); // a wedge lands and holds — nothing to reframe for
  });

  it('is a pure read of the spray — no rng, same answer every call', () => {
    const sp = sprayFor('D');
    expect(sprayTotalHigh(sp)).toBe(sprayTotalHigh(sp));
  });
});

describe('a spin build can only spin the clubs that spin (GS-spin-gate)', () => {
  it('no club above the wedge threshold EVER checks backwards, however heavy the build', () => {
    // The bug: `rollPotential` subtracted `backspinBoost` from every club's roll fraction without ever
    // consulting `hasBackspin`, the predicate that exists for exactly this. Two stacked spin items
    // (0.26 + 0.2) against a driver's 0.25 run fraction sent it negative, and a 250-yard drive sucked
    // back to the −18yd MAX_CHECK across a contoured green.
    for (const boost of [0.26, 0.46, 1.2]) {
      for (let seed = 0; seed < 40; seed++) {
        const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
        for (const s of playHole(hole, new Rng(`${seed}:s`), { backspinBoost: boost }).shots) {
          if (hasBackspin(s.club.carry)) continue;
          expect(s.roll, `${s.club.id} (carry ${s.club.carry}) @boost ${boost}, seed ${seed}`).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('…and the wedges still check, so the build is worth buying', () => {
    let checked = false;
    for (let seed = 0; seed < 60 && !checked; seed++) {
      const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      for (const s of playHole(hole, new Rng(`${seed}:s`), { backspinBoost: 0.26 }).shots) {
        if (hasBackspin(s.club.carry) && s.roll < -0.5) checked = true;
      }
    }
    expect(checked, 'a spin build no longer checks anything').toBe(true);
  });

  it('the threshold IS the pitching wedge — "where backspin starts"', () => {
    expect(hasBackspin(CLUBS.find((c) => c.id === 'PW')!.carry)).toBe(true);
    expect(hasBackspin(CLUBS.find((c) => c.id === '9i')!.carry)).toBe(false);
  });

  it('a base loadout is untouched — the clamp only bites on a spin build', () => {
    // Contract 1: no extra rng draw, no reordering. The clamp cannot fire when the roll fraction is
    // already positive, which it is for every club without a build.
    for (let seed = 0; seed < 30; seed++) {
      const hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      const plain = playHole(hole, new Rng(`${seed}:x`)).shots.map((s) => [s.roll, s.rest[0], s.rest[1]]);
      const again = playHole(hole, new Rng(`${seed}:x`)).shots.map((s) => [s.roll, s.rest[0], s.rest[1]]);
      expect(plain).toEqual(again);
      for (const s of playHole(hole, new Rng(`${seed}:x`)).shots) {
        if (!hasBackspin(s.club.carry)) expect(s.roll).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

/**
 * GS-roll-hairpin — *"for backspin and green contours the ball is doing the weird path roll instead of a
 * curve from last bounce to final lie and it just looks buggy as heck."*
 *
 * The cause was not the curl (that was investigated and exonerated — its per-step bend never overshoots
 * at the shipped constants). It was the gravity CREEP: once the roll's energy is spent, a ball resting on
 * a steep piece of sculpt trickles on down the fall line, in a direction that owes NOTHING to the way it
 * was travelling — so it can double back by up to 180°. Measured over 368 real curved rolls, a creep
 * fired on 23% of them and 63 of those reversed by more than 40° at the join. Blended into the roll's
 * deceleration the ball glided straight through the reversal, which is what read as a magnet.
 *
 * The creep is a separate physical event and the sim is the only thing that knows where it starts, so it
 * says so. One description, read by the renderer — never a second one guessed downstream.
 */
describe('the sim says where the ball came to REST before gravity took it (GS-roll-hairpin)', () => {
  it('reports creepFrom whenever a creep happened, inside the roll and on the path', () => {
    let seen = 0;
    for (let seed = 0; seed < 300 && seen < 12; seed++) {
      let hole;
      try {
        hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      } catch {
        continue;
      }
      for (const s of playHole(hole, new Rng(`${seed}:p`)).shots) {
        if (s.creepFrom === undefined) continue;
        seen++;
        const total = Math.abs(s.roll);
        // The join is a real distance INSIDE the travel: the ball rolled, stopped, then crept on.
        expect(s.creepFrom, `seed ${seed}`).toBeGreaterThanOrEqual(0);
        expect(s.creepFrom, `seed ${seed}`).toBeLessThan(total + 1e-6);
        expect(total - s.creepFrom, `seed ${seed} crept nothing`).toBeGreaterThan(0);
        // A creep only ever happens on a path the renderer can walk, and that path still ends at rest.
        expect(s.rollPath, `seed ${seed}`).toBeDefined();
        const path = s.rollPath!;
        expect(dist(path[path.length - 1]!, s.rest), `seed ${seed} path end`).toBeCloseTo(0, 6);
      }
    }
    expect(seen, 'no creeps found to check').toBeGreaterThan(4);
  });

  it('a roll with no creep is left exactly as it was — one undivided walk', () => {
    // The renderer keys the whole split on `creepFrom` being present, so the ordinary roll must not
    // acquire one. (Most rolls never creep: it needs a rest ON a steep piece of sculpt.)
    let plain = 0;
    for (let seed = 0; seed < 120; seed++) {
      let hole;
      try {
        hole = generateCourse(seed, { holes: 1 }).holes[0]!;
      } catch {
        continue;
      }
      for (const s of playHole(hole, new Rng(`${seed}:p`)).shots) {
        if (s.creepFrom !== undefined) continue;
        plain++;
        // No creep ⇒ nothing extra was appended, so |roll| is the whole of whatever path there is.
        if (!s.rollPath) continue;
        let arc = 0;
        for (let i = 1; i < s.rollPath.length; i++) arc += dist(s.rollPath[i]!, s.rollPath[i - 1]!);
        expect(arc, `seed ${seed}`).toBeCloseTo(Math.abs(s.roll), 4);
      }
    }
    expect(plain).toBeGreaterThan(50);
  });
});
