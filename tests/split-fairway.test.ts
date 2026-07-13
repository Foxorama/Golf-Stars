import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness, validateCrossings } from '../src/sim/course/generate';
import { validateCourse, polylineDist, type Hole, type Vec } from '../src/sim/course/contract';
import { biomeById } from '../src/sim/course/biomes';
import { playCourse, MAX_OVER_PAR } from '../src/sim/round';
import { Rng } from '../src/sim/rng';

/** Max perpendicular reach of the FIRST (primary) fairway feature from the centreline. */
function primaryHalfWidth(h: Hole): number {
  const fw = h.features.find((f) => f.kind === 'fairway');
  if (!fw) return 0;
  return Math.max(...fw.poly.map((p) => polylineDist(p, h.centreline)));
}

describe('split-fairway structural archetype (GS-split-fairway)', () => {
  it('opts in per world — armed worlds get splits, others never do', () => {
    expect(biomeById('verdant-station')?.splitFairway).toBeGreaterThan(0);
    expect(biomeById('dust-belt')?.splitFairway).toBeUndefined();

    let verdantSplits = 0;
    let dustSplits = 0;
    for (let s = 0; s < 120; s++) {
      for (const h of generateCourse(s + 800, { biome: 'verdant-station', holes: 9, wildness: 0.6, compose: true }).holes) {
        if (h.splitFairway) verdantSplits++;
        expect(h.par === 3 && h.splitFairway).not.toBe(true); // never on a par-3
      }
      for (const h of generateCourse(s + 800, { biome: 'dust-belt', holes: 9, wildness: 0.6, compose: true }).holes) {
        if (h.splitFairway) dustSplits++;
      }
    }
    expect(verdantSplits).toBeGreaterThan(0); // the archetype actually appears
    expect(dustSplits).toBe(0); // a non-opted world never splits
  });

  it('every split hole has a SECOND mown lane clear of the primary corridor; most keep a waste median', () => {
    let checked = 0;
    let withMedian = 0;
    for (let s = 0; s < 400 && checked < 60; s++) {
      for (const h of generateCourse(s + 900, { biome: 'verdant-station', holes: 9, wildness: 0.7, compose: true }).holes) {
        if (!h.splitFairway) continue;
        checked++;
        const half = primaryHalfWidth(h);
        const reach = (f: { poly: Vec[] }) => Math.max(...f.poly.map((p) => polylineDist(p, h.centreline)));
        // The alternate lane REACHES beyond the primary corridor — a genuinely separate route off to
        // the side, not the apron (which hugs the green centreline). It's a FEATURE, never deduped.
        const lanes = h.features.filter((f) => f.kind === 'fairway' && reach(f) > half + 8);
        expect(lanes.length).toBeGreaterThan(0);
        // The non-penalty waste median usually sits in the gap beyond the corridor — but it YIELDS to
        // the cross-family "no sand-over-water" dedupe invariant on the rare overlap with a pond/creek,
        // so it isn't guaranteed on every hole (the lane still makes it a split).
        if (h.hazards.some((hz) => hz.kind === 'waste' && reach(hz) > half)) withMedian++;
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(withMedian / checked).toBeGreaterThan(0.8); // the divider survives on the strong majority
  });

  it('never violates fairness (the primary corridor is untouched; the lane + median are non-penalty)', () => {
    for (const biome of ['verdant-station', 'tempest-reach']) {
      for (let s = 0; s < 120; s++) {
        const c = generateCourse(s + 1200, { biome, holes: 9, wildness: 1, compose: true });
        expect(validateCourse(c)).toEqual([]);
        expect(validateFairness(c)).toEqual([]);
        expect(validateCrossings(c)).toEqual([]);
      }
    }
  });

  it('is deterministic, and a split course still plays fair (no death-spiral)', () => {
    const a = generateCourse(500, { biome: 'verdant-station', holes: 9, wildness: 0.8, compose: true });
    const b = generateCourse(500, { biome: 'verdant-station', holes: 9, wildness: 0.8, compose: true });
    expect(a).toEqual(b);
    expect(a.holes.some((h) => h.splitFairway)).toBe(true);

    let strokes = 0;
    let par = 0;
    let holes = 0;
    let blow = 0;
    for (let s = 0; s < 80; s++) {
      const c = generateCourse(s + 1400, { biome: 'verdant-station', holes: 9, wildness: 1, compose: true });
      for (const p of playCourse(c.holes, new Rng(`split:${s}`))) {
        strokes += p.record.strokes;
        par += p.record.par;
        holes++;
        if (p.pickedUp || p.record.strokes - p.record.par >= MAX_OVER_PAR) blow++;
      }
    }
    // The auto-AI plays the primary line, so the split is additive — balance stays under the bar.
    expect((strokes - par) / holes).toBeLessThan(1.0);
    expect(blow / holes).toBeLessThan(0.15);
  });
});
