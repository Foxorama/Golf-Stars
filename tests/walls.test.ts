import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness, validateCrossings } from '../src/sim/course/generate';
import { validateCourse } from '../src/sim/course/contract';
import { wallReflect, wallFlightHit, wallRollHit, segHit, WALL_HEIGHT, type ShipWall } from '../src/sim/walls';
import { flightProfileOf } from '../src/sim/flight';
import type { Vec } from '../src/sim/course/contract';

// GS-ship-walls: the derelict world's collidable metal corridor walls — a low ball bounces back onto the
// deck, a lofted shot clears; hit two walls, bounce twice. Pure geometry, zero rng, stamped by the
// generator from the ribbon edges. These guard the reflect maths, the arc-height gate, multi-bounce,
// generation (present on the derelict, absent + byte-identical everywhere else), and determinism.

const prof = flightProfileOf('D');

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

describe('GS-ship-walls — flight ricochet', () => {
  // A wall running along x at y=20, inward normal pointing back toward the deck (−y).
  const wall: ShipWall = { a: [-100, 20], b: [100, 20], normal: [0, -1], height: WALL_HEIGHT };

  it('a low shot crossing the wall bounces back inward toward the deck', () => {
    const low = wallFlightHit([wall], [0, 0], [0, 40], 0, 40, 240, flightProfileOf('D'));
    expect(low).not.toBeNull();
    expect(low!.dir[1]).toBeLessThan(0); // bounced back toward the deck (−y)
    expect(low!.bounces).toBe(1);
  });

  it('the wall HEIGHT gates the bounce: a shot below it bounces, one over it clears', () => {
    const from: Vec = [0, 0];
    const landing: Vec = [0, 240];
    // A tall wall mid-flight always catches (arc height < 999 everywhere); a ~zero wall is always cleared.
    const tall: ShipWall = { a: [-100, 120], b: [100, 120], normal: [0, -1], height: 999 };
    const flat: ShipWall = { a: [-100, 120], b: [100, 120], normal: [0, -1], height: 0.1 };
    expect(wallFlightHit([tall], from, landing, 0, 240, 240, prof)).not.toBeNull();
    expect(wallFlightHit([flat], from, landing, 0, 240, 240, prof)).toBeNull();
  });

  it('hits TWO facing walls → bounces twice', () => {
    // A narrow chute: a right wall (inward −x) then a left wall (inward +x). Tall so the gate never
    // interferes — this isolates the multi-bounce geometry.
    const rightWall: ShipWall = { a: [6, -100], b: [6, 100], normal: [-1, 0], height: 999 };
    const leftWall: ShipWall = { a: [-6, -100], b: [-6, 100], normal: [1, 0], height: 999 };
    const hit = wallFlightHit([rightWall, leftWall], [0, 0], [20, 20], 45, 28, 240, prof);
    expect(hit).not.toBeNull();
    expect(hit!.bounces).toBe(2);
  });

  it('no walls / a shot that never crosses one flies clean', () => {
    expect(wallFlightHit([], [0, 0], [0, 40], 0, 40, 240, prof)).toBeNull();
    // Landing short of the wall → no crossing.
    expect(wallFlightHit([wall], [0, 0], [0, 10], 0, 10, 240, prof)).toBeNull();
  });

  it('wallRollHit stops a ball rolling OUTWARD into a wall, ignores one rolling inward', () => {
    expect(wallRollHit([wall], [0, 18], [0, 25])).toBe(wall); // rolling out (+y) into the −y-normal wall
    expect(wallRollHit([wall], [0, 25], [0, 18])).toBeNull(); // rolling inward (−y) → no stop
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
