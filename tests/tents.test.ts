import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, executeShot, type ExecOpts } from '../src/sim/round';
import { Rng } from '../src/sim/rng';
import { CLUBS } from '../src/sim/clubs';
import {
  tradeTents,
  tentFlightHit,
  tentReflect,
  TENT_COUNT,
  TENT_ROOF_H,
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
    const tent: TradeTent = { c: [0, 50], r: 6, ridge: [1, 0], out: [0, 1], roofH: TENT_ROOF_H, hue: 0 };
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
    const tent: TradeTent = { c: [0, 60], r: 6, ridge: [1, 0], out: [0, 1], roofH: TENT_ROOF_H, hue: 0 };
    const impact: Vec = [0, 55]; // on the green-facing side of the ridge (below c in y)
    const d = tentReflect(tent, impact, [0, 1]); // ball moving away from green
    expect(d[1]).toBeLessThan(0); // bounced back toward the green
  });

  it('NEVER adds a penalty stroke (tents are non-penalty)', () => {
    let tentShots = 0;
    for (let seed = 0; seed < 30; seed++) {
      const hole = generateCourse(seed + 200, { biome: 'verdant-station', wildness: 0.7 }).holes[0]!;
      const opts: ExecOpts = { carryMult: 1, bag: CLUBS, tradeTents: true } as ExecOpts;
      const rng = new Rng(`t:${seed}`);
      // Fire a bunch of shots from random-ish spots near the green at the pin.
      const near: Vec = [hole.green[0] + 20, hole.green[1] - 80];
      for (let s = 0; s < 12; s++) {
        const club = CLUBS[Math.floor((s / 12) * CLUBS.length)] ?? CLUBS[0]!;
        const ex = executeShot(hole, near, 'fairway', hole.green, club, opts, rng);
        if (ex.log.tentHit) {
          tentShots++;
          expect(ex.penaltyStrokes).toBe(0);
          expect(ex.log.penalty).toBeUndefined();
        }
      }
    }
    expect(tentShots).toBeGreaterThan(0); // the mechanic actually fires across these seeds
  });

  it('does NOT death-spiral with tents armed (the fairness bar holds)', () => {
    let strokes = 0;
    let par = 0;
    let holes = 0;
    let blowups = 0;
    for (const biome of BIOMES) {
      for (let seed = 0; seed < 20; seed++) {
        const course = generateCourse(seed + 800, { biome, holes: 3, wildness: 1 });
        const played = playCourse(course.holes, new Rng(`${biome}:${seed}:p`), { tradeTents: true });
        for (const p of played) {
          strokes += p.record.strokes;
          par += p.record.par;
          holes++;
          if (p.record.strokes >= 10) blowups++;
        }
      }
    }
    expect((strokes - par) / holes).toBeLessThan(1.0);
    expect(blowups / holes).toBeLessThan(0.05);
  });
});
