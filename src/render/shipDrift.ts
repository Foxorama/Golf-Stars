/**
 * DRIFTING SPACE JUNK (GS-ship-feel) — the animated Canvas2D twin of the derelict world's static
 * `archetypeDecor` wreckage (`style/flora.ts`). The SVG map keeps the static debris (a printed map is
 * still); the play view draws THIS over the scene: torn hull-plates, bolts and panels TUMBLING slowly
 * through the open space around the wreck, so the derelict reads as a ship actually coming apart adrift.
 *
 * Pure render decor — the sim never samples it, so animating it changes nothing physical. Motion rides
 * the play view's virtual clock (`now` ms), NEVER an rng draw, so no seeded stream is perturbed and the
 * map (no drift) is byte-identical. PERF: the chunks are seeded ONCE at mount in COURSE space; each
 * frame only re-projects + advances them by `now` and draws a short poly each — no scene rebuild. Count
 * caps hard. Chunks that would sit ON a land platform are skipped that frame (junk floats in the gaps /
 * the void, never on the deck).
 */

import type { Hole, Vec } from '../sim/course/contract';
import { pointInPoly } from '../sim/course/contract';
import type { Projector } from './project';
import { mulberry32, hashHole } from './style/shared';
import { landPolysCourseFor } from './style/land';

const DRIFT_SEED = 0x00d817f7;

interface Chunk {
  /** Base course position (the drift wraps around this within the hole band). */
  base: Vec;
  /** Unit drift direction. */
  dir: Vec;
  /** Drift speed (course-yd per second, small). */
  spd: number;
  /** Tumble rate (rad/s) and phase. */
  spin: number;
  phase: number;
  /** Plate size (yards) and vertex count. */
  size: number;
  sides: number;
  /** A wire still sparking on this chunk. */
  live: boolean;
}

export interface ShipDriftHandle {
  readonly active: boolean;
  /** Paint one frame. `now` = the play view's virtual clock (ms); `speed` scales the drift rate
   *  (`_gsFeel.shipDriftSpeed`, 0 freezes it). Cheap: re-projects + draws ~a dozen capped chunks. */
  draw(ctx: CanvasRenderingContext2D, proj: Projector, now: number, accents: number, speed: number): void;
}

const INERT: ShipDriftHandle = { active: false, draw() {} };

/** Build the drifting-junk animator for a hole. Returns an inert handle for a degenerate hole. */
export function createShipDrift(hole: Hole): ShipDriftHandle {
  const pts = [hole.tee, hole.green, ...hole.centreline];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
  }
  if (!isFinite(minX)) return INERT;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  // A band a little wider than the hole so junk drifts through the space around the deck.
  const bx0 = minX - spanX * 0.4, bx1 = maxX + spanX * 0.4;
  const by0 = minY - spanY * 0.4, by1 = maxY + spanY * 0.4;
  const bw = bx1 - bx0, bh = by1 - by0;
  const rng = mulberry32((hashHole(hole) ^ DRIFT_SEED) >>> 0);
  const N = 16;
  const chunks: Chunk[] = [];
  for (let i = 0; i < N; i++) {
    const ang = rng() * Math.PI * 2;
    chunks.push({
      base: [bx0 + rng() * bw, by0 + rng() * bh],
      dir: [Math.cos(ang), Math.sin(ang)],
      spd: 1.2 + rng() * 2.6,
      spin: (rng() - 0.5) * 0.7,
      phase: rng() * Math.PI * 2,
      size: 2.2 + rng() * 4.5,
      sides: 4 + (rng() < 0.5 ? 0 : 1),
      live: rng() < 0.22,
    });
  }
  const land = landPolysCourseFor(hole, false);
  const onLand = (p: Vec): boolean => land.some((lp) => pointInPoly(p, lp));

  return {
    active: true,
    draw(ctx, proj, now, accents, speed) {
      if (accents <= 0 || speed <= 0) return;
      const cap = Math.min(N, Math.max(6, Math.round(N * Math.min(1, accents))));
      const t = (now / 1000) * speed;
      ctx.save();
      for (let i = 0; i < cap; i++) {
        const c = chunks[i]!;
        // Drift + WRAP within the band so the field loops seamlessly.
        let x = c.base[0] + c.dir[0] * c.spd * t;
        let y = c.base[1] + c.dir[1] * c.spd * t;
        x = bx0 + (((x - bx0) % bw) + bw) % bw;
        y = by0 + (((y - by0) % bh) + bh) % bh;
        if (onLand([x, y])) continue; // never over the deck
        const s = proj.project([x, y]);
        if (s[0] < -40 || s[0] > proj.width + 40 || s[1] < -40 || s[1] > proj.height + 40) continue;
        const r = Math.max(2, c.size * proj.scale);
        const rot = c.phase + c.spin * t;
        // A jagged, torn plate — uneven radii = a torn hull fragment.
        ctx.beginPath();
        for (let k = 0; k < c.sides; k++) {
          const a = rot + (k / c.sides) * Math.PI * 2;
          const rk = r * (0.55 + ((Math.sin(a * 3 + c.phase) + 1) * 0.35));
          const px = s[0] + Math.cos(a) * rk;
          const py = s[1] + Math.sin(a) * rk * 0.82;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(58,68,78,0.72)';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(150,180,210,0.5)';
        ctx.stroke();
        // A cold starlit edge glint, and the rare live-wire cyan spark.
        ctx.fillStyle = c.live ? 'rgba(95,212,208,0.85)' : 'rgba(190,210,230,0.7)';
        ctx.beginPath();
        ctx.arc(s[0] + Math.cos(rot) * r * 0.4, s[1] + Math.sin(rot) * r * 0.4, Math.max(0.8, r * 0.14), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    },
  };
}
