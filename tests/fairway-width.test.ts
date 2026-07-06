import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness, validateCrossings, chooseWidthProfile } from '../src/sim/course/generate';
import { validateCourse, pointInPoly, type Hole, type Vec } from '../src/sim/course/contract';
import { Rng } from '../src/sim/rng';

/** Point a fraction t (by arc length) along the centreline (mirrors the generator's centrePoint). */
function alongAt(line: Vec[], t: number): { p: Vec; perp: Vec } {
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
      const dx = (b[0] - a[0]) / (l || 1);
      const dy = (b[1] - a[1]) / (l || 1);
      return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], perp: [-dy, dx] };
    }
    want -= l;
  }
  const a = line[0]!;
  return { p: a, perp: [0, 1] };
}

/** Total fairway width (yards, both sides) at fraction `u` along the hole, measured against the
 *  hole's fairway features by stepping outward along the local perpendicular. 0 if `u` sits in a
 *  rough break (the corridor can be broken — GS-variety-2). */
function widthAtU(h: Hole, u: number): number {
  const { p, perp } = alongAt(h.centreline, u);
  const fw = h.features.filter((f) => f.kind === 'fairway');
  const inFw = (q: Vec) => fw.some((f) => pointInPoly(q, f.poly));
  if (!inFw(p)) return 0;
  const reach = (sign: number): number => {
    let d = 0;
    while (d < 120) {
      const q: Vec = [p[0] + perp[0] * sign * (d + 0.5), p[1] + perp[1] * sign * (d + 0.5)];
      if (!inFw(q)) break;
      d += 0.5;
    }
    return d;
  };
  return reach(1) + reach(-1);
}

/** Collect holes carrying a given width archetype across seeds. */
function holesOf(widthId: string, opts: { biome?: string; wildness: number; seeds: number; base: number }): Hole[] {
  const out: Hole[] = [];
  for (let s = 0; s < opts.seeds; s++) {
    const c = generateCourse(s + opts.base, { biome: opts.biome ?? 'verdant-station', holes: 4, wildness: opts.wildness });
    for (const h of c.holes) if (h.widthId === widthId) out.push(h);
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / (xs.length || 1);

describe('fairway width grammar (GS-fairway-width)', () => {
  it('every width archetype actually appears across seeds (par 4/5 pool + par-3 pool)', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 120; s++) {
      const c = generateCourse(s + 61000, { biome: 'verdant-station', holes: 4, wildness: 0.5 });
      for (const h of c.holes) if (h.widthId) seen.add(h.widthId);
    }
    for (const id of ['classic', 'chute', 'neck', 'hourglass', 'wander', 'thin', 'broad']) {
      expect(seen.has(id), `archetype ${id} never generated`).toBe(true);
    }
  });

  it('width variety is DECOUPLED from difficulty: the squeezed archetypes appear on calm stops too', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 120; s++) {
      const c = generateCourse(s + 62000, { biome: 'verdant-station', holes: 4, wildness: 0.1 });
      for (const h of c.holes) if (h.widthId) seen.add(h.widthId);
    }
    for (const id of ['chute', 'neck', 'hourglass', 'thin', 'broad']) {
      expect(seen.has(id), `archetype ${id} missing at calm wildness`).toBe(true);
    }
  });

  it('a CHUTE hole is genuinely narrower off the tee than through the body', () => {
    const holes = holesOf('chute', { wildness: 0.4, seeds: 80, base: 63000 }).filter((h) => h.par >= 4);
    expect(holes.length).toBeGreaterThan(10);
    const tee = holes.map((h) => widthAtU(h, 0.1)).filter((w) => w > 0);
    const body = holes.map((h) => widthAtU(h, 0.5)).filter((w) => w > 0);
    expect(mean(tee)).toBeLessThan(mean(body) * 0.8);
  });

  it('a NECK hole squeezes before the green relative to its driving body', () => {
    const holes = holesOf('neck', { wildness: 0.4, seeds: 80, base: 64000 }).filter((h) => h.par >= 4);
    expect(holes.length).toBeGreaterThan(10);
    const late = holes.map((h) => widthAtU(h, 0.82)).filter((w) => w > 0);
    const body = holes.map((h) => widthAtU(h, 0.42)).filter((w) => w > 0);
    expect(mean(late)).toBeLessThan(mean(body) * 0.8);
  });

  it('an HOURGLASS hole pinches in the driving zone, wide either side', () => {
    const holes = holesOf('hourglass', { wildness: 0.4, seeds: 80, base: 65000 }).filter((h) => h.par >= 4);
    expect(holes.length).toBeGreaterThan(10);
    const waists: number[] = [];
    const shoulders: number[] = [];
    for (const h of holes) {
      const band = [0.36, 0.42, 0.48, 0.54, 0.6, 0.66].map((u) => widthAtU(h, u)).filter((w) => w > 0);
      const ends = [widthAtU(h, 0.16), widthAtU(h, 0.88)].filter((w) => w > 0);
      if (band.length && ends.length) {
        waists.push(Math.min(...band));
        shoulders.push(mean(ends));
      }
    }
    expect(mean(waists)).toBeLessThan(mean(shoulders) * 0.75);
  });

  it('THIN ribbons run narrower than CLASSIC, and BROAD meadows wider — overall width really varies', () => {
    const w = (id: string, base: number) =>
      mean(
        holesOf(id, { wildness: 0.4, seeds: 80, base })
          .filter((h) => h.par >= 4)
          .map((h) => widthAtU(h, 0.5))
          .filter((x) => x > 0),
      );
    const thin = w('thin', 66000);
    const classic = w('classic', 66000);
    const broad = w('broad', 66000);
    expect(thin).toBeLessThan(classic * 0.85);
    expect(broad).toBeGreaterThan(classic * 1.15);
  });

  it('lost-rough island holes draw ONLY from the widen-only island pool, never a squeeze archetype', () => {
    const ISLAND_IDS = new Set(['island', 'island-bays', 'island-flare', 'island-broadtee', 'island-broad']);
    const seen = new Set<string>();
    for (const biome of ['void-garden', 'cetus-deep']) {
      for (let s = 0; s < 40; s++) {
        const c = generateCourse(s + 67000, { biome, holes: 3, wildness: 0.8 });
        for (const h of c.holes) {
          expect(ISLAND_IDS.has(h.widthId!), `${biome} seed ${s} drew ${h.widthId}`).toBe(true);
          if (h.par === 3) expect(h.widthId).toBe('island'); // the blob island keeps the plain label
          else seen.add(h.widthId!);
        }
      }
    }
    for (const id of ISLAND_IDS) if (id !== 'island') expect(seen.has(id), `island variant ${id} never generated`).toBe(true);
    expect(seen.has('island')).toBe(true);
  });

  it('ISLANDS ONLY GET WIDER: every island profile multiplier is ≥ 1 everywhere (machine-check)', () => {
    for (let s = 0; s < 300; s++) {
      const rng = new Rng(s + 90000);
      const par = s % 2 ? 4 : 5;
      const wp = chooseWidthProfile(rng, par, (s % 5) / 4, true);
      expect(wp.id.startsWith('island')).toBe(true);
      for (let i = 0; i <= 40; i++) {
        const u = i / 40;
        expect(wp.at(u), `${wp.id} seed ${s} at u=${u}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('island variants genuinely vary the plateau: a flare widens toward the green', () => {
    const holes: Hole[] = [];
    for (const biome of ['void-garden', 'cetus-deep']) {
      for (let s = 0; s < 80 && holes.length < 14; s++) {
        const c = generateCourse(s + 69000, { biome, holes: 3, wildness: 0.8 });
        for (const h of c.holes) if (h.widthId === 'island-flare' && h.par >= 4) holes.push(h);
      }
    }
    expect(holes.length).toBeGreaterThan(8);
    // Sample off the void-gap bands (width 0 in a gap) and compare early plateau vs the green run-in.
    const early = holes.map((h) => widthAtU(h, 0.18)).filter((w) => w > 0);
    const late = holes.map((h) => widthAtU(h, 0.8)).filter((w) => w > 0);
    expect(mean(late)).toBeGreaterThan(mean(early) * 1.08);
  });

  it('the grammar stays fair: validators hold across biomes, wildness and archetypes', () => {
    for (const biome of ['verdant-station', 'ember-world', 'ice-ring', 'tidal-archipelago']) {
      for (let s = 0; s < 25; s++) {
        for (const wild of [0.15, 0.6, 1]) {
          const c = generateCourse(s + 68000, { biome, holes: 3, wildness: wild });
          expect(validateCourse(c), `${biome}@${wild}`).toEqual([]);
          expect(validateFairness(c), `${biome}@${wild}`).toEqual([]);
          expect(validateCrossings(c), `${biome}@${wild}`).toEqual([]);
        }
      }
    }
  });

  it('deterministic: the same seed draws the same width archetypes', () => {
    const ids = (n: number) =>
      generateCourse(n, { biome: 'verdant-station', holes: 6, wildness: 0.5 }).holes.map((h) => h.widthId);
    expect(ids(4242)).toEqual(ids(4242));
  });
});
