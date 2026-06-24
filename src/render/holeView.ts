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
 * markup headlessly. `mountHole` is the thin DOM wrapper. The animated ball flight lives in
 * a Canvas2D layer (`playView`); both share the pure projector so they agree exactly.
 */

import type { Feature, Hole, Vec } from '../sim/course/contract';
import type { ShotLog } from '../sim/round';
import { holeProjector } from './project';
import { fillFor, roughFor } from './palette';

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

function polyPoints(poly: Vec[], project: (p: Vec) => Vec): string {
  return poly
    .map((p) => {
      const [x, y] = project(p);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Build the SVG markup for a hole. Pure: returns a string, touches no DOM. */
export function renderHoleSVG(hole: Hole, opts: RenderOptions = {}): string {
  const width = opts.width ?? 360;
  const height = opts.height ?? 640;
  const proj = holeProjector(hole, { width, height, padding: opts.padding ?? 24 });
  const place = (p: Vec) => proj.project(p);
  const pts = (poly: Vec[]) => polyPoints(poly, place);

  const featureSvg = (f: Feature) =>
    `<polygon points="${pts(f.poly)}" fill="${fillFor(f.kind)}" stroke="rgba(0,0,0,0.25)" stroke-width="1" />`;

  // Background = native rough behind everything, tinted by biome when known.
  const roughFill = roughFor(opts.biome);
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
        `<line x1="${fx.toFixed(1)}" y1="${fy.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#ffd84a" stroke-width="2" />`,
      );
    }
  }

  // Tee + pin markers.
  const [teeX, teeY] = place(hole.tee);
  const [grX, grY] = place(hole.green);
  parts.push(
    `<circle cx="${teeX.toFixed(1)}" cy="${teeY.toFixed(1)}" r="5" fill="#ffffff" stroke="#000" />`,
  );
  parts.push(
    `<circle cx="${grX.toFixed(1)}" cy="${grY.toFixed(1)}" r="4" fill="#ff3b3b" stroke="#000" />`,
  );

  parts.push('</svg>');
  return parts.join('');
}

/** Thin DOM wrapper: render the hole into a container element. Browser only. */
export function mountHole(container: HTMLElement, hole: Hole, opts: RenderOptions = {}): void {
  container.innerHTML = renderHoleSVG(hole, opts);
}
