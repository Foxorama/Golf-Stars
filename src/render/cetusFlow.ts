/**
 * The MOVING Cetus star-waterfall (GS-cetus-flow) — the animated Canvas2D twin of the static
 * `cetusRiver` decor (`style/platforms.ts`). The SVG map keeps the static river (a printed map is
 * still); the play view suppresses it (`SceneOpts.animateCetus`) and draws THIS instead: a river of
 * stars that actually FLOWS down the corridor and POURS off the cliff as a living curtain.
 *
 * Pure render decor — the sim never samples it (cetus.test's invariant), so animating it changes
 * nothing physical. It reproduces the EXACT course-space channel `cetusRiverPath` emits (same
 * dedicated seed), so the flow sits precisely where the static map draws the river; motion rides the
 * play view's virtual clock (`now` ms), never an rng draw, so no seeded stream is perturbed.
 *
 * PERF: geometry (the meandering channel) is a pure function of the hole — computed ONCE at mount and
 * cached in COURSE space (projector-independent). Each frame only re-projects that short polyline and
 * advances ~a few dozen seeded particles by `now`; it does NOT rebuild the scene. Counts scale with
 * `accents` and cap hard, so a busy follow-cam frame stays cheap.
 */

import type { Hole, Vec } from '../sim/course/contract';
import { dist, pointInPoly } from '../sim/course/contract';
import type { Projector } from './project';
import { mulberry32, hashHole, projPoly } from './style/shared';
import { cetusRiverPath } from './style/platforms';
import { landPolysCourseFor } from './style/land';

// The dedicated river seed buildScene uses (`0x00cef10e`) — reproduced here so the animated channel
// is byte-identical geometry to the static map's, and a SECOND independent seed for the particle
// phases so the flow never perturbs the shared decor stream.
const RIVER_SEED = 0x00cef10e;
const PARTICLE_SEED = 0x00cef10f;

interface ChannelStar {
  u0: number; // start position along the channel [0,1]
  lat: number; // lateral offset (fraction of local half-width) [-1,1]
  hero: boolean; // a bright hero star w/ a halo
  hue: number; // colour pick
  sz: number; // size jitter
}
interface FallStreak {
  lane: number; // lateral lane across the curtain [-1,1]
  phase: number; // vertical phase [0,1]
  len: number; // streak length as a fraction of the drop
  hue: number;
  sz: number;
}

export interface CetusFlowHandle {
  /** True when this hole has a real river to animate (par 4/5 with a corridor). */
  readonly active: boolean;
  /** Paint one frame. `now` = the play view's virtual clock (ms); `speed` scales the flow rate
   *  (`_gsFeel.cetusFlowSpeed`, 0 freezes it). Cheap: re-projects a short polyline + advances the
   *  seeded particles — no scene rebuild. `overlayOnly` (the aim/putt screen's weather canvas, which
   *  sits ON TOP of the static SVG map) skips the opaque channel BED — the SVG already draws the
   *  static river underneath, so we layer only the MOVING star-motes + waterfall over it and never
   *  cover the ball marker / aim cone the SVG drew below (the play-view watch keeps the full bed). */
  draw(ctx: CanvasRenderingContext2D, proj: Projector, now: number, accents: number, speed: number, overlayOnly?: boolean): void;
}

/** Unit tangent at index i of a polyline, from its neighbours (local copy of the style helper). */
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

/** Sample a polyline at parameter `u` in [0,1] by arc length. Returns the point + local unit normal
 *  + the fractional index (so a per-point array like `hw` can be interpolated at the same spot). */
function sampleAt(line: Vec[], u: number): { p: Vec; nx: number; ny: number; fi: number } {
  const n = line.length;
  const uu = u < 0 ? 0 : u > 1 ? 1 : u;
  if (n === 1) return { p: line[0]!, nx: 0, ny: 0, fi: 0 };
  let total = 0;
  const cum = [0];
  for (let i = 1; i < n; i++) {
    total += dist(line[i - 1]!, line[i]!);
    cum.push(total);
  }
  if (total === 0) return { p: line[0]!, nx: 0, ny: 0, fi: 0 };
  const target = uu * total;
  for (let i = 1; i < n; i++) {
    if (cum[i]! >= target) {
      const seg = cum[i]! - cum[i - 1]! || 1;
      const f = (target - cum[i - 1]!) / seg;
      const a = line[i - 1]!;
      const b = line[i]!;
      const t = tangentAt(line, f < 0.5 ? i - 1 : i);
      return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], nx: -t[1], ny: t[0], fi: (i - 1) + f };
    }
  }
  const t = tangentAt(line, n - 1);
  return { p: line[n - 1]!, nx: -t[1], ny: t[0], fi: n - 1 };
}

/** Half-width (course yards) at a fractional channel index, linearly interpolated. */
function hwAtFi(hw: number[], fi: number): number {
  const i = Math.floor(fi);
  const j = Math.min(hw.length - 1, i + 1);
  const f = fi - i;
  return (hw[i] ?? hw[hw.length - 1] ?? 2) * (1 - f) + (hw[j] ?? hw[hw.length - 1] ?? 2) * f;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const frac = (x: number): number => x - Math.floor(x);

/** Build a moving-waterfall handle for a hole (call once at mount). `active` is false for a hole
 *  with no river (a par-3 island green), and `draw` is then a no-op. Cetus-gated by the caller. */
export function createCetusFlow(hole: Hole): CetusFlowHandle {
  const riverRng = mulberry32((hashHole(hole) ^ RIVER_SEED) >>> 0);
  const rp = cetusRiverPath(hole, riverRng);
  if (!rp) return { active: false, draw() {} };
  const line = rp.line;
  const hw = rp.hw;
  const spillAtEdge = rp.spillAtEdge;
  const land = landPolysCourseFor(hole);

  // Seed the flow particles ONCE (deterministic — no Math.random), then animate them off `now`.
  const prng = mulberry32((hashHole(hole) ^ PARTICLE_SEED) >>> 0);
  const chanStars: ChannelStar[] = [];
  for (let i = 0; i < 64; i++) {
    chanStars.push({ u0: prng(), lat: prng() * 2 - 1, hero: prng() < 0.09, hue: prng(), sz: prng() });
  }
  const streaks: FallStreak[] = [];
  for (let i = 0; i < 28; i++) {
    streaks.push({ lane: (i / 27) * 2 - 1 + (prng() - 0.5) * 0.14, phase: prng(), len: prng(), hue: prng(), sz: prng() });
  }
  // A couple of splash motes, seeded for a stable jitter.
  const splash: [number, number, number][] = [];
  for (let i = 0; i < 4; i++) splash.push([prng() * 2 - 1, prng(), 2.5 + prng() * 3.5]);
  // Source-spring bubbles — seeded angle/phase/size, swirled up out of the spring each frame.
  const srcMotes: [number, number, number][] = [];
  for (let i = 0; i < 8; i++) srcMotes.push([prng(), prng(), prng()]);

  const starCol = (hue: number): string =>
    hue < 0.5 ? 'rgba(255,255,255,0.9)' : hue < 0.78 ? 'rgba(180,242,255,0.85)' : 'rgba(210,220,255,0.8)';

  function draw(ctx: CanvasRenderingContext2D, proj: Projector, now: number, accents: number, speed: number, overlayOnly?: boolean): void {
    const scale = proj.scale;
    const screen = line.map((p) => proj.project(p));
    const hwPx = hw.map((h) => Math.max(1, h * scale));
    const avgHwPx = Math.max(2, hwPx.reduce((a, b) => a + b, 0) / hwPx.length);
    const flow = speed <= 0 ? 0 : speed;

    ctx.save();
    ctx.lineCap = 'round';

    // --- The channel: a dark deep-water bed with a soft bank glow + shoreline (the static container,
    //     drawn each frame so suppressing the map's static river loses nothing). Skipped in overlayOnly
    //     mode: the aim/putt canvas sits over the SVG map, whose static river IS the bed underneath —
    //     an opaque bed here would blot out the ball marker + aim cone the SVG drew below. ---
    if (!overlayOnly) {
      const ribbon = projPoly(ribbonVar(line, hw), proj);
      // Bank glow — the luminous water lighting the turf either side.
      for (let i = 1; i < screen.length; i++) {
        const w = ((hwPx[i - 1]! + hwPx[i]!) / 2) * 1.8 + 4;
        ctx.strokeStyle = 'rgba(95,225,252,0.10)';
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(screen[i - 1]![0], screen[i - 1]![1]);
        ctx.lineTo(screen[i]![0], screen[i]![1]);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(8,30,48,0.92)';
      ctx.beginPath();
      ctx.moveTo(ribbon[0]![0], ribbon[0]![1]);
      for (let i = 1; i < ribbon.length; i++) ctx.lineTo(ribbon[i]![0], ribbon[i]![1]);
      ctx.closePath();
      ctx.fill();
      // Star-water surface tone down the channel + a soft shoreline.
      for (let i = 1; i < screen.length; i++) {
        ctx.strokeStyle = 'rgba(60,150,205,0.7)';
        ctx.lineWidth = Math.max(1, ((hwPx[i - 1]! + hwPx[i]!) / 2) * 1.1);
        ctx.beginPath();
        ctx.moveTo(screen[i - 1]![0], screen[i - 1]![1]);
        ctx.lineTo(screen[i]![0], screen[i]![1]);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(170,235,250,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ribbon[0]![0], ribbon[0]![1]);
      for (let i = 1; i < ribbon.length; i++) ctx.lineTo(ribbon[i]![0], ribbon[i]![1]);
      ctx.closePath();
      ctx.stroke();
    }

    // --- FLOWING stars: the river actually moves. Each seeded star drifts source→spill; it fades in
    //     as it wells up and fades out as it pours over the lip, so the whole channel streams. ---
    if (accents > 0) {
      for (const st of chanStars) {
        const u = frac(st.u0 + now * 0.00014 * flow);
        const s = sampleAt(line, u);
        const half = hwAtFi(hw, s.fi) * 0.82;
        const wp: Vec = [s.p[0] + s.nx * st.lat * half, s.p[1] + s.ny * st.lat * half];
        const p = proj.project(wp);
        const hwPxL = Math.max(1, hwAtFi(hwPx, s.fi));
        // Fade in over the first 12% (the spring) and out over the last 16% (into the fall).
        const fade = clamp01(u / 0.12) * clamp01((1 - u) / 0.16);
        const twinkle = 0.6 + 0.4 * Math.sin(now * 0.006 + st.hue * 12 + s.fi);
        const a = fade * twinkle;
        if (a <= 0.02) continue;
        ctx.globalAlpha = a;
        if (st.hero) {
          const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], Math.min(3.6, hwPxL * 1.2));
          g.addColorStop(0, 'rgba(200,244,255,0.5)');
          g.addColorStop(1, 'rgba(200,244,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p[0], p[1], Math.min(3.6, hwPxL * 1.2), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = starCol(st.hue);
        const r = Math.min((st.hero ? 1.1 : 0.4) + st.sz * 0.7, Math.max(0.6, hwPxL * 0.42));
        ctx.beginPath();
        ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // --- The SOURCE spring: star-water WELLS UP out of the plateau — a soft welling glow, expanding
    //     ripple rings, a swirl of bubbling motes rising off it, and a small shimmering core. Reads as
    //     a living origin the river flows FROM, not a flat blue coin painted on the turf. ---
    const source = screen[0]!;
    const srcW = Math.max(3.5, hwPx[0]! * 1.95);
    const pulse = 0.85 + 0.15 * Math.sin(now * 0.004);
    // Welling glow — a two-stop bloom that dissolves into the channel rather than a hard disc.
    const sg = ctx.createRadialGradient(source[0], source[1], 0, source[0], source[1], srcW * 2.4 * pulse);
    sg.addColorStop(0, 'rgba(150,235,255,0.42)');
    sg.addColorStop(0.5, 'rgba(90,205,250,0.18)');
    sg.addColorStop(1, 'rgba(90,205,250,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(source[0], source[1], srcW * 2.4 * pulse, 0, Math.PI * 2);
    ctx.fill();
    // Upwelling ripple rings — expand + fade on a loop so the spring visibly bubbles up.
    for (let i = 0; i < 3; i++) {
      const t = frac(now * 0.0007 * (flow || 1) + i / 3);
      ctx.globalAlpha = clamp01((1 - t) * 0.5);
      ctx.strokeStyle = 'rgba(180,242,255,1)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(source[0], source[1], srcW * (0.32 + t * 1.5), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Bubbling motes — swirl up and outward from the core, fading as they rise.
    for (const [ma, mp, ms] of srcMotes) {
      const t = frac(mp + now * 0.0009 * (flow || 1));
      const ang = ma * Math.PI * 2 + t * 1.3;
      const rad = srcW * (0.15 + t * 1.05);
      const bx = source[0] + Math.cos(ang) * rad;
      const by = source[1] + Math.sin(ang) * rad;
      ctx.globalAlpha = clamp01((1 - t) * 0.85);
      ctx.fillStyle = 'rgba(224,250,255,0.95)';
      ctx.beginPath();
      ctx.arc(bx, by, 0.5 + ms * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Shimmering core — small, bright, twinkling; the eye of the spring.
    const coreP = 0.85 + 0.15 * Math.sin(now * 0.011);
    ctx.fillStyle = 'rgba(234,252,255,0.95)';
    ctx.beginPath();
    ctx.arc(source[0], source[1], srcW * 0.4 * coreP, 0, Math.PI * 2);
    ctx.fill();

    // --- The WATERFALL: only when the river reaches the plateau edge AND the drop lands off the land
    //     (the follow-cam can rotate "down" across turf — then no fall, exactly the static rule). ---
    if (!spillAtEdge) {
      ctx.restore();
      return;
    }
    const spill = screen[screen.length - 1]!;
    const fallLen = fallLenFor(line, land, proj, avgHwPx);
    const onLand = (p: Vec) => land.some((lp) => pointInPoly(p, lp));
    const paint =
      !onLand(proj.unproject(spill[0], spill[1] + fallLen * 0.35)) &&
      !onLand(proj.unproject(spill[0], spill[1] + fallLen * 0.8));
    if (!paint) {
      ctx.restore();
      return;
    }
    const spillW = Math.max(12, hwPx[hwPx.length - 1]! * 2.2);

    // Brink glow + a bright lip line where the water tips over.
    const bg = ctx.createRadialGradient(spill[0], spill[1], 0, spill[0], spill[1], spillW * 1.3);
    bg.addColorStop(0, 'rgba(140,232,255,0.38)');
    bg.addColorStop(1, 'rgba(140,232,255,0)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(spill[0], spill[1], spillW * 1.3, 0, Math.PI * 2);
    ctx.fill();
    // Translucent curtain bands fading with the drop (the container the streaks fall through).
    const xAt = (u: number, f: number) => spill[0] + f * spillW * (0.5 + 0.14 * u);
    const bands: [number, number, string][] = [
      [0, 0.4, 'rgba(150,222,248,0.4)'],
      [0.4, 0.72, 'rgba(118,190,235,0.24)'],
      [0.72, 1, 'rgba(92,150,210,0.1)'],
    ];
    for (const [u0, u1, col] of bands) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(xAt(u0, -1), spill[1] + fallLen * u0);
      ctx.lineTo(xAt(u0, 1), spill[1] + fallLen * u0);
      ctx.lineTo(xAt(u1, 1), spill[1] + fallLen * u1);
      ctx.lineTo(xAt(u1, -1), spill[1] + fallLen * u1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(235,252,255,0.9)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(spill[0] - spillW * 0.5, spill[1]);
    ctx.lineTo(spill[0] + spillW * 0.5, spill[1]);
    ctx.stroke();

    // FALLING star-streaks — the curtain in motion. Each seeded streak cycles top→bottom off `now`,
    // splaying gently outward + fading as it drops, with a bright droplet at its head.
    const fallN = accents > 0 ? streaks.length : 6;
    for (let i = 0; i < fallN; i++) {
      const st = streaks[i]!;
      const v = frac(st.phase + now * 0.001 * flow);
      const segLen = 0.12 + st.len * 0.22;
      const v1 = Math.min(1, v + segLen);
      const alpha = (0.42 + st.sz * 0.28) * (1 - v * 0.7);
      const xf = (u: number) => spill[0] + st.lane * spillW * (0.9 + 0.28 * u);
      ctx.globalAlpha = clamp01(alpha);
      ctx.strokeStyle = 'rgba(205,249,255,1)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(xf(v), spill[1] + fallLen * v);
      ctx.lineTo(xf(v1), spill[1] + fallLen * v1);
      ctx.stroke();
      if (accents > 0) {
        ctx.fillStyle = 'rgba(232,252,255,0.85)';
        ctx.beginPath();
        ctx.arc(xf(v1), spill[1] + fallLen * v1, 0.6 + st.sz * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // Splash foot: a pulsing mist bloom + outward ripple rings where the curtain meets the ocean.
    const pool: Vec = [spill[0], spill[1] + fallLen];
    const mg = ctx.createRadialGradient(pool[0], pool[1], 0, pool[0], pool[1], spillW * 1.3);
    mg.addColorStop(0, 'rgba(150,238,255,0.35)');
    mg.addColorStop(1, 'rgba(150,238,255,0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(pool[0], pool[1], spillW * 1.3, 0, Math.PI * 2);
    ctx.fill();
    for (const [mx, my, mr] of splash) {
      const wob = 1 + 0.25 * Math.sin(now * 0.007 + mx * 6);
      ctx.fillStyle = 'rgba(210,246,255,0.3)';
      ctx.beginPath();
      ctx.arc(pool[0] + mx * spillW * 0.45, pool[1] - my * 4, mr * wob, 0, Math.PI * 2);
      ctx.fill();
    }
    // Rings expand + fade on a loop, so the pool visibly churns.
    for (let i = 0; i < 3; i++) {
      const t = frac(now * 0.0006 + i / 3);
      const rr = spillW * (0.22 + t * 0.9);
      ctx.globalAlpha = clamp01((1 - t) * 0.5);
      ctx.strokeStyle = 'rgba(150,238,255,1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pool[0], pool[1], rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  return { active: true, draw };
}

/** The fall height (screen px) the curtain drops — mirrors the static build: the cliff face under the
 *  spill is `clamp(34,190, projectedPlatformWidth*0.44)` (platformCliffs) + 22 (cetusRiver), so the
 *  animated curtain reaches the same foot the map's does. Falls back to a channel-width default when
 *  the spill isn't over a known platform. */
function fallLenFor(line: Vec[], land: Vec[][], proj: Projector, avgHwPx: number): number {
  const probe = line[Math.max(0, line.length - 3)]!; // a couple of steps upstream — still on the plateau
  const home = land.find((p) => pointInPoly(probe, p));
  if (!home) return Math.max(26, avgHwPx * 5) + 20;
  let minX = Infinity;
  let maxX = -Infinity;
  for (const pt of home) {
    const s = proj.project(pt);
    if (s[0] < minX) minX = s[0];
    if (s[0] > maxX) maxX = s[0];
  }
  const cliffH = Math.max(34, Math.min(190, (maxX - minX) * 0.44));
  return cliffH + 22;
}
