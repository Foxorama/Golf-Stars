import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness, validateCrossings } from '../src/sim/course/generate';
import { validateCourse } from '../src/sim/course/contract';
import { wallReflect, wallFlightHit, wallRollHit, wallRollBounce, segHit, WALL_HEIGHT, type ShipWall } from '../src/sim/walls';
import { rollOut, shotSpread, sprayBlocking } from '../src/sim/round';
import { flightProfileOf } from '../src/sim/flight';
import { CLUBS } from '../src/sim/clubs';
import type { Hole } from '../src/sim/course/contract';
import type { Vec } from '../src/sim/course/contract';

// GS-ship-walls: the derelict world's collidable metal corridor bulkheads — every ball leaving the deck
// sideways bounces back; NOTHING clears them (they stand 72 yd, above the 60-yd shot-apex cap); hit two
// walls, bounce twice. Pure geometry, zero rng, stamped by the generator from the ribbon edges. These
// guard the reflect maths, the arc-height gate, multi-bounce, generation (present on the derelict,
// absent + byte-identical everywhere else), and determinism.

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

  it('a REAL bulkhead (WALL_HEIGHT) cannot be cleared — a full-power lofted wedge still bounces', () => {
    // WALL_HEIGHT stands above the 60-yd apex cap, so no club at any power flies over. A high, short
    // wedge (the loftiest arc in the game) crossing the bulkhead must still ricochet back onto the deck.
    const bulk: ShipWall = { a: [-100, 60], b: [100, 60], normal: [0, -1], height: WALL_HEIGHT };
    for (const club of ['SW', 'PW', '9i', 'D'] as const) {
      const p = flightProfileOf(club);
      const hit = wallFlightHit([bulk], [0, 0], [0, 120], 0, 120, 120, p);
      expect(hit, club).not.toBeNull();
      expect(hit!.dir[1], club).toBeLessThan(0); // bounced back toward the deck
    }
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
      biomeMods: { carry: 1, roll: 1 },
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
