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
import type { PatchKind } from '../sim/patches';
import type { ShotLog, ShotSpread } from '../sim/round';
import { playBoundsCorners, sprayBlocking } from '../sim/round';
import { sprayBands, SPRAY_GEOM, type SprayGeom } from '../sim/shot';
import { flightControl } from '../sim/flight';
import { holeProjector } from './project';
import { buildScene, holeIdPrefix, scenePrimsToSvg, type ArtFeel } from './style';

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

/** Blocked-by-trees zone treatment (GS-spray-block): a dark canopy shade over the part of the cone
 *  a tree would knock down, dashed-edged so the safe remainder of the band reads clearly around it. */
const BLOCK_FILL = 'rgba(14,26,16,0.60)';
const BLOCK_STROKE = 'rgba(150,220,140,0.45)';

// --- Zoom-aware overlay layout (GS-spray-zoom) --------------------------------
// Every overlay layout decision below reads the projector's px-per-yard scale, so the cone stays
// readable at ANY zoom/shot length: a chip's tiny cone sheds the labels that would drown it, a
// zoomed-in driver cone gains arc smoothness, and nothing collides or turns to barcode stripes.
/** Approximate rendered width (px) of a label — SVG has no text metrics, ~0.62em per char is close
 *  enough for the digits+% strings we draw. */
const textWidthPx = (txt: string, fontSize: number): number => txt.length * fontSize * 0.62;
/** Min projected radial gap (px) between the near/far arcs before the min/max carry labels merge
 *  into a single "lo–hi y" readout (they'd otherwise collide at chip distances / low zoom). */
const CARRY_LABEL_MERGE_PX = 20;
/** Blocked-region smoothing thresholds, in screen px (converted to radians/yards per render). */
const BLOCK_MIN_SPAN_PX = 10; // an angular blocked run narrower than this is dropped (the "1-px blocker")
const BLOCK_MERGE_GAP_PX = 14; // a clear gap narrower than this merges its neighbours (no striping)
const BLOCK_MIN_DEPTH_PX = 6; // a radial graze shallower than this is ignored
const BLOCK_SNAP_PX = 8; // a blocked edge this close to the carry arc snaps onto it (no open rim sliver)

export interface RenderOptions {
  width?: number;
  height?: number;
  padding?: number;
  /** If given, draws each shot's flight line over the hole. */
  shots?: ShotLog[];
  /** Player shot-line/tracer colour (GS-tracer — character colour-coded). Defaults to the classic
   *  yellow `#ffd84a` so callers that don't pass a golfer colour (and the render tests) are unchanged. */
  shotColor?: string;
  /** Optional OPPONENT shot trail (the matchplay boss, GS-matchplay) — drawn MUTED beneath the player's
   *  own lines so you can see where the boss played the hole (feedback on their ball, not just a number). */
  ghostShots?: ShotLog[];
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
  /** STABLE spread to FIT the whole-hole view around (GS-power). The live `spray` changes every
   *  frame of the pull gesture (power + aim bearing), and fitting on it made the camera re-fit —
   *  and the seeded scene re-project — per frame (zoom breathing + decor jitter). Pass the
   *  full-power pin-aim spread here so the fit holds still while the drawn cone moves. Defaults
   *  to `spray` (existing callers/tests unchanged). Ignored in focus/zoom mode like the rest of
   *  the fit extras. */
  fitSpray?: ShotSpread;
  /** Predicted curved PUTT path (course-space points, GS-greens-3) — drawn as a dotted break line
   *  from the ball, so the player sees how the slope will curl the putt. */
  puttPath?: Vec[];
  /** Spray cone display-geometry override (the `window._gsSpray` escape hatch). */
  sprayGeom?: SprayGeomInput;
  /** Zoom-and-follow: centre the map on this point (the ball) instead of fitting the whole hole. */
  focus?: Vec;
  /** Visible radius (course yards) around `focus`. */
  viewRadius?: number;
  /** Where the focus point sits vertically (0=top..1=bottom); higher = ball lower, more shot ahead. */
  focusBias?: number;
  /** Override the up-screen direction (default tee→green) — the follow-cam passes ball→pin so the
   *  pin stays at the top even when the ball is long of the green. */
  up?: Vec;
  /** Cell-shade art tunables (escape-hatch); defaults applied in the scene builder. */
  art?: ArtFeel;
  /** Rainbow Ball (GS-rainbow): paint the hole as RAINBOW ROAD (rainbow ribbon through the stars,
   *  off-road = void). Baked from the live loadout at the app boundary; render-only. */
  rainbow?: boolean;
  /** Trade-camp tents (GS-tents): draw the ring of collidable tents around the green (the trade-market
   *  route's signature). Baked from the course effect at the app boundary; render-only. */
  tradeTents?: boolean;
  /** Meteor-strike scorch craters (GS-meteor-scorch) — drawn from the sim's own mark source. */
  meteorScorch?: boolean;
  /** Effect ground patches (GS-journey-fx-2): comet stardust / frostfall ice / debris wreckage —
   *  drawn from the sim's own patch source. Baked from the course effect at the app boundary. */
  groundPatch?: PatchKind;
}

/** Course-space polygon of a spray landing SECTOR: the region swept between radii
 *  [carryLow, carryHigh] and angles [a0, a1] (radians) about the bearing. Matches the
 *  angular-dispersion physics exactly — a rotation preserves length, so the far edge is an
 *  arc of constant distance (carryHigh) in every direction, never a square corner that reads
 *  as exceeding max distance. Use a symmetric ±halfAngle via `sprayArc`, or an off-centre
 *  [a0,a1] to carve out the flanking risk wedges separately from the central likely zone. */
/** Course-space point at band angle `a` (radians off the bearing) and radius `r` — the ONE mapping
 *  every cone element (sectors, labels, blocked zones) shares, including the lefty mirror
 *  (GS-lefty: the band angle negates about the bearing, matching resolveShot's lateral sign flip). */
function sprayPoint(s: ShotSpread, a: number, r: number): Vec {
  const br = (s.bearing * Math.PI) / 180;
  const h = s.lefty ? -1 : 1;
  return [s.origin[0] + Math.sin(br + h * a) * r, s.origin[1] + Math.cos(br + h * a) * r];
}

function spraySector(s: ShotSpread, a0: number, a1: number, segs = 10): Vec[] {
  const N = Math.max(2, Math.round(segs)); // samples per arc
  const span = a1 - a0;
  const pts: Vec[] = [];
  for (let i = 0; i <= N; i++) pts.push(sprayPoint(s, a0 + (span * i) / N, s.carryHigh)); // far arc a0→a1
  for (let i = 0; i <= N; i++) pts.push(sprayPoint(s, a1 - (span * i) / N, s.carryLow)); // near arc a1→a0
  return pts;
}

/** Symmetric full sector ±`halfAngle` about the bearing (used for the view-fit extent). */
function sprayArc(s: ShotSpread, halfAngle: number): Vec[] {
  return spraySector(s, -halfAngle, halfAngle);
}

/** Midpoint of one of the spray arcs (on the bearing, at radius `r`) — where a distance label sits. */
function arcMid(s: ShotSpread, r: number): Vec {
  return sprayPoint(s, 0, r);
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
    if (opts.ghostShots) for (const s of opts.ghostShots) extra.push(s.from, s.result.landing, s.rest);
    if (opts.ball) extra.push(opts.ball);
    const fit = opts.fitSpray ?? opts.spray;
    if (fit && fit.expectedCarry > 0) {
      const bands = sprayBands(fit.shape, fit.angleSpread, geom);
      let outer = 0;
      for (const b of bands) outer = Math.max(outer, Math.abs(b.a0), Math.abs(b.a1));
      extra.push(...sprayArc(fit, outer));
    }
  }

  const proj = holeProjector(hole, {
    width,
    height,
    padding: opts.padding ?? 24,
    extra,
    focus: opts.focus,
    viewRadius: opts.viewRadius,
    focusBias: opts.focusBias,
    up: opts.up,
  });
  const place = (p: Vec) => proj.project(p);
  const pts = (poly: Vec[]) => polyPoints(poly, place);

  // The whole static world — rough texture, banded/striped surfaces, depth-banded water,
  // cell-shaded trees, OB boundary, centreline, tee + flag — is built ONCE by the shared
  // scene builder (so the SVG map and the Canvas play view look identical) and serialised.
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    scenePrimsToSvg(
      buildScene(hole, proj, { width, height, biome: opts.biome, themeId: opts.themeId, art: opts.art, rainbow: opts.rainbow, tradeTents: opts.tradeTents, meteorScorch: opts.meteorScorch, groundPatch: opts.groundPatch }),
      holeIdPrefix(hole), // ids are document-global — a per-hole prefix keeps co-mounted hole SVGs from cross-clipping
    ),
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
    // px-per-yard at the current framing — every layout decision below reads it (GS-spray-zoom),
    // so the cone stays readable at any zoom level / shot distance.
    const pxYd = Math.max(1e-6, proj.scale);
    const rMid = s.carryLow + 0.5 * (s.carryHigh - s.carryLow);
    // Arc smoothness follows the PROJECTED arc length (~8px per segment), not a fixed count — a
    // zoomed-in cone stays a true curve, a distant one stays cheap.
    const segsFor = (a0: number, a1: number): number =>
      Math.max(6, Math.min(48, Math.ceil((Math.abs(a1 - a0) * s.carryHigh * pxYd) / 8)));
    // Draw the miss bands first, the green centre last (so its outline sits on top).
    const ordered = [...drawn.filter((b) => b.tier !== 'green'), ...drawn.filter((b) => b.tier === 'green')];
    for (const b of ordered) {
      parts.push(
        `<polygon points="${pts(spraySector(s, b.a0, b.a1, segsFor(b.a0, b.a1)))}" fill="${BAND_FILL[b.tier]}" stroke="${BAND_STROKE[b.tier]}" stroke-width="1" />`,
      );
    }
    // Blocked-by-trees zones (GS-spray-block): the part of the cone a tall obstacle would knock out
    // of the air, probed with the sim's own knockdown walk and smoothed in SCREEN terms — slivers
    // narrower than a few px are dropped, near-touching runs merge, edges snap to the carry arcs —
    // so the shading reads as "that line is wooded", never a 1-px barcode. The clear remainder of
    // the cone still draws its bands untouched: that's the safe line.
    const blocked = sprayBlocking(hole, s, geom, {
      minSpanRad: BLOCK_MIN_SPAN_PX / (pxYd * rMid),
      mergeGapRad: BLOCK_MERGE_GAP_PX / (pxYd * rMid),
      minDepthYd: BLOCK_MIN_DEPTH_PX / pxYd,
      snapYd: BLOCK_SNAP_PX / pxYd,
    });
    for (const region of blocked) {
      const poly: Vec[] = [];
      for (const sm of region.samples) poly.push(sprayPoint(s, sm.a, sm.r1)); // outer edge a0→a1
      for (let i = region.samples.length - 1; i >= 0; i--) {
        const sm = region.samples[i]!;
        poly.push(sprayPoint(s, sm.a, sm.r0)); // inner edge a1→a0
      }
      parts.push(
        `<polygon points="${pts(poly)}" fill="${BLOCK_FILL}" stroke="${BLOCK_STROKE}" stroke-width="1" stroke-dasharray="3 2" />`,
      );
      // A canopy glyph when the region is big enough to carry one (px-tested, so it never swamps
      // a small patch): marks the shading as trees at a glance.
      const mid = region.samples[Math.floor(region.samples.length / 2)]!;
      const wPx = (region.a1 - region.a0) * rMid * pxYd;
      const dPx = (mid.r1 - mid.r0) * pxYd;
      if (wPx >= 26 && dPx >= 16) {
        const [gx, gy] = place(sprayPoint(s, mid.a, (mid.r0 + mid.r1) / 2));
        parts.push(
          `<text x="${gx.toFixed(1)}" y="${gy.toFixed(1)}" font-size="12" text-anchor="middle" dominant-baseline="middle" opacity="0.9">🌲</text>`,
        );
      }
    }
    // Per-zone % labels (the true share of shots — straight off the shape) at each band's mid-angle.
    // A label only draws when its band is wide enough ON SCREEN to hold it (chip cones and low zooms
    // shed them instead of collapsing into an overlapping smudge).
    const zoneLabel = (a: number, r: number, txt: string, size: number): string => {
      const [lx, ly] = place(sprayPoint(s, a, r));
      return (
        `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-family="system-ui,sans-serif" font-size="${size}" font-weight="800" ` +
        `fill="#fff" stroke="rgba(0,0,0,0.7)" stroke-width="2.5" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">${txt}</text>`
      );
    };
    for (const b of drawn) {
      const txt = `${Math.round(b.prob * 100)}%`;
      const size = b.tier === 'green' ? 13 : 10;
      const bandPx = (b.a1 - b.a0) * rMid * pxYd; // the band's projected arc width where the label sits
      if (bandPx < textWidthPx(txt, size) + 2) continue;
      parts.push(zoneLabel((b.a0 + b.a1) / 2, rMid, txt, size));
    }
    // Aim line to the expected-carry centre.
    const [ox, oy] = place(s.origin);
    const cFar = place(arcMid(s, s.expectedCarry));
    parts.push(
      `<line x1="${ox.toFixed(1)}" y1="${oy.toFixed(1)}" x2="${cFar[0].toFixed(1)}" y2="${cFar[1].toFixed(1)}" stroke="rgba(255,255,255,0.55)" stroke-width="1" stroke-dasharray="3 3" />`,
    );
    // Min / max carry labels on the near and far arcs (so the player reads the hole length). When
    // the carry window projects thinner than the two labels (a chip, or a zoomed-out map) they'd
    // collide — merge them into a single "lo–hi y" readout past the far arc instead.
    const label = (r: number, txt: string, dy: number): string => {
      const [lx, ly] = place(arcMid(s, r));
      return (
        `<text x="${lx.toFixed(1)}" y="${(ly + dy).toFixed(1)}" font-family="system-ui,sans-serif" font-size="10" font-weight="700" ` +
        `fill="#fff" stroke="rgba(0,0,0,0.65)" stroke-width="2.5" paint-order="stroke" text-anchor="middle">${txt}</text>`
      );
    };
    const lo = Math.round(s.carryLow);
    const hi = Math.round(s.carryHigh);
    if ((s.carryHigh - s.carryLow) * pxYd < CARRY_LABEL_MERGE_PX || lo === hi) {
      parts.push(label(s.carryHigh, lo === hi ? `${hi}y` : `${lo}–${hi}y`, -4));
    } else {
      parts.push(label(s.carryHigh, `${hi}y`, -3), label(s.carryLow, `${lo}y`, 11));
    }
  }

  // Shot flight lines (optional): CURVED — a quadratic Bézier that launches along the shot bearing
  // and bends to the landing, so a fade/hook/slice reads as a banana on the map exactly as it
  // animates in the play view (they share `flightControl`). A roll tail (landing→rest) is added so
  // the bounce-and-run is visible, with a small marker where a tree knocked the ball down.
  // The opponent's (boss's) shot trail, drawn FIRST so the player's own lines sit on top — a muted
  // dashed crimson path with a small ring at each rest, so you literally see the boss on the course.
  if (opts.ghostShots) {
    for (const s of opts.ghostShots) {
      const [fx, fy] = place(s.from);
      const [tx, ty] = place(s.result.landing);
      const [cx, cy] = place(flightControl(s.from, s.result.landing, s.result.shotBearing));
      parts.push(
        `<path d="M ${fx.toFixed(1)} ${fy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}" fill="none" stroke="#ff6b6b" stroke-width="1.6" stroke-dasharray="4 3" opacity="0.55" />`,
      );
      const [rx, ry] = place(s.rest);
      parts.push(
        `<circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="2.6" fill="#ff6b6b" opacity="0.5" />`,
      );
    }
  }

  if (opts.shots) {
    const shotCol = opts.shotColor ?? '#ffd84a';
    for (const s of opts.shots) {
      const [fx, fy] = place(s.from);
      const [tx, ty] = place(s.result.landing);
      const [cx, cy] = place(flightControl(s.from, s.result.landing, s.result.shotBearing));
      parts.push(
        `<path d="M ${fx.toFixed(1)} ${fy.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}" fill="none" stroke="${shotCol}" stroke-width="2" />`,
      );
      if (Math.abs(s.roll) > 0.5) {
        const [rx, ry] = place(s.rest);
        parts.push(
          `<line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${rx.toFixed(1)}" y2="${ry.toFixed(1)}" stroke="${shotCol}" stroke-width="1.5" stroke-dasharray="2 2" opacity="0.7" />`,
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

  // Predicted putt break line (GS-greens-3): a dotted curve showing how the slope will curl the ball,
  // with a small ✕ where the player's current aim is pointed (the high-side read).
  if (opts.puttPath && opts.puttPath.length > 1) {
    const pts = opts.puttPath.map((p) => place(p));
    const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="#ffe14a" stroke-width="2" stroke-dasharray="3 3" opacity="0.85" stroke-linecap="round" />`);
    const tip = pts[pts.length - 1]!;
    parts.push(`<circle cx="${tip[0].toFixed(1)}" cy="${tip[1].toFixed(1)}" r="3" fill="none" stroke="#ffe14a" stroke-width="1.6" opacity="0.9" />`);
  }

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
