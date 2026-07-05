import { pointInPoly, type Vec } from '../sim/course/contract';
import { heightFieldAt, type ContourLobe } from '../sim/contour';

/**
 * GS-green-contour-2 — topo ISOLINES of a contour field (render-side, poly-agnostic).
 *
 * Extracts smooth elevation rings from the sim's own `heightFieldAt` (the potential whose gradient
 * is the slope field the ball rolls on), marching-squares over a COURSE-space grid clipped to a
 * surface polygon — so the rings the player reads are literally level sets of the surface the putt
 * resolver integrates. Everything here obeys the camera-proof scene contract:
 *
 *  - the grid, the level values, the segment chaining and the smoothing all read ONLY course-space
 *    / deterministic values — never the projection — so line counts and shapes are identical on
 *    every frame of a moving follow-cam;
 *  - output is COURSE-space polylines; the caller projects them at paint time (and caches this
 *    call per hole — the field never changes under a camera move).
 *
 * Deliberately green-agnostic (like `sim/contour.ts`): a future contoured FAIRWAY hands its own
 * polygon + field to the same function. Pure geometry, zero rng.
 */

export interface IsolineOpts {
  /** Grid cells across the polygon's max span (default 24 — ~1yd cells on a green). */
  grid?: number;
  /** Elevation spacing between rings, in field units (default 2.6). Ring count adapts to the
   *  surface's relief: a bold double-mound green earns more rings than a gentle plane. */
  spacing?: number;
  /** Ring-count clamp (default 3..7). */
  minLevels?: number;
  maxLevels?: number;
}

/** One marching-squares edge crossing, lerped between two grid nodes. Always called with the
 *  lower-index node first so the shared edge of two adjacent cells yields the IDENTICAL point —
 *  which is what lets exact-key chaining stitch the segment soup into continuous lines. */
function crossing(ax: number, ay: number, av: number, bx: number, by: number, bv: number, lv: number): Vec {
  const t = (lv - av) / (bv - av || 1e-12);
  return [ax + (bx - ax) * t, ay + (by - ay) * t];
}

const keyOf = (p: Vec): string => `${p[0].toFixed(4)}:${p[1].toFixed(4)}`;

/** Stitch an unordered segment soup into polylines by exact endpoint matching. */
function chainSegments(segs: [Vec, Vec][]): Vec[][] {
  const adj = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of s) {
      const k = keyOf(p);
      const list = adj.get(k);
      if (list) list.push(i);
      else adj.set(k, [i]);
    }
  });
  const used = new Array<boolean>(segs.length).fill(false);
  const lines: Vec[][] = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const line: Vec[] = [segs[i]![0], segs[i]![1]];
    for (const dir of [1, -1] as const) {
      let end = dir === 1 ? line[line.length - 1]! : line[0]!;
      for (;;) {
        const cands = adj.get(keyOf(end))?.filter((j) => !used[j]);
        if (!cands || cands.length === 0) break;
        const j = cands[0]!;
        used[j] = true;
        const s = segs[j]!;
        const next = keyOf(s[0]) === keyOf(end) ? s[1] : s[0];
        if (dir === 1) line.push(next);
        else line.unshift(next);
        end = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** One round of Chaikin corner-cutting — enough to melt marching-squares' cell-edge kinks into a
 *  flowing ring. Open lines keep their endpoints; closed loops wrap (and stay explicitly closed). */
function chaikin(pts: Vec[], closed: boolean): Vec[] {
  if (pts.length < 3) return pts;
  const n = closed ? pts.length - 1 : pts.length; // closed input carries its first point twice
  const out: Vec[] = [];
  if (!closed) out.push(pts[0]!);
  const lim = closed ? n : n - 1;
  for (let i = 0; i < lim; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % n]!;
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  if (closed) out.push([out[0]![0], out[0]![1]]);
  else out.push(pts[pts.length - 1]!);
  return out;
}

function polylineLength(pts: Vec[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  return l;
}

/**
 * The contour field's isolines inside `poly`, as COURSE-space polylines (closed rings carry their
 * first point again at the end). Levels are evenly spaced between the field's min/max over the
 * polygon's interior, count adapted to the relief amplitude. Returns [] for a near-flat field.
 */
export function contourIsolines(
  poly: Vec[],
  plane: Vec | undefined,
  lobes: readonly ContourLobe[],
  opts: IsolineOpts = {},
): Vec[][] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const span = Math.max(maxX - minX, maxY - minY);
  if (!(span > 4)) return [];
  const step = span / (opts.grid ?? 24);
  const nx = Math.max(2, Math.ceil((maxX - minX) / step));
  const ny = Math.max(2, Math.ceil((maxY - minY) / step));
  // Node heights over the (padded-to-grid) bbox, plus the surface's min/max INSIDE the polygon —
  // levels must reflect the green itself, not the square of field around it.
  const X = (ix: number): number => minX + ix * step;
  const Y = (iy: number): number => minY + iy * step;
  const H = new Float64Array((nx + 1) * (ny + 1));
  let hMin = Infinity;
  let hMax = -Infinity;
  for (let iy = 0; iy <= ny; iy++) {
    for (let ix = 0; ix <= nx; ix++) {
      const p: Vec = [X(ix), Y(iy)];
      const h = heightFieldAt(p, plane, lobes);
      H[iy * (nx + 1) + ix] = h;
      if (pointInPoly(p, poly)) {
        if (h < hMin) hMin = h;
        if (h > hMax) hMax = h;
      }
    }
  }
  if (!(hMax > hMin)) return [];
  const amp = hMax - hMin;
  const nLevels = Math.max(opts.minLevels ?? 3, Math.min(opts.maxLevels ?? 7, Math.round(amp / (opts.spacing ?? 2.6))));
  const at = (ix: number, iy: number): number => H[iy * (nx + 1) + ix]!;
  const out: Vec[][] = [];
  for (let li = 0; li < nLevels; li++) {
    const lv = hMin + ((li + 0.5) / nLevels) * amp;
    const segs: [Vec, Vec][] = [];
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const a = at(ix, iy); // tl
        const b = at(ix + 1, iy); // tr
        const c = at(ix + 1, iy + 1); // br
        const d = at(ix, iy + 1); // bl
        const idx = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        // Edge crossings, each lerped left-node-first / top-node-first so shared edges match exactly.
        const T = (): Vec => crossing(X(ix), Y(iy), a, X(ix + 1), Y(iy), b, lv);
        const R = (): Vec => crossing(X(ix + 1), Y(iy), b, X(ix + 1), Y(iy + 1), c, lv);
        const B = (): Vec => crossing(X(ix), Y(iy + 1), d, X(ix + 1), Y(iy + 1), c, lv);
        const L = (): Vec => crossing(X(ix), Y(iy), a, X(ix), Y(iy + 1), d, lv);
        switch (idx) {
          case 1: case 14: segs.push([L(), B()]); break;
          case 2: case 13: segs.push([B(), R()]); break;
          case 3: case 12: segs.push([L(), R()]); break;
          case 4: case 11: segs.push([T(), R()]); break;
          case 6: case 9: segs.push([T(), B()]); break;
          case 7: case 8: segs.push([L(), T()]); break;
          case 5: // saddle (tr+bl above): the cell-centre average disambiguates the diagonal
            if ((a + b + c + d) / 4 > lv) segs.push([L(), T()], [B(), R()]);
            else segs.push([T(), R()], [L(), B()]);
            break;
          case 10: // saddle (tl+br above)
            if ((a + b + c + d) / 4 > lv) segs.push([T(), R()], [L(), B()]);
            else segs.push([L(), T()], [B(), R()]);
            break;
        }
      }
    }
    for (const line of chainSegments(segs)) {
      const closed = keyOf(line[0]!) === keyOf(line[line.length - 1]!);
      const smooth = chaikin(line, closed);
      // Cull specks (sub-3yd slivers) and lines that never touch the surface — the clip would hide
      // them anyway, but dropping them keeps the SVG lean and the prim list honest.
      if (polylineLength(smooth) < 3) continue;
      if (!smooth.some((p) => pointInPoly(p, poly))) continue;
      out.push(smooth);
    }
  }
  return out;
}
