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

/** Spray-cone tier split, expressed as z-scores (σ multiples) about the shot bearing — the
 *  canonical geometry. The drawn cone has THREE bands per side, and the % of shots in each is
 *  DERIVED from these z's via the normal CDF, so the on-screen numbers read EXACTLY true:
 *   - central GREEN zone   |z| < centralZ                  (the likely landing area)
 *   - flanking ORANGE zone  centralZ < |z| < edgeZ          (a risky miss)
 *   - outer RED zone        |z| > edgeZ, drawn to outerZ     (a hook/shank — the wild tail)
 *  Defaults give ≈80% centre, ≈8% each orange, ≈2% each red (the red is the whole tail past
 *  edgeZ; outerZ is only how far it's DRAWN). */
export interface SprayTiers {
  centralZ: number;
  edgeZ: number;
  outerZ: number;
}
/** centralZ 1.2816 → 80% centre; edgeZ 2.0537 → 8% each orange + 2% each red tail. */
export const SPRAY_TIERS: SprayTiers = { centralZ: 1.2816, edgeZ: 2.0537, outerZ: 3.2 };

/** A partial tier override (the `window._gsSpray` escape hatch). `centralPct` is a convenience
 *  that resizes the green centre by % of shots — converted to centralZ via the inverse normal. */
export type SprayTiersInput = Partial<SprayTiers> & { centralPct?: number };

/** Standard-normal CDF Φ(z) via an erf approximation (Abramowitz & Stegun 7.1.26). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}
/** Inverse normal CDF (probit) by bisection — cosmetic precision is plenty for the % slider. */
function probit(p: number): number {
  let lo = -6,
    hi = 6;
  for (let i = 0; i < 48; i++) {
    const m = (lo + hi) / 2;
    if (normalCdf(m) < p) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
/** Resolve a (possibly partial) override over the defaults, applying the `centralPct` shortcut. */
export function resolveTiers(o?: SprayTiersInput): SprayTiers {
  const t: SprayTiers = { ...SPRAY_TIERS, ...o };
  if (o?.centralPct != null) t.centralZ = probit(0.5 + Math.min(98, Math.max(2, o.centralPct)) / 200);
  return t;
}
/** % of shots landing in each band (fractions of 100): central, each orange flank, each red flank. */
export function tierPercents(t: SprayTiers): { central: number; side: number; red: number } {
  const central = (2 * normalCdf(t.centralZ) - 1) * 100;
  const side = (normalCdf(t.edgeZ) - normalCdf(t.centralZ)) * 100;
  const red = (1 - normalCdf(t.edgeZ)) * 100;
  return { central, side, red };
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
  /** Draw a ball marker at this course-space position (interactive play). */
  ball?: Vec;
  /** Draw the aiming spray cone for the contemplated shot (interactive play). */
  spray?: ShotSpread;
  /** Spray tier split override (defaults to {@link SPRAY_TIERS}). */
  sprayTiers?: SprayTiersInput;
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
  const tiers = resolveTiers(opts.sprayTiers);

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
      extra.push(...sprayArc(opts.spray, tiers.outerZ * opts.spray.angleSd));
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

  // Aiming spray cone: THREE distinct, non-overlapping bands per side, drawn as true arc
  // SECTORS (curved near/far edges at the carry-window radii) so it reads EXACTLY true to the
  // angular physics — a wide shot can't finish past the far arc. From the centre out: a green
  // likely zone, an orange risky-miss zone, and a red hook/shank tail. Each band is labelled
  // with the % of shots that land in it (derived from the tier z's), and the near/far arcs
  // carry the min/max distance, so the player reads both where it'll go and how far.
  if (opts.spray && opts.spray.expectedCarry > 0 && opts.spray.angleSd > 0) {
    const s = opts.spray;
    const centralA = tiers.centralZ * s.angleSd;
    const edgeA = tiers.edgeZ * s.angleSd;
    const outerA = tiers.outerZ * s.angleSd;
    // Carve the cone into bands that share edges but never stack, so each reads as its own zone.
    const central = spraySector(s, -centralA, centralA);
    const orangeL = spraySector(s, -edgeA, -centralA);
    const orangeR = spraySector(s, centralA, edgeA);
    const redL = spraySector(s, -outerA, -edgeA);
    const redR = spraySector(s, edgeA, outerA);
    parts.push(
      `<polygon points="${pts(redL)}" fill="rgba(255,76,76,0.20)" stroke="rgba(255,76,76,0.6)" stroke-width="1" />`,
      `<polygon points="${pts(redR)}" fill="rgba(255,76,76,0.20)" stroke="rgba(255,76,76,0.6)" stroke-width="1" />`,
      `<polygon points="${pts(orangeL)}" fill="rgba(255,196,84,0.18)" stroke="rgba(255,196,84,0.5)" stroke-width="1" />`,
      `<polygon points="${pts(orangeR)}" fill="rgba(255,196,84,0.18)" stroke="rgba(255,196,84,0.5)" stroke-width="1" />`,
      `<polygon points="${pts(central)}" fill="rgba(95,212,90,0.30)" stroke="rgba(95,212,90,0.7)" stroke-width="1" />`,
    );
    // Per-zone % labels (what share of shots land there), placed at each band's mid-angle and a
    // mid-radius so they sit inside their wedge. Derived from the tier z's → reads exactly true.
    const pct = tierPercents(tiers);
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
    parts.push(
      zoneLabel(0, rMid, `${Math.round(pct.central)}%`, 13),
      zoneLabel((centralA + edgeA) / 2, rMid, `${Math.round(pct.side)}%`, 10),
      zoneLabel(-(centralA + edgeA) / 2, rMid, `${Math.round(pct.side)}%`, 10),
      zoneLabel((edgeA + outerA) / 2, rMid, `${Math.round(pct.red)}%`, 10),
      zoneLabel(-(edgeA + outerA) / 2, rMid, `${Math.round(pct.red)}%`, 10),
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
