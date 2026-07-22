/**
 * The lost-rough worlds' side-on depth kit (GS-style-split): the cetus/void cliff extrusions +
 * calm-stop raised shelves (GS-cetus-3/5/6), the star-ocean with its space whales (GS-cetus-2)
 * and the star-river + cliff waterfall (GS-cetus-4). All on dedicated rng streams and gated per
 * archetype in `buildScene`, so every other world is byte-for-byte untouched.
 */

import type { Hole, Vec } from '../../sim/course/contract';
import { dist, pointInPoly, polylineDist } from '../../sim/course/contract';
import { mixHex } from '../palette';
import type { Projector } from '../project';
import { type Prim, type Box, bboxOf, offsetPoly, projPoly, posHash } from './shared';
import { landPolysCourseFor } from './land';

// ---------------------------------------------------------------------------
// GS-cetus: the star-ocean clifftop world's bespoke decor — a river of stars threading the rough that
// pours off the cliff as a star-waterfall, over a deep ocean where space whales surface. All drawn
// from a dedicated rng stream + gated to the cetus archetype in buildScene, so every other world is
// byte-for-byte unchanged.
// ---------------------------------------------------------------------------

/** Unit tangent at index i of a polyline, from its neighbours. */
function tangentAt(pts: Vec[], i: number): Vec {
  const a = pts[Math.max(0, i - 1)]!;
  const b = pts[Math.min(pts.length - 1, i + 1)]!;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

/** A variable-width ribbon polygon (per-point half-widths) around a polyline. */
function ribbonVar(path: Vec[], hw: number[]): Vec[] {
  const left: Vec[] = [];
  const right: Vec[] = [];
  for (let i = 0; i < path.length; i++) {
    const t = tangentAt(path, i);
    const px = -t[1];
    const py = t[0];
    const w = hw[i] ?? hw[hw.length - 1] ?? 2;
    left.push([path[i]![0] + px * w, path[i]![1] + py * w]);
    right.push([path[i]![0] - px * w, path[i]![1] - py * w]);
  }
  return [...left, ...right.reverse()];
}

/**
 * The screen-space fall BASIS for the star-waterfall (GS-cetus-waterfall-angle). The curtain used to
 * always drop straight screen-DOWN, so on a rotated follow-cam the lip sat as a flat horizontal bar
 * pasted across a river arriving at an angle — the "off-centre waterfall" the eye reads as not lining
 * up with the plateau edge. Instead we tip the curtain along the river's OWN downstream flow at the
 * spill: the lip turns to lie along the EDGE the water crosses and the fall continues the river's line.
 * Clamped to a tasteful lean off straight-down (never sideways or up, so it always reads as a gravity
 * drop), and byte-for-byte straight-down when the river already arrives vertically (the perfectly-
 * aligned case that already looked stunning). Pure geometry off the PROJECTED spine — no rng.
 * Returns the fall unit vector (fx,fy) and the perpendicular lip unit vector (px,py).
 */
export function waterfallBasis(screen: Vec[]): { fx: number; fy: number; px: number; py: number } {
  const n = screen.length;
  const spill = screen[n - 1]!;
  const tail = screen[Math.max(0, n - 4)]!; // a few steps upstream → the local downstream flow
  let dx = spill[0] - tail[0];
  let dy = spill[1] - tail[1];
  if (Math.hypot(dx, dy) < 1e-3) {
    dx = 0;
    dy = 1;
  }
  // Deviation from straight-down (screen +y), clamped to a lean — a tilt that lines the lip up with
  // the edge, never a sideways/upward fling that stops reading as a fall.
  const MAX_TILT = 0.6; // ~34°
  let ang = Math.atan2(dx, dy); // 0 = straight down; sign = lean left/right
  ang = Math.max(-MAX_TILT, Math.min(MAX_TILT, ang));
  const fx = Math.sin(ang);
  const fy = Math.cos(ang);
  return { fx, fy, px: fy, py: -fx };
}

/** Sample a polyline at parameter `u` in [0,1] by arc length (so a curve is walked evenly). */
function sampleAlong(line: Vec[], u: number): Vec {
  const n = line.length;
  if (n === 1) return line[0]!;
  let total = 0;
  const cum = [0];
  for (let i = 1; i < n; i++) {
    total += dist(line[i - 1]!, line[i]!);
    cum.push(total);
  }
  if (total === 0) return line[0]!;
  const target = Math.max(0, Math.min(1, u)) * total;
  for (let i = 1; i < n; i++) {
    if (cum[i]! >= target) {
      const seg = cum[i]! - cum[i - 1]! || 1;
      const f = (target - cum[i - 1]!) / seg;
      const a = line[i - 1]!;
      const b = line[i]!;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
  }
  return line[n - 1]!;
}

/**
 * The COURSE-SPACE star-river path (GS-cetus-4): ONE diagonal crossing of the play corridor — a
 * spring near the corridor's far side, a single meandering pass over the fairway around mid-hole,
 * then out through the rough to the plateau's edge, where it can spill off the cliff. This replaces
 * the GS-cetus-2/3 full-length meander that snaked tee→green down the middle of the corridor: on a
 * par 4/5 that buried most of the mown fairway under river + bank glow (the "takes up too much
 * fairway" bug). Still a PURE function of the hole + its own rng — it never reads the projector —
 * so the geometry is byte-stable AND camera-proof; ALL rng draws happen up front, so the boundary
 * marching can never shift the stream. The polyline is ordered SOURCE → SPILL (the downstream end
 * is fixed in course space — the old "lowest river mouth on screen" pick re-chose the spill every
 * follow-cam frame, which is what painted a bonus waterfall over the green on a side chip).
 * Returns null for a hole with no real corridor (a par-3 island green has no fairway to cross).
 */
export function cetusRiverPath(
  hole: Hole,
  rng: () => number,
): { line: Vec[]; hw: number[]; spillAtEdge: boolean } | null {
  const cl = hole.centreline;
  const fw = hole.features.find((f) => f.kind === 'fairway');
  if (!fw || cl.length < 2 || hole.par < 4) return null;
  // Corridor half-width = the fairway's widest lateral extent from the centreline.
  let halfW = 0;
  for (const p of fw.poly) halfW = Math.max(halfW, polylineDist(p, cl));
  if (halfW < 4) return null;
  // Hole length, for sizing the river to the hole rather than the (huge on a lostRough island) corridor.
  let L = 0;
  for (let i = 1; i < cl.length; i++) L += dist(cl[i - 1]!, cl[i]!);
  if (L < 1) L = dist(cl[0]!, cl[cl.length - 1]!) || 100;
  // All rng draws up front, in a fixed order — the path maths below is deterministic geometry.
  const uc = 0.38 + rng() * 0.22; // where it crosses the corridor: mid-hole, clear of both tee + green
  const side = rng() < 0.5 ? 1 : -1; // which side of the corridor it exits toward
  const lean = ((102 + rng() * 22) * Math.PI) / 180; // axis = tangent rotated PAST perpendicular → a tee-ward lean,
  // so the downstream run heads for the plateau's FRONT edge (the cliff face the map extrudes), never the green.
  const phase = rng() * Math.PI * 2;
  const ampF = 0.7 + rng() * 0.6;
  const wPhase = rng() * Math.PI * 2;
  // A proper RIVER half-width (course yards) — the old creek-thin channel with a tight wiggle read
  // as a glowing squiggle ("an electric eel"), not a river of stars. Wider water + the longer,
  // gentler meander below give the star fill and the banks room to actually read as a river.
  const rw = Math.max(5.5, Math.min(11, L * 0.02));
  const C = sampleAlong(cl, uc);
  const c0 = sampleAlong(cl, Math.max(0, uc - 0.02));
  const c1 = sampleAlong(cl, Math.min(1, uc + 0.02));
  let tx = c1[0] - c0[0];
  let ty = c1[1] - c0[1];
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const rot = side * lean;
  const dxA = tx * Math.cos(rot) - ty * Math.sin(rot); // downstream axis
  const dyA = tx * Math.sin(rot) + ty * Math.cos(rot);
  const px = -dyA; // meander swing direction (perpendicular to the axis)
  const py = dxA;
  const amp = Math.min(halfW * 0.22, 7) * ampF; // a gentle sweep, never a corridor-wide sprawl
  const freq = (Math.PI * 1.1) / 160; // ~1 broad S-lobe per 145 yards — a river bend, not a wriggle
  const at = (s: number): Vec => {
    const m = amp * Math.sin(phase + s * freq);
    return [C[0] + dxA * s + px * m, C[1] + dyA * s + py * m];
  };
  // The land platform the crossing lives on (lost holes: the corridor ribbon; calm: the land hull).
  const home = landPolysCourseFor(hole).find((p) => pointInPoly(C, p));
  if (!home) return null;
  // March each way to the platform edge (fixed step counts + a bisection refine — no rng in here).
  const edgeAt = (dir: 1 | -1, maxLen: number): { s: number; hit: boolean } => {
    const K = 48;
    const step = maxLen / K;
    for (let k = 1; k <= K; k++) {
      if (!pointInPoly(at(dir * k * step), home)) {
        let lo = (k - 1) * step;
        let hi = k * step;
        for (let b = 0; b < 8; b++) {
          const mid = (lo + hi) / 2;
          if (pointInPoly(at(dir * mid), home)) lo = mid;
          else hi = mid;
        }
        return { s: dir * ((lo + hi) / 2), hit: true };
      }
    }
    return { s: dir * maxLen, hit: false };
  };
  const down = edgeAt(1, 200); // downstream: run out to the cliff edge (the spill)
  const up = edgeAt(-1, Math.max(16, Math.min(40, halfW * 1.2))); // upstream: short — the spring sits near the corridor
  const s0 = up.hit ? up.s * 0.86 : up.s; // an edge-clipped spring is pulled back so it wells up ON the plateau
  const s1 = down.s;
  if (s1 - s0 < 24) return null; // degenerate sliver (crossing pinched right at an edge) — skip the river
  const N = 24;
  const line: Vec[] = [];
  const hw: number[] = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    line.push(at(s0 + (s1 - s0) * u));
    const taper = Math.min(1, u / 0.24) * 0.65 + 0.35; // narrow at the spring → full channel
    const mouth = 1 + Math.max(0, (u - 0.78) / 0.22) * 0.5; // a widening DELTA into the spill
    hw.push(rw * (1 + 0.12 * Math.sin(wPhase + u * Math.PI * 1.6)) * taper * mouth); // calm banks
  }
  return { line, hw, spillAtEdge: down.hit };
}

/**
 * The FRONT (screen-down) silhouette of a simple polygon: the chain of its edge from the leftmost to
 * the rightmost vertex that runs along the BOTTOM (larger screen-y). This is the plateau edge the eye
 * reads as facing the viewer — the lip we extrude a cliff down from (GS-cetus-3). Passed the platform's
 * REAL polygon (not its convex hull) since GS-void-cetus-cliffs, so the chain hugs concave bays + the
 * lower flanks of a narrow island rather than chording across them. Returned L→R.
 */
function frontEdge(poly: Vec[]): Vec[] {
  if (poly.length < 2) return poly;
  let li = 0;
  let ri = 0;
  for (let i = 1; i < poly.length; i++) {
    if (poly[i]![0] < poly[li]![0]) li = i;
    if (poly[i]![0] > poly[ri]![0]) ri = i;
  }
  const walk = (dir: 1 | -1): Vec[] => {
    const out: Vec[] = [];
    for (let i = li; ; i = (i + dir + poly.length) % poly.length) {
      out.push(poly[i]!);
      if (i === ri) break;
    }
    return out;
  };
  const a = walk(1);
  const b = walk(-1);
  const avgY = (c: Vec[]) => c.reduce((s, p) => s + p[1], 0) / (c.length || 1);
  const front = avgY(a) >= avgY(b) ? a : b;
  return front[0]![0] <= front[front.length - 1]![0] ? front : front.slice().reverse();
}

/**
 * Palette for the side-on plateau extrusion (GS-cetus-3 / GS-cetus-5). Cetus = a lit blue CLIFFTOP
 * plunging to the star-ocean; void = a chunky violet ASTEROID underside floating in the abyss — same
 * geometry, different rock, so both lost-rough worlds read side-on and 3D (not flat decals).
 */
export interface CliffLook {
  strata: string[]; // face bands, top (lit) → bottom (abyss)
  deepMix: string; // rarity-deepen tint for the lower strata
  lipA: string;
  lipB: string; // the two lit-lip strokes along the top rim
  crackDark: string;
  crackLit: string;
  dustA: string;
  dustB: string;
  shadow: string; // cast shadow at the foot
  contact: string; // contact shadow tucked under the lip
}
export const CETUS_CLIFF: CliffLook = {
  // A bold TEAL → BLUE → DEEP-BLUE → BLACK plunge (GS-void-cetus-cliffs): the strata were greyed and
  // read washed-out against the dark deep, flattening the side-on face; saturated + widened so the
  // clifftop's descent to the abyss pops with the world's cyan identity.
  strata: ['#4fc6d6', '#2f9ac2', '#2168a0', '#164674', '#0c2a48', '#061826'],
  deepMix: '#03080f',
  lipA: 'rgba(150,232,255,0.9)',
  lipB: 'rgba(232,252,255,0.7)',
  crackDark: 'rgba(3,9,16,0.5)',
  crackLit: 'rgba(120,190,225,0.22)',
  dustA: 'rgba(190,236,255,0.5)',
  dustB: 'rgba(140,205,255,0.4)',
  shadow: 'rgba(2,7,13,0.5)',
  contact: 'rgba(3,10,18,0.34)',
};
export const VOID_CLIFF: CliffLook = {
  // A vivid VIOLET → BLACK asteroid underside (GS-void-cetus-cliffs): the old strata sat as a greyed
  // lavender that washed out against the abyss; pushed toward a saturated cosmic purple descending to
  // near-black so the floating rock reads as solid, luminous void-stone.
  strata: ['#6b4fcf', '#5138a6', '#3c277d', '#291a54', '#180d33', '#0a0619'],
  deepMix: '#050210',
  lipA: 'rgba(176,126,255,0.85)',
  lipB: 'rgba(224,205,255,0.72)',
  crackDark: 'rgba(6,3,16,0.55)',
  crackLit: 'rgba(150,110,220,0.24)',
  dustA: 'rgba(206,180,255,0.5)',
  dustB: 'rgba(150,120,220,0.4)',
  shadow: 'rgba(3,1,10,0.5)',
  contact: 'rgba(6,3,16,0.36)',
};
// Derelict (GS-derelict): each hull SECTION is a slab of broken ship floating in space, so its
// underside reads as a cold riveted METAL cross-section — dark gunmetal strata descending to black, a
// cold steel-lit top rim, cyan-tinged cracks (severed conduits) rather than rock veins. Same geometry
// as the void/cetus cliffs (`platformCliffs`), different material: torn hull-plate, not asteroid rock.
export const SHIP_CLIFF: CliffLook = {
  strata: ['#5d6b78', '#47535e', '#333d47', '#232b33', '#161c22', '#0a0e13'],
  deepMix: '#04070c',
  // GS-ship-wall-bounce: the torn-hull deck rim sits ~14 yd OUTSIDE the real bounce line (the bulkhead),
  // so it's toned down from a bright starlit edge to a dimmer one — it must NOT out-shine the bold wall
  // crest and be misread as the play boundary (the ball never reaches it; it's dead hull past the wall).
  lipA: 'rgba(150,190,225,0.5)',
  lipB: 'rgba(210,232,250,0.42)',
  crackDark: 'rgba(4,7,12,0.55)',
  crackLit: 'rgba(95,212,208,0.2)', // severed conduits glow faint cyan in the cross-section
  dustA: 'rgba(190,205,225,0.45)',
  dustB: 'rgba(140,165,200,0.38)',
  shadow: 'rgba(2,5,10,0.5)',
  contact: 'rgba(4,8,14,0.34)',
};
// Rainbow Road (GS-rainbow-road-2): the ribbon rests on a PRISMATIC crystal buttress — the support
// pillars must read as the rainbow world's OWN structure, not a recoloured void asteroid. So the
// strata descend through genuinely DIFFERENT jewel hues (lit rose-magenta → violet → periwinkle →
// teal-blue → deep blue → indigo abyss), an opalescent gradient that refracts the road's spectrum,
// with prismatic pink/cyan lip highlights and dust. Distinct at a glance from Void's monochrome
// violet cliff and Cetus's blue clifftop. Same geometry (`platformCliffs`), different rock.
export const RAINBOW_CLIFF: CliffLook = {
  strata: ['#ef5aa6', '#b057cf', '#6f64d8', '#4a80c0', '#2f4f86', '#141a44'],
  deepMix: '#080622',
  lipA: 'rgba(255,170,225,0.95)',
  lipB: 'rgba(180,240,255,0.8)',
  crackDark: 'rgba(10,4,30,0.5)',
  crackLit: 'rgba(120,235,255,0.3)',
  dustA: 'rgba(255,205,240,0.55)',
  dustB: 'rgba(150,230,255,0.5)',
  shadow: 'rgba(8,3,24,0.5)',
  contact: 'rgba(12,5,32,0.36)',
};

/**
 * SHIP-HULL cross-section underside (GS-ship-deck) — the derelict world's replacement for the void's
 * geological `platformCliffs` strata. Each floating hull SECTION is a chunk of a torn-apart starship, so
 * its underside must read as SHIP STRUCTURE, not rock: a dark riveted hull wall carrying horizontal DECK
 * lines (the interior decks the section was sliced through), vertical structural FRAMES (the ship's ribs)
 * with rivet rows, a lit steel deck-rim LIP, a ragged TORN bottom edge (ripped metal, not a clean cliff
 * foot), and the odd severed conduit still sparking cyan. Same screen-space extrusion geometry as
 * `platformCliffs` (convex-hull front edge dropped down), different MATERIAL. Pure geometry, ZERO rng
 * (`posHash` jitter + projected-size counts only) → perturbs no stream; gated to the derelict at the call
 * site. `deepen` (rarity) darkens the hull like the cliffs.
 */
export function styleShipHull(platforms: Vec[][], deepen: number): Prim[] {
  const prims: Prim[] = [];
  const look = SHIP_CLIFF;
  const dk = Math.min(0.24, Math.max(0, deepen - 1) * 0.24);
  const strata = look.strata.map((c, i) => mixHex(c, look.deepMix, dk * (i / 5)));
  const plateTop = strata[1]!; // upper hull plate (lit steel)
  const bodyDark = strata[strata.length - 1]!; // deep hull, into shadow
  for (const plat of platforms) {
    // Use the platform's OWN (jagged, on the derelict) front edge — NOT its convex hull — so the hull
    // cross-section is as SHARP and TORN as the section silhouette above it, never a smooth rounded arc.
    const top = frontEdge(plat);
    if (top.length < 2) continue;
    const bb = bboxOf(plat);
    const cx = (bb.minX + bb.maxX) / 2;
    const w = bb.maxX - bb.minX;
    const hullH = Math.max(30, Math.min(150, w * 0.42));
    // The deck rim pushed straight down (a faint outward splay so the wall reads solid). `t` ∈ [0,1].
    const dropped = (t: number): Vec[] => top.map((p) => [p[0] + (p[0] - cx) * 0.05 * t, p[1] + hullH * t] as Vec);
    // A hard RIPPED bottom edge — the hull was torn off, not cut: a deep, sharp posHash sawtooth (some
    // teeth hang far below, some are bitten right up) so the underside reads shredded (zero rng).
    const bottom = dropped(1).map((p, i) => {
      const tear = (posHash(p[0], p[1], i + 1) - 0.4) * hullH * 0.5 + (posHash(p[0], p[1], i + 9) > 0.8 ? hullH * 0.28 : 0);
      return [p[0], p[1] + tear] as Vec;
    });
    const face: Vec[] = [...top, ...bottom.slice().reverse()];
    // Soft cast shadow into the void at the hull foot.
    prims.push({ t: 'poly', pts: [...dropped(0.9), ...dropped(1.42).slice().reverse()], fill: look.shadow });
    // Solid hull backing (no clip gaps), then a lit upper plate band → a dark-into-shadow gradient.
    prims.push({ t: 'poly', pts: face, fill: bodyDark });
    const children: Prim[] = [];
    children.push({ t: 'poly', pts: [...top, ...dropped(0.5).slice().reverse()], fill: plateTop });
    children.push({ t: 'poly', pts: [...dropped(0), ...dropped(0.15).slice().reverse()], fill: look.contact }); // contact shadow under the rim
    // Horizontal DECK lines — the interior decks the section was sliced through.
    for (const t of [0.34, 0.58, 0.8]) {
      const line = dropped(t);
      children.push({ t: 'path', pts: line, stroke: 'rgba(150,188,222,0.2)', sw: 1, round: false });
      children.push({ t: 'path', pts: line.map((p) => [p[0], p[1] + 1.5] as Vec), stroke: 'rgba(3,7,13,0.42)', sw: 1, round: false });
    }
    // EXPOSED LOWER-DECK COMPARTMENTS (GS-ship-interior): rectangular rooms sliced open to the vacuum —
    // a dark void punched into the hull face with a lit deck-floor line + ceiling, so the broken section
    // reads as decks laid bare, not a solid slab. Count off the projected width (camera-proof), posHash
    // placement (zero rng). Drawn INSIDE the clipped face, so a compartment near the torn bottom is itself
    // ripped open.
    const rooms = Math.min(7, Math.max(2, Math.round(w / 34)));
    for (let i = 1; i <= rooms; i++) {
      const u = (i - 0.5) / rooms;
      const tp = sampleAlong(top, u);
      const rw = w * (0.04 + posHash(tp[0], tp[1], 3) * 0.05); // room half-width
      const y0 = tp[1] + hullH * (0.28 + posHash(tp[0], tp[1], 4) * 0.14);
      const rh = hullH * (0.18 + posHash(tp[0], tp[1], 8) * 0.22);
      const rx = tp[0] + (tp[0] - cx) * 0.03;
      const room: Vec[] = [[rx - rw, y0], [rx + rw, y0], [rx + rw, y0 + rh], [rx - rw, y0 + rh]];
      children.push({ t: 'poly', pts: room, fill: '#04070c' }); // the dark open compartment (space beyond)
      children.push({ t: 'line', a: [rx - rw, y0], b: [rx + rw, y0], stroke: 'rgba(150,188,222,0.28)', sw: 1, round: false }); // lit deck ceiling
      children.push({ t: 'line', a: [rx - rw, y0 + rh], b: [rx + rw, y0 + rh], stroke: 'rgba(3,7,13,0.6)', sw: 1.4, round: false }); // deck floor in shadow
      if (posHash(tp[0], tp[1], 7) < 0.4) children.push({ t: 'line', a: [rx, y0], b: [rx, y0 + rh], stroke: 'rgba(95,212,208,0.22)', sw: 1, round: false }); // a surviving conduit
    }
    // Vertical structural FRAMES (the ship's ribs) with rivet rows. Count off the projected width,
    // camera-clamped; no rng, so a zoom step can't perturb any seeded stream.
    const frames = Math.min(9, Math.max(2, Math.round(w / 26)));
    for (let i = 1; i <= frames; i++) {
      const u = i / (frames + 1);
      const tp = sampleAlong(top, u);
      const bt: Vec = [tp[0] + (tp[0] - cx) * 0.05, tp[1] + hullH];
      children.push({ t: 'line', a: tp, b: bt, stroke: 'rgba(3,6,11,0.5)', sw: Math.max(2, w * 0.011), round: false });
      children.push({ t: 'line', a: [tp[0] + 1.3, tp[1]], b: [bt[0] + 1.3, bt[1]], stroke: 'rgba(120,152,184,0.2)', sw: 1, round: false });
      const rv = 4;
      for (let k = 1; k <= rv; k++) {
        const f = k / (rv + 1);
        children.push({ t: 'circle', c: [tp[0] + (bt[0] - tp[0]) * f, tp[1] + (bt[1] - tp[1]) * f], r: 0.8, fill: look.dustB });
      }
    }
    // Severed conduits still sparking faint cyan along the torn bottom.
    for (let i = 0; i < bottom.length; i += 3) {
      const p = bottom[i]!;
      if (posHash(p[0], p[1], 9) < 0.2) children.push({ t: 'circle', c: p, r: 1.1, fill: look.crackLit });
    }
    prims.push({ t: 'clip', clip: face, children });
    // Lit steel LIP along the deck rim so the section catches the starlight (drawn over the fill).
    for (let i = 1; i < top.length; i++) {
      prims.push({ t: 'line', a: top[i - 1]!, b: top[i]!, stroke: look.lipA, sw: 2.4, round: true });
      prims.push({ t: 'line', a: top[i - 1]!, b: top[i]!, stroke: look.lipB, sw: 1, round: true });
    }
  }
  return prims;
}

/**
 * Extrude each plateau DOWNWARD into a visible side-on FACE (GS-cetus-3, generalised GS-cetus-5) so a
 * lost-rough world reads as floating clifftops/asteroids, not a flat top-down map — and the thing that
 * lets the cetus star-river spill over a real edge. Pure screen-space render off a dedicated cliff
 * stream. Returns the drawn prims (face strata + rock-dust + rugged base + lit lip) PLUS the front-edge
 * geometry, which `cetusRiver` reuses so its waterfall pours down this exact face. Height keys off the
 * plateau width so it scales consistently across the map/follow-cam zooms. `look` recolours the rock
 * (cetus clifftop vs void asteroid).
 */
export function platformCliffs(
  platforms: Vec[][],
  deepen: number,
  rng: () => number,
  look: CliffLook = CETUS_CLIFF,
): { prims: Prim[]; faces: { top: Vec[]; height: number }[] } {
  const prims: Prim[] = [];
  const faces: { top: Vec[]; height: number }[] = [];
  // A LIT rock wall (top catches the starlight) plunging to the abyss — high contrast so the face
  // reads as solid rock against the dark void, which is what sells the side-on depth. Rarity deepens
  // only the LOWER strata (`dk` ramps in with depth) so the lit top always pops regardless of tier.
  const dk = Math.min(0.24, Math.max(0, deepen - 1) * 0.24);
  const strata = look.strata.map((c, i) => mixHex(c, look.deepMix, dk * (i / 5)));
  for (const plat of platforms) {
    if (plat.length < 3) continue;
    // Extrude from the platform's OWN lower silhouette (GS-void-cetus-cliffs) — leftmost→rightmost
    // walked the down-screen way along the REAL edge, NOT the convex hull. The hull chorded across
    // every concave bay + the sides of a narrow vertical island, so the supporting cliff appeared only
    // along the bottom bulge ("pillars only visible in some places"). The true silhouette wraps the
    // whole lower perimeter (concave bays + both lower flanks), so the landmass reads walled all round.
    const top = frontEdge(plat);
    if (top.length < 2) continue;
    const bb = bboxOf(plat);
    const cx = (bb.minX + bb.maxX) / 2;
    // Height keys off the SMALLER span so a narrow, tall island still gets a substantial wall rather
    // than a sliver (its width alone barely cleared the old floor); floored higher for a solid read.
    const cliffH = Math.max(44, Math.min(190, Math.min(bb.maxX - bb.minX, bb.maxY - bb.minY) * 0.6));
    faces.push({ top, height: cliffH });
    // Drop the lip down (a slight outward splay so the block reads solid, base roughened into rubble).
    const dropped = (t: number): Vec[] =>
      top.map((p) => [p[0] + (p[0] - cx) * 0.06 * t, p[1] + cliffH * t] as Vec);
    const base = dropped(1).map((p) => [p[0], p[1] + (rng() - 0.5) * cliffH * 0.16] as Vec);
    const face: Vec[] = [...top, ...base.slice().reverse()];
    // A soft cast shadow into the ocean at the cliff foot, so the wall reads as standing IN the sea.
    prims.push({ t: 'poly', pts: [...dropped(0.86), ...dropped(1.32).slice().reverse()], fill: look.shadow });
    prims.push({ t: 'poly', pts: face, fill: strata[strata.length - 1]! }); // solid backing (no clip gaps)
    // Face detail, clipped to the face polygon. ONE clip only — the SVG serializer silently drops a
    // group's contents if a clipPath nests inside another (the GS-cetus-2 bug), so no nested clips.
    const children: Prim[] = [];
    const K = strata.length;
    for (let k = 0; k < K; k++) {
      const bandTop = dropped(k / K);
      const bandBot = dropped((k + 1) / K);
      children.push({ t: 'poly', pts: [...bandTop, ...bandBot.slice().reverse()], fill: strata[k]! });
    }
    // A contact-shadow band tucked right under the lip (ambient occlusion → the plateau reads as a
    // slab casting onto its own face), and star-dust in the rock (Cetus stone is made of the deep).
    children.push({ t: 'poly', pts: [...dropped(0), ...dropped(0.16).slice().reverse()], fill: look.contact });
    const fb = bboxOf(face);
    // Dust count scales with the PROJECTED face size, so always run the capped loop and only PUSH
    // the first `dust` motes — the rng consumption stays fixed per platform, and a zoom step can't
    // shift the cliff stream and re-roll the cracks/next platform (the decor-jitter bug).
    const dust = Math.min(110, Math.round(((fb.maxX - fb.minX) * (fb.maxY - fb.minY)) / 620));
    for (let i = 0; i < 110; i++) {
      const x = fb.minX + rng() * (fb.maxX - fb.minX);
      const y = fb.minY + rng() * (fb.maxY - fb.minY);
      const r = 0.35 + rng() * 0.9;
      const fill = rng() < 0.5 ? look.dustA : look.dustB;
      if (i < dust) children.push({ t: 'circle', c: [x, y], r, fill });
    }
    // Vertical fault cracks + lit ridges give the wall its strata read.
    const cracks = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < cracks; i++) {
      const sp = sampleAlong(top, rng());
      const len = cliffH * (0.45 + rng() * 0.5);
      const jx = (rng() - 0.5) * 10;
      children.push({ t: 'line', a: sp, b: [sp[0] + jx, sp[1] + len], stroke: look.crackDark, sw: 1.2, round: true });
      children.push({ t: 'line', a: [sp[0] + 1.4, sp[1]], b: [sp[0] + jx + 1.4, sp[1] + len], stroke: look.crackLit, sw: 0.8, round: true }); // lit edge beside each crack
    }
    prims.push({ t: 'clip', clip: face, children });
    // The lit LIP: a luminous edge along the plateau's front rim so it catches the starlight and the
    // slab reads with thickness (drawn LAST, on top of the land fill at the call site).
    for (let i = 1; i < top.length; i++) {
      prims.push({ t: 'line', a: top[i - 1]!, b: top[i]!, stroke: look.lipA, sw: 2.6, round: true });
      prims.push({ t: 'line', a: top[i - 1]!, b: top[i]!, stroke: look.lipB, sw: 1, round: true });
    }
  }
  return { prims, faces };
}

/**
 * TWO-TIER raised fairway/green SHELF (GS-cetus-6) for a CALM cetus/void stop. The deep stops became
 * island-hop pads on real extruded cliffs, but a calm stop's whole play-bounds is playable ROUGH
 * (can't be islands), so its corridor read flat. The projection is top-down (shot-readability is
 * sacred — no camera pitch), where only DOWN-facing surfaces are visible, so a long vertical corridor
 * can't show a cliff along its sides. Instead we imply elevation the top-down way: a soft cast SHADOW
 * on the rough below the surface + a rock FACE peeking out under its down-screen edge, so the cut
 * grass reads as a raised shelf/mesa above the rough. Drawn UNDER the surface fill (which caps the
 * shelf top); the lit rim is added over the fill at the call site. Pure geometry — no rng, so every
 * seeded stream is untouched. `h` (shelf height, px) scales with the projector so it holds across
 * the map + follow-cam zooms.
 */
export function raisedShelf(sp: Vec[], scale: number, look: CliffLook): Prim[] {
  // Two knobs: G = how far the rock PEDESTAL sticks out sideways (visible on the near-vertical corridor
  // EDGES in the zoomed play view — a pure downward drop is invisible there), h = the vertical LIFT
  // (the pedestal + shadow shift DOWN so the block reads raised, not a flat symmetric collar). Both
  // scale with the projector so the shelf holds across the map + follow-cam zooms.
  const G = Math.max(2.5, Math.min(10, scale * 1.7));
  const h = Math.max(3, Math.min(13, scale * 2.4));
  const ped = offsetPoly(sp, -G); // grow the silhouette outward → the pedestal footprint
  const wide = offsetPoly(sp, -G * 1.7);
  const shift = (poly: Vec[], dy: number, dx = 0): Vec[] => poly.map((p) => [p[0] + dx, p[1] + dy] as Vec);
  return [
    // Soft cast shadow onto the rough below (lit from the upper-left → nudged down-right), fading out.
    { t: 'poly', pts: shift(wide, h * 1.9, h * 0.45), fill: 'rgba(2,7,13,0.16)' },
    { t: 'poly', pts: shift(ped, h * 1.25, h * 0.3), fill: 'rgba(2,7,13,0.22)' },
    // The rock PEDESTAL: the outset footprint dropped by the lift, so a band of rock rings the surface
    // (thicker + darker along the down-screen edge, present on the sides) — the raised-shelf face. Two
    // bands (lower darker) sell the drop; the surface fill drawn next caps the top.
    { t: 'poly', pts: shift(ped, h), fill: look.strata[4]! },
    { t: 'poly', pts: shift(ped, h * 0.5), fill: look.strata[3]! },
  ];
}

/**
 * A graceful side-on SPACE WHALE drifting through the deep (GS-cetus-2). A smooth fusiform body
 * (rounded head → tapering tail stock), a long curved humpback PECTORAL fin, a two-lobed notched
 * tail FLUKE, a blowhole MIST spout, a glowing eye, a lit dorsal ridge and a scatter of
 * bioluminescent star-speckles across the body — so the creature is genuinely whale-shaped and reads
 * as made of the night, not a flat fish outline. Screen space; deterministic from the supplied rng.
 */
function whaleSilhouette(cx: number, cy: number, len: number, rng: () => number): Prim[] {
  const f = rng() < 0.5 ? 1 : -1; // facing left/right
  const tilt = (rng() - 0.5) * 0.36;
  const ca = Math.cos(tilt);
  const sa = Math.sin(tilt);
  const H = len * 0.5; // body height envelope (chunky, not eel-thin)
  const T = (lx: number, ly: number): Vec => {
    const x = f * lx * len;
    const y = ly * H;
    return [cx + x * ca - y * sa, cy + x * sa + y * ca];
  };
  // A chunky, recognizable whale body (fractions of len/H): bulky head → high straight back → tail
  // stock → full rounded belly → jaw. Tall enough that the SHAPE reads even small in the whole-hole map.
  const body: Vec[] = [
    T(0.5, 0.02), T(0.46, -0.12), T(0.36, -0.26), T(0.18, -0.34), T(-0.05, -0.34),
    T(-0.26, -0.29), T(-0.42, -0.17), T(-0.44, -0.01), T(-0.4, 0.13), T(-0.22, 0.27),
    T(0.0, 0.33), T(0.22, 0.31), T(0.4, 0.2), T(0.47, 0.09),
  ];
  // A darker belly so the body has a lit-from-above volume (the back stays the bright fill).
  const belly: Vec[] = [T(-0.4, 0.13), T(-0.22, 0.27), T(0.0, 0.33), T(0.22, 0.31), T(0.4, 0.2), T(0.46, 0.1), T(0.2, 0.16), T(-0.1, 0.18), T(-0.4, 0.06)];
  // Big two-lobed, centre-notched tail fluke off the stock.
  const fluke: Vec[] = [T(-0.42, -0.04), T(-0.72, -0.36), T(-0.6, -0.06), T(-0.58, 0.05), T(-0.68, 0.36), T(-0.42, 0.08)];
  // Long curved humpback pectoral flipper sweeping down-forward from the lower body (drawn lighter so
  // it pops in front of the belly — the whale's signature read).
  const pec: Vec[] = [T(0.16, 0.16), T(0.48, 0.52), T(0.36, 0.56), T(0.02, 0.24)];
  const eye = T(0.34, -0.06);
  const blow = T(0.18, -0.34);
  const out: Prim[] = [
    { t: 'glow', c: [cx, cy], r: len * 1.25, col: 'rgba(95,225,250,0.22)' }, // bioluminescent aura
    { t: 'poly', pts: fluke, fill: '#10455f', stroke: 'rgba(155,246,255,0.85)', sw: 1.3 },
    { t: 'poly', pts: body, fill: '#1a5878', stroke: 'rgba(170,250,255,0.96)', sw: 1.8 }, // luminous back
    { t: 'poly', pts: belly, fill: 'rgba(6,28,46,0.5)' }, // belly shadow → volume
    { t: 'poly', pts: pec, fill: '#246a8d', stroke: 'rgba(165,248,255,0.9)', sw: 1.2 }, // near flipper, lit
    { t: 'line', a: T(0.34, -0.26), b: T(-0.3, -0.27), stroke: 'rgba(205,251,255,0.6)', sw: 1.3, round: true }, // lit dorsal ridge
  ];
  // Star-speckles dusting the body (the whale is made of the deep). Deterministic jitter from rng.
  const speckN = 8 + Math.floor(rng() * 4);
  for (let i = 0; i < speckN; i++) {
    const p = T((rng() - 0.5) * 0.74, (rng() - 0.42) * 0.5);
    out.push({ t: 'circle', c: p, r: Math.max(0.7, len * 0.016) + rng() * 1, fill: rng() < 0.5 ? 'rgba(232,253,255,0.95)' : 'rgba(155,234,255,0.8)' });
  }
  // Eye (bright core + dark ring), and a soft blowhole MIST spout.
  out.push({ t: 'circle', c: eye, r: Math.max(1.1, len * 0.032), fill: 'rgba(236,253,255,0.96)' });
  out.push({ t: 'circle', c: eye, r: Math.max(1.8, len * 0.052), fill: 'none', stroke: 'rgba(8,36,56,0.6)', sw: 1 });
  out.push({ t: 'line', a: blow, b: T(0.24, -0.76), stroke: 'rgba(205,250,255,0.62)', sw: 1.6, round: true });
  out.push({ t: 'line', a: blow, b: T(0.1, -0.72), stroke: 'rgba(205,250,255,0.46)', sw: 1.4, round: true });
  out.push({ t: 'circle', c: T(0.17, -0.8), r: 1.3 + rng() * 0.9, fill: 'rgba(233,252,255,0.86)' });
  return out;
}

/**
 * The star-ocean OFF the clifftop plateau (GS-cetus-2): a rich star-dusted deep + bioluminescent
 * current blooms, with space WHALES drifting through it. The whales are placed in COURSE space
 * (clear of the land hull) and projected — so they sit at fixed world positions and pan/zoom WITH
 * the camera like every other world object (the old screen-space placement, rejected against the
 * PROJECTED island, made the whale count — and the shared rng stream — depend on the projector).
 * Drawn BEFORE the landmass so the cliff overlaps their near edges. Own rng stream.
 */
export function cetusOcean(landPolys: Vec[][], cb: Box, proj: Projector, W: number, H: number, accents: number, rng: () => number): Prim[] {
  const out: Prim[] = [];
  // A denser star-ocean base so the deep reads as the intro's starfield (Cetus's signature). These
  // sit under the landmass; the cliff masks the part over the plateau. Off this dedicated rng stream.
  if (accents > 0) {
    const extra = Math.round(70 * accents);
    for (let i = 0; i < extra; i++) {
      const x = rng() * W;
      const y = rng() * H;
      const r = 0.4 + rng() * 1.2;
      out.push({ t: 'circle', c: [x, y], r, fill: rng() < 0.5 ? 'rgba(220,248,255,0.7)' : 'rgba(150,222,255,0.6)' });
      if (rng() < 0.12) out.push({ t: 'glow', c: [x, y], r: r * 5, col: 'rgba(150,230,255,0.4)' });
    }
  }
  // Broad bioluminescent current blooms + a few sweeping current arcs so the sea reads as living.
  for (let i = 0; i < 3; i++) {
    out.push({ t: 'glow', c: [W * (0.1 + rng() * 0.8), H * (0.45 + rng() * 0.5)], r: (0.22 + rng() * 0.22) * Math.max(W, H), col: 'rgba(55,180,215,0.12)' });
  }
  for (let i = 0; i < 4; i++) {
    const y = H * (0.4 + rng() * 0.56);
    const sag = (rng() - 0.5) * 26;
    out.push({ t: 'line', a: [0, y], b: [W, y + sag], stroke: `rgba(110,225,240,${(0.05 + rng() * 0.06).toFixed(3)})`, sw: 1.2, round: true });
  }
  if (accents <= 0) return out;
  // Whales in the deep, at COURSE-SPACE positions in a band around the island (rejected against the
  // course-space hull — projector-independent, so the rng draw count is stable). Sized in course yards
  // and projected, so they scale with zoom; off-screen ones are simply culled (no rng consumed). The
  // rng-draw count is fixed by `want`, so the river's separate stream is never desynced regardless.
  const spanX = cb.maxX - cb.minX || 1;
  const spanY = cb.maxY - cb.minY || 1;
  const cxw = (cb.minX + cb.maxX) / 2;
  const cyw = (cb.minY + cb.maxY) / 2;
  const want = 4 + Math.floor(rng() * 3);
  const targets: Vec[] = [];
  // A band hugging the island (clear of the plateau but not so far they fly off the zoomed view).
  for (let i = 0; i < want * 18 && targets.length < want; i++) {
    const c: Vec = [cxw + (rng() - 0.5) * spanX * 1.55, cyw + (rng() - 0.5) * spanY * 1.55];
    if (landPolys.some((lp) => pointInPoly(c, lp))) continue; // keep clear of every land platform
    targets.push(c);
  }
  for (const c of targets) {
    // Sized in course yards but CLAMPED in screen px so a whale reads at both the whole-hole map zoom
    // (where the world scale is tiny) and the zoomed play view, scaling between the two.
    const lenCourse = 46 + rng() * 46;
    const lenPx = Math.max(58, Math.min(214, lenCourse * proj.scale));
    const s = proj.project(c);
    if (s[0] < -lenPx || s[0] > W + lenPx || s[1] < -lenPx || s[1] > H + lenPx) {
      // off-screen: still draw the whale's own rng (count stability) but discard the prims
      whaleSilhouette(s[0], s[1], lenPx, rng);
      continue;
    }
    out.push(...whaleSilhouette(s[0], s[1], lenPx, rng));
  }
  return out;
}

/**
 * The star-river crossing the corridor + its cliff WATERFALL (GS-cetus-4). The course-space
 * crossing (`cetusRiverPath`, projector-independent, ordered SOURCE → SPILL) is projected to a
 * glowing channel of deep star-water packed with the intro's starscape, welling from a spring and
 * pouring off the plateau edge into the ocean. Own rng stream + gated to cetus → determinism-safe.
 * `faces` is the cliff geometry from `platformCliffs` (the fall drops the height of the face it spills
 * over); `landCourse` is the course-space land so the fall is PAINTED only when its drop actually
 * lands off the plateau — under the rotating follow-cam a screen-space fall can point across turf
 * (the "bonus waterfall over the green on a side chip" bug), and then it is simply not drawn. All
 * rng draws stay unconditional so the camera can never shift the stream.
 */
export function cetusRiver(
  hole: Hole,
  proj: Projector,
  accents: number,
  rng: () => number,
  faces: { top: Vec[]; height: number }[],
  landCourse: Vec[][],
): Prim[] {
  const rp = cetusRiverPath(hole, rng);
  if (!rp) return [];
  const { line, hw } = rp;
  const ribbon = projPoly(ribbonVar(line, hw), proj);
  const screen = line.map((p) => proj.project(p));
  const avgHwPx = Math.max(2, (hw.reduce((a, b) => a + b, 0) / hw.length) * proj.scale);

  // Built from a ribbon FILL (the channel) + STROKES along the spine (glow / current / sparkle),
  // each stroke segment following the LOCAL half-width so the spring taper and mouth flare read.
  // We deliberately AVOID clipping to the island: the SVG serializer nests a clipPath inside the
  // clipped <g>, which silently drops the group's contents (the bug that hid the old render-only river).
  const strokeVar = (out: Prim[], stk: string, mul: number, add = 0, minW = 1) => {
    for (let i = 1; i < screen.length; i++) {
      const w = Math.max(minW, ((hw[i - 1]! + hw[i]!) / 2) * proj.scale * mul + add);
      out.push({ t: 'line', a: screen[i - 1]!, b: screen[i]!, stroke: stk, sw: w, round: true });
    }
  };
  const river: Prim[] = [];
  // A quiet bank glow — the luminous water lighting the turf either side, kept soft.
  strokeVar(river, 'rgba(95,225,252,0.10)', 1.8, 4);
  river.push({ t: 'poly', pts: ribbon, fill: 'rgba(8,30,48,0.92)' }); // dark deep-water bed → high contrast vs the teal turf
  strokeVar(river, 'rgba(60,150,205,0.7)', 1.1); // star-water surface down the channel — a tone, not a beam
  river.push({ t: 'poly', pts: ribbon, fill: 'none', stroke: 'rgba(170,235,250,0.5)', sw: 1 }); // soft shoreline
  // Two gentle CURRENT filaments hugging the banks (pure geometry — no rng): the flow read the old
  // solid-white spine tried for, without painting a chalk squiggle down the middle.
  for (const laneOff of [-0.45, 0.45]) {
    for (let i = 1; i < screen.length; i++) {
      if (i % 3 === 0) continue; // broken filaments — current, not an outline
      const h0 = hw[i - 1]! * laneOff;
      const h1 = hw[i]! * laneOff;
      const t0 = tangentAt(line, i - 1);
      const t1 = tangentAt(line, i);
      const a = proj.project([line[i - 1]![0] - t0[1] * h0, line[i - 1]![1] + t0[0] * h0]);
      const b = proj.project([line[i]![0] - t1[1] * h1, line[i]![1] + t1[0] * h1]);
      river.push({ t: 'line', a, b, stroke: 'rgba(160,225,248,0.28)', sw: 1, round: true });
    }
  }
  // Fill the channel with the intro's starscape so it reads as a RIVER OF STARS: small dim star
  // dust packed across the width, the odd hero star with a soft halo — never froth.
  if (accents > 0) {
    const steps = 56;
    for (let i = 0; i < steps; i++) {
      const u = i / (steps - 1);
      const c = sampleAlong(line, u);
      const t = tangentAt(line, Math.min(line.length - 1, Math.round(u * (line.length - 1))));
      const nx = -t[1];
      const ny = t[0];
      const halfW = (hw[Math.min(hw.length - 1, Math.round(u * (hw.length - 1)))] ?? 4) * 0.8;
      // Star sizes are CLAMPED to the local projected channel width (paint-size only — never the
      // draw count): on the whole-hole map the river is a few px wide, and full-size stars + halos
      // buried the dark water under solid white (the "chalk squiggle" read).
      const hwPx = Math.max(1, halfW * proj.scale);
      const packed = 2;
      for (let j = 0; j < packed; j++) {
        const lat = (rng() * 2 - 1) * halfW;
        const p = proj.project([c[0] + nx * lat, c[1] + ny * lat]);
        const hero = rng() < 0.07;
        const col = rng() < 0.5 ? 'rgba(255,255,255,0.85)' : rng() < 0.5 ? 'rgba(180,242,255,0.8)' : 'rgba(210,220,255,0.75)';
        if (hero) river.push({ t: 'glow', c: p, r: Math.min(3.5 + rng() * 2, hwPx * 1.2), col: 'rgba(200,244,255,0.4)' });
        river.push({ t: 'circle', c: p, r: Math.min(hero ? 1.1 + rng() * 0.7 : 0.35 + rng() * 0.65, Math.max(0.6, hwPx * 0.4)), fill: col });
      }
    }
  }

  // The river SOURCE — the fixed upstream end (course space): a modest glowing spring where the
  // star-water wells up out of the plateau, sized off the tapered spring width so it reads as an
  // origin, not a giant glowing golf ball parked in the rough.
  const source = screen[0]!;
  const srcW = Math.max(3.5, hw[0]! * proj.scale * 2.1);
  river.push({ t: 'glow', c: source, r: srcW * 2.2, col: 'rgba(120,225,255,0.35)' });
  river.push({ t: 'circle', c: source, r: srcW, fill: 'rgba(60,150,205,0.6)' });
  river.push({ t: 'circle', c: source, r: srcW * 0.5, fill: 'rgba(220,248,255,0.9)' });
  for (let i = 0; i < (accents > 0 ? 7 : 0); i++) {
    river.push({ t: 'circle', c: [source[0] + (rng() - 0.5) * srcW * 2.2, source[1] + (rng() - 0.5) * srcW * 2.2], r: 0.4 + rng() * 1, fill: 'rgba(230,252,255,0.85)' });
  }

  // The WATERFALL: only when the river actually reached the plateau edge (`spillAtEdge`, course
  // space). The curtain still falls screen-down (the cliff extrusion's convention), so PAINT it only
  // when the drop lands off the land — both probes below the lip must sit over the deep, never turf.
  if (!rp.spillAtEdge) return river;
  const spill = screen[screen.length - 1]!;
  // Drop the height of the cliff face under the spill (the lip the river pours over), if the camera
  // has one there; otherwise a sensible default keyed off the channel width.
  let fallLen = Math.max(26, avgHwPx * 5) + 20;
  for (const f of faces) {
    const fb = bboxOf(f.top);
    if (spill[0] >= fb.minX - 6 && spill[0] <= fb.maxX + 6 && spill[1] >= fb.minY - 16 && spill[1] <= fb.maxY + 16) {
      fallLen = f.height + 22;
      break;
    }
  }
  // Tip the curtain along the river's downstream flow so the lip lines up with the plateau edge
  // (GS-cetus-waterfall-angle) — straight-down when the river arrives vertically, a lean when the
  // follow-cam rotates the crossing. All screen offsets below are built off this basis.
  const { fx: dfx, fy: dfy, px: lpx, py: lpy } = waterfallBasis(screen);
  const fpt = (u: number, lat: number, half: number): Vec => [
    spill[0] + dfx * fallLen * u + lpx * lat * half,
    spill[1] + dfy * fallLen * u + lpy * lat * half,
  ];
  const onLand = (p: Vec) => landCourse.some((lp) => pointInPoly(p, lp));
  const paint =
    !onLand(proj.unproject(spill[0] + dfx * fallLen * 0.35, spill[1] + dfy * fallLen * 0.35)) &&
    !onLand(proj.unproject(spill[0] + dfx * fallLen * 0.8, spill[1] + dfy * fallLen * 0.8));
  const spillW = Math.max(12, hw[hw.length - 1]! * proj.scale * 2.2);
  const fall: Prim[] = [];
  if (paint) {
    fall.push({ t: 'glow', c: spill, r: spillW * 1.3, col: 'rgba(140,232,255,0.38)' });
    // A LUMINOUS curtain that fades with the drop (stacked translucent bands): the old dark-blue
    // veil vanished against the dark cliff face, leaving only the sparse streaks — which read as
    // dangling drips ("an electric eel vomiting"), not a waterfall. Star-water GLOWS as it falls.
    const halfAt = (u: number) => spillW * (0.5 + 0.14 * u);
    const bands: [number, number, string][] = [
      [0, 0.4, 'rgba(150,222,248,0.4)'],
      [0.4, 0.72, 'rgba(118,190,235,0.24)'],
      [0.72, 1, 'rgba(92,150,210,0.1)'],
    ];
    for (const [u0, u1, colBand] of bands) {
      fall.push({
        t: 'poly',
        pts: [fpt(u0, -1, halfAt(u0)), fpt(u0, 1, halfAt(u0)), fpt(u1, 1, halfAt(u1)), fpt(u1, -1, halfAt(u1))],
        fill: colBand,
      });
    }
    // The LIP: a bright brink line right where the river tips over the edge — the highlight that
    // sells "water leaves the ground here" at both zooms. Drawn along the lip axis so it lies on the
    // edge, not flat across it.
    fall.push({ t: 'line', a: fpt(0, -1, spillW * 0.5), b: fpt(0, 1, spillW * 0.5), stroke: 'rgba(235,252,255,0.9)', sw: 1.8, round: true });
    fall.push({ t: 'line', a: fpt(0.03, -1, spillW * 0.42), b: fpt(0.03, 1, spillW * 0.42), stroke: 'rgba(170,232,250,0.5)', sw: 1, round: true });
  }
  // Falling star-streaks INSIDE the curtain: short, staggered, fading with the drop — rng consumed
  // UNCONDITIONALLY (the `paint` gate reads the camera, so it may only choose what is pushed,
  // never what is drawn).
  const fallN = accents > 0 ? 16 : 5;
  for (let i = 0; i < fallN; i++) {
    const lane = (i / Math.max(1, fallN - 1) - 0.5) + (rng() - 0.5) * 0.1; // even lanes → a curtain
    const u0 = rng() * 0.45;
    const u1 = Math.min(1, u0 + 0.2 + rng() * 0.3);
    const alpha = (0.4 + rng() * 0.25) * (1 - u0 * 0.55); // dimmer the further down it starts
    const dropR = 0.5 + rng() * 0.9;
    const uc2 = u0 + (u1 - u0) * rng();
    if (!paint) continue;
    const laneHalf = (u: number) => spillW * (0.9 + 0.28 * u); // splays gently with the drop, stays inside the curtain
    fall.push({
      t: 'line',
      a: fpt(u0, lane, laneHalf(u0)),
      b: fpt(u1, lane, laneHalf(u1)),
      stroke: `rgba(205,249,255,${alpha.toFixed(2)})`,
      sw: 1.1,
      round: true,
    });
    if (accents > 0) fall.push({ t: 'circle', c: fpt(uc2, lane, laneHalf(uc2)), r: dropR, fill: 'rgba(232,252,255,0.8)' });
  }
  // Splash foot: a soft mist bloom + ripple rings where the curtain meets the star-ocean.
  const pool: Vec = [spill[0] + dfx * fallLen, spill[1] + dfy * fallLen];
  const mist: [number, number, number][] = [];
  for (let i = 0; i < 3; i++) mist.push([(rng() - 0.5) * spillW * 0.9, rng() * 4, 2.5 + rng() * 3.5]);
  if (paint) {
    fall.push({ t: 'glow', c: pool, r: spillW * 1.3, col: 'rgba(150,238,255,0.35)' });
    for (const [mx, my, mr] of mist) fall.push({ t: 'circle', c: [pool[0] + lpx * mx - dfx * my, pool[1] + lpy * mx - dfy * my], r: mr, fill: 'rgba(210,246,255,0.3)' });
    for (let i = 1; i <= 3; i++) {
      fall.push({ t: 'circle', c: pool, r: i * 5 + spillW * 0.22, fill: 'none', stroke: `rgba(150,238,255,${(0.45 - i * 0.12).toFixed(2)})`, sw: 1 });
    }
  }
  return [...river, ...fall];
}
