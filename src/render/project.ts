/**
 * Shared course-space → screen projector. Pure (no DOM), so it's unit-tested and BOTH
 * renderers — the SVG static map (`holeView`) and the Canvas2D play view (`playView`) —
 * use the exact same mapping and agree pixel-for-pixel.
 *
 * Convention (kept from golf-finder's playHoleSvg): rotate so the tee→green play-line
 * points up-screen (a uv() transform), then fit-to-view with uniform scale (no stretch).
 */

import type { Hole, Vec } from '../sim/course/contract';

export interface ProjectOptions {
  width?: number;
  height?: number;
  padding?: number;
}

export interface Projector {
  width: number;
  height: number;
  /** Course-space point → screen pixel. */
  project(p: Vec): Vec;
  /** Uniform course→screen scale (pixels per yard). */
  scale: number;
}

/** uv() transform: rotate course-space so tee→green points up, map to SVG (y-down). */
function makeUv(hole: Hole): (p: Vec) => Vec {
  const t = hole.tee;
  let dx = hole.green[0] - t[0];
  let dy = hole.green[1] - t[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const perp: Vec = [dy, -dx]; // right perpendicular = lateral (u) axis
  return (p: Vec): Vec => {
    const rx = p[0] - t[0];
    const ry = p[1] - t[1];
    const u = rx * perp[0] + ry * perp[1];
    const v = rx * dx + ry * dy;
    return [u, -v]; // negate v so the green (large v) sits near the top
  };
}

/** Build a projector that fits the whole hole into width×height with padding. */
export function holeProjector(hole: Hole, opts: ProjectOptions = {}): Projector {
  const width = opts.width ?? 360;
  const height = opts.height ?? 640;
  const padding = opts.padding ?? 24;
  const uv = makeUv(hole);

  // Bounding box over every point of the hole, in transformed space.
  const polys: Vec[][] = [
    ...hole.features.map((f) => f.poly),
    ...hole.hazards.map((f) => f.poly),
    hole.centreline,
    [hole.tee, hole.green],
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
  const scale = Math.min((width - 2 * padding) / contentW, (height - 2 * padding) / contentH);
  const offX = (width - contentW * scale) / 2 - minX * scale;
  const offY = (height - contentH * scale) / 2 - minY * scale;

  return {
    width,
    height,
    scale,
    project(p: Vec): Vec {
      const [x, y] = uv(p);
      return [x * scale + offX, y * scale + offY];
    },
  };
}
