/**
 * THE WARDEN ARK (GS-story-warden-ark) — the Herald path's finale BOSS, painted for the Canvas2D battle.
 *
 * The player report: *"the final spaceship boss battle has you fighting the serpent instead of the Warden's
 * spaceship — and it doesn't make sense that the Warden ship would be firing acid blasts."* Dead right. On
 * the Herald road you are not fighting the World-Eater — you are its liberator. The thing between you and
 * the root is the **Ark**: the Fairway Wardens' capital ship, come with your old friends at its helm to
 * hold the seal you mean to break. It was drawing the serpent's head and spitting venom at you.
 *
 * So the Herald fight now has its own boss and its own weapons. The Ark is drawn in the Warden fleet's own
 * palette (the Radiant Warden Cruiser's ivory hull / pale glass / gold trim / cyan drive) as an ORDERED
 * thing — long spine, lance batteries in a row, a lit bridge, a halo ring — the visual opposite of the
 * serpent's coils. It takes visible damage as you wear it down (scorch, breaches, guttering fires), so the
 * health bar is readable off the hull itself.
 *
 * PURE RENDER: one function, no state, no rng (a tiny deterministic hash drives the scorch placement so the
 * damage pattern is stable frame to frame), no DOM beyond the passed 2D context. Returns `BossAnchors` —
 * the same shape `paintSerpent` returns — so the battle module holds ONE anchors variable and one target
 * seam for both bosses: `browX/browY` is the fore hull (what your guns shoot at), `eyeX/eyeY/eyeR` is the
 * REACTOR CORE (what the golf finisher strikes), `headH` is the hull unit that extra geometry hangs off.
 */

import type { SerpentAnchors } from './sigilCeremony';

/** The anchor contract both finale bosses satisfy (the serpent's head, or the Ark's core). */
export type BossAnchors = SerpentAnchors;

export interface ArkOpts {
  /** 0..1 — the batteries wind up and flare around a volley (the serpent's `rage` twin). */
  rage?: number;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Warden fleet palette — the Radiant Warden Cruiser's own colours (`ships.ts`), so the Ark reads as the
 *  flagship of the fleet whose cruiser you can fly. */
const HULL_LIT = '#f4f8ff';
const HULL_MID = '#c9d6ea';
const HULL_DARK = '#7c8ba6';
const GOLD = '#ffe08a';
const GLASS = '#bfe9ff';
const DRIVE = '#8fe6ff';

/** A stable 0..1 hash for scorch placement — deterministic, so damage never crawls between frames. */
function h01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Paint the Warden Ark and return its anchors.
 *
 * @param cx,cy   the hull's centre in design space
 * @param t       seconds (drives the drift, the drive flicker and the battery pulse)
 * @param damage  0 (pristine) → 1 (holed and burning) — normally `1 - hp/hpMax`
 * @param focus   0 → 1: the aim-reveal push, zooming the frame onto the exposed reactor core
 */
export function paintWardenArk(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  t: number,
  damage: number,
  focus: number,
  opts: ArkOpts = {},
): BossAnchors {
  const dmg = clamp01(damage);
  const foc = clamp01(focus);
  const rage = clamp01(opts.rage ?? 0);
  // The Ark holds station: a shallow rise-and-fall and a hint of yaw, so it reads as a moving VESSEL and
  // not a backdrop — but far calmer than the serpent's writhing. Order is the point.
  const drift = Math.sin(t * 0.42) * 9 * (1 - foc);
  const scale = lerp(1, 1.5, foc);
  // Hull-local +x runs BOW → STERN. The player flies at the lower left, so the bow is turned toward them
  // (local +x points up-and-right, away): a warship holding station across your line of approach.
  const ang = -0.42 + Math.sin(t * 0.31) * 0.02;

  const L = 380; // hull length, bow to stern
  const W = 44; // hull half-width amidships
  const DORSAL = -1; // local -y is "up" (the spine + batteries face the sky)

  ctx.save();
  ctx.translate(cx, cy + drift);
  ctx.scale(scale, scale);

  // ── the celestial HALO: the Order's light, guttering as the Ark is worn down ─────────────────────────
  const halo = ctx.createRadialGradient(0, 0, 30, 0, 0, 330);
  halo.addColorStop(0, `rgba(190,225,255,${0.14 * (1 - dmg * 0.65)})`);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, 330, 0, 6.283);
  ctx.fill();

  ctx.rotate(ang);

  // ── the ring the hull hangs inside — the Warden shrine motif, built in steel and gold ────────────────
  ctx.strokeStyle = `rgba(255,224,138,${0.22 - dmg * 0.16})`;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, L * 0.46, L * 0.23, 0, 0, 6.283);
  ctx.stroke();

  // ── the HULL: a long wedge — sharp bow (-x), broad engine block (+x) ─────────────────────────────────
  const hullGrad = ctx.createLinearGradient(0, -W * 1.6, 0, W * 1.6);
  hullGrad.addColorStop(0, HULL_LIT);
  hullGrad.addColorStop(0.52, HULL_MID);
  hullGrad.addColorStop(1, HULL_DARK);
  ctx.fillStyle = hullGrad;
  ctx.beginPath();
  ctx.moveTo(-L * 0.5, 0); // the bow point, turned at the player
  ctx.lineTo(-L * 0.2, -W * 0.72);
  ctx.lineTo(L * 0.34, -W);
  ctx.lineTo(L * 0.46, -W * 0.62);
  ctx.lineTo(L * 0.46, W * 0.62);
  ctx.lineTo(L * 0.34, W);
  ctx.lineTo(-L * 0.2, W * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,38,58,0.9)';
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // gold keel stripe down the flank — the fleet's livery
  ctx.strokeStyle = `rgba(255,224,138,${0.9 - dmg * 0.4})`;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  ctx.moveTo(-L * 0.42, W * 0.16);
  ctx.lineTo(L * 0.42, W * 0.3);
  ctx.stroke();

  // plating seams across the hull — a built thing, not a paper dart
  ctx.strokeStyle = 'rgba(70,88,116,0.5)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) {
    const px = lerp(-L * 0.3, L * 0.36, i / 5);
    const half = lerp(W * 0.42, W * 0.94, i / 5);
    ctx.beginPath();
    ctx.moveTo(px, -half);
    ctx.lineTo(px, half);
    ctx.stroke();
  }

  // a row of lit windows along the flank — a crewed ship, going dark as it burns
  for (let i = 0; i < 18; i++) {
    const p = i / 17;
    const wx = lerp(-L * 0.26, L * 0.36, p);
    const wy = lerp(W * 0.02, W * 0.2, p);
    ctx.fillStyle = h01(i * 3.7) > dmg * 0.9 ? GLASS : 'rgba(38,50,70,0.95)';
    ctx.fillRect(wx, wy, 6, 3);
  }

  // ── the dorsal SPINE + three LANCE batteries in a row (order made visible) ───────────────────────────
  ctx.fillStyle = HULL_MID;
  ctx.beginPath();
  ctx.moveTo(-L * 0.12, DORSAL * W * 0.72);
  ctx.lineTo(L * 0.3, DORSAL * W * 0.96);
  ctx.lineTo(L * 0.3, DORSAL * W * 1.5);
  ctx.lineTo(-L * 0.06, DORSAL * W * 1.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,38,58,0.9)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  const glow = clamp01(0.3 + rage * 0.7 + Math.sin(t * 3.1) * 0.05);
  const BARREL = 2.45; // local bearing of the trained barrels — forward and down, onto your flight lane
  for (let i = 0; i < 3; i++) {
    const bx = lerp(-L * 0.02, L * 0.24, i / 2);
    const by = DORSAL * W * 1.26;
    // the barrel first, so the drum caps it
    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(BARREL);
    ctx.fillStyle = HULL_DARK;
    ctx.fillRect(2, -2.6, 22, 5.2);
    ctx.fillStyle = `rgba(255,246,214,${0.45 + 0.55 * glow})`;
    ctx.fillRect(20, -2, 6, 4);
    ctx.restore();
    // the turret drum, seated on the spine
    ctx.fillStyle = HULL_LIT;
    ctx.beginPath();
    ctx.ellipse(bx, by, 11, 8, 0, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = 'rgba(28,38,58,0.9)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = `rgba(255,224,138,${0.35 + 0.5 * glow})`;
    ctx.beginPath();
    ctx.arc(bx, by, 3.2, 0, 6.283);
    ctx.fill();
    // the muzzle glow builds as a volley winds up
    const mx = bx + Math.cos(BARREL) * 26;
    const my = by + Math.sin(BARREL) * 26;
    const mg = ctx.createRadialGradient(mx, my, 1, mx, my, 15);
    mg.addColorStop(0, `rgba(255,246,214,${0.9 * glow})`);
    mg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(mx, my, 15, 0, 6.283);
    ctx.fill();
  }

  // ── the BRIDGE: a lit dome up forward, where your old friends are standing ───────────────────────────
  const bridgeX = -L * 0.16;
  const bridgeY = DORSAL * W * 0.72;
  ctx.fillStyle = HULL_LIT;
  ctx.beginPath();
  ctx.ellipse(bridgeX, bridgeY, 26, 13, 0, Math.PI, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = 'rgba(28,38,58,0.9)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = GLASS;
  ctx.globalAlpha = 0.92 - dmg * 0.55;
  ctx.beginPath();
  ctx.ellipse(bridgeX, bridgeY - 1, 19, 8, 0, Math.PI, 2 * Math.PI);
  ctx.fill();
  ctx.globalAlpha = 1;

  // ── the DRIVE: twin nacelles at the stern, cyan flame trailing off the back ──────────────────────────
  for (const ny of [-W * 0.46, W * 0.46]) {
    ctx.fillStyle = HULL_DARK;
    ctx.beginPath();
    ctx.ellipse(L * 0.42, ny, 22, 11, 0, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = 'rgba(28,38,58,0.9)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    const flick = 0.75 + Math.sin(t * 9 + ny) * 0.2;
    const fg = ctx.createLinearGradient(L * 0.46, ny, L * 0.46 + 90 * flick, ny);
    fg.addColorStop(0, DRIVE);
    fg.addColorStop(0.4, `rgba(143,230,255,${(0.5 - dmg * 0.25) * flick})`);
    fg.addColorStop(1, 'rgba(143,230,255,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(L * 0.46, ny - 9);
    ctx.lineTo(L * 0.46 + 92 * flick, ny);
    ctx.lineTo(L * 0.46, ny + 9);
    ctx.closePath();
    ctx.fill();
  }

  // ── BATTLE DAMAGE: breaches punched through the hull, guttering as they burn ─────────────────────────
  const breaches = Math.floor(dmg * 8);
  for (let i = 0; i < breaches; i++) {
    const p = h01(i * 5.1);
    const bx = lerp(-L * 0.3, L * 0.34, p);
    const by = lerp(-W * 0.55, W * 0.55, h01(i * 9.3)) * (1 - Math.abs(p - 0.5) * 0.6);
    const r = 4 + h01(i * 2.3) * 6;
    // a torn hole, not a disc — three overlapping bites of dark, then flame licking out of it
    ctx.fillStyle = 'rgba(12,16,26,0.96)';
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + h01(i * 7.7) * 6;
      ctx.beginPath();
      ctx.arc(bx + Math.cos(a) * r * 0.4, by + Math.sin(a) * r * 0.3, r * 0.75, 0, 6.283);
      ctx.fill();
    }
    const fire = 0.5 + Math.sin(t * 6 + i * 2.1) * 0.5;
    ctx.fillStyle = `rgba(255,168,80,${0.65 * fire})`;
    ctx.beginPath();
    ctx.moveTo(bx - r * 0.6, by);
    ctx.lineTo(bx, by - r * (1.1 + fire * 0.8));
    ctx.lineTo(bx + r * 0.6, by);
    ctx.closePath();
    ctx.fill();
    const fg = ctx.createRadialGradient(bx, by, 1, bx, by, r * 2.2);
    fg.addColorStop(0, `rgba(255,196,110,${0.4 * fire})`);
    fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(bx, by, r * 2.2, 0, 6.283);
    ctx.fill();
  }

  // ── the REACTOR CORE, amidships — the finisher's target, laid bare as the hull fails ─────────────────
  const coreX = L * 0.05;
  const coreY = 0;
  const coreR = 26;
  const bare = clamp01(dmg * 0.75 + foc);
  const pulse = 0.6 + 0.4 * Math.sin(t * 2.4);
  const cg = ctx.createRadialGradient(coreX, coreY, 2, coreX, coreY, coreR * 2.8);
  cg.addColorStop(0, `rgba(255,250,230,${(0.35 + 0.55 * bare) * pulse})`);
  cg.addColorStop(0.45, `rgba(143,230,255,${(0.25 + 0.4 * bare) * pulse})`);
  cg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.arc(coreX, coreY, coreR * 2.8, 0, 6.283);
  ctx.fill();
  // the containment housing: a dark ring set into the deck, gold-lipped, with the core burning inside
  ctx.fillStyle = 'rgba(20,28,44,0.85)';
  ctx.beginPath();
  ctx.arc(coreX, coreY, coreR, 0, 6.283);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.globalAlpha = 0.6 + 0.4 * bare;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(coreX, coreY, coreR, 0, 6.283);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const icg = ctx.createRadialGradient(coreX, coreY, 1, coreX, coreY, coreR * 0.8);
  icg.addColorStop(0, '#ffffff');
  icg.addColorStop(0.5, `rgba(190,235,255,${0.7 + 0.3 * bare})`);
  icg.addColorStop(1, 'rgba(143,230,255,0.15)');
  ctx.fillStyle = icg;
  ctx.beginPath();
  ctx.arc(coreX, coreY, coreR * (0.62 + 0.08 * pulse), 0, 6.283);
  ctx.fill();

  ctx.restore();

  // ── anchors, back in design space (the same shape the serpent returns) ───────────────────────────────
  const at = (lx: number, ly: number): { x: number; y: number } => ({
    x: cx + (lx * Math.cos(ang) - ly * Math.sin(ang)) * scale,
    y: cy + drift + (lx * Math.sin(ang) + ly * Math.cos(ang)) * scale,
  });
  const core = at(coreX, coreY);
  const bow = at(-L * 0.3, 0);
  return {
    eyeX: core.x,
    eyeY: core.y,
    eyeR: coreR * scale,
    browX: bow.x,
    browY: bow.y,
    headH: W * scale,
    headAng: ang,
  };
}

/**
 * Where the Ark's lance batteries fire FROM, in design space — the battle's `mawPos` twin, so the two
 * bosses share ONE muzzle seam. Derived from the anchors alone (no hidden state): the battery row sits a
 * hull-width and a half above the keel and a shade aft of the reactor core, both expressed in `headH`
 * units and rotated by the hull's own `headAng`, so it tracks the drift and the aim-reveal push for free.
 */
export function arkBatteryPos(a: BossAnchors): { x: number; y: number } {
  const dx = 0.43 * a.headH;
  const dy = -1.5 * a.headH;
  const c = Math.cos(a.headAng);
  const s = Math.sin(a.headAng);
  return { x: a.eyeX + dx * c - dy * s, y: a.eyeY + dx * s + dy * c };
}
