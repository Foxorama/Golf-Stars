/**
 * Coil (Herald-path) AGENT figures (GS-story-herald-figures) — the drawCaddy siblings for the cult's inner
 * circle, so the Herald clubhouse cast is full-body, on-model art in the SAME flat Canvas2D house style as
 * the Warden caddies (see `caddyArt.ts`), not a head+chest bust. Authored in a ~64-unit-tall frame with the
 * origin at the feet centre, −y up, scaled to `h` px. Hooded, robed cultists in a venom-violet palette; each
 * agent gets a distinct head/prop so they read apart (the fallen Apostate, the Viper prodigy, the Keeper).
 * Pure drawing — feel only, verified eyes-on.
 */

/** The three Coil agent LOOKS (Ouros + Ecdysis share the anonymous 'coilkeeper' look, told apart by tint). */
export type CoilAgentLook = 'voss' | 'venoma' | 'coilkeeper';

const ROBE = '#241033'; // deep violet-black cloth
const ROBE_HI = '#3a1b52'; // lit robe fold
const ROBE_TRIM = '#7a4a9a'; // trim / hood edge
const VENOM = '#7fe0a0'; // the Coil's sickly green glow
const PALE = '#d7c2cf'; // gaunt skin

/** Map a Herald agent id / portrait to its drawable look. */
export function coilAgentLook(idOrPortrait: string): CoilAgentLook {
  if (idOrPortrait === 'coil-voss' || idOrPortrait === 'voss') return 'voss';
  if (idOrPortrait === 'coil-venoma' || idOrPortrait === 'venoma') return 'venoma';
  return 'coilkeeper';
}

/** Draw a Coil agent at feet-centre (cx, cy), `h` px tall. `t` (ms) drives a slow idle. Never throws. */
export function drawCoilAgent(
  ctx: CanvasRenderingContext2D,
  look: CoilAgentLook,
  cx: number,
  cy: number,
  h: number,
  t: number,
): void {
  const u = h / 64;
  const sway = Math.sin(t * 0.0016) * 0.8; // slow cult-robe sway
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(u, u);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 17, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Floor-length hooded ROBE (a bell from the shoulders to the hem). ──
  const hem = 0;
  const shoulderY = -40;
  ctx.beginPath();
  ctx.moveTo(-8, shoulderY); // left shoulder
  ctx.quadraticCurveTo(-20 + sway, -22, -17 + sway, hem); // left side flares out to the hem
  ctx.quadraticCurveTo(0, hem - 4, 17 + sway, hem); // hem sweep
  ctx.quadraticCurveTo(20 + sway, -22, 8, shoulderY); // right side up to the shoulder
  ctx.quadraticCurveTo(0, shoulderY - 5, -8, shoulderY);
  ctx.closePath();
  const robeGrad = ctx.createLinearGradient(0, shoulderY, 0, hem);
  robeGrad.addColorStop(0, ROBE_HI);
  robeGrad.addColorStop(1, ROBE);
  ctx.fillStyle = robeGrad;
  ctx.fill();
  // Central seam + two fold lines for cloth volume.
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(0, shoulderY + 2);
  ctx.lineTo(sway * 0.6, hem - 3);
  ctx.moveTo(-9, -30);
  ctx.quadraticCurveTo(-13 + sway, -14, -10 + sway, hem - 4);
  ctx.moveTo(9, -30);
  ctx.quadraticCurveTo(13 + sway, -14, 10 + sway, hem - 4);
  ctx.stroke();
  // Hem trim.
  ctx.strokeStyle = ROBE_TRIM;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-16 + sway, hem - 1);
  ctx.quadraticCurveTo(0, hem - 5, 16 + sway, hem - 1);
  ctx.stroke();

  // ── Shoulders / cowl (the hood's shoulder drape). ──
  ctx.fillStyle = ROBE;
  ctx.beginPath();
  ctx.moveTo(-12, shoulderY + 6);
  ctx.quadraticCurveTo(0, shoulderY - 10, 12, shoulderY + 6);
  ctx.quadraticCurveTo(0, shoulderY - 2, -12, shoulderY + 6);
  ctx.closePath();
  ctx.fill();

  drawHeadAndProps(ctx, look, shoulderY, t);
  ctx.restore();
}

function drawHeadAndProps(ctx: CanvasRenderingContext2D, look: CoilAgentLook, shoulderY: number, t: number): void {
  const headY = shoulderY - 8; // head centre above the shoulders
  const glow = 0.6 + 0.4 * Math.sin(t * 0.004);

  if (look === 'voss') {
    // The Apostate: hood DOWN — a gaunt, fallen-champion face, slicked dark hair, one Coil brand on the brow.
    // Hood collar pushed back behind the neck.
    ctx.fillStyle = ROBE_HI;
    ctx.beginPath();
    ctx.ellipse(0, shoulderY - 2, 11, 7, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Face.
    ctx.fillStyle = PALE;
    ctx.beginPath();
    ctx.ellipse(0, headY, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    // Gaunt cheek shadow.
    ctx.fillStyle = 'rgba(60,30,70,0.28)';
    ctx.beginPath();
    ctx.ellipse(-2.2, headY + 2, 2, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Slicked-back dark hair.
    ctx.fillStyle = '#171018';
    ctx.beginPath();
    ctx.moveTo(-6, headY - 2);
    ctx.quadraticCurveTo(0, headY - 12, 6, headY - 2);
    ctx.quadraticCurveTo(2, headY - 6, 0, headY - 6);
    ctx.quadraticCurveTo(-2, headY - 6, -6, headY - 2);
    ctx.closePath();
    ctx.fill();
    // Hard eyes.
    ctx.fillStyle = '#2a1a2e';
    ctx.beginPath();
    ctx.ellipse(-2.4, headY, 1, 1.5, 0, 0, Math.PI * 2);
    ctx.ellipse(2.4, headY, 1, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Coil brand (a small green mark on the brow).
    ctx.strokeStyle = `rgba(127,224,160,${0.6 + glow * 0.4})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, headY - 3.5, 1.6, 0.2, Math.PI * 1.9);
    ctx.stroke();
    // A champion's club held head-down at his side (regret, not aggression).
    ctx.strokeStyle = '#b9a7c4';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(11, -30);
    ctx.lineTo(15, -6);
    ctx.stroke();
    ctx.fillStyle = '#8a7a94';
    ctx.beginPath();
    ctx.ellipse(15, -5, 3, 1.8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (look === 'venoma') {
    // The Viper prodigy: hood UP, sleek, glowing venom eyes, a serpent coiling up her arm.
    hoodedHead(ctx, headY, '#33184a', VENOM, glow);
    // Serpent coiled around the near arm/shoulder, head raised to hiss.
    ctx.strokeStyle = '#4fae6c';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(9, -12);
    ctx.quadraticCurveTo(15, -20, 11, -28);
    ctx.quadraticCurveTo(8, -34, 14, -37);
    ctx.stroke();
    // Snake head + tiny tongue.
    ctx.fillStyle = '#5fc07e';
    ctx.beginPath();
    ctx.ellipse(15, -38, 2.4, 1.6, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e0405a';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(16.5, -39);
    ctx.lineTo(18.5, -40.5);
    ctx.stroke();
    return;
  }

  // coilkeeper: fully anonymous — hood up, face in shadow (two green embers), a serpent-topped staff.
  hoodedHead(ctx, headY, ROBE, VENOM, glow, true);
  // Staff.
  ctx.strokeStyle = '#3a2a20';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-14, -44);
  ctx.lineTo(-14, -2);
  ctx.stroke();
  // Coiled-serpent finial.
  ctx.strokeStyle = VENOM;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(-14, -46, 2.6, 0, Math.PI * 1.7);
  ctx.stroke();
  ctx.fillStyle = `rgba(127,224,160,${0.4 + glow * 0.5})`;
  ctx.beginPath();
  ctx.arc(-14, -46, 3.6, 0, Math.PI * 2);
  ctx.fill();
}

/** A raised HOOD over a shadowed face with two glowing eyes (shared by Venoma + the Keeper). */
function hoodedHead(
  ctx: CanvasRenderingContext2D,
  headY: number,
  hoodCol: string,
  eyeCol: string,
  glow: number,
  deepShadow = false,
): void {
  // Hood: a pointed cowl framing a dark opening.
  ctx.fillStyle = hoodCol;
  ctx.beginPath();
  ctx.moveTo(-9, headY + 8);
  ctx.quadraticCurveTo(-11, headY - 10, 0, headY - 13);
  ctx.quadraticCurveTo(11, headY - 10, 9, headY + 8);
  ctx.quadraticCurveTo(0, headY + 4, -9, headY + 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ROBE_TRIM;
  ctx.lineWidth = 1;
  ctx.stroke();
  // Face void.
  ctx.fillStyle = deepShadow ? '#050308' : '#140a1e';
  ctx.beginPath();
  ctx.ellipse(0, headY + 1, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Glowing eyes.
  ctx.fillStyle = `rgba(${eyeCol === VENOM ? '127,224,160' : '200,255,220'},${0.7 + glow * 0.3})`;
  ctx.beginPath();
  ctx.ellipse(-2.1, headY + 1, 0.9, 1.5, 0.2, 0, Math.PI * 2);
  ctx.ellipse(2.1, headY + 1, 0.9, 1.5, -0.2, 0, Math.PI * 2);
  ctx.fill();
}
