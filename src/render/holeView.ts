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

import { dist, type Hole, type Vec } from '../sim/course/contract';
import type { PatchKind } from '../sim/patches';
import type { ShotLog, ShotSpread } from '../sim/round';
import { playBoundsCorners, sprayBlocking } from '../sim/round';
import { sprayBands, SPRAY_GEOM, type SprayGeom } from '../sim/shot';
import { flightControl } from '../sim/flight';
import { tradeTents } from '../sim/tents';
import { archetypeFor, type BiomeArchetype } from '../sim/course/themes';
import { holeProjector } from './project';
import { buildScene, holeIdPrefix, scenePrimsToSvg, type ArtFeel } from './style';
import { ballRadiusPx, ballSVG, ballSkinFor, type BallSkin } from './ball';

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

/** Blocked-zone treatment (GS-spray-block): a dark shade over the part of the cone a tall obstacle
 *  (tree canopy / tent roof) would interrupt, dashed-edged so the safe remainder of the band reads
 *  clearly around it. */
const BLOCK_FILL = 'rgba(14,26,16,0.60)';
const BLOCK_STROKE = 'rgba(150,220,140,0.45)';
/** Glyph marking what blocks a shaded region. The TREE glyph is per world archetype so it matches the
 *  silhouette actually drawn (styleFlora) — a fixed conifer 🌲 stamped pines over lyra's round oaks and
 *  every other non-frost world (the "pine trees where there are none" bug). Tents are always ⛺. */
const TENT_GLYPH = '⛺';
/** Ship-corridor bulkhead (GS-ship-walls): a shaded cone slice here means the shot ricochets off a
 *  metal wall and bounces back onto the deck — a barrier glyph so the player reads the bounce. */
const WALL_GLYPH = '🧱';
const TREE_GLYPH: Record<BiomeArchetype, string> = {
  verdant: '🌳', // round parkland oak
  fungal: '🍄', // glowing mushroom stand
  frost: '🌲', // snow-dusted conifer
  inferno: '🪵', // charred ember snag
  desert: '🌵', // saguaro
  crystal: '🔷', // prism shard
  tempest: '🌿', // wind-bent storm scrub
  ocean: '🌴', // palm
  cetus: '🪨', // coastal sea-stack
  void: '🪨', // asteroid crag
  swamp: '🌾', // dead mangrove / bog reeds
  metal: '📡', // rusted scrap mast / antenna
  derelict: '🛰️', // a broken antenna spar / dead dish jutting from the hull
  asgard: '🍁', // Yggdrasil golden-leaf ash
  earth: '🌾', // links gorse / dune grass — the treeless course's only "treeline"
};
const blockGlyph = (src: 'trees' | 'tents' | 'walls', arch: BiomeArchetype): string =>
  src === 'tents' ? TENT_GLYPH : src === 'walls' ? WALL_GLYPH : TREE_GLYPH[arch];

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
  /** The COVER that ball wears (GS-ball-art). The aim map is where the player spends their time
   *  looking at the ball, so it wears the same skin the animated one does — absent ⇒ plain white
   *  `classic`, i.e. unchanged. */
  ballSkin?: BallSkin;
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
  /** GS-putt-depth: the fraction (0..1) of the putt path the putter can CONFIDENTLY read. The prefix
   *  up to it is drawn bright/solid-dashed; the rest fades to a faint guess — so a longer putt than
   *  your putter's range reads "blind" past the confident length, and better putters read further. */
  puttReadFrac?: number;
  /** Predicted approach roll/check path (course-space points landing→rest, GS-backspin-line) — the
   *  "backspin helper line", drawn from the aim-line touchdown so the player sees where a spinning
   *  wedge will check back and curl on a contoured green. Lives in the shot-cone overlay group. */
  spinPath?: Vec[];
  /** GS-backspin-line: the fraction (0..1) of the spin path drawn with confidence. The prefix up to it
   *  is solid; the rest STOPS at a terminus dot — spin-read gear (Spin Guide / Trajectory Computer)
   *  stretches it. Undefined ⇒ full read (a short/self-evident roll). */
  spinReadFrac?: number;
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

/** Stable id for the putt break-line overlay group — lets the interactive aim nudge redraw only
 *  the break line (renderPuttOverlaySVG) rather than the whole scene (the putt-zoom-lag fix). */
export const PUTT_OVERLAY_ID = 'gs-putt-overlay';

/** Build the putt break-line elements (the dotted curl + terminus/finish marker) for the current
 *  aim, projected by `place`. Returns [] when there's no putt path. Shared by the full-scene render
 *  and the surgical overlay-only refresh so the drawn line is byte-identical either way. */
function puttOverlayParts(place: (p: Vec) => Vec, opts: RenderOptions): string[] {
  if (!opts.puttPath || opts.puttPath.length <= 1) return [];
  const out: string[] = [];
  const pts = opts.puttPath.map((p) => place(p));
  const n = pts.length;
  const toPath = (seg: Vec[]) => seg.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  // GS-putt-depth (retuned GS-putt-read): draw ONLY the confident read (out to the putter's range)
  // — beyond it the line simply STOPS at a terminus dot. The old faint "guessing" tail still traced
  // the whole break to the cup, which read as a free full-length read; with the blind stretch drawn
  // as NOTHING, putter upgrades / the Mystic Mole visibly STRETCH the line. `puttReadFrac`
  // undefined ⇒ the whole line is confident (back-compat / short putt).
  const frac = opts.puttReadFrac == null ? 1 : Math.max(0, Math.min(1, opts.puttReadFrac));
  const cut = Math.max(1, Math.round(frac * (n - 1)));
  const sure = pts.slice(0, cut + 1);
  out.push(`<path d="${toPath(sure)}" fill="none" stroke="#ffe14a" stroke-width="2" stroke-dasharray="3 3" opacity="0.9" stroke-linecap="round" />`);
  if (cut < n - 1) {
    // The read ends HERE — a filled terminus dot; the rest of the break is yours to judge.
    const edge = pts[cut]!;
    out.push(`<circle cx="${edge[0].toFixed(1)}" cy="${edge[1].toFixed(1)}" r="2.6" fill="#ffe14a" opacity="0.85" />`);
  } else {
    // Full read: a small open ring where the ball finishes (at the cup on the ideal line).
    const tip = pts[n - 1]!;
    out.push(`<circle cx="${tip[0].toFixed(1)}" cy="${tip[1].toFixed(1)}" r="3" fill="none" stroke="#ffe14a" stroke-width="1.6" opacity="0.9" />`);
  }
  return out;
}

/** Redraw ONLY the putt break-line overlay for a new aim, reusing the SAME focus/zoom framing as the
 *  mounted putt map. Returns the `<g id="gs-putt-overlay">…</g>` group markup, so the interactive
 *  aim nudge can swap this one element in place — the expensive scene (flora, green contour art,
 *  isolines) is built once and left untouched. Focus/zoom mode only (the putt screen always sets
 *  `focus`), so the projector needs no whole-hole fit `extra` and is cheap to rebuild. */
export function renderPuttOverlaySVG(hole: Hole, opts: RenderOptions = {}): string {
  const proj = holeProjector(hole, {
    width: opts.width ?? 360,
    height: opts.height ?? 640,
    padding: opts.padding ?? 24,
    focus: opts.focus,
    viewRadius: opts.viewRadius,
    focusBias: opts.focusBias,
    up: opts.up,
  });
  return `<g id="${PUTT_OVERLAY_ID}">${puttOverlayParts((p) => proj.project(p), opts).join('')}</g>`;
}

/** Stable id for the aiming spray-cone overlay group — lets the interactive power-pull redraw only
 *  the cone (renderShotOverlaySVG) rather than the whole scene (the shot-decision-lag fix, the
 *  sibling of the putt overlay above). */
export const SHOT_OVERLAY_ID = 'gs-shot-overlay';

type Proj = ReturnType<typeof holeProjector>;

/** Build the aiming spray-cone elements (bands, blocked zones, %/carry labels, aim line) for the
 *  current spray, projected by `proj`. Assumes a valid `opts.spray`. Shared by the full-scene render
 *  and the surgical overlay-only refresh so the drawn cone is byte-identical either way. */
function shotConeParts(hole: Hole, proj: Proj, opts: RenderOptions, geom: SprayGeom): string[] {
  const out: string[] = [];
  const place = (p: Vec) => proj.project(p);
  const pts = (poly: Vec[]) => polyPoints(poly, place);
  const s = opts.spray!;
  // The world archetype — so a blocked-zone TREE glyph matches the silhouette this world actually
  // draws (round oak / mushroom / conifer / saguaro / …), never a hardcoded pine.
  const arch = archetypeFor(opts.themeId, opts.biome ?? '');
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
    out.push(
      `<polygon points="${pts(spraySector(s, b.a0, b.a1, segsFor(b.a0, b.a1)))}" fill="${BAND_FILL[b.tier]}" stroke="${BAND_STROKE[b.tier]}" stroke-width="1" />`,
    );
  }
  // Blocked zones (GS-spray-block / GS-spray-block-2): the slices of the cone a tall obstacle
  // (tree canopy, or a trade-camp tent when the effect is armed) would interrupt, probed with the
  // sim's own knockdown/bounce walks. A blocked slice shades from the object to the cone's FAR
  // edge (the line is dead past it — no floating clear pocket); a line the whole swing flies over
  // stays unshaded. Smoothed in SCREEN terms — slivers narrower than a few px are dropped,
  // near-touching runs merge, near edges snap to the carry arc — so the shading reads as "that
  // line is blocked", never a 1-px barcode. The clear remainder of the cone still draws its
  // bands untouched: that's the safe line.
  const blocked = sprayBlocking(hole, s, geom, {
    minSpanRad: BLOCK_MIN_SPAN_PX / (pxYd * rMid),
    mergeGapRad: BLOCK_MERGE_GAP_PX / (pxYd * rMid),
    minDepthYd: BLOCK_MIN_DEPTH_PX / pxYd,
    snapYd: BLOCK_SNAP_PX / pxYd,
    tents: opts.tradeTents && hole.tents ? tradeTents(hole) : undefined,
    // Ship-corridor bulkheads (GS-ship-walls): the derelict's collidable walls block the aim cone
    // like a treeline, so a shot that would ricochet reads blocked. Absent on every other world.
    walls: hole.walls,
  });
  for (const region of blocked) {
    const poly: Vec[] = [];
    for (const sm of region.samples) poly.push(sprayPoint(s, sm.a, sm.r1)); // outer edge a0→a1
    for (let i = region.samples.length - 1; i >= 0; i--) {
      const sm = region.samples[i]!;
      poly.push(sprayPoint(s, sm.a, sm.r0)); // inner edge a1→a0
    }
    out.push(
      `<polygon points="${pts(poly)}" fill="${BLOCK_FILL}" stroke="${BLOCK_STROKE}" stroke-width="1" stroke-dasharray="3 2" />`,
    );
    // A glyph when the region is big enough to carry one (px-tested, so it never swamps a small
    // patch): marks WHAT blocks the shading at a glance — tree canopy or a trade-camp tent roof.
    const mid = region.samples[Math.floor(region.samples.length / 2)]!;
    const wPx = (region.a1 - region.a0) * rMid * pxYd;
    const dPx = (mid.r1 - mid.r0) * pxYd;
    if (wPx >= 26 && dPx >= 16) {
      const [gx, gy] = place(sprayPoint(s, mid.a, (mid.r0 + mid.r1) / 2));
      out.push(
        `<text x="${gx.toFixed(1)}" y="${gy.toFixed(1)}" font-size="12" text-anchor="middle" dominant-baseline="middle" opacity="0.9">${blockGlyph(region.src, arch)}</text>`,
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
    out.push(zoneLabel((b.a0 + b.a1) / 2, rMid, txt, size));
  }
  // Aim line to the expected-carry centre.
  const [ox, oy] = place(s.origin);
  const cFar = place(arcMid(s, s.expectedCarry));
  out.push(
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
    out.push(label(s.carryHigh, lo === hi ? `${hi}y` : `${lo}–${hi}y`, -4));
  } else {
    out.push(label(s.carryHigh, `${hi}y`, -3), label(s.carryLow, `${lo}y`, 11));
  }
  return out;
}

/** Backspin helper line parts (GS-backspin-line): a small ring at the touchdown + the predicted
 *  roll/check curve, drawn in cool cyan so it reads apart from the yellow putt break line and the
 *  green/amber/red spray cone. The confident prefix (out to the spin-read range) is solid; the rest
 *  STOPS at a terminus dot (spin-read gear stretches it). Full read ⇒ an open ring where it settles.
 *  Shares the shot-overlay group so the pull-to-power gesture redraws it with the cone. */
const SPIN_LINE_INK = '#7fe0ff';
const SPIN_LINE_HALO = '#06222b'; // dark backing so the cyan reads over the green cone + fall-line arrows
function spinOverlayParts(place: (p: Vec) => Vec, opts: RenderOptions): string[] {
  if (!opts.spinPath || opts.spinPath.length < 2) return [];
  const pts = opts.spinPath.map((p) => place(p));
  const n = pts.length;
  const out: string[] = [];
  const toPath = (seg: Vec[]) => seg.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const frac = opts.spinReadFrac == null ? 1 : Math.max(0, Math.min(1, opts.spinReadFrac));
  // Cut the confident prefix by ARC LENGTH, not point index: a straight (non-contoured) roll is only
  // 2 points, so an index cut would always land on the last point and the read gearing would never
  // show a terminus. Interpolating at `frac · totalLength` puts the terminus exactly at the read reach.
  const segLen: number[] = [];
  let total = 0;
  for (let i = 1; i < n; i++) {
    const l = Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    segLen.push(l);
    total += l;
  }
  const sure: Vec[] = [pts[0]!];
  let isFull = frac >= 1 || total < 1e-6;
  if (!isFull) {
    const targetLen = frac * total;
    let acc = 0;
    for (let i = 1; i < n; i++) {
      const l = segLen[i - 1]!;
      if (acc + l >= targetLen) {
        const t = l < 1e-6 ? 0 : (targetLen - acc) / l;
        sure.push([pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * t, pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * t]);
        break;
      }
      sure.push(pts[i]!);
      acc += l;
    }
  } else {
    for (let i = 1; i < n; i++) sure.push(pts[i]!);
  }
  const d = toPath(sure);
  const land = pts[0]!;
  const tip = sure[sure.length - 1]!;
  // A dark halo under the whole confident line + a hollow ring at the touchdown, so both stay legible
  // over the spray cone. The bright cyan overpaints on top.
  out.push(`<path d="${d}" fill="none" stroke="${SPIN_LINE_HALO}" stroke-width="4" opacity="0.5" stroke-linecap="round" />`);
  out.push(`<circle cx="${land[0].toFixed(1)}" cy="${land[1].toFixed(1)}" r="3.2" fill="none" stroke="${SPIN_LINE_HALO}" stroke-width="3" opacity="0.5" />`);
  out.push(`<circle cx="${land[0].toFixed(1)}" cy="${land[1].toFixed(1)}" r="3.2" fill="none" stroke="${SPIN_LINE_INK}" stroke-width="1.6" opacity="0.95" />`);
  out.push(`<path d="${d}" fill="none" stroke="${SPIN_LINE_INK}" stroke-width="2" stroke-dasharray="2 3" opacity="0.95" stroke-linecap="round" />`);
  if (!isFull) {
    // The read ends HERE — a filled terminus dot; the rest of the roll is yours to judge.
    out.push(`<circle cx="${tip[0].toFixed(1)}" cy="${tip[1].toFixed(1)}" r="3.1" fill="${SPIN_LINE_HALO}" opacity="0.55" />`);
    out.push(`<circle cx="${tip[0].toFixed(1)}" cy="${tip[1].toFixed(1)}" r="2.4" fill="${SPIN_LINE_INK}" opacity="0.95" />`);
  } else {
    // Full read: a bright open ring where the ball settles after the check + curl.
    out.push(`<circle cx="${tip[0].toFixed(1)}" cy="${tip[1].toFixed(1)}" r="3.4" fill="none" stroke="${SPIN_LINE_HALO}" stroke-width="3" opacity="0.5" />`);
    out.push(`<circle cx="${tip[0].toFixed(1)}" cy="${tip[1].toFixed(1)}" r="3.4" fill="none" stroke="${SPIN_LINE_INK}" stroke-width="1.8" opacity="0.95" />`);
  }
  return out;
}

/** Redraw ONLY the aiming spray-cone overlay for a new charge/aim, reusing the SAME focus/zoom
 *  framing as the mounted decision map. Returns the `<g id="gs-shot-overlay">…</g>` group markup so
 *  the pull-to-power gesture can swap this one element in place — the expensive scene (flora, rough
 *  gradient, green contour art) is built once and left untouched. FOCUS/ZOOM MODE ONLY: the camera
 *  holds still for the whole decision (framed on the stable full-power spread), so the projector
 *  needs no whole-hole fit `extra` and rebuilds cheaply — byte-identical to the same group inside a
 *  full renderHoleSVG. The caller falls back to a full render in whole-hole (fit) mode. */
export function renderShotOverlaySVG(hole: Hole, opts: RenderOptions = {}): string {
  const geom = resolveGeom(opts.sprayGeom);
  const proj = holeProjector(hole, {
    width: opts.width ?? 360,
    height: opts.height ?? 640,
    padding: opts.padding ?? 24,
    focus: opts.focus,
    viewRadius: opts.viewRadius,
    focusBias: opts.focusBias,
    up: opts.up,
  });
  const cone = opts.spray && opts.spray.expectedCarry > 0 && opts.spray.angleSpread > 0 ? shotConeParts(hole, proj, opts, geom) : [];
  const spin = spinOverlayParts((p) => proj.project(p), opts);
  return `<g id="${SHOT_OVERLAY_ID}">${[...cone, ...spin].join('')}</g>`;
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

  // The whole static world — rough texture, banded/striped surfaces, depth-banded water,
  // cell-shaded trees, OB boundary, centreline, tee + flag — is built ONCE by the shared
  // scene builder (so the SVG map and the Canvas play view look identical) and serialised.
  const parts: string[] = [
    // GS-a11y-announce: the map is a PICTURE, and its contents are already narrated in words by the
    // live region (the situation preamble + each shot's report). Marking it `img` with a name stops a
    // screen reader walking into it and reading the loose `<text>` yardage labels inside as a string
    // of orphaned numbers, while still announcing that a hole diagram is here.
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"` +
      ` role="img" aria-label="Hole map: par ${hole.par}, ${Math.round(dist(hole.tee, hole.green))} yards. The shot is described in words as you play.">`,
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
  // Wrapped in a stable-id group so the pull-to-power gesture can redraw JUST this cone
  // (renderShotOverlaySVG) instead of rebuilding the whole scene per drag frame (the decision-lag fix).
  // The backspin helper line (GS-backspin-line) shares this stable-id group so the pull-to-power
  // gesture redraws it together with the cone; it can also stand alone (a wedge with no drawable cone).
  const coneParts = opts.spray && opts.spray.expectedCarry > 0 && opts.spray.angleSpread > 0 ? shotConeParts(hole, proj, opts, geom) : [];
  const spinParts = spinOverlayParts((p) => proj.project(p), opts);
  if (coneParts.length || spinParts.length) {
    parts.push(`<g id="${SHOT_OVERLAY_ID}">`, ...coneParts, ...spinParts, `</g>`);
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

  // Predicted putt break line (GS-greens-3): a dotted curve showing how the slope will curl the ball.
  // Wrapped in a stable-id group so an aim nudge can redraw JUST this overlay (renderPuttOverlaySVG)
  // instead of rebuilding the whole scene — the break line is the only thing that moves per nudge.
  const puttParts = puttOverlayParts(place, opts);
  if (puttParts.length) parts.push(`<g id="${PUTT_OVERLAY_ID}">`, ...puttParts, `</g>`);

  if (opts.ball) {
    const [bx, by] = place(opts.ball);
    // The resting ball wears its cover (GS-ball-art round 2). It was a bare white circle, so you
    // lined a shot up with a plain dot, watched a dimpled ball fly, and got the dot back at rest —
    // as far as the player was concerned the cosmetic didn't exist. Sized by the SAME
    // `ballRadiusPx` the animation uses, off this view's own scale, so the ball doesn't change size
    // at the moment the swing starts.
    parts.push(ballSVG(bx, by, ballRadiusPx(proj.scale), opts.ballSkin ?? ballSkinFor(undefined)));
  }

  parts.push('</svg>');
  return parts.join('');
}

/** Thin DOM wrapper: render the hole into a container element. Browser only. */
export function mountHole(container: HTMLElement, hole: Hole, opts: RenderOptions = {}): void {
  container.innerHTML = renderHoleSVG(hole, opts);
}
