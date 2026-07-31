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
import { bandCentreBias, clearOfPanelBias, fitFrame, holeProjector, radiusForSpan } from '../src/render/project';
import { generateCourse } from '../src/sim/course/generate';
import { flightProfileOf, rollFractionFor } from '../src/sim/flight';
import { resolve } from 'node:path';
import { chromePath } from './chromium';

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

  /**
   * GS-decision-frame-carry — the other end of the band. `clearOfPanelBias` framed the ball clear of
   * the BOTTOM panel and nothing ever read `band.top`, so the camera drew the far end of the shot
   * straight through the info bar: measured on the built game, a driver's furthest resting point
   * landed 2px under the bar on the itch embed's 820×760 play frame and 96px behind it on a 320×568
   * phone. Two faults compounded — the reach was a constant that knew nothing about the HUD, and it
   * was fed a CARRY when the ball finishes at the TOTAL.
   */
  describe('framing the whole shot into the clear band', () => {
    const SHOT_BAND_FILL = 0.8; // app.ts's constant — the headroom left above the ball's far end
    const PAD = 24; // holeProjector's default padding

    /** app.ts `decisionReach`, reproduced from its two measured inputs (frame + band). */
    const reachFor = (
      reachYd: number,
      frame: { width: number; height: number },
      bandTopPx: number,
      containerH: number,
      bias: number,
    ) => {
      const span = (bias * frame.height - (bandTopPx * frame.height) / containerH) * SHOT_BAND_FILL;
      return Math.max(30, radiusForSpan(reachYd, span, frame.width));
    };

    /** Where a point `reachYd` up-screen lands, in CONTAINER px from the top. */
    const landingPx = (
      reachYd: number,
      R: number,
      frame: { width: number; height: number },
      containerH: number,
      bias: number,
    ) => {
      const scale = Math.min((frame.width - 2 * PAD) / (2 * R), (frame.height - 2 * PAD) / (2 * R));
      return ((bias * frame.height - reachYd * scale) * containerH) / frame.height;
    };

    // The reported viewports, with the info bar / control panel measured off the built game.
    // The play frame is capped to `--gs-portrait-w` (0.52·dvh), so a desktop container is a strip.
    const CASES: [string, number, number, number, number][] = [
      // label, container w, container h, info-bar bottom, panel top
      ['iPhone 14', 390, 844, 98, 770],
      ['320×568 phone', 320, 568, 134, 514],
      ['itch embed', 395, 760, 98, 686],
      ['1366×768 laptop', 399, 768, 98, 694],
      ['1920×1080 desktop', 562, 1080, 98, 1006],
    ];

    it('keeps the ball’s furthest resting place clear of the info bar on every viewport', () => {
      // A driver: the longest club in the bag AND the biggest run (runFrac 14%), so it is the shot
      // that was clipping. The carry is the far edge of the cone, i.e. the luckiest strike.
      const carryHigh = 300;
      const total = carryHigh * (1 + rollFractionFor(flightProfileOf('D'), 250));
      expect(total).toBeGreaterThan(carryHigh * 1.1); // the run is real — this is the whole finding

      for (const [label, cw, ch, barBottom, panelTop] of CASES) {
        const frame = fitFrame(cw, ch, DW, DH);
        const bias = clearOfPanelBias(panelTop, ch, 28, 0.84);
        const R = reachFor(total, frame, barBottom, ch, bias);
        const y = landingPx(total, R, frame, ch, bias);
        expect(y, `${label}: the ball's resting place is drawn behind the info bar`).toBeGreaterThan(barBottom);
        // …and the ball itself is still clear of the control panel, i.e. the WHOLE shot is in the band.
        expect(bias * ch, `${label}: the ball is behind the control panel`).toBeLessThan(panelTop);
      }
    });

    it('frames on the TOTAL — a carry-framed camera clipped the run off the top', () => {
      // The bug, held in place: framing the same driver on its CARRY and then asking where the ball
      // actually FINISHES puts it behind the bar on the short viewports.
      const carryHigh = 300;
      const total = carryHigh * (1 + rollFractionFor(flightProfileOf('D'), 250));
      for (const [label, cw, ch, barBottom, panelTop] of CASES) {
        const frame = fitFrame(cw, ch, DW, DH);
        const bias = clearOfPanelBias(panelTop, ch, 28, 0.84);
        const carryFramed = reachFor(carryHigh, frame, barBottom, ch, bias);
        const totalFramed = reachFor(total, frame, barBottom, ch, bias);
        expect(totalFramed, `${label}: framing on the total must zoom OUT, never in`).toBeGreaterThan(carryFramed);
        // Under the carry framing the carry lands exactly on the band's fill line and the run runs on
        // past it — which on these viewports is into the bar.
        const restUnderCarryFraming = landingPx(total, carryFramed, frame, ch, bias);
        const restUnderTotalFraming = landingPx(total, totalFramed, frame, ch, bias);
        expect(restUnderTotalFraming).toBeGreaterThan(restUnderCarryFraming);
      }
    });

    it('adapts to the room the HUD leaves — a constant cannot', () => {
      // The point of reading the band: the SAME shot needs a wider view where the HUD eats more of
      // the screen. A tall phone leaves far more span than a short desktop window, so a single
      // constant is either too tight there or wasteful here.
      const frames = CASES.map(([label, cw, ch, bar, panel]) => {
        const frame = fitFrame(cw, ch, DW, DH);
        const bias = clearOfPanelBias(panel, ch, 28, 0.84);
        return { label, R: reachFor(300, frame, bar, ch, bias) };
      });
      const iphone = frames.find((f) => f.label === 'iPhone 14')!;
      const small = frames.find((f) => f.label === '320×568 phone')!;
      expect(small.R).toBeGreaterThan(iphone.R * 1.2);
    });

    it('never returns a radius tighter than the short-shot floor', () => {
      const frame = fitFrame(390, 844, DW, DH);
      const bias = clearOfPanelBias(770, 844, 28, 0.84);
      expect(reachFor(40, frame, 98, 844, bias)).toBe(30); // a chip stays at the readable floor
      expect(reachFor(0, frame, 98, 844, bias)).toBe(30);
    });
  });

  describe('radiusForSpan', () => {
    it('puts the far end of the shot exactly `span` frame units above the ball', () => {
      const frame = fitFrame(390, 844, DW, DH);
      const course = generateCourse(4242, { holes: 6, biome: 'verdant', themeId: 'orion' });
      const hole = course.holes[0]!;
      const bias = 0.84;
      const span = 400;
      const R = radiusForSpan(280, span, frame.width);
      const proj = holeProjector(hole, { ...frame, focus: hole.tee, viewRadius: R, focusBias: bias, up: [0, 1] });
      // 280 yards up-screen from the tee, in the projector's own rotated space.
      const ballY = proj.project(hole.tee)[1];
      expect(ballY).toBeCloseTo(bias * frame.height, 6);
      expect(ballY - 280 * proj.scale).toBeCloseTo(ballY - span, 6);
    });

    it('is degenerate-safe', () => {
      expect(radiusForSpan(0, 400, 360)).toBe(0);
      expect(radiusForSpan(280, 0, 360)).toBe(0);
      expect(radiusForSpan(280, 400, 40)).toBe(0); // a frame narrower than its own padding
      expect(radiusForSpan(280, -5, 360)).toBe(0);
    });
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

/**
 * The wiring, in a real browser (GS-decision-frame-carry). Everything above proves the geometry; only
 * this proves the app FEEDS it — that `decisionReach` is reached from the decision render with the
 * shot's total and the measured band. The bug it holds down was invisible to the pure suite and to
 * the eye on the composed-for phone: it only bit on the short viewports (the itch embed's 820×760
 * frame, a 1366×768 laptop, a 320×568 phone), which is where the play-test found it.
 *
 * Measured off the drawn aim overlay — the spray cone + its carry labels + the run-out line — because
 * that IS what the player is looking at when they decide.
 */
describe.runIf(chromePath)('the drawn aim cone clears the info bar (GS-decision-frame-carry)', () => {
  const dist = resolve(__dirname, '../dist/index.html');
  // The two that were clipping. The composed-for phone was already fine and is covered above.
  const CASES: [string, number, number][] = [
    ['itch embed 820×760', 820, 760],
    ['320×568 phone', 320, 568],
  ];

  it(
    'draws the whole contemplated shot below the info bar',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        for (const [label, width, height] of CASES) {
          const page = await browser.newPage({ viewport: { width, height } });
          await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
          await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
            timeout: 15000,
          });
          const click = async (t: string) => {
            await page.locator('button', { hasText: t }).first().click();
            await page.waitForTimeout(320);
          };
          await click('The Voyage');
          await click('Voyage as Feather');
          await click('First Tee');
          await click('Tee Off');
          await page.waitForSelector('[data-playmode="aim"]', { timeout: 15000 });
          // The band is measured on the first paint and re-rendered for once — let that settle, or
          // the framing under test is the unmeasured fallback.
          await page.waitForTimeout(600);

          const m = await page.evaluate(() => {
            const shot = document.querySelector('.gs-shot--full[data-playmode]');
            const map = shot?.querySelector('.gs-bigmap');
            const bar = shot?.querySelector('.gs-hud-top');
            const overlay = document.getElementById('gs-shot-overlay');
            if (!shot || !map || !bar || !overlay) return null;
            const host = map.getBoundingClientRect();
            return {
              barBottom: bar.getBoundingClientRect().bottom - host.top,
              coneTop: overlay.getBoundingClientRect().top - host.top,
              club: document.querySelector('.gs-hud-bagclub')?.textContent?.trim() ?? '?',
            };
          });
          await page.close();

          expect(m, `${label}: could not measure the aim screen`).not.toBeNull();
          expect(m!.club, `${label}: expected the driver off the tee`).toBe('D');
          // The clipped state measured −54px here on the 320×568 phone before the fix.
          expect(
            m!.coneTop,
            `${label}: the aim cone is drawn ${Math.round(m!.barBottom - m!.coneTop)}px behind the info bar`,
          ).toBeGreaterThan(m!.barBottom);
        }
      } finally {
        await browser.close();
      }
    },
    120_000,
  );
});
