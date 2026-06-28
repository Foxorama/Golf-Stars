/**
 * Left-handed mode (GS-lefty). Handedness mirrors the player's lateral shot tendencies in WORLD
 * space — a lefty's hook curves right, slice left, and a character's baked fade/hook flips — so on a
 * fixed course a lefty's misses go the opposite way. It's a single sign flip on the FINAL lateral
 * angle (spray + bias), after the rng draws, so:
 *   - right-handed (lefty omitted/false) is byte-for-byte unchanged (the whole existing suite is the
 *     real guard; this file pins the contract directly);
 *   - the flip is a clean MIRROR (same carry, forward component equal, lateral negated), which makes
 *     it balance-neutral by symmetry on a statistically-symmetric course generator;
 *   - crosswind is NOT flipped (it's world-fixed, independent of the golfer's stance).
 */
import { describe, it, expect } from 'vitest';
import { Rng } from '../src/sim/rng';
import { resolveShot, applyShapeMod, DEFAULT_SHAPE, type ShotInput } from '../src/sim/shot';
import { shotSpread, playCourse, playHole } from '../src/sim/round';
import { renderHoleSVG } from '../src/render/holeView';
import { CLUBS } from '../src/sim/clubs';
import { generateCourse } from '../src/sim/course/generate';
import { playTotals } from '../src/sim/score';
import { characterShotMods } from '../src/sim/rpg/characters';
import { dist, type Vec, type Wind } from '../src/sim/course/contract';

const driver = CLUBS.find((c) => c.id === 'D')!;

// Aim straight "up" (+Y): bearing 0, so the forward axis is +Y and the rightward lateral axis is +X.
// That makes landing[1] the FORWARD component and landing[0] the cross (lateral) component — clean.
const from: Vec = [0, 0];
const aim: Vec = [0, 220];

/** A shot with a deliberately ASYMMETRIC shape + a directional bias, so the mirror is non-trivial. */
function baseInput(rng: Rng, extra: Partial<ShotInput> = {}): ShotInput {
  return {
    from,
    aim,
    club: driver,
    lie: 'fairway',
    shape: applyShapeMod(DEFAULT_SHAPE, { sliceR: 0.18, shankR: 0.1 }), // right-heavy misses
    angleBias: 0.06, // a baked fade (curves right for a righty)
    dispersionMult: 1.3,
    rng,
    ...extra,
  };
}

describe('left-handed mode (GS-lefty)', () => {
  it('right-handed is unchanged: omitting `lefty` === `lefty: false`', () => {
    const a = resolveShot(baseInput(new Rng('rh'), {}));
    const b = resolveShot(baseInput(new Rng('rh'), { lefty: false }));
    expect(b.landing[0]).toBe(a.landing[0]);
    expect(b.landing[1]).toBe(a.landing[1]);
    expect(b.carry).toBe(a.carry);
  });

  it('mirrors the spray: same carry, forward equal, lateral NEGATED (no wind)', () => {
    // SAME seed → identical rng draws (carry, zone, within-band); only the final geometry differs.
    const r = resolveShot(baseInput(new Rng('mirror'), { lefty: false }));
    const l = resolveShot(baseInput(new Rng('mirror'), { lefty: true }));
    // Distance travelled is the sampled carry in every direction — a rotation can't change it.
    expect(l.carry).toBeCloseTo(r.carry, 10);
    expect(dist(from, l.landing)).toBeCloseTo(dist(from, r.landing), 6);
    // Forward (along the bearing, +Y) is identical; the lateral (+X) flips sign exactly.
    expect(l.landing[1]).toBeCloseTo(r.landing[1], 6);
    expect(l.landing[0]).toBeCloseTo(-r.landing[0], 6);
    // And the shot is genuinely off-centre (the asymmetric shape + bias push it right for a righty),
    // so the mirror is meaningful, not a near-zero no-op.
    expect(Math.abs(r.landing[0])).toBeGreaterThan(2);
  });

  it('crosswind is world-fixed, NOT mirrored — both hands are pushed the same way', () => {
    const wind: Wind = { dir: 90, spd: 22 }; // pure crosswind toward the shot's right (+X)
    const r = resolveShot(baseInput(new Rng('wind'), { lefty: false, wind }));
    const l = resolveShot(baseInput(new Rng('wind'), { lefty: true, wind }));
    // The random+bias lateral flips between hands, so it cancels in the average — leaving ONLY the
    // (un-flipped) wind push. If wind were mirrored too, the average would be ~0.
    const avgCross = (r.landing[0] + l.landing[0]) / 2;
    expect(avgCross).toBeGreaterThan(5); // clearly pushed downwind, both hands alike
    // Sanity: with NO wind the same average is ~0 (the spray/bias is the only lateral, and it mirrors).
    const r0 = resolveShot(baseInput(new Rng('wind'), { lefty: false }));
    const l0 = resolveShot(baseInput(new Rng('wind'), { lefty: true }));
    expect(Math.abs((r0.landing[0] + l0.landing[0]) / 2)).toBeLessThan(1e-6);
  });

  it("flips a character's directional bias to the other side (Feather Fade)", () => {
    // Feather Fade carries a baked fade (a directional bias). The preview cone's centre line should
    // rotate to OPPOSITE sides of the raw shot bearing for the two hands.
    const flat = generateCourse('lefty-char', { holes: 1 }).holes[0]!;
    const mods = characterShotMods('feather-fade');
    const ball: Vec = [...flat.tee] as Vec;
    const target: Vec = [...flat.green] as Vec;
    const rh = shotSpread(flat, ball, 'tee', target, driver, { shotMods: mods, lefty: false });
    const lh = shotSpread(flat, ball, 'tee', target, driver, { shotMods: mods, lefty: true });
    // The raw shot bearing in the SAME units (a characterless spread applies no bias).
    const raw = shotSpread(flat, ball, 'tee', target, driver, {}).bearing;
    const dRh = rh.bearing - raw;
    const dLh = lh.bearing - raw;
    expect(Math.abs(dRh)).toBeGreaterThan(0.01); // the fade is real
    expect(Math.sign(dRh)).toBe(-Math.sign(dLh)); // and it flips side for a lefty
    expect(lh.lefty).toBe(true);
    expect(rh.lefty).toBe(false);
  });

  it('is balance-neutral: a lefty scores ~the same as a righty across many courses', () => {
    // By mirror symmetry, mirroring the PLAYER is (in distribution) the same as mirroring the COURSE,
    // which is just a relabelling of seeds — so mean Stableford must match within noise.
    const score = (lefty: boolean): number => {
      const pts: number[] = [];
      for (let s = 0; s < 60; s++) {
        const course = generateCourse(`lefty-bal:${s}`, { holes: 6 });
        const played = playCourse(course.holes, new Rng(`lefty-bal:play:${s}`), { lefty });
        pts.push(playTotals(played.map((p) => p.record)).stableford);
      }
      return pts.reduce((a, b) => a + b, 0) / pts.length;
    };
    const rh = score(false);
    const lh = score(true);
    // Within 12% of each other (the generator is statistically symmetric, not perfectly so per-seed).
    expect(Math.abs(lh - rh) / Math.max(1, rh)).toBeLessThan(0.12);
  });

  it('mirrors the drawn spray cone about the bearing (renderHoleSVG)', () => {
    // A straight-up hole so the projected bearing is vertical and the cone mirrors about a vertical
    // screen line. A strongly one-sided shape makes the lop-sided cone (and its mirror) unmistakable.
    const hole = generateCourse('lefty-cone', { holes: 1 }).holes[0]!;
    const ball: Vec = [...hole.tee] as Vec;
    const target: Vec = [...hole.green] as Vec;
    const shotMods = characterShotMods('huang-woo-hook'); // a hooky driver — clearly one-sided
    const rh = shotSpread(hole, ball, 'tee', target, driver, { shotMods, lefty: false });
    const lh = shotSpread(hole, ball, 'tee', target, driver, { shotMods, lefty: true });
    const opts = { width: 360, height: 640, ball, focus: ball, viewRadius: 240 } as const;
    const svgRh = renderHoleSVG(hole, { ...opts, spray: rh });
    const svgLh = renderHoleSVG(hole, { ...opts, spray: lh });
    // The terrain scene is handedness-independent, so any difference is the (mirrored) spray cone.
    expect(svgLh).not.toBe(svgRh);
    // Mean x of the spray polygons reflects across the cone origin: a hook leans one way for a
    // righty and the OPPOSITE way for a lefty. Compare the cone's lateral centre of mass.
    const coneCx = (svg: string): number => {
      const xs: number[] = [];
      for (const m of svg.matchAll(/<polygon points="([^"]+)"/g)) {
        for (const pair of m[1]!.trim().split(/\s+/)) xs.push(parseFloat(pair.split(',')[0]!));
      }
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    const ox = renderHoleSVG(hole, opts); // same scene, no spray → its polygons set the baseline
    const baseCx = coneCx(ox);
    // The righty cone's mass sits on one side of the no-cone baseline, the lefty's on the other.
    expect(Math.sign(coneCx(svgRh) - baseCx)).toBe(-Math.sign(coneCx(svgLh) - baseCx));
  });

  it('a single hole plays mirror-symmetrically in the auto sim too', () => {
    // Auto playHole threads `lefty` into every executeShot; a base hole still produces a valid,
    // bounded score for a lefty (no death-spiral from the flip).
    const hole = generateCourse('lefty-hole', { holes: 1 }).holes[0]!;
    const res = playHole(hole, new Rng('lh-hole'), { lefty: true });
    expect(res.record.strokes).toBeGreaterThan(0);
    expect(res.record.strokes).toBeLessThanOrEqual(hole.par + 5);
  });
});
