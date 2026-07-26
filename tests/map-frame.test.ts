/**
 * GS-play-fullframe — the play map's viewBox must MATCH its container's aspect, or the SVG's default
 * meet fit centres the map and leaves dead bands of page background at the ends of the longer axis
 * (the reported "black borders", 75px top AND bottom on a 390×844 phone).
 *
 * The bar these tests hold: the frame fills the container on every viewport, it never SHRINKS the
 * design frame (which would crop the ball off the screen), and a container that already matches the
 * design aspect is left exactly alone — so the reference 9:16 phone still draws what it always drew.
 */
import { describe, it, expect } from 'vitest';
import { fitFrame, holeProjector } from '../src/render/project';
import { generateCourse } from '../src/sim/course/generate';

const DW = 360;
const DH = 640;

// A spread of real devices + the awkward ones: portrait phones, a square, tablets, desktop landscape.
const VIEWPORTS: [number, number][] = [
  [360, 640], // the design frame itself
  [390, 844], // iPhone 14
  [412, 915], // Pixel 8
  [375, 812],
  [320, 568], // the smallest phone still supported
  [768, 1024], // tablet portrait
  [500, 500], // square
  [1280, 800], // desktop landscape
  [1920, 1080],
  [844, 390], // a phone rotated
];

describe('fitFrame', () => {
  it('leaves a container that already matches the design aspect untouched', () => {
    expect(fitFrame(DW, DH, DW, DH)).toEqual({ width: DW, height: DH });
    // Any exact multiple of the design aspect is the same frame — a bigger 9:16 phone only scales.
    expect(fitFrame(DW * 2, DH * 2, DW, DH)).toEqual({ width: DW, height: DH });
    expect(fitFrame(180, 320, DW, DH)).toEqual({ width: DW, height: DH });
  });

  it('matches the container aspect on every viewport, so nothing letterboxes', () => {
    for (const [cw, ch] of VIEWPORTS) {
      const f = fitFrame(cw, ch, DW, DH);
      expect(f.width / f.height).toBeCloseTo(cw / ch, 2);
    }
  });

  it('only ever GROWS the design frame — the drawn scale is unchanged, never cropped', () => {
    for (const [cw, ch] of VIEWPORTS) {
      const f = fitFrame(cw, ch, DW, DH);
      expect(f.width).toBeGreaterThanOrEqual(DW);
      expect(f.height).toBeGreaterThanOrEqual(DH);
      // Exactly one axis grows: the frame is the design frame stretched on the starved side only.
      expect(f.width === DW || f.height === DH).toBe(true);
    }
  });

  it('reclaims the dead bands the old fixed frame lost on a tall phone', () => {
    // 390×844 through the OLD fixed 360×640 frame: meet scale 1.083 → 693px of map in an 844px box.
    const meet = Math.min(390 / DW, 844 / DH);
    expect(Math.round((844 - DH * meet) / 2)).toBe(75); // 75px band top AND bottom — the black bars
    const f = fitFrame(390, 844, DW, DH);
    expect(Math.round(f.height * meet)).toBe(844); // the fitted frame fills the box exactly
  });

  it('survives an unmeasurable container', () => {
    expect(fitFrame(0, 0, DW, DH)).toEqual({ width: DW, height: DH });
    expect(fitFrame(NaN, 844, DW, DH)).toEqual({ width: DW, height: DH });
    expect(fitFrame(-10, 844, DW, DH)).toEqual({ width: DW, height: DH });
  });
});

describe('the fitted frame does not move the camera', () => {
  const course = generateCourse(4242, { holes: 6, biome: 'verdant', themeId: 'orion' });
  const hole = course.holes[0]!;

  it('frames the corridor at the identical scale — the extra height is only MORE hole', () => {
    const opts = { focus: hole.tee, viewRadius: 120, focusBias: 0.84, up: [0, 1] as [number, number] };
    const before = holeProjector(hole, { width: DW, height: DH, ...opts });
    const f = fitFrame(390, 844, DW, DH);
    const after = holeProjector(hole, { ...f, ...opts });
    // Focus mode is width-limited on a portrait frame, and the frame's width is untouched.
    expect(after.scale).toBeCloseTo(before.scale, 10);
    // The focus point still sits at the same fraction of the frame, so it lands at the same place
    // on screen once the browser scales the (now taller) viewBox into the same container.
    expect(after.project(hole.tee)[1] / after.height).toBeCloseTo(before.project(hole.tee)[1] / before.height, 6);
  });
});
