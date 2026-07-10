/**
 * Ship-corridor WALLS painter (GS-ship-walls) — draw the derelict world's collidable metal walls as
 * raised riveted barriers lining the hull-deck corridor, so the ball is SEEN bouncing off the wall the
 * sim reflects off (the graphic IS the physics; both read `hole.walls`). Course-space, projected, so
 * the walls track the follow-cam. Pure geometry, ZERO rng — the rivet count keys off the segment's
 * COURSE length (never the projection), so the prim count is camera-proof.
 */

import { type ShipWall, type Vec, dist } from '../../sim/course/contract';
import type { Projector } from '../project';
import { type Prim, posHash } from './shared';

const WALL = {
  deckShadow: 'rgba(2,4,8,0.4)', // the wall's shadow thrown INWARD across the deck (corridor reads sunk)
  outer: '#0c1015', // near-black outer edge against space
  base: '#232b34', // dark steel body
  mid: '#414d58', // lit steel face
  top: '#9fc0d2', // cold steel-lit cap along the top of the bulkhead
  buttress: 'rgba(6,10,15,0.6)', // structural rib buttressing the wall inward
  rivet: '#12181e',
};

/**
 * Draw the ship-corridor BULKHEADS (course space → screen). These are the tall metal walls that hem the
 * corridor in — impassable in the sim (`sim/walls.ts`), so they're drawn with real presence: an inward
 * cast SHADOW on the deck (the corridor reads sunk between walls), a thick dark steel BODY, a bright
 * cold-steel lit CAP along the top, periodic structural BUTTRESS ribs, and rivets. Returns [] if none.
 */
export function styleShipWalls(walls: readonly ShipWall[] | undefined, proj: Projector): Prim[] {
  if (!walls || !walls.length) return [];
  const out: Prim[] = [];
  const thick = Math.max(3.4, Math.min(13, 1.9 * proj.scale));
  for (const w of walls) {
    const a = proj.project(w.a);
    const b = proj.project(w.b);
    // Inward normal in SCREEN space (project a small inward step off the endpoint and subtract).
    const ni = proj.project([w.a[0] + w.normal[0] * 2, w.a[1] + w.normal[1] * 2]);
    let inx = ni[0] - a[0];
    let iny = ni[1] - a[1];
    const il = Math.hypot(inx, iny) || 1;
    inx /= il;
    iny /= il;
    const off = (d: number): [Vec, Vec] => [[a[0] + inx * d, a[1] + iny * d], [b[0] + inx * d, b[1] + iny * d]];
    // 1) A soft shadow thrown INWARD onto the deck, so the corridor reads as a channel sunk between
    //    towering bulkheads rather than a flat strip with an edge line.
    const [s1, s2] = off(thick * 1.5);
    out.push({ t: 'line', a: s1, b: s2, stroke: WALL.deckShadow, sw: thick * 2.2, round: true });
    // 2) The bulkhead body: near-black outer edge (against space) → dark steel → lit steel face.
    out.push({ t: 'line', a, b, stroke: WALL.outer, sw: thick + 2.5, round: true });
    const [b1, b2] = off(thick * 0.2);
    out.push({ t: 'line', a: b1, b: b2, stroke: WALL.base, sw: thick + 0.5, round: true });
    const [m1, m2] = off(thick * 0.42);
    out.push({ t: 'line', a: m1, b: m2, stroke: WALL.mid, sw: thick * 0.8, round: true });
    // 3) The lit CAP along the top inner rim — the crest of the wall catching the cold starlight.
    const [c1, c2] = off(thick * 0.72);
    out.push({ t: 'line', a: c1, b: c2, stroke: WALL.top, sw: Math.max(1.1, thick * 0.3), round: true });
    // 4) Structural BUTTRESS ribs + rivets — spaced by COURSE length (camera-proof prim count).
    const segLen = dist(w.a, w.b);
    const ribs = Math.min(7, Math.max(1, Math.round(segLen / 8)));
    for (let k = 1; k <= ribs; k++) {
      const t = k / (ribs + 1);
      const px = a[0] + (b[0] - a[0]) * t;
      const py = a[1] + (b[1] - a[1]) * t;
      out.push({ t: 'line', a: [px, py], b: [px + inx * thick * 1.1, py + iny * thick * 1.1], stroke: WALL.buttress, sw: Math.max(1.4, thick * 0.34), round: true });
    }
    const rivets = Math.min(10, Math.max(1, Math.round(segLen / 4)));
    for (let k = 0; k <= rivets; k++) {
      const t = k / (rivets + 1);
      out.push({ t: 'circle', c: [a[0] + (b[0] - a[0]) * t + inx * thick * 0.28, a[1] + (b[1] - a[1]) * t + iny * thick * 0.28], r: Math.max(0.7, thick * 0.15), fill: WALL.rivet });
    }
  }
  return out;
}

const centroid = (poly: Vec[]): Vec => {
  let x = 0, y = 0;
  for (const p of poly) { x += p[0]; y += p[1]; }
  return [x / poly.length, y / poly.length];
};

/**
 * TORN broken-metal edges (GS-ship-feel): the derelict's hull SECTIONS are pieces of a ship torn in
 * half, so their edges bristle with twisted, jagged metal — bent plate, snapped spars, the odd severed
 * cable still sparking cyan. Walk each platform outline and poke small shard TEETH outward (away from
 * the section centroid) at intervals spaced by COURSE length (camera-proof count), so the graphic reads
 * "ripped apart", not a clean-cut island. Pure geometry, zero rng (`posHash` jitter only).
 */
export function styleTornHull(platforms: readonly Vec[][], proj: Projector): Prim[] {
  const out: Prim[] = [];
  for (const poly of platforms) {
    if (poly.length < 3) continue;
    const c = centroid(poly);
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const edgeLen = dist(a, b);
      // Sparse now (the jagged silhouette carries the torn read): a few sharp shards + cyan sparks as
      // accent, not a dense fringe. Spaced wide so it doesn't fuzz up the already-jagged outline.
      const teeth = Math.min(2, Math.floor(edgeLen / 18)); // spaced by course length
      for (let k = 1; k <= teeth; k++) {
        const t = (k - posHash(a[0], a[1], k) * 0.5) / (teeth + 1);
        const base: Vec = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        // Outward = away from the section centroid (robust to the polygon winding).
        let ox = base[0] - c[0];
        let oy = base[1] - c[1];
        const ol = Math.hypot(ox, oy) || 1;
        ox /= ol; oy /= ol;
        const len = 2.4 + posHash(a[0], a[1], k + 7) * 3.6; // course-yd shard length
        const tipC: Vec = [base[0] + ox * len, base[1] + oy * len];
        // A jagged twisted shard: base on the edge, a bent kink, a sharp tip. Projected to screen.
        const along: Vec = [-oy, ox];
        const kink: Vec = [base[0] + ox * len * 0.55 + along[0] * (posHash(a[0], a[1], k + 3) - 0.5) * len * 0.5,
                            base[1] + oy * len * 0.55 + along[1] * (posHash(a[0], a[1], k + 3) - 0.5) * len * 0.5];
        const p0 = proj.project(base);
        const p1 = proj.project(kink);
        const p2 = proj.project(tipC);
        out.push({ t: 'line', a: p0, b: p1, stroke: '#3a444e', sw: 2, round: true });
        out.push({ t: 'line', a: p1, b: p2, stroke: '#5c6773', sw: 1.4, round: true });
        // A cold starlit glint on the tip; the rare severed cable still sparks cyan.
        const spark = posHash(a[0], a[1], k + 11) < 0.18;
        out.push({ t: 'circle', c: p2, r: 1, fill: spark ? 'rgba(95,212,208,0.85)' : 'rgba(190,210,230,0.6)' });
      }
    }
  }
  return out;
}
