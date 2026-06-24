/**
 * Hole renderer — a descendant of golf-finder's `playHoleSvg`, repointed from baked OSM
 * polygons to the generated `Course` contract. It is geometry-agnostic: hand it any
 * contract-valid hole and it draws it.
 *
 * Conventions kept from golf-finder:
 *  - Play-line-up: tee at the bottom, green up-screen (we rotate course-space so the
 *    tee→green vector points up, via a uv() transform).
 *  - Hazards drawn LAST, on top of terrain features.
 *
 * The SVG-string builder (`renderHoleSVG`) is PURE — no DOM — so tests can assert on the
 * markup headlessly. `mountHole` is the thin DOM wrapper. (Animated ball flight will live
 * in a Canvas2D layer later, per the architecture decision; the static map stays SVG.)
 */

import type { Feature, FeatureKind, Hole, Vec } from '../sim/course/contract';
import type { ShotLog } from '../sim/round';

/** Surface fill palette. Open like the lie table — fantasy kinds fall back to a tint. */
const FILL: Record<string, string> = {
  rough: '#274d27',
  fairway: '#3f8c3f',
  green: '#5fd45a',
  tee: '#7a9a3a',
  bunker: '#e9d8a6',
  water: '#3f8fe0',
  waste: '#c2b280',
  lava: '#d2451e',
  void: '#160a26',
  ice: '#bfe6f0',
  crystal: '#9fd8e6',
};

/**
 * Per-biome rough (background) tint — a render-layer concern, keyed by biome id (the
 * sim's biome table stays physics-only). Fairway/green keep their canonical colours so
 * the playable surfaces always read; the surround sells the world.
 */
const BIOME_ROUGH: Record<string, string> = {
  'verdant-station': '#274d27',
  'dust-belt': '#6b5230',
  'ice-ring': '#3a4a55',
  'ember-world': '#3a1410',
  'void-garden': '#120a22',
};

function fillFor(kind: FeatureKind): string {
  return FILL[kind] ?? '#6a4f8a'; // unknown fantasy surface → purple tint
}

export interface RenderOptions {
  width?: number;
  height?: number;
  padding?: number;
  /** If given, draws each shot's flight line over the hole. */
  shots?: ShotLog[];
  /** Show the centreline play-line. */
  showCentreline?: boolean;
  /** Biome id — tints the rough/background to sell the world. */
  biome?: string;
}

/** uv() transform: rotate course-space so tee→green points up, then map to SVG (y-down). */
function makeTransform(hole: Hole) {
  const t = hole.tee;
  let dx = hole.green[0] - t[0];
  let dy = hole.green[1] - t[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  // v-axis = play direction (tee→green); u-axis = its right perpendicular.
  const perp: Vec = [dy, -dx];
  return (p: Vec): Vec => {
    const rx = p[0] - t[0];
    const ry = p[1] - t[1];
    const u = rx * perp[0] + ry * perp[1]; // lateral
    const v = rx * dx + ry * dy; // along play-line
    // SVG y grows downward; negate v so the green (large v) sits near the top.
    return [u, -v];
  };
}

function polyPoints(poly: Vec[], xf: (p: Vec) => Vec, ox: number, oy: number): string {
  return poly
    .map((p) => {
      const [x, y] = xf(p);
      return `${(x + ox).toFixed(1)},${(y + oy).toFixed(1)}`;
    })
    .join(' ');
}

/** Build the SVG markup for a hole. Pure: returns a string, touches no DOM. */
export function renderHoleSVG(hole: Hole, opts: RenderOptions = {}): string {
  const width = opts.width ?? 360;
  const height = opts.height ?? 640;
  const padding = opts.padding ?? 24;
  const xf = makeTransform(hole);

  // Collect every point to compute the content bounding box in transformed space.
  const allPolys: Vec[][] = [
    ...hole.features.map((f) => f.poly),
    ...hole.hazards.map((f) => f.poly),
    hole.centreline,
    [hole.tee, hole.green],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of allPolys) {
    for (const p of poly) {
      const [x, y] = xf(p);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  // Fit content into the view with uniform scale (preserve aspect — no stretch).
  const contentW = maxX - minX || 1;
  const contentH = maxY - minY || 1;
  const scale = Math.min((width - 2 * padding) / contentW, (height - 2 * padding) / contentH);

  // Centre the scaled content in the view.
  const offX = (width - contentW * scale) / 2 - minX * scale;
  const offY = (height - contentH * scale) / 2 - minY * scale;
  const place = (p: Vec): Vec => {
    const [x, y] = xf(p);
    return [x * scale, y * scale];
  };
  const pts = (poly: Vec[]) => polyPoints(poly, place, offX, offY);

  const featureSvg = (f: Feature) =>
    `<polygon points="${pts(f.poly)}" fill="${fillFor(f.kind)}" stroke="rgba(0,0,0,0.25)" stroke-width="1" />`;

  // Background = native rough behind everything, tinted by biome when known.
  const roughFill = (opts.biome && BIOME_ROUGH[opts.biome]) || FILL.rough;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${roughFill}" />`,
  ];

  // Terrain features first…
  for (const f of hole.features) parts.push(featureSvg(f));
  // …hazards on top (golf-finder layer rule).
  for (const f of hole.hazards) parts.push(featureSvg(f));

  if (opts.showCentreline ?? true) {
    parts.push(
      `<polyline points="${pts(hole.centreline)}" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="5 5" />`,
    );
  }

  // Shot flight lines (optional).
  if (opts.shots) {
    for (const s of opts.shots) {
      const [fx, fy] = place(s.from);
      const [tx, ty] = place(s.result.landing);
      parts.push(
        `<line x1="${(fx + offX).toFixed(1)}" y1="${(fy + offY).toFixed(1)}" x2="${(tx + offX).toFixed(1)}" y2="${(ty + offY).toFixed(1)}" stroke="#ffd84a" stroke-width="2" />`,
      );
    }
  }

  // Tee + pin markers.
  const [teeX, teeY] = place(hole.tee);
  const [grX, grY] = place(hole.green);
  parts.push(
    `<circle cx="${(teeX + offX).toFixed(1)}" cy="${(teeY + offY).toFixed(1)}" r="5" fill="#ffffff" stroke="#000" />`,
  );
  parts.push(
    `<circle cx="${(grX + offX).toFixed(1)}" cy="${(grY + offY).toFixed(1)}" r="4" fill="#ff3b3b" stroke="#000" />`,
  );

  parts.push('</svg>');
  return parts.join('');
}

/** Thin DOM wrapper: render the hole into a container element. Browser only. */
export function mountHole(container: HTMLElement, hole: Hole, opts: RenderOptions = {}): void {
  container.innerHTML = renderHoleSVG(hole, opts);
}
