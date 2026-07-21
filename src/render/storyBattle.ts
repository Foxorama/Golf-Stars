/**
 * The FINALE BATTLE (GS-story-battle → GS-story-battle-2) — Canvas2D, render-only, the interactive
 * Jörmungandr fight that SPENDS the arsenal you built. The rework answers three player complaints
 * ("the serpent doesn't look like the teasers, the battle has no challenge, the two paths are the same"):
 *
 *   • THE SERPENT IS THE TEASER SERPENT. The fight draws the same mythic `paintSerpent` the sigil
 *     ceremonies tease — horns, fanged maw, the slit-pupil eye — via its returned anchors, so the
 *     reticle sweeps the DRAWN eye and the Herald's seal hangs on the DRAWN brow (graphic ≡ target).
 *   • THE ARSENAL IS CONSUMED CONTINUOUSLY. All tuning comes from the pure `finaleBattleTuning`
 *     (sim/rpg/storyFinale.ts): weapons set the volleys to fell it, engines+shields set the strikes your
 *     shields absorb, engines alone set the recharge speed — every rating point past the gate floor
 *     measurably improves the real fight, so high-tier arms are worth buying.
 *   • SKILL IS REAL. You FIRE (tap) between the serpent's telegraphed strikes and VEER (tap during the
 *     telegraph) to dodge them. An armed ship that fights well wins fast and clean; an armed ship that
 *     idles or ignores every telegraph loses its shields and is DRIVEN BACK (`outcome: 'lost'` — a
 *     costless rematch, the campaign is saved at the root). The deterministic gate verdict still rules
 *     what is POSSIBLE: below the breach gate the hide/last ward HOLDS by construction (the serpent can
 *     be ground to a sliver but never dropped), so the briefing's promise is never contradicted.
 *   • THE PATHS FIGHT DIFFERENT BATTLES. The WARDEN fights the wide-awake serpent itself — break its
 *     hide, dodge its lunges, then strike the bared EYE. The HERALD finds it BOUND and sleeping: shatter
 *     the three golden WARDS (the serpent visibly WAKES as each falls), dodge the Warden blockade's
 *     lances arriving to stop you, then strike the final SEAL on its brow and let it rise.
 *
 * FAIR BY CONSTRUCTION: the Skip button / reduced-motion (guarded at the call site) always resolve the
 * ARMED verdict cleanly (never a punishment). Self-contained (own mount/rAF/skip), everything
 * vector-drawn, zero sim rng. Keeps the `data-gs-storyfinale` overlay marker for the browser smoke.
 */

import { paintSerpent, type SerpentAnchors } from './sigilCeremony';
import {
  FINALE_ATTACK_PERIOD_MS,
  FINALE_TELEGRAPH_MS,
  type FinaleBattleTuning,
} from '../sim/rpg/storyFinale';

export type FinaleStrike = 'clean' | 'graze';
/** The battle's own result — the reducer clamps it under the gate verdict (a gate-lost ship can never
 *  battle-win; a gate-won ship that loses the fight is merely REPELLED and re-engages). */
export type BattleOutcome = 'won' | 'lost';
export interface StoryBattleHandle {
  destroy(): void;
}

const DW = 1000;
const DH = 600;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const MAX_CHARGES = 3;
const TELEGRAPH_MS = FINALE_TELEGRAPH_MS; // the incoming-strike warning window (tap in it to VEER)
const BASE_ATTACK_MS = FINALE_ATTACK_PERIOD_MS; // strike cadence at the start…
const ENRAGE_AFTER_MS = 18000; // …tightening past this point so a stalemate always resolves
const MIN_ATTACK_MS = 1500;
const HOPELESS_DEADLINE_MS = 30000; // under-gate ships are driven off by here regardless
const AUTO_DEADLINE_MS = 9000; // non-interactive: resolve the gate outcome briskly
const BOLT_SPEED = 1050; // px/s in design space

export function mountStoryBattle(opts: {
  /** The deterministic gate verdict — what is POSSIBLE. A gate-lost ship can never win the battle. */
  won: boolean;
  /** The live tuning derived from the arsenal (`finaleBattleTuning`) — the battle consumes it. */
  tuning: FinaleBattleTuning;
  interactive?: boolean;
  /** GS-story-battle-2: the HERALD fights a different battle — shatter the wards binding the sleeping
   *  serpent (it wakes as they fall) under the Warden blockade's lances, then strike the final seal. */
  herald?: boolean;
  onDone?: (strike: FinaleStrike, outcome: BattleOutcome) => void;
}): StoryBattleHandle {
  const won = opts.won;
  const interactive = opts.interactive !== false;
  const herald = opts.herald === true;
  const tuning = opts.tuning;

  // ── unit pools (whole hits, straight off the tuning — the briefing quotes the same numbers) ──
  const totalUnits = tuning.shotsToKill;
  // Herald: the pool is split across three binding WARDS (foremost-first). Warden: one serpent pool.
  const wardMax = herald
    ? [Math.ceil(totalUnits / 3), Math.ceil((totalUnits - Math.ceil(totalUnits / 3)) / 2), 0].map((n, i, a) =>
        i < 2 ? n : totalUnits - (a[0]! + a[1]!),
      )
    : [];
  const wardHp = [...wardMax];
  let serpentUnits = totalUnits;
  const unitsLeft = (): number => (herald ? wardHp.reduce((s, h) => s + h, 0) : serpentUnits);
  // Under the breach gate the last unit can never fall — the hide (or the last ward) HOLDS.
  const hpFloor = won ? 0 : 1;
  let shieldUnits = tuning.lungesToBreak;
  const shieldMax = tuning.lungesToBreak;
  let charges = MAX_CHARGES;
  let chargeAccum = 0;

  const overlay = document.createElement('div');
  overlay.setAttribute('data-gs-storyfinale', '1');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#03040a;overflow:hidden;cursor:pointer;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  overlay.appendChild(canvas);
  const skip = document.createElement('button');
  skip.textContent = 'Skip ▸';
  skip.style.cssText =
    'position:absolute;right:16px;bottom:16px;padding:8px 14px;border-radius:9px;border:1px solid #2a2f3a;' +
    'background:rgba(6,9,15,0.72);color:#cfd6e4;font:600 13px system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(2px);z-index:2;';
  overlay.appendChild(skip);
  document.body.appendChild(overlay);
  const ctx = canvas.getContext('2d');

  // ── battle state ─────────────────────────────────────────────────────────────
  type Phase = 'assault' | 'aim' | 'climax-win' | 'climax-lose';
  let phase: Phase = 'assault';
  let assaultStart = 0;
  let nextAttackAt = 0; // the next strike LANDS at this time; telegraph shows for TELEGRAPH_MS before it
  let dodged = false; // tapped during the current telegraph → this strike misses
  let dodgeAnim = 0; // 0..1 ship jink animation
  let strikeAnim = 0; // 0..1 incoming-strike streak animation
  let strikeWasDodged = false;
  let lungeFlash = 0;
  let struck = false;
  let strike: FinaleStrike = 'clean';
  let outcome: BattleOutcome = 'won';
  let climaxStart = 0;
  let aimStart = 0;
  let lashUntil = 0;
  let lastAutoFire = 0;
  type Bolt = { x: number; y: number; tx: number; ty: number; vx: number; vy: number };
  const bolts: Bolt[] = [];
  type Burst = { x: number; y: number; at: number; col: string; big: boolean };
  const bursts: Burst[] = [];
  let anchors: SerpentAnchors = { eyeX: 730, eyeY: 300, eyeR: 18, browX: 720, browY: 250, headH: 46, headAng: 3 };

  let raf = 0;
  let last = 0;
  let now0 = 0;
  let finished = false;
  let dpr = 1;
  let cssW = 0;
  let cssH = 0;
  let scale = 1;
  let offX = 0;
  let offY = 0;

  const SHIP = { x: 150, y: 430 };
  const SERPENT_CX = 1040; // body coils in from off-screen right; the head faces your ship
  const SERPENT_CY = 230;
  // The AIM/climax reveal HOLDS a posed frame (the undulation phase that seats the swollen head
  // mid-screen) — a live bob at reveal girth swings the head off-frame and makes the eye untargetable.
  const POSE_T = 1.5;
  const HIT_ZONE = 88;
  const CLEAN_ZONE = 26;
  const SWEEP_AMP = 220;
  const SWEEP_SPEED = 1.9;
  // The three binding wards (Herald) — golden rune-rings pinning the serpent's body.
  const WARD_POS = [
    { x: 700, y: 285 },
    { x: 845, y: 330 },
    { x: 975, y: 270 },
  ];

  function resize(): void {
    if (!ctx) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cssW = overlay.clientWidth || window.innerWidth;
    cssH = overlay.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    scale = Math.min(cssW / DW, cssH / DH);
    offX = (cssW - DW * scale) / 2;
    offY = (cssH - DH * scale) / 2;
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') skipToEnd();
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); }
  };
  function finish(): void {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', onKey);
    overlay.remove();
    opts.onDone?.(strike, outcome);
  }
  /** Skip / reduced-motion: resolve the ARMED outcome cleanly (never a punishment — the reducer still
   *  applies the gate verdict, so a gate-lost ship skips to its honest defeat recap). */
  function skipToEnd(): void {
    strike = 'clean';
    outcome = 'won';
    finish();
  }

  const inTelegraph = (): boolean => phase === 'assault' && nextAttackAt - now0 <= TELEGRAPH_MS && nextAttackAt > now0;
  const shipY = (): number => SHIP.y + Math.sin(now0 / 660) * 6 - dodgeAnim * 64;
  const attackPeriod = (): number => {
    const elapsed = now0 - assaultStart;
    return Math.max(MIN_ATTACK_MS, BASE_ATTACK_MS - Math.max(0, elapsed - ENRAGE_AFTER_MS) * 0.05);
  };
  const reticleX = (t: number, cx: number): number => cx + Math.sin(t * SWEEP_SPEED) * SWEEP_AMP;
  /** The Herald's final SEAL sits on the serpent's drawn brow. */
  const sealPos = (): { x: number; y: number; r: number } => ({
    x: anchors.browX - anchors.headH * 0.1,
    y: anchors.browY + anchors.headH * 0.15,
    r: anchors.headH * 0.55,
  });
  const aimTarget = (): { x: number; y: number } => (herald ? sealPos() : { x: anchors.eyeX, y: anchors.eyeY });

  /** FIRE at the current target: the foremost intact ward (Herald) or the serpent's fore-body (Warden). */
  function fire(): void {
    if (charges <= 0) return;
    charges -= 1;
    let tx: number;
    let ty: number;
    if (herald) {
      const i = wardHp.findIndex((h) => h > 0);
      const w = WARD_POS[Math.max(0, i)]!;
      tx = w.x;
      ty = w.y;
    } else {
      tx = anchors.browX + 20;
      ty = (anchors.browY + anchors.eyeY) / 2;
    }
    const sx = SHIP.x + 34;
    const sy = shipY();
    const d = Math.hypot(tx - sx, ty - sy) || 1;
    bolts.push({ x: sx, y: sy, tx, ty, vx: ((tx - sx) / d) * BOLT_SPEED, vy: ((ty - sy) / d) * BOLT_SPEED });
  }

  /** A tap VEERS during a telegraph, FIRES otherwise (assault), or STRIKES (aim). */
  function onTap(): void {
    if (finished || !interactive) return;
    if (phase === 'assault') {
      if (inTelegraph() && !dodged) {
        dodged = true;
        dodgeAnim = 1;
        return;
      }
      fire();
      return;
    }
    if (phase === 'aim' && !struck) {
      if (now0 < lashUntil) return;
      const t = now0 / 1000;
      const target = aimTarget();
      const dx = Math.abs(reticleX(t, target.x) - target.x);
      if (dx <= HIT_ZONE) {
        struck = true;
        strike = dx <= CLEAN_ZONE ? 'clean' : 'graze';
        phase = 'climax-win';
        outcome = 'won';
        climaxStart = now0;
      } else {
        lashUntil = now0 + 430;
      }
    }
  }
  skip.addEventListener('click', (e) => {
    e.stopPropagation();
    skipToEnd();
  });
  overlay.addEventListener('click', () => onTap());
  window.addEventListener('keydown', onKey);

  // ── drawing ──────────────────────────────────────────────────────────────────
  function drawSpace(flash: number): void {
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, DH);
    g.addColorStop(0, '#05060f');
    g.addColorStop(0.5, '#0a0716');
    g.addColorStop(1, '#04060e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, DW, DH);
    // a scatter of fixed stars (posHash-free — a static byte-stable pattern)
    ctx.fillStyle = 'rgba(210,225,255,0.5)';
    for (let i = 0; i < 40; i++) {
      const x = ((i * 173) % DW) + (i % 3);
      const y = ((i * 97) % DH) * 0.9;
      ctx.fillRect(x, y, i % 4 === 0 ? 2 : 1, i % 4 === 0 ? 2 : 1);
    }
    const haze = ctx.createRadialGradient(680, 290, 40, 680, 290, 540);
    haze.addColorStop(0, 'rgba(60,200,140,0.12)');
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, DW, DH);
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,120,80,${flash * 0.35})`;
      ctx.fillRect(0, 0, DW, DH);
    }
  }

  /** The mythic teaser serpent (GS-story-serpent), coiling in from off-screen right, head facing the ship.
   *  Returns/refreshes the drawn head anchors for the reticle, bolts and the Herald's seal. */
  function drawSerpent(t: number, wake: number, focus: number, dim: number): void {
    if (!ctx) return;
    if (dim > 0) ctx.globalAlpha = 1 - dim;
    // the reveal eases the live undulation into the held pose so the framed head stays on target
    const tPose = focus > 0 ? lerp(t, POSE_T + 0.06 * Math.sin(t * 0.9), Math.min(1, focus / 0.6)) : t;
    anchors = paintSerpent(ctx, SERPENT_CX, SERPENT_CY, tPose, wake, focus);
    ctx.globalAlpha = 1;
  }

  /** The Herald's serpent wakes as the wards fall — the battle's own reveal. */
  const heraldWake = (): number => 0.25 + 0.65 * (1 - unitsLeft() / totalUnits);

  function drawWard(i: number, t: number): void {
    if (!ctx) return;
    const hp = wardHp[i]!;
    if (hp <= 0) return;
    const w = WARD_POS[i]!;
    const frac = hp / wardMax[i]!;
    const r = 44;
    const pulse = 0.75 + 0.25 * Math.sin(t * 3 + i * 2);
    // ring + inner rune ticks
    ctx.strokeStyle = `rgba(255,214,110,${(0.5 + 0.4 * frac) * pulse})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(w.x, w.y, r, 0, 6.283);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let k = 0; k < 8; k++) {
      const a = t * 0.6 + i + (k * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(w.x + Math.cos(a) * (r - 9), w.y + Math.sin(a) * (r - 9));
      ctx.lineTo(w.x + Math.cos(a) * (r - 2), w.y + Math.sin(a) * (r - 2));
      ctx.stroke();
    }
    // binding chains up + down off the ring (the serpent is PINNED)
    ctx.strokeStyle = `rgba(255,214,110,${0.3 + 0.3 * frac})`;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.moveTo(w.x, w.y - r);
    ctx.lineTo(w.x + 14, 40);
    ctx.moveTo(w.x, w.y + r);
    ctx.lineTo(w.x - 14, DH - 30);
    ctx.stroke();
    ctx.setLineDash([]);
    // damage cracks as it weakens
    if (frac < 0.999) {
      ctx.strokeStyle = `rgba(255,240,200,${0.7 * (1 - frac)})`;
      ctx.lineWidth = 2;
      for (let k = 0; k < Math.ceil((1 - frac) * 4); k++) {
        const a = i * 2 + k * 1.7;
        ctx.beginPath();
        ctx.moveTo(w.x + Math.cos(a) * r * 0.2, w.y + Math.sin(a) * r * 0.2);
        ctx.lineTo(w.x + Math.cos(a + 0.5) * r * 0.9, w.y + Math.sin(a + 0.5) * r * 0.9);
        ctx.stroke();
      }
    }
  }

  function drawSeal(t: number, lash: boolean): void {
    if (!ctx) return;
    const s = sealPos();
    const pulse = 0.7 + 0.3 * Math.sin(t * 2.6);
    const glow = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, s.r * 1.8);
    glow.addColorStop(0, `rgba(255,224,130,${0.4 * pulse})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 1.8, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = lash ? 'rgba(255,120,80,0.95)' : `rgba(255,224,130,${0.85 * pulse})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, 6.283);
    ctx.stroke();
    // the ouroboros — a serpent ring biting its tail (a simple looped stroke + head wedge)
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 0.62, 0.5, 6.0);
    ctx.stroke();
    ctx.beginPath();
    const ha = 0.35;
    ctx.moveTo(s.x + Math.cos(ha) * s.r * 0.62, s.y + Math.sin(ha) * s.r * 0.62);
    ctx.lineTo(s.x + Math.cos(ha - 0.35) * s.r * 0.82, s.y + Math.sin(ha - 0.35) * s.r * 0.82);
    ctx.lineTo(s.x + Math.cos(ha - 0.5) * s.r * 0.5, s.y + Math.sin(ha - 0.5) * s.r * 0.5);
    ctx.stroke();
  }

  function drawShip(hitFlash: number): void {
    if (!ctx) return;
    const x = SHIP.x + Math.sin(now0 / 500) * 4 + dodgeAnim * 10;
    const y = shipY();
    if (shieldUnits > 0) {
      const sa = 0.12 + 0.2 * (shieldUnits / shieldMax) + hitFlash * 0.5;
      ctx.strokeStyle = `rgba(127,200,255,${sa})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 46, 0, 6.283);
      ctx.stroke();
      ctx.fillStyle = `rgba(127,200,255,${0.05 + hitFlash * 0.2})`;
      ctx.beginPath();
      ctx.arc(x, y, 46, 0, 6.283);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-dodgeAnim * 0.35); // bank into the veer
    ctx.fillStyle = 'rgba(127,216,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(-46 - dodgeAnim * 16, -5);
    ctx.lineTo(-58 - dodgeAnim * 20, 0);
    ctx.lineTo(-46 - dodgeAnim * 16, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#cfd8e6';
    ctx.beginPath();
    ctx.moveTo(34, 0);
    ctx.lineTo(-16, -13);
    ctx.lineTo(-24, 0);
    ctx.lineTo(-16, 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7fd0ff';
    ctx.beginPath();
    ctx.arc(6, 0, 5, 0, 6.283);
    ctx.fill();
    ctx.restore();
  }

  /** The incoming strike: the WARDEN dodges the serpent's whip-lunge; the HERALD dodges a blockade LANCE. */
  function drawIncoming(): void {
    if (!ctx) return;
    const until = nextAttackAt;
    const sy = strikeWasDodged ? shipY() + 90 : shipY();
    if (inTelegraph()) {
      const p = 1 - (until - now0) / TELEGRAPH_MS;
      if (herald) {
        // a gold targeting line converging from the blockade (upper-left, off-screen)
        ctx.strokeStyle = `rgba(255,214,110,${0.25 + p * 0.5})`;
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-40, 40);
        ctx.lineTo(SHIP.x, shipY());
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(255,214,110,${0.4 + p * 0.5})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(SHIP.x, shipY(), 60 - p * 14, 0, 6.283);
        ctx.stroke();
      } else {
        // the serpent's head rears + glares red down the strike line
        const g = ctx.createRadialGradient(anchors.eyeX, anchors.eyeY, 4, anchors.eyeX, anchors.eyeY, 90);
        g.addColorStop(0, `rgba(255,90,60,${0.3 + p * 0.45})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(anchors.eyeX - 100, anchors.eyeY - 100, 200, 200);
        ctx.strokeStyle = `rgba(255,90,60,${0.2 + p * 0.4})`;
        ctx.setLineDash([12, 10]);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(anchors.eyeX, anchors.eyeY);
        ctx.lineTo(SHIP.x, shipY());
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    if (strikeAnim > 0) {
      const p = 1 - strikeAnim; // 0 → 1 across the strike flash
      if (herald) {
        ctx.strokeStyle = `rgba(255,224,130,${strikeAnim * 0.9})`;
        ctx.lineWidth = 7 * strikeAnim + 2;
        ctx.beginPath();
        ctx.moveTo(-40, 40);
        ctx.lineTo(SHIP.x + 240 * p, sy + 90 * p);
        ctx.stroke();
      } else {
        // a whipping coil streak from the head through the ship's line
        ctx.strokeStyle = `rgba(140,230,170,${strikeAnim * 0.85})`;
        ctx.lineWidth = 12 * strikeAnim + 3;
        ctx.beginPath();
        ctx.moveTo(anchors.eyeX, anchors.eyeY);
        ctx.quadraticCurveTo((anchors.eyeX + SHIP.x) / 2, sy - 130, SHIP.x - 60 * p, sy);
        ctx.stroke();
      }
    }
  }

  function bar(x: number, y: number, w: number, frac: number, col: string, label: string): void {
    if (!ctx) return;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w * clamp01(frac), 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, 12);
  }

  /** Shields as discrete PIPS — each pip is one strike absorbed (the briefing's own number, visible). */
  function drawShieldPips(x: number, y: number): void {
    if (!ctx) return;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SHIELDS', x, y - 6);
    const pw = Math.max(6, Math.min(18, Math.floor(300 / shieldMax) - 3));
    for (let i = 0; i < shieldMax; i++) {
      ctx.fillStyle = i < shieldUnits ? '#7fc8ff' : 'rgba(120,130,150,0.25)';
      ctx.fillRect(x + i * (pw + 3), y, pw, 12);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + i * (pw + 3), y, pw, 12);
    }
  }

  function drawChargeMeter(): void {
    if (!ctx) return;
    const x = SHIP.x - 30;
    const y = SHIP.y + 70;
    for (let i = 0; i < MAX_CHARGES; i++) {
      const filled = i < charges;
      const partial = i === charges ? chargeAccum / tuning.rechargeMs : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x + i * 24, y, 20, 10);
      ctx.fillStyle = filled ? '#ffd24a' : partial > 0 ? `rgba(255,210,74,${0.3 + partial * 0.5})` : 'rgba(120,120,140,0.3)';
      ctx.fillRect(x + i * 24, y, 20 * (filled ? 1 : partial), 10);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.strokeRect(x + i * 24, y, 20, 10);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('WEAPON CHARGES', x, y - 4);
  }

  function caption(text: string, sub: string, a: number): void {
    if (!ctx) return;
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4ecd6';
    ctx.font = '800 40px Georgia, serif';
    ctx.fillText(text, DW / 2, DH - 120);
    if (sub) {
      ctx.fillStyle = '#c2ccda';
      ctx.font = '500 17px system-ui, sans-serif';
      ctx.fillText(sub, DW / 2, DH - 88);
    }
    ctx.globalAlpha = 1;
  }

  function prompt(text: string, col: string, t: number): void {
    if (!ctx) return;
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 4);
    ctx.fillStyle = col;
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, DW / 2, DH - 40);
    ctx.globalAlpha = 1;
  }

  // ── update ───────────────────────────────────────────────────────────────────
  function landHit(x: number, y: number): void {
    if (herald) {
      const i = wardHp.findIndex((h) => h > 0);
      if (i >= 0) {
        const before = wardHp[i]!;
        // the FINAL unit of the FINAL ward holds under the breach gate (the deterministic verdict)
        const isLastUnit = unitsLeft() <= hpFloor + 0;
        if (!(hpFloor > 0 && unitsLeft() <= hpFloor)) wardHp[i] = before - 1;
        if (isLastUnit && hpFloor > 0) bursts.push({ x, y, at: now0, col: 'rgba(255,214,110,0.9)', big: false });
        else bursts.push({ x, y, at: now0, col: 'rgba(255,224,130,0.95)', big: wardHp[i]! <= 0 });
      }
    } else {
      if (serpentUnits > hpFloor) serpentUnits -= 1;
      bursts.push({ x, y, at: now0, col: 'rgba(140,255,190,0.95)', big: false });
    }
  }

  function update(dt: number): void {
    if (charges < MAX_CHARGES) {
      chargeAccum += dt;
      if (chargeAccum >= tuning.rechargeMs) {
        charges += 1;
        chargeAccum = 0;
      }
    }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]!;
      b.x += b.vx * (dt / 1000);
      b.y += b.vy * (dt / 1000);
      const remaining = (b.tx - b.x) * b.vx + (b.ty - b.y) * b.vy; // >0 while short of the target
      if (remaining <= 0 || b.x > DW + 40) {
        landHit(b.tx, b.ty);
        bolts.splice(i, 1);
      }
    }
    dodgeAnim = Math.max(0, dodgeAnim - dt / 420);
    strikeAnim = Math.max(0, strikeAnim - dt / 260);
    lungeFlash = Math.max(0, lungeFlash - dt / 300);

    if (phase !== 'assault') return;

    // non-interactive: the ship fights itself (steady fire, no dodging)
    if (!interactive && now0 - lastAutoFire > 420) {
      lastAutoFire = now0;
      fire();
    }

    // the strike lands (or is dodged)
    if (now0 >= nextAttackAt) {
      strikeAnim = 1;
      strikeWasDodged = dodged;
      if (!dodged) {
        shieldUnits = Math.max(0, shieldUnits - 1);
        lungeFlash = 1;
      }
      dodged = false;
      nextAttackAt = now0 + attackPeriod();
    }

    const elapsed = now0 - assaultStart;
    if (unitsLeft() <= 0) {
      phase = 'aim';
      aimStart = now0;
    } else if (shieldUnits <= 0) {
      phase = 'climax-lose';
      outcome = 'lost';
      climaxStart = now0;
    } else if (!interactive && elapsed > AUTO_DEADLINE_MS) {
      // non-interactive: force the deterministic gate outcome briskly
      if (won) {
        serpentUnits = 0;
        wardHp.fill(0);
        phase = 'aim';
        aimStart = now0;
      } else {
        shieldUnits = 0;
        phase = 'climax-lose';
        outcome = 'lost';
        climaxStart = now0;
      }
    } else if (!won && elapsed > HOPELESS_DEADLINE_MS) {
      // an under-gate ship is always driven off by here (the hide/last ward HOLDS by construction)
      shieldUnits = 0;
      phase = 'climax-lose';
      outcome = 'lost';
      climaxStart = now0;
    }
  }

  function frame(nowMs: number): void {
    if (finished || !ctx) return;
    if (!now0) {
      now0 = nowMs;
      last = nowMs;
      assaultStart = nowMs;
      nextAttackAt = nowMs + BASE_ATTACK_MS;
    }
    const dt = Math.min(64, nowMs - last);
    last = nowMs;
    now0 = nowMs;
    const t = (nowMs - assaultStart) / 1000 + 1;

    update(dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    if (phase === 'assault') {
      drawSpace(lungeFlash * 0.5);
      // WARDEN: the serpent is wide awake and fighting. HERALD: it wakes as the wards fall.
      drawSerpent(t, herald ? heraldWake() : 1, 0, 0);
      if (herald) for (let i = 0; i < 3; i++) drawWard(i, t);
      drawIncoming();
      for (const b of bolts) {
        const a = Math.atan2(b.vy, b.vx);
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(a);
        ctx.fillStyle = '#ffe08a';
        ctx.fillRect(-14, -2.5, 16, 5);
        ctx.fillStyle = 'rgba(255,180,80,0.5)';
        ctx.fillRect(-26, -1.5, 14, 3);
        ctx.restore();
      }
      // impact bursts
      for (let i = bursts.length - 1; i >= 0; i--) {
        const bu = bursts[i]!;
        const age = (now0 - bu.at) / (bu.big ? 700 : 380);
        if (age >= 1) {
          bursts.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = bu.col;
        ctx.globalAlpha = 1 - age;
        ctx.lineWidth = bu.big ? 4 : 2.5;
        const r = (bu.big ? 90 : 34) * age + 6;
        ctx.beginPath();
        ctx.arc(bu.x, bu.y, r, 0, 6.283);
        ctx.stroke();
        for (let k = 0; k < (bu.big ? 8 : 5); k++) {
          const a = k * 1.3 + (bu.big ? 0.6 : 0);
          ctx.beginPath();
          ctx.moveTo(bu.x + Math.cos(a) * r * 0.5, bu.y + Math.sin(a) * r * 0.5);
          ctx.lineTo(bu.x + Math.cos(a) * (r + 12), bu.y + Math.sin(a) * (r + 12));
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      drawShip(lungeFlash);
      const frac = unitsLeft() / totalUnits;
      bar(560, 40, 380, frac, herald ? '#ffd66e' : '#8fe0a0', herald ? 'THE WARDS' : 'JÖRMUNGANDR');
      // under-gate: the last sliver visibly HOLDS — the honest "not enough gun" read
      if (!won && unitsLeft() <= hpFloor && ctx) {
        ctx.fillStyle = '#ff9a6a';
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(herald ? 'the last ward HOLDS — not enough gun' : 'its hide HOLDS — not enough gun', 940, 72);
      }
      drawShieldPips(60, 40);
      drawChargeMeter();
      if (interactive) {
        if (inTelegraph() && !dodged) prompt('⚠ INCOMING — TAP TO VEER', '#ff9a6a', t * 1.6);
        else if (charges > 0) prompt('⚡ TAP TO FIRE', '#ffe6a0', t);
        else prompt('recharging…', '#ffe6a0', t);
      }
    } else if (phase === 'aim') {
      drawSpace(0);
      // the REVEAL: the camera pushes to the head exactly like the fifth-Sigil teaser (focusHead ramps)
      const focus = clamp01((now0 - aimStart) / 1400) * 0.95;
      drawSerpent(t, 1, focus, 0);
      const lash = now0 < lashUntil;
      if (herald) drawSeal(t, lash);
      const target = aimTarget();
      const rx = reticleX(now0 / 1000, target.x);
      const ry = target.y;
      ctx.strokeStyle = lash ? 'rgba(255,90,60,0.9)' : 'rgba(255,240,160,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(rx, ry, 26, 0, 6.283);
      ctx.moveTo(rx - 36, ry);
      ctx.lineTo(rx + 36, ry);
      ctx.moveTo(rx, ry - 36);
      ctx.lineTo(rx, ry + 36);
      ctx.stroke();
      drawShip(0);
      if (interactive) {
        prompt(lash ? 'it lashes — steady…' : herald ? '🎯 TAP TO STRIKE THE SEAL' : '🎯 TAP TO STRIKE THE EYE', '#ffe6a0', t * 1.25);
      } else if (now0 - aimStart > 1400) {
        // the auto pilot takes the shot
        struck = true;
        strike = 'clean';
        phase = 'climax-win';
        outcome = 'won';
        climaxStart = now0;
      }
    } else if (phase === 'climax-win') {
      const e = nowMs - climaxStart;
      const ballT = clamp01(e / 380); // the golf ball streaks home first
      const p = clamp01((e - 380) / 1600);
      drawSpace(0);
      if (herald) {
        // the seal breaks — the serpent RISES, maw agape, and the stars begin to go out
        drawSerpent(t, 1, 0.95, 0);
        const s = sealPos();
        if (ballT < 1) {
          drawSeal(t, false); // the target holds while the ball flies
          const bx = lerp(SHIP.x + 34, s.x, ballT);
          const by = lerp(shipY(), s.y, ballT) - Math.sin(ballT * Math.PI) * 90;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(bx, by, 7, 0, 6.283);
          ctx.fill();
        } else {
          // gold shards + an expanding green shock ring; a darkness closes in from the edges
          ctx.strokeStyle = `rgba(255,224,130,${(1 - p) * 0.9})`;
          ctx.lineWidth = 3;
          for (let k = 0; k < 10; k++) {
            const a = k * 0.63;
            const rr = 20 + p * 260;
            ctx.beginPath();
            ctx.moveTo(s.x + Math.cos(a) * rr * 0.5, s.y + Math.sin(a) * rr * 0.5);
            ctx.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr);
            ctx.stroke();
          }
          ctx.strokeStyle = `rgba(120,255,180,${(1 - p) * 0.7})`;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 30 + p * 700, 0, 6.283);
          ctx.stroke();
          const vg = ctx.createRadialGradient(DW / 2, DH / 2, 200, DW / 2, DH / 2, 640);
          vg.addColorStop(0, 'rgba(0,0,0,0)');
          vg.addColorStop(1, `rgba(0,4,2,${p * 0.9})`);
          ctx.fillStyle = vg;
          ctx.fillRect(0, 0, DW, DH);
          caption(
            strike === 'clean' ? 'The seal breaks clean.' : 'A clipping blow — enough.',
            'The last ward falls — the serpent uncoils, and the galaxy goes still.',
            p,
          );
        }
      } else {
        drawSerpent(t, 1, 0.95, ballT < 1 ? 0 : p);
        if (ballT < 1) {
          const bx = lerp(SHIP.x + 34, anchors.eyeX, ballT);
          const by = lerp(shipY(), anchors.eyeY, ballT) - Math.sin(ballT * Math.PI) * 90;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(bx, by, 7, 0, 6.283);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - Math.abs(p - 0.25) / 0.25) * 0.8})`;
          ctx.fillRect(0, 0, DW, DH);
          // green motes scatter as it comes apart
          ctx.fillStyle = `rgba(140,255,190,${(1 - p) * 0.8})`;
          for (let k = 0; k < 26; k++) {
            const a = k * 0.97;
            const rr = p * (140 + (k % 5) * 60);
            ctx.beginPath();
            ctx.arc(anchors.eyeX + Math.cos(a) * rr, anchors.eyeY + Math.sin(a) * rr, 3, 0, 6.283);
            ctx.fill();
          }
          caption(
            strike === 'clean' ? 'A perfect strike.' : 'A clipping blow — enough.',
            'The serpent comes apart across the sky.',
            p,
          );
        }
      }
      if (e > 2200) {
        finish();
        return;
      }
    } else {
      // climax-lose — a gate-loss is OVERWHELMED (arm up); an armed loss is DRIVEN BACK (re-engage).
      const e = nowMs - climaxStart;
      const p = clamp01(e / 1600);
      drawSpace((1 - p) * 0.6);
      drawSerpent(t, herald ? heraldWake() : 1, 0, 0);
      drawShip(0);
      const repelled = won; // an armed ship that lost the fight was merely repelled
      caption(
        repelled ? 'Driven back.' : 'Overwhelmed.',
        repelled
          ? herald
            ? 'The blockade holds you off — this once. Re-engage and finish the rite.'
            : 'Your ship holds together — barely. Catch your breath and strike again.'
          : herald
            ? 'The Wardens drive you back — but the root will keep. Arm up and return.'
            : 'You pull back into the dark — but the campaign is saved. Arm up and return.',
        p,
      );
      if (e > 1800) {
        finish();
        return;
      }
    }

    ctx.restore();
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  if (!ctx) {
    skipToEnd();
    return { destroy: finish };
  }
  raf = requestAnimationFrame(frame);
  return { destroy: finish };
}
