/**
 * Canvas2D play view — the animated, juicy ball-flight layer (GS-3).
 *
 * Reads a hole + the `ShotLog[]` the round sim already produced and animates each shot:
 * an arcing ball with a ground shadow, a fading trail, an impact puff and a carry-scaled
 * screen-shake on landing, plus a per-shot HUD (club + carry). The static hole geometry
 * is drawn with the SAME pure projector the SVG map uses, so the two agree exactly.
 *
 * Thin/imperative by design (this is the part you can't unit-test for "feel"); all the
 * pure math lives in `trajectory.ts`/`project.ts`. Feel tunables read from
 * `window._gsFeel` so they can be A/B'd live (CLAUDE.md escape-hatch rule).
 */

import type { Hole, Vec } from '../sim/course/contract';
import type { PuttLog, ShotLog } from '../sim/round';
import { obStakes, playBoundsCorners } from '../sim/round';
import { holeProjector } from './project';
import { fillFor, roughFor, OB, TREE } from './palette';
import {
  arcPeak,
  easeOutCubic,
  flightDurationMs,
  sampleFlight,
  DEFAULT_FLIGHT_FEEL,
  type FlightFeel,
} from './trajectory';

interface PlayFeel extends FlightFeel {
  /** Multiplies on-screen arc height (course px → visible loft). */
  heightExaggeration: number;
  /** Max screen-shake amplitude (px) at a full-power strike. */
  shakeAmp: number;
  /** Trail length in samples. */
  trailLen: number;
  /** Pause between shots (ms). */
  gapMs: number;
  /** Bounce hop height (course yards) as the ball lands & runs out. */
  bounceAmp: number;
  /** Number of decaying bounces during the run-out. */
  bounces: number;
  /** Pause (ms) the ball sits at rest so you can read where it finished. */
  restHoldMs: number;
}

const BASE_FEEL: PlayFeel = {
  ...DEFAULT_FLIGHT_FEEL,
  heightExaggeration: 0.55,
  shakeAmp: 7,
  trailLen: 18,
  gapMs: 170,
  bounceAmp: 4,
  bounces: 2,
  restHoldMs: 480,
};

function feel(): PlayFeel {
  const override = (window as unknown as { _gsFeel?: Partial<PlayFeel> })._gsFeel ?? {};
  return { ...BASE_FEEL, ...override };
}

export interface PlayViewOptions {
  width?: number;
  height?: number;
  biome?: string;
  /** Called once the final shot has landed. */
  onDone?: () => void;
}

export interface PlayViewHandle {
  replay(): void;
  destroy(): void;
}

interface Particle {
  pos: Vec; // screen px
  vel: Vec;
  life: number; // 1 → 0
}

/** Mount an animated play view of a hole's shots. Browser only. */
export function mountPlayView(
  container: HTMLElement,
  hole: Hole,
  shots: ShotLog[],
  putts: PuttLog[] = [],
  opts: PlayViewOptions = {},
): PlayViewHandle {
  const F = feel();
  const width = opts.width ?? 360;
  const height = opts.height ?? 640;
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.borderRadius = '10px';
  container.innerHTML = '';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Include every shot's flight + rest (and putt endpoints) so a wild shot that flies
  // off the terrain stays in frame instead of clipping.
  const extra: Vec[] = [];
  // Keep the OB boundary (and its stakes) in frame, like the SVG map.
  extra.push(...playBoundsCorners(hole));
  for (const s of shots) extra.push(s.from, s.result.landing, s.rest);
  for (const p of putts) extra.push(p.from, p.to);
  const proj = holeProjector(hole, { width, height, extra });

  // --- animation state ---
  let shotIndex = 0;
  let puttIndex = 0;
  let segStart = 0; // start time of the current shot or putt
  let raf = 0;
  let trail: Vec[] = [];
  let particles: Particle[] = [];
  let shake = 0; // 0..1, decays
  let done = false;
  let lastImpactShot = -1; // shot whose landing impact/hold has already been triggered

  function reset(now: number): void {
    shotIndex = 0;
    puttIndex = 0;
    segStart = now;
    trail = [];
    particles = [];
    shake = 0;
    done = false;
    lastImpactShot = -1;
  }

  function spawnImpact(at: Vec, power: number): void {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sp = 0.6 + power * 1.8;
      particles.push({ pos: [...at] as Vec, vel: [Math.cos(a) * sp, Math.sin(a) * sp], life: 1 });
    }
    shake = Math.min(1, power);
  }

  function drawStatic(): void {
    ctx.fillStyle = roughFor(opts.biome);
    ctx.fillRect(0, 0, width, height);

    const drawPoly = (poly: Vec[], fill: string) => {
      ctx.beginPath();
      poly.forEach((p, i) => {
        const [x, y] = proj.project(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.stroke();
    };

    // A tree draws as a canopy glyph (shaded base, lit top, trunk) so a treeline reads as
    // woods; every other feature is a filled polygon.
    const drawTree = (poly: Vec[]): void => {
      let cx = 0;
      let cy = 0;
      for (const p of poly) {
        cx += p[0];
        cy += p[1];
      }
      cx /= poly.length;
      cy /= poly.length;
      let rad = 0;
      for (const p of poly) rad += Math.hypot(p[0] - cx, p[1] - cy);
      rad /= poly.length;
      const [x, y] = proj.project([cx, cy]);
      const rr = Math.max(3, rad * proj.scale);
      ctx.strokeStyle = TREE.trunk;
      ctx.lineWidth = rr * 0.35;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y + rr * 0.9);
      ctx.lineTo(x, y + rr * 0.2);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = TREE.shade;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = TREE.canopy;
      ctx.beginPath();
      ctx.arc(x - rr * 0.28, y - rr * 0.28, rr * 0.62, 0, Math.PI * 2);
      ctx.fill();
    };

    for (const f of hole.features) drawPoly(f.poly, fillFor(f.kind));
    for (const f of hole.hazards) {
      if (f.kind === 'trees') drawTree(f.poly);
      else drawPoly(f.poly, fillFor(f.kind));
    }

    // Out-of-bounds stakes: a faint dashed boundary line joining white, red-capped posts
    // around the OB box — the visible stroke-and-distance edge.
    const corners = playBoundsCorners(hole);
    ctx.setLineDash([2, 7]);
    ctx.strokeStyle = OB.line;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    corners.forEach((p, i) => {
      const [x, y] = proj.project(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    for (const s of obStakes(hole)) {
      const [x, y] = proj.project(s);
      ctx.strokeStyle = OB.post;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 7);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = OB.cap;
      ctx.beginPath();
      ctx.arc(x, y - 7, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Centreline.
    ctx.beginPath();
    hole.centreline.forEach((p, i) => {
      const [x, y] = proj.project(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);

    // Tee + flagstick. The flag stands at the pin (GS-6) so the ball flies to the real
    // target; falls back to the centroid for a pin-less hole.
    const [tx, ty] = proj.project(hole.tee);
    const [gx, gy] = proj.project(hole.pin ?? hole.green);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.arc(tx, ty, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Flagstick.
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, gy - 14);
    ctx.stroke();
    ctx.fillStyle = '#ff3b3b';
    ctx.beginPath();
    ctx.moveTo(gx, gy - 14);
    ctx.lineTo(gx + 9, gy - 11);
    ctx.lineTo(gx, gy - 8);
    ctx.closePath();
    ctx.fill();
  }

  function drawHUD(text: string): void {
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    const w = ctx.measureText(text).width + 16;
    ctx.fillRect(8, 8, w, 24);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, 16, 24);
  }

  function frame(now: number): void {
    if (!segStart) segStart = now;

    // Screen-shake offset (deterministic decay).
    ctx.save();
    if (shake > 0) {
      const amp = F.shakeAmp * shake;
      ctx.translate(Math.sin(now * 0.08) * amp, Math.cos(now * 0.11) * amp);
      shake = Math.max(0, shake - 0.06);
    }

    drawStatic();

    let hudText = '';

    if (shotIndex < shots.length) {
      const shot = shots[shotIndex]!;
      const carry = shot.result.carry;
      const touchdown = shot.result.landing;
      const rest = shot.rest ?? touchdown;
      const peak = arcPeak(carry);
      const flightDur = flightDurationMs(carry);
      // Roll-out duration scales with the on-screen roll distance.
      const [tdx, tdy] = proj.project(touchdown);
      const [rsx, rsy] = proj.project(rest);
      const rollPx = Math.hypot(rsx - tdx, rsy - tdy);
      // Run-out duration scales with the on-screen roll (forward OR backspin check-back).
      const rollDur = Math.abs(shot.roll ?? 0) > 0.3 ? Math.max(140, Math.min(480, rollPx * 9)) : 0;
      const elapsed = now - segStart;

      let ground: Vec;
      let height: number;
      if (elapsed < flightDur) {
        const s = sampleFlight(shot.from, touchdown, elapsed / flightDur, peak);
        ground = s.ground;
        height = s.height;
      } else {
        // Land → bounce → run/check out → hold at rest. The ball travels touchdown→rest
        // (rest is BEHIND touchdown for a backspin check) while doing a couple of decaying
        // hops, then sits still for restHoldMs so you can read the finish.
        const rt = rollDur > 0 ? Math.min(1, (elapsed - flightDur) / rollDur) : 1;
        const e = easeOutCubic(rt);
        ground = [touchdown[0] + (rest[0] - touchdown[0]) * e, touchdown[1] + (rest[1] - touchdown[1]) * e];
        height = F.bounceAmp * Math.abs(Math.sin(rt * Math.PI * F.bounces)) * (1 - rt);
      }

      const [gx, gy] = proj.project(ground);
      const ballY = gy - height * proj.scale * F.heightExaggeration;

      // Shadow (fades as the ball climbs).
      ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - height / (peak + 1))})`;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Trail.
      trail.push([gx, ballY]);
      if (trail.length > F.trailLen) trail.shift();
      ctx.beginPath();
      trail.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1])));
      ctx.strokeStyle = 'rgba(255,216,74,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Ball (a touch bigger when lofted).
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(gx, ballY, 3 + (height / (peak + 1)) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      hudText = `${shot.club.name} · ${Math.round(carry)} yds${shot.holed ? ' · IN! 🎉' : ''}${shot.penalty ? ` · ${shot.penalty.toUpperCase()}!` : ''}`;

      // At the moment the run-out finishes: fire the hole-out explosion (holed only) once,
      // and start the rest-hold pause.
      if (elapsed >= flightDur + rollDur && lastImpactShot !== shotIndex) {
        lastImpactShot = shotIndex;
        if (shot.holed) spawnImpact([rsx, rsy], 1);
        trail = [];
      }
      // Advance to the next shot only after the ball has sat at rest for restHoldMs.
      if (elapsed >= flightDur + rollDur + F.restHoldMs) {
        shotIndex++;
        segStart = now + F.gapMs;
      }
    } else if (puttIndex < putts.length) {
      // Putt phase: flat roll across the green, eased to a stop, into the cup.
      const putt = putts[puttIndex]!;
      const len = Math.hypot(putt.to[0] - putt.from[0], putt.to[1] - putt.from[1]);
      const dur = Math.max(300, Math.min(750, len * proj.scale * 12));
      const t = Math.max(0, Math.min(1, (now - segStart) / dur));
      const e = easeOutCubic(t);
      const gx = proj.project([
        putt.from[0] + (putt.to[0] - putt.from[0]) * e,
        putt.from[1] + (putt.to[1] - putt.from[1]) * e,
      ] as Vec);

      // Putt line (aim guide) + rolling ball, both flat on the green.
      const [fx, fy] = proj.project(putt.from);
      const [tx, ty] = proj.project(putt.to);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(gx[0], gx[1], 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      hudText = `Putt ${puttIndex + 1}${putt.holed ? ' — in!' : ''}`;

      if (t >= 1) {
        if (putt.holed) spawnImpact([tx, ty], 0.5);
        puttIndex++;
        segStart = now + F.gapMs;
      }
    } else if (!done) {
      done = true;
      opts.onDone?.();
    }

    // Particles.
    particles = particles.filter((p) => p.life > 0);
    for (const p of particles) {
      p.pos[0] += p.vel[0];
      p.pos[1] += p.vel[1];
      p.life -= 0.04;
      ctx.fillStyle = `rgba(255,235,180,${p.life})`;
      ctx.beginPath();
      ctx.arc(p.pos[0], p.pos[1], 2.5 * p.life + 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    if (hudText) drawHUD(hudText);

    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);

  return {
    replay(): void {
      reset(performance.now());
    },
    destroy(): void {
      cancelAnimationFrame(raf);
      container.innerHTML = '';
    },
  };
}
