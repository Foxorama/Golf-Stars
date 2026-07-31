/**
 * Manual putting PACE METER (Canvas2D, time/DOM side-effect — not unit-testable "feel", like the
 * play view). A marker sweeps a power bar; the player taps to stop it. Where it stops becomes the
 * struck PACE (a fraction of the distance to the cup), which the reducer feeds to `manualPutt` to
 * resolve the putt by SKILL. Stop inside the green MAKE band to drop it; short leaves it short, long
 * runs it past. The make band is `band` wide (widened by putter upgrades), centred on the ideal pace.
 *
 * Pure-feel layer: all the actual putt math is in `sim/round.manualPutt`; this only captures the input.
 *
 * GS-putt-panel repainted it and CHANGED NOTHING IT MEASURES. The sweep period, the pace mapping and
 * the make band are BALANCE (CLAUDE.md contract 4 — the putt meter is deliberately excluded from feel
 * passes), so this pass is strictly pixels: rounded track, a lit make band, a marker that reads at a
 * glance, captions in the instrument-cluster's own type, and the tap instruction drawn ON the thing
 * you tap. Every number that reaches `onCommit` is byte-for-byte what it was.
 *
 * Two rules it now keeps that the old paint did not:
 *  - **The type comes from `--gs-font`**, resolved off the mounted element — a canvas is invisible to
 *    a stylesheet, so a hard-coded `system-ui` here is a label the Readable-text toggle cannot reach
 *    (GS-a11y-readable-text's rule, applied to the one surface CSS can't).
 *  - **The palette comes from the app's own tokens** (`--gs-accent`/`--gs-ink`/`--gs-dim`), so the
 *    meter recolours with the game instead of carrying a private set of hexes.
 */

import { MANUAL_IDEAL_PACE, MANUAL_PACE_MAX } from '../sim/round';
import { canvasRatio } from './pixelRatio';

export interface PuttMeterOptions {
  width?: number;
  height?: number;
  /** Make-band half-width (pace fraction) from the loadout's putt skill. */
  band: number;
  /** Sweep period one-way (ms). Lower = faster = harder. */
  periodMs?: number;
  /** Called with the captured pace when the player taps/commits. */
  onCommit: (pace: number) => void;
}

export interface PuttMeterHandle {
  /** Commit at the marker's current pace (used by an external "Putt" button). */
  commit(): void;
  destroy(): void;
}

/** One of the app's CSS custom properties, read off the mounted element so the meter inherits the
 *  live theme (and the reader's font). Falls back to the shipped default when there is no CSSOM. */
function token(el: HTMLElement, name: string, fallback: string): string {
  if (typeof getComputedStyle !== 'function') return fallback;
  try {
    return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

/** Rounded-rect path. Written out rather than leaning on `ctx.roundRect`, which is recent enough
 *  that a shipped-to-phones surface should not assume it. */
function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

export function mountPuttMeter(container: HTMLElement, opts: PuttMeterOptions): PuttMeterHandle {
  const width = opts.width ?? 300;
  const height = opts.height ?? 62;
  const period = opts.periodMs ?? 1250;
  const dpr = canvasRatio();

  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.cursor = 'pointer';
  canvas.style.touchAction = 'none';
  canvas.style.borderRadius = '12px';
  // SPOKEN, NEVER TABBED (GS-a11y-stroke-focus). The meter used to claim `role="button"`, which
  // `wireRoleButtonKeys` then handed a tab stop and an Enter/Space binding that synthesises a
  // `click` — and this canvas only listens for `pointerdown`. So it was a dead stop in the tab order
  // of every putt: a keyboard player landed on something announced as a button, pressed Enter, and
  // nothing happened. It is a picture of a moving thing, not a control (⛳ Putt is the control that
  // stops it), so it says so — `role="img"` is not focusable, and the label carries the instruction
  // that makes the putt playable without sight of the sweep.
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    'Pace meter: a marker sweeps between short and long. Activate the Putt button to stop it in the make band.',
  );
  const font = token(container, '--gs-font', 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif');
  const accent = token(container, '--gs-accent', '#5fd45a');
  const ink = token(container, '--gs-ink', '#e8e8ea');
  const dim = token(container, '--gs-dim', '#9aa1ad');
  container.innerHTML = '';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const padX = 12;
  const capY = 11; // baseline of the SHORT / TAP TO STOP / LONG caption row
  const barY = 21;
  const barH = 18;
  const barR = 9;
  const makeY = barY + barH + 15; // baseline of the MAKE label under the band
  // The hired caddy (a putting specialist) stands in the framed badge beside the meter, drawn by the
  // app — the meter itself uses its full width for the pace bar.
  const barW = width - padX * 2;
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

  /** Caption type: the instrument cluster's own shape — small, bold, tracked, upper-case. */
  function caption(size: number, colour: string, alpha = 1): void {
    ctx.font = `700 ${size}px ${font}`;
    ctx.fillStyle = colour;
    ctx.globalAlpha = alpha;
    // Tracking is a recent canvas property; where it exists the captions match the HUD's pods.
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0.06em';
  }

  function draw(now: number): void {
    if (!start) start = now;
    const pace = currentPace(now);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;

    // ── Track: a rounded well, cool at the SHORT end and warm at the LONG end, so the two ways of
    //    missing read as different places rather than as one grey bar.
    const grad = ctx.createLinearGradient(padX, 0, padX + barW, 0);
    grad.addColorStop(0, '#2b3444');
    grad.addColorStop(0.5, '#333b49');
    grad.addColorStop(1, '#4b382c');
    rr(ctx, padX, barY, barW, barH, barR);
    ctx.fillStyle = '#11151d';
    ctx.fill();
    ctx.fillStyle = grad;
    ctx.fill();

    // ── Make band, clipped to the well so it can never square off the rounded ends.
    const x0 = paceToX(Math.max(0, MANUAL_IDEAL_PACE - opts.band));
    const x1 = paceToX(Math.min(MANUAL_PACE_MAX, MANUAL_IDEAL_PACE + opts.band));
    ctx.save();
    rr(ctx, padX, barY, barW, barH, barR);
    ctx.clip();
    ctx.shadowColor = accent;
    ctx.shadowBlur = committed ? 0 : 12;
    ctx.fillStyle = committed ? '#3f8c43' : accent;
    ctx.fillRect(x0, barY, x1 - x0, barH);
    ctx.shadowBlur = 0;
    // A top sheen so the band reads as lit, not as a flat swatch.
    const sheen = ctx.createLinearGradient(0, barY, 0, barY + barH);
    sheen.addColorStop(0, 'rgba(255,255,255,0.30)');
    sheen.addColorStop(0.55, 'rgba(255,255,255,0.05)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x0, barY, x1 - x0, barH);
    ctx.restore();

    // Well rim, over everything, so band and track share one silhouette.
    rr(ctx, padX, barY, barW, barH, barR);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Ideal tick — the middle of the band, drawn INSIDE it so it reads as a target, not a divider.
    const xi = paceToX(MANUAL_IDEAL_PACE);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xi, barY + 3.5);
    ctx.lineTo(xi, barY + barH - 3.5);
    ctx.stroke();

    // ── Marker: a capsule through the well with a chevron on top. White while it sweeps; on the tap
    //    it freezes green (in the band) or red (missed), which is the first read of the outcome.
    const mx = paceToX(pace);
    const inBand = mx >= x0 && mx <= x1;
    const mCol = committed ? (inBand ? '#9fffa6' : '#ffb0b0') : '#ffffff';
    ctx.save();
    ctx.shadowColor = committed ? mCol : 'rgba(255,255,255,0.85)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = mCol;
    rr(ctx, mx - 2.5, barY - 5, 5, barH + 10, 2.5);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = mCol;
    ctx.beginPath();
    ctx.moveTo(mx - 5.5, barY - 10);
    ctx.lineTo(mx + 5.5, barY - 10);
    ctx.lineTo(mx, barY - 4);
    ctx.closePath();
    ctx.fill();

    // ── Captions. SHORT / LONG name the two misses; the tap instruction sits between them, on the
    //    control it instructs, which is what let the panel drop its prose row (GS-putt-panel).
    ctx.textBaseline = 'alphabetic';
    caption(9, dim, 0.85);
    ctx.textAlign = 'left';
    ctx.fillText('SHORT', padX + 1, capY);
    ctx.textAlign = 'right';
    ctx.fillText('LONG', padX + barW - 1, capY);
    if (!committed) {
      caption(9, ink, 0.5);
      ctx.textAlign = 'center';
      ctx.fillText('TAP TO STOP', padX + barW / 2, capY);
    }
    caption(9.5, accent, committed ? 0.7 : 1);
    ctx.textAlign = 'center';
    ctx.fillText('MAKE', (x0 + x1) / 2, makeY);
    ctx.globalAlpha = 1;

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
