import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness } from '../src/sim/course/generate';
import { validateCourse, dist, type Hole } from '../src/sim/course/contract';
import { biomeById } from '../src/sim/course/biomes';

/** Mean plane-slope magnitude of a hole's green. */
function slopeMag(h: Hole): number {
  return h.greenSlope ? Math.hypot(h.greenSlope[0], h.greenSlope[1]) : 0;
}
/** Mean number of contour lobes over a course. */
function lobeCount(h: Hole): number {
  return h.greenContour?.length ?? 0;
}
/** Pin distance from the green centroid as a fraction of the green's mean radius (how tucked it is). */
function pinTuckFrac(h: Hole): number {
  const g = h.features.find((f) => f.kind === 'green');
  if (!g || !h.pin) return 0;
  const meanR = g.poly.reduce((s, p) => s + dist(p, h.green), 0) / g.poly.length || 1;
  return dist(h.pin, h.green) / meanR;
}

function greenStats(biome: string, wildness: number) {
  let slope = 0;
  let lobes = 0;
  let tuck = 0;
  let n = 0;
  for (let s = 0; s < 200; s++) {
    const c = generateCourse(s + 60000, { biome, holes: 6, wildness, compose: true });
    expect(validateCourse(c)).toEqual([]);
    expect(validateFairness(c)).toEqual([]);
    for (const h of c.holes) {
      slope += slopeMag(h);
      lobes += lobeCount(h);
      tuck += pinTuckFrac(h);
      n++;
    }
  }
  return { slope: slope / n, lobes: lobes / n, tuck: tuck / n };
}

describe('per-biome difficulty vector — the green axis (GS-biome-difficulty)', () => {
  it('a world WITHOUT a difficulty profile has byte-for-byte identical greens', () => {
    // dust-belt sets no `difficulty` — its greens must be unchanged run to run and by the new machinery.
    expect(biomeById('dust-belt')?.difficulty).toBeUndefined();
    const a = generateCourse(321, { biome: 'dust-belt', holes: 6, wildness: 0.9 });
    const b = generateCourse(321, { biome: 'dust-belt', holes: 6, wildness: 0.9 });
    for (let i = 0; i < a.holes.length; i++) {
      expect(a.holes[i]!.greenSlope).toEqual(b.holes[i]!.greenSlope);
      expect(a.holes[i]!.greenContour).toEqual(b.holes[i]!.greenContour);
      expect(a.holes[i]!.pin).toEqual(b.holes[i]!.pin);
    }
  });

  it('green difficulty RAMPS with depth on an opted-in world (ice) far more than a smooth one (desert)', () => {
    const iceCalm = greenStats('ice-ring', 0.15);
    const iceDeep = greenStats('ice-ring', 1);
    const desertCalm = greenStats('dust-belt', 0.15);
    const desertDeep = greenStats('dust-belt', 1);
    // Ice greens steepen, gain lobes and tuck their pins hard from calm → deep.
    expect(iceDeep.slope).toBeGreaterThan(iceCalm.slope);
    expect(iceDeep.lobes).toBeGreaterThan(iceCalm.lobes);
    expect(iceDeep.tuck).toBeGreaterThan(iceCalm.tuck);
    // The desert's green DIFFICULTY climbs far less with depth than the ice world's — the desert gets
    // hard via length/wind, not its greens (the whole point of decoupling difficulty from length).
    const iceLobeGain = iceDeep.lobes - iceCalm.lobes;
    const desertLobeGain = desertDeep.lobes - desertCalm.lobes;
    expect(iceLobeGain).toBeGreaterThan(desertLobeGain);
    // And deep-in, the ice greens are unambiguously harder than the desert's on every green lever.
    expect(iceDeep.slope).toBeGreaterThan(desertDeep.slope);
    expect(iceDeep.lobes).toBeGreaterThan(desertDeep.lobes);
    expect(iceDeep.tuck).toBeGreaterThan(desertDeep.tuck);
  });

  it('the pin stays inside the green even with heavy tuck (fairness invariant holds)', () => {
    // crystal-spires has the heaviest pinTuck (0.8); every generated pin must still be a legal flag.
    for (let s = 0; s < 120; s++) {
      const c = generateCourse(s + 70000, { biome: 'crystal-spires', holes: 6, wildness: 1, compose: true });
      expect(validateCourse(c)).toEqual([]); // validateCourse rejects an off-green pin
    }
  });
});
