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
import type { ShotLog } from '../sim/round';
import { holeProjector } from './project';
import { fillFor, roughFor } from './palette';
import {
  arcPeak,
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
}

const BASE_FEEL: PlayFeel = {
  ...DEFAULT_FLIGHT_FEEL,
  heightExaggeration: 0.55,
  shakeAmp: 7,
  trailLen: 18,
  gapMs: 170,
};

function feel(): PlayFeel {
  const override = (globalThis as { _gsFeel?: Partial<PlayFeel> })._gsFeel ?? {};
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
  opts: PlayViewOptions = {},
): PlayViewHandle {
  const F = feel();
  const width = opts.width ?? 360;
  const height = opts.height ?? 640;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);

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

  const proj = holeProjector(hole, { width, height });

  // --- animation state ---
  let shotIndex = 0;
  let shotStart = 0;
  let raf = 0;
  let trail: Vec[] = [];
  let particles: Particle[] = [];
  let shake = 0; // 0..1, decays
  let done = false;

  function reset(now: number): void {
    shotIndex = 0;
    shotStart = now;
    trail = [];
    particles = [];
    shake = 0;
    done = false;
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

    for (const f of hole.features) drawPoly(f.poly, fillFor(f.kind));
    for (const f of hole.hazards) drawPoly(f.poly, fillFor(f.kind));

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

    // Tee + pin.
    const [tx, ty] = proj.project(hole.tee);
    const [gx, gy] = proj.project(hole.green);
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
    if (!shotStart) shotStart = now;

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
      const dur = flightDurationMs(carry);
      const t = (now - shotStart) / dur;
      const peak = arcPeak(carry);
      const s = sampleFlight(shot.from, shot.result.landing, t, peak);

      const [gx, gy] = proj.project(s.ground);
      const lift = s.height * proj.scale * F.heightExaggeration;
      const ballX = gx;
      const ballY = gy - lift;

      // Shadow (fades as the ball climbs).
      ctx.fillStyle = `rgba(0,0,0,${0.35 * (1 - s.height / (peak + 1))})`;
      ctx.beginPath();
      ctx.ellipse(gx, gy, 4, 2, 0, 0, Math.PI * 2);
      ctx.fill();

      // Trail.
      trail.push([ballX, ballY]);
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
      ctx.arc(ballX, ballY, 3 + (s.height / (peak + 1)) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      hudText = `${shot.club.name} · ${Math.round(carry)} yds${shot.penalty ? ` · ${shot.penalty.toUpperCase()}!` : ''}`;

      if (t >= 1) {
        spawnImpact([gx, gy], Math.min(1, carry / 240));
        trail = [];
        shotIndex++;
        shotStart = now + F.gapMs;
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
