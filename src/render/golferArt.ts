/**
 * On-course golfer + apparel art (extracted from playView.ts, GS-refactor-split).
 *
 * Pure Canvas2D drawing for the little cartoon golfer who addresses and swings before each
 * full shot, plus every cosmetic apparel layer they wear (hat, shirt, pants, driver/warhammer,
 * caddy bag). Authored in a local ~72-unit figure frame and scaled to the requested px height,
 * so figure, club and ball stay in proportion at any zoom. No module state — every function
 * takes its `ctx` + params, so this reads identically whether called from the play view, the
 * result-screen replay, or a preview. Feel/behaviour is byte-for-byte the same as when this
 * lived inside playView.ts; this is a pure move.
 */

import type { Vec } from '../sim/course/contract';
import type { ApparelLook } from '../sim/rpg/apparel';
import { mixHex } from './palette';
import { easeOutCubic } from './trajectory';

// House-style trivial math helpers (kept local, matching the per-module duplication pattern
// used across the render layer — introView/weather each carry their own mulberry32, etc.).
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Loader-style cap colours so the play-view golfer reads as one of the intro's crew (the fallback
// when no specific golfer is selected — the result-screen replay cycles them by shot).
export const GOLFER_COLORS = ['#d23f4f', '#3f78b8', '#e0a83f', '#46a05a'];

/** The on-course golfer's look — cap/shirt/skin + a build scale (GS-18 character identity). */
export interface GolferLook {
  cap: string;
  shirt: string;
  skin: string;
  /** Figure size scale (1 = default). */
  build: number;
  /**
   * Equipped GEAR theme (GS-proshop-2): the rarest themed club set the player carries (Planet /
   * Phoenix Flames / Solar Storm). When set, the golfer swings a GLOWING themed club head — so the
   * club you bought in the Pro Shop is the club you swing. Absent = a plain club head (unchanged).
   */
  gear?: { theme: string; tint: string };
  /** Equipped cosmetic HAT (GS-cosmetics) — overrides the default cap with its own shape/palette. */
  hat?: ApparelLook;
  /** Equipped cosmetic SHIRT — overrides the torso colour + adds a glowing aura for the top tiers. */
  shirtStyle?: ApparelLook;
  /** Equipped cosmetic PANTS (GS-pants-outfit) — overrides the default legs with their own shape/palette. */
  pantsStyle?: ApparelLook;
  /** Equipped cosmetic DRIVER (GS-thor) — swaps the plain club head for its own skin (a mythic warhammer,
   *  Thor's Hammer). Takes precedence over the in-run `gear` themed head when both are present. */
  driver?: ApparelLook;
  /** Equipped cosmetic BAG (GS-wardrobe-bagtier) — a staff bag propped behind the golfer at address, so
   *  the caddy bag you outfit in the Clubhouse actually shows on the course. Absent → no bag prop (the
   *  clubs still carry their bag-tier gear skin). */
  bag?: ApparelLook;
  /** Equipped cosmetic GLOVE (GS-story-avatar) — the Story-gear grip skin worn on the golfer's hands
   *  (a glove / gauntlet / power-glove). Absent → bare hands (unchanged). Story Tour only. */
  glove?: ApparelLook;
  /** Equipped cosmetic SHOES (GS-story-avatar) — the Story-gear footwear (shoe / boot / spikes) at the
   *  golfer's feet. Absent → the plain default feet (unchanged). Story Tour only. */
  shoes?: ApparelLook;
  /** Equipped cosmetic CLUB SKIN (GS-story-avatar) — the Story SHAFT recolours the club the golfer swings
   *  (the shaft always; the head too when no themed `gear` set claims it). Absent → the themed/plain club
   *  (unchanged). Ignored when a `driver` (warhammer) skin is worn. Story Tour only. */
  clubSkin?: ApparelLook;
  /** Equipped cosmetic BALL TRACER (GS-story-avatar) — the Story BALL's in-flight trail colour + style
   *  (line / comet / ember / spark), read by the play-view flight trail. Absent → the flight trail keeps
   *  the golfer's cap colour (unchanged). Story Tour only. */
  ballTracer?: ApparelLook;
}
/** A cap colour → a full look (shirt matches the cap; default skin) — the loader-crew fallback. */
export function lookFromColor(color: string): GolferLook {
  return { cap: color, shirt: color, skin: '#f0c49a', build: 1 };
}

/**
 * A little cartoon golfer mid-swing, in the same silhouette language as the loading intro's
 * crew (stick legs, blocky torso, round head + cap) but posed side-on over the ball with a
 * club. The figure is authored in a local frame ~72 units tall (origin at the feet, +x toward
 * the target, −y up) and scaled to `h` px, then positioned so its LOCAL ball (where the club
 * sole rests at address) lands exactly on the REAL ball on screen — so figure, club and ball
 * stay in proportion at any zoom. `swing` 0..1 drives the windup (address → top → contact);
 * once `follow` > 0 the club sweeps on through to a high finish.
 */
export function drawGolfer(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  h: number,
  swing: number,
  follow: number,
  alpha: number,
  look: GolferLook,
  lefty = false,
): void {
  const u = h / 72;
  const S: Vec = [8, -50]; // shoulder pivot
  const B: Vec = [30, -1]; // local ball (club sole at address)
  const CL = Math.hypot(B[0] - S[0], B[1] - S[1]);
  const a0 = Math.atan2(B[1] - S[1], B[0] - S[0]); // address angle (down to the ball)
  const aTop = a0 - 3.0; // top of the backswing (up and behind)
  const aFin = a0 - 3.9; // high finish (further round and up)
  let ang: number;
  if (follow > 0) {
    ang = a0 + (aFin - a0) * easeOutCubic(follow);
  } else if (swing < 0.5) {
    ang = a0 + (aTop - a0) * easeInOut(swing / 0.5); // takeaway → top
  } else {
    const d = (swing - 0.5) / 0.5;
    ang = aTop + (a0 - aTop) * (d * d); // downswing accelerates into contact
  }
  const head: Vec = [S[0] + Math.cos(ang) * CL, S[1] + Math.sin(ang) * CL];
  const hands: Vec = [S[0] + Math.cos(ang) * CL * 0.34, S[1] + Math.sin(ang) * CL * 0.34];

  ctx.save();
  ctx.globalAlpha = alpha;
  // Place the figure so its LOCAL ball B lands on the real ball, then for a left-handed golfer
  // MIRROR the whole stick figure horizontally about that ball (GS-lefty) — a lefty stands on the
  // other side and swings the mirror image. Right-handed (lefty=false) reduces to the original
  // translate+scale, so the figure is byte-for-byte unchanged.
  ctx.translate(bx, by);
  ctx.scale(lefty ? -u : u, u);
  ctx.translate(-B[0], -B[1]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Soft ground shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath();
  ctx.ellipse(6, 1, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // The equipped cosmetic BAG (GS-wardrobe-bagtier) stands propped BEHIND the golfer (their −x side,
  // clear of the target-side swing arc), planted on the same ground line — so the caddy bag you outfit
  // in the Clubhouse shows on the course. Drawn before the body so the figure overlaps it if close.
  if (look.bag) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; // its own little ground shadow
    ctx.beginPath();
    ctx.ellipse(-18, 1, 7, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    drawGolfBag(ctx, -18, -8, 0.62, look.bag);
  }

  // Legs (a planted stance). A cosmetic PANTS (GS-pants-outfit) overrides the bare leg colour with its
  // own shape/palette; with nothing equipped the original dark legs draw byte-for-byte unchanged.
  if (look.pantsStyle) {
    drawPants(ctx, look.pantsStyle, look.skin, alpha);
  } else {
    ctx.strokeStyle = '#2c3142';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(2, -30);
    ctx.lineTo(-7, 0);
    ctx.moveTo(2, -30);
    ctx.lineTo(12, 0);
    ctx.stroke();
  }

  // Cosmetic SHOES (GS-story-avatar) — the equipped Story footwear at each planted foot (the default
  // legs plant at −7 and +12; a cosmetic pants shape plants near the same feet). Drawn over the legs so
  // the shoe caps the ankle. Absent → the bare default feet are unchanged.
  if (look.shoes) {
    drawShoe(ctx, -7, 0, look.shoes, alpha);
    drawShoe(ctx, 12, 0, look.shoes, alpha);
  }

  // Torso (hip → shoulders, tilted toward the ball). A cosmetic shirt (GS-cosmetics) overrides the
  // colour and, for the glowing top tiers, adds a soft aura behind the torso.
  const shirtCol = look.shirtStyle?.color ?? look.shirt;
  if (look.shirtStyle?.glow) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = look.shirtStyle.glow;
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(2, -30);
    ctx.lineTo(S[0], S[1]);
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = shirtCol;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(2, -30);
  ctx.lineTo(S[0], S[1]);
  ctx.stroke();
  // The torso is a diagonal capsule hip(2,-30)→shoulder(8,-50); `torsoX(y)` is its centreline x at a
  // given height, so patterned shirts (GS-worn-coverage) paint ON the torso, not floating beside it.
  const torsoX = (y: number): number => 2 - (y + 30) * 0.3;
  const sShape = look.shirtStyle?.shape;
  // Nebula suit (GS-cosmic 'cosmic'): a starfield + magenta swooshes down the torso, so the Supernova
  // suit reads as living nebula on-course, not a plain purple torso. Mirrors the wardrobe SVG's worn fill.
  if (sShape === 'cosmic') {
    const acc = look.shirtStyle?.accent ?? '#ff7bf0';
    ctx.fillStyle = '#fff';
    for (const [dx, y, rr] of [[-2, -47, 0.9], [2, -44, 0.7], [-1, -40, 0.8], [3, -36, 0.7], [-2, -33, 0.7], [1, -49, 0.6], [-3, -43, 0.5]] as [number, number, number][]) {
      ctx.beginPath();
      ctx.arc(torsoX(y) + dx, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.globalAlpha = alpha * 0.85;
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(torsoX(-45) - 4, -45);
    ctx.quadraticCurveTo(torsoX(-43), -48, torsoX(-41) + 4, -41);
    ctx.moveTo(torsoX(-37) - 4, -37);
    ctx.quadraticCurveTo(torsoX(-35), -39, torsoX(-33) + 4, -33);
    ctx.stroke();
    ctx.restore();
  }
  // Striped tee ('striped'): bands run the whole torso, centred on the torso line.
  if (sShape === 'striped') {
    ctx.strokeStyle = look.shirtStyle?.accent ?? '#f4f1e6';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let y = -47; y <= -32; y += 3.4) {
      const c = torsoX(y);
      ctx.moveTo(c - 6, y);
      ctx.lineTo(c + 6, y);
    }
    ctx.stroke();
  }
  // Neon jersey ('jersey'): a number panel high on the chest + racing stripes down both flanks.
  if (sShape === 'jersey') {
    const acc = look.shirtStyle?.accent ?? '#2bf0c0';
    const py = -44;
    ctx.fillStyle = acc;
    ctx.fillRect(torsoX(py) - 4.5, py - 4, 9, 8.5);
    ctx.fillStyle = '#0c1116';
    ctx.font = 'bold 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('7', torsoX(py), py);
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.4;
    for (const off of [-5.5, 5.5]) {
      ctx.beginPath();
      ctx.moveTo(torsoX(-48) + off, -48);
      ctx.lineTo(torsoX(-32) + off, -32);
      ctx.stroke();
    }
  }
  // Polo ('polo'): collar V + placket + buttons, so the plain polo reads as a collared shirt on-course.
  if (sShape === 'polo') {
    ctx.strokeStyle = look.shirtStyle?.accent ?? '#1d4a7a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(torsoX(-49) - 3, -49);
    ctx.lineTo(torsoX(-46), -45);
    ctx.lineTo(torsoX(-49) + 3, -49);
    ctx.moveTo(torsoX(-45), -45);
    ctx.lineTo(torsoX(-39), -39);
    ctx.stroke();
    ctx.fillStyle = look.shirtStyle?.accent ?? '#1d4a7a';
    for (const y of [-43, -40]) {
      ctx.beginPath();
      ctx.arc(torsoX(y), y, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Spacesuit chest control panel — a small accented box that sells the "suit" read.
  if (look.shirtStyle?.shape === 'spacesuit') {
    ctx.fillStyle = '#cdd6e2';
    ctx.fillRect(2, -44, 8, 7);
    ctx.fillStyle = look.shirtStyle.accent ?? '#d23b32';
    ctx.fillRect(3, -42.6, 2, 2);
    ctx.fillStyle = '#2bf0c0';
    ctx.fillRect(6.5, -42.6, 2, 2);
  }
  // Green-Jacket lapels (GS-unending 'blazer'): a light shirt V in the open front + gold lapel lines
  // and a button, so the jacket reads as tailored even at swing size.
  if (look.shirtStyle?.shape === 'blazer') {
    const gold = look.shirtStyle.accent ?? '#f2d06b';
    ctx.fillStyle = '#f4f6f2';
    ctx.beginPath();
    ctx.moveTo(1, -46);
    ctx.lineTo(6, -38);
    ctx.lineTo(11, -46);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -47);
    ctx.lineTo(6, -38);
    ctx.moveTo(12, -47);
    ctx.lineTo(6, -38);
    ctx.stroke();
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(5, -35, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  // Valkyrie cuirass (GS-valkyrie 'valkyrie'): a gold shoulder pauldron, a central ridge, and a winged
  // gold chest boss, so the burnished plate reads even at swing size.
  if (look.shirtStyle?.shape === 'valkyrie') {
    const gold = look.shirtStyle.accent ?? '#ffe08a';
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(8, -50, 3.4, Math.PI * 0.75, Math.PI * 1.95); // shoulder pauldron
    ctx.fill();
    ctx.strokeStyle = gold; // central ridge
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, -46);
    ctx.lineTo(4, -34);
    ctx.stroke();
    ctx.beginPath(); // winged chest boss
    ctx.arc(4, -43, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(1.6, -43.6);
    ctx.lineTo(-1.2, -44.6);
    ctx.moveTo(6.4, -43.6);
    ctx.lineTo(9.2, -44.6);
    ctx.stroke();
  }
  // Warden's Mantle (GS-story-champion-cosmetics 'wardenMantle'): a gold shoulder mantle across the top of
  // the vestment, gold seams down the body, and the FAIRWAY CREST at the breast — a ring with a line
  // running into it. Mirrors the wardrobe SVG (`apparelArt.ts shirtDetail 'wardenMantle'`).
  if (look.shirtStyle?.shape === 'wardenMantle') {
    const gold = look.shirtStyle.accent ?? '#ffe08a';
    ctx.save();
    ctx.globalAlpha = alpha * 0.92;
    ctx.fillStyle = gold; // the shoulder mantle
    ctx.beginPath();
    ctx.moveTo(-6, -50);
    ctx.quadraticCurveTo(5, -44.6, 16, -50);
    ctx.lineTo(15, -47);
    ctx.quadraticCurveTo(5, -41.6, -5, -47);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha * 0.55; // gold seams down the vestment
    ctx.strokeStyle = gold;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-2.4, -45);
    ctx.lineTo(-2, -32);
    ctx.moveTo(12.4, -45);
    ctx.lineTo(12, -32);
    ctx.stroke();
    ctx.restore();
    // The Fairway crest — the hole, and the fairway running into it.
    ctx.strokeStyle = gold;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(5, -41, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-1.4, -36.4);
    ctx.quadraticCurveTo(2.4, -39.6, 3.6, -40.4);
    ctx.stroke();
    ctx.save();
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.arc(5, -41, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Coil Shroud (GS-story-champion-cosmetics 'coilShroud'): two open serpent-robe panels down the outer
  // sides, scale rows on the cuirass showing between them, and the OUROBOROS clasp at the throat. Mirrors
  // the wardrobe SVG (`apparelArt.ts shirtDetail 'coilShroud'`).
  if (look.shirtStyle?.shape === 'coilShroud') {
    const venom = look.shirtStyle.accent ?? '#7fe0a0';
    const robeDark = mixHex(look.shirtStyle.color, '#000000', 0.3);
    // Open robe panels — drawn down the OUTER edges so the cuirass reads down the centre.
    ctx.fillStyle = robeDark;
    ctx.strokeStyle = '#0c1116';
    ctx.lineWidth = 0.7;
    for (const [x0, x1] of [[-7.5, -0.4], [17.5, 10.4]] as [number, number][]) {
      ctx.beginPath();
      ctx.moveTo(x0, -50.4);
      ctx.quadraticCurveTo(x0 + (x0 < 5 ? -1.4 : 1.4), -42, x0 + (x0 < 5 ? 1.6 : -1.6), -32);
      ctx.lineTo(x1, -32);
      ctx.lineTo(x1 + (x0 < 5 ? -1.2 : 1.2), -49.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.save();
    ctx.globalAlpha = alpha * 0.5; // scale rows on the exposed cuirass
    ctx.strokeStyle = venom;
    ctx.lineWidth = 0.6;
    for (const y of [-45, -41.6, -38.2, -34.8]) {
      ctx.beginPath();
      ctx.moveTo(1, y);
      ctx.quadraticCurveTo(3, y + 2.2, 5, y);
      ctx.quadraticCurveTo(7, y + 2.2, 9, y);
      ctx.stroke();
    }
    ctx.restore();
    // The ouroboros clasp at the throat — the serpent taking its own tail.
    ctx.strokeStyle = venom;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(5, -48.4, 2.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(5, -48.4, 1.6, Math.PI * 1.55, Math.PI * 1.2);
    ctx.stroke();
    ctx.fillStyle = venom;
    ctx.beginPath();
    ctx.arc(5.2, -50.1, 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Punched Galaxy warplate (GS-punched-galaxy 'riftplate'): a glowing star-core on the chest with
  // galaxy-crack energy forking out of it + a dark shoulder plate, so the cosmic cuirass reads at swing
  // size. Mirrors the wardrobe SVG (`apparelArt.ts shirtDetail 'riftplate'`).
  if (look.shirtStyle?.shape === 'riftplate') {
    const acc = look.shirtStyle.accent ?? '#ff7bf0';
    const cx = 5;
    const cy = -41;
    // Soft core glow.
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Dark shoulder plate.
    ctx.fillStyle = '#160826';
    ctx.strokeStyle = '#0c1116';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(9, -52);
    ctx.lineTo(13, -50.5);
    ctx.lineTo(11.5, -46.5);
    ctx.lineTo(8, -48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Galaxy-crack energy lines radiating from the core (accent, then a thin white core over the same path).
    const cracks = (): void => {
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx - 4, cy - 4); ctx.lineTo(cx - 7, cy - 3);
      ctx.moveTo(cx, cy); ctx.lineTo(cx + 3, cy - 4.5); ctx.lineTo(cx + 6, cy - 5.5);
      ctx.moveTo(cx, cy); ctx.lineTo(cx - 2, cy + 5); ctx.lineTo(cx - 3.5, cy + 9);
      ctx.moveTo(cx, cy); ctx.lineTo(cx + 3, cy + 4.5); ctx.lineTo(cx + 5, cy + 8);
    };
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1.2;
    cracks();
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.5;
    ctx.stroke(); // white core over the same current path
    // Core orb.
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  // Solar Flames robe (GS-solar-flames 'solarflare'): a coronal sun-core on the chest + solar flames
  // licking up the hem + embers, so the banked starfire reads at swing size. Mirrors the wardrobe SVG.
  if (look.shirtStyle?.shape === 'solarflare') {
    const cor = look.shirtStyle.accent ?? '#ff4d2a';
    const corHi = '#ffb648';
    const ccx = 5;
    const ccy = -42;
    const flame = (
      bx: number, by: number, h: number, w: number, c: number, fill: string,
    ): void => {
      ctx.beginPath();
      ctx.moveTo(bx - w, by);
      ctx.quadraticCurveTo(bx - w * 0.78, by - h * 0.5, bx - w * 0.12 + c * 0.4, by - h * 0.72);
      ctx.quadraticCurveTo(bx + c * 0.9, by - h * 0.92, bx + c, by - h);
      ctx.quadraticCurveTo(bx + w * 0.55 + c * 0.4, by - h * 0.52, bx + w * 0.82, by - h * 0.34);
      ctx.quadraticCurveTo(bx + w, by - h * 0.15, bx + w, by);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    // Solar flames licking up from the hem.
    const flames: [number, number, number, number, number][] = [
      [2, -31, 8.5, 2.5, 0], [-3, -31, 6.5, 2, -0.6], [7, -31, 6.5, 2, 0.6],
    ];
    for (const [x, y, h, w, c] of flames) {
      flame(x, y, h * 1.12, w * 1.16, c, '#160826');
      flame(x, y, h, w, c, '#6a24b8');
      flame(x, y, h * 0.8, w * 0.72, c * 0.85, '#b8309a');
      flame(x, y, h * 0.56, w * 0.5, c * 0.7, cor);
      flame(x, y, h * 0.32, w * 0.3, c * 0.5, corHi);
    }
    // Coronal sun-core glow.
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.fillStyle = cor;
    ctx.beginPath();
    ctx.arc(ccx, ccy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Short coronal spikes ringing the core.
    ctx.fillStyle = cor;
    for (let k = 0; k < 8; k++) {
      const t = (k * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(ccx + Math.cos(t) * 3.2 - Math.sin(t) * 0.9, ccy + Math.sin(t) * 3.2 + Math.cos(t) * 0.9);
      ctx.lineTo(ccx + Math.cos(t) * 5.4, ccy + Math.sin(t) * 5.4);
      ctx.lineTo(ccx + Math.cos(t) * 3.2 + Math.sin(t) * 0.9, ccy + Math.sin(t) * 3.2 - Math.cos(t) * 0.9);
      ctx.closePath();
      ctx.fill();
    }
    // Red disc, hot inner, white pip.
    ctx.fillStyle = cor;
    ctx.strokeStyle = '#0c1116';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.arc(ccx, ccy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = corHi;
    ctx.beginPath();
    ctx.arc(ccx, ccy, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ccx, ccy, 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
  // Space Parrot plumage (GS-space-pirate-parrot 'parrot'): rows of scalloped iridescent macaw feathers
  // (teal/gold/magenta) shingled down the torso + star specks + a breast gem. Mirrors the wardrobe SVG.
  if (sShape === 'parrot') {
    const plume = ['#2fd6c8', '#ffc23a', '#ff5a9e'];
    const r = 1.9;
    const step = r * 1.35;
    let row = 0;
    for (let y = -49; y <= -31; y += step, row++) {
      ctx.fillStyle = plume[row % 3]!;
      const c = torsoX(y);
      const off = (row % 2) * r;
      for (let x = c - 5.5 + off; x <= c + 5.5; x += r * 2) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI, false); // lower semicircle bulging down = a feather scale
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.fillStyle = '#fff'; // star specks
    for (const [dx, y] of [[-3, -46], [3, -42], [-2, -37], [3, -33]] as [number, number][]) {
      ctx.beginPath();
      ctx.arc(torsoX(y) + dx, y, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Starlight breast gem (a small 4-point star).
    const gx = torsoX(-45);
    const gy = -45;
    ctx.fillStyle = '#fff0c0';
    ctx.beginPath();
    ctx.moveTo(gx, gy - 2.2);
    ctx.lineTo(gx + 0.7, gy - 0.7);
    ctx.lineTo(gx + 2.2, gy);
    ctx.lineTo(gx + 0.7, gy + 0.7);
    ctx.lineTo(gx, gy + 2.2);
    ctx.lineTo(gx - 0.7, gy + 0.7);
    ctx.lineTo(gx - 2.2, gy);
    ctx.lineTo(gx - 0.7, gy - 0.7);
    ctx.closePath();
    ctx.fill();
  }

  // Club shaft + head (behind the arms). An equipped cosmetic DRIVER (GS-thor) swaps the plain club head
  // for a mythic WARHAMMER wreathed in lightning; else a bought themed club set (GS-proshop-2) tints the
  // head + glows; else a plain club head. The driver skin takes precedence over the in-run gear theme.
  const gear = look.gear;
  // A cosmetic CLUB SKIN (GS-story-avatar) from the equipped Story shaft recolours the shaft the golfer
  // swings; a glowing skin (legendary) also lays a soft aura under the shaft. It never overrides the
  // warhammer driver skin, and a themed `gear` set still claims the HEAD glow below.
  const clubSkin = look.clubSkin;
  if (look.driver) {
    drawWarhammer(ctx, hands, head, ang, swing, follow, alpha, look.driver);
  } else {
  if (clubSkin?.glow) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    ctx.strokeStyle = clubSkin.glow;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(hands[0], hands[1]);
    ctx.lineTo(head[0], head[1]);
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = clubSkin ? clubSkin.color : gear ? gear.tint : '#d9dee8';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(hands[0], hands[1]);
  ctx.lineTo(head[0], head[1]);
  ctx.stroke();
  if (gear) {
    // Soft glow behind the head, in the set's tint.
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = gear.tint;
    ctx.beginPath();
    ctx.arc(head[0], head[1], 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = gear.tint;
    ctx.beginPath();
    ctx.arc(head[0], head[1], 3.4, 0, Math.PI * 2);
    ctx.fill();
    // A couple of themed sparks trailing the head once it's swinging through (Solar Storm sparkles,
    // Phoenix embers, Planet glints) — purely cosmetic motion.
    if (follow > 0.05) {
      ctx.save();
      ctx.globalAlpha = alpha * (1 - follow) * 0.9;
      ctx.fillStyle = gear.theme === 'planet' ? '#ffffff' : gear.tint;
      for (let i = 1; i <= 3; i++) {
        const t = follow - i * 0.06;
        if (t < 0) continue;
        const a = aTop + (a0 - aTop) * 1 + (aFin - a0) * easeOutCubic(t);
        ctx.beginPath();
        ctx.arc(S[0] + Math.cos(a) * CL, S[1] + Math.sin(a) * CL, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  } else if (clubSkin) {
    // No themed set claims the head, so the club skin tints it (with a soft aura for a glowing shaft).
    if (clubSkin.glow) {
      ctx.save();
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = clubSkin.glow;
      ctx.beginPath();
      ctx.arc(head[0], head[1], 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = clubSkin.accent ?? clubSkin.color;
    ctx.beginPath();
    ctx.arc(head[0], head[1], 3, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#aeb6c6';
    ctx.beginPath();
    ctx.arc(head[0], head[1], 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  }

  // Arms (shoulders → hands).
  ctx.strokeStyle = look.skin;
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(S[0], S[1]);
  ctx.lineTo(hands[0], hands[1]);
  ctx.stroke();

  // Cosmetic GLOVE (GS-story-avatar) — the equipped Story grip skin over the hands (a glove / gauntlet /
  // power-glove), the cuff running a little up the lead forearm toward the shoulder. Absent → bare hands.
  if (look.glove) {
    drawGlove(ctx, hands, S, look.glove, alpha);
  }

  // Head + headwear (brim/front points down the line, +x toward the target).
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(12, -58, 7, 0, Math.PI * 2);
  ctx.fill();
  if (look.hat) {
    drawHat(ctx, 12, -58, 7, look.hat);
  } else {
    // Default cap.
    ctx.fillStyle = look.cap;
    ctx.beginPath();
    ctx.arc(12, -59, 7, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(15, -60, 9, 3); // brim
  }

  ctx.restore();
}

/**
 * Draw a cosmetic SHOE (GS-story-avatar) at a planted foot, in the figure's local frame — a rounded
 * upper with the toe pushed toward the target (+x) over a sole line. `boot` adds an ankle collar,
 * `spikes` adds cleats under the sole; a `glow` look (legendary) gets a soft halo. Pure, assetless.
 */
function drawShoe(ctx: CanvasRenderingContext2D, x: number, y: number, look: ApparelLook, alpha: number): void {
  const col = look.color;
  const acc = look.accent ?? mixHex(col, '#000000', 0.35);
  ctx.save();
  if (look.glow) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.45;
    ctx.fillStyle = look.glow;
    ctx.beginPath();
    ctx.ellipse(x + 2, y - 1.5, 6, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Boot: an ankle collar rising above the shoe.
  if (look.shape === 'boot') {
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.moveTo(x - 2, y - 2);
    ctx.lineTo(x - 1, y - 8);
    ctx.lineTo(x + 3, y - 8);
    ctx.lineTo(x + 3.5, y - 2);
    ctx.closePath();
    ctx.fill();
  }
  // Upper + sole: a rounded shoe with the toe pushed toward the target (+x).
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 1);
  ctx.quadraticCurveTo(x - 3.5, y - 4, x + 1, y - 4);
  ctx.quadraticCurveTo(x + 6, y - 4, x + 6.5, y - 1);
  ctx.lineTo(x + 6.5, y);
  ctx.quadraticCurveTo(x + 3, y + 0.6, x - 3, y);
  ctx.closePath();
  ctx.fill();
  // Sole line.
  ctx.strokeStyle = acc;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x - 3, y);
  ctx.lineTo(x + 6.5, y);
  ctx.stroke();
  // Spikes: little cleats under the sole.
  if (look.shape === 'spikes') {
    ctx.fillStyle = acc;
    for (const dx of [-1.5, 1.5, 4.5]) {
      ctx.beginPath();
      ctx.moveTo(x + dx - 0.7, y);
      ctx.lineTo(x + dx + 0.7, y);
      ctx.lineTo(x + dx, y + 1.6);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * Draw a cosmetic GLOVE (GS-story-avatar) over the grip hand, in the figure's local frame — a coloured
 * hand blob with a cuff running a little up the forearm toward the shoulder `S`. `gauntlet` runs a longer
 * armoured cuff + a knuckle ridge; `powerglove` adds the toy relic's control panel; a `glow` look gets a
 * halo. Pure, assetless.
 */
function drawGlove(ctx: CanvasRenderingContext2D, hands: Vec, S: Vec, look: ApparelLook, alpha: number): void {
  const col = look.color;
  const acc = look.accent ?? mixHex(col, '#ffffff', 0.4);
  const hx = hands[0];
  const hy = hands[1];
  const dx = S[0] - hx;
  const dy = S[1] - hy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len; // up the forearm toward the shoulder
  ctx.save();
  if (look.glow) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = look.glow;
    ctx.beginPath();
    ctx.arc(hx, hy, 4.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Cuff up the forearm (longer + heavier for a gauntlet).
  const cuffLen = look.shape === 'gauntlet' ? 9 : 4.5;
  ctx.strokeStyle = look.shape === 'powerglove' ? acc : col;
  ctx.lineWidth = look.shape === 'gauntlet' ? 5.2 : 4.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(hx + ux * cuffLen, hy + uy * cuffLen);
  ctx.stroke();
  // The gripping hand.
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(hx, hy, 3, 0, Math.PI * 2);
  ctx.fill();
  if (look.shape === 'powerglove') {
    // The toy relic: an accent control panel with a red readout.
    ctx.fillStyle = acc;
    ctx.fillRect(hx - 1.6, hy - 1.6, 3.2, 3.2);
    ctx.fillStyle = look.glow ?? '#ff4d4d';
    ctx.fillRect(hx - 1.2, hy - 1.0, 2.4, 0.8);
  } else if (look.shape === 'gauntlet') {
    // A bright knuckle ridge across the back of the hand.
    ctx.strokeStyle = acc;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(hx, hy, 3, -0.4, 1.2);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw the mythic WARHAMMER driver skin (GS-thor: Thor's Hammer) in place of the plain club head — a big,
 * unmistakable Mjölnir. A short thick leather-wrapped haft, a chunky flared-face gilded maul head crossing
 * the shaft end (rim-lit, rune-etched, with a glowing storm-core between the faces), and layered electric
 * lightning wreathing it. A broad electric aura + rune-core stay lit through the WHOLE swing (swelling
 * with power), so the hammer still reads as a glowing weapon even when it smears through a fast downswing —
 * the "hard to recognise at speed" fix. Authored in the figure's local frame (same units as `drawGolfer`);
 * the head is drawn in a frame rotated to the club angle so the striking faces cross the shaft.
 * Deterministic (no Math.random — the flicker rides the swing/follow phase), assetless.
 */
function drawWarhammer(
  ctx: CanvasRenderingContext2D,
  hands: Vec,
  head: Vec,
  ang: number,
  swing: number,
  follow: number,
  alpha: number,
  look: ApparelLook,
): void {
  const gold = look.color || '#c9a24a';
  const boltCol = look.accent || '#59b6ff';
  const dark = '#5f4419';
  const rim = '#f6e9ad';
  // Storm power rides the swing: a low simmer through the takeaway, surging into contact + the
  // follow-through. A separate high-frequency flicker sells the "live current".
  const power = clamp01((swing > 0.5 ? 0.4 + (swing - 0.5) : swing * 0.5) + follow);
  const flick = 0.55 + 0.45 * Math.abs(Math.sin((swing + follow) * 21));

  // Thick wooden haft hands → head, with a dark leather grip wrap near the hands + a metal ferrule collar.
  ctx.strokeStyle = '#6b4a24';
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hands[0], hands[1]);
  ctx.lineTo(head[0], head[1]);
  ctx.stroke();
  ctx.strokeStyle = '#241708';
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(hands[0], hands[1]);
  ctx.lineTo(hands[0] + (head[0] - hands[0]) * 0.34, hands[1] + (head[1] - hands[1]) * 0.34);
  ctx.stroke();

  ctx.save();
  ctx.translate(head[0], head[1]);
  ctx.rotate(ang);

  // Broad electric aura behind the head — ALWAYS lit, swelling with power. Two soft blue discs so the
  // hammer stays a recognisable glowing mass through the fast part of the swing.
  const auraR = 11 + power * 7;
  ctx.save();
  ctx.fillStyle = boltCol;
  ctx.globalAlpha = alpha * (0.16 + power * 0.2) * flick;
  ctx.beginPath();
  ctx.arc(1, 0, auraR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = alpha * (0.28 + power * 0.28) * flick;
  ctx.beginPath();
  ctx.arc(1, 0, auraR * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The maul head — a chunky block that FLARES at the two striking faces and pinches at the waist where
  // the haft passes through (the classic Mjölnir dumbbell), so it reads as a hammer from any angle.
  const cx = 1.2; // head centre, a touch past the shaft end
  const endH = 8.8; // half-height to a striking face
  const waistH = 6.4; // half-height at the pinched waist
  const endW = 6.2; // half-width across a flared face
  const waistW = 4.8; // half-width at the waist
  ctx.beginPath();
  ctx.moveTo(cx - endW, -endH);
  ctx.lineTo(cx + endW, -endH); // top face
  ctx.lineTo(cx + waistW, -waistH);
  ctx.lineTo(cx + waistW, waistH);
  ctx.lineTo(cx + endW, endH); // bottom face
  ctx.lineTo(cx - endW, endH);
  ctx.lineTo(cx - waistW, waistH);
  ctx.lineTo(cx - waistW, -waistH);
  ctx.closePath();
  ctx.fillStyle = gold;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  // Lighter struck faces (top & bottom caps) + a bright rim highlight down the leading (target-side) edge.
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.moveTo(cx - endW, -endH);
  ctx.lineTo(cx + endW, -endH);
  ctx.lineTo(cx + endW - 1.4, -endH + 2.6);
  ctx.lineTo(cx - endW + 1.4, -endH + 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - endW, endH);
  ctx.lineTo(cx + endW, endH);
  ctx.lineTo(cx + endW - 1.4, endH - 2.6);
  ctx.lineTo(cx - endW + 1.4, endH - 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(cx + endW - 0.6, -endH + 1.5);
  ctx.lineTo(cx + waistW - 0.6, -waistH);
  ctx.lineTo(cx + waistW - 0.6, waistH);
  ctx.lineTo(cx + endW - 0.6, endH - 1.5);
  ctx.stroke();
  // Glowing storm-core set into the waist — a pulsing electric slit + rune, lit through the whole swing.
  ctx.save();
  ctx.globalAlpha = alpha * (0.5 + 0.5 * flick);
  ctx.fillStyle = boltCol;
  ctx.beginPath();
  ctx.ellipse(cx - 0.2, 0, 2.0, waistH - 1.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#eaf6ff';
  ctx.beginPath();
  ctx.ellipse(cx - 0.2, 0, 0.9, waistH - 3.0, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Rune-etched diamond on the face.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx, -4.4);
  ctx.lineTo(cx + 2.2, 0);
  ctx.lineTo(cx, 4.4);
  ctx.lineTo(cx - 2.2, 0);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  // Forked lightning wreathing the head — layered (wide blue glow → hot white core), radiating from the
  // faces. Present from the downswing through the follow-through, brightest at contact.
  const zap = clamp01((swing > 0.5 ? (swing - 0.5) / 0.5 : 0) + follow);
  if (zap > 0.02) {
    ctx.save();
    ctx.translate(head[0], head[1]);
    ctx.rotate(ang);
    ctx.globalAlpha = alpha * zap * flick;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const bolts: number[][][] = [
      [[6, -7], [11, -9], [9, -13], [14, -15]],
      [[6, 7], [12, 8], [10, 12], [15, 14]],
      [[-4, -8], [-9, -9], [-7, -13], [-11, -16]],
      [[-4, 8], [-8, 10], [-6, 13], [-10, 16]],
      [[8, 0], [13, -1.5], [12, 2], [17, 1]],
    ];
    for (const pts of bolts) {
      const trace = (): void => {
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p[0]!, p[1]!) : ctx.moveTo(p[0]!, p[1]!)));
        ctx.stroke();
      };
      ctx.strokeStyle = boltCol; // wide electric-blue glow
      ctx.lineWidth = 3.4;
      ctx.globalAlpha = alpha * zap * flick * 0.5;
      trace();
      ctx.lineWidth = 1.8;
      ctx.globalAlpha = alpha * zap * flick;
      trace();
      ctx.strokeStyle = '#f2faff'; // hot white core
      ctx.lineWidth = 0.9;
      trace();
    }
    ctx.restore();
  }
}

/**
 * Draw a cosmetic HAT on the golfer's head (canvas), centred on (hx,hy) with head radius r. Authored
 * in the canonical right-facing frame (the outer transform mirrors it for a lefty); the brim/front
 * points +x (down the line). Shapes mirror the wardrobe SVG (`render/apparelArt.ts`) so what you buy
 * is what you wear.
 */
function drawHat(ctx: CanvasRenderingContext2D, hx: number, hy: number, r: number, look: ApparelLook): void {
  const { shape, color, accent = '#15161c', glow } = look;
  if (glow) {
    ctx.save();
    ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.55;
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(hx, hy - r, r + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = color;
  ctx.strokeStyle = '#0c1116';
  ctx.lineWidth = 1;
  switch (shape) {
    case 'cap':
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(hx + 3, hy - 2, r + 2, 2.6); // brim
      break;
    case 'bucket':
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r - 0.5, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(hx, hy, r + 4, 2.6, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'visor':
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(hx, hy - 1);
      ctx.lineTo(hx + r + 6, hy);
      ctx.lineTo(hx + r, hy + 2);
      ctx.lineTo(hx - 1, hy + 1);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
      break;
    case 'tophat':
      ctx.fillRect(hx - 5, hy - r - 9, 10, 11);
      ctx.fillStyle = accent;
      ctx.fillRect(hx - 5, hy - 2.5, 10, 2.4); // band
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(hx, hy, r + 3, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'crown':
      ctx.beginPath();
      ctx.moveTo(hx - r, hy);
      ctx.lineTo(hx - r, hy - 5);
      ctx.lineTo(hx - r / 2, hy - 1);
      ctx.lineTo(hx, hy - 8);
      ctx.lineTo(hx + r / 2, hy - 1);
      ctx.lineTo(hx + r, hy - 5);
      ctx.lineTo(hx + r, hy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ff5a4d';
      ctx.beginPath();
      ctx.arc(hx, hy - 7, 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'helmet':
      ctx.beginPath();
      ctx.arc(hx, hy - 1, r + 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(hx + 1, hy - 1, r - 1.5, r - 2.5, 0, Math.PI * 0.9, Math.PI * 2.1);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(hx - 1.5, hy - 3, 2, 1.3, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'starburst': {
      // The Punched Galaxy crown (GS-punched-galaxy, was the Supernova crown): a jewelled violet circlet
      // bursting into starlight rays (violet→hot-pink→starlight gradient) with a star-core gem — the
      // set-matched twin of the wardrobe SVG (`apparelArt.ts hatGlyph 'starburst'`). Canonical r=7 head.
      const s = r / 7;
      const tip = '#fff0a0';
      const cx = hx;
      const cy = hy - 3.4 * s;
      const rb = 4.0 * s;
      const rays: [number, number, number][] = [
        [0, 12.5, 1.8], [33, 10, 1.5], [-33, 10, 1.5],
        [63, 8.2, 1.3], [-63, 8.2, 1.3], [94, 6, 1.05], [-94, 6, 1.05],
      ];
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 0.5;
      for (const [deg, len, w] of rays) {
        const t = (deg * Math.PI) / 180;
        const dx = Math.sin(t);
        const dy = -Math.cos(t);
        const px = Math.cos(t);
        const py = Math.sin(t);
        const bx = cx + rb * dx;
        const by = cy + rb * dy;
        const tx = cx + (rb + len * s) * dx;
        const ty = cy + (rb + len * s) * dy;
        const grad = ctx.createLinearGradient(bx, by, tx, ty);
        grad.addColorStop(0, color);
        grad.addColorStop(0.52, accent);
        grad.addColorStop(1, tip);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(bx - w * s * px, by - w * s * py);
        ctx.lineTo(tx, ty);
        ctx.lineTo(bx + w * s * px, by + w * s * py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Violet circlet band across the brow.
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, r, Math.PI * 1.06, Math.PI * 1.94);
      ctx.arc(hx, hy, r * 0.72, Math.PI * 1.94, Math.PI * 1.06, true);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Hot-pink rim highlight along the band.
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, r * 0.86, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      // Star-core gem at the brow.
      const gx = hx;
      const gy = hy - 1.2 * s;
      ctx.fillStyle = tip;
      ctx.beginPath();
      ctx.moveTo(gx, gy - 3 * s);
      ctx.lineTo(gx + 0.9 * s, gy - 0.9 * s);
      ctx.lineTo(gx + 3 * s, gy);
      ctx.lineTo(gx + 0.9 * s, gy + 0.9 * s);
      ctx.lineTo(gx, gy + 3 * s);
      ctx.lineTo(gx - 0.9 * s, gy + 0.9 * s);
      ctx.lineTo(gx - 3 * s, gy);
      ctx.lineTo(gx - 0.9 * s, gy - 0.9 * s);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'solarCrown': {
      // The mythic Supernova crown (GS-supernova-flame): a jewelled, pointed CIRCLET (no faceplate —
      // the face stays clear) erupting into a CROWN OF SOLAR FLAMES that fan WIDE, shoulder-to-shoulder
      // — purple-black tongues fading to red coronal tips, red embers, a hot core gem. The set-matched
      // twin of the wardrobe SVG (`apparelArt.ts hatGlyph 'solarCrown'`); the SVG carries the flicker,
      // the canvas is a static snapshot. Authored against the canonical r=7 head.
      const s = r / 7;
      const cor = accent; // red coronal
      const corHi = '#ffb648';
      const rb = 7.6 * s;
      const flames: [number, number, number, number][] = [
        [0, 14, 3.0, 0],
        [-3.0, 12, 2.6, -0.9], [3.0, 12, 2.6, 0.9],
        [-5.5, 9.6, 2.2, -1.9], [5.5, 9.6, 2.2, 1.9],
        [-7.6, 7.2, 1.9, -3.0], [7.6, 7.2, 1.9, 3.0],
        [-9.0, 5.0, 1.5, -3.8], [9.0, 5.0, 1.5, 3.8],
      ];
      const flame = (
        bx: number, by: number, h: number, w: number, c: number, fill: string | CanvasGradient,
      ): void => {
        ctx.beginPath();
        ctx.moveTo(bx - w, by);
        ctx.quadraticCurveTo(bx - w * 0.78, by - h * 0.5, bx - w * 0.12 + c * 0.4, by - h * 0.72);
        ctx.quadraticCurveTo(bx + c * 0.9, by - h * 0.92, bx + c, by - h);
        ctx.quadraticCurveTo(bx + w * 0.55 + c * 0.4, by - h * 0.52, bx + w * 0.82, by - h * 0.34);
        ctx.quadraticCurveTo(bx + w, by - h * 0.15, bx + w, by);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      for (const [x, h0, w0, c0] of flames) {
        const bx = hx + x * s;
        const by = hy - Math.sqrt(Math.max(0, rb * rb - x * s * (x * s)));
        const h = h0 * s;
        const w = w0 * s;
        const c = c0 * s;
        flame(bx, by, h * 1.08, w * 1.16, c, '#160826'); // dark back-flame for depth
        const grad = ctx.createLinearGradient(bx, by, bx + c, by - h);
        grad.addColorStop(0, '#160826');
        grad.addColorStop(0.3, color);
        grad.addColorStop(0.52, '#6a24b8');
        grad.addColorStop(0.7, '#b8309a');
        grad.addColorStop(0.84, cor);
        grad.addColorStop(1, corHi);
        ctx.strokeStyle = '#0c1116';
        ctx.lineWidth = 0.4;
        flame(bx, by, h, w, c, grad);
        ctx.stroke();
        flame(bx, by, h * 0.66, w * 0.5, c * 0.7, cor); // inner red lick
        flame(bx, by, h * 0.4, w * 0.28, c * 0.5, corHi); // hot core lick
      }
      // Pointed crown circlet resting on the brow (no faceplate). Peaks: centre -5.6, inner ±5.0,
      // outer ±4.4; a gently-bowed base tucks it onto the forehead so the face stays clear.
      const cp: [number, number][] = [
        [-6.4, -2.2], [-6.4, -3.2], [-5.1, -4.4], [-3.8, -3.0], [-2.5, -5.0], [-1.2, -3.4],
        [0, -5.6], [1.2, -3.4], [2.5, -5.0], [3.8, -3.0], [5.1, -4.4], [6.4, -3.2], [6.4, -2.2],
      ];
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 1;
      ctx.beginPath();
      cp.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(hx + px * s, hy + py * s);
        else ctx.lineTo(hx + px * s, hy + py * s);
      });
      ctx.quadraticCurveTo(hx, hy - 1.5 * s, hx - 6.4 * s, hy - 2.2 * s); // bowed base
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Metallic rim highlight along the base.
      ctx.strokeStyle = mixHex(color, '#ffffff', 0.3);
      ctx.lineWidth = 0.6 * s;
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.75;
      ctx.beginPath();
      ctx.moveTo(hx - 6.1 * s, hy - 2.9 * s);
      ctx.quadraticCurveTo(hx, hy - 4.0 * s, hx + 6.1 * s, hy - 2.9 * s);
      ctx.stroke();
      ctx.globalAlpha = ctx.globalAlpha / 0.75;
      // Ember gems set at the crown points.
      for (const [ex, ey, hot] of [[-5.1, -4.4, false], [5.1, -4.4, false], [-2.5, -5.0, true], [2.5, -5.0, true]] as [number, number, boolean][]) {
        ctx.fillStyle = hot ? corHi : cor;
        ctx.beginPath();
        ctx.arc(hx + ex * s, hy + ey * s, 0.62 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // A few static embers floating above the burst.
      const embers: [number, number, number, boolean][] = [
        [-8.5, -10, 0.6, false], [8.5, -9, 0.7, true], [0, -18, 0.6, false], [5, -13, 0.7, true],
      ];
      for (const [ex, ey, er, hot] of embers) {
        ctx.fillStyle = hot ? corHi : cor;
        ctx.beginPath();
        ctx.arc(hx + ex * s, hy + ey * s, er * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // A small coronal sun-spark at the crown's centre point (a 4-point star, not a round "eye").
      const scx = hx;
      const scy = hy - 5.2 * s;
      ctx.save();
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.4;
      ctx.fillStyle = cor;
      ctx.beginPath();
      ctx.arc(scx, scy, 2 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = corHi;
      ctx.beginPath();
      ctx.moveTo(scx, scy - 2.4 * s);
      ctx.lineTo(scx + 0.65 * s, scy - 0.65 * s);
      ctx.lineTo(scx + 2.4 * s, scy);
      ctx.lineTo(scx + 0.65 * s, scy + 0.65 * s);
      ctx.lineTo(scx, scy + 2.4 * s);
      ctx.lineTo(scx - 0.65 * s, scy + 0.65 * s);
      ctx.lineTo(scx - 2.4 * s, scy);
      ctx.lineTo(scx - 0.65 * s, scy - 0.65 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(scx, scy, 0.55 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'supernova': {
      // The mythic Supernova crown (GS-solar-flames): an opaque violet crown CAP worn over the head top
      // (so the crown fits the head, not a floating orb) with a DETONATING STAR bursting from it — rays
      // rooted along the HEAD CREST fanning radially to frame the head, a nebula shell of violet/pink
      // puffs, bright star-knots, and a white-hot core gem at the crown apex. Set-matched to the nebula
      // Suit/Leggings; the twin of the wardrobe SVG (`apparelArt.ts hatGlyph 'supernova'`). r=7 head.
      const s = r / 7;
      const tip = '#fff4c2';
      const rb = 7.6; // rays root along the head crest so the burst hugs the head (like the flame crown)
      // Nebula shell puffs (soft, nestled just above the crest, behind the burst).
      ctx.save();
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.4;
      const puffs: [number, number, number, boolean][] = [
        [0, -10, 2.9, false], [-5, -8.8, 2.5, true], [5, -8.8, 2.5, true], [-8.2, -6, 2.1, false], [8.2, -6, 2.1, false],
      ];
      for (const [ux, uy, ur, pink] of puffs) {
        ctx.fillStyle = pink ? accent : color;
        ctx.beginPath();
        ctx.arc(hx + ux * s, hy + uy * s, ur * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // Radial rays rooted along the head crest — a sunburst fanning around the upper head.
      const fil: [number, number, number][] = [
        [0, 9.5, 1.35], [-2.7, 8.8, 1.2], [2.7, 8.8, 1.2], [-4.9, 7.6, 1.1], [4.9, 7.6, 1.1],
        [-6.4, 6.2, 1.0], [6.4, 6.2, 1.0], [-7.3, 4.8, 0.85], [7.3, 4.8, 0.85],
      ];
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 0.4;
      for (const [x, len, w] of fil) {
        const by = -Math.sqrt(Math.max(0, rb * rb - x * x));
        const ux = x / rb;
        const uy = by / rb;
        const rootx = hx + x * s;
        const rooty = hy + by * s;
        const tx = hx + (x + len * ux) * s;
        const ty = hy + (by + len * uy) * s;
        const px = -uy;
        const py = ux;
        const grad = ctx.createLinearGradient(rootx, rooty, tx, ty);
        grad.addColorStop(0, color);
        grad.addColorStop(0.48, '#8a3ad6');
        grad.addColorStop(0.76, accent);
        grad.addColorStop(1, tip);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(rootx - w * s * px, rooty - w * s * py);
        ctx.lineTo(tx, ty);
        ctx.lineTo(rootx + w * s * px, rooty + w * s * py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // Opaque crown cap covering the head top (the WORN part), violet gradient bottom→top.
      const capg = ctx.createLinearGradient(hx, hy - 2 * s, hx, hy - 7 * s);
      capg.addColorStop(0, mixHex(color, '#000000', 0.45));
      capg.addColorStop(1, mixHex(color, '#ffffff', 0.14));
      ctx.fillStyle = capg;
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, 7 * s, Math.atan2(-2, -6.7), Math.atan2(-2, 6.7), false);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Hot-pink rim highlight along the brow + two starlight gems.
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy, 6.4 * s, Math.atan2(-2.6, -6.2), Math.atan2(-2.6, 6.2), false);
      ctx.stroke();
      for (const gx of [-4.6, 4.6]) {
        ctx.fillStyle = tip;
        ctx.beginPath();
        ctx.arc(hx + gx * s, hy - 3.4 * s, 0.6 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // Bright star-knots strung through the burst.
      const knots: [number, number, number, boolean][] = [
        [-3.6, -13, 0.8, true], [3.6, -13, 0.8, true], [-9.5, -9, 0.75, false], [9.5, -9, 0.75, false],
        [0, -15.5, 0.7, false], [-12, -5.5, 0.7, false], [12, -5.5, 0.7, false],
      ];
      for (const [kx, ky, kr, white] of knots) {
        ctx.fillStyle = white ? '#fff' : tip;
        ctx.beginPath();
        ctx.arc(hx + kx * s, hy + ky * s, kr * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // White-hot core gem at the crown apex: a soft radial glow, a 4-point star, a white pip.
      const bcx = hx;
      const bcy = hy - 6.6 * s;
      const cg = ctx.createRadialGradient(bcx, bcy, 0, bcx, bcy, 4 * s);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(0.4, tip);
      cg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(bcx, bcy, 4 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tip;
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 0.3;
      ctx.beginPath();
      ctx.moveTo(bcx, bcy - 3.4 * s);
      ctx.lineTo(bcx + 0.9 * s, bcy - 0.9 * s);
      ctx.lineTo(bcx + 3.4 * s, bcy);
      ctx.lineTo(bcx + 0.9 * s, bcy + 0.9 * s);
      ctx.lineTo(bcx, bcy + 3.4 * s);
      ctx.lineTo(bcx - 0.9 * s, bcy + 0.9 * s);
      ctx.lineTo(bcx - 3.4 * s, bcy);
      ctx.lineTo(bcx - 0.9 * s, bcy - 0.9 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(bcx, bcy, 1 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'wingedHelm': {
      // The Asgardian Valkyrie helm (GS-valkyrie): a feathered silver wing swept up each side (behind
      // the dome), a steel dome, a gold brow band + nasal guard, and a gold rivet emblem. Mirrors the
      // wardrobe SVG (`apparelArt.ts hatGlyph 'wingedHelm'`).
      ctx.save();
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 0.7;
      ctx.fillStyle = '#eef2f8';
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(hx + d * 4.5, hy - 5);
        ctx.bezierCurveTo(hx + d * 10, hy - 6.5, hx + d * 14, hy - 10, hx + d * 15.5, hy - 15);
        ctx.bezierCurveTo(hx + d * 13.5, hy - 12.5, hx + d * 12, hy - 12.8, hx + d * 11, hy - 11.2);
        ctx.bezierCurveTo(hx + d * 10.2, hy - 9.8, hx + d * 8.8, hy - 10, hx + d * 7.6, hy - 9);
        ctx.bezierCurveTo(hx + d * 6.6, hy - 7.6, hx + d * 5.4, hy - 6.6, hx + d * 4.5, hy - 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      // Steel dome.
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(hx, hy - 3, r, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Gold brow band, nasal guard, emblem.
      ctx.fillStyle = accent;
      ctx.fillRect(hx - r, hy - 3.4, r * 2, 2.4);
      ctx.fillRect(hx - 1.2, hy - 1.2, 2.4, 5.4);
      ctx.beginPath();
      ctx.arc(hx, hy - 6.1, 1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'wardenHalo': {
      // The Warden's Halo (GS-story-champion-cosmetics): a white-gold circlet across the brow rising to a
      // small Fairway point, under a standing ring of held starlight floating clear of the head. Mirrors
      // the wardrobe SVG (`apparelArt.ts hatGlyph 'wardenHalo'`); authored against the canonical r=7 head
      // and scaled by s, so it fits whatever head it sits on.
      const s = r / 7;
      const P = (x: number, y: number): [number, number] => [hx + x * s, hy + y * s];
      // The halo ring — an open ellipse seen near edge-on, never a filled disc (which reads as a hat).
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.ellipse(...P(0, -12.6), 8.2 * s, 2.5 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5 * s;
      ctx.stroke();
      ctx.restore();
      // Circlet across the brow — a thick pale band with a gold line laid over it.
      const arc = (col: string, w: number): void => {
        ctx.strokeStyle = col;
        ctx.lineWidth = w * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        let p = P(-7, -4.4);
        ctx.moveTo(p[0], p[1]);
        const c = P(0, -10.4);
        p = P(7, -4.4);
        ctx.quadraticCurveTo(c[0], c[1], p[0], p[1]);
        ctx.stroke();
      };
      arc(color, 3.4);
      arc(accent, 1.2);
      // The Fairway point front-and-centre.
      ctx.fillStyle = accent;
      ctx.beginPath();
      let p = P(0, -9.6);
      ctx.moveTo(p[0], p[1]);
      p = P(1.7, -7.2); ctx.lineTo(p[0], p[1]);
      p = P(0, -6.2); ctx.lineTo(p[0], p[1]);
      p = P(-1.7, -7.2); ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'coilHood': {
      // The Coil Hood (GS-story-champion-cosmetics): a flared cobra hood behind the head with an accent
      // rib and two eye spots, under a serpent circlet with a rising cobra crest — the defector costume's
      // own vocabulary (`golferPreviewSVG`'s `coilGarb`), worn now by choice. Mirrors the wardrobe SVG
      // (`apparelArt.ts hatGlyph 'coilHood'`); authored against the canonical r=7 head, scaled by s.
      const s = r / 7;
      const P = (x: number, y: number): [number, number] => [hx + x * s, hy + y * s];
      const q = (x0: number, y0: number, cx0: number, cy0: number, x1: number, y1: number): void => {
        const a = P(x0, y0); const c = P(cx0, cy0); const b = P(x1, y1);
        ctx.moveTo(a[0], a[1]);
        ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
      };
      // The flared hood, drawn FIRST so the head sits in front of it.
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      let p = P(0, -11.4);
      ctx.moveTo(p[0], p[1]);
      let c1 = P(-14, -6.4); let e = P(-11, 3.4);
      ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
      c1 = P(-5.6, 1); e = P(0, 0.2);
      ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
      c1 = P(5.6, 1); e = P(11, 3.4);
      ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
      c1 = P(14, -6.4); e = P(0, -11.4);
      ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Hood eye spots.
      ctx.save();
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.5;
      ctx.fillStyle = accent;
      for (const d of [-1, 1]) {
        ctx.beginPath();
        p = P(d * 5.6, -2.6);
        ctx.arc(p[0], p[1], 1.2 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // Serpent circlet across the brow + the rising cobra crest.
      ctx.lineCap = 'round';
      ctx.strokeStyle = mixHex(color, '#000000', 0.35);
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      q(-6.8, -3.2, 0, -8.4, 6.8, -3.2);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1 * s;
      ctx.beginPath();
      q(-6.8, -3.2, 0, -8.4, 6.8, -3.2);
      ctx.stroke();
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      p = P(0, -5);
      ctx.moveTo(p[0], p[1]);
      c1 = P(-1.4, -7.8); e = P(0, -9.2);
      ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
      c1 = P(1.7, -10.6); e = P(0.7, -12.4);
      ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      p = P(0.7, -12.4);
      ctx.arc(p[0], p[1], 1.1 * s, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'baggy':
      // The baggy green (GS-unending): a soft crown that slouches back off the brow, over a short
      // front brim, with a gold emblem dot. Mirrors the wardrobe SVG's slouched silhouette.
      ctx.beginPath();
      ctx.moveTo(hx - r - 1.5, hy - 1);
      ctx.quadraticCurveTo(hx - r - 2.5, hy - r - 2, hx - 2, hy - r - 3);
      ctx.quadraticCurveTo(hx + 3, hy - r - 4.5, hx + r - 1, hy - r + 0.5);
      ctx.quadraticCurveTo(hx + r + 1, hy - 2, hx + r - 1, hy - 1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.fillRect(hx + 3, hy - 2, r + 1.5, 2.4); // short front brim
      ctx.beginPath();
      ctx.arc(hx, hy - r + 1, 1.3, 0, Math.PI * 2); // gold emblem
      ctx.fill();
      break;
    case 'tricorn': {
      // The galaxy pirate TRICORN (GS-space-pirate-parrot): a cocked three-corner felt hat washed in
      // nebula + starlight, gold buccaneer trim along the cocked brim, a starlight emblem, and a built-in
      // black EYE PATCH over one eye. Mirrors the wardrobe SVG (`apparelArt.ts hatGlyph 'tricorn'`);
      // authored against the canonical r=7 head, scaled by s.
      const s = r / 7;
      const P = (x: number, y: number): [number, number] => [hx + x * s, hy + y * s];
      const felt = (): void => {
        ctx.beginPath();
        let p = P(-11.5, -1.8); ctx.moveTo(p[0], p[1]);
        p = P(-8, -9.6); ctx.lineTo(p[0], p[1]);
        let c1 = P(-6, -7); let e = P(-4.2, -6.6); ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
        c1 = P(-2, -11); e = P(0, -11.6); ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
        c1 = P(2, -11); e = P(4.2, -6.6); ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
        c1 = P(6, -7); e = P(8, -9.6); ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
        p = P(11.5, -1.8); ctx.lineTo(p[0], p[1]);
        c1 = P(0, 1.8); e = P(-11.5, -1.8); ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
        ctx.closePath();
      };
      ctx.fillStyle = color;
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      felt();
      ctx.fill();
      ctx.stroke();
      // Nebula wash swoosh.
      ctx.save();
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.5;
      ctx.strokeStyle = glow ?? '#7a5cff';
      ctx.lineWidth = 1.6 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      let q = P(-9, -3); ctx.moveTo(q[0], q[1]);
      let cc = P(-3, -8); let ee = P(3, -5); ctx.quadraticCurveTo(cc[0], cc[1], ee[0], ee[1]);
      cc = P(8, -3.6); ee = P(9.5, -6); ctx.quadraticCurveTo(cc[0], cc[1], ee[0], ee[1]);
      ctx.stroke();
      ctx.restore();
      // Starfield on the felt.
      ctx.fillStyle = '#ffffff';
      for (const [sx, sy, sr] of [[-6.5, -4.5, 0.55], [-3, -7.5, 0.5], [2.5, -8, 0.55], [6, -5, 0.5], [-8.5, -3, 0.45], [8.5, -3.2, 0.45], [0, -6, 0.4]] as [number, number, number][]) {
        ctx.beginPath();
        ctx.arc(hx + sx * s, hy + sy * s, sr * s, 0, Math.PI * 2);
        ctx.fill();
      }
      // Gold trim re-tracing the cocked upper brim.
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.1 * s;
      ctx.beginPath();
      q = P(-11.5, -1.8); ctx.moveTo(q[0], q[1]);
      q = P(-8, -9.6); ctx.lineTo(q[0], q[1]);
      cc = P(-6, -7); ee = P(-4.2, -6.6); ctx.quadraticCurveTo(cc[0], cc[1], ee[0], ee[1]);
      cc = P(-2, -11); ee = P(0, -11.6); ctx.quadraticCurveTo(cc[0], cc[1], ee[0], ee[1]);
      cc = P(2, -11); ee = P(4.2, -6.6); ctx.quadraticCurveTo(cc[0], cc[1], ee[0], ee[1]);
      cc = P(6, -7); ee = P(8, -9.6); ctx.quadraticCurveTo(cc[0], cc[1], ee[0], ee[1]);
      q = P(11.5, -1.8); ctx.lineTo(q[0], q[1]);
      ctx.stroke();
      // Starlight emblem (a 4-point star) front-and-centre.
      const ex = hx;
      const ey = hy - 4.4 * s;
      ctx.fillStyle = '#fff0c0';
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 0.4 * s;
      ctx.beginPath();
      ctx.moveTo(ex, ey - 2.8 * s);
      ctx.lineTo(ex + 0.8 * s, ey - 0.8 * s);
      ctx.lineTo(ex + 2.8 * s, ey);
      ctx.lineTo(ex + 0.8 * s, ey + 0.8 * s);
      ctx.lineTo(ex, ey + 2.8 * s);
      ctx.lineTo(ex - 0.8 * s, ey + 0.8 * s);
      ctx.lineTo(ex - 2.8 * s, ey);
      ctx.lineTo(ex - 0.8 * s, ey - 0.8 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, 0.7 * s, 0, Math.PI * 2);
      ctx.fill();
      // Eye patch over one eye (the +x eye), with a strap across the brow.
      ctx.strokeStyle = '#0c0a14';
      ctx.lineWidth = 0.9 * s;
      ctx.lineCap = 'round';
      ctx.beginPath();
      q = P(-4.8, -2.4); ctx.moveTo(q[0], q[1]);
      q = P(4.6, -0.6); ctx.lineTo(q[0], q[1]);
      ctx.stroke();
      ctx.fillStyle = '#100c1a';
      ctx.strokeStyle = '#0c1116';
      ctx.lineWidth = 0.6 * s;
      ctx.beginPath();
      ctx.ellipse(hx + 2.6 * s, hy + 0.6 * s, 2.15 * s, 2.45 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

/**
 * Draw a cosmetic GOLF BAG (GS-wardrobe-bagtier) propped beside the golfer — the canvas mirror of the
 * wardrobe SVG `bagGlyph`: a tapered staff-bag body with gold trim + pocket + strap, three clubs standing
 * out the top, and a soft aura for the glowing tiers. Authored in a ~34u-tall glyph frame about (cx,cy),
 * fitted by `scale`. Kept in sync with `apparelArt.ts bagGlyph` so what you outfit is what you carry.
 */
function drawGolfBag(ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number, look: ApparelLook): void {
  const { color, accent = '#d9b74a', glow } = look;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (glow) {
    ctx.save();
    ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.5;
    const g = ctx.createRadialGradient(0, -3, 2, 0, -3, 20);
    g.addColorStop(0, glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -3, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Clubs poking out of the top.
  ctx.strokeStyle = '#b9c2cf';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-3.5, -11); ctx.lineTo(-5.5, -19);
  ctx.moveTo(0.5, -11); ctx.lineTo(0.5, -21);
  ctx.moveTo(4, -11); ctx.lineTo(6, -18);
  ctx.stroke();
  ctx.fillStyle = '#dfe6f0';
  ctx.strokeStyle = '#0c1116';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(-5.9, -19.6, 1.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0.5, -21); ctx.lineTo(4.4, -19.6); ctx.lineTo(0.5, -18.6); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(6.4, -18.5, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // Bag body (tapered), gold top ring, trim band, pocket, strap, drawstring ring.
  ctx.fillStyle = color;
  ctx.strokeStyle = '#0c1116';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-6.5, -11); ctx.lineTo(6.5, -11); ctx.lineTo(5.4, 13);
  ctx.quadraticCurveTo(0, 15.4, -5.4, 13); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.ellipse(0, -11, 6.5, 2.3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillRect(-4.6, -4, 9.2, 2);
  ctx.beginPath();
  ctx.moveTo(-4.2, 0); ctx.lineTo(4.2, 0); ctx.lineTo(3.6, 8);
  ctx.quadraticCurveTo(0, 9.6, -3.6, 8); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-6, -9); ctx.quadraticCurveTo(-11, 0, -5.6, 10); ctx.stroke();
  ctx.strokeStyle = '#0f5132';
  ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.arc(0, 4, 1.9, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

/**
 * Draw cosmetic PANTS on the golfer's legs (canvas) — replaces the default dark legs. Authored in the
 * same local frame as `drawGolfer` (hip at (2,-30), feet at (-7,0) & (12,0); the outer transform mirrors
 * for a lefty). Shapes mirror the wardrobe SVG (`render/apparelArt.ts`) so what you buy is what you wear.
 */
function drawPants(ctx: CanvasRenderingContext2D, look: ApparelLook, skin: string, alpha: number): void {
  const { shape, color, accent = '#0c1116', glow } = look;
  const hip: Vec = [2, -30];
  const feet: Vec[] = [[-7, 0], [12, 0]];
  // Stroke both legs from the hip down to a fraction `frac` of the way to each foot (1 = full leg).
  const legs = (col: string, w: number, frac = 1): void => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (const [fx, fy] of feet) {
      ctx.moveTo(hip[0], hip[1]);
      ctx.lineTo(hip[0] + (fx - hip[0]) * frac, hip[1] + (fy - hip[1]) * frac);
    }
    ctx.stroke();
  };
  // A soft aura behind the legs for the glowing top tiers.
  if (glow) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.4;
    legs(glow, 14);
    ctx.restore();
  }
  switch (shape) {
    case 'shorts':
      legs(skin, 5); // bare shins
      legs(color, 7.5, 0.5); // shorts to the knee
      break;
    case 'knickers':
      legs(skin, 4.5); // long socks
      legs(color, 8.5, 0.62); // puffed plus-fours past the knee
      ctx.fillStyle = accent; // buckled cuffs
      for (const [fx, fy] of feet) {
        ctx.beginPath();
        ctx.arc(hip[0] + (fx - hip[0]) * 0.62, hip[1] + (fy - hip[1]) * 0.62, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'leggings':
      legs(color, 5);
      break;
    case 'spacepants':
      legs(color, 7);
      ctx.fillStyle = accent; // mag-boots
      for (const [fx, fy] of feet) {
        ctx.beginPath();
        ctx.ellipse(fx, fy - 1, 3, 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'nebula':
      legs(color, 6.5);
      ctx.fillStyle = '#fff'; // a starfield running the length of both legs (GS-worn-coverage)
      for (const [fx, fy] of feet) {
        for (const [fr, rr] of [[0.2, 0.9], [0.42, 0.7], [0.62, 0.8], [0.82, 0.6]] as [number, number][]) {
          const dx = fr > 0.5 ? 1.2 : -1.2;
          ctx.beginPath();
          ctx.arc(hip[0] + (fx - hip[0]) * fr + dx, hip[1] + (fy - hip[1]) * fr, rr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'emberlegs': {
      // Solar Flames leggings (GS-solar-flames): dark leggings with solar flames licking up each shin
      // (dark→violet→magenta→red→hot) + red embers rising. Mirrors the wardrobe SVG (`pantsGlyph`).
      legs(color, 6.5);
      const cor = accent;
      const corHi = '#ffb648';
      const flame = (
        bx: number, by: number, h: number, w: number, c: number, fill: string,
      ): void => {
        ctx.beginPath();
        ctx.moveTo(bx - w, by);
        ctx.quadraticCurveTo(bx - w * 0.78, by - h * 0.5, bx - w * 0.12 + c * 0.4, by - h * 0.72);
        ctx.quadraticCurveTo(bx + c * 0.9, by - h * 0.92, bx + c, by - h);
        ctx.quadraticCurveTo(bx + w * 0.55 + c * 0.4, by - h * 0.52, bx + w * 0.82, by - h * 0.34);
        ctx.quadraticCurveTo(bx + w, by - h * 0.15, bx + w, by);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      for (const [fx, fy] of feet) {
        const c = (hip[0] - fx) * 0.12; // lean the flame tip up the leg toward the hip
        const layers: [number, number, string][] = [
          [15 * 1.12, 3.4 * 1.16, '#160826'], [15, 3.4, '#6a24b8'], [12, 2.4, '#b8309a'],
          [8.4, 1.7, cor], [4.8, 1, corHi],
        ];
        for (const [h, w, fill] of layers) flame(fx, fy - 2, h, w, c * (h / 15), fill);
      }
      ctx.fillStyle = cor;
      for (const [fx, fy] of feet) {
        ctx.beginPath();
        ctx.arc(hip[0] + (fx - hip[0]) * 0.5, hip[1] + (fy - hip[1]) * 0.5 - 4, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'riftgreaves': {
      // Punched Galaxy greaves (GS-punched-galaxy): cosmic leggings with galaxy-crack energy down each
      // thigh (accent + white core) over dark angular shin plates + star specks. Mirrors the wardrobe SVG.
      legs(color, 6.5);
      const crackPath = (): void => {
        ctx.beginPath();
        for (const [fx, fy] of feet) {
          const side = fx > hip[0] ? 1 : -1;
          ctx.moveTo(hip[0] + (fx - hip[0]) * 0.1, hip[1] + (fy - hip[1]) * 0.1);
          ctx.lineTo(hip[0] + (fx - hip[0]) * 0.34 + side * 1.6, hip[1] + (fy - hip[1]) * 0.34);
          ctx.lineTo(hip[0] + (fx - hip[0]) * 0.58, hip[1] + (fy - hip[1]) * 0.58);
        }
      };
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      crackPath();
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5;
      ctx.stroke(); // white core over the same path
      // Dark shin plates over the lower legs, with an accent rim at the knee.
      ctx.strokeStyle = '#160826';
      ctx.lineWidth = 5;
      ctx.beginPath();
      for (const [fx, fy] of feet) {
        ctx.moveTo(hip[0] + (fx - hip[0]) * 0.6, hip[1] + (fy - hip[1]) * 0.6);
        ctx.lineTo(fx, fy);
      }
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const [fx, fy] of feet) {
        const tx = hip[0] + (fx - hip[0]) * 0.6;
        const ty = hip[1] + (fy - hip[1]) * 0.6;
        ctx.moveTo(tx - 2.5, ty);
        ctx.lineTo(tx + 2.5, ty);
      }
      ctx.stroke();
      ctx.fillStyle = '#fff'; // star specks
      for (const [fx, fy] of feet) {
        ctx.beginPath();
        ctx.arc(hip[0] + (fx - hip[0]) * 0.44, hip[1] + (fy - hip[1]) * 0.44, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'parrotpants': {
      // Space Parrot tailfeathers (GS-space-pirate-parrot): cosmic-navy legs draped in long macaw
      // tail-plumes (teal/gold/magenta) + star specks. Mirrors the wardrobe SVG (`pantsGlyph`).
      legs(color, 6.5);
      const plume = ['#2fd6c8', '#ffc23a', '#ff5a9e'];
      const feather = (x0: number, y0: number, x1: number, y1: number, w: number, col: string): void => {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * w;
        const ny = (dx / len) * w;
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(mx + nx, my + ny, x1, y1);
        ctx.quadraticCurveTo(mx - nx, my - ny, x0, y0);
        ctx.closePath();
        ctx.fill();
      };
      let li = 0;
      for (const [fx, fy] of feet) {
        const ex = hip[0] + (fx - hip[0]) * 0.82;
        const ey = hip[1] + (fy - hip[1]) * 0.82;
        feather(hip[0], hip[1], fx, fy, 2.6, plume[li % 3]!);
        feather(hip[0], hip[1], ex - 2, ey, 1.7, plume[(li + 1) % 3]!);
        feather(hip[0], hip[1], ex + 2, ey, 1.7, plume[(li + 2) % 3]!);
        li++;
      }
      ctx.fillStyle = '#fff'; // star specks along the plumes
      for (const [fx, fy] of feet) {
        for (const fr of [0.3, 0.6]) {
          ctx.beginPath();
          ctx.arc(hip[0] + (fx - hip[0]) * fr + (fr > 0.4 ? 1 : -1), hip[1] + (fy - hip[1]) * fr, 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'greaves': {
      legs(color, 6.5); // crimson-leather leggings
      // Gold shin greaves over the lower half of each leg.
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (const [fx, fy] of feet) {
        ctx.moveTo(hip[0] + (fx - hip[0]) * 0.5, hip[1] + (fy - hip[1]) * 0.5);
        ctx.lineTo(fx, fy);
      }
      ctx.stroke();
      // War-skirt tassets hanging off the hip.
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(hip[0] - 6, hip[1]);
      ctx.lineTo(hip[0] + 8, hip[1]);
      ctx.lineTo(hip[0] + 3, hip[1] + 8);
      ctx.lineTo(hip[0] - 2, hip[1] + 8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'wardenRaiment': {
      // The Warden's Raiment (GS-story-champion-cosmetics): pale vestment legs with a gold seam down each,
      // gilded shin guards over the lower leg, and softly draped robe tassets off the hip — a vestment cut,
      // longer and rounder than the Valkyrie war-skirt. Mirrors `apparelArt.ts pantsGlyph 'wardenRaiment'`.
      legs(color, 6.5);
      ctx.save();
      ctx.globalAlpha = alpha * 0.55; // gold seam down each leg
      ctx.strokeStyle = accent;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (const [fx, fy] of feet) {
        ctx.moveTo(hip[0] + (fx - hip[0]) * 0.25, hip[1] + (fy - hip[1]) * 0.25);
        ctx.lineTo(hip[0] + (fx - hip[0]) * 0.72, hip[1] + (fy - hip[1]) * 0.72);
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = accent; // gilded shin guards
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [fx, fy] of feet) {
        ctx.moveTo(hip[0] + (fx - hip[0]) * 0.68, hip[1] + (fy - hip[1]) * 0.68);
        ctx.lineTo(fx, fy);
      }
      ctx.stroke();
      // Draped robe tassets off the hip — a rounded hem, not the armoured point.
      ctx.fillStyle = accent;
      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      ctx.beginPath();
      ctx.moveTo(hip[0] - 6, hip[1]);
      ctx.lineTo(hip[0] + 8, hip[1]);
      ctx.quadraticCurveTo(hip[0] + 6, hip[1] + 7, hip[0] + 3, hip[1] + 9.5);
      ctx.lineTo(hip[0] - 2, hip[1] + 9.5);
      ctx.quadraticCurveTo(hip[0] - 5, hip[1] + 7, hip[0] - 6, hip[1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'coilScales': {
      // Coil Scales (GS-story-champion-cosmetics): shed serpent scale grown to fit — a dark ridge down
      // each leg with venom scale rows stacked along it, and a fanged cuff at each ankle. Mirrors
      // `apparelArt.ts pantsGlyph 'coilScales'`.
      legs(color, 6.5);
      ctx.save();
      ctx.globalAlpha = alpha * 0.85; // the ridged spine down each leg
      ctx.strokeStyle = mixHex(color, '#000000', 0.3);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const [fx, fy] of feet) {
        ctx.moveTo(hip[0] + (fx - hip[0]) * 0.12, hip[1] + (fy - hip[1]) * 0.12);
        ctx.lineTo(fx, fy);
      }
      ctx.stroke();
      ctx.restore();
      // Scale rows, fading down the leg.
      ctx.strokeStyle = accent;
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 5; i++) {
        const fr = 0.16 + i * 0.17;
        ctx.save();
        ctx.globalAlpha = alpha * (0.65 - i * 0.06);
        ctx.beginPath();
        for (const [fx, fy] of feet) {
          const lx = hip[0] + (fx - hip[0]) * fr;
          const ly = hip[1] + (fy - hip[1]) * fr;
          const w = 2.4 - i * 0.2;
          ctx.moveTo(lx - w, ly);
          ctx.quadraticCurveTo(lx, ly + 2, lx + w, ly);
        }
        ctx.stroke();
        ctx.restore();
      }
      // Fanged cuff at each ankle.
      ctx.fillStyle = accent;
      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      for (const [fx, fy] of feet) {
        ctx.beginPath();
        ctx.moveTo(fx - 2.6, fy - 2.6);
        ctx.lineTo(fx + 2.6, fy - 2.6);
        ctx.lineTo(fx + 1.4, fy);
        ctx.lineTo(fx, fy - 1.5);
        ctx.lineTo(fx - 1.4, fy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'trousers':
    default:
      legs(color, 6.5);
      break;
  }
  // A waistband accent across the hip (skipped for shorts, which read better bare-waisted).
  if (shape !== 'shorts') {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hip[0] - 4, hip[1]);
    ctx.lineTo(hip[0] + 4, hip[1]);
    ctx.stroke();
  }
}
