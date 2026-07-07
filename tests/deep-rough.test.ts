import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness, validateCrossings, validateGreenApproach } from '../src/sim/course/generate';
import { validateCourse, polylineDist, type Hole, type Vec } from '../src/sim/course/contract';
import { lieInfo, lieAt } from '../src/sim/shot';

function countKind(holes: Hole[], kind: string): number {
  return holes.reduce((n, h) => n + h.hazards.filter((z) => z.kind === kind).length, 0);
}
/** The corridor's WIDEST half-width — what fairness reasons about. */
function fairwayHalf(h: Hole): number {
  const fw = h.features.find((f) => f.kind === 'fairway')!;
  let max = 0;
  for (const p of fw.poly) max = Math.max(max, polylineDist(p, h.centreline));
  return max;
}

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

describe('deep rough (GS-deep-rough)', () => {
  it('deep rough is the DEEPEST recoverable land lie — non-penalty, harsher than fescue/rough', () => {
    expect(lieInfo('deeprough').penalty).toBeUndefined(); // a hack-out, never a lost card
    expect(lieInfo('deeprough').carryMult).toBeLessThan(lieInfo('fescue').carryMult);
    expect(lieInfo('fescue').carryMult).toBeLessThan(lieInfo('rough').carryMult);
    expect(lieInfo('deeprough').dispersionMult).toBeGreaterThan(lieInfo('fescue').dispersionMult);
  });

  it('land worlds LINE the rough with heavy deep rough, keeping the mown route clean + staying fair', () => {
    // GS-rough-gradient: deep rough now HUGS the fairway edge (a heavy-rough band that drives play back
    // to the fairway), not just the far dogleg corner — so it no longer sits entirely beyond the widest
    // half-width. What still holds: it never sits ON the mown route (heavy rough LINES the fairway, it
    // doesn't block it), and every structural fairness contract is intact (all kinds are non-penalty).
    let deep = 0;
    for (let s = 0; s < 40; s++) {
      for (const biome of ['verdant-station', 'dust-belt', 'ice-ring', 'ember-world', 'spore-jungle']) {
        const c = generateCourse(s + 40000, { biome, holes: 4, wildness: 0.7 });
        expect(validateCourse(c)).toEqual([]);
        expect(validateFairness(c)).toEqual([]); // deep rough is non-penalty → fairness ignores it
        expect(validateCrossings(c)).toEqual([]);
        expect(validateGreenApproach(c)).toEqual([]); // deep rough never fouls a greenside ring's approach
        for (const h of c.holes) {
          deep += countKind(c.holes, 'deeprough') > 0 ? 1 : 0;
          // The mown route down the centreline is never heavy rough / trees — it lines the hole, not blocks it.
          for (const p of centrelineSamples(h)) {
            const lie = lieAt(h, p);
            expect(lie === 'deeprough' || lie === 'fescue' || lie === 'trees').toBe(false);
          }
        }
      }
    }
    expect(deep).toBeGreaterThan(0);
  });

  it('the straight cut-the-corner line actually runs THROUGH the deep rough on doglegs (you must play around)', () => {
    let holesWhereCutIsChoked = 0;
    let par45 = 0;
    for (let s = 0; s < 120; s++) {
      const h = generateCourse(s + 41000, { biome: 'verdant-station', wildness: 0.7 }).holes[0]!;
      if (h.par < 4) continue;
      par45++;
      let choked = false;
      for (let i = 1; i < 20; i++) {
        const f = i / 20;
        const p: Vec = [h.tee[0] + (h.green[0] - h.tee[0]) * f, h.tee[1] + (h.green[1] - h.tee[1]) * f];
        if (lieAt(h, p) === 'deeprough') choked = true;
      }
      if (choked) holesWhereCutIsChoked++;
    }
    // A solid fraction of doglegs now punish the straight-line cut (straight holes have no corner → none).
    expect(holesWhereCutIsChoked).toBeGreaterThan(par45 * 0.25);
  });

  it("the OCEAN world's deep rough is the SEA — corner WATER (a penalty carry), never a `deeprough` lie", () => {
    let cornerWaterHoles = 0;
    for (let s = 0; s < 80; s++) {
      const c = generateCourse(s + 42000, { biome: 'tidal-archipelago', holes: 4, wildness: 0.7 });
      expect(validateFairness(c)).toEqual([]); // the corner sea sits off the bent corridor → fair
      expect(validateCourse(c)).toEqual([]);
      expect(validateGreenApproach(c)).toEqual([]); // corner sea never fouls a greenside ring's approach
      expect(countKind(c.holes, 'deeprough')).toBe(0); // the ocean never uses the land lie
      for (const h of c.holes) {
        if (h.par < 4) continue;
        const half = fairwayHalf(h);
        for (let i = 1; i < 20; i++) {
          const f = i / 20;
          const p: Vec = [h.tee[0] + (h.green[0] - h.tee[0]) * f, h.tee[1] + (h.green[1] - h.tee[1]) * f];
          if (lieInfo(lieAt(h, p)).penalty === 'water' && polylineDist(p, h.centreline) > half * 0.9) {
            cornerWaterHoles++;
            break;
          }
        }
      }
    }
    expect(cornerWaterHoles).toBeGreaterThan(0); // cutting a dogleg corner means carrying open sea
  });

  it('the lost-rough worlds (void/cetus) are UNTOUCHED — off their fairway is already the abyss', () => {
    for (let s = 0; s < 60; s++) {
      for (const biome of ['void-garden', 'cetus-deep']) {
        const c = generateCourse(s + 43000, { biome, holes: 4, wildness: 0.9 });
        expect(countKind(c.holes, 'deeprough')).toBe(0);
      }
    }
  });

  it('calm stops now get a heavy-rough BUFFER too (GS-rough-gradient), but the mown route stays clean', () => {
    // The forgiving opener no longer means "no deep rough" — the ask flipped: calm stops get MORE
    // deep rough AROUND the fairway (a wide, recoverable buffer so a wild spray isn't punished hard).
    // What still holds: that heavy rough LINES the fairway, it never blocks the mown centreline route.
    let deepCalm = 0;
    for (let s = 0; s < 80; s++) {
      const c = generateCourse(s + 44000, { biome: 'verdant-station', holes: 4, wildness: 0.15 });
      deepCalm += countKind(c.holes, 'deeprough');
      for (const h of c.holes) {
        for (const p of centrelineSamples(h)) {
          const lie = lieAt(h, p);
          expect(lie === 'deeprough' || lie === 'fescue' || lie === 'trees').toBe(false);
        }
      }
    }
    expect(deepCalm).toBeGreaterThan(0); // a calm stop DOES carry a heavy-rough buffer now
  });

  it('is deterministic — same seed generates byte-identical deep rough', () => {
    const a = generateCourse(45123, { biome: 'ember-world', holes: 5, wildness: 0.8 });
    const b = generateCourse(45123, { biome: 'ember-world', holes: 5, wildness: 0.8 });
    const dr = (c: typeof a) => JSON.stringify(c.holes.map((h) => h.hazards.filter((z) => z.kind === 'deeprough')));
    expect(dr(a)).toBe(dr(b));
    expect(countKind(a.holes, 'deeprough')).toBeGreaterThan(0);
  });
});
