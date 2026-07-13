/**
 * DECOR VIEW-INVARIANCE PROBE (GS-decor-view-states) — a TEST-ONLY harness that proves the animated
 * world decor (the derelict's drifting hull junk + sections) is WORLD-ANCHORED, not screen-anchored.
 *
 * The bug this guards: the same decor used to render at a different scale + a different screen path in
 * each gameplay view state (aim / watch / chip / putt), so it JUMPED whenever the camera changed — the
 * worst offenders being the big ship SECTIONS (once drawn at a fixed screen fraction) and any decor on
 * the slo-mo virtual clock. The fix makes every element a pure function of `(worldPosition, wallClock)`.
 *
 * How the probe proves it: render the decor at ONE wall-clock instant through two projectors that differ
 * ONLY by a camera PAN (same canvas, scale and up). Because the projection is affine, a WORLD-anchored
 * element must shift on screen by exactly the pan — so re-aligning frame A by that pan reproduces frame B
 * (high IoU of the decor masks). A SCREEN-anchored element would NOT move with the pan and the IoU would
 * collapse. `tests/build.test.ts` drives this in a real headless Chromium and asserts the IoU stays high.
 *
 * Installed on `window.__gsDecorProbe` (double-underscore, like `__gsErr` — deliberately NOT a
 * single-underscore `_gs*` feel flag, so the test-hub sync guard ignores it; it is a QA hook, not a
 * player-facing tunable). Browser-only (needs a 2D canvas); a no-op assign when there's no document.
 */

import { generateCourse } from '../sim/course/generate';
import { holeProjector } from './project';
import { createShipDrift } from './shipDrift';
import type { Vec } from '../sim/course/contract';

export interface DecorProbeOpts {
  seed?: number;
  /** Journey depth handed to generateCourse (deeper = wilder derelict). */
  dist?: number;
  /** The shared wall-clock instant (ms) both frames render at. */
  now?: number;
  width?: number;
  height?: number;
  /** Camera pan (course yards) between the two frames — small, so culling barely changes the on-screen set. */
  panX?: number;
  panY?: number;
}

export interface DecorProbeResult {
  /** Screen-pixel vector the world moved between the two frames (the pan projected). */
  shift: [number, number];
  /** Decor pixels of frame B that MATCH frame A after A is realigned by the pan. World-anchored decor
   *  moved with the camera, so it lines up here — this is high. */
  alignedOverlap: number;
  /** Decor pixels of frame B that match frame A with NO realign. A screen-anchored element (the bug)
   *  stayed put, so it lines up here instead — this is high when decor is screen-anchored. */
  staticOverlap: number;
  /** alignedOverlap / max(1, staticOverlap): ≫1 ⇒ world-anchored (moved with the camera); ≤1 ⇒ a
   *  screen-anchored element that jumps between views. The robust, edge-culling-tolerant proof. */
  moveRatio: number;
  /** Lit decor pixels in each frame — a sanity check that decor actually drew. */
  decorPixelsA: number;
  decorPixelsB: number;
}

/** Run the probe. Pure of any game state — it builds its own derelict hole. Browser-only. */
export function decorProbe(o: DecorProbeOpts = {}): DecorProbeResult {
  const W = o.width ?? 414;
  const H = o.height ?? 896;
  const now = o.now ?? 12_345;
  const seed = o.seed ?? 20_260_627;
  const dist = o.dist ?? 14;
  const course = generateCourse(seed, { biome: 'derelict-ship', holes: 24, distanceFromStart: dist });
  const hole = course.holes.find((h) => h.par >= 4) ?? course.holes[0]!;

  // Frame the whole hole so plenty of the drifting wreckage is on-screen in both frames.
  const focus: Vec = [(hole.tee[0] + hole.green[0]) / 2, (hole.tee[1] + hole.green[1]) / 2];
  const up: Vec = [hole.green[0] - hole.tee[0], hole.green[1] - hole.tee[1]];
  const span = Math.hypot(up[0], up[1]) || 60;
  const viewRadius = Math.max(60, span * 0.6);
  const panX = o.panX ?? 14;
  const panY = o.panY ?? 10;
  const focusB: Vec = [focus[0] + panX, focus[1] + panY];

  const projA = holeProjector(hole, { width: W, height: H, focus, viewRadius, up });
  const projB = holeProjector(hole, { width: W, height: H, focus: focusB, viewRadius, up });
  // The screen vector the world moves under the pan (affine, so constant for every world point):
  //   project_B(wp) = project_A(wp) − shift, hence decor at B[q] is the decor at A[q + shift].
  const a0 = projA.project(focus);
  const a1 = projA.project(focusB);
  const shift: [number, number] = [a1[0] - a0[0], a1[1] - a0[1]];

  const maskA = renderDecorMask(hole, projA, now, W, H);
  const maskB = renderDecorMask(hole, projB, now, W, H);

  const sx = Math.round(shift[0]);
  const sy = Math.round(shift[1]);
  let pixA = 0;
  let pixB = 0;
  let alignedOverlap = 0; // B ∧ A(shifted by pan)  — where world-anchored decor lines up
  let staticOverlap = 0; // B ∧ A(no shift)         — where a screen-anchored element would line up
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const b = maskB[y * W + x]!;
      if (maskA[y * W + x]) pixA++;
      if (b) {
        pixB++;
        if (maskA[y * W + x]) staticOverlap++;
        const ax = x + sx;
        const ay = y + sy;
        if (ax >= 0 && ax < W && ay >= 0 && ay < H && maskA[ay * W + ax]) alignedOverlap++;
      }
    }
  }
  return {
    shift,
    alignedOverlap,
    staticOverlap,
    moveRatio: alignedOverlap / Math.max(1, staticOverlap),
    decorPixelsA: pixA,
    decorPixelsB: pixB,
  };
}

/** Render just the ship-drift decor (transparent background) and return a binary lit-pixel mask. */
function renderDecorMask(
  hole: Parameters<typeof createShipDrift>[0],
  proj: ReturnType<typeof holeProjector>,
  now: number,
  W: number,
  H: number,
): Uint8Array {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);
  createShipDrift(hole).draw(ctx, proj, now, 1, 1);
  const data = ctx.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3]! > 24 ? 1 : 0; // alpha threshold
  return mask;
}

/** Install the probe on `window.__gsDecorProbe` (browser-only; no-op in node). Called once at boot. */
export function installDecorProbe(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  (window as unknown as { __gsDecorProbe?: typeof decorProbe }).__gsDecorProbe = decorProbe;
}
