/**
 * Manual putting PACE METER (Canvas2D, time/DOM side-effect — not unit-testable "feel", like the
 * play view). A marker sweeps a power bar; the player taps to stop it. Where it stops becomes the
 * struck PACE (a fraction of the distance to the cup), which the reducer feeds to `manualPutt` to
 * resolve the putt by SKILL. Stop inside the green MAKE band to drop it; short leaves it short, long
 * runs it past. The make band is `band` wide (widened by putter upgrades), centred on the ideal pace.
 *
 * Pure-feel layer: all the actual putt math is in `sim/round.manualPutt`; this only captures the input.
 */

import { MANUAL_IDEAL_PACE, MANUAL_PACE_MAX } from '../sim/round';
import { drawCaddy, hasCaddyArt } from './caddyArt';

export interface PuttMeterOptions {
  width?: number;
  height?: number;
  /** Make-band half-width (pace fraction) from the loadout's putt skill. */
  band: number;
  /** Sweep period one-way (ms). Lower = faster = harder. */
  periodMs?: number;
  /** Called with the captured pace when the player taps/commits. */
  onCommit: (pace: number) => void;
  /** The hired named caddy id (GS-caddy) — drawn beside the meter so the caddy shows while putting. */
  caddyId?: string;
}

export interface PuttMeterHandle {
  /** Commit at the marker's current pace (used by an external "Putt" button). */
  commit(): void;
  destroy(): void;
}

export function mountPuttMeter(container: HTMLElement, opts: PuttMeterOptions): PuttMeterHandle {
  const width = opts.width ?? 300;
  const height = opts.height ?? 70;
  const period = opts.periodMs ?? 1250;
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.cursor = 'pointer';
  canvas.style.touchAction = 'none';
  canvas.style.borderRadius = '10px';
  container.innerHTML = '';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const padX = 14;
  const barY = height * 0.52;
  const barH = 16;
  // Reserve a right-hand strip for the hired caddy so it watches over your putt (GS-caddy).
  const caddyW = hasCaddyArt(opts.caddyId) ? 46 : 0;
  const barW = width - padX * 2 - caddyW;
  const paceToX = (p: number): number => padX + (p / MANUAL_PACE_MAX) * barW;

  let raf = 0;
  let start = 0;
  let committed = false;
  let frozenPace = 0;

  function currentPace(now: number): number {
    if (committed) return frozenPace;
    const phase = ((now - start) / period) % 2;
    const tri = phase < 1 ? phase : 2 - phase; // ping-pong 0..1..0
    return tri * MANUAL_PACE_MAX;
  }

  function draw(now: number): void {
    if (!start) start = now;
    const pace = currentPace(now);
    ctx.clearRect(0, 0, width, height);

    // Track background.
    ctx.fillStyle = '#1a1e27';
    ctx.fillRect(padX, barY, barW, barH);

    // Short (left) → long (right) tint.
    const grad = ctx.createLinearGradient(padX, 0, padX + barW, 0);
    grad.addColorStop(0, '#3a4654');
    grad.addColorStop(1, '#5a4030');
    ctx.fillStyle = grad;
    ctx.fillRect(padX, barY, barW, barH);

    // Make band (green) centred on the ideal pace.
    const x0 = paceToX(Math.max(0, MANUAL_IDEAL_PACE - opts.band));
    const x1 = paceToX(Math.min(MANUAL_PACE_MAX, MANUAL_IDEAL_PACE + opts.band));
    ctx.fillStyle = committed ? '#3f8c43' : '#46c24f';
    ctx.fillRect(x0, barY, x1 - x0, barH);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x0, barY, x1 - x0, barH * 0.4);

    // Ideal tick.
    const xi = paceToX(MANUAL_IDEAL_PACE);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xi, barY - 3);
    ctx.lineTo(xi, barY + barH + 3);
    ctx.stroke();

    // Sweeping marker.
    const mx = paceToX(pace);
    const inBand = mx >= x0 && mx <= x1;
    ctx.fillStyle = committed ? (inBand ? '#9fffa6' : '#ffb0b0') : '#ffffff';
    ctx.fillRect(mx - 2, barY - 8, 4, barH + 16);
    ctx.beginPath();
    ctx.moveTo(mx - 6, barY - 8);
    ctx.lineTo(mx + 6, barY - 8);
    ctx.lineTo(mx, barY - 2);
    ctx.closePath();
    ctx.fill();

    // Labels.
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textAlign = 'left';
    ctx.fillText('SHORT', padX, barY - 12);
    ctx.textAlign = 'right';
    ctx.fillText('LONG', padX + barW, barY - 12);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#7fe486';
    ctx.fillText('MAKE', (x0 + x1) / 2, barY + barH + 16);

    // The hired caddy, watching over the putt.
    if (caddyW > 0 && opts.caddyId) {
      drawCaddy(ctx, opts.caddyId, width - caddyW / 2 - 4, height - 6, height * 0.82, now);
    }

    raf = requestAnimationFrame(draw);
  }
  raf = requestAnimationFrame(draw);

  function commit(): void {
    if (committed) return;
    // Capture the marker's live pace BEFORE freezing — `currentPace` short-circuits to the
    // (still-zero) `frozenPace` once `committed` is set, so order matters here.
    frozenPace = currentPace(performance.now());
    committed = true;
    opts.onCommit(frozenPace);
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    commit();
  });

  return {
    commit,
    destroy(): void {
      cancelAnimationFrame(raf);
      container.innerHTML = '';
    },
  };
}
