import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness, validateCrossings } from '../src/sim/course/generate';
import { validateCourse, dist, polylineDist, type Hole, type Vec } from '../src/sim/course/contract';

/** Does a hole carry a tree stand on the cut-the-corner line — i.e. trees near the straight
 *  tee→green chord but clear OUTSIDE the fairway corridor (a blocking grove, GS-variety)? */
function hasCornerBlocker(h: Hole): boolean {
  const chordLen = dist(h.tee, h.green) || 1;
  const dx = (h.green[0] - h.tee[0]) / chordLen;
  const dy = (h.green[1] - h.tee[1]) / chordLen;
  const fw = h.features.find((f) => f.kind === 'fairway');
  let half = 0;
  if (fw) for (const p of fw.poly) half = Math.max(half, polylineDist(p, h.centreline));
  for (const hz of h.hazards) {
    if (hz.kind !== 'trees') continue;
    const cx = hz.poly.reduce((s, p) => s + p[0], 0) / hz.poly.length;
    const cy = hz.poly.reduce((s, p) => s + p[1], 0) / hz.poly.length;
    const c: Vec = [cx, cy];
    // Distance from the tree centre to the straight tee→green line.
    const t = ((cx - h.tee[0]) * dx + (cy - h.tee[1]) * dy) / chordLen;
    if (t < 0.1 || t > 0.9) continue;
    const proj: Vec = [h.tee[0] + dx * chordLen * t, h.tee[1] + dy * chordLen * t];
    const toChord = dist(c, proj);
    // On (near) the chord, but the chord here is well off the corridor → it blocks the corner cut.
    if (toChord < 16 && polylineDist(c, h.centreline) > half) return true;
  }
  return false;
}

describe('course layout variety (GS-variety)', () => {
  it('blocking groves appear on dogleg corners at depth, and never trip the fairness validators', () => {
    let cornerBlockerHoles = 0;
    let total = 0;
    for (let s = 0; s < 120; s++) {
      const c = generateCourse(s + 12000, { biome: 'verdant-station', holes: 3, wildness: 0.9 });
      expect(validateCourse(c)).toEqual([]);
      expect(validateFairness(c)).toEqual([]); // trees are non-penalty → corridor stays provably fair
      expect(validateCrossings(c)).toEqual([]);
      for (const h of c.holes) {
        total++;
        if (hasCornerBlocker(h)) cornerBlockerHoles++;
      }
    }
    // They genuinely show up (the lever for fairway-follow trick shots) but aren't on every hole.
    expect(cornerBlockerHoles).toBeGreaterThan(0);
    expect(cornerBlockerHoles).toBeLessThan(total);
  });

  it('the calm opening stops are far more forgiving than deep ones (groves are wildness-gated)', () => {
    const countBlockers = (wild: number) => {
      let n = 0;
      for (let s = 0; s < 120; s++) {
        const c = generateCourse(s + 13000, { biome: 'verdant-station', holes: 3, wildness: wild });
        for (const h of c.holes) if (hasCornerBlocker(h)) n++;
      }
      return n;
    };
    // Groves only arm past the gate, so the deep stops carry many more corner blockers than calm ones.
    expect(countBlockers(0.9)).toBeGreaterThan(countBlockers(0.12) * 2);
  });

  it('water crossings now reach the mid stops (more lakes across fairways), still all carryable', () => {
    let crossHoles = 0;
    for (let s = 0; s < 120; s++) {
      const c = generateCourse(s + 14000, { biome: 'verdant-station', holes: 3, wildness: 0.35 });
      expect(validateCrossings(c)).toEqual([]);
      expect(validateFairness(c)).toEqual([]);
      crossHoles += c.holes.filter((h) => h.hazards.some((hz) => hz.kind === 'creek')).length;
    }
    expect(crossHoles).toBeGreaterThan(0); // creeks split fairways from the mid stops on
  });
});
