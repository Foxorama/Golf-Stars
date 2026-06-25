/**
 * Shared course-space → screen projector. Pure (no DOM), so it's unit-tested and BOTH
 * renderers — the SVG static map (`holeView`) and the Canvas2D play view (`playView`) —
 * use the exact same mapping and agree pixel-for-pixel.
 *
 * Convention (kept from golf-finder's playHoleSvg): rotate so the tee→green play-line
 * points up-screen (a uv() transform), then fit-to-view with uniform scale (no stretch).
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

/** The tee→green-up orthonormal axes: `dir` points tee→green, `perp` is its right side. */
function axes(hole: Hole): { t: Vec; dir: Vec; perp: Vec } {
  const t = hole.tee;
  let dx = hole.green[0] - t[0];
  let dy = hole.green[1] - t[1];
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
  const { t, dir, perp } = axes(hole);
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
