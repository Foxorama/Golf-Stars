import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { playCourse, executeShot, type ExecOpts } from '../src/sim/round';
import { Rng } from '../src/sim/rng';
import { CLUBS } from '../src/sim/clubs';
import { lieAt, lieInfo, LIE_INFO } from '../src/sim/shot';
import { inScorch, meteorScorch, SCORCHABLE, SCORCH_LIE, SCORCH_MAX, SCORCH_MAX_R } from '../src/sim/scorch';
import { dist, type Vec } from '../src/sim/course/contract';

const BIOMES = ['verdant-station', 'dust-belt', 'ice-ring', 'ember-world', 'void-garden'];

describe('meteor-strike scorch marks (GS-meteor-scorch)', () => {
  it('the scorch lie is a real LIE_INFO row: hot, wild, NEVER a penalty', () => {
    const li = LIE_INFO[SCORCH_LIE]!;
    expect(li).toBeDefined();
    expect(li.penalty).toBeUndefined(); // non-penalty by construction
    expect(li.carryMult).toBeGreaterThan(1); // flies hot off the baked crust…
    expect(li.dispersionMult).toBeGreaterThan(1.2); // …but wild
    expect(li.label).toBe('Scorched');
  });

  it('places craters ONLY on soft turf, clear of the green and the tee, capped and separated', () => {
    let placed = 0;
    for (let seed = 0; seed < 40; seed++) {
      for (const hole of generateCourse(seed + 100, { biome: BIOMES[seed % BIOMES.length]!, holes: 3, wildness: 0.7 }).holes) {
        const marks = meteorScorch(hole);
        expect(marks.length).toBeLessThanOrEqual(SCORCH_MAX);
        placed += marks.length;
        const g = hole.features.find((f) => f.kind === 'green')!;
        let gR = 0;
        for (const p of g.poly) gR += dist(p, hole.green);
        gR /= g.poly.length;
        for (const m of marks) {
          expect(SCORCHABLE.has(lieAt(hole, m.c) as string), `seed ${seed}: on ${lieAt(hole, m.c)}`).toBe(true);
          expect(dist(m.c, hole.green)).toBeGreaterThan(gR); // never chars the putting surface
          expect(dist(m.c, hole.tee)).toBeGreaterThan(20); // the tee box stays clean
          expect(m.r).toBeGreaterThan(0);
          expect(m.r).toBeLessThanOrEqual(SCORCH_MAX_R);
          for (const o of marks) if (o !== m) expect(dist(m.c, o.c)).toBeGreaterThan(m.r + o.r); // a scatter, not a blob
        }
      }
    }
    expect(placed).toBeGreaterThan(60); // the mechanic actually shows up across seeds
  });

  it('meteorScorch is PURE — same hole → identical marks (byte-stable)', () => {
    const hole = generateCourse(7, { biome: 'ember-world', holes: 3, wildness: 0.8 }).holes[1]!;
    expect(meteorScorch(hole)).toEqual(meteorScorch(hole));
  });

  it('a ball at REST on a crater plays the scorch lie; off it, never (and never a penalty)', () => {
    let scorched = 0;
    for (let seed = 0; seed < 60; seed++) {
      const hole = generateCourse(seed + 500, { biome: BIOMES[seed % BIOMES.length]!, wildness: 0.6 }).holes[0]!;
      const marks = meteorScorch(hole);
      if (marks.length === 0) continue;
      const opts: ExecOpts = { carryMult: 1, meteorScorch: true } as ExecOpts;
      const rng = new Rng(`s:${seed}`);
      // Fire wedges/irons AT a crater so a decent share of shots rest on it.
      const target = marks[0]!.c;
      const from: Vec = [target[0] + 5, target[1] - 90];
      for (let s = 0; s < 10; s++) {
        const club = CLUBS[Math.floor((s / 10) * CLUBS.length)] ?? CLUBS[0]!;
        const ex = executeShot(hole, from, 'fairway', target, club, opts, rng);
        const onMark = inScorch(marks, ex.log.rest);
        if (ex.lieAfter === SCORCH_LIE) {
          scorched++;
          expect(onMark).toBe(true); // scorch ONLY on a mark
          expect(ex.penaltyStrokes).toBe(0); // never a stroke
          expect(ex.log.penalty).toBeUndefined();
        } else if (onMark && ex.penaltyStrokes === 0 && ex.ballAfter === ex.log.rest) {
          // On a mark but not scorched ⇒ the underlying surface wasn't soft turf (green/sand/…).
          expect(SCORCHABLE.has(ex.lieAfter as string)).toBe(false);
        }
      }
    }
    expect(scorched).toBeGreaterThan(5); // the conversion actually fires across seeds
  });

  it('armed play is deterministic; UNARMED play never yields a scorch lie', () => {
    const hole = generateCourse(11, { biome: 'verdant-station', wildness: 0.7 }).holes[0]!;
    const marks = meteorScorch(hole);
    const from: Vec = [(marks[0]?.c[0] ?? hole.green[0]) + 4, (marks[0]?.c[1] ?? hole.green[1]) - 80];
    const shoot = (armed: boolean, key: string) =>
      executeShot(hole, from, 'fairway', marks[0]?.c ?? hole.green, CLUBS[4]!, { carryMult: 1, meteorScorch: armed } as ExecOpts, new Rng(key));
    // Same seed → identical result (armed twice).
    expect(shoot(true, 'd:1')).toEqual(shoot(true, 'd:1'));
    // Armed vs unarmed differ ONLY in the lie label (the marks add ZERO rng): the ball itself is identical.
    for (let i = 0; i < 20; i++) {
      const a = shoot(true, `d:${i}`);
      const b = shoot(false, `d:${i}`);
      expect(a.ballAfter).toEqual(b.ballAfter);
      expect(a.penaltyStrokes).toBe(b.penaltyStrokes);
      expect(b.lieAfter).not.toBe(SCORCH_LIE);
      if (a.lieAfter !== SCORCH_LIE) expect(a.lieAfter).toBe(b.lieAfter);
      else expect(SCORCHABLE.has(b.lieAfter as string)).toBe(true);
    }
  });

  it('the lie actually BITES the next swing (wider spray than fairway, hotter carry)', () => {
    const scorch = lieInfo(SCORCH_LIE);
    const fw = lieInfo('fairway');
    expect(scorch.dispersionMult).toBeGreaterThan(fw.dispersionMult);
    expect(scorch.carryMult).toBeGreaterThan(fw.carryMult);
    // …but gentler than the true trouble lies (a crater is spice, not a hazard).
    expect(scorch.dispersionMult).toBeLessThan(lieInfo('trees').dispersionMult);
  });

  it('does NOT death-spiral with scorch armed (the fairness bar holds)', () => {
    let strokes = 0;
    let par = 0;
    let holes = 0;
    let blowups = 0;
    for (const biome of BIOMES) {
      for (let seed = 0; seed < 20; seed++) {
        const course = generateCourse(seed + 900, { biome, holes: 3, wildness: 1 });
        const played = playCourse(course.holes, new Rng(`${biome}:${seed}:p`), { meteorScorch: true });
        for (const p of played) {
          strokes += p.record.strokes;
          par += p.record.par;
          holes++;
          if (p.record.strokes >= 10) blowups++;
        }
      }
    }
    expect((strokes - par) / holes).toBeLessThan(1.0);
    expect(blowups / holes).toBeLessThan(0.05);
  });
});
