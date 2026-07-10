/**
 * Derelict-ship interior painters (GS-ship-deck / GS-ship-interior) — the derelict world is the inside
 * of a dead starship blown big enough to play golf in (a really-large wreck, not shrunken players). So
 * three painters dress it as ship structure, all PURE geometry with ZERO rng (course-space counts +
 * `posHash` jitter → camera-proof), gated to the `derelict` archetype at the `buildScene` call site, so
 * every other world is byte-for-byte untouched:
 *   • styleShipDeck     — the mown corridor as a riveted metal HALLWAY FLOOR you travel down (a lit
 *                         central walkway, edge shadow so it reads sunk, offset brick plating, conduit
 *                         trays) rather than the old uniform transverse rungs (the "tank-track" read).
 *   • styleShipBreaches — the derelict's "bunkers" reskinned as ACID-ETCHED HOLES eaten through the
 *                         deck, opening to the void of space (corroded torn rim, acid glow, star-lit
 *                         breach interior). Render-only: the sim still plays them as ordinary sand.
 *   • styleShipInterior — the grey platform BESIDE the corridor dressed as ship interior: deck plating,
 *                         bulkhead ribs, conduit runs, adjacent ROOMS/compartments with doorways, and
 *                         lower-level grating glimpses — so you read as being inside a large vessel.
 *
 * A painter module: imports only `shared` + the sim contract, never `style.ts` (no cycles).
 */

import type { Hole, Vec } from '../../sim/course/contract';
import { dist, polylineDist } from '../../sim/course/contract';
import type { Projector } from '../project';
import { type Prim, type Box, bboxOf, centroidOf, offsetPoly, posHash } from './shared';

const DECK = {
  seam: 'rgba(8,11,16,0.55)', // recessed panel seam (a dark groove between plates)
  seamLit: 'rgba(150,178,205,0.16)', // cold steel bevel catching the light beside a seam
  edgeShade: 'rgba(3,6,11,0.4)', // inner shadow hugging each wall → the corridor reads sunk, not flat
  walkway: 'rgba(150,180,208,0.09)', // a lit central walkway lane running up the hallway
  walkLine: 'rgba(160,192,220,0.32)', // the walkway's painted guide edge
  caution: 'rgba(190,158,70,0.4)', // faded painted hazard-yellow zone marking (industrial deck)
  chevron: 'rgba(150,178,205,0.24)', // directional deck chevrons, worn
  conduit: 'rgba(120,150,182,0.26)', // a cable/pipe run tucked against the wall
  conduitDk: 'rgba(4,8,13,0.4)',
  hatch: 'rgba(6,10,15,0.5)', // a recessed floor access hatch
  hatchLit: 'rgba(140,172,200,0.22)',
  scuff: 'rgba(5,8,13,0.32)', // grime/wear smudge
  scorch: 'rgba(3,5,9,0.5)', // an old burn mark
  rivet: 'rgba(180,200,222,0.26)', // a cold rivet glint
};

// The ACID-BREACH palette (GS-ship-interior): a hole eaten through the deck by corrosive spill, open
// to the void. Bright acid-green corrosion rings a dark star-lit breach — a hazard that reads as its
// OWN thing (a damaged section you don't want to be in), distinct from the plain-black OB starfield.
const ACID = {
  stain: 'rgba(120,196,86,0.13)', // acid corrosion staining the deck around the breach
  etch: 'rgba(150,232,110,0.6)', // the bright caustic etch line where the acid ate through
  etchDim: 'rgba(96,168,74,0.5)',
  glow: 'rgba(126,214,92,0.34)', // emissive acid glow rising from the breach
  rimLit: 'rgba(190,214,236,0.7)', // cold steel-lit top edge of the cut plating
  cut: '#1a2129', // the exposed thickness of the cut deck plating (a punched-through hole)
  cutDark: '#0a0e13',
  void: '#03060c', // the space showing through the breach
  drip: 'rgba(150,232,110,0.4)', // acid runs/drips down the rim
};

// The intact steel DECK PLATE (GS-ship-interior): the derelict's `waste` scatter ("firm riveted deck
// plates run true") reads as a solid brushed-steel plate bolted over the deck — NOT a hazard bowl.
const PLATE = {
  base: '#3a444e',
  lit: '#525f6b',
  edge: 'rgba(6,10,15,0.55)',
  rim: 'rgba(150,180,208,0.28)',
  rivet: 'rgba(180,202,224,0.3)',
};

// The ship INTERIOR beside the corridor (GS-ship-interior): darker steel than the mown deck, so the
// flanking structure reads as the ship's guts around the lit hallway you play down.
const INT = {
  floor: '#2b333b', // interior deck floor (darker than the corridor)
  floorLit: '#333c45',
  plate: 'rgba(9,13,18,0.5)', // recessed plate seam
  plateLit: 'rgba(130,160,190,0.12)',
  rib: 'rgba(5,8,13,0.55)', // a structural bulkhead rib across the interior
  ribLit: 'rgba(150,182,210,0.2)',
  conduit: 'rgba(118,150,182,0.24)',
  room: '#1d242b', // a compartment floor, sunk into shadow
  roomLit: '#28323b',
  roomWall: 'rgba(4,7,12,0.66)', // the compartment's bulkhead outline
  roomCap: 'rgba(150,182,210,0.28)', // lit top of a compartment wall
  door: 'rgba(150,190,214,0.34)', // a lit doorway threshold
  lamp: 'rgba(120,200,235,0.3)', // a dim surviving interior light
  console: '#39454f', // a console/berth block inside a room
  consoleLit: 'rgba(95,212,208,0.4)', // a live panel still glowing cyan
  grate: 'rgba(150,178,205,0.2)', // lower-level grating lines
  grateVoid: '#05080e', // the darkness of a level below
};

/** Cumulative arc lengths of a polyline (for even arc-length sampling). */
function arcTable(line: Vec[]): { cum: number[]; total: number } {
  const cum = [0];
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    total += dist(line[i - 1]!, line[i]!);
    cum.push(total);
  }
  return { cum, total };
}

/** Point + unit tangent at arc-length `s` along a polyline. */
function atArc(line: Vec[], cum: number[], s: number): { p: Vec; t: Vec } {
  const n = line.length;
  if (n < 2) return { p: line[0] ?? [0, 0], t: [0, 1] };
  const total = cum[n - 1]!;
  const target = Math.max(0, Math.min(total, s));
  for (let i = 1; i < n; i++) {
    if (cum[i]! >= target || i === n - 1) {
      const a = line[i - 1]!;
      const b = line[i]!;
      const seg = cum[i]! - cum[i - 1]! || 1;
      const f = (target - cum[i - 1]!) / seg;
      let tx = b[0] - a[0];
      let ty = b[1] - a[1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l;
      ty /= l;
      return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], t: [tx, ty] };
    }
  }
  return { p: line[n - 1]!, t: [0, 1] };
}

/** The corridor's half-width (course-yd) = the fairway's widest lateral reach off the centreline. */
function corridorHalf(hole: Hole, fallback: number): number {
  const fw = hole.features.find((f) => f.kind === 'fairway');
  if (!fw) return fallback;
  let hw = 0;
  for (const p of fw.poly) hw = Math.max(hw, polylineDist(p, hole.centreline));
  return hw > 4 ? hw : fallback;
}

/**
 * Dress the derelict corridor as a ship HALLWAY FLOOR (GS-ship-deck, reworked GS-ship-interior). `sps`
 * are the projected corridor polygons (each a hull section); the detail is built in COURSE space off
 * `hole.centreline`, projected, and clipped to every section so it only shows on the deck it belongs
 * to. The redesign kills the old "tank-track" read (uniform transverse rungs) by making the corridor
 * read LENGTHWISE: a lit central walkway you travel down, wall-hugging shadow so it reads sunk, conduit
 * trays, and an OFFSET BRICK plate grid whose staggered joints read as deck panels, not treads.
 */
export function styleShipDeck(hole: Hole, sps: Vec[][], proj: Projector, halfSpan = 46): Prim[] {
  const cl = hole.centreline;
  if (cl.length < 2 || !sps.length) return [];
  const { cum, total } = arcTable(cl);
  if (total < 4) return [];
  const detail: Prim[] = [];
  const hw = corridorHalf(hole, 16);

  // A lateral offset of the centreline at arc `s` by `d` course-yd (right = +perp).
  const lat = (s: number, d: number): Vec => {
    const { p, t } = atArc(cl, cum, s);
    return [p[0] - t[1] * d, p[1] + t[0] * d];
  };
  // A ribbon polygon running the corridor between two lateral offsets (course space → screen).
  const ribbon = (dInner: number, dOuter: number, steps = 40): Vec[] => {
    const a: Vec[] = [];
    const b: Vec[] = [];
    for (let k = 0; k <= steps; k++) {
      const s = (k / steps) * total;
      a.push(proj.project(lat(s, dInner)));
      b.push(proj.project(lat(s, dOuter)));
    }
    return [...a, ...b.reverse()];
  };

  // --- CONCAVE DEPTH: shadow hugging each wall + a lit walkway spine ------------
  // A pure lengthwise read: the corridor sinks toward its walls and lifts down the centre, so the eye
  // travels DOWN the hall instead of across repeated rungs.
  detail.push({ t: 'poly', pts: ribbon(hw * 0.62, halfSpan), fill: DECK.edgeShade });
  detail.push({ t: 'poly', pts: ribbon(-hw * 0.62, -halfSpan), fill: DECK.edgeShade });
  detail.push({ t: 'poly', pts: ribbon(-hw * 0.34, hw * 0.34), fill: DECK.walkway }); // lit central walkway lane
  // The walkway's two painted guide edges + faded chevrons marching up the centre.
  for (const d of [-hw * 0.34, hw * 0.34]) {
    const pts: Vec[] = [];
    for (let k = 0; k <= 40; k++) pts.push(proj.project(lat((k / 40) * total, d)));
    detail.push({ t: 'path', pts, stroke: DECK.walkLine, sw: 1.4, round: true });
  }

  // --- OFFSET BRICK PLATING: staggered deck panels, not uniform treads ----------
  // Transverse row seams every ~13 yd, but each row's LONGITUDINAL joints are offset half a plate from
  // its neighbours (brick bond), so the grid reads as riveted plates rather than a ladder of rungs. The
  // transverse grooves are kept thin/low-contrast; the offset joints + the lengthwise walkway dominate.
  const rowH = 13;
  const plateW = hw * 0.62; // ~3 plates across the corridor
  const nRows = Math.max(1, Math.floor(total / rowH));
  for (let i = 0; i <= nRows; i++) {
    const s = (i / (nRows + 1)) * total;
    // A thin transverse panel groove across the corridor (drawn long, clipped to the section).
    const a = proj.project(lat(s, -halfSpan));
    const b = proj.project(lat(s, halfSpan));
    detail.push({ t: 'line', a, b, stroke: DECK.seam, sw: 1.1, round: false });
    // Longitudinal joints for THIS row, offset half a plate on odd rows (the brick stagger).
    const off = i % 2 === 0 ? 0 : plateW * 0.5;
    for (let d = -halfSpan + off; d < halfSpan; d += plateW) {
      if (Math.abs(d) < hw * 0.34) continue; // leave the central walkway lane clear of joints
      const s1 = Math.min(total, s + rowH);
      const j0 = proj.project(lat(s, d));
      const j1 = proj.project(lat(s1, d));
      detail.push({ t: 'line', a: j0, b: j1, stroke: DECK.seam, sw: 1, round: false });
      detail.push({ t: 'line', a: [j0[0] + 1, j0[1]], b: [j1[0] + 1, j1[1]], stroke: DECK.seamLit, sw: 0.7, round: false });
    }
  }

  // --- CONDUIT / CABLE TRAYS running the length of each wall --------------------
  for (const d of [-hw * 0.82, hw * 0.82]) {
    const pts: Vec[] = [];
    for (let k = 0; k <= 40; k++) pts.push(proj.project(lat((k / 40) * total, d)));
    detail.push({ t: 'path', pts, stroke: DECK.conduitDk, sw: 3, round: true });
    detail.push({ t: 'path', pts, stroke: DECK.conduit, sw: 1.4, round: true });
  }

  // --- Directional deck CHEVRONS up the walkway --------------------------------
  const chStep = 40;
  const nCh = Math.max(0, Math.floor(total / chStep));
  for (let i = 1; i <= nCh; i++) {
    const s = (i / (nCh + 1)) * total;
    const w = hw * 0.24;
    const tip = proj.project(lat(s + 5, 0));
    const l = proj.project(lat(s - 3, -w));
    const r = proj.project(lat(s - 3, w));
    detail.push({ t: 'line', a: l, b: tip, stroke: DECK.chevron, sw: 1.8, round: true });
    detail.push({ t: 'line', a: r, b: tip, stroke: DECK.chevron, sw: 1.8, round: true });
  }

  // --- FLOOR ACCESS HATCHES + the odd scuff/scorch of a long-dead ship ---------
  const nHatch = Math.max(1, Math.floor(total / 46));
  for (let i = 0; i < nHatch; i++) {
    const s = ((i + 0.5) / nHatch) * total;
    const d = (posHash(s, 5, 1) - 0.5) * hw * 0.9;
    const r = 3.2;
    const corners: Vec[] = [
      proj.project(lat(s - r, d - r)),
      proj.project(lat(s + r, d - r)),
      proj.project(lat(s + r, d + r)),
      proj.project(lat(s - r, d + r)),
    ];
    detail.push({ t: 'poly', pts: corners, fill: DECK.hatch, stroke: DECK.hatchLit, sw: 1 });
    detail.push({ t: 'line', a: proj.project(lat(s, d - r)), b: proj.project(lat(s, d + r)), stroke: DECK.hatchLit, sw: 0.8, round: true });
  }
  const nScuff = Math.max(2, Math.floor(total / 30));
  for (let i = 0; i < nScuff; i++) {
    const s = ((i + 0.3) / nScuff) * total;
    const d = (posHash(s, 7, 1) - 0.5) * hw * 1.3;
    const c = proj.project(lat(s, d));
    const r = 1.6 + posHash(s, 7, 2) * 2.6;
    const scorch = posHash(s, 7, 4) < 0.22;
    detail.push({ t: 'circle', c, r: scorch ? r * 1.5 : r, fill: scorch ? DECK.scorch : DECK.scuff });
  }

  // Clip the whole detail set to every hull section, so a seam only shows on its own deck.
  return sps.map((sp) => ({ t: 'clip', clip: sp, children: detail }) as Prim);
}

/**
 * ACID-ETCHED BREACHES (GS-ship-interior) — the derelict's replacement for sand bunkers. Corrosive
 * spill has eaten holes clean through the deck plating, opening to the void of space. Each breach reads
 * as: an acid corrosion STAIN on the deck around it, a bright caustic ETCH rim where the metal was
 * eaten through, the CUT THICKNESS of the punched plating (so it reads as a hole with depth, not a
 * decal), then the VOID showing through — a few stars + a faint nebula glow. Render-only: the sim still
 * plays these as ordinary `bunker`/`sand` lies (escape difficulty untouched), so a ball here is awkward
 * but not lost — the bright acid ring marks it as its own hazard, distinct from the plain-black OB.
 *
 * `coursePolys` are the UNION-merged breach bodies in COURSE space; stars key off `posHash(course)` and
 * project, so the breach interior is camera-proof. Pure geometry, zero rng.
 */
export function styleShipBreaches(coursePolys: Vec[][], proj: Projector, scale: number): Prim[] {
  if (!coursePolys.length) return [];
  const out: Prim[] = [];
  for (const cpoly of coursePolys) {
    if (cpoly.length < 3) continue;
    const sp = cpoly.map((p) => proj.project(p));
    const c = centroidOf(sp);
    const b = bboxOf(sp);
    const half = Math.max(4, Math.min(b.maxX - b.minX, b.maxY - b.minY) * 0.5);
    // 1) Acid corrosion staining the deck just outside the breach (eases it into the plating).
    out.push({ t: 'poly', pts: offsetPoly(sp, -Math.max(4, scale * 1.4)), fill: ACID.stain });
    // 2) The emissive acid glow rising out of the hole.
    out.push({ t: 'glow', c, r: half * 1.5, col: ACID.glow });
    // 3) The exposed CUT THICKNESS of the punched deck plating (a ring of dark metal edge) — this is
    //    what makes it read as a hole THROUGH the floor rather than a flat patch. Lit on the up-light
    //    side, dark on the far side.
    out.push({ t: 'poly', pts: sp, fill: ACID.cut });
    const inner = offsetPoly(sp, Math.max(2, scale * 0.9));
    out.push({ t: 'poly', pts: inner, fill: ACID.cutDark });
    // 4) The VOID showing through, with stars + a faint deep glow.
    const voidPoly = offsetPoly(sp, Math.max(3, scale * 1.5));
    out.push({ t: 'poly', pts: voidPoly, fill: ACID.void });
    const vb = bboxOf(voidPoly);
    out.push({ t: 'clip', clip: voidPoly, children: breachStars(cpoly, proj, vb) });
    // 5) The bright caustic ETCH rim where the acid ate through, + a couple of drips down the edge.
    for (let i = 1; i < sp.length; i++) {
      out.push({ t: 'line', a: sp[i - 1]!, b: sp[i]!, stroke: ACID.etch, sw: 2, round: true });
      out.push({ t: 'line', a: sp[i - 1]!, b: sp[i]!, stroke: ACID.rimLit, sw: 0.8, round: true });
    }
    out.push({ t: 'line', a: sp[0]!, b: sp[sp.length - 1]!, stroke: ACID.etch, sw: 2, round: true });
    // A few acid drips running inward from the rim (posHash-picked vertices → camera-stable choice).
    for (let i = 0; i < cpoly.length; i++) {
      if (posHash(cpoly[i]![0], cpoly[i]![1], 3) > 0.72) {
        const p = sp[i]!;
        out.push({ t: 'line', a: p, b: [c[0] * 0.22 + p[0] * 0.78, c[1] * 0.22 + p[1] * 0.78], stroke: ACID.drip, sw: 1.3, round: true });
      }
    }
  }
  return out;
}

/** The star-lit void inside a breach: a handful of stars keyed off the breach's COURSE-space vertices
 *  (so they hold still under the follow-cam) projected into the hole, clamped to the screen bbox. */
function breachStars(cpoly: Vec[], proj: Projector, vb: Box): Prim[] {
  const out: Prim[] = [];
  const c = centroidOf(cpoly);
  const n = Math.min(10, Math.max(4, cpoly.length));
  for (let i = 0; i < n; i++) {
    // Interpolate between the centroid and a course vertex by a posHash factor → a course-space point.
    const v = cpoly[i % cpoly.length]!;
    const f = 0.25 + posHash(v[0], v[1], 1) * 0.6;
    const cp: Vec = [c[0] + (v[0] - c[0]) * f, c[1] + (v[1] - c[1]) * f];
    const s = proj.project(cp);
    if (s[0] < vb.minX || s[0] > vb.maxX || s[1] < vb.minY || s[1] > vb.maxY) continue;
    const r = 0.5 + posHash(v[0], v[1], 2) * 0.9;
    const tone = posHash(v[0], v[1], 4);
    out.push({ t: 'circle', c: s, r, fill: tone < 0.6 ? 'rgba(255,255,255,0.9)' : 'rgba(170,200,255,0.85)' });
    if (posHash(v[0], v[1], 5) < 0.25) out.push({ t: 'glow', c: s, r: r * 4, col: 'rgba(180,210,255,0.4)' });
  }
  return out;
}

/**
 * Intact steel DECK PLATES (GS-ship-interior) — the derelict's `waste` scatter ("firm riveted deck
 * plates run true") as brushed-steel plates bolted over the deck: a solid metal patch with a lit rim
 * and a rivet border, so it reads as sound floor (a firm lie), NOT a hazard bowl. Render-only.
 * `coursePolys` are the union-merged waste bodies in course space; projected here.
 */
export function styleShipPlates(coursePolys: Vec[][], proj: Projector): Prim[] {
  if (!coursePolys.length) return [];
  const out: Prim[] = [];
  for (const cpoly of coursePolys) {
    if (cpoly.length < 3) continue;
    const sp = cpoly.map((p) => proj.project(p));
    out.push({ t: 'poly', pts: sp, fill: PLATE.base, stroke: PLATE.edge, sw: 1.4 });
    const lit = offsetPoly(sp, 1.6);
    out.push({ t: 'poly', pts: lit, fill: 'none', stroke: PLATE.rim, sw: 1 });
    // A soft brushed-steel highlight band across the plate + a rivet at each corner.
    const rb = offsetPoly(sp, 2.6);
    out.push({ t: 'poly', pts: rb, fill: 'none', stroke: PLATE.lit, sw: 0.8 });
    for (let i = 0; i < cpoly.length; i++) {
      if (posHash(cpoly[i]![0], cpoly[i]![1], 6) > 0.4) out.push({ t: 'circle', c: sp[i]!, r: 1, fill: PLATE.rivet });
    }
  }
  return out;
}

/**
 * SHIP INTERIOR beside the corridor (GS-ship-interior) — the grey platform flanking the mown hallway
 * dressed as the guts of a large vessel, so you read as being INSIDE a ship (rooms, cross-passages,
 * levels) rather than on a lone grey track. Built in COURSE space off `hole.centreline` in a band on
 * each side of the corridor (from just outside the wall out to a lateral reach), projected, and CLIPPED
 * to the platform polygons — so a compartment past the hull break is sliced open by the tear (which is
 * exactly right: a ship torn in half shows its rooms in cross-section). Pure geometry, zero rng,
 * camera-proof (course-space counts + `posHash` variety). Drawn UNDER the corridor deck (which caps the
 * hallway) and the walls.
 */
export function styleShipInterior(hole: Hole, platformsScreen: Vec[][], proj: Projector): Prim[] {
  const cl = hole.centreline;
  if (cl.length < 2 || !platformsScreen.length) return [];
  const { cum, total } = arcTable(cl);
  if (total < 8) return [];
  const hw = corridorHalf(hole, 16);
  const inner = hw + 3; // just outside the bulkhead wall
  const reach = inner + Math.max(34, hw * 2.4); // how far the interior band extends before the tear
  const detail: Prim[] = [];

  const lat = (s: number, d: number): Vec => {
    const { p, t } = atArc(cl, cum, s);
    return [p[0] - t[1] * d, p[1] + t[0] * d];
  };
  const ribbon = (s0: number, s1: number, dInner: number, dOuter: number, steps = 20): Vec[] => {
    const a: Vec[] = [];
    const b: Vec[] = [];
    for (let k = 0; k <= steps; k++) {
      const s = s0 + ((s1 - s0) * k) / steps;
      a.push(proj.project(lat(s, dInner)));
      b.push(proj.project(lat(s, dOuter)));
    }
    return [...a, ...b.reverse()];
  };
  // A rectangular course-space patch (arc s0..s1 × lateral d0..d1) → screen poly.
  const rect = (s0: number, s1: number, d0: number, d1: number): Vec[] => [
    proj.project(lat(s0, d0)),
    proj.project(lat(s1, d0)),
    proj.project(lat(s1, d1)),
    proj.project(lat(s0, d1)),
  ];

  for (const side of [-1, 1] as const) {
    const din = side * inner;
    const dout = side * reach;
    // 1) The interior deck FLOOR band (darker steel than the corridor) with a lengthwise plate seam.
    detail.push({ t: 'poly', pts: ribbon(0, total, din, dout, 40), fill: INT.floor });
    for (const fr of [0.4, 0.72]) {
      const d = side * (inner + (reach - inner) * fr);
      const pts: Vec[] = [];
      for (let k = 0; k <= 40; k++) pts.push(proj.project(lat((k / 40) * total, d)));
      detail.push({ t: 'path', pts, stroke: INT.plate, sw: 1.1, round: false });
      detail.push({ t: 'path', pts: pts.map((p) => [p[0], p[1] + 1] as Vec), stroke: INT.plateLit, sw: 0.6, round: false });
    }
    // 2) A conduit run just outside the wall (pairs the corridor's own trays across the bulkhead).
    {
      const d = side * (inner + 3);
      const pts: Vec[] = [];
      for (let k = 0; k <= 40; k++) pts.push(proj.project(lat((k / 40) * total, d)));
      detail.push({ t: 'path', pts, stroke: INT.conduit, sw: 1.4, round: true });
    }
    // 3) Structural BULKHEAD RIBS across the band every ~24 yd (compartment dividers) with a doorway
    //    gap near the corridor so the compartments read as connected.
    const ribStep = 24;
    const nRib = Math.max(1, Math.floor(total / ribStep));
    for (let i = 1; i <= nRib; i++) {
      const s = (i / (nRib + 1)) * total;
      const gap = inner + 6; // doorway gap width off the wall
      const a = proj.project(lat(s, side * gap));
      const bb = proj.project(lat(s, dout));
      detail.push({ t: 'line', a, b: bb, stroke: INT.rib, sw: 2.2, round: false });
      detail.push({ t: 'line', a: [a[0] + 1, a[1]], b: [bb[0] + 1, bb[1]], stroke: INT.ribLit, sw: 0.8, round: false });
      // The lit doorway threshold on the wall side of the rib (from the corridor wall to the rib base).
      detail.push({ t: 'line', a: proj.project(lat(s, din)), b: a, stroke: INT.door, sw: 1.4, round: true });
    }
    // 4) ROOMS / compartments: every ~30 yd (offset per side so the two sides don't mirror), a compartment
    //    with a sunk floor, a lit interior lamp + a still-live console, and — occasionally — a lower-level
    //    grating glimpse. Clipping to the platform slices any room that runs past the hull tear.
    const roomStep = 30;
    const nRoom = Math.max(1, Math.floor(total / roomStep));
    const phase = side < 0 ? 0.5 : 0;
    for (let i = 0; i < nRoom; i++) {
      const s = ((i + 0.5 + phase) / nRoom) * total;
      if (s < 6 || s > total - 6) continue;
      const rl = 9; // half-length along the corridor
      const d0 = side * (inner + 5);
      const d1 = side * (inner + 5 + 18); // room depth
      const flr = rect(s - rl, s + rl, d0, d1);
      const kind = posHash(s, side, 1);
      detail.push({ t: 'poly', pts: flr, fill: kind < 0.4 ? INT.roomLit : INT.room });
      // The compartment's three outer bulkhead walls (leave the corridor side open as the doorway).
      const wall = (p0: Vec, p1: Vec) => {
        detail.push({ t: 'line', a: p0, b: p1, stroke: INT.roomWall, sw: 2, round: false });
        detail.push({ t: 'line', a: [p0[0], p0[1] - 1], b: [p1[0], p1[1] - 1], stroke: INT.roomCap, sw: 0.8, round: false });
      };
      wall(flr[1]!, flr[2]!); // far-arc wall
      wall(flr[2]!, flr[3]!); // outer wall
      wall(flr[3]!, flr[0]!); // near-arc wall
      // A dim surviving lamp + a live cyan console, or a lower-level grating glimpse.
      const lc = proj.project(lat(s, side * (inner + 13)));
      if (kind < 0.34) {
        // Lower-level grating: dark opening with a few grate bars showing a level below.
        const g = rect(s - rl * 0.7, s + rl * 0.7, side * (inner + 7), side * (inner + 20));
        detail.push({ t: 'poly', pts: g, fill: INT.grateVoid });
        for (let k = 1; k <= 4; k++) {
          const gs = s - rl * 0.7 + (rl * 1.4 * k) / 5;
          detail.push({ t: 'line', a: proj.project(lat(gs, side * (inner + 7))), b: proj.project(lat(gs, side * (inner + 20))), stroke: INT.grate, sw: 0.9, round: false });
        }
      } else {
        detail.push({ t: 'glow', c: lc, r: 7, col: INT.lamp });
        const con = rect(s - 4, s + 4, side * (inner + 14), side * (inner + 20));
        detail.push({ t: 'poly', pts: con, fill: INT.console });
        if (posHash(s, side, 3) < 0.5) detail.push({ t: 'line', a: proj.project(lat(s - 3, side * (inner + 15))), b: proj.project(lat(s + 3, side * (inner + 15))), stroke: INT.consoleLit, sw: 1.4, round: true });
      }
    }
  }

  // Clip everything to the platform(s), so the interior fills the base beside the corridor and any
  // compartment past the hull tear is sliced open in cross-section.
  return platformsScreen.map((pp) => ({ t: 'clip', clip: pp, children: detail }) as Prim);
}
