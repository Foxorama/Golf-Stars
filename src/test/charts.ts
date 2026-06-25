/**
 * Tiny dependency-free Canvas2D charts for the Sim Lab (render-only, like render/playView.ts —
 * not unit-tested, verified eyes-on). They take a <canvas> + a result object from lab.ts and
 * draw it. No sim, no aggregation here — lab.ts already did the maths; this only paints.
 */

import type { Bin, DispersionStudy } from './lab';

const INK = '#cfe3ea';
const MUTED = '#6b7a85';
const GRID = 'rgba(159,216,230,0.10)';
const ACCENT = '#9fd8e6';
const TARGET = '#ffd166';
const BAR = 'rgba(159,216,230,0.55)';

/** Size the canvas backing store to its CSS box at devicePixelRatio; return the 2D ctx scaled. */
function fit(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 360;
  const h = canvas.clientHeight || 260;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/**
 * Top-down shot pattern: tee at bottom-centre, carry (downrange) up the page, lateral miss
 * across. The amber crosshair is the intended target (full carry, dead straight); the cloud is
 * where the balls actually finished, so a wide cloud = a wild club/skill and a cloud short of
 * the crosshair = "comes up short" — exactly the per-club wildness model.
 */
export function drawScatter(canvas: HTMLCanvasElement, study: DispersionStudy): void {
  const { ctx, w, h } = fit(canvas);
  const pad = 30;
  const samples = study.samples;
  if (samples.length === 0) return;

  let maxLat = 1;
  let maxCarry = study.intended;
  for (const s of samples) {
    maxLat = Math.max(maxLat, Math.abs(s.lateral));
    maxCarry = Math.max(maxCarry, s.carry);
  }
  maxLat *= 1.1;
  maxCarry *= 1.08;

  const cx = w / 2;
  const x = (lat: number): number => cx + (lat / maxLat) * (w / 2 - pad);
  const y = (carry: number): number => h - pad - (carry / maxCarry) * (h - 2 * pad);

  // centre line + carry gridlines every 50 yds
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, pad);
  ctx.lineTo(cx, h - pad);
  ctx.stroke();
  ctx.fillStyle = MUTED;
  ctx.font = '10px ui-monospace, monospace';
  for (let c = 50; c < maxCarry; c += 50) {
    const yy = y(c);
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    ctx.moveTo(pad, yy);
    ctx.lineTo(w - pad, yy);
    ctx.stroke();
    ctx.fillText(`${c}`, 2, yy + 3);
  }

  // the shot cloud — alpha scaled so 1000+ points read as density, not a blob
  const alpha = Math.max(0.04, Math.min(0.5, 30 / samples.length));
  ctx.fillStyle = `rgba(159,216,230,${alpha})`;
  for (const s of samples) {
    ctx.beginPath();
    ctx.arc(x(s.lateral), y(s.carry), 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // target crosshair (intended, straight)
  const tx = x(0);
  const ty = y(study.intended);
  ctx.strokeStyle = TARGET;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tx - 8, ty);
  ctx.lineTo(tx + 8, ty);
  ctx.moveTo(tx, ty - 8);
  ctx.lineTo(tx, ty + 8);
  ctx.stroke();

  // mean landing + ±1σ ellipse (carry σ vertical, lateral σ horizontal)
  const mx = x(study.lateral.mean);
  const my = y(study.carry.mean);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(
    mx,
    my,
    Math.abs(x(study.lateral.sd) - x(0)),
    Math.abs(y(study.carry.mean) - y(study.carry.mean + study.carry.sd)),
    0,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(mx, my, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // tee
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(cx, h - pad, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MUTED;
  ctx.fillText('tee', cx - 9, h - pad + 14);
  ctx.fillStyle = TARGET;
  ctx.fillText('target', tx + 10, ty + 3);
}

/** Carry-distance histogram (the bars from lab.histogram). */
export function drawHistogram(canvas: HTMLCanvasElement, bins: Bin[], label = 'carry (yds)'): void {
  const { ctx, w, h } = fit(canvas);
  const pad = 28;
  if (bins.length === 0) return;
  const maxCount = bins.reduce((m, b) => Math.max(m, b.count), 1);
  const lo = bins[0]!.lo;
  const hi = bins[bins.length - 1]!.hi;
  const bw = (w - 2 * pad) / bins.length;

  // axis
  ctx.strokeStyle = GRID;
  ctx.beginPath();
  ctx.moveTo(pad, h - pad);
  ctx.lineTo(w - pad, h - pad);
  ctx.stroke();

  ctx.fillStyle = BAR;
  bins.forEach((b, i) => {
    const bh = (b.count / maxCount) * (h - 2 * pad);
    ctx.fillRect(pad + i * bw + 0.5, h - pad - bh, Math.max(1, bw - 1), bh);
  });

  ctx.fillStyle = MUTED;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText(`${Math.round(lo)}`, pad, h - pad + 12);
  ctx.fillText(`${Math.round(hi)}`, w - pad - 22, h - pad + 12);
  ctx.fillText(label, w / 2 - 28, h - pad + 12);
}
