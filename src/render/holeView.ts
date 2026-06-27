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
import { sprayBands, SPRAY_GEOM, type SprayGeom } from '../sim/shot';
import { flightControl } from '../sim/flight';
import { holeProjector } from './project';
import { buildScene, scenePrimsToSvg, type ArtFeel } from './style';

/** Spray-cone display geometry (GS-dispersion-2). The cone is drawn straight from the shot's
 *  asymmetric `SprayShape`: a fixed-width GREEN centre wedge (±`greenZ·σ0`) and per-side ORANGE/RED
 *  bands whose widths are PROPORTIONAL to each miss zone's chance (`sideK·σ0·prob`). So a 2% red is
 *  a quarter the width of an 8% orange, a zone at 0% vanishes, and a one-sided suppression leaves
 *  the cone visibly lop-sided — the graphic is exactly the landing distribution. */
export type SprayGeomInput = Partial<SprayGeom> & { centralPct?: number };

/** Resolve a (possibly partial) geometry override over the defaults. `centralPct` (the `_gsSpray`
 *  slider) is a convenience that scales the GREEN wedge width — 80 ⇒ unchanged, 96 ⇒ wider, 40 ⇒
 *  narrower — for live A/B without touching the zone probabilities. */
export function resolveGeom(o?: SprayGeomInput): SprayGeom {
  const g: SprayGeom = { ...SPRAY_GEOM, ...o };
  if (o?.centralPct != null) g.greenZ = SPRAY_GEOM.greenZ * (Math.min(98, Math.max(20, o.centralPct)) / 80);
  return g;
}

/** Fill/stroke for each band tier. */
const BAND_FILL: Record<string, string> = {
  green: 'rgba(95,212,90,0.30)',
  orange: 'rgba(255,196,84,0.18)',
  red: 'rgba(255,76,76,0.20)',
};
const BAND_STROKE: Record<string, string> = {
  green: 'rgba(95,212,90,0.7)',
  orange: 'rgba(255,196,84,0.5)',
  red: 'rgba(255,76,76,0.6)',
};

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
  /** Star-travel theme id (GS-17e) — draws that constellation in the sky. */
  themeId?: string;
  /** Draw a ball marker at this course-space position (interactive play). */
  ball?: Vec;
  /** Draw the aiming spray cone for the contemplated shot (interactive play). */
  spray?: ShotSpread;
  /** Spray cone display-geometry override (the `window._gsSpray` escape hatch). */
  sprayGeom?: SprayGeomInput;
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
  const geom = resolveGeom(opts.sprayGeom);

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
      const bands = sprayBands(opts.spray.shape, opts.spray.angleSpread, geom);
      let outer = 0;
      for (const b of bands) outer = Math.max(outer, Math.abs(b.a0), Math.abs(b.a1));
      extra.push(...sprayArc(opts.spray, outer));
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
    scenePrimsToSvg(buildScene(hole, proj, { width, height, biome: opts.biome, themeId: opts.themeId, art: opts.art })),
  ];

  // Aiming spray cone (GS-dispersion-2): the shot's asymmetric SprayShape, drawn as true arc
  // SECTORS (curved near/far edges at the carry-window radii) so it reads EXACTLY true to the
  // angular physics — a wide shot can't finish past the far arc. A fixed-width green centre wedge,
  // then per-side ORANGE (hook/slice) and RED (duck-hook/shank) bands whose widths are PROPORTIONAL
  // to each zone's chance — so a 2% red is a quarter of an 8% orange, a 0% zone vanishes, and a
  // one-sided suppression reads as a lop-sided cone. Each band is labelled with its true % of shots.
  if (opts.spray && opts.spray.expectedCarry > 0 && opts.spray.angleSpread > 0) {
    const s = opts.spray;
    const bands = sprayBands(s.shape, s.angleSpread, geom);
    const drawn = bands.filter((b) => b.prob > 0 && b.a1 - b.a0 > 1e-6);
    // Draw the miss bands first, the green centre last (so its outline sits on top).
    const ordered = [...drawn.filter((b) => b.tier !== 'green'), ...drawn.filter((b) => b.tier === 'green')];
    for (const b of ordered) {
      parts.push(
        `<polygon points="${pts(spraySector(s, b.a0, b.a1))}" fill="${BAND_FILL[b.tier]}" stroke="${BAND_STROKE[b.tier]}" stroke-width="1" />`,
      );
    }
    // Per-zone % labels (the true share of shots — straight off the shape) at each band's mid-angle.
    const br = (s.bearing * Math.PI) / 180;
    const ptAt = (a: number, r: number): Vec => [s.origin[0] + Math.sin(br + a) * r, s.origin[1] + Math.cos(br + a) * r];
    const rMid = s.carryLow + 0.5 * (s.carryHigh - s.carryLow);
    const zoneLabel = (a: number, r: number, txt: string, size: number): string => {
      const [lx, ly] = place(ptAt(a, r));
      return (
        `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-family="system-ui,sans-serif" font-size="${size}" font-weight="800" ` +
        `fill="#fff" stroke="rgba(0,0,0,0.7)" stroke-width="2.5" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">${txt}</text>`
      );
    };
    for (const b of drawn) {
      // The green % can be a touch noisy at the edges; only label a band wide enough to read.
      const mid = (b.a0 + b.a1) / 2;
      parts.push(zoneLabel(mid, rMid, `${Math.round(b.prob * 100)}%`, b.tier === 'green' ? 13 : 10));
    }
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

  // Shot flight lines (optional): CURVED — a quadratic Bézier that launches along the shot bearing
  // and bends to the landing, so a fade/hook/slice reads as a banana on the map exactly as it
  // animates in the play view (they share `flightControl`). A roll tail (landing→rest) is added so
  // the bounce-and-run is visible, with a small marker where a tree knocked the ball down.
  if (opts.shots) {
    for (const s of opts.shots) {
      const [fx, fy] = place(s.from);
      const [tx, ty] = place(s.result.landing);
      const [cx, cy] = place(flightControl(s.from, s.result.landing, s.result.shotBearing));
      parts.push(
        `<path d="M ${fx.toFixed(1)} ${fy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}" fill="none" stroke="#ffd84a" stroke-width="2" />`,
      );
      if (Math.abs(s.roll) > 0.5) {
        const [rx, ry] = place(s.rest);
        parts.push(
          `<line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${rx.toFixed(1)}" y2="${ry.toFixed(1)}" stroke="#ffd84a" stroke-width="1.5" stroke-dasharray="2 2" opacity="0.7" />`,
        );
      }
      if (s.knockedDown) {
        parts.push(
          `<circle cx="${tx.toFixed(1)}" cy="${ty.toFixed(1)}" r="3" fill="none" stroke="#6fae5e" stroke-width="1.5" />`,
        );
      }
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
