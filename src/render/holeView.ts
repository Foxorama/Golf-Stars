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

import type { Hole, Vec } from '../sim/course/contract';
import type { ShotLog, ShotSpread } from '../sim/round';
import { playBoundsCorners } from '../sim/round';
import { holeProjector } from './project';
import { buildScene, scenePrimsToSvg, type ArtFeel } from './style';

/** Spray-cone tier split. Default ≈80/10/10: the central wedge captures ~80% of shots
 *  (±1.28σ), each flanking wedge ~10%, out to a visible edge at ~2.5σ. Pass {centralZ:
 *  0.674, edgeZ: 2, centralPct: 50} for a 50/25/25 read instead. */
export interface SprayTiers {
  centralZ: number;
  edgeZ: number;
  centralPct: number;
}
export const SPRAY_80_10_10: SprayTiers = { centralZ: 1.2816, edgeZ: 2.5, centralPct: 80 };

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
  /** Draw a ball marker at this course-space position (interactive play). */
  ball?: Vec;
  /** Draw the aiming spray cone for the contemplated shot (interactive play). */
  spray?: ShotSpread;
  /** Spray tier split (defaults to 80/10/10). */
  sprayTiers?: SprayTiers;
  /** Zoom-and-follow: centre the map on this point (the ball) instead of fitting the whole hole. */
  focus?: Vec;
  /** Visible radius (course yards) around `focus`. */
  viewRadius?: number;
  /** Cell-shade art tunables (escape-hatch); defaults applied in the scene builder. */
  art?: ArtFeel;
}

/** Course-space polygon of a spray landing SECTOR: the region swept between radii
 *  [carryLow, carryHigh] and angles [a0, a1] (radians) about the bearing. Matches the
 *  angular-dispersion physics exactly — a rotation preserves length, so the far edge is an
 *  arc of constant distance (carryHigh) in every direction, never a square corner that reads
 *  as exceeding max distance. Use a symmetric ±halfAngle via `sprayArc`, or an off-centre
 *  [a0,a1] to carve out the flanking risk wedges separately from the central likely zone. */
function spraySector(s: ShotSpread, a0: number, a1: number): Vec[] {
  const br = (s.bearing * Math.PI) / 180;
  const at = (r: number, a: number): Vec => [
    s.origin[0] + Math.sin(br + a) * r,
    s.origin[1] + Math.cos(br + a) * r,
  ];
  const N = 10; // samples per arc — smooth enough at map scale
  const span = a1 - a0;
  const pts: Vec[] = [];
  for (let i = 0; i <= N; i++) pts.push(at(s.carryHigh, a0 + (span * i) / N)); // far arc a0→a1
  for (let i = 0; i <= N; i++) pts.push(at(s.carryLow, a1 - (span * i) / N)); // near arc a1→a0
  return pts;
}

/** Symmetric full sector ±`halfAngle` about the bearing (used for the view-fit extent). */
function sprayArc(s: ShotSpread, halfAngle: number): Vec[] {
  return spraySector(s, -halfAngle, halfAngle);
}

/** Midpoint of one of the spray arcs (on the bearing, at radius `r`) — where a distance label sits. */
function arcMid(s: ShotSpread, r: number): Vec {
  const br = (s.bearing * Math.PI) / 180;
  return [s.origin[0] + Math.sin(br) * r, s.origin[1] + Math.cos(br) * r];
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
  const tiers = opts.sprayTiers ?? SPRAY_80_10_10;

  // Points beyond the terrain that must stay in frame: every shot's flight + rest (a wild
  // shot can land off-map), the current ball, and the spray cone's far edges. (Ignored in
  // focus/zoom mode — there the camera follows the ball and a far green may sit off-screen.)
  const extra: Vec[] = [];
  if (!opts.focus) {
    // Keep the OB boundary in frame so its stakes are always visible (they mark the real
    // stroke-and-distance edge — see them, aim away from them).
    extra.push(...playBoundsCorners(hole));
    if (opts.shots) for (const s of opts.shots) extra.push(s.from, s.result.landing, s.rest);
    if (opts.ball) extra.push(opts.ball);
    if (opts.spray && opts.spray.expectedCarry > 0) {
      extra.push(...sprayArc(opts.spray, tiers.edgeZ * opts.spray.angleSd));
    }
  }

  const proj = holeProjector(hole, {
    width,
    height,
    padding: opts.padding ?? 24,
    extra,
    focus: opts.focus,
    viewRadius: opts.viewRadius,
  });
  const place = (p: Vec) => proj.project(p);
  const pts = (poly: Vec[]) => polyPoints(poly, place);

  // The whole static world — rough texture, banded/striped surfaces, depth-banded water,
  // cell-shaded trees, OB boundary, centreline, tee + flag — is built ONCE by the shared
  // scene builder (so the SVG map and the Canvas play view look identical) and serialised.
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    scenePrimsToSvg(buildScene(hole, proj, { width, height, biome: opts.biome, art: opts.art })),
  ];

  // Aiming spray cone: three tiers (central ~80% likely, two flanking ~10% risk zones) drawn
  // as true arc SECTORS (curved near/far edges at the carry-window radii), so the cone reads
  // EXACTLY true to the angular physics — a wide shot can't finish past the far arc. Width
  // scales with club + lie + handicap dispersion; min/max carry are labelled on the arcs so
  // you can read how long the hole plays.
  if (opts.spray && opts.spray.expectedCarry > 0 && opts.spray.angleSd > 0) {
    const s = opts.spray;
    const edgeA = tiers.edgeZ * s.angleSd;
    const centralA = tiers.centralZ * s.angleSd;
    // Two distinct, NON-overlapping zones (the orange no longer sits under the green): the
    // central likely wedge (green) and the two flanking risk wedges (orange) carved out either
    // side of it. They share an edge but don't stack, so each reads as its own band.
    const central = spraySector(s, -centralA, centralA);
    const flankL = spraySector(s, -edgeA, -centralA);
    const flankR = spraySector(s, centralA, edgeA);
    parts.push(
      `<polygon points="${pts(flankL)}" fill="rgba(255,196,84,0.18)" stroke="rgba(255,196,84,0.5)" stroke-width="1" />`,
      `<polygon points="${pts(flankR)}" fill="rgba(255,196,84,0.18)" stroke="rgba(255,196,84,0.5)" stroke-width="1" />`,
      `<polygon points="${pts(central)}" fill="rgba(95,212,90,0.30)" stroke="rgba(95,212,90,0.7)" stroke-width="1" />`,
    );
    // Aim line to the expected-carry centre.
    const [ox, oy] = place(s.origin);
    const cFar = place(arcMid(s, s.expectedCarry));
    parts.push(
      `<line x1="${ox.toFixed(1)}" y1="${oy.toFixed(1)}" x2="${cFar[0].toFixed(1)}" y2="${cFar[1].toFixed(1)}" stroke="rgba(255,255,255,0.55)" stroke-width="1" stroke-dasharray="3 3" />`,
    );
    // Min / max carry labels on the near and far arcs (so the player reads the hole length).
    const label = (r: number, txt: string, dy: number): string => {
      const [lx, ly] = place(arcMid(s, r));
      return (
        `<text x="${lx.toFixed(1)}" y="${(ly + dy).toFixed(1)}" font-family="system-ui,sans-serif" font-size="10" font-weight="700" ` +
        `fill="#fff" stroke="rgba(0,0,0,0.65)" stroke-width="2.5" paint-order="stroke" text-anchor="middle">${txt}</text>`
      );
    };
    parts.push(
      label(s.carryHigh, `${Math.round(s.carryHigh)}y`, -3),
      label(s.carryLow, `${Math.round(s.carryLow)}y`, 11),
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

  // (Tee + flagstick are drawn by the shared scene builder, so the map and the play view agree.)

  if (opts.ball) {
    const [bx, by] = place(opts.ball);
    parts.push(
      `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="4" fill="#fff" stroke="#1a1a1a" stroke-width="1.5" />`,
    );
  }

  parts.push('</svg>');
  return parts.join('');
}

/** Thin DOM wrapper: render the hole into a container element. Browser only. */
export function mountHole(container: HTMLElement, hole: Hole, opts: RenderOptions = {}): void {
  container.innerHTML = renderHoleSVG(hole, opts);
}
