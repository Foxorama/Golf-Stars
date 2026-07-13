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
import { drawWreck, type WreckKind } from './shipWreck';

const DRIFT_SEED = 0x00d817f7;
const SHIP_NAME = 'STARLIT WANDERER';

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

/** A LARGE drifting ship-SECTION (bridge/wing/engine) — the mangled remains of the "Starlit Wanderer".
 *  WORLD-ANCHORED (GS-decor-view-states): a course-space base + a course-yd/s drift, projected each
 *  frame exactly like the small `Chunk`s and like the static SVG map's `archetypeDecor` twin. It USED to
 *  be screen-space (a fixed on-screen size, anchored to a screen margin) so it held a "distant hull"
 *  size at every zoom — but that decoupled it from the world, so it kept a DIFFERENT scale + drift path
 *  in each view state (aim / watch / chip / putt) and JUMPED whenever the view switched. Course-anchoring
 *  makes it mode-invariant by construction: every projector reframes it WITH the world, never against it.
 *  It now zooms with the world (bigger in the tight follow-cam, smaller in the whole-hole map). */
interface Section {
  /** Base course position (the drift wraps around this within the hole band). Seeded OFF the deck. */
  base: Vec;
  /** Unit drift direction. */
  dir: Vec;
  /** Drift speed (course-yd per second, small). */
  spd: number;
  spin: number;
  phase: number;
  /** Section reach in course YARDS (× proj.scale each frame → screen px). */
  sizeYd: number;
  kind: WreckKind;
  /** The bridge carries the ship name. */
  name?: string;
  alpha: number;
}

/** The seeded, projector-INDEPENDENT model of a hole's drifting wreckage: the course-space band, the
 *  small tumbling chunks and the large hull sections. A pure function of the hole (deterministic seed),
 *  so it is identical across every view state — the projector only maps it to screen. Exposed for the
 *  view-invariance regression tests (`tests/decor-consistency.test.ts`). */
export interface ShipDriftModel {
  /** The course-space wrap band (a little wider than the hole) the junk drifts within. */
  band: { x0: number; y0: number; w: number; h: number };
  chunks: Chunk[];
  sections: Section[];
}

export interface ShipDriftHandle {
  readonly active: boolean;
  /** Paint one frame. `now` = the shared WALL clock (ms, `performance.now()` — the SAME source the
   *  aim/putt overlay feeds, so the drift is continuous across a view switch; NOT the slo-mo virtual
   *  clock); `speed` scales the drift rate (`_gsFeel.shipDriftSpeed`, 0 freezes it). Cheap: re-projects
   *  + draws ~a dozen capped chunks + 3 sections. */
  draw(ctx: CanvasRenderingContext2D, proj: Projector, now: number, accents: number, speed: number): void;
}

const INERT: ShipDriftHandle = { active: false, draw() {} };

/** Drift a course-space base along `dir` at `spd` yd/s for `t` seconds, WRAPPED within `band` so the
 *  field loops seamlessly. Pure (no projector, no rng) — the same for every view state. */
export function driftPos(base: Vec, dir: Vec, spd: number, band: ShipDriftModel['band'], t: number): Vec {
  const x = band.x0 + (((base[0] + dir[0] * spd * t - band.x0) % band.w) + band.w) % band.w;
  const y = band.y0 + (((base[1] + dir[1] * spd * t - band.y0) % band.h) + band.h) % band.h;
  return [x, y];
}

/** Build the projector-independent drift MODEL for a hole (seeded once, deterministic). Returns null for
 *  a degenerate hole. `createShipDrift` renders it; the tests assert it is course-space + mode-invariant. */
export function shipDriftModel(hole: Hole): ShipDriftModel | null {
  const pts = [hole.tee, hole.green, ...hole.centreline];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]);
  }
  if (!isFinite(minX)) return null;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  // A band a little wider than the hole so junk drifts through the space around the deck. The large
  // hull sections wrap at the band edges; a generous margin pushes those seams well off-screen.
  const bx0 = minX - spanX * 0.6, bx1 = maxX + spanX * 0.6;
  const by0 = minY - spanY * 0.6, by1 = maxY + spanY * 0.6;
  const band = { x0: bx0, y0: by0, w: bx1 - bx0, h: by1 - by0 };
  const rng = mulberry32((hashHole(hole) ^ DRIFT_SEED) >>> 0);
  const N = 16;
  const chunks: Chunk[] = [];
  for (let i = 0; i < N; i++) {
    const ang = rng() * Math.PI * 2;
    chunks.push({
      base: [bx0 + rng() * band.w, by0 + rng() * band.h],
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

  // LARGE drifting SECTIONS of the "Starlit Wanderer" (GS-ship-wreck): a bridge (with the ship name),
  // a torn wing, an engine cluster — distant hulls drifting through the space beside the corridor.
  // WORLD-ANCHORED (see `Section`): each is seeded in course space OFF the deck (rejection-sampled so it
  // starts in open space, not on the hull), and projected each frame so it stays locked to the world in
  // every view state. Seeded once here off the SAME stream (draw order unchanged → byte-identical seed).
  const pool: WreckKind[] = ['wing', 'engine'];
  const sections: Section[] = [];
  for (let i = 0; i < 3; i++) {
    const isBridge = i === 0;
    const kind: WreckKind = isBridge ? 'bridge' : pool[(rng() * pool.length) | 0]!;
    const ang = rng() * Math.PI * 2;
    // Draw a FIXED pool of candidate bases (fixed rng count → deterministic) and take the first that
    // starts OUT in the open space around the deck, so a hull piece floats in the gaps / the void rather
    // than on the corridor; fall back to the first candidate if every one landed on the hull.
    const cands: Vec[] = [];
    for (let k = 0; k < 4; k++) cands.push([bx0 + rng() * band.w, by0 + rng() * band.h]);
    const base: Vec = cands.find((c) => !onLand(c)) ?? cands[0]!;
    sections.push({
      base,
      dir: [Math.cos(ang), Math.sin(ang)],
      spd: 1.0 + rng() * 1.8, // slow course-yd/s drift
      spin: (rng() - 0.5) * 0.08,
      phase: rng() * Math.PI * 2 + (isBridge ? Math.PI : 0),
      // SMALL, detailed pieces (a little model drifting by), sized in course YARDS so they scale with
      // the world like every other decor element — not a frame-filling hull.
      sizeYd: isBridge ? 10 + rng() * 3 : 7 + rng() * 2.5,
      kind,
      name: isBridge ? SHIP_NAME : undefined,
      // Crisp + solid (they're small, so they never wash the scene); a touch translucent for depth.
      alpha: isBridge ? 0.92 : 0.82,
    });
  }

  return { band, chunks, sections };
}

/** Build the drifting-junk animator for a hole. Returns an inert handle for a degenerate hole. */
export function createShipDrift(hole: Hole): ShipDriftHandle {
  const model = shipDriftModel(hole);
  if (!model) return INERT;
  const { band, chunks, sections } = model;
  const N = chunks.length;
  const land = landPolysCourseFor(hole, false);
  const onLand = (p: Vec): boolean => land.some((lp) => pointInPoly(p, lp));
  const onScreen = (s: Vec, proj: Projector, pad: number): boolean =>
    s[0] >= -pad && s[0] <= proj.width + pad && s[1] >= -pad && s[1] <= proj.height + pad;

  return {
    active: true,
    draw(ctx, proj, now, accents, speed) {
      if (accents <= 0 || speed <= 0) return;
      const cap = Math.min(N, Math.max(6, Math.round(N * Math.min(1, accents))));
      const t = (now / 1000) * speed;
      ctx.save();
      // Big sections FIRST (behind the small tumbling junk), drifting through the open space around the
      // deck. World-anchored: drift the course base, skip if it wandered onto the hull, project + scale.
      for (const sc of sections) {
        const wp = driftPos(sc.base, sc.dir, sc.spd, band, t);
        if (onLand(wp)) continue; // a hull piece floats in the gaps / the void, never on the deck
        const s = proj.project(wp);
        const S = sc.sizeYd * proj.scale;
        if (!onScreen(s, proj, S)) continue;
        const rot = sc.phase + sc.spin * t;
        drawWreck(ctx, sc.kind, s[0], s[1], S, rot, sc.alpha * Math.min(1, accents), t, sc.name);
      }
      for (let i = 0; i < cap; i++) {
        const c = chunks[i]!;
        // Drift + WRAP within the band so the field loops seamlessly.
        const [x, y] = driftPos(c.base, c.dir, c.spd, band, t);
        if (onLand([x, y])) continue; // never over the deck
        const s = proj.project([x, y]);
        if (!onScreen(s, proj, 40)) continue;
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
