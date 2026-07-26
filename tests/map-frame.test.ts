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
import { bandCentreBias, clearOfPanelBias, fitFrame, holeProjector } from '../src/render/project';
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

/**
 * GS-play-hud-space — the play screen's controls FLOAT over a full-bleed map, so the camera has to
 * frame the golf into the strip BETWEEN the info chip and the control panel. The reported bug: the
 * ball flew at a flat 0.84 of the frame, which on a 390×844 phone is y≈709 against a panel starting
 * at y≈645 — the ball spent the whole shot behind the controls.
 */
describe('framing the ball clear of the control panel', () => {
  const MAX = 0.84; // the classic bias — as deep as the framing was ever tuned to go
  const H = 844;

  it('lands the ball clear of the panel on the reported viewport', () => {
    const panelTop = 670; // measured on a 390×844 phone after the density pass
    const bias = clearOfPanelBias(panelTop, H, 28, MAX);
    expect(bias * H).toBeCloseTo(panelTop - 28, 6);
    expect(bias * H).toBeLessThan(panelTop); // …which is the whole point
  });

  it('never draws the ball under the panel, for any panel height worth having', () => {
    for (let panelTop = 430; panelTop <= 820; panelTop += 10) {
      const bias = clearOfPanelBias(panelTop, H, 28, MAX);
      // Either the ball is genuinely clear, or the panel is so tall that the 0.5 floor bit — and even
      // then the floor must not be a regression on the old flat constant.
      expect(bias * H <= panelTop - 28 + 1e-9 || bias === 0.5).toBe(true);
      expect(bias).toBeLessThanOrEqual(MAX);
      expect(bias).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('keeps the ball LOW — it never rises above the middle of the frame', () => {
    // A high ball would fill the view with ground BEHIND the shot; the low ball is what shows the hole.
    expect(clearOfPanelBias(300, H, 28, MAX)).toBe(0.5);
    expect(clearOfPanelBias(0, H, 28, MAX)).toBe(0.5);
  });

  it('never goes DEEPER than the classic bias, however short the panel', () => {
    expect(clearOfPanelBias(844, H, 28, MAX)).toBeCloseTo(MAX, 6);
    expect(clearOfPanelBias(2000, H, 28, MAX)).toBe(MAX);
  });

  it('falls back to the classic bias when the HUD is unmeasurable', () => {
    expect(clearOfPanelBias(NaN, H, 28, MAX)).toBe(MAX);
    expect(clearOfPanelBias(670, 0, 28, MAX)).toBe(MAX);
  });

  it('centres the putt read in the clear band, not in the frame', () => {
    // Measured putt screen: chip ends at 103, panel starts at 624 → band centre 363.5, not 422.
    const bias = bandCentreBias(103, 624, H);
    expect(bias * H).toBeCloseTo(363.5, 1);
    expect(bias).toBeLessThan(0.5); // above the frame's centre, i.e. out of the tall panel's way
    // Degenerate bands fall back to the frame centre rather than inventing a framing.
    expect(bandCentreBias(600, 100, H)).toBe(0.5);
    expect(bandCentreBias(103, 624, 0)).toBe(0.5);
  });
});
