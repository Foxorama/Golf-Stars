import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness, validateCrossings, holeYardage } from '../src/sim/course/generate';
import { validateCourse, type Hole } from '../src/sim/course/contract';

/** The shape FAMILY of a hole (strip the length/side suffixes off its shapeId). */
function family(h: Hole): string {
  const id = h.shapeId ?? '';
  if (id.includes('hairpin')) return 'hairpin';
  if (id.includes('cape')) return 'cape';
  if (id.includes('double')) return 'double';
  if (id.includes('dogleg') || id.includes('angled')) return 'dogleg';
  if (id.includes('drivable')) return 'drivable';
  return 'straight';
}

describe('hole archetypes (GS-shapes-2)', () => {
  it('every hole carries a shapeId and stays valid + fair', () => {
    for (let s = 0; s < 60; s++) {
      const c = generateCourse(s + 5000, { biome: 'verdant-station', holes: 6, wildness: 0.7 });
      expect(validateCourse(c)).toEqual([]);
      expect(validateFairness(c)).toEqual([]);
      expect(validateCrossings(c)).toEqual([]);
      for (const h of c.holes) expect(typeof h.shapeId).toBe('string');
    }
  });

  it('the deep voyage draws the full shape vocabulary (cape + hairpin + double all appear)', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 250; s++) {
      const c = generateCourse(s + 6000, { holes: 6, wildness: 0.95 });
      for (const h of c.holes) seen.add(family(h));
    }
    for (const want of ['straight', 'dogleg', 'cape', 'hairpin', 'double']) {
      expect(seen.has(want)).toBe(true);
    }
  });

  it('hairpins and capes are wildness-gated — calm stops stay gentle', () => {
    const countWild = (wild: number) => {
      let n = 0;
      for (let s = 0; s < 200; s++) {
        for (const h of generateCourse(s + 7000, { holes: 4, wildness: wild }).holes) {
          const f = family(h);
          if (f === 'hairpin' || f === 'cape') n++;
        }
      }
      return n;
    };
    // Capes arm at wildness 0.3, hairpins at 0.5 — so a wild voyage carries far more than a calm one.
    expect(countWild(0.9)).toBeGreaterThan(countWild(0.1) * 3);
  });

  it('par-4 length VARIES: drivable holes are genuinely short, long holes genuinely long', () => {
    const drivable: number[] = [];
    const longish: number[] = [];
    for (let s = 0; s < 400; s++) {
      for (const h of generateCourse(s + 8000, { biome: 'verdant-station', holes: 4, wildness: 0.4 }).holes) {
        if (h.par !== 4) continue;
        if (h.shapeId === 'drivable-par-4') drivable.push(holeYardage(h));
        else if (h.shapeId?.startsWith('long-')) longish.push(holeYardage(h));
      }
    }
    expect(drivable.length).toBeGreaterThan(0);
    expect(longish.length).toBeGreaterThan(0);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    // A drivable par-4 plays well under a long par-4 — real length variety within one par.
    expect(mean(drivable)).toBeLessThan(360);
    expect(mean(longish)).toBeGreaterThan(mean(drivable) + 80);
  });

  it('par-3 length varies: short pitches and long irons both occur', () => {
    let short = 0;
    let long = 0;
    for (let s = 0; s < 300; s++) {
      for (const h of generateCourse(s + 9000, { biome: 'verdant-station', holes: 6, wildness: 0.5 }).holes) {
        if (h.par !== 3) continue;
        const y = holeYardage(h);
        if (y < 140) short++;
        if (y > 190) long++;
      }
    }
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(0);
  });
});
