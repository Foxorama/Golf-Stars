/**
 * Derelict-ship DECK painter (GS-ship-deck) — the derelict world's corridor is the internal passage of
 * a dead starship, so its mown "fairway" is dressed as riveted METAL DECK PLATING: a grid of panel
 * seams, a painted hazard-caution stripe hugging each bulkhead, faded directional deck chevrons pointing
 * up the corridor, and scuffs/scorch of long abandonment. Drawn OVER the fairway fill and clipped to the
 * corridor polygons, so the deck detail never spills into the void. Pure geometry, ZERO rng (course-
 * space counts + `posHash` jitter → camera-proof), so it perturbs no seeded stream and every other world
 * is byte-for-byte untouched. Gated to the `derelict` archetype at the `buildScene` call site.
 *
 * A painter module: imports only `shared` + the sim contract, never `style.ts` (no cycles).
 */

import type { Hole, Vec } from '../../sim/course/contract';
import { dist } from '../../sim/course/contract';
import type { Projector } from '../project';
import { type Prim, posHash } from './shared';

const DECK = {
  seam: 'rgba(8,11,16,0.6)', // recessed panel seam (a dark groove between plates)
  seamLit: 'rgba(150,178,205,0.16)', // cold steel bevel catching the light beside a seam
  caution: 'rgba(190,158,70,0.42)', // faded painted hazard-yellow edge line (industrial deck marking)
  chevron: 'rgba(150,178,205,0.22)', // directional deck chevrons, worn
  scuff: 'rgba(5,8,13,0.34)', // grime/wear smudge
  scorch: 'rgba(3,5,9,0.5)', // an old burn mark
  rivet: 'rgba(180,200,222,0.28)', // a cold rivet glint
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

/**
 * Dress the derelict corridor as ship deck plating. `sps` are the projected corridor polygons (each a
 * hull section); the detail is built in COURSE space off `hole.centreline`, projected, and clipped to
 * every section so a plate seam only ever shows on the deck it belongs to. `halfSpan` is a generous
 * lateral reach (course-yd) for the transverse seams — they're drawn long and clipped to the corridor,
 * so they don't need the exact local width.
 */
export function styleShipDeck(hole: Hole, sps: Vec[][], proj: Projector, halfSpan = 46): Prim[] {
  const cl = hole.centreline;
  if (cl.length < 2 || !sps.length) return [];
  const { cum, total } = arcTable(cl);
  if (total < 4) return [];
  const detail: Prim[] = [];

  // A lateral offset of the centreline at arc `s` by `d` course-yd (right = +perp).
  const lat = (s: number, d: number): Vec => {
    const { p, t } = atArc(cl, cum, s);
    return [p[0] - t[1] * d, p[1] + t[0] * d];
  };

  // --- Transverse PANEL SEAMS (rungs): the plates run across the corridor -------
  // Every ~10.5 course-yd a seam spanning the full corridor width (drawn long, clipped). A dark recessed
  // groove + a thin cold bevel just up-corridor of it, so the deck reads as a run of riveted plates.
  const step = 10.5;
  const nSeams = Math.max(1, Math.floor(total / step));
  for (let i = 1; i <= nSeams; i++) {
    const s = (i / (nSeams + 1)) * total;
    const jitter = (posHash(s, 0, 3) - 0.5) * 1.4;
    const a = proj.project(lat(s + jitter, -halfSpan));
    const b = proj.project(lat(s + jitter, halfSpan));
    detail.push({ t: 'line', a, b, stroke: DECK.seam, sw: 1.6, round: false });
    const a2 = proj.project(lat(s + jitter - 1.1, -halfSpan));
    const b2 = proj.project(lat(s + jitter - 1.1, halfSpan));
    detail.push({ t: 'line', a: a2, b: b2, stroke: DECK.seamLit, sw: 0.8, round: false });
  }

  // --- Longitudinal plate JOINTS: a couple of seams running up the corridor -----
  // Offsets from the centreline (course-yd); ones past the wall are simply clipped away.
  for (const d of [-26, -13, 13, 26]) {
    const pts: Vec[] = [];
    const K = 40;
    for (let k = 0; k <= K; k++) pts.push(proj.project(lat((k / K) * total, d)));
    detail.push({ t: 'path', pts, stroke: DECK.seam, sw: 1.1, round: false });
  }

  // --- Painted HAZARD-CAUTION edge stripe hugging each bulkhead -----------------
  // Just inside the corridor edge (course-yd), a faded dashed yellow line — the industrial "mind the
  // gap" deck marking. Drawn on both sides; clipped to the corridor.
  for (const d of [-halfSpan * 0.78, halfSpan * 0.78]) {
    const pts: Vec[] = [];
    const K = 44;
    for (let k = 0; k <= K; k++) pts.push(proj.project(lat((k / K) * total, d)));
    detail.push({ t: 'path', pts, stroke: DECK.caution, sw: 2, round: true, dash: [7, 5] });
  }

  // --- Directional deck CHEVRONS up the centre of the corridor ------------------
  // Worn painted ">" arrows pointing toward the green — a real ship deck marking that doubles as a
  // readability cue. Spaced by course length (camera-proof).
  const chStep = 34;
  const nCh = Math.max(0, Math.floor(total / chStep));
  for (let i = 1; i <= nCh; i++) {
    const s = (i / (nCh + 1)) * total;
    const { t } = atArc(cl, cum, s);
    const w = 8; // half-width of the chevron
    const tip = proj.project(lat(s + 5, 0));
    const l = proj.project(lat(s - 3, -w));
    const r = proj.project(lat(s - 3, w));
    detail.push({ t: 'line', a: l, b: tip, stroke: DECK.chevron, sw: 2, round: true });
    detail.push({ t: 'line', a: r, b: tip, stroke: DECK.chevron, sw: 2, round: true });
    void t;
  }

  // --- SCUFFS + the odd SCORCH of a long-dead ship -----------------------------
  const nScuff = Math.max(3, Math.floor(total / 16));
  for (let i = 0; i < nScuff; i++) {
    const s = ((i + 0.5) / nScuff) * total;
    const d = (posHash(s, 7, 1) - 0.5) * halfSpan * 1.3;
    const c = proj.project(lat(s, d));
    const r = 2 + posHash(s, 7, 2) * 4;
    const scorch = posHash(s, 7, 4) < 0.22;
    detail.push({ t: 'circle', c, r: scorch ? r * 1.4 : r, fill: scorch ? DECK.scorch : DECK.scuff });
  }

  // Clip the whole detail set to every hull section, so a seam only shows on its own deck.
  return sps.map((sp) => ({ t: 'clip', clip: sp, children: detail }) as Prim);
}
