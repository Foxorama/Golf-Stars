/**
 * Procedural caddy figures (GS-caddy) — self-contained Canvas2D drawings of each named caddy, in
 * the house "no downloaded asset" style (the same vector language as the play-view golfer). Drawn in
 * a screen corner while you're on a hole (and during putting) so the caddy you hired is visible, and
 * used as the muzzle anchor for the Space Ducks laser / Convict Sheep boomerang redirect effect.
 *
 * Each figure is authored in a local frame ~64 units tall (origin at the feet centre, −y up) and
 * scaled to `h` px. `drawCaddy` returns the WEAPON/HAND anchor in screen px (where a projectile
 * launches from). Pure drawing — feel only, verified eyes-on (no unit test).
 */

import type { Vec } from '../sim/course/contract';

/** The named-caddy ids that have a figure (mirrors the shop-item ids). */
export type CaddyArtId =
  | 'auto-caddie'
  | 'driver-dan'
  | 'dr-chipinski'
  | 'space-ducks'
  | 'convict-sheep'
  | 'suggestible-sam';

const ART_IDS: readonly string[] = [
  'auto-caddie',
  'driver-dan',
  'dr-chipinski',
  'space-ducks',
  'convict-sheep',
  'suggestible-sam',
];

/** Does this caddy id have a drawable figure? */
export function hasCaddyArt(id: string | undefined): id is CaddyArtId {
  return !!id && ART_IDS.includes(id);
}

/** Short display label drawn under the corner figure. */
export const CADDY_LABEL: Record<CaddyArtId, string> = {
  'auto-caddie': 'Penelope',
  'driver-dan': 'Driver Dan',
  'dr-chipinski': 'Dr Chipinski',
  'space-ducks': 'Space Ducks',
  'convict-sheep': 'Convict Sheep',
  'suggestible-sam': 'Suggestible Sam',
};

/** Which caddies actively fire a projectile mid-flight (Space Ducks laser, Convict Sheep boomerang). */
export function caddyProjectile(id: string | undefined): 'laser' | 'boomerang' | null {
  if (id === 'space-ducks') return 'laser';
  if (id === 'convict-sheep') return 'boomerang';
  return null;
}

/**
 * Draw a named caddy at feet-centre (cx, cy), `h` px tall. `t` is a time (ms) for a gentle idle bob.
 * Returns the weapon/hand anchor in screen px (the projectile launch point). Never throws.
 */
export function drawCaddy(
  ctx: CanvasRenderingContext2D,
  id: string,
  cx: number,
  cy: number,
  h: number,
  t: number,
): Vec {
  const u = h / 64;
  const bob = Math.sin(t * 0.004) * 1.2; // gentle idle bob (local units)
  ctx.save();
  ctx.translate(cx, cy + bob * u);
  ctx.scale(u, u);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Soft ground shadow (drawn un-bobbed-ish, anchored to feet).
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 1, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  let anchorLocal: Vec;
  switch (id) {
    case 'driver-dan':
      anchorLocal = drawDriverDan(ctx);
      break;
    case 'dr-chipinski':
      anchorLocal = drawChipinski(ctx);
      break;
    case 'space-ducks':
      anchorLocal = drawSpaceDuck(ctx, t);
      break;
    case 'convict-sheep':
      anchorLocal = drawConvictSheep(ctx, t);
      break;
    case 'suggestible-sam':
      anchorLocal = drawSuggestibleSam(ctx, t);
      break;
    case 'auto-caddie':
    default:
      anchorLocal = drawPenelope(ctx);
      break;
  }
  ctx.restore();
  return [cx + anchorLocal[0] * u, cy + (bob + anchorLocal[1]) * u];
}

// --- shared bits -------------------------------------------------------------
function legs(ctx: CanvasRenderingContext2D, color = '#2c3142'): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-2, -22);
  ctx.lineTo(-7, 0);
  ctx.moveTo(2, -22);
  ctx.lineTo(7, 0);
  ctx.stroke();
}

// --- Penelope Putter (the original auto-putt caddy) --------------------------
function drawPenelope(ctx: CanvasRenderingContext2D): Vec {
  legs(ctx);
  // Torso (teal caddy bib).
  ctx.strokeStyle = '#19b2a6';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(-1, -44);
  ctx.stroke();
  // Arm holding a flagstick.
  ctx.strokeStyle = '#e8c6a0';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-1, -40);
  ctx.lineTo(12, -34);
  ctx.stroke();
  // Flagstick + pennant.
  ctx.strokeStyle = '#d9dee8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(12, -52);
  ctx.lineTo(12, -28);
  ctx.stroke();
  ctx.fillStyle = '#ff5d5d';
  ctx.beginPath();
  ctx.moveTo(12, -52);
  ctx.lineTo(24, -49);
  ctx.lineTo(12, -46);
  ctx.closePath();
  ctx.fill();
  // Head + ponytail + cap.
  ctx.fillStyle = '#f0c49a';
  ctx.beginPath();
  ctx.arc(-1, -50, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6b4a2e';
  ctx.beginPath();
  ctx.ellipse(-8, -48, 3, 6, 0, 0, Math.PI * 2); // ponytail
  ctx.fill();
  ctx.fillStyle = '#138f86';
  ctx.beginPath();
  ctx.arc(-1, -52, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-1, -53, 8, 2.4); // brim
  return [-1, -40];
}

// --- Driver Dan (big stick from anywhere) -----------------------------------
function drawDriverDan(ctx: CanvasRenderingContext2D): Vec {
  legs(ctx, '#3a3f4c');
  // Burly torso.
  ctx.strokeStyle = '#e0883a';
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.moveTo(0, -20);
  ctx.lineTo(-1, -44);
  ctx.stroke();
  // A big driver slung over the shoulder (long shaft + chunky head).
  ctx.strokeStyle = '#c8ccd6';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(-12, -30);
  ctx.lineTo(16, -58);
  ctx.stroke();
  ctx.fillStyle = '#2b2f3a';
  ctx.beginPath();
  ctx.ellipse(18, -60, 6, 4.5, -0.7, 0, Math.PI * 2);
  ctx.fill();
  // Arm gripping.
  ctx.strokeStyle = '#d8a878';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-1, -40);
  ctx.lineTo(-12, -30);
  ctx.stroke();
  // Head + cap.
  ctx.fillStyle = '#d8a878';
  ctx.beginPath();
  ctx.arc(-1, -50, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c4882a';
  ctx.beginPath();
  ctx.arc(-1, -52, 6.5, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-9, -53, 9, 2.6);
  return [16, -58];
}

// --- Dr Chipinski (wedge wizard) --------------------------------------------
function drawChipinski(ctx: CanvasRenderingContext2D): Vec {
  legs(ctx, '#39405a');
  // White lab coat.
  ctx.strokeStyle = '#eef2f7';
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(0, -21);
  ctx.lineTo(-1, -44);
  ctx.stroke();
  // Wedge held out, head low (a chipping pose).
  ctx.strokeStyle = '#c8ccd6';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(10, -36);
  ctx.lineTo(20, -20);
  ctx.stroke();
  ctx.fillStyle = '#aeb6c6';
  ctx.beginPath();
  ctx.moveTo(20, -20);
  ctx.lineTo(26, -22);
  ctx.lineTo(24, -16);
  ctx.closePath();
  ctx.fill();
  // Arm.
  ctx.strokeStyle = '#e8c6a0';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-1, -40);
  ctx.lineTo(10, -36);
  ctx.stroke();
  // Head + glasses.
  ctx.fillStyle = '#e8c6a0';
  ctx.beginPath();
  ctx.arc(-1, -50, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b2f3a';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(-3.5, -50, 2, 0, Math.PI * 2);
  ctx.arc(1.5, -50, 2, 0, Math.PI * 2);
  ctx.moveTo(-1.5, -50);
  ctx.lineTo(-0.5, -50);
  ctx.stroke();
  // Tidy hair.
  ctx.fillStyle = '#3a3f4c';
  ctx.beginPath();
  ctx.arc(-1, -53, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  return [20, -20];
}

// --- Space Ducks (laser, bubble helmet, top hat) ----------------------------
function drawSpaceDuck(ctx: CanvasRenderingContext2D, t: number): Vec {
  // Webbed feet.
  ctx.fillStyle = '#e8902a';
  ctx.beginPath();
  ctx.ellipse(-6, 0, 4, 2, 0, 0, Math.PI * 2);
  ctx.ellipse(6, 0, 4, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Plump yellow body.
  ctx.fillStyle = '#f7d046';
  ctx.beginPath();
  ctx.ellipse(0, -16, 11, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wing.
  ctx.fillStyle = '#e6bf36';
  ctx.beginPath();
  ctx.ellipse(-6, -16, 4, 9, 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Laser rifle held forward-up (dark, angular). Anchor = muzzle tip.
  ctx.strokeStyle = '#3a4150';
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(2, -20);
  ctx.lineTo(20, -30);
  ctx.stroke();
  ctx.fillStyle = '#7cf3ff';
  ctx.beginPath();
  ctx.arc(20, -30, 1.8 + Math.sin(t * 0.02) * 0.6, 0, Math.PI * 2); // glowing muzzle
  ctx.fill();
  // Head.
  ctx.fillStyle = '#f7d046';
  ctx.beginPath();
  ctx.arc(0, -34, 7.5, 0, Math.PI * 2);
  ctx.fill();
  // Bill.
  ctx.fillStyle = '#e8902a';
  ctx.beginPath();
  ctx.ellipse(7, -33, 5, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Eye.
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(1, -36, 1.4, 0, Math.PI * 2);
  ctx.fill();
  // Bubble space helmet.
  ctx.strokeStyle = 'rgba(180,230,255,0.85)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(1, -34, 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(180,230,255,0.12)';
  ctx.beginPath();
  ctx.arc(1, -34, 12, 0, Math.PI * 2);
  ctx.fill();
  // Top hat perched on the helmet.
  ctx.fillStyle = '#1b1e26';
  ctx.fillRect(-9, -47, 20, 2.4); // brim
  ctx.fillRect(-5, -57, 12, 11); // crown
  return [20, -30];
}

// --- Convict Sheep (boomerang, prison stripes) ------------------------------
function drawConvictSheep(ctx: CanvasRenderingContext2D, t: number): Vec {
  // Legs.
  ctx.strokeStyle = '#2c3142';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-5, -16);
  ctx.lineTo(-6, 0);
  ctx.moveTo(5, -16);
  ctx.lineTo(6, 0);
  ctx.stroke();
  // Striped prison jumpsuit body.
  ctx.fillStyle = '#dfe3ea';
  ctx.beginPath();
  ctx.ellipse(0, -20, 12, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b2f3a';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const y = -28 + i * 6;
    ctx.beginPath();
    ctx.moveTo(-11, y);
    ctx.lineTo(11, y);
    ctx.stroke();
  }
  // Fluffy wool collar.
  ctx.fillStyle = '#f4f6fa';
  ctx.beginPath();
  ctx.arc(0, -30, 9, 0, Math.PI * 2);
  ctx.fill();
  // Black face.
  ctx.fillStyle = '#2b2f3a';
  ctx.beginPath();
  ctx.ellipse(0, -33, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-1.6, -34, 1.1, 0, Math.PI * 2);
  ctx.arc(1.6, -34, 1.1, 0, Math.PI * 2);
  ctx.fill();
  // Ear.
  ctx.fillStyle = '#2b2f3a';
  ctx.beginPath();
  ctx.ellipse(-6, -33, 3, 1.6, 0.6, 0, Math.PI * 2);
  ctx.fill();
  // Arm raising a boomerang (spinning idle). Anchor = boomerang centre.
  const ax = 16;
  const ay = -40;
  ctx.strokeStyle = '#dfe3ea';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(8, -28);
  ctx.lineTo(ax, ay);
  ctx.stroke();
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(t * 0.02);
  ctx.strokeStyle = '#9a6b3a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-5, 4);
  ctx.lineTo(0, -5);
  ctx.lineTo(5, 4);
  ctx.stroke();
  ctx.restore();
  return [ax, ay];
}

// --- Suggestible Sam (reads the yardage, hands you the club) -----------------
function drawSuggestibleSam(ctx: CanvasRenderingContext2D, t: number): Vec {
  legs(ctx, '#2f3a33');
  // Green caddy vest.
  ctx.strokeStyle = '#3fae5c';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(-1, -44);
  ctx.stroke();
  // Near arm offering a club UP (the "here's your club" gesture).
  ctx.strokeStyle = '#e8c6a0';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-1, -40);
  ctx.lineTo(13, -46);
  ctx.stroke();
  // The offered club (shaft + small head), held aloft.
  ctx.strokeStyle = '#c8ccd6';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(13, -46);
  ctx.lineTo(18, -64);
  ctx.stroke();
  ctx.fillStyle = '#aeb6c6';
  ctx.beginPath();
  ctx.ellipse(18, -64, 3.4, 2.2, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // A little "thinking" bubble with a club glyph — the yardage read.
  const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 0.006));
  ctx.fillStyle = `rgba(255,255,255,${0.18 + 0.12 * pulse})`;
  ctx.beginPath();
  ctx.arc(-15, -52, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.25 * pulse})`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.strokeStyle = `rgba(95,212,90,${0.7 + 0.3 * pulse})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-15, -56);
  ctx.lineTo(-15, -49);
  ctx.lineTo(-12.5, -48);
  ctx.stroke();
  // Head.
  ctx.fillStyle = '#e8c6a0';
  ctx.beginPath();
  ctx.arc(-1, -50, 6, 0, Math.PI * 2);
  ctx.fill();
  // Peaked caddy cap.
  ctx.fillStyle = '#2f8f47';
  ctx.beginPath();
  ctx.arc(-1, -52, 6, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-1, -53, 9, 2.4); // brim
  return [13, -46];
}

/**
 * Draw a caddy's mid-flight redirect projectile (laser beam or spinning boomerang) travelling from
 * `from` (the caddy's muzzle, screen px) to `to` (the ball intercept, screen px). `p` is 0..1
 * progress. Pure feel; never throws.
 */
export function drawCaddyProjectile(
  ctx: CanvasRenderingContext2D,
  kind: 'laser' | 'boomerang',
  from: Vec,
  to: Vec,
  p: number,
  t: number,
): void {
  const x = from[0] + (to[0] - from[0]) * p;
  const y = from[1] + (to[1] - from[1]) * p;
  ctx.save();
  if (kind === 'laser') {
    // A bright beam from the muzzle to the leading edge, with a hot core.
    ctx.strokeStyle = 'rgba(124,243,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = '#dffaff';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // A spinning wooden boomerang.
    ctx.translate(x, y);
    ctx.rotate(t * 0.05);
    ctx.strokeStyle = '#b07a3e';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-7, 5);
    ctx.lineTo(0, -7);
    ctx.lineTo(7, 5);
    ctx.stroke();
  }
  ctx.restore();
}
