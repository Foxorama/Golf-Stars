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
  | 'suggestible-sam'
  | 'sandy-sandsaver'
  | 'mystic-mole';

const ART_IDS: readonly string[] = [
  'auto-caddie',
  'driver-dan',
  'dr-chipinski',
  'space-ducks',
  'convict-sheep',
  'suggestible-sam',
  'sandy-sandsaver',
  'mystic-mole',
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
  'sandy-sandsaver': 'Sandy',
  'mystic-mole': 'Mystic Mole',
};

/** Which caddies actively fire a projectile mid-flight (Space Ducks laser, Convict Sheep boomerang). */
export function caddyProjectile(id: string | undefined): 'laser' | 'boomerang' | null {
  if (id === 'space-ducks') return 'laser';
  if (id === 'convict-sheep') return 'boomerang';
  return null;
}

/**
 * Per-caddy signature catchphrase (GS-caddy-voices): the on-screen speech `bubble` text and the
 * spoken `speech` line + its accent `lang` (BCP-47). Fired when the caddy's effect triggers (a guard
 * redirect / a Dr Chipinski chip-in). `phone` caddies also flash a "answering a call" phone glyph.
 */
export interface CaddyVoice {
  bubble: string;
  speech: string;
  lang: string;
  /** Voice character tweaks (rate/pitch) so the accents read distinct. */
  rate?: number;
  pitch?: number;
  /** Show the ringing-phone "you rang?" glyph alongside the bubble (Dr Chipinski). */
  phone?: boolean;
}

export const CADDY_VOICE: Partial<Record<CaddyArtId, CaddyVoice>> = {
  // Dr Chipinski answers the call like a doctor being paged — a crisp American "You rang?".
  'dr-chipinski': { bubble: 'You rang?', speech: 'You rang?', lang: 'en-US', rate: 1.02, pitch: 1.08, phone: true },
  // Convict Sheep's laconic Aussie reassurance.
  'convict-sheep': { bubble: "She'll be right, mate.", speech: "She'll be right, mate.", lang: 'en-AU', rate: 0.96, pitch: 0.92 },
  // Space Ducks' plummy British cheer.
  'space-ducks': { bubble: 'Tally ho — good shot!', speech: 'Tally ho, good shot!', lang: 'en-GB', rate: 1.0, pitch: 1.12 },
};

/**
 * Draw a comic speech bubble with `text`, its tail pointing down-left toward the caddy figure at
 * (tailX, tailY). Anchored above-right of the tail so it clears the corner figure. `alpha` fades it
 * in/out. Pure feel; never throws.
 */
export function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  text: string,
  tailX: number,
  tailY: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = '700 13px ui-rounded, system-ui, sans-serif';
  const padX = 11;
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  const h = 28;
  // Bubble sits up and to the right of the tail point.
  const bx = tailX + 14;
  const by = tailY - h - 16;
  const r = 9;
  // Soft drop shadow.
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#fdf6e3';
  roundRect(ctx, bx, by, w, h, r);
  ctx.fill();
  // Tail (a little triangle from the bubble's lower-left toward the figure).
  ctx.beginPath();
  ctx.moveTo(bx + 10, by + h - 1);
  ctx.lineTo(bx + 24, by + h - 1);
  ctx.lineTo(tailX + 6, tailY - 4);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  // Ink outline.
  ctx.strokeStyle = 'rgba(20,22,30,0.85)';
  ctx.lineWidth = 1.6;
  roundRect(ctx, bx, by, w, h, r);
  ctx.stroke();
  // Text.
  ctx.fillStyle = '#1a1d24';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + padX, by + h / 2 + 1);
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * A ringing "answering a call" phone glyph (GS-caddy-voices, Dr Chipinski) at (cx, cy), `s` px tall,
 * with little shake/ring motion lines driven by `t` (ms). Pure feel; never throws.
 */
export function drawPhoneIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, t: number): void {
  ctx.save();
  const wob = Math.sin(t * 0.03) * 0.18; // ringing wobble
  ctx.translate(cx, cy);
  ctx.rotate(wob);
  const u = s / 24;
  ctx.scale(u, u);
  // Ring motion lines either side.
  ctx.strokeStyle = 'rgba(120,230,140,0.9)';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  const ring = 0.5 + 0.5 * Math.sin(t * 0.03);
  for (let i = 1; i <= 2; i++) {
    const rr = (8 + i * 4) * (0.85 + 0.25 * ring);
    ctx.beginPath();
    ctx.arc(-12, -8, rr, Math.PI * 0.9, Math.PI * 1.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(12, -8, rr, Math.PI * -0.35, Math.PI * 0.1);
    ctx.stroke();
  }
  // Green call badge.
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // Classic handset glyph.
  ctx.fillStyle = '#fff';
  ctx.save();
  ctx.rotate(-0.5);
  ctx.beginPath();
  ctx.moveTo(-5, -5);
  ctx.quadraticCurveTo(-7, -7, -5, -8);
  ctx.lineTo(-2.5, -5.5);
  ctx.quadraticCurveTo(-1.5, -4.5, -2.5, -3);
  ctx.quadraticCurveTo(-1, 1, 3, 2.5);
  ctx.quadraticCurveTo(4.5, 1.5, 5.5, 2.5);
  ctx.lineTo(8, 5);
  ctx.quadraticCurveTo(7, 7, 5, 5);
  ctx.quadraticCurveTo(-3, 3, -5, -5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
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
  lefty = false,
): Vec {
  const u = h / 64;
  const bob = Math.sin(t * 0.004) * 1.2; // gentle idle bob (local units)
  // Left-handed mode (GS-lefty): mirror the figure horizontally so the whole cast faces/holds the
  // other way, matching the mirrored golfer. The returned muzzle anchor is mirrored too, so the
  // laser/boomerang still launches from the (flipped) hand toward the already-mirrored target.
  const sx = lefty ? -1 : 1;
  ctx.save();
  ctx.translate(cx, cy + bob * u);
  ctx.scale(sx * u, u);
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
    case 'sandy-sandsaver':
      anchorLocal = drawSandy(ctx, t);
      break;
    case 'mystic-mole':
      anchorLocal = drawMole(ctx, t);
      break;
    case 'auto-caddie':
    default:
      anchorLocal = drawPenelope(ctx);
      break;
  }
  ctx.restore();
  return [cx + sx * anchorLocal[0] * u, cy + (bob + anchorLocal[1]) * u];
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

// --- Sandy the Sand-Saver (escape specialist, GS-mux) -----------------------
function drawSandy(ctx: CanvasRenderingContext2D, t: number): Vec {
  legs(ctx, '#6b5a3a');
  // Khaki bush-shirt torso.
  ctx.strokeStyle = '#b89a5a';
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(0, -21);
  ctx.lineTo(-1, -43);
  ctx.stroke();
  // Arm + a sand wedge raised, with a little flying-sand spray (idle shimmer).
  ctx.strokeStyle = '#d8b888';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(-1, -40);
  ctx.lineTo(13, -36);
  ctx.stroke();
  ctx.strokeStyle = '#c8ccd6';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(13, -36);
  ctx.lineTo(20, -50);
  ctx.stroke();
  ctx.fillStyle = '#aeb6c6';
  ctx.beginPath();
  ctx.ellipse(20, -50, 3.4, 2, 0.6, 0, Math.PI * 2); // wedge head
  ctx.fill();
  // Sand grains spraying off the wedge.
  ctx.fillStyle = '#e3c98f';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 1.4 - 0.2 + Math.sin(t * 0.005 + i) * 0.1;
    ctx.beginPath();
    ctx.arc(20 + Math.cos(a) * 9, -50 - Math.sin(a) * 9, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  // Weathered head + wide bush hat.
  ctx.fillStyle = '#d8a878';
  ctx.beginPath();
  ctx.arc(-1, -49, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a6238';
  ctx.beginPath();
  ctx.ellipse(-1, -53, 12, 3, 0, 0, Math.PI * 2); // wide brim
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-1, -54, 5.5, Math.PI, Math.PI * 2); // crown
  ctx.fill();
  return [20, -50];
}

// --- Mystic Mole (green-reader, GS-mux) -------------------------------------
function drawMole(ctx: CanvasRenderingContext2D, t: number): Vec {
  // A dirt mound the mole pops from.
  ctx.fillStyle = '#4a3a28';
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const pop = Math.sin(t * 0.003) * 1.5; // gentle bob out of the hole
  // Round dark-grey mole body.
  ctx.fillStyle = '#5a5560';
  ctx.beginPath();
  ctx.ellipse(0, -16 + pop, 11, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  // Lighter belly.
  ctx.fillStyle = '#7a7682';
  ctx.beginPath();
  ctx.ellipse(0, -12 + pop, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tiny digging claws holding a putter.
  ctx.strokeStyle = '#d9dee8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(9, -22 + pop);
  ctx.lineTo(15, -8 + pop);
  ctx.stroke();
  ctx.fillStyle = '#aeb6c6';
  ctx.fillRect(13, -8 + pop, 5, 2.4);
  // Big mystic spectacles + pink nose.
  ctx.fillStyle = '#1a1d24';
  ctx.beginPath();
  ctx.arc(-4, -26 + pop, 3.4, 0, Math.PI * 2);
  ctx.arc(4, -26 + pop, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#9fd8e6';
  ctx.beginPath();
  ctx.arc(-4, -26 + pop, 2, 0, Math.PI * 2);
  ctx.arc(4, -26 + pop, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff9db0';
  ctx.beginPath();
  ctx.arc(0, -21 + pop, 2.2, 0, Math.PI * 2); // nose
  ctx.fill();
  return [15, -8 + pop];
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
