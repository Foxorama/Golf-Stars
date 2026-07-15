/**
 * Grid-based polygon MERGE utilities for the render layer (GS-hazard-blend).
 *
 * Two jobs, one engine:
 *  • `unionPolys` — true union of overlapping/touching same-family hazard bodies, so a chain of
 *    bunkers or a lake-plus-creek reads as ONE excavated/liquid surface with a single rim, instead
 *    of a pile of stickers each wearing its own outline.
 *  • `dilateUnion` — a ROBUST outward offset (dilation) of play features into land platforms. The
 *    old mitred `offsetPoly` outset self-intersects at a concave bend (the fold flips its winding,
 *    the fill rule leaves the fold EMPTY) — which is exactly the "star gap between the fairway and
 *    the border" on Cetus/void pads. A dilation by construction cannot fold.
 *
 * Engine: scanline-rasterize the polygons onto a small binary node grid (course space), optionally
 * grow it with a chamfer distance transform, then trace the boundary back out with marching squares
 * and smooth it (Chaikin + collinear drop). Everything is PURE geometry — zero rng — and operates in
 * COURSE space, so per-hole results are byte-stable and camera-proof (the follow-cam can never
 * change how many merged bodies exist, which keeps downstream rng draw counts stable).
 */

import type { Vec } from '../sim/course/contract';

interface Grid {
  on: Uint8Array; // node occupancy, row-major [j * nx + i]
  nx: number;
  ny: number;
  x0: number; // course-space coords of node (0,0)
  y0: number;
  cell: number;
}

function bboxAll(polys: Vec[][]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Rasterize polygons (even-odd scanline fill) onto a node grid padded by `pad` + a 2-cell margin
 *  of guaranteed-empty border (marching squares needs closed loops). */
function rasterize(polys: Vec[][], cell: number, pad: number): Grid {
  const bb = bboxAll(polys);
  const x0 = bb.minX - pad - 2 * cell;
  const y0 = bb.minY - pad - 2 * cell;
  const nx = Math.max(4, Math.ceil((bb.maxX - bb.minX + 2 * (pad + 2 * cell)) / cell) + 1);
  const ny = Math.max(4, Math.ceil((bb.maxY - bb.minY + 2 * (pad + 2 * cell)) / cell) + 1);
  const on = new Uint8Array(nx * ny);
  for (const poly of polys) {
    if (poly.length < 3) continue;
    let pMinY = Infinity, pMaxY = -Infinity;
    for (const p of poly) {
      if (p[1] < pMinY) pMinY = p[1];
      if (p[1] > pMaxY) pMaxY = p[1];
    }
    const j0 = Math.max(0, Math.ceil((pMinY - y0) / cell));
    const j1 = Math.min(ny - 1, Math.floor((pMaxY - y0) / cell));
    for (let j = j0; j <= j1; j++) {
      const y = y0 + j * cell;
      // X-crossings of the horizontal node row with the polygon edges (half-open rule).
      const xs: number[] = [];
      for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
        const a = poly[k]!;
        const b = poly[i]!;
        if (a[1] <= y === b[1] <= y) continue;
        xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      xs.sort((p, q) => p - q);
      for (let s = 0; s + 1 < xs.length; s += 2) {
        const i0 = Math.max(0, Math.ceil((xs[s]! - x0) / cell));
        const i1 = Math.min(nx - 1, Math.floor((xs[s + 1]! - x0) / cell));
        for (let i = i0; i <= i1; i++) on[j * nx + i] = 1;
      }
    }
  }
  return { on, nx, ny, x0, y0, cell };
}

/** Two-pass chamfer distance transform (in CELL units): distance from every node to the nearest
 *  node where `seed` is set. Shared by `dilate` (seed = occupied) and `erode` (seed = empty). */
function chamferDT(seed: Uint8Array, nx: number, ny: number): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(nx * ny);
  for (let k = 0; k < d.length; k++) d[k] = seed[k] ? 0 : INF;
  const D = Math.SQRT2;
  // forward pass
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let v = d[k]!;
      if (i > 0) v = Math.min(v, d[k - 1]! + 1);
      if (j > 0) {
        v = Math.min(v, d[k - nx]! + 1);
        if (i > 0) v = Math.min(v, d[k - nx - 1]! + D);
        if (i < nx - 1) v = Math.min(v, d[k - nx + 1]! + D);
      }
      d[k] = v;
    }
  }
  // backward pass
  for (let j = ny - 1; j >= 0; j--) {
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i;
      let v = d[k]!;
      if (i < nx - 1) v = Math.min(v, d[k + 1]! + 1);
      if (j < ny - 1) {
        v = Math.min(v, d[k + nx]! + 1);
        if (i < nx - 1) v = Math.min(v, d[k + nx + 1]! + D);
        if (i > 0) v = Math.min(v, d[k + nx - 1]! + D);
      }
      d[k] = v;
    }
  }
  return d;
}

/** Grow the occupied region outward by `pad` (course units) — chamfer distance transform, then
 *  threshold. The dilated silhouette is round-cornered and can never self-intersect. */
function dilate(g: Grid, pad: number): void {
  const d = chamferDT(g.on, g.nx, g.ny);
  const t = pad / g.cell;
  for (let k = 0; k < d.length; k++) g.on[k] = d[k]! <= t ? 1 : 0;
}

/** Marching-squares boundary tracing: directed edge-midpoint segments per cell, chained into
 *  closed loops (node-grid coordinates, converted to course space by the caller). */
function traceContours(g: Grid): Vec[][] {
  const { on, nx, ny } = g;
  // Directed segments per case (bits: 1=TL, 2=TR, 4=BR, 8=BL). Edge midpoints in cell-local
  // coords: T=(.5,0), R=(1,.5), B=(.5,1), L=(0,.5).
  const T: Vec = [0.5, 0];
  const R: Vec = [1, 0.5];
  const B: Vec = [0.5, 1];
  const L: Vec = [0, 0.5];
  const CASES: [Vec, Vec][][] = [
    [], // 0
    [[L, T]], // 1 TL
    [[T, R]], // 2 TR
    [[L, R]], // 3 TL+TR
    [[R, B]], // 4 BR
    [[L, T], [R, B]], // 5 saddle
    [[T, B]], // 6 TR+BR
    [[L, B]], // 7 TL+TR+BR
    [[B, L]], // 8 BL
    [[B, T]], // 9 TL+BL
    [[T, R], [B, L]], // 10 saddle
    [[B, R]], // 11 TL+TR+BL
    [[R, L]], // 12 BR+BL
    [[R, T]], // 13 TL+BR+BL
    [[T, L]], // 14 TR+BR+BL
    [], // 15
  ];
  const key = (x: number, y: number) => `${x * 2},${y * 2}`; // midpoints are halves → double = int
  const segs = new Map<string, Vec>(); // start-key → end point
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const c =
        (on[j * nx + i]! ? 1 : 0) |
        (on[j * nx + i + 1]! ? 2 : 0) |
        (on[(j + 1) * nx + i + 1]! ? 4 : 0) |
        (on[(j + 1) * nx + i]! ? 8 : 0);
      for (const [a, b] of CASES[c]!) {
        segs.set(key(i + a[0], j + a[1]), [i + b[0], j + b[1]]);
      }
    }
  }
  const loops: Vec[][] = [];
  const visited = new Set<string>();
  for (const [startKey] of segs) {
    if (visited.has(startKey)) continue;
    const loop: Vec[] = [];
    let curKey = startKey;
    for (let guard = 0; guard < segs.size + 1; guard++) {
      const next = segs.get(curKey);
      if (!next || visited.has(curKey)) break;
      visited.add(curKey);
      loop.push(next);
      curKey = key(next[0], next[1]);
      if (curKey === startKey) break;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

function signedAreaOf(pts: Vec[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j]![0] * pts[i]![1] - pts[i]![0] * pts[j]![1];
  }
  return a / 2;
}

/** One Chaikin corner-cut pass (closed loop) — rounds the marching-squares stair-steps. */
function chaikin(pts: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return out;
}

/** Polyline decimation (closed loop): from each kept ANCHOR, extend the chord as far as every
 *  intermediate vertex stays within `eps` of it — collapses marching-squares stair-steps and long
 *  gentle arcs into a handful of vertices, keeping loops light enough to redraw every frame. */
function simplify(pts: Vec[], eps: number): Vec[] {
  const n = pts.length;
  if (n < 5) return pts;
  const out: Vec[] = [pts[0]!];
  let ai = 0;
  while (ai < n - 1) {
    let bi = ai + 1;
    // Greedily extend the chord anchor→candidate while all interior points hug it.
    for (let j = ai + 2; j <= Math.min(n, ai + 64); j++) {
      const a = pts[ai]!;
      const c = pts[j % n]!;
      const ux = c[0] - a[0];
      const uy = c[1] - a[1];
      const l = Math.hypot(ux, uy) || 1;
      let ok = true;
      for (let k = ai + 1; k < j; k++) {
        const b = pts[k]!;
        const devi = Math.abs((b[0] - a[0]) * (uy / l) - (b[1] - a[1]) * (ux / l));
        if (devi > eps) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
      bi = j;
    }
    if (bi >= n) break;
    out.push(pts[bi]!);
    ai = bi;
  }
  return out.length >= 3 ? out : pts;
}

/** Extract the merged OUTER loops of a grid (holes — the opposite winding — are dropped: for the
 *  hazard/platform blobs this serves, a fully-enclosed pocket is vanishingly rare, and the callers
 *  keep per-body base fills so a pocket still paints correctly underneath). */
function contoursToCourse(g: Grid, minArea: number): Vec[][] {
  const raw = traceContours(g);
  if (raw.length === 0) return [];
  // The tracing gives outer boundaries one consistent winding and holes the other — keep the sign
  // of the biggest loop (always an outer one).
  let domSign = 0;
  let biggest = 0;
  for (const loop of raw) {
    const a = signedAreaOf(loop);
    if (Math.abs(a) > biggest) {
      biggest = Math.abs(a);
      domSign = Math.sign(a);
    }
  }
  const out: Vec[][] = [];
  for (const loop of raw) {
    const a = signedAreaOf(loop);
    if (Math.sign(a) !== domSign) continue;
    if (Math.abs(a) * g.cell * g.cell < minArea) continue;
    // Decimate the raw stair-steps into chords first, THEN round the corners (Chaikin), then a
    // light second decimation — an organic edge at a fraction of the raw vertex count.
    const smooth = simplify(chaikin(simplify(loop, 0.7)), 0.25);
    out.push(smooth.map((p) => [g.x0 + p[0] * g.cell, g.y0 + p[1] * g.cell] as Vec));
  }
  return out;
}

/** Bounding boxes touching (inflated by `slack`)? → the two polys may interact. */
function bboxesTouch(a: Vec[], b: Vec[], slack: number): boolean {
  const ba = bboxAll([a]);
  const bb = bboxAll([b]);
  return !(
    ba.minX - slack > bb.maxX ||
    bb.minX - slack > ba.maxX ||
    ba.minY - slack > bb.maxY ||
    bb.minY - slack > ba.maxY
  );
}

/**
 * TRUE UNION of a family of polygons (course space): overlapping/touching bodies fuse into one
 * merged silhouette; isolated bodies are returned UNCHANGED (identity — no re-rasterisation, so a
 * lone bunker keeps its exact hand-drawn blob edge and the common case costs nothing). Bodies are
 * first grouped into interaction clusters by inflated bbox (union-find), and only multi-body
 * clusters go through the grid.
 */
export function unionPolys(polys: Vec[][], cell = 1.6): Vec[][] {
  const n = polys.length;
  if (n <= 1) return polys.slice();
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (bboxesTouch(polys[i]!, polys[j]!, cell)) parent[find(i)] = find(j);
    }
  }
  const clusters = new Map<number, Vec[][]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const c = clusters.get(r);
    if (c) c.push(polys[i]!);
    else clusters.set(r, [polys[i]!]);
  }
  const out: Vec[][] = [];
  for (const group of clusters.values()) {
    if (group.length === 1) {
      out.push(group[0]!);
      continue;
    }
    const g = rasterize(group, cell, 0);
    const merged = contoursToCourse(g, cell * cell * 3);
    // Paranoid fallback: if tracing degenerates (shouldn't), keep the originals rather than vanish.
    out.push(...(merged.length ? merged : group));
  }
  return out;
}

/** Nearest approach between two polygons — min vertex-to-vertex distance and the two closest points
 *  (both bodies carry ~16 vertices, so vertex sampling is a fine proxy for the true edge gap). */
function nearestBetween(a: Vec[], b: Vec[]): { d: number; pa: Vec; pb: Vec } {
  let best = Infinity;
  let pa = a[0]!;
  let pb = b[0]!;
  for (const p of a) {
    for (const q of b) {
      const dd = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (dd < best) {
        best = dd;
        pa = p;
        pb = q;
      }
    }
  }
  return { d: best, pa, pb };
}

/** A capsule-ish quad connecting `pa`→`pb` with half-width `w`, extended `over` yards into each body
 *  so the bridge overlaps both and the union has no seam. */
function bridgeQuad(pa: Vec, pb: Vec, w: number, over: number): Vec[] {
  const dx = pb[0] - pa[0];
  const dy = pb[1] - pa[1];
  const l = Math.hypot(dx, dy) || 1;
  const px = (-dy / l) * w;
  const py = (dx / l) * w;
  const ex = (dx / l) * over;
  const ey = (dy / l) * over;
  const a: Vec = [pa[0] - ex, pa[1] - ey];
  const b: Vec = [pb[0] + ex, pb[1] + ey];
  return [
    [a[0] + px, a[1] + py],
    [b[0] + px, b[1] + py],
    [b[0] - px, b[1] - py],
    [a[0] - px, a[1] - py],
  ];
}

/** Smaller of a polygon's two bbox spans (its narrow dimension) — used to size a bridge neck to the
 *  bodies it joins, so two pot bunkers get a slim isthmus and two lakes a fat one. */
function narrowSpan(poly: Vec[]): number {
  const b = bboxAll([poly]);
  return Math.min(b.maxX - b.minX, b.maxY - b.minY);
}

/**
 * NEAR-body BLEND (course space, GS-hazard-merge): fuse a family of hazard bodies that sit WITHIN
 * ~`gap` yards of one another into ONE organic silhouette, instead of a scatter of individual stickers
 * each wearing its own rim (the "manky pile of separate blobs" tell). Where `unionPolys` only fuses
 * bodies that already TOUCH, this bridges a real air gap — the difference between separate blobs and
 * one hazard that reads as one.
 *
 * How: cluster bodies by proximity (union-find on nearest-approach ≤ `gap`), so a body with no
 * neighbour within `gap` takes the IDENTITY fast path (returns its exact hand-drawn vertices — a lone
 * bunker is untouched and costs nothing). For a multi-body cluster, drop a slim NECK quad between each
 * near pair (width scaled to the smaller body, so pots get an isthmus and lakes a fat waist), then take
 * the true grid union of bodies + necks. The bodies keep their exact size — only a natural connecting
 * waist is ADDED — so the drawn hazard still tracks its sim penalty polys (graphic ≈ physics), it just
 * reads as one melted-together complex. PURE geometry, zero rng, course space → per-hole byte-stable +
 * camera-proof, exactly like `unionPolys`.
 */
export function unionClose(polys: Vec[][], gap = 8, cell = 1.6): Vec[][] {
  const n = polys.length;
  if (n <= 1) return polys.slice();
  // Pairwise nearest approach → cluster (union-find) and remember which pairs get a neck.
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const necks: { poly: Vec[]; owner: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Cheap bbox reject before the O(v²) nearest-approach probe.
      if (!bboxesTouch(polys[i]!, polys[j]!, gap)) continue;
      const near = nearestBetween(polys[i]!, polys[j]!);
      if (near.d > gap) continue;
      // Neck width tracks the smaller body (so it reads in proportion); clamped to a sane band.
      const w = Math.max(2, Math.min(9, Math.min(narrowSpan(polys[i]!), narrowSpan(polys[j]!)) * 0.28));
      necks.push({ poly: bridgeQuad(near.pa, near.pb, w, 3), owner: i });
      parent[find(i)] = find(j);
    }
  }
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const c = clusters.get(r);
    if (c) c.push(i);
    else clusters.set(r, [i]);
  }
  const out: Vec[][] = [];
  for (const [root, idxs] of clusters) {
    if (idxs.length === 1) {
      out.push(polys[idxs[0]!]!); // isolated body — keep its exact edge (identity fast path)
      continue;
    }
    const bodies = idxs.map((i) => polys[i]!);
    const group = [...bodies, ...necks.filter((neck) => find(neck.owner) === root).map((neck) => neck.poly)];
    const g = rasterize(group, cell, 0);
    const merged = contoursToCourse(g, cell * cell * 3);
    // Paranoid fallback: if tracing degenerates, keep the originals rather than vanish.
    out.push(...(merged.length ? merged : bodies));
  }
  return out;
}

/**
 * Robust OUTWARD OFFSET + union (course space): the union of the polygons grown by `pad` on every
 * side, with rounded corners — the fold-proof replacement for a negative `offsetPoly` when building
 * land platforms around concave fairway ribbons. Touching grown shapes merge into one platform.
 */
export function dilateUnion(polys: Vec[][], pad: number, cell = 3): Vec[][] {
  const real = polys.filter((p) => p.length >= 3);
  if (real.length === 0) return [];
  const g = rasterize(real, cell, pad);
  dilate(g, pad);
  const merged = contoursToCourse(g, cell * cell * 3);
  return merged.length ? merged : real;
}
