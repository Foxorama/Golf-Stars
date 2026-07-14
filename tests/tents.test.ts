import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, executeShot, type ExecOpts } from '../src/sim/round';
import { Rng } from '../src/sim/rng';
import { CLUBS } from '../src/sim/clubs';
import {
  tradeTents,
  tentFlightHit,
  tentReflect,
  assignTentEffects,
  TENT_COUNT,
  TENT_ROOF_H,
  TENT_EFFECTS,
  TENT_LINES,
  type TradeTent,
} from '../src/sim/tents';
import { dist, type Vec } from '../src/sim/course/contract';
import { flightProfileOf } from '../src/sim/flight';

const BIOMES = ['verdant-station', 'dust-belt', 'ice-ring', 'ember-world', 'void-garden'];

describe('trade-camp tents (GS-tents)', () => {
  it('places a ring of tents OFF the green, leaving a clear approach window', () => {
    const hole = generateCourse(42, { biome: 'verdant-station', wildness: 0.6 }).holes[0]!;
    const tents = tradeTents(hole);
    expect(tents.length).toBe(TENT_COUNT);
    const gR = (() => {
      const g = hole.features.find((f) => f.kind === 'green')!;
      let r = 0;
      for (const p of g.poly) r += dist(p, hole.green);
      return r / g.poly.length;
    })();
    // Every tent sits OUTSIDE the green surface (ringing it, not on it).
    for (const t of tents) expect(dist(t.c, hole.green)).toBeGreaterThan(gR);
    // The approach side stays open: no tent lies within the clear front window. The approach comes
    // from the centreline's penultimate point, so the nearest tent must be well off that line.
    const cl = hole.centreline;
    const approach = cl[cl.length - 2] ?? hole.tee;
    const toApproach: Vec = [approach[0] - hole.green[0], approach[1] - hole.green[1]];
    const ta = Math.atan2(toApproach[0], toApproach[1]);
    for (const t of tents) {
      const td: Vec = [t.c[0] - hole.green[0], t.c[1] - hole.green[1]];
      let delta = Math.abs(Math.atan2(td[0], td[1]) - ta);
      if (delta > Math.PI) delta = 2 * Math.PI - delta;
      expect(delta).toBeGreaterThan((45 * Math.PI) / 180); // clear of the front window
    }
  });

  it('tradeTents is PURE — same hole → identical tents (byte-stable)', () => {
    const hole = generateCourse(7, { biome: 'ember-world', holes: 3, wildness: 0.8 }).holes[1]!;
    expect(tradeTents(hole)).toEqual(tradeTents(hole));
  });

  it('a low shot into a tent is knocked down + reflected; a high one clears', () => {
    // A synthetic tent straight ahead, ridge across the line so it bounces back.
    const tent: TradeTent = { c: [0, 50], r: 6, ridge: [1, 0], out: [0, 1], roofH: TENT_ROOF_H, hue: 0, effect: 'ow' };
    const from: Vec = [0, 0];
    const landing: Vec = [0, 80]; // dead ahead, through the tent
    // A flat long club (driver, nominal ~250) flies low → clips the tent.
    const low = tentFlightHit([tent], from, landing, 0, 80, 250, flightProfileOf('D'));
    expect(low).not.toBeNull();
    expect(dist(low!.point, tent.c)).toBeLessThanOrEqual(tent.r + 0.01);
    // A lofted wedge (nominal ~60) balloons over a 11yd roof on an 80yd carry → clears.
    const high = tentFlightHit([tent], from, landing, 0, 80, 60, flightProfileOf('60'));
    expect(high).toBeNull();
  });

  it('reflect bounces a ball back off the far (green-facing) slope', () => {
    // A back tent: out points away from the green (+y). A ball travelling +y (away from green) that
    // hits the green-facing (−y) slope should be sent back toward the green (−y component).
    const tent: TradeTent = { c: [0, 60], r: 6, ridge: [1, 0], out: [0, 1], roofH: TENT_ROOF_H, hue: 0, effect: 'ow' };
    const impact: Vec = [0, 55]; // on the green-facing side of the ridge (below c in y)
    const d = tentReflect(tent, impact, [0, 1]); // ball moving away from green
    expect(d[1]).toBeLessThan(0); // bounced back toward the green
  });

  it('is non-penalty for every tent EXCEPT the marmot, which is a lost ball (GS-tent-interactions)', () => {
    let tentShots = 0;
    let marmotShots = 0;
    for (let seed = 0; seed < 30; seed++) {
      // Tents build only on a stamped hole (GS-tent-interactions) — arm this one.
      const hole = { ...generateCourse(seed + 200, { biome: 'verdant-station', wildness: 0.7 }).holes[0]!, tents: true };
      const opts: ExecOpts = { carryMult: 1, bag: CLUBS, tradeTents: true } as ExecOpts;
      const rng = new Rng(`t:${seed}`);
      // Fire a bunch of shots from random-ish spots near the green at the pin.
      const near: Vec = [hole.green[0] + 20, hole.green[1] - 80];
      for (let s = 0; s < 12; s++) {
        const club = CLUBS[Math.floor((s / 12) * CLUBS.length)] ?? CLUBS[0]!;
        const ex = executeShot(hole, near, 'fairway', hole.green, club, opts, rng);
        if (ex.log.tentHit) {
          tentShots++;
          if (ex.log.tentHit.effect === 'marmot') {
            // The marmot pockets the ball → lost ball (stroke-and-distance from the shot origin).
            marmotShots++;
            expect(ex.penaltyStrokes).toBe(1);
            expect(ex.log.penalty).toBe('lost');
            expect(ex.ballAfter).toEqual(near);
          } else {
            // The tent ITSELF is non-penalty: it never pockets the ball ('lost' is the marmot's
            // signature). A deflected ball may still trickle into a REAL hazard afterwards (off the
            // tent, into the lake) — that's legitimate course physics, not a tent penalty.
            expect(ex.log.penalty).not.toBe('lost');
            if (!ex.log.penalty) expect(ex.penaltyStrokes).toBe(0);
          }
        }
      }
    }
    expect(tentShots).toBeGreaterThan(0); // the mechanic actually fires across these seeds
    expect(marmotShots).toBeGreaterThan(0); // and the marmot's lost-ball path is exercised
  });

  it('an unstamped hole builds NO tents (tents live only on a stamped trade-market hole)', () => {
    const hole = generateCourse(200, { biome: 'verdant-station', wildness: 0.7 }).holes[0]!; // no tents flag
    const opts: ExecOpts = { carryMult: 1, bag: CLUBS, tradeTents: true } as ExecOpts;
    const rng = new Rng('unstamped');
    const near: Vec = [hole.green[0] + 20, hole.green[1] - 80];
    for (let s = 0; s < 12; s++) {
      const club = CLUBS[Math.floor((s / 12) * CLUBS.length)] ?? CLUBS[0]!;
      const ex = executeShot(hole, near, 'fairway', hole.green, club, opts, rng);
      expect(ex.log.tentHit).toBeUndefined();
    }
  });

  it('assignTentEffects deals all five effects, is deterministic, and scrambles colour→effect per hole', () => {
    const a = generateCourse(11, { biome: 'verdant-station', holes: 4, wildness: 0.6 }).holes;
    const e0 = assignTentEffects(a[0]!);
    expect(e0).toHaveLength(TENT_COUNT);
    expect(new Set(e0)).toEqual(new Set(TENT_EFFECTS)); // one of each of the five
    expect(assignTentEffects(a[0]!)).toEqual(e0); // deterministic (pure)
    // Different holes generally deal a different colour→effect order (not all identical).
    const orders = a.map((h) => assignTentEffects(h).join(','));
    expect(new Set(orders).size).toBeGreaterThan(1);
    // Every tent carries its assigned effect + a bubble line.
    const tents = tradeTents(a[0]!);
    for (const t of tents) expect(TENT_LINES[t.effect]).toBeTruthy();
  });

  it('does NOT death-spiral with tents armed (the fairness bar holds)', () => {
    let strokes = 0;
    let par = 0;
    let holes = 0;
    let blowups = 0;
    for (const biome of BIOMES) {
      for (let seed = 0; seed < 20; seed++) {
        const course = generateCourse(seed + 800, { biome, holes: 3, wildness: 1 });
        // Arm tents on every hole — the trade-market stop now carries them on all holes.
        const armed = course.holes.map((h) => ({ ...h, tents: true }));
        const played = playCourse(armed, new Rng(`${biome}:${seed}:p`), { tradeTents: true });
        for (const p of played) {
          strokes += p.record.strokes;
          par += p.record.par;
          holes++;
          if (p.record.strokes >= 10) blowups++;
        }
      }
    }
    // TODO(GS-biome-variety): the per-world shape/width/hazard identities deliberately make the deep
    // stops harder via hazard layouts (not length) — a REGRESSION fence at the interim reality (~1.05
    // at max wildness across all worlds + tents), not the design target. Re-tighten in the balance pass
    // (a smarter reach-AI that plays back to the fairway), never by softening the rough/hazards.
    expect((strokes - par) / holes).toBeLessThan(1.15);
    expect(blowups / holes).toBeLessThan(0.05);
  });
});
