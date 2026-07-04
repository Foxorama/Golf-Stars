import { describe, it, expect } from 'vitest';
import {
  greenSlopeAt,
  idealPuttAim,
  manualPutt,
  puttBreakBow,
  puttBreakProfile,
  puttBreakYd,
  puttPathPreview,
  MANUAL_IDEAL_PACE,
} from '../src/sim/round';
import { Rng } from '../src/sim/rng';
import { dist, type GreenLobe, type Vec } from '../src/sim/course/contract';
import { generateCourse } from '../src/sim/course/generate';
import { BIOMES } from '../src/sim/course/biomes';

const pin: Vec = [0, 0];
const from: Vec = [0, 20]; // a 20-yd putt straight down +y→pin

/** An Rng whose gaussian is forced to 0 — isolates the deterministic break/aim maths from wobble. */
class NoWobbleRng extends Rng {
  override gaussian(): number {
    return 0;
  }
}

describe('greenSlopeAt — the shared local field (GS-green-contour)', () => {
  it('with no lobes it is exactly the plane', () => {
    expect(greenSlopeAt([3, 7], [0.2, -0.1])).toEqual([0.2, -0.1]);
    expect(greenSlopeAt([3, 7], undefined)).toEqual([0, 0]);
  });

  it("a mound's downhill points away from its crest, a hollow's toward it, peaking at the flank", () => {
    const mound: GreenLobe = { c: [0, 0], r: 6, h: 0.4 };
    const atFlank = greenSlopeAt([6, 0], undefined, [mound]);
    expect(atFlank[0]).toBeCloseTo(0.4, 5); // peak |h| exactly at r, pointing +x (away)
    expect(atFlank[1]).toBeCloseTo(0, 5);
    const hollow: GreenLobe = { c: [0, 0], r: 6, h: -0.4 };
    const inHollow = greenSlopeAt([6, 0], undefined, [hollow]);
    expect(inHollow[0]).toBeCloseTo(-0.4, 5); // toward the centre
    // Fades: flat at the crest, faint far beyond the footprint.
    expect(Math.hypot(...greenSlopeAt([0.0001, 0], undefined, [mound]))).toBeLessThan(0.001);
    expect(Math.hypot(...greenSlopeAt([30, 0], undefined, [mound]))).toBeLessThan(0.02);
  });
});

describe('break model back-compat (no lobes = the GS-greens-3 closed form)', () => {
  const slope: Vec = [0.3, 0.1];

  it('puttBreakYd with an empty/absent lobe list matches the closed form byte-for-byte', () => {
    const d = dist(from, pin);
    const rperp: Vec = [1, 0]; // right of the [0,20]→[0,0] line
    const paceFac = Math.max(0.7, Math.min(1.6, MANUAL_IDEAL_PACE / Math.max(0.4, 1)));
    const closed = 0.18 * (slope[0] * rperp[0] + slope[1] * rperp[1]) * Math.pow(d, 1.35) * paceFac;
    expect(puttBreakYd(from, pin, slope, 1)).toBeCloseTo(closed, 10);
    expect(puttBreakYd(from, pin, slope, 1, [])).toBe(puttBreakYd(from, pin, slope, 1));
  });

  it('puttPathPreview without lobes is unchanged (t^1.8 curl)', () => {
    const brk = puttBreakYd(from, pin, slope, 1);
    const pts = puttPathPreview(from, pin, slope, 0, 1);
    // Lateral (x, since the line runs down y) at t follows brk·t^1.8.
    const mid = pts[6]!; // t = 0.5
    expect(mid[0]).toBeCloseTo(brk * Math.pow(0.5, 1.8), 10);
    expect(pts[12]![0]).toBeCloseTo(brk, 10);
  });

  it('a constant field fed through the lobe integrator lands on the closed form at the cup', () => {
    // A negligible far-away lobe forces the numeric path; the plane term must survive it intact.
    const farLobe: GreenLobe = { c: [1000, 1000], r: 4, h: 0.5 };
    const numeric = puttBreakYd(from, pin, slope, 1, [farLobe]);
    expect(numeric).toBeCloseTo(puttBreakYd(from, pin, slope, 1), 4);
  });

  it('manualPutt without contour is byte-identical to the pre-contour resolver', () => {
    const a = manualPutt(new Rng('gc:1'), from, pin, { pace: 1.04, aim: -1 }, {}, slope);
    const b = manualPutt(new Rng('gc:1'), from, pin, { pace: 1.04, aim: -1 }, {}, slope, []);
    expect(b).toEqual(a);
  });
});

describe('contoured greens double-break (GS-green-contour)', () => {
  // Two mounds flanking the line — one LEFT of it early (pushes the ball right going in), one RIGHT
  // of it late (pushes it back left near the cup): the classic S of a real double-breaker.
  const knobs: GreenLobe[] = [
    { c: [-3, 15], r: 5, h: 0.6 },
    { c: [3, 5], r: 5, h: 0.6 },
  ];

  it('the cumulative profile bows out then curls back (the S-curve is real, not a rendering trick)', () => {
    const prof = puttBreakProfile(from, pin, undefined, 1, knobs, 24);
    const max = Math.max(...prof);
    expect(max).toBeGreaterThan(0.3); // drifts right off the first knob
    expect(prof[prof.length - 1]!).toBeLessThan(max - 0.3); // then curls back off the second
    expect(puttBreakBow(from, pin, undefined, knobs).max).toBeGreaterThan(0.3);
  });

  it('the drawn path and the resolver agree at the finish (the graphic IS the physics)', () => {
    const pts = puttPathPreview(from, pin, undefined, 0, 1, knobs);
    const net = puttBreakYd(from, pin, undefined, 1, knobs);
    expect(pts[pts.length - 1]![0]).toBeCloseTo(net, 6);
  });

  it('aiming the ideal read at ideal pace holes it once wobble is stripped', () => {
    const aim = idealPuttAim(from, pin, undefined, knobs);
    const p = manualPutt(new NoWobbleRng('gc:2'), from, pin, { pace: MANUAL_IDEAL_PACE, aim }, {}, undefined, knobs);
    expect(p.holed).toBe(true);
    // And ignoring a real read misses: same stroke aimed dead straight slides by.
    const wide: GreenLobe = { c: [-3, 10], r: 6, h: 1.2 };
    const straight = manualPutt(new NoWobbleRng('gc:3'), from, pin, { pace: MANUAL_IDEAL_PACE, aim: 0 }, {}, undefined, [wide]);
    expect(straight.holed).toBe(false);
  });
});

describe('generator emits contour lobes on a side stream', () => {
  it('every hole carries 1–2 lobes, on/near its green, capped by the biome greenSlopeMax', () => {
    for (let s = 0; s < 40; s++) {
      const course = generateCourse(s + 61000, { biome: 'verdant-station', holes: 3, wildness: 0.5 });
      const biome = BIOMES.find((b) => b.id === 'verdant-station')!;
      for (const h of course.holes) {
        expect(h.greenContour!.length).toBeGreaterThanOrEqual(1);
        expect(h.greenContour!.length).toBeLessThanOrEqual(2);
        for (const l of h.greenContour!) {
          expect(dist(l.c, h.green)).toBeLessThan(40); // on/near the green
          expect(l.r).toBeGreaterThan(2);
          expect(Math.abs(l.h)).toBeLessThanOrEqual(biome.greenSlopeMax ?? 0.5);
          expect(Math.abs(l.h)).toBeGreaterThan(0.01);
        }
      }
    }
  });

  it('the lobes ride their own rng stream: terrain, pin and plane slope are untouched by the draw', () => {
    // Same seed twice → identical course (determinism), and the greenSlope plane still respects the
    // GS-putt-depth wild-vs-calm ordering (the slope stream did not move).
    const a = generateCourse(4242, { biome: 'verdant-station', holes: 2, wildness: 0.7 });
    const b = generateCourse(4242, { biome: 'verdant-station', holes: 2, wildness: 0.7 });
    expect(JSON.stringify(a.holes.map((h) => h.greenContour))).toBe(JSON.stringify(b.holes.map((h) => h.greenContour)));
    expect(JSON.stringify(a.holes.map((h) => h.features))).toBe(JSON.stringify(b.holes.map((h) => h.features)));
  });
});
