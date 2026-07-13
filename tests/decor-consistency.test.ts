import { describe, it, expect } from 'vitest';
import { generateCourse } from '../src/sim/course/generate';
import { shipDriftModel, driftPos } from '../src/render/shipDrift';
import type { Hole } from '../src/sim/course/contract';

/**
 * DECOR VIEW-INVARIANCE (GS-decor-view-states).
 *
 * The animated world decor (weather, the Cetus river, the derelict's drifting hull junk + sections) is
 * drawn independently on the aim/putt overlay AND the watch play view, through DIFFERENT projectors and,
 * historically, a different clock. Any decor whose position/scale is NOT a pure function of
 * `(worldPosition, wallClock)` renders differently in each of the four view states and JUMPS when the
 * camera switches. The worst offender was the derelict's big ship SECTIONS, once anchored to a SCREEN
 * fraction (`fx*W, fy*H`, size `sizeFrac*min(W,H)`) so they ignored the world entirely.
 *
 * These guard the model half of the fix (the render half is proven end-to-end by the headless-Chromium
 * IoU probe in tests/build.test.ts): the drift MODEL is deterministic, purely course-space, and holds no
 * screen-space state — so the projector is the ONLY thing that maps it to a view, and it can't diverge.
 */

function derelictHole(dist = 14): Hole {
  const course = generateCourse(20_260_627, { biome: 'derelict-ship', holes: 24, distanceFromStart: dist });
  return course.holes.find((h) => h.par >= 4) ?? course.holes[0]!;
}

describe('ship-drift decor is world-anchored (mode-invariant by construction)', () => {
  it('the model is deterministic — a pure function of the hole', () => {
    const hole = derelictHole();
    expect(shipDriftModel(hole)).toEqual(shipDriftModel(hole));
  });

  it('has drifting chunks AND large hull sections on a derelict par 4/5', () => {
    const m = shipDriftModel(derelictHole());
    expect(m).not.toBeNull();
    expect(m!.chunks.length).toBeGreaterThan(0);
    expect(m!.sections.length).toBe(3); // bridge + 2 (wing/engine)
    expect(m!.sections.some((s) => s.name)).toBe(true); // the bridge carries the ship name
  });

  it('sections carry NO screen-space fields — the exact regression that caused the jump', () => {
    const m = shipDriftModel(derelictHole())!;
    for (const s of m.sections) {
      // The bug shape: fx/fy screen fractions, vx/vy screen-px velocities, sizeFrac of min(W,H).
      for (const dead of ['fx', 'fy', 'vx', 'vy', 'sizeFrac']) {
        expect(s, `section must not reintroduce screen-space field "${dead}"`).not.toHaveProperty(dead);
      }
      // The world-anchored shape it must have instead.
      expect(s).toHaveProperty('base');
      expect(s).toHaveProperty('sizeYd');
      expect(typeof s.sizeYd).toBe('number');
    }
  });

  it('every element is seeded in COURSE space (yards near the hole), never a [0,1] screen fraction', () => {
    const hole = derelictHole();
    const m = shipDriftModel(hole)!;
    const { band } = m;
    const inBand = (p: [number, number]): boolean =>
      p[0] >= band.x0 && p[0] <= band.x0 + band.w && p[1] >= band.y0 && p[1] <= band.y0 + band.h;
    // The band spans real course yards around the hole — not a unit screen box.
    expect(band.w).toBeGreaterThan(20);
    expect(band.h).toBeGreaterThan(20);
    for (const s of m.sections) expect(inBand(s.base), 'section base is a course point in the band').toBe(true);
    for (const c of m.chunks) expect(inBand(c.base), 'chunk base is a course point in the band').toBe(true);
  });

  it('driftPos is a pure, projector-free function that wraps within the band', () => {
    const m = shipDriftModel(derelictHole())!;
    const { band } = m;
    const s = m.sections[0]!;
    // Deterministic: same inputs → same output (no hidden state / rng / clock read).
    expect(driftPos(s.base, s.dir, s.spd, band, 3.2)).toEqual(driftPos(s.base, s.dir, s.spd, band, 3.2));
    // The drift actually moves the piece over time…
    const p0 = driftPos(s.base, s.dir, s.spd, band, 0);
    const p1 = driftPos(s.base, s.dir, s.spd, band, 10);
    expect(p0[0] !== p1[0] || p0[1] !== p1[1]).toBe(true);
    // …but always stays inside the wrap band (no drift off to infinity — a loop that reads the same in
    // every view). Check across a long span of wall-clock time.
    for (let t = 0; t < 5_000; t += 137) {
      const p = driftPos(s.base, s.dir, s.spd, band, t);
      expect(p[0]).toBeGreaterThanOrEqual(band.x0 - 1e-6);
      expect(p[0]).toBeLessThanOrEqual(band.x0 + band.w + 1e-6);
      expect(p[1]).toBeGreaterThanOrEqual(band.y0 - 1e-6);
      expect(p[1]).toBeLessThanOrEqual(band.y0 + band.h + 1e-6);
    }
  });
});
