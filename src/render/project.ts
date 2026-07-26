/**
 * Shared course-space → screen projector. Pure (no DOM), so it's unit-tested and BOTH
 * renderers — the SVG static map (`holeView`) and the Canvas2D play view (`playView`) —
 * use the exact same mapping and agree pixel-for-pixel.
 *
 * Convention (kept from golf-finder's playHoleSvg): rotate so the tee→green play-line
 * points up-screen (a uv() transform), then fit-to-view with uniform scale (no stretch).
 * The `up` option overrides that rotation (the follow-cam passes ball→pin so the PIN stays at
 * the top of the screen even when the ball is long of the green — keeps aiming intuitive).
 *
 * Two fit modes:
 *  - whole-hole (default): the bounding box of all terrain (+extra) fills the view.
 *  - focus (GS-mechanics #7): zoom in around a `focus` point (the ball) to a `viewRadius`
 *    in course yards, biased so the ball sits low and you see AHEAD — so the camera follows
 *    the ball and a far green legitimately sits off-screen on a long hole.
 */

import type { Hole, Vec } from '../sim/course/contract';

export interface ProjectOptions {
  width?: number;
  height?: number;
  padding?: number;
  /** Extra course-space points to include in the fit (e.g. shot landings that fly wide
   *  of the terrain) so the ball is never clipped off-map. Ignored when `focus` is set. */
  extra?: Vec[];
  /** Zoom-and-follow: centre the view on this course-space point (the ball). */
  focus?: Vec;
  /** Visible radius (course yards) around `focus` — defaults to a sensible reach. */
  viewRadius?: number;
  /** Where the focus point sits vertically, 0=top .. 1=bottom (default 0.62 → ball low,
   *  more of the hole ahead is visible). Only used with `focus`. */
  focusBias?: number;
  /** Override the "up" course-space direction (default: tee→green). When set, the view rotates so
   *  this vector points up-screen — used by the follow-cam to keep the current target (the pin) at
   *  the TOP even when the ball is long of the green, so aiming/pulling never feels backwards.
   *  A near-zero vector falls back to tee→green. */
  up?: Vec;
}

/**
 * The viewBox a map should be AUTHORED at so it fills a `cw×ch` container with no letterbox, while
 * every stroke width, font size and marker radius keeps the apparent size it has in the `dw×dh`
 * design frame.
 *
 * An SVG with a fixed design viewBox is scaled into its container by `preserveAspectRatio`'s default
 * meet fit — uniform and CENTRED — so any aspect mismatch becomes dead bands of page background at
 * the ends of the longer axis. On a 390×844 phone the 360×640 play-map frame lost 75px top AND
 * bottom: 18% of the screen, reading as black bars wherever the scene had no geometry spilling past
 * the frame (the whole-hole view's sky, most obviously).
 *
 * Stretching would distort and slicing would crop the ball off a landscape screen, so instead keep
 * the meet scale the browser would have chosen and GROW the frame on the starved axis: the aspect
 * then matches exactly, meet becomes the identity, and the reclaimed bands become map. A container
 * that already matches the design aspect returns the design frame unchanged — so the common 9:16
 * phone draws byte-for-byte what it drew before.
 */
export function fitFrame(cw: number, ch: number, dw = 360, dh = 640): { width: number; height: number } {
  const s = Math.min(cw / dw, ch / dh);
  if (!Number.isFinite(s) || s <= 0) return { width: dw, height: dh }; // unmeasurable container
  // `min` above pins one axis at its design size; `max` only guards the other against rounding down.
  return { width: Math.max(dw, Math.round(cw / s)), height: Math.max(dh, Math.round(ch / s)) };
}

export interface Projector {
  width: number;
  height: number;
  /** Course-space point → screen pixel. */
  project(p: Vec): Vec;
  /** Screen pixel → course-space point (inverse of `project`) — for tap/drag aiming. */
  unproject(px: number, py: number): Vec;
  /** Uniform course→screen scale (pixels per yard). */
  scale: number;
}

/** The "up"-pointing orthonormal axes: `dir` points up-screen, `perp` is its right side. Defaults to
 *  tee→green; an `up` override (e.g. ball→pin) rotates the whole view so that direction is up. */
function axes(hole: Hole, up?: Vec): { t: Vec; dir: Vec; perp: Vec } {
  const t = hole.tee;
  let dx: number;
  let dy: number;
  if (up && (up[0] || up[1])) {
    dx = up[0];
    dy = up[1];
  } else {
    dx = hole.green[0] - t[0];
    dy = hole.green[1] - t[1];
  }
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  return { t, dir: [dx, dy], perp: [dy, -dx] };
}

/** Build a projector that fits the hole (or a focus window) into width×height. */
export function holeProjector(hole: Hole, opts: ProjectOptions = {}): Projector {
  const width = opts.width ?? 360;
  const height = opts.height ?? 640;
  const padding = opts.padding ?? 24;
  const { t, dir, perp } = axes(hole, opts.up);
  // uv: rotate course-space so tee→green points up; negate v so the green (large v) is at top.
  const uv = (p: Vec): Vec => {
    const rx = p[0] - t[0];
    const ry = p[1] - t[1];
    return [rx * perp[0] + ry * perp[1], -(rx * dir[0] + ry * dir[1])];
  };

  let scale: number;
  let offX: number;
  let offY: number;

  if (opts.focus) {
    // Focus/zoom mode: a square window of half-size `viewRadius` around the ball. Width-limited
    // uniform scale (portrait views then show MORE ahead/behind vertically), ball biased low.
    const R = Math.max(10, opts.viewRadius ?? 180);
    const bias = opts.focusBias ?? 0.62;
    scale = Math.min((width - 2 * padding) / (2 * R), (height - 2 * padding) / (2 * R));
    const f = uv(opts.focus);
    offX = width / 2 - f[0] * scale;
    offY = height * bias - f[1] * scale;
  } else {
    // Whole-hole fit: bounding box over every point (+extra).
    const polys: Vec[][] = [
      ...hole.features.map((f) => f.poly),
      ...hole.hazards.map((f) => f.poly),
      hole.centreline,
      [hole.tee, hole.green],
      ...(opts.extra && opts.extra.length ? [opts.extra] : []),
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const poly of polys) {
      for (const p of poly) {
        const [x, y] = uv(p);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;
    scale = Math.min((width - 2 * padding) / contentW, (height - 2 * padding) / contentH);
    offX = (width - contentW * scale) / 2 - minX * scale;
    offY = (height - contentH * scale) / 2 - minY * scale;
  }

  return {
    width,
    height,
    scale,
    project(p: Vec): Vec {
      const [x, y] = uv(p);
      return [x * scale + offX, y * scale + offY];
    },
    unproject(px: number, py: number): Vec {
      // Invert: screen → uv → course-space (perp/dir are orthonormal, so it's a clean solve).
      const u = (px - offX) / scale;
      const v = -((py - offY) / scale);
      return [t[0] + u * perp[0] + v * dir[0], t[1] + u * perp[1] + v * dir[1]];
    },
  };
}
