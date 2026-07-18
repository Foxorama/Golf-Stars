/**
 * The two-stage FINALE BATTLE (GS-story-battle) — Canvas2D, render-only, the interactive Jörmungandr fight
 * that SPENDS the arsenal you built. Replaces the old mostly-timed finale cinematic with a real two-stage
 * engagement:
 *
 *   STAGE 1 — ASSAULT. You FIRE at the serpent (tap / click / space). Your weapon has a MAGAZINE of charges
 *     that RECHARGE over time (so you never wait on a fuel tanker mid-fight); each shot deals damage scaled
 *     by your WEAPON rating. The serpent lunges on a telegraph and drains your SHIELDS (scaled by your
 *     ENGINE+SHIELD rating). Drop the serpent's health to zero → Stage 2. Lose your shields first → defeat.
 *   STAGE 2 — FINAL STRIKE. The softened serpent bares its eye; a reticle sweeps its head; TAP to strike the
 *     golf ball home. Accuracy sets the ending quality (clean / graze); a miss makes it lash and you re-sweep.
 *
 * FAIR BY CONSTRUCTION (the finisher philosophy): whether you CAN win is still the deterministic arm-up
 * verdict (`won`, the two gates) — a breach-gated ship's shots bite deep and drop the serpent before its
 * coils grind your shields down; an under-armed ship's shots barely scratch (firepower) or its shields fail
 * first (defence). So an armed player always wins the assault (even passively — a deadline forces the armed
 * outcome), and an under-armed one always loses, no matter how they tap — skill sets the FEEL, not the
 * result. The Skip button / reduced-motion (guarded at the call site) resolve a clean armed win.
 *
 * Self-contained (own mount/rAF/skip, the `storyFinale.ts` pattern), everything vector-drawn. Keeps the
 * `data-gs-storyfinale` overlay marker so the existing finale browser smoke still finds it. Zero sim rng.
 */

export type FinaleStrike = 'clean' | 'graze';
export interface StoryBattleHandle {
  destroy(): void;
}

const DW = 1000;
const DH = 600;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Weapon magazine: charges + recharge (the "no fuel-tanker mid-fight" answer). */
const MAX_CHARGES = 3;
const RECHARGE_MS = 850; // one charge back per this
const SERPENT_HP = 100;
const SHIELD_HP = 100;
const ATTACK_PERIOD_MS = 2200; // the serpent lunges this often
const BATTLE_DEADLINE_MS = 22000; // safety: force the armed outcome if the player never fires

export function mountStoryBattle(opts: {
  won: boolean;
  weaponRating: number;
  defenceRating: number;
  interactive?: boolean;
  onDone?: (strike: FinaleStrike) => void;
}): StoryBattleHandle {
  const won = opts.won;
  const interactive = opts.interactive !== false;

  // Damage tuning from the gates. A breach-gated ship kills in ~8 hits; an under-weaponed one barely dents.
  const perShot = won || opts.weaponRating >= 26 ? SERPENT_HP / 7.5 : SERPENT_HP / 42;
  // Shield drain per lunge. A survive-gated ship weathers the assault; an under-shielded one fails fast.
  const survivedGate = won || opts.defenceRating >= 30;
  const perLunge = survivedGate ? SHIELD_HP / 10 : SHIELD_HP / 3.2;

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
  let serpentHp = SERPENT_HP;
  let shieldHp = SHIELD_HP;
  let charges = MAX_CHARGES;
  let chargeAccum = 0;
  let assaultStart = 0;
  let lastLunge = 0;
  let lungeFlash = 0; // 0..1 telegraph→hit flash
  let struck = false;
  let strike: FinaleStrike = 'clean';
  let climaxStart = 0;
  let lashUntil = 0;
  type Bolt = { x: number; y: number; vx: number };
  const bolts: Bolt[] = [];

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
  const EYE_X = 780;
  const HIT_ZONE = 88;
  const CLEAN_ZONE = 26;
  const SWEEP_AMP = 220;
  const SWEEP_SPEED = 1.9;

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
    opts.onDone?.(strike);
  }
  /** Skip / reduced-motion: resolve the ARMED outcome cleanly (never a punishment). */
  function skipToEnd(): void {
    strike = 'clean';
    finish();
  }

  const eyeY = (t: number): number => 300 + Math.sin(t * 1.4) * 30;
  const reticleX = (t: number): number => EYE_X + Math.sin(t * SWEEP_SPEED) * SWEEP_AMP;

  /** A tap FIRES in the assault (spends a charge) or STRIKES in the aim phase. */
  function onTap(): void {
    if (finished || !interactive) return;
    if (phase === 'assault') {
      if (charges <= 0) return;
      charges -= 1;
      bolts.push({ x: SHIP.x + 34, y: SHIP.y, vx: 900 });
      return;
    }
    if (phase === 'aim' && !struck) {
      const nowMs = now0;
      if (nowMs < lashUntil) return;
      const t = nowMs / 1000;
      const dx = Math.abs(reticleX(t) - EYE_X);
      if (dx <= HIT_ZONE) {
        struck = true;
        strike = dx <= CLEAN_ZONE ? 'clean' : 'graze';
        phase = 'climax-win';
        climaxStart = nowMs;
      } else {
        lashUntil = nowMs + 430;
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
    const haze = ctx.createRadialGradient(640, 300, 40, 640, 300, 520);
    haze.addColorStop(0, 'rgba(60,200,140,0.12)');
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, DW, DH);
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,120,80,${flash * 0.35})`;
      ctx.fillRect(0, 0, DW, DH);
    }
  }

  function drawSerpent(t: number, hurt: number, dim: number): void {
    if (!ctx) return;
    ctx.globalAlpha = 1 - dim;
    const cx = 720;
    const baseY = 300;
    const segs = 26;
    for (let i = segs; i >= 0; i--) {
      const u = i / segs;
      const x = cx - 300 + u * 380 + Math.sin(u * 5 + t) * 30;
      const y = baseY + Math.sin(u * 6 + t * 1.3) * 80 * (0.4 + u * 0.7);
      const r = lerp(9, 40, u);
      const corr = 0.5 + 0.5 * Math.sin(t * 2.4 + u * 5);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
      g.addColorStop(0, `rgba(${36 + corr * 40},${84 + corr * 90},${60 + corr * 30},1)`);
      g.addColorStop(1, `rgba(8,${22 + corr * 18},18,1)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.fill();
      if (hurt > 0 && i % 3 === 0) {
        ctx.fillStyle = `rgba(255,140,60,${hurt * (0.3 + corr * 0.4)})`;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.5, 0, 6.283);
        ctx.fill();
      }
    }
    // head + eye at (EYE_X, eyeY)
    const hx = EYE_X;
    const hy = eyeY(t);
    const hr = 46;
    const hg = ctx.createRadialGradient(hx - hr * 0.3, hy - hr * 0.3, hr * 0.2, hx, hy, hr);
    hg.addColorStop(0, `rgba(50,${120 + hurt * 40},84,1)`);
    hg.addColorStop(1, 'rgba(8,26,20,1)');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = 'rgba(210,255,225,0.95)';
    ctx.beginPath();
    ctx.arc(hx, hy, hr * 0.5, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = `rgba(255,140,60,${0.7 + 0.3 * Math.sin(t * 6)})`;
    ctx.beginPath();
    ctx.ellipse(hx, hy, hr * 0.1, hr * 0.42, 0, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawShip(t: number, hitFlash: number): void {
    if (!ctx) return;
    const x = SHIP.x + Math.sin(t * 2) * 4;
    const y = SHIP.y + Math.sin(t * 1.5) * 6;
    // shield bubble
    if (shieldHp > 0) {
      const sa = 0.12 + 0.2 * (shieldHp / SHIELD_HP) + hitFlash * 0.5;
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
    // ion flame
    ctx.fillStyle = 'rgba(127,216,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(-46, -5);
    ctx.lineTo(-58, 0);
    ctx.lineTo(-46, 5);
    ctx.closePath();
    ctx.fill();
    // hull
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

  function drawChargeMeter(): void {
    if (!ctx) return;
    const x = SHIP.x - 30;
    const y = SHIP.y + 70;
    for (let i = 0; i < MAX_CHARGES; i++) {
      const filled = i < charges;
      const partial = i === charges ? chargeAccum / RECHARGE_MS : 0;
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

  // ── update ───────────────────────────────────────────────────────────────────
  function update(dt: number): void {
    // recharge weapon
    if (charges < MAX_CHARGES) {
      chargeAccum += dt;
      if (chargeAccum >= RECHARGE_MS) {
        charges += 1;
        chargeAccum = 0;
      }
    }
    // move bolts, apply damage
    for (const b of bolts) b.x += b.vx * (dt / 1000);
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]!;
      if (b.x >= EYE_X - 30) {
        // hit the serpent
        serpentHp = Math.max(0, serpentHp - perShot);
        bolts.splice(i, 1);
      } else if (b.x > DW) bolts.splice(i, 1);
    }
    // serpent lunges → drain shields
    if (phase === 'assault') {
      if (now0 - lastLunge > ATTACK_PERIOD_MS) {
        lastLunge = now0;
        lungeFlash = 1;
        shieldHp = Math.max(0, shieldHp - perLunge);
      }
      lungeFlash = Math.max(0, lungeFlash - dt / 300);

      const elapsed = now0 - assaultStart;
      // Resolve: serpent down → Stage 2; shields down → defeat. Deadline forces the ARMED outcome.
      if (serpentHp <= 0) {
        phase = 'aim';
      } else if (shieldHp <= 0) {
        phase = 'climax-lose';
        climaxStart = now0;
      } else if (elapsed > BATTLE_DEADLINE_MS) {
        if (won) {
          serpentHp = 0;
          phase = 'aim';
        } else {
          shieldHp = 0;
          phase = 'climax-lose';
          climaxStart = now0;
        }
      }
    }
  }

  function frame(nowMs: number): void {
    if (finished || !ctx) return;
    if (!now0) {
      now0 = nowMs;
      last = nowMs;
      assaultStart = nowMs;
      lastLunge = nowMs;
    }
    const dt = Math.min(64, nowMs - last);
    last = nowMs;
    now0 = nowMs;
    const t = (nowMs - assaultStart) / 1000 + 1;

    if (phase === 'assault') update(dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    if (phase === 'assault') {
      drawSpace(lungeFlash * (survivedGate ? 0.4 : 0.8));
      drawSerpent(t, 1 - serpentHp / SERPENT_HP, 0);
      // bolts
      for (const b of bolts) {
        ctx.fillStyle = '#ffe08a';
        ctx.fillRect(b.x - 14, b.y - 2.5, 16, 5);
        ctx.fillStyle = 'rgba(255,180,80,0.5)';
        ctx.fillRect(b.x - 26, b.y - 1.5, 14, 3);
      }
      drawShip(t, lungeFlash);
      // HUD
      bar(560, 40, 380, serpentHp / SERPENT_HP, '#8fe0a0', 'JÖRMUNGANDR');
      bar(60, 40, 300, shieldHp / SHIELD_HP, '#7fc8ff', 'SHIELDS');
      drawChargeMeter();
      caption('', '', 0);
      // prompt
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4);
      ctx.fillStyle = '#ffe6a0';
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(charges > 0 ? '⚡ TAP TO FIRE' : 'recharging…', DW / 2, DH - 40);
      ctx.globalAlpha = 1;
    } else if (phase === 'aim') {
      drawSpace(0);
      drawSerpent(t, 1, 0);
      // reticle
      const rx = reticleX((nowMs) / 1000);
      const ry = eyeY(t);
      const lash = nowMs < lashUntil;
      ctx.strokeStyle = lash ? 'rgba(255,90,60,0.9)' : 'rgba(255,240,160,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(rx, ry, 26, 0, 6.283);
      ctx.moveTo(rx - 36, ry);
      ctx.lineTo(rx + 36, ry);
      ctx.moveTo(rx, ry - 36);
      ctx.lineTo(rx, ry + 36);
      ctx.stroke();
      drawShip(t, 0);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
      ctx.fillStyle = '#ffe6a0';
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lash ? 'it lashes — steady…' : '🎯 TAP TO STRIKE THE EYE', DW / 2, DH - 40);
      ctx.globalAlpha = 1;
    } else if (phase === 'climax-win') {
      const e = nowMs - climaxStart;
      const p = clamp01(e / 1600);
      drawSpace(0);
      drawSerpent(t, 1, p);
      // white nova
      ctx.fillStyle = `rgba(255,255,255,${(1 - Math.abs(p - 0.3) / 0.3) * 0.8})`;
      ctx.fillRect(0, 0, DW, DH);
      caption(strike === 'clean' ? 'A perfect strike.' : 'A clipping blow — enough.', 'The serpent comes apart across the sky.', p);
      if (e > 1700) {
        finish();
        return;
      }
    } else {
      // climax-lose
      const e = nowMs - climaxStart;
      const p = clamp01(e / 1600);
      drawSpace((1 - p) * 0.6);
      drawSerpent(t, 0.3, 0);
      // a coil sweeps the ship back
      drawShip(t, 0);
      caption('Overwhelmed.', 'You pull back into the dark — but the campaign is saved. Arm up and return.', p);
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
