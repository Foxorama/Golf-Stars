import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, playHole, pinOf, HOLE_OUT_RADIUS } from '../src/sim/round';
import { characterShotMods } from '../src/sim/rpg/characters';
import { dist } from '../src/sim/course/contract';

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
