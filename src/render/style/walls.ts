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
  base: '#2a333c', // dark steel body
  mid: '#47535e', // lit face
  top: '#8fb0c0', // cold steel-lit cap
  rivet: '#1a2028',
  shadow: 'rgba(0,0,0,0.32)',
};

/** Draw the ship-corridor walls (course space → screen). Returns [] if the hole has none. */
export function styleShipWalls(walls: readonly ShipWall[] | undefined, proj: Projector): Prim[] {
  if (!walls || !walls.length) return [];
  const out: Prim[] = [];
  const thick = Math.max(2.4, Math.min(9, 1.3 * proj.scale));
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
    // Outward shadow (a touch toward space), then the body, then the lit inward cap.
    out.push({ t: 'line', a: [a[0] - inx * thick * 0.4, a[1] - iny * thick * 0.4], b: [b[0] - inx * thick * 0.4, b[1] - iny * thick * 0.4], stroke: WALL.shadow, sw: thick + 1.5, round: true });
    out.push({ t: 'line', a, b, stroke: WALL.base, sw: thick + 1, round: true });
    out.push({ t: 'line', a, b, stroke: WALL.mid, sw: thick, round: true });
    out.push({ t: 'line', a: [a[0] + inx * thick * 0.32, a[1] + iny * thick * 0.32], b: [b[0] + inx * thick * 0.32, b[1] + iny * thick * 0.32], stroke: WALL.top, sw: Math.max(1, thick * 0.34), round: true });
    // Rivets — spaced by COURSE length (camera-proof prim count).
    const segLen = dist(w.a, w.b);
    const rivets = Math.min(8, Math.max(1, Math.round(segLen / 4)));
    for (let k = 0; k <= rivets; k++) {
      const t = k / (rivets + 1);
      out.push({ t: 'circle', c: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], r: Math.max(0.7, thick * 0.16), fill: WALL.rivet });
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
      const teeth = Math.min(4, Math.floor(edgeLen / 7)); // spaced by course length
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
