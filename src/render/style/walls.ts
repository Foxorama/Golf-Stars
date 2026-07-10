/**
 * Ship-corridor WALLS painter (GS-ship-walls) — draw the derelict world's collidable metal walls as
 * raised riveted barriers lining the hull-deck corridor, so the ball is SEEN bouncing off the wall the
 * sim reflects off (the graphic IS the physics; both read `hole.walls`). Course-space, projected, so
 * the walls track the follow-cam. Pure geometry, ZERO rng — the rivet count keys off the segment's
 * COURSE length (never the projection), so the prim count is camera-proof.
 */

import { type ShipWall, dist } from '../../sim/course/contract';
import type { Projector } from '../project';
import type { Prim } from './shared';

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
