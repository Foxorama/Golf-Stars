import { describe, it, expect } from 'vitest';
import { generateCourse, validateFairness, validateCrossings } from '../src/sim/course/generate';
import { validateCourse } from '../src/sim/course/contract';
import { wallReflect, wallFlightHit, wallRollHit, seatInsideWall, segHit, WALL_HEIGHT, type ShipWall } from '../src/sim/walls';
import { flightProfileOf } from '../src/sim/flight';
import { executeShot, shotSpread, sprayBlocking } from '../src/sim/round';
import { CLUBS } from '../src/sim/clubs';
import { Rng } from '../src/sim/rng';
import type { Vec, Hole } from '../src/sim/course/contract';

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

/** A wildness-1 derelict par 4/5 with corridor walls — the deep, lost-rough stop a player actually meets. */
function lostWalledHole(): Hole {
  const c = generateCourse(4242, { biome: 'derelict-ship', holes: 9, wildness: 1 });
  const h = c.holes.find((h) => (h.walls?.length ?? 0) > 0 && h.par >= 4);
  if (!h) throw new Error('no walled derelict par 4/5');
  return h;
}

describe('GS-ship-walls — a bounce SAVES the ball (never lost to space)', () => {
  const driver = CLUBS.find((c) => c.id === 'D')!;

  it('a ball that ricochets off a wall is seated back on the deck, not scored lost', () => {
    const hole = lostWalledHole();
    let bounced = 0;
    let lostAfterBounce = 0;
    for (let i = 0; i < 400; i++) {
      const rng = new Rng('wallsave' + i);
      const res = executeShot(hole, hole.tee, 'tee', hole.green, driver, {}, rng);
      if (res.log.wallHit) {
        bounced++;
        // The whole point of the bulkheads: a bounce only ever SAVES a ball. A ricochet that came to
        // rest ON the wall line (the corridor edge) used to read as off-deck (lost to space) — the bug.
        if (res.log.penalty === 'voidlost') lostAfterBounce++;
      }
    }
    expect(bounced).toBeGreaterThan(0);
    expect(lostAfterBounce).toBe(0);
  });
});

describe('seatInsideWall', () => {
  it('nudges a point INWARD along the wall normal', () => {
    const wall: ShipWall = { a: [-10, 20], b: [10, 20], normal: [0, -1], height: WALL_HEIGHT };
    const seated = seatInsideWall(wall, [0, 20], 3);
    expect(seated[1]).toBe(17); // moved 3 yd along the −y inward normal, off the wall line
    expect(seated[0]).toBe(0);
  });
});

describe('GS-ship-walls — the aim cone reads the walls', () => {
  const driver = CLUBS.find((c) => c.id === 'D')!;

  it('shades a wall-blocked run (src:walls) that vanishes without the walls opt', () => {
    const hole = lostWalledHole();
    // A full driver down a bending, narrow ship corridor will ricochet off a wall somewhere in its cone.
    const s = shotSpread(hole, hole.tee, 'tee', hole.green, driver, { power: 1 });
    const withWalls = sprayBlocking(hole, s, undefined, { walls: hole.walls });
    const without = sprayBlocking(hole, s, undefined, {});
    expect(withWalls.some((r) => r.src === 'walls')).toBe(true);
    // The derelict grows nothing, so the ONLY blocker is the bulkheads — take them away and the cone clears.
    expect(without.length).toBe(0);
  });
});

describe('GS-ship-interior — deck breaches survive on LOST derelict holes', () => {
  it('a breach on a hull-section pad is kept (not stripped as void junk)', () => {
    let lost = 0;
    let withBreach = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const c = generateCourse(seed * 137, { biome: 'derelict-ship', holes: 9, wildness: 0.9 });
      for (const h of c.holes) {
        if (!(h.biomeMods?.some((m) => m.kind === 'roughLie') ?? false)) continue; // lost holes only
        lost++;
        if (h.hazards.some((z) => z.kind === 'breach')) withBreach++;
      }
    }
    expect(lost).toBeGreaterThan(0);
    // Most lost par 4/5 corridors keep at least one deck breach (island par 3s have no corridor).
    expect(withBreach).toBeGreaterThan(lost * 0.4);
  });
});
