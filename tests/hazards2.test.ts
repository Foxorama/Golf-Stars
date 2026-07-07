import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness, validateCrossings } from '../src/sim/course/generate';
import { validateCourse, type Hole, type Vec } from '../src/sim/course/contract';
import { lieInfo, lieAt } from '../src/sim/shot';

/** Fine samples down the hole's mown centreline — the route the fairway follows. */
function centrelineSamples(h: Hole): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i + 1 < h.centreline.length; i++) {
    const a = h.centreline[i]!;
    const b = h.centreline[i + 1]!;
    for (let k = 0; k < 8; k++) {
      const f = k / 8;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
  }
  return out;
}

function countKind(holes: Hole[], kind: string): number {
  return holes.reduce((n, h) => n + h.hazards.filter((z) => z.kind === kind).length, 0);
}
/** Approx green radius from its polygon (mean distance of vertices to centroid). */
function greenR(h: Hole): number {
  const g = h.features.find((f) => f.kind === 'green')!;
  const cx = g.poly.reduce((s, p) => s + p[0], 0) / g.poly.length;
  const cy = g.poly.reduce((s, p) => s + p[1], 0) / g.poly.length;
  return g.poly.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / g.poly.length;
}

describe('hazard variety (GS-hazards-2)', () => {
  it('pot bunkers and fescue are NON-penalty recovery lies, ordered by severity', () => {
    expect(lieInfo('pot').penalty).toBeUndefined();
    expect(lieInfo('fescue').penalty).toBeUndefined();
    // Pot is a harsher escape than open sand; fescue sits between rough and the woods.
    expect(lieInfo('pot').carryMult).toBeLessThan(lieInfo('bunker').carryMult);
    expect(lieInfo('fescue').carryMult).toBeLessThan(lieInfo('rough').carryMult);
    expect(lieInfo('fescue').carryMult).toBeGreaterThan(lieInfo('trees').carryMult);
  });

  it('a ravine is a PENALTY-area forced carry (a crossing), not a free lie', () => {
    expect(lieInfo('barranca').penalty).toBe('ravine');
  });

  it('parkland & desert worlds carry pot nests + fescue, and stay valid + fair', () => {
    let pots = 0;
    let fescue = 0;
    for (let s = 0; s < 60; s++) {
      for (const biome of ['verdant-station', 'dust-belt']) {
        const c = generateCourse(s + 21000, { biome, holes: 4, wildness: 0.7 });
        expect(validateCourse(c)).toEqual([]);
        expect(validateFairness(c)).toEqual([]); // sand + fescue are non-penalty → corridor stays fair
        expect(validateCrossings(c)).toEqual([]);
        pots += countKind(c.holes, 'pot');
        fescue += countKind(c.holes, 'fescue');
      }
    }
    expect(pots).toBeGreaterThan(0);
    expect(fescue).toBeGreaterThan(0);
  });

  it('the desert ravine crosses the fairway and is always carryable', () => {
    let ravineHoles = 0;
    for (let s = 0; s < 120; s++) {
      const c = generateCourse(s + 22000, { biome: 'dust-belt', holes: 4, wildness: 0.6 });
      expect(validateCrossings(c)).toEqual([]); // proven enter+exit with safe shelves
      expect(validateFairness(c)).toEqual([]); // crossing is exempt; nothing else intrudes
      ravineHoles += c.holes.filter((h) => h.hazards.some((z) => z.kind === 'barranca')).length;
    }
    expect(ravineHoles).toBeGreaterThan(0);
  });

  it('fescue lines the rough OFF the mown route (a sensible shot down the centre stays clear)', () => {
    // GS-rough-gradient: the heavy-rough band now HUGS the fairway edge (it drives play back to the
    // fairway), so fescue no longer sits entirely beyond 0.7× the widest half-width. The invariant that
    // still holds — and is the one that matters — is that it LINES the hole without ever sitting on the
    // mown centreline route, so a sensible shot down the middle is always clear of it.
    for (let s = 0; s < 40; s++) {
      const h = generateCourse(s + 23000, { biome: 'verdant-station', wildness: 0.7 }).holes[0]!;
      expect(h.hazards.some((z) => z.kind === 'fescue')).toBe(true); // fescue is present
      for (const p of centrelineSamples(h)) expect(lieAt(h, p) === 'fescue').toBe(false);
    }
  });

  it('green size tracks hole length: short par-3 greens are smaller than long par-5 greens', () => {
    const small: number[] = [];
    const big: number[] = [];
    for (let s = 0; s < 400; s++) {
      for (const h of generateCourse(s + 24000, { biome: 'verdant-station', holes: 6, wildness: 0.4 }).holes) {
        if (h.par === 3 && h.shapeId?.startsWith('short-3')) small.push(greenR(h));
        else if (h.par === 5 && (h.shapeId?.startsWith('three-shot') || h.shapeId === '')) big.push(greenR(h));
      }
    }
    const mean = (a: number[]) => a.reduce((x, v) => x + v, 0) / a.length;
    expect(small.length).toBeGreaterThan(0);
    expect(big.length).toBeGreaterThan(0);
    expect(mean(small)).toBeLessThan(mean(big));
  });
});
