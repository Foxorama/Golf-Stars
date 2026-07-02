import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, executeShot, type ExecOpts } from '../src/sim/round';
import { Rng } from '../src/sim/rng';
import { CLUBS } from '../src/sim/clubs';
import { lieAt, lieInfo, LIE_INFO } from '../src/sim/shot';
import { effectPatches, inPatch, PATCHABLE, PATCH_SPECS, type PatchKind } from '../src/sim/patches';
import { BALANCE_EXEMPT_BIOMES } from '../src/sim/course/biomes';
import { dist, type Vec } from '../src/sim/course/contract';

const BIOMES = ['verdant-station', 'dust-belt', 'ice-ring', 'ember-world', 'void-garden'];
const KINDS = Object.keys(PATCH_SPECS) as PatchKind[];

describe('effect ground patches (GS-journey-fx-2)', () => {
  it('every patch family resolves to a real LIE_INFO row that is NEVER a penalty', () => {
    for (const kind of KINDS) {
      const li = LIE_INFO[PATCH_SPECS[kind].lie];
      expect(li, `${kind} → ${PATCH_SPECS[kind].lie}`).toBeDefined();
      expect(li!.penalty).toBeUndefined(); // non-penalty by construction — spice, never a hazard
    }
  });

  it('the families play DIFFERENTLY: stardust is a bonus, ice is slick, junk snags', () => {
    const fw = lieInfo('fairway');
    const stardust = lieInfo(PATCH_SPECS.stardust.lie);
    expect(stardust.carryMult).toBeGreaterThan(1); // flies hot…
    expect(stardust.dispersionMult).toBeLessThan(fw.dispersionMult); // …AND true — the one patch you aim FOR
    const ice = lieInfo(PATCH_SPECS.frost.lie);
    expect(ice.dispersionMult).toBeGreaterThan(fw.dispersionMult); // slick — hard to control
    const junk = lieInfo(PATCH_SPECS.junk.lie);
    expect(junk.carryMult).toBeLessThan(lieInfo('rough').carryMult); // snags — worse than rough…
    expect(junk.dispersionMult).toBeLessThan(lieInfo('trees').dispersionMult); // …gentler than the woods
  });

  it('places patches ONLY on soft turf, clear of the green and the tee, capped and separated', () => {
    for (const kind of KINDS) {
      let placed = 0;
      for (let seed = 0; seed < 25; seed++) {
        for (const hole of generateCourse(seed + 100, { biome: BIOMES[seed % BIOMES.length]!, holes: 3, wildness: 0.7 }).holes) {
          const patches = effectPatches(hole, kind);
          expect(patches.length).toBeLessThanOrEqual(PATCH_SPECS[kind].max);
          placed += patches.length;
          const g = hole.features.find((f) => f.kind === 'green')!;
          let gR = 0;
          for (const p of g.poly) gR += dist(p, hole.green);
          gR /= g.poly.length;
          for (const m of patches) {
            expect(PATCHABLE.has(lieAt(hole, m.c) as string), `${kind} seed ${seed}: on ${lieAt(hole, m.c)}`).toBe(true);
            expect(dist(m.c, hole.green)).toBeGreaterThan(gR); // never crowds the putting surface
            expect(dist(m.c, hole.tee)).toBeGreaterThan(20); // the tee box stays clean
            expect(m.r).toBeGreaterThan(0);
            expect(m.r).toBeLessThanOrEqual(PATCH_SPECS[kind].maxR);
            for (const o of patches) if (o !== m) expect(dist(m.c, o.c)).toBeGreaterThan(m.r + o.r); // a scatter, not a blob
          }
        }
      }
      expect(placed, `${kind} actually shows up across seeds`).toBeGreaterThan(40);
    }
  });

  it('effectPatches is PURE — same hole + kind → identical patches; kinds differ from each other', () => {
    const hole = generateCourse(7, { biome: 'ember-world', holes: 3, wildness: 0.8 }).holes[1]!;
    for (const kind of KINDS) expect(effectPatches(hole, kind)).toEqual(effectPatches(hole, kind));
    // Each family rides its OWN seeded stream, so the scatters are distinct per kind.
    const a = effectPatches(hole, 'stardust');
    const b = effectPatches(hole, 'frost');
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('a ball at REST on a patch plays the family lie; off it, never (and never a penalty)', () => {
    for (const kind of KINDS) {
      let converted = 0;
      for (let seed = 0; seed < 60 && converted <= 5; seed++) {
        const hole = generateCourse(seed + 500, { biome: BIOMES[seed % BIOMES.length]!, wildness: 0.6 }).holes[0]!;
        const patches = effectPatches(hole, kind);
        if (patches.length === 0) continue;
        const opts: ExecOpts = { carryMult: 1, groundPatch: kind } as ExecOpts;
        const rng = new Rng(`p:${kind}:${seed}`);
        const target = patches[0]!.c;
        const from: Vec = [target[0] + 5, target[1] - 90];
        for (let s = 0; s < 10; s++) {
          const club = CLUBS[Math.floor((s / 10) * CLUBS.length)] ?? CLUBS[0]!;
          const ex = executeShot(hole, from, 'fairway', target, club, opts, rng);
          const onPatch = inPatch(patches, ex.log.rest);
          const raw = lieAt(hole, ex.log.rest); // the surface UNDER the ball (conversion changes only the label)
          if (onPatch && PATCHABLE.has(raw as string)) {
            converted++;
            expect(ex.lieAfter).toBe(PATCH_SPECS[kind].lie); // a soft-turf rest ON a patch converts…
            expect(ex.penaltyStrokes).toBe(0); // …and is never a stroke
            expect(ex.log.penalty).toBeUndefined();
          } else if (!onPatch && raw !== PATCH_SPECS[kind].lie) {
            // Off every patch the family lie never appears (frost's 'ice' can still occur NATURALLY
            // on ice worlds — that's the raw surface, excluded by the second clause).
            expect(ex.lieAfter).not.toBe(PATCH_SPECS[kind].lie);
          }
        }
      }
      expect(converted, `${kind} conversion actually fires across seeds`).toBeGreaterThan(5);
    }
  });

  it('armed play is deterministic; the patches add ZERO rng (armed vs unarmed: identical ball)', () => {
    const hole = generateCourse(11, { biome: 'verdant-station', wildness: 0.7 }).holes[0]!;
    for (const kind of KINDS) {
      const patches = effectPatches(hole, kind);
      const from: Vec = [(patches[0]?.c[0] ?? hole.green[0]) + 4, (patches[0]?.c[1] ?? hole.green[1]) - 80];
      const shoot = (armed: boolean, key: string) =>
        executeShot(hole, from, 'fairway', patches[0]?.c ?? hole.green, CLUBS[4]!, { carryMult: 1, groundPatch: armed ? kind : undefined } as ExecOpts, new Rng(key));
      expect(shoot(true, 'd:1')).toEqual(shoot(true, 'd:1'));
      for (let i = 0; i < 20; i++) {
        const a = shoot(true, `d:${i}`);
        const b = shoot(false, `d:${i}`);
        expect(a.ballAfter).toEqual(b.ballAfter); // the ball itself is identical…
        expect(a.penaltyStrokes).toBe(b.penaltyStrokes);
        expect(b.lieAfter).not.toBe(PATCH_SPECS[kind].lie); // …only the lie label can differ
        if (a.lieAfter !== PATCH_SPECS[kind].lie) expect(a.lieAfter).toBe(b.lieAfter);
        else expect(PATCHABLE.has(b.lieAfter as string)).toBe(true);
      }
    }
  });

  it('does NOT death-spiral with any patch family armed (the fairness bar holds)', () => {
    for (const kind of KINDS) {
      let strokes = 0;
      let par = 0;
      let holes = 0;
      let blowups = 0;
      for (const biome of BIOMES) {
        // Void/Cetus are the island-hop showcase worlds, exempt from the death-spiral bar (GS-cetus-5).
        if (BALANCE_EXEMPT_BIOMES.has(biome)) continue;
        for (let seed = 0; seed < 12; seed++) {
          const course = generateCourse(seed + 900, { biome, holes: 3, wildness: 1 });
          const played = playCourse(course.holes, new Rng(`${kind}:${biome}:${seed}:p`), { groundPatch: kind });
          for (const p of played) {
            strokes += p.record.strokes;
            par += p.record.par;
            holes++;
            if (p.record.strokes >= 10) blowups++;
          }
        }
      }
      expect((strokes - par) / holes, `${kind} to-par bar`).toBeLessThan(1.0);
      expect(blowups / holes, `${kind} blow-up bar`).toBeLessThan(0.05);
    }
  });
});
