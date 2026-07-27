import { describe, it, expect } from 'vitest';
import { generateCourse, unfoldOffsetEdge, validateFairness, validateCrossings } from '../src/sim/course/generate';
import { pointInPoly, segDist, validateCourse } from '../src/sim/course/contract';
import { wallReflect, wallRollHit, wallRollBounce, segHit, WALL_HEIGHT, type ShipWall } from '../src/sim/walls';
import { rollOut, shotSpread, sprayBlocking, executeShot, biomeCarryMult, containToDeck, shipFlightPath } from '../src/sim/round';
import { arcApex, ARC_FEEL, flightProfileOf } from '../src/sim/flight';
import { lieAt, lieInfo } from '../src/sim/shot';
import { SPACE_DUCKS_GUARD, CONVICT_SHEEP_GUARD } from '../src/sim/rpg/shopItems';
import { Rng } from '../src/sim/rng';
import { CLUBS } from '../src/sim/clubs';
import type { Hole } from '../src/sim/course/contract';
import type { Vec } from '../src/sim/course/contract';

// GS-ship-walls: the derelict world's collidable metal corridor bulkheads — every ball leaving the deck
// sideways bounces back; NOTHING clears them (they stand 72 yd, above the 60-yd shot-apex cap); hit two
// walls, bounce twice. Pure geometry, zero rng, stamped by the generator from the ribbon edges. These
// guard the reflect maths, the arc-height gate, multi-bounce, generation (present on the derelict,
// absent + byte-identical everywhere else), and determinism.


/** A point a fraction `t` by arc length along the hole's centreline (the corridor spine). */
function centreAt(hole: Hole, t: number): Vec {
  const line = hole.centreline;
  let total = 0;
  for (let i = 1; i < line.length; i++) total += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
  let want = total * Math.max(0, Math.min(1, t));
  for (let i = 1; i < line.length; i++) {
    const d = Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
    if (want <= d) {
      const f = d ? want / d : 0;
      return [line[i - 1]![0] + (line[i]![0] - line[i - 1]![0]) * f, line[i - 1]![1] + (line[i]![1] - line[i - 1]![1]) * f];
    }
    want -= d;
  }
  return line[line.length - 1]!;
}

/** Open SPACE off the hull — the lost-to-space read the containment keys off. An acid BREACH is a
 *  hazard ON the deck, not space, so it is deliberately excluded (same rule as the sim's own test). */
function isSpace(hole: Hole, p: Vec): boolean {
  const k = lieAt(hole, p);
  return k !== 'breach' && lieInfo(k).penalty === 'voidlost';
}

describe('GS-ship-walls — reflection geometry', () => {
  it('reflects a ball heading INTO the wall back inward, leaves an inward ball alone', () => {
    const N: Vec = [0, 1]; // inward = +y
    // Heading outward (−y) into the wall → reflects to +y.
    const out = wallReflect(N, [0.3, -1]);
    expect(out[1]).toBeGreaterThan(0);
    // Already heading inward (+y) → unchanged direction (still +y).
    expect(wallReflect(N, [0.2, 1])[1]).toBeGreaterThan(0);
    // Mirror component preserved: x is untouched by a y-normal reflect.
    expect(out[0]).toBeGreaterThan(0);
  });

  it('segHit finds a crossing and rejects a miss', () => {
    expect(segHit([0, 0], [10, 0], [5, -5], [5, 5])).toEqual([5, 0]);
    expect(segHit([0, 0], [10, 0], [5, 1], [5, 5])).toBeNull();
  });
});

describe('GS-ship-walls — the bulkhead is un-clearable, and the ROLLING ricochet', () => {
  // A wall running along x at y=20, inward normal pointing back toward the deck (−y).
  const wall: ShipWall = { a: [-100, 20], b: [100, 20], normal: [0, -1], height: WALL_HEIGHT };

  it('a real bulkhead stands above the shot-apex cap — nothing in the bag can fly over one', () => {
    // The whole premise of the derelict: you play golf sealed INSIDE the corridor. That rests on one
    // number, so assert it directly rather than through a collision helper. `flight.ts` hard-caps every
    // shot's apex at ARC_FEEL.peakMax, so a bulkhead above it is un-clearable by any club at any power —
    // which is exactly why the deck-boundary bounce in round.ts needs no height gate at all.
    expect(WALL_HEIGHT).toBeGreaterThan(ARC_FEEL.peakMax);
    for (const club of ['SW', 'PW', '9i', 'D'] as const) {
      const p = flightProfileOf(club);
      // Apex of a full shot of this family, at the most-lofted (shortest-relative) carry there is.
      expect(arcApex(60, 240, ARC_FEEL, p)).toBeLessThan(WALL_HEIGHT);
      expect(arcApex(240, 240, ARC_FEEL, p)).toBeLessThan(WALL_HEIGHT);
    }
  });

  it('wallRollHit stops a ball rolling OUTWARD into a wall, ignores one rolling inward', () => {
    expect(wallRollHit([wall], [0, 18], [0, 25])).toBe(wall); // rolling out (+y) into the −y-normal wall
    expect(wallRollHit([wall], [0, 25], [0, 18])).toBeNull(); // rolling inward (−y) → no stop
  });

  it('wallRollBounce returns the wall AND the impact point (the ricochet the pinball reflects off)', () => {
    const b = wallRollBounce([wall], [0, 18], [0, 25]);
    expect(b).not.toBeNull();
    expect(b!.wall).toBe(wall);
    expect(b!.point[1]).toBeCloseTo(20, 3); // hit the wall at y=20
    expect(wallRollBounce([wall], [0, 25], [0, 18])).toBeNull(); // rolling inward → no bounce
  });
});

describe('GS-ship-pinball — the rolling ball bounces wall-to-wall, never a dead stop', () => {
  // A synthetic chute: two facing walls forming a corridor along y, so a ball rolling out the side
  // bounces back and forth. rollOut needs a real Hole to read lies from — a bare fairway box works.
  function chuteHole(): Hole {
    const box: Vec[] = [[-40, -40], [40, -40], [40, 400], [-40, 400]];
    return {
      par: 4,
      tee: [0, 0],
      green: [0, 360],
      pin: [0, 360],
      centreline: [[0, 0], [0, 360]],
      features: [{ kind: 'fairway', poly: box }],
      hazards: [],
      wind: null,
      biomeMods: [],
      shapeId: 'straight',
      widthId: 'ship-corridor',
      walls: [
        { a: [20, -100], b: [20, 500], normal: [-1, 0], height: WALL_HEIGHT }, // right wall, inward −x
        { a: [-20, -100], b: [-20, 500], normal: [1, 0], height: WALL_HEIGHT }, // left wall, inward +x
      ],
    } as unknown as Hole;
  }

  it('a ball rolling into a bulkhead reflects and keeps rolling (stays inside the corridor)', () => {
    const hole = chuteHole();
    // Start mid-corridor, roll OUTWARD toward the right wall at a shallow forward angle with real pace.
    const start: Vec = [10, 40];
    const dir: Vec = [0.7, 0.71]; // toward +x (the right wall) and forward
    const withWalls = rollOut(hole, start, dir, 60, 'fairway', undefined, undefined, hole.walls);
    // It must NOT escape the corridor — reflected back inside |x| ≤ 20.
    expect(Math.abs(withWalls.rest[0])).toBeLessThanOrEqual(20.5);
    // And it bounced (a curved path is returned, with more than the straight 2 points).
    expect(withWalls.path && withWalls.path.length).toBeGreaterThan(2);
    // Without walls the same roll sails clean out past the wall line (proof the walls did the saving).
    const noWalls = rollOut(hole, start, dir, 60, 'fairway', undefined, undefined, undefined);
    expect(noWalls.rest[0]).toBeGreaterThan(20.5);
  });

  it('a lobe-less non-walled roll is byte-for-byte the straight integrator (no regression)', () => {
    const hole = chuteHole();
    const a = rollOut(hole, [0, 40], [0, 1], 30, 'fairway');
    // A straight forward roll never touches a wall → identical with or without the walls param.
    const b = rollOut(hole, [0, 40], [0, 1], 30, 'fairway', undefined, undefined, hole.walls);
    expect(a.rest).toEqual(b.rest);
    expect(a.roll).toEqual(b.roll);
    expect(a.path).toBeUndefined(); // straight integrator returns no path
  });
});

describe('GS-ship-walls — the aim cone reads the wall (blocks like a treeline)', () => {
  it('a shot aimed into a bulkhead shades a blocked region tagged "walls"', () => {
    // A derelict corridor hole with real walls.
    let hole: Hole | undefined;
    for (let s = 1; s < 60 && !hole; s++) {
      const c = generateCourse(s, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness: 0.3 });
      hole = c.holes.find((h) => (h.walls?.length ?? 0) > 0 && h.par >= 4);
    }
    expect(hole, 'a walled derelict hole exists').toBeTruthy();
    const D = CLUBS.find((c) => c.id === 'D')!;
    // Aim at a nearby wall's midpoint so the cone crosses it.
    const w = hole!.walls!.find((x) => Math.hypot(x.a[0] - hole!.tee[0], x.a[1] - hole!.tee[1]) < 220) ?? hole!.walls![0]!;
    const target: Vec = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    const s = shotSpread(hole!, hole!.tee, 'tee', target, D, {});
    const blocked = sprayBlocking(hole!, s, undefined, { walls: hole!.walls });
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.some((r) => r.src === 'walls')).toBe(true);
    // Absent the walls opt, the same cone shades nothing (walls are the only obstacle here).
    expect(sprayBlocking(hole!, s, undefined, {}).length).toBe(0);
  });
});

describe('GS-ship-corridor-contain — a sideways miss ricochets back, never lost to space', () => {
  // The invariant the derelict's impassable bulkheads promise: a ball can only be LOST TO SPACE by a
  // sanctioned FORWARD carry (a torn-hull star-gap), NEVER by drifting sideways off a solid stretch of
  // hull deck. Before this fix ~25% of full-power derelict drives were lost to space DESPITE the walls —
  // the per-segment wall rails don't close the fence on a corridor that zigzags with hard-angular corners.
  // `executeShot` now contains the ball back onto the deck (the deck the renderer draws IS the bulkhead).
  // Because the sim ALREADY applies that containment, no resting ball may still be containable — a leftover
  // off-hull rest at a SOLID station (one `containToDeck` can recover) is exactly the bug. These end-to-end
  // seeded drives are the regression the synthetic reflection tests above could never catch.
  const DR = CLUBS.find((c) => c.id === 'D')!;

  it('no seeded derelict drive comes to rest off the hull at a solid corridor station', () => {
    let checked = 0;
    let walledHoles = 0;
    for (let s = 1; s < 40; s++) {
      for (const wildness of [0.4, 0.7, 1]) {
        const course = generateCourse(s, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness });
        for (const hole of course.holes) {
          if (!(hole.walls?.length && hole.walls.length > 0) || hole.par < 4) continue;
          walledHoles++;
          const carryMult = biomeCarryMult(hole);
          // Aim down the corridor toward the first bend; the seeded angular spray sends a share of these
          // drives sideways into the bulkheads — exactly the shots that used to leak into space.
          const bend = hole.centreline[1] ?? hole.green;
          const fx = bend[0] - hole.tee[0];
          const fy = bend[1] - hole.tee[1];
          const fl = Math.hypot(fx, fy) || 1;
          const target: Vec = [hole.tee[0] + (fx / fl) * 210, hole.tee[1] + (fy / fl) * 210];
          for (let k = 0; k < 10; k++) {
            const rng = new Rng(90000 + s * 31 + k + Math.round(wildness * 10));
            const r = executeShot(hole, hole.tee, 'tee', target, DR, { carryMult, power: 1 }, rng);
            checked++;
            // A resting ball the containment could still pull back onto the deck means a lateral escape
            // slipped through — the invariant is broken. Genuine torn-hull gaps return null (left lost).
            expect(containToDeck(hole, r.log.rest), `seed ${s} w${wildness} k${k} rest ${r.log.rest}`).toBeNull();
          }
        }
      }
    }
    expect(walledHoles).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(200);
  });

  it('a recovered ball is always seated ON the deck — never in a between-plates space sliver', () => {
    const DECK_LIES = ['fairway', 'rough', 'tee', 'green', 'bunker', 'waste', 'sand'];
    for (let s = 1; s < 40; s++) {
      const course = generateCourse(s + 500, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness: 0.8 });
      for (const hole of course.holes) {
        if (!(hole.walls?.length)) continue;
        for (const w of hole.walls) {
          // A point just OUTSIDE each drawn bulkhead (off the deck, toward space).
          const mid: Vec = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
          const outside: Vec = [mid[0] - w.normal[0] * 8, mid[1] - w.normal[1] * 8];
          const saved = containToDeck(hole, outside);
          if (saved) expect(DECK_LIES, `hole seed ${s + 500} saved ${saved}`).toContain(lieAt(hole, saved));
        }
      }
    }
  });
});

describe('GS-ship-pinball-flight — the derelict flies STRAIGHT segments that crack off the bulkheads', () => {
  // The derelict corridor no longer flies the parkland fade/hook BANANA — it flies a STRAIGHT-line PINBALL
  // flight: the ball flies straight and ricochets crisply off each bulkhead, and the sim stores the exact
  // reflected polyline on `log.flightPath` (the SAME segments the renderer draws — graphic ≡ physics). What
  // matters, and what these assert:
  //   1. EVERY derelict shot flies straight — a `flightPath` polyline is always stored (never the banana).
  //   2. A bounced shot's polyline has ≥3 vertices (tee → bulkhead(s) → landing); a clean drive is 2 (a
  //      straight line). And each vertex is a real turn (the segments genuinely change direction on a bounce).
  // Containment itself is NOT asserted here: since GS-ship-calm-space made the derelict UNIFORMLY walled-space
  // at every wildness (off the deck is always lost, and the hull tears into star-gap sections + side-wall
  // openings at all difficulties), a bounced ball shooting a sanctioned gap into space is now common and CORRECT
  // (REQ2 below). The real "no sideways leak off a SOLID stretch" guarantee is the resting-containment test above
  // (`GS-ship-corridor-contain`); chasing a per-point flight lost-rate is the trap five attempts fell into.
  const DR = CLUBS.find((c) => c.id === 'D')!;

  it('every derelict shot flies a straight polyline; a bounced one turns at each bulkhead', () => {
    let checked = 0;
    let walled = 0;
    let bouncedSeen = 0;
    for (let s = 1; s < 40; s++) {
      for (const wildness of [0.4, 0.7, 1]) {
        const course = generateCourse(s, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness });
        for (const hole of course.holes) {
          if (!(hole.walls?.length) || hole.par < 4) continue;
          walled++;
          const carryMult = biomeCarryMult(hole);
          const bend = hole.centreline[1] ?? hole.green;
          const fx = bend[0] - hole.tee[0];
          const fy = bend[1] - hole.tee[1];
          const fl = Math.hypot(fx, fy) || 1;
          for (const ang of [-0.25, -0.12, 0, 0.12, 0.25]) {
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const dx = (fx / fl) * ca - (fy / fl) * sa;
            const dy = (fx / fl) * sa + (fy / fl) * ca;
            const target: Vec = [hole.tee[0] + dx * 210, hole.tee[1] + dy * 210];
            for (let k = 0; k < 8; k++) {
              const rng = new Rng(90000 + s * 31 + k + Math.round(wildness * 10) + Math.round(ang * 100));
              const r = executeShot(hole, hole.tee, 'tee', target, DR, { carryMult, power: 1 }, rng);
              checked++;
              // (1) every ship shot flies straight → a polyline is always stored.
              const fp = r.log.flightPath;
              expect(fp, `seed ${s} w${wildness} ang${ang} k${k}: no flightPath stored`).toBeTruthy();
              // (2) a bounced shot carries an interior vertex at each bulkhead (tee → bounce(s) → landing);
              // a clean drive is a straight 2-point line. (A grazing ricochet may barely deflect — correct
              // physics — so we assert STRUCTURE, not a minimum turn angle.)
              const bounces = r.log.wallHit?.bounces ?? 0;
              expect(fp!.length, `seed ${s} ang${ang} k${k}: ${bounces} bounces but ${fp!.length}-pt path`).toBeGreaterThanOrEqual(bounces > 0 ? 3 : 2);
              if (bounces > 0) bouncedSeen++;
            }
          }
        }
      }
    }
    expect(walled).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(200);
    expect(bouncedSeen).toBeGreaterThan(50); // the scenario actually exercises the ricochet a lot
  });
});

describe('GS-ship-wall-caddy — a caddy guard SAVES a miss on a walled corridor (never lost, never zigzag)', () => {
  // The derelict's wall bounce and a caddy GUARD (Space Ducks laser / Convict Sheep boomerang) both act
  // on a miss, and used to fight: the guard recentres the miss onto the aim-BEARING line, which on a
  // BENDING ship corridor lands in open space; the wall bounce then re-processed that fictional curve-back
  // arc, re-intercepting ~81% of caddy saves and flinging ~7% back into space — a guaranteed save that
  // ended LOST. Now a redirect snaps to the deck spine, skips the wall bounce, and is sticky. A guard save
  // on a walled hole must ALWAYS finish on the deck.
  it('no guard redirect on a walled derelict hole ends lost to space', () => {
    const DR = CLUBS.find((c) => c.id === 'D')!;
    let redirects = 0;
    for (const guard of [SPACE_DUCKS_GUARD, CONVICT_SHEEP_GUARD]) {
      for (let s = 1; s < 30; s++) {
        for (const wildness of [0.6, 0.8, 1]) {
          const course = generateCourse(s, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness });
          for (const hole of course.holes) {
            if (!(hole.walls?.length) || hole.par < 4) continue;
            const carryMult = biomeCarryMult(hole);
            const bend = hole.centreline[1] ?? hole.green;
            const fx = bend[0] - hole.tee[0];
            const fy = bend[1] - hole.tee[1];
            const fl = Math.hypot(fx, fy) || 1;
            for (const ang of [-0.2, -0.1, 0, 0.1, 0.2]) {
              const ca = Math.cos(ang), sa = Math.sin(ang);
              const dx = (fx / fl) * ca - (fy / fl) * sa;
              const dy = (fx / fl) * sa + (fy / fl) * ca;
              const target: Vec = [hole.tee[0] + dx * 210, hole.tee[1] + dy * 210];
              for (let k = 0; k < 6; k++) {
                const rng = new Rng(70000 + s * 31 + k + Math.round(wildness * 10) + Math.round(ang * 100));
                const r = executeShot(hole, hole.tee, 'tee', target, DR, { carryMult, power: 1, guard }, rng);
                if (!r.log.result.redirect) continue;
                redirects++;
                // A caddy guard PROMISES a save onto the short grass — it may never end LOST TO SPACE, and
                // it may never also register a wall bounce (that double-processing was the bad interaction).
                // An on-deck acid BREACH is an ordinary hazard, not space: the guard puts the ball back in
                // play, and a save that then runs 20 yd into a breach is the same fair outcome as a save
                // that trickles into a pond on a parkland hole. The guard was never hazard-immune.
                expect(['shiprough', 'voidrough'], `guard ${guard.kind} seed ${s} w${wildness} lost to space`).not.toContain(
                  r.log.lieTo,
                );
                expect(r.log.wallHit, `guard ${guard.kind} seed ${s} redirect+wallHit conflict`).toBeFalsy();
              }
            }
          }
        }
      }
    }
    expect(redirects).toBeGreaterThan(500); // the scenario actually exercises the guard a lot
  });
});

describe('GS-ship-space-boundary — a ball flung FAR past the bulkheads flies free, never reeled back', () => {
  // The containment promise is "graphic IS physics": a ball is held in by a bulkhead you can SEE. A ball
  // only a few yards past the hull edge is caught by the wall; but a ball flung FAR out into open space —
  // beyond any bulkhead, through a torn-hull gap opening or clean past the wall ends — has NOTHING to
  // bounce off, so it flies FREE (stays lost) instead of being reeled back onto the fairway by an invisible
  // "far space boundary" (the bug: derelict drives were reaching 40–175 yd off the nearest wall out in the
  // void, then getting pulled back / ricocheting off nothing). Both the flight ricochet and the rest
  // backstop are gated on real wall proximity.
  const DR = CLUBS.find((c) => c.id === 'D')!;
  const segDistLocal = (p: Vec, a: Vec, b: Vec): number => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy || 1;
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
  };
  const nearestWall = (h: Hole, p: Vec): number => Math.min(...h.walls!.map((w) => segDistLocal(p, w.a, w.b)));
  const lost = (h: Hole, p: Vec) => { const k = lieAt(h, p); return k !== 'breach' && lieInfo(k).penalty === 'voidlost'; };

  it('containToDeck reels a near-wall miss back but leaves a deep-space ball free', () => {
    for (let s = 1; s < 25; s++) {
      const course = generateCourse(s + 500, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness: 0.8 });
      for (const hole of course.holes) {
        if (!(hole.walls?.length)) continue;
        const w = hole.walls[Math.floor(hole.walls.length / 2)]!;
        const mid: Vec = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
        // Just outside the bulkhead (a real near-edge miss) → tucked back onto the deck.
        const near: Vec = [mid[0] - w.normal[0] * 8, mid[1] - w.normal[1] * 8];
        if (lost(hole, near)) expect(containToDeck(hole, near), `seed ${s} near-wall not saved`).not.toBeNull();
        // Far out past the bulkhead into open space → nothing to bounce off, flies free. Only assert when
        // the point is genuinely far from EVERY wall (a folded section could put another rail nearby).
        const far: Vec = [mid[0] - w.normal[0] * 90, mid[1] - w.normal[1] * 90];
        if (lost(hole, far) && nearestWall(hole, far) > 30) expect(containToDeck(hole, far), `seed ${s} deep-space reeled back`).toBeNull();
      }
    }
  });

  it('no seeded derelict drive ricochets off empty space or is reeled back from far out', () => {
    let checked = 0;
    let flungFree = 0;
    for (let s = 1; s < 30; s++) {
      for (const wildness of [0.6, 0.9, 1]) {
        const course = generateCourse(s, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness });
        for (const hole of course.holes) {
          if (!(hole.walls?.length) || hole.par < 4) continue;
          const carryMult = biomeCarryMult(hole);
          const bend = hole.centreline[1] ?? hole.green;
          const fx = bend[0] - hole.tee[0];
          const fy = bend[1] - hole.tee[1];
          const fl = Math.hypot(fx, fy) || 1;
          // Aim hard sideways off the corridor — the shots that used to fly out into space and boomerang back.
          for (const ang of [-1.1, -0.8, 0.8, 1.1]) {
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const dx = (fx / fl) * ca - (fy / fl) * sa;
            const dy = (fx / fl) * sa + (fy / fl) * ca;
            const target: Vec = [hole.tee[0] + dx * 230, hole.tee[1] + dy * 230];
            for (let k = 0; k < 5; k++) {
              const rng = new Rng(5000 + s * 7 + k);
              const r = executeShot(hole, hole.tee, 'tee', target, DR, { carryMult, power: 1 }, rng);
              checked++;
              const fp = r.log.flightPath ?? [];
              // (1) NO flight bounce-vertex sits far from a real bulkhead — every ricochet is off a drawn wall.
              for (let i = 1; i < fp.length - 1; i++) {
                expect(nearestWall(hole, fp[i]!), `seed ${s} ang${ang} k${k}: flight bounce ${nearestWall(hole, fp[i]!).toFixed(0)}yd from any wall`).toBeLessThanOrEqual(28);
              }
              // (2) a ball that flew far out into open space is NOT reeled back: any off-hull rest far from
              // every bulkhead must stay LOST (containToDeck leaves it free), never pulled onto the fairway.
              const restLost = lost(hole, r.log.rest);
              if (restLost) {
                flungFree++;
              } else if (nearestWall(hole, r.log.rest) > 30) {
                // On-deck rest genuinely far from any wall is fine only if it's really on the deck (a wide
                // stretch near a gap), NOT a far-space point reeled in — prove it's not containToDeck-recoverable.
                expect(containToDeck(hole, r.log.rest), `seed ${s} ang${ang} k${k}: far on-deck rest still containable`).toBeNull();
              }
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
    expect(flungFree, 'sideways drives into open space actually fly free now').toBeGreaterThan(50);
  });

  it('a wall bounce lands many balls back on the deck, and awkward bounces shoot gaps into space', () => {
    // The two stated behaviours: (1) a bulkhead bounces the ball back onto the fairway; (2) an AWKWARD
    // bounce that redirects the ball out through a torn-hull gap between platforms flies free into space.
    // (The old "plain corridors almost never do (2)" sub-check retired with GS-ship-calm-space: the derelict
    // is now uniformly walled-space with hull-section + side-wall gaps at EVERY wildness, so a bounce shooting
    // a sanctioned gap is common and correct. The "no leak off a SOLID stretch" guarantee is the
    // resting-containment test.)
    let bouncedOnDeck = 0, bouncedThenLost = 0;
    for (let s = 1; s < 45; s++) {
      for (const wildness of [0.5, 0.8, 1]) {
        const course = generateCourse(s, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness });
        for (const hole of course.holes) {
          if (!(hole.walls?.length) || hole.par < 4) continue;
          const carryMult = biomeCarryMult(hole);
          const bend = hole.centreline[1] ?? hole.green;
          const fx = bend[0] - hole.tee[0];
          const fy = bend[1] - hole.tee[1];
          const fl = Math.hypot(fx, fy) || 1;
          for (const ang of [-0.6, -0.35, -0.15, 0.15, 0.35, 0.6]) {
            const ca = Math.cos(ang), sa = Math.sin(ang);
            const dx = (fx / fl) * ca - (fy / fl) * sa;
            const dy = (fx / fl) * sa + (fy / fl) * ca;
            const target: Vec = [hole.tee[0] + dx * 230, hole.tee[1] + dy * 230];
            for (let k = 0; k < 6; k++) {
              const rng = new Rng(3000 + s * 13 + k + Math.round(ang * 100));
              const r = executeShot(hole, hole.tee, 'tee', target, DR, { carryMult, power: 1 }, rng);
              const bounced = (r.log.wallHit?.bounces ?? 0) > 0;
              const restLost = lost(hole, r.log.rest);
              if (bounced && !restLost) bouncedOnDeck++;
              if (bounced && restLost) bouncedThenLost++;
            }
          }
        }
      }
    }
    // (1) walls bounce a lot of balls back onto the deck.
    expect(bouncedOnDeck, 'wall bounces that land back on the deck').toBeGreaterThan(500);
    // (2) awkward bounces DO shoot the platform gaps into space (fair, readable losses).
    expect(bouncedThenLost, 'awkward wall bounces that shoot a gap and are lost').toBeGreaterThan(200);
  });
});

describe('GS-ship-calm-space — the derelict is walled space at EVERY wildness, not just deep in', () => {
  // The ship is sealed corridors at all difficulties: off the mown hull deck is ALWAYS open space
  // (`shiprough`), even on a CALM stop, so the bulkheads always have space to bounce a ball back from —
  // a calm derelict is a tighter walled corridor, never a parkland-with-rough where a ball sails "over"
  // a decorative wall into fair rough. Other lost-rough worlds (void/cetus) keep the 0.55 threshold and
  // play as ordinary fair rough when calm (byte-for-byte unchanged).
  const offCorridorLies = (h: Hole) => {
    const i = Math.floor(h.centreline.length / 2);
    const a = h.centreline[Math.max(0, i - 1)]!, b = h.centreline[Math.min(h.centreline.length - 1, i + 1)]!;
    const mid = h.centreline[i]!;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    return [30, 55, 80].map((d) => lieAt(h, [mid[0] + nx * d, mid[1] + ny * d]));
  };

  it('a CALM derelict hole is space off the deck (walls contain), while calm void/cetus stay fair rough', () => {
    let shipHoles = 0, shipSpace = 0, shipFairRough = 0;
    for (let s = 1; s < 40; s++) {
      for (const wildness of [0.1, 0.25, 0.4]) { // all BELOW the old 0.55 lost-rough threshold
        const c = generateCourse(s, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness });
        for (const h of c.holes) {
          if (!(h.walls?.length) || h.par < 4) continue;
          shipHoles++;
          for (const k of offCorridorLies(h)) {
            if (k === 'shiprough') shipSpace++;
            else if (k === 'rough' || k === 'deeprough' || k === 'fescue') shipFairRough++;
          }
        }
      }
    }
    expect(shipHoles, 'calm derelict par-4/5 holes exist').toBeGreaterThan(50);
    // Off the deck is space, essentially never fair rough, even on a calm stop.
    expect(shipSpace).toBeGreaterThan(100);
    expect(shipFairRough, 'no fair rough off a calm derelict corridor').toBe(0);
    // Other lost-rough worlds are UNCHANGED: calm void/cetus off-fairway is ordinary fair rough, not lost.
    for (const biome of ['void-garden', 'cetus-deep']) {
      let fair = 0, space = 0;
      for (let s = 1; s < 30; s++) {
        const c = generateCourse(s, { biome, holes: 9, wildness: 0.3 });
        for (const h of c.holes) {
          if (h.par < 4) continue;
          for (const k of offCorridorLies(h)) {
            if (k === 'rough' || k === 'deeprough' || k === 'fescue') fair++;
            else if (lieInfo(k).penalty === 'voidlost') space++;
          }
        }
      }
      expect(fair, `calm ${biome} keeps fair rough`).toBeGreaterThan(space);
    }
  });
});

describe('GS-ship-walls — generation', () => {
  it('stamps walls on the derelict corridor, and NONE on other worlds', () => {
    const ship = generateCourse(4242, { biome: 'derelict-ship', holes: 9, wildness: 0.8 });
    // At least some derelict holes carry walls (the par 4/5 corridors).
    expect(ship.holes.some((h) => (h.walls?.length ?? 0) > 0)).toBe(true);
    // Every wall has a unit inward normal + real endpoints.
    for (const h of ship.holes) {
      for (const w of h.walls ?? []) {
        expect(Math.hypot(w.normal[0], w.normal[1])).toBeCloseTo(1, 3);
        expect(w.height).toBe(WALL_HEIGHT);
        expect(w.a).not.toEqual(w.b);
      }
    }
    for (const biome of ['verdant-station', 'void-garden', 'cetus-deep', 'scrap-belt']) {
      const c = generateCourse(4242, { biome, holes: 6, wildness: 0.8 });
      expect(c.holes.every((h) => !h.walls), biome).toBe(true);
    }
  });

  it('walls are deterministic and never break the structural validators', () => {
    for (let s = 0; s < 20; s++) {
      for (const wild of [0.3, 0.7, 1]) {
        const a = generateCourse(s + 90000, { biome: 'derelict-ship', holes: 4, wildness: wild });
        const b = generateCourse(s + 90000, { biome: 'derelict-ship', holes: 4, wildness: wild });
        expect(JSON.stringify(a.holes.map((h) => h.walls))).toBe(JSON.stringify(b.holes.map((h) => h.walls)));
        expect(validateCourse(a)).toEqual([]);
        expect(validateFairness(a)).toEqual([]);
        expect(validateCrossings(a)).toEqual([]);
      }
    }
  });
});

describe('GS-ship-corridor-fold — the corridor has no phantom void at a bend', () => {
  // A mitred offset (`p ± normal·halfWidth`) folds back on itself on the INSIDE of a bend once the
  // half-width outgrows the turn radius. `pointInPoly` fills even-odd, so the fold reads as a HOLE:
  // "not corridor" surrounded by corridor. On the derelict, off-corridor is open SPACE, so that hole is
  // a void the renderer never draws (it offsets with the fold-proof `dilateUnion`) and no bulkhead
  // stands on — measured on 13% of walled holes, up to 15 yd across. `unfoldOffsetEdge` splices the
  // loop out so the corner is cut by a straight chord instead.
  it('splices a folded offset edge back into a simple polyline, keeping its endpoints', () => {
    // A hairpin offset: the inner edge doubles back through itself.
    const folded: Vec[] = [[0, 0], [10, 0], [10, 10], [5, 10], [5, -5], [-5, -5]];
    const crosses = (pts: Vec[]): boolean => {
      for (let i = 0; i < pts.length - 1; i++)
        for (let j = i + 2; j < pts.length - 1; j++) if (segHit(pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!)) return true;
      return false;
    };
    expect(crosses(folded), 'the fixture really does fold').toBe(true);
    const clean = unfoldOffsetEdge(folded);
    expect(crosses(clean), 'the spliced edge is simple').toBe(false);
    expect(clean[0]).toEqual(folded[0]);
    expect(clean[clean.length - 1]).toEqual(folded[folded.length - 1]);
    // A polyline that never folds is returned untouched (every other world's ribbon is unaffected).
    const straight: Vec[] = [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]];
    expect(unfoldOffsetEdge(straight)).toEqual(straight);
  });

  it('a walled hole\'s corridor polygon barely ever disagrees with itself about what is deck', () => {
    // The precise measurement of the bug: sample the corridor and compare the two polygon fill rules.
    // NON-ZERO winding says "inside", EVEN-ODD (what `pointInPoly` implements, and therefore what the
    // sim plays) says "outside" — that difference IS the fold, and nothing else produces it.
    let holes = 0;
    let holesWithFold = 0;
    for (let s = 1; s <= 12; s++) {
      for (const wildness of [0.3, 0.6, 0.9]) {
        const c = generateCourse(s, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness });
        for (const hole of c.holes) {
          if (!hole.walls?.length) continue;
          holes++;
          const fw = hole.features.filter((f) => f.kind === 'fairway');
          let folded = false;
          for (let i = 1; i < 120 && !folded; i++) {
            const cp = centreAt(hole, i / 120);
            const a = centreAt(hole, (i - 1) / 120);
            const b = centreAt(hole, (i + 1) / 120);
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const L = Math.hypot(dx, dy) || 1;
            for (let k = -60; k <= 60 && !folded; k++) {
              const lat = k * 0.5;
              const p: Vec = [cp[0] + (-dy / L) * lat, cp[1] + (dx / L) * lat];
              const evenOdd = fw.some((f) => pointInPoly(p, f.poly));
              const nonZero = fw.some((f) => windingInside(p, f.poly));
              if (nonZero && !evenOdd) folded = true;
            }
          }
          if (folded) holesWithFold++;
        }
      }
    }
    expect(holes).toBeGreaterThan(100);
    // Measured 13% of walled holes before the splice (folds up to 15 yd across); the residue is the
    // genuinely SELF-OVERLAPPING corridor — a hairpin whose two limbs cross — which no single simple
    // band can model. Those are held harmless by the flight ricochet's "a bulkhead must actually be
    // standing there" rule below, not by the geometry.
    expect(holesWithFold / holes, 'mitre folds are gone').toBeLessThan(0.05);
  });
});

/** Point-in-polygon by the NON-ZERO winding rule — the `pointInPoly` (even-odd) counterpart, used only
 *  to detect where a polygon's two fill rules disagree (i.e. where it self-intersects). */
function windingInside(p: Vec, poly: Vec[]): boolean {
  let wind = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]![0], yi = poly[i]![1], xj = poly[j]![0], yj = poly[j]![1];
    const side = (xi - xj) * (p[1] - yj) - (p[0] - xj) * (yi - yj);
    if (yj <= p[1]) {
      if (yi > p[1] && side > 0) wind++;
    } else if (yi <= p[1] && side < 0) wind--;
  }
  return wind !== 0;
}

describe('GS-ship-wall-phantom — the ball only ever bounces off a bulkhead you can SEE', () => {
  const DR = CLUBS.find((c) => c.id === 'D')!;

  it('a line the aim cone reads CLEAR never ricochets, and every ricochet was shaded', () => {
    // The player report: "even if it's not going close to the wall it clips the bounce effect and goes
    // in a completely different direction than what it looks like it's going to do graphically" — the
    // cone had its OWN per-segment predictor while the sim resolved the deck boundary, and they
    // disagreed on 42% of real bounces. One source of truth now: the cone probes `firstSolidDeparture`.
    let cones = 0;
    let bounced = 0;
    let clearButBounced = 0;
    for (let s = 1; s <= 10; s++) {
      for (const wildness of [0.3, 0.6, 0.9]) {
        const course = generateCourse(s, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness });
        for (const hole of course.holes) {
          if (!hole.walls?.length || hole.par < 4) continue;
          const carryMult = biomeCarryMult(hole);
          const bend = hole.centreline[1] ?? hole.green;
          const fx = bend[0] - hole.tee[0];
          const fy = bend[1] - hole.tee[1];
          const fl = Math.hypot(fx, fy) || 1;
          for (const ang of [-0.25, -0.12, 0, 0.12, 0.25]) {
            const ca = Math.cos(ang);
            const sa = Math.sin(ang);
            const dx = (fx / fl) * ca - (fy / fl) * sa;
            const dy = (fx / fl) * sa + (fy / fl) * ca;
            const target: Vec = [hole.tee[0] + dx * 230, hole.tee[1] + dy * 230];
            const sp = shotSpread(hole, hole.tee, 'tee', target, DR, { carryMult, power: 1 });
            const shaded = sprayBlocking(hole, sp, undefined, { walls: hole.walls }).some((r) => r.src === 'walls');
            cones++;
            for (let k = 0; k < 6; k++) {
              const rng = new Rng(90000 + s * 37 + k + Math.round(wildness * 10) + Math.round(ang * 100));
              const r = executeShot(hole, hole.tee, 'tee', target, DR, { carryMult, power: 1 }, rng);
              if (!r.log.wallHit) continue;
              bounced++;
              if (!shaded) clearButBounced++;
            }
          }
        }
      }
    }
    expect(cones).toBeGreaterThan(200);
    expect(bounced, 'the corridor still bounces plenty of balls').toBeGreaterThan(500);
    expect(clearButBounced, 'no ricochet the drawn cone called clear').toBe(0);
  });

  it('every mid-air ricochet happens at a DRAWN bulkhead, not out over open deck', () => {
    // The ricochets that read as "it hit a wall that isn't there" turned at the ribbon's rounded END CAP
    // at a torn-hull gap lip, or in the notch inside a hard corner — 10–20 yd from any rail, on deck the
    // renderer draws with nothing standing on it.
    let bounces = 0;
    let farFromWall = 0;
    for (let s = 1; s <= 10; s++) {
      for (const wildness of [0.3, 0.6, 0.9]) {
        const course = generateCourse(s, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness });
        for (const hole of course.holes) {
          if (!hole.walls?.length || hole.par < 4) continue;
          const carryMult = biomeCarryMult(hole);
          const bend = hole.centreline[1] ?? hole.green;
          const fx = bend[0] - hole.tee[0];
          const fy = bend[1] - hole.tee[1];
          const fl = Math.hypot(fx, fy) || 1;
          for (const ang of [-0.3, -0.15, 0.15, 0.3]) {
            const ca = Math.cos(ang);
            const sa = Math.sin(ang);
            const dx = (fx / fl) * ca - (fy / fl) * sa;
            const dy = (fx / fl) * sa + (fy / fl) * ca;
            const target: Vec = [hole.tee[0] + dx * 230, hole.tee[1] + dy * 230];
            for (let k = 0; k < 6; k++) {
              const rng = new Rng(4100 + s * 17 + k + Math.round(ang * 100));
              const r = executeShot(hole, hole.tee, 'tee', target, DR, { carryMult, power: 1 }, rng);
              const path = r.log.flightPath;
              if (!r.log.wallHit || !path) continue;
              // Every interior vertex of the flight polyline is a bulkhead impact.
              for (let i = 1; i < path.length - 1; i++) {
                bounces++;
                let d = Infinity;
                for (const w of hole.walls) d = Math.min(d, segDist(path[i]!, w.a, w.b));
                if (d > 10) farFromWall++;
              }
            }
          }
        }
      }
    }
    expect(bounces).toBeGreaterThan(300);
    expect(farFromWall, 'no ricochet off empty deck').toBe(0);
  });

  it('a shot CARRYING open space to deck beyond it is never slapped back at the lip', () => {
    // Deck ahead on your line is a promise the ball flies on — a torn-hull gap between hull sections, or
    // the notch inside a corner when you cut the dogleg. Fire straight down each corridor's own
    // centreline: the line is over drawn deck at both ends, so it may never register a bounce.
    let checked = 0;
    for (let s = 1; s <= 14; s++) {
      for (const wildness of [0.3, 0.6, 0.9]) {
        const course = generateCourse(s, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness });
        for (const hole of course.holes) {
          if (!hole.walls?.length || hole.par < 4) continue;
          for (let i = 1; i <= 5; i++) {
            const from = centreAt(hole, i / 8);
            const to = centreAt(hole, i / 8 + 0.2);
            if (isSpace(hole, from) || isSpace(hole, to)) continue;
            // The straight line leaves the deck somewhere and comes back — a carry, not a wall.
            let leaves = false;
            for (let k = 1; k < 60; k++) {
              const t = k / 60;
              if (isSpace(hole, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t])) leaves = true;
            }
            if (!leaves) continue;
            checked++;
            const sf = shipFlightPath(hole, from, to);
            expect(sf.bounces, `seed ${s} w${wildness} carry over a gap was bounced at the lip`).toBe(0);
            expect(sf.landing[0]).toBeCloseTo(to[0], 6);
            expect(sf.landing[1]).toBeCloseTo(to[1], 6);
          }
        }
      }
    }
    expect(checked, 'the scenario really does cross open space').toBeGreaterThan(20);
  });
});

describe('GS-ship-breach-restore — the derelict actually has acid-etched deck breaches', () => {
  it('breaches survive generation, sit ON the deck, and never break the fairness validators', () => {
    // GS-ship-calm-space armed the derelict's lost-rough at EVERY wildness, which quietly routed every
    // derelict hole through `clearVoidHazards` — a filter written for island-pad worlds that drops every
    // penalty hazard outright. It deleted 100% of the ship's breaches: "there doesn't appear to be any
    // acid etched hole hazards that show up at all". Measured before the fix: 0 breaches in 2,160 holes.
    let holes = 0;
    let withBreach = 0;
    let breaches = 0;
    for (let s = 1; s <= 20; s++) {
      for (const wildness of [0.15, 0.4, 0.7, 1]) {
        const course = generateCourse(s, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness });
        expect(validateCourse(course)).toEqual([]);
        expect(validateFairness(course)).toEqual([]);
        expect(validateCrossings(course)).toEqual([]);
        for (const hole of course.holes) {
          if (!hole.walls?.length) continue;
          holes++;
          const mine = hole.hazards.filter((h) => h.kind === 'breach');
          if (mine.length) withBreach++;
          breaches += mine.length;
          for (const b of mine) {
            // A breach is a hole eaten through the DECK — it must sit on the corridor, not float in space
            // (that is the one thing `clearVoidHazards` still does for a walled hole).
            const onDeck = hole.features.some(
              (f) => (f.kind === 'fairway' || f.kind === 'green' || f.kind === 'tee') && b.poly.some((v) => pointInPoly(v, f.poly)),
            );
            expect(onDeck, `seed ${s} w${wildness} breach floating in space`).toBe(true);
          }
        }
      }
    }
    expect(holes).toBeGreaterThan(500);
    expect(breaches, 'the ship is pocked with acid breaches again').toBeGreaterThan(500);
    expect(withBreach / holes, 'most walled holes carry at least one').toBeGreaterThan(0.6);
  });

  it('a breach is a real penalty the ball can fall through, and is NOT space (the walls never save it)', () => {
    const course = generateCourse(7, { biome: 'derelict-ship', themeId: 'derelict', holes: 9, wildness: 0.8 });
    const hole = course.holes.find((h) => h.walls?.length && h.hazards.some((z) => z.kind === 'breach'))!;
    expect(hole).toBeTruthy();
    const b = hole.hazards.find((z) => z.kind === 'breach')!;
    let cx = 0;
    let cy = 0;
    for (const v of b.poly) {
      cx += v[0] / b.poly.length;
      cy += v[1] / b.poly.length;
    }
    const centre: Vec = [cx, cy];
    expect(lieAt(hole, centre)).toBe('breach');
    expect(lieInfo('breach').penalty).toBe('voidlost');
    // The containment backstop must LEAVE a breach alone — it is a deliberate hazard on the deck, not a
    // ball that slipped off the hull, so `containToDeck` may never tuck it back into play.
    expect(containToDeck(hole, centre)).toBeNull();
  });
});
