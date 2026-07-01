import { sfx } from './audio';
import { getSettings } from '../settings';
import { ACE_CREDIT_BONUS } from '../sim/rpg/economy';
import { HAPTICS, haptic } from './haptics';

// Full-screen, cosmetic, assetless Canvas2D celebration overlays for the biggest hole-out beats: the
// hole-in-one takeover (GS-ace) and the eagle/albatross fly-over (GS-bird). Pure side-effects (no
// reducer/save touch, determinism untouched); each mounts a fixed overlay, runs a seeded rAF show, then
// tears down and calls onDismiss. Extracted from app.ts to keep that god-file lean (see CLAUDE.md).
/**
 * The hole-in-one celebration (GS-ace) — a full-screen takeover for the rarest, biggest moment in the
 * game. A cosmetic, assetless side-effect (like the loading intro + the play-view canvas): it mounts a
 * fixed overlay with a Canvas2D fireworks/confetti show, a huge "HOLE IN ONE!" headline, the reward it
 * earned, and a Continue button — then tears itself down and runs `onDismiss` (→ the normal end-of-hole
 * screen). Degrades safely: reduced-motion skips the rAF loop (a static burst), and the whole thing is
 * guarded so a cosmetic glitch can never strand the player on the hole.
 */
export function showAceCelebration(
  info: { holeNo: number; total: number; par: number; club?: string; aceNo: number },
  onDismiss: () => void,
): void {
  try {
    sfx.ace();
    haptic(HAPTICS.ace);
  } catch {
    /* feel-only — never throw */
  }
  const reduced = getSettings().reducedMotion;
  const overlay = document.createElement('div');
  overlay.className = 'gs-ace';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Hole in one');

  let done = false;
  const cleanup = (): void => {
    if (done) return;
    done = true;
    const h = (canvas as unknown as { _raf?: number } | null)?._raf;
    if (h) cancelAnimationFrame(h);
    overlay.removeEventListener('click', onTap);
    window.removeEventListener('keydown', onKey);
    overlay.remove(); // detaches the canvas → the fireworks loop self-stops on the next frame
    try {
      onDismiss();
    } catch {
      /* the caller's render() guards itself */
    }
  };
  const onTap = (e: MouseEvent): void => {
    // Any tap on the backdrop (but not a drag-select) dismisses — the button does too.
    e.preventDefault();
    cleanup();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') cleanup();
  };

  const rewardLine = (icon: string, label: string, detail: string): string =>
    `<div class="gs-ace-reward"><span>${icon}</span><div><b>${label}</b><i>${detail}</i></div></div>`;
  const rewardLines = [
    rewardLine('💰', `+${ACE_CREDIT_BONUS} credits`, 'spend them at the next Pro Shop'),
    rewardLine('🎯', "Ace's Touch", '+8% precision for the rest of the run · stacks'),
    rewardLine('⛳', `Lifetime ace #${info.aceNo}`, 'a permanent record'),
  ].join('');

  overlay.innerHTML = `
    <canvas class="gs-ace-fx" aria-hidden="true"></canvas>
    <div class="gs-ace-card">
      <div class="gs-ace-emoji" aria-hidden="true">⛳</div>
      <div class="gs-ace-kicker">HOLE ${info.holeNo} · PAR ${info.par}</div>
      <h1 class="gs-ace-title">HOLE IN ONE!</h1>
      <div class="gs-ace-sub">Aced it${info.club ? ` with the ${info.club}` : ''} 🎉</div>
      <div class="gs-ace-rewards">${rewardLines}</div>
      <button class="gs-btn gs-btn--primary gs-ace-go" data-ace-continue="1">Continue →</button>
    </div>`;
  document.body.appendChild(overlay);

  // The Continue button (and any backdrop tap / key) dismisses.
  const goBtn = overlay.querySelector<HTMLButtonElement>('.gs-ace-go');
  goBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    cleanup();
  });
  overlay.addEventListener('click', onTap);
  window.addEventListener('keydown', onKey);

  // Fireworks + confetti on the canvas (skipped under reduced-motion — the card alone carries it).
  const canvas = overlay.querySelector<HTMLCanvasElement>('.gs-ace-fx');
  if (canvas && !reduced) {
    try {
      runAceFireworks(canvas, info.holeNo);
    } catch {
      /* a canvas fault must not strand the celebration */
    }
  }

  // A long auto-dismiss safety net so the player is never stuck if they look away (well past the show).
  window.setTimeout(() => cleanup(), reduced ? 4200 : 9000);
}

/** Deterministic, assetless fireworks + confetti for the ace overlay. Seeded so it's stable across
 *  reloads (no Math.random); particles are capped and the loop self-cancels on overlay teardown. */
function runAceFireworks(canvas: HTMLCanvasElement, seed: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = (): void => {
    canvas.width = Math.round((window.innerWidth || 400) * dpr);
    canvas.height = Math.round((window.innerHeight || 800) * dpr);
  };
  resize();
  // mulberry32 — the house seeded rng (Math.random is banned for reproducible feel).
  let s = (seed * 0x9e3779b1 + 0x6d2b79f5) >>> 0;
  const rnd = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const W = (): number => canvas.width;
  const H = (): number => canvas.height;
  const COLS = ['#ffd54a', '#5fd45a', '#4fd0e0', '#ff6bd0', '#ff8a3c', '#ffffff'];
  type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; r: number; conf: boolean };
  const parts: P[] = [];
  const burstAt = (x: number, y: number): void => {
    const col = COLS[Math.floor(rnd() * COLS.length)]!;
    const n = 26 + Math.floor(rnd() * 16);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
      const sp = (1.6 + rnd() * 2.6) * dpr;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 52 + rnd() * 34, col: rnd() < 0.25 ? '#ffffff' : col, r: (1.6 + rnd() * 2.2) * dpr, conf: false });
    }
  };
  const confetti = (): void => {
    const x = rnd() * W();
    parts.push({ x, y: -10 * dpr, vx: (rnd() - 0.5) * 1.2 * dpr, vy: (1.2 + rnd() * 1.6) * dpr, life: 0, max: 150 + rnd() * 80, col: COLS[Math.floor(rnd() * COLS.length)]!, r: (2 + rnd() * 2.4) * dpr, conf: true });
  };
  let frame = 0;
  const grav = 0.045 * dpr;
  const tick = (): void => {
    // The overlay was torn down (Continue / tap / safety timeout) → stop the loop, never draw into a
    // detached canvas (the orphaned-rAF hazard the codebase warns about).
    if (!canvas.isConnected) return;
    frame++;
    // Launch a few bursts early, then keep a gentle confetti rain going.
    if (frame < 90 && frame % 12 === 0) burstAt((0.2 + rnd() * 0.6) * W(), (0.2 + rnd() * 0.4) * H());
    if (frame % 4 === 0 && parts.length < 360) confetti();
    ctx.clearRect(0, 0, W(), H());
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]!;
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += grav;
      if (!p.conf) p.vx *= 0.985;
      const k = 1 - p.life / p.max;
      if (k <= 0 || p.y > H() + 20 * dpr) {
        parts.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.4));
      ctx.fillStyle = p.col;
      if (p.conf) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 0.2 + p.x);
        ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    (canvas as unknown as { _raf?: number })._raf = requestAnimationFrame(tick);
  };
  (canvas as unknown as { _raf?: number })._raf = requestAnimationFrame(tick);
}

/** Per-kind look + copy for the eagle/albatross fly-over celebration. Eagle = a silver space eagle
 *  screaming overhead; albatross = a vast, glowing cosmic albatross gliding across the stars. */
const BIRD_CEL: Record<'eagle' | 'albatross', {
  emoji: string; title: string; kicker: (par: number) => string; sub: (club?: string) => string;
  aria: string; sound: () => void; haptic: number[];
}> = {
  eagle: {
    emoji: '🦅',
    title: 'EAGLE!',
    kicker: (par) => `TWO UNDER · PAR ${par}`,
    sub: (club) => `A silver space eagle screams overhead${club ? ` · sealed with the ${club}` : ''}`,
    aria: 'Eagle',
    sound: () => sfx.eagle(),
    haptic: HAPTICS.eagle,
  },
  albatross: {
    emoji: '🕊️',
    title: 'ALBATROSS!',
    kicker: (par) => `THREE UNDER · PAR ${par}`,
    sub: (club) => `The cosmic albatross glides across the void${club ? ` · ${club} for the ages` : ''}`,
    aria: 'Albatross',
    sound: () => sfx.albatross(),
    haptic: HAPTICS.albatross,
  },
};

/**
 * Eagle / albatross celebration (GS-bird) — a full-screen fly-over for a holed −2 / −3 that isn't an
 * ace (the ace keeps its own grander takeover). A cosmetic, assetless side-effect mirroring
 * `showAceCelebration`: a Canvas2D bird soars across the sky behind a headline card, then it tears
 * itself down and runs `onDismiss` (→ the normal end-of-hole screen). No reward, no save/reducer
 * touch — purely feel, so determinism is untouched. Reduced-motion skips the rAF (a static card),
 * and the whole thing is guarded so a glitch can never strand the player on the hole.
 */
export function showBirdCelebration(
  kind: 'eagle' | 'albatross',
  info: { holeNo: number; par: number; club?: string },
  onDismiss: () => void,
): void {
  const look = BIRD_CEL[kind];
  try {
    look.sound();
    haptic(look.haptic);
  } catch {
    /* feel-only — never throw */
  }
  const reduced = getSettings().reducedMotion;
  const overlay = document.createElement('div');
  overlay.className = `gs-bird gs-bird--${kind}`;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', look.aria);

  let done = false;
  const cleanup = (): void => {
    if (done) return;
    done = true;
    const h = (canvas as unknown as { _raf?: number } | null)?._raf;
    if (h) cancelAnimationFrame(h);
    overlay.removeEventListener('click', onTap);
    window.removeEventListener('keydown', onKey);
    overlay.remove(); // detaches the canvas → the flight loop self-stops on the next frame
    try {
      onDismiss();
    } catch {
      /* the caller's render() guards itself */
    }
  };
  const onTap = (e: MouseEvent): void => {
    e.preventDefault();
    cleanup();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') cleanup();
  };

  overlay.innerHTML = `
    <canvas class="gs-bird-fx" aria-hidden="true"></canvas>
    <div class="gs-bird-card">
      <div class="gs-bird-emoji" aria-hidden="true">${look.emoji}</div>
      <div class="gs-bird-kicker">HOLE ${info.holeNo} · ${look.kicker(info.par)}</div>
      <h1 class="gs-bird-title">${look.title}</h1>
      <div class="gs-bird-sub">${look.sub(info.club)}</div>
      <button class="gs-btn gs-btn--primary gs-bird-go" data-bird-continue="1">Continue →</button>
    </div>`;
  document.body.appendChild(overlay);

  const goBtn = overlay.querySelector<HTMLButtonElement>('.gs-bird-go');
  goBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    cleanup();
  });
  overlay.addEventListener('click', onTap);
  window.addEventListener('keydown', onKey);

  const canvas = overlay.querySelector<HTMLCanvasElement>('.gs-bird-fx');
  if (canvas && !reduced) {
    try {
      runBirdFlight(canvas, kind, info.holeNo);
    } catch {
      /* a canvas fault must not strand the celebration */
    }
  }

  // Auto-dismiss safety net (well past the show) so the player is never stuck if they look away.
  window.setTimeout(() => cleanup(), reduced ? 4200 : 9000);
}

/**
 * Deterministic, assetless fly-over: a stylised bird soars across the sky on repeated passes, with a
 * sparkle/aurora trail. Seeded (no Math.random) so it's stable across reloads; the loop self-cancels
 * when the overlay is torn down (the orphaned-rAF hazard the codebase warns about). The eagle is a
 * fast, sharp, chrome-silver raptor; the albatross is a vast, slow, glowing-aurora glider.
 */
function runBirdFlight(canvas: HTMLCanvasElement, kind: 'eagle' | 'albatross', seed: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round((window.innerWidth || 400) * dpr);
  canvas.height = Math.round((window.innerHeight || 800) * dpr);
  const W = canvas.width;
  const H = canvas.height;
  // mulberry32 — the house seeded rng (Math.random is banned for reproducible feel).
  let s = (seed * 0x9e3779b1 + (kind === 'eagle' ? 0x85ebca6b : 0xc2b2ae35) + 0x6d2b79f5) >>> 0;
  const rnd = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const albatross = kind === 'albatross';
  // The bird is sized off the smaller screen edge so it reads on phone + desktop alike.
  const span = Math.min(W, H) * (albatross ? 0.38 : 0.24);
  const baseY = H * (albatross ? 0.34 : 0.3);
  const speed = (albatross ? 0.26 : 0.42) * dpr; // px/ms across the screen
  const flapHz = albatross ? 1.0 : 3.0; // wing-beats per second
  const trailCols = albatross
    ? ['#5fe6c8', '#7ab8ff', '#c98bff', '#9fffe0', '#ffffff']
    : ['#eef3fb', '#cdd8ec', '#aebdd8', '#ffffff'];

  // A handful of background twinkles so the sky reads alive even between passes.
  const stars = Array.from({ length: 70 }, () => ({
    x: rnd() * W, y: rnd() * H, r: (0.5 + rnd() * 1.4) * dpr, ph: rnd() * Math.PI * 2,
  }));

  type Tr = { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; r: number };
  const trail: Tr[] = [];

  // The flying bird, drawn facing +x, seen from above. Wings stay broadly spread (a soaring raptor /
  // glider) and "flap" with a gentle foreshorten + sweep-back so they never collapse into the body.
  // The albatross has very long, narrow wings; the eagle's are broad with splayed primary "fingers".
  const chordF = albatross ? 0.5 : 0.82; // front-to-back wing depth (albatross = high aspect ratio)
  const drawBird = (cx: number, cy: number, sc: number, phase: number): void => {
    const flap = Math.sin(phase); // -1..1
    const fore = 0.82 + 0.18 * (0.5 + 0.5 * Math.cos(phase)); // 0.82..1.0 — a gentle wing-beat
    const wingSpan = sc * fore;
    const back = sc * (albatross ? 0.42 : 0.5) + sc * (1 - fore) * 0.45; // wingtips sweep back as they flap
    const depth = sc * 0.5 * chordF; // trailing-edge sweep depth
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(flap * 0.05); // a touch of bank

    // Wing fill — a metallic/aurora gradient down the wingspan, with an ink edge so the wing reads
    // crisply against the soft glow rather than washing into a blob.
    const grad = ctx.createLinearGradient(0, -wingSpan, 0, wingSpan);
    if (albatross) {
      grad.addColorStop(0, '#cdb6ff');
      grad.addColorStop(0.42, '#7ab8ff');
      grad.addColorStop(0.58, '#5fe6c8');
      grad.addColorStop(1, '#cdb6ff');
    } else {
      // Brushed chrome-silver: a hot white leading highlight raking down into cool steel — reads
      // metallic, not the soft blue-grey that made it look like a gull/albatross.
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.24, '#eaf1fb');
      grad.addColorStop(0.5, '#b7c5da');
      grad.addColorStop(0.76, '#8697b4');
      grad.addColorStop(1, '#63758f');
    }

    const wing = (sign: number): void => {
      const tipY = sign * wingSpan;
      ctx.beginPath();
      if (albatross) {
        // A long, slim, swept blade — the albatross's famous high-aspect wing.
        ctx.moveTo(sc * 0.18, sign * sc * 0.05);
        ctx.quadraticCurveTo(sc * 0.06, tipY * 0.42, -back, tipY); // leading edge sweeps out & back
        ctx.quadraticCurveTo(-back - sc * 0.05, tipY * 0.62, -sc * 0.16, sign * sc * 0.02); // thin trailing edge
      } else {
        // A broad, deep-chested raptor wing. The leading edge bows forward off the shoulder out to
        // the wrist; then a cluster of five splayed primary "fingers" (deep slots between them) rakes
        // outward-and-back — the unmistakable spread-eagle wingtip — before the secondaries sweep the
        // trailing edge back into the body. `P(fx, fy)` is a tip/slot vertex in (chord, span) units.
        const P = (fx: number, fy: number): void => ctx.lineTo(sc * fx, tipY * fy);
        ctx.moveTo(sc * 0.3, sign * sc * 0.02);
        ctx.quadraticCurveTo(sc * 0.4, tipY * 0.32, sc * 0.08, tipY * 0.62); // arm → wrist
        P(-0.06, 0.98); // finger 1 tip (outer)
        P(-0.03, 0.77); // slot 1
        P(-0.22, 1.0); // finger 2 tip
        P(-0.15, 0.76); // slot 2
        P(-0.38, 0.97); // finger 3 tip
        P(-0.29, 0.72); // slot 3
        P(-0.53, 0.89); // finger 4 tip
        P(-0.42, 0.67); // slot 4
        P(-0.65, 0.77); // finger 5 tip (inner)
        P(-0.5, 0.58); // base of inner primary → onto the secondaries
        ctx.quadraticCurveTo(-back - depth * 0.28, tipY * 0.33, -sc * 0.36, sign * sc * 0.04); // trailing edge → body
      }
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.shadowColor = albatross ? 'rgba(120,230,210,.8)' : 'rgba(150,210,255,.55)'; // cool spacey glow
      ctx.shadowBlur = sc * 0.26;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = Math.max(1, sc * (albatross ? 0.016 : 0.014));
      ctx.strokeStyle = albatross ? 'rgba(48,34,86,.5)' : 'rgba(34,46,72,.55)';
      ctx.stroke();
      if (!albatross) {
        // Feather-shadow arcs across the wing (raptor plumage) + a hot chrome specular streak down
        // the leading edge — the "silver, spacey" sheen.
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(70,90,124,.6)';
        ctx.lineWidth = Math.max(1, sc * 0.01);
        ctx.beginPath();
        ctx.moveTo(sc * 0.02, tipY * 0.5);
        ctx.quadraticCurveTo(-sc * 0.16, tipY * 0.6, -sc * 0.34, tipY * 0.62);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-sc * 0.02, tipY * 0.34);
        ctx.quadraticCurveTo(-sc * 0.14, tipY * 0.42, -sc * 0.3, tipY * 0.44);
        ctx.stroke();
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = Math.max(1, sc * 0.012);
        ctx.beginPath();
        ctx.moveTo(sc * 0.26, sign * sc * 0.03);
        ctx.quadraticCurveTo(sc * 0.36, tipY * 0.34, sc * 0.06, tipY * 0.6);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    };
    wing(1);
    wing(-1);

    // Body fuselage + head. The albatross keeps a slim body with the head sitting close in; the eagle
    // gets a broader chest and a projecting neck+head so it reads as a raptor peering ahead, not a gull.
    ctx.fillStyle = albatross ? '#e7edff' : '#eef3fb';
    ctx.beginPath();
    ctx.ellipse(-sc * 0.02, 0, sc * (albatross ? 0.46 : 0.44), sc * (albatross ? 0.08 : 0.11), 0, 0, Math.PI * 2);
    ctx.fill();
    if (!albatross) {
      ctx.beginPath();
      ctx.ellipse(sc * 0.4, 0, sc * 0.16, sc * 0.09, 0, 0, Math.PI * 2); // extended neck
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(sc * (albatross ? 0.46 : 0.56), 0, sc * (albatross ? 0.09 : 0.1), 0, Math.PI * 2); // head
    ctx.fill();
    if (albatross) {
      // Straight spear beak.
      ctx.fillStyle = '#ffce6e';
      ctx.beginPath();
      ctx.moveTo(sc * 0.53, -sc * 0.04);
      ctx.lineTo(sc * 0.82, 0);
      ctx.lineTo(sc * 0.53, sc * 0.04);
      ctx.closePath();
      ctx.fill();
    } else {
      // Golden hooked raptor beak — curls down at the tip, the eagle's signature.
      ctx.fillStyle = '#ffc22e';
      ctx.beginPath();
      ctx.moveTo(sc * 0.62, -sc * 0.06);
      ctx.quadraticCurveTo(sc * 0.9, -sc * 0.05, sc * 0.92, sc * 0.02);
      ctx.quadraticCurveTo(sc * 0.86, sc * 0.055, sc * 0.7, sc * 0.05);
      ctx.closePath();
      ctx.fill();
      // Dark raptor eyes, set forward on the head.
      ctx.fillStyle = '#2a3550';
      ctx.beginPath();
      ctx.arc(sc * 0.585, -sc * 0.045, sc * 0.014, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sc * 0.585, sc * 0.045, sc * 0.014, 0, Math.PI * 2);
      ctx.fill();
    }
    if (albatross) {
      // Forked tail.
      ctx.fillStyle = '#9fb8ff';
      ctx.beginPath();
      ctx.moveTo(-sc * 0.38, 0);
      ctx.lineTo(-sc * 0.72, -sc * 0.12);
      ctx.lineTo(-sc * 0.58, 0);
      ctx.lineTo(-sc * 0.72, sc * 0.12);
      ctx.closePath();
      ctx.fill();
    } else {
      // Broad fanned wedge tail — the eagle spreads its tail feathers, it does not fork like a gull.
      ctx.fillStyle = '#9fb0cc';
      ctx.beginPath();
      ctx.moveTo(-sc * 0.34, sc * 0.05);
      ctx.lineTo(-sc * 0.84, sc * 0.22);
      ctx.lineTo(-sc * 0.9, sc * 0.14);
      ctx.lineTo(-sc * 0.94, 0);
      ctx.lineTo(-sc * 0.9, -sc * 0.14);
      ctx.lineTo(-sc * 0.84, -sc * 0.22);
      ctx.lineTo(-sc * 0.34, -sc * 0.05);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  const start = performance.now();
  const passLen = W + span * 3; // off-screen left to off-screen right
  const passMs = passLen / speed;
  const gapMs = albatross ? 700 : 450; // pause between passes
  let frame = 0;

  const tick = (): void => {
    if (!canvas.isConnected) return; // overlay torn down → stop (never draw into a detached canvas)
    frame++;
    const now = performance.now();
    const elapsed = now - start;
    const cycle = passMs + gapMs;
    const inCycle = elapsed % cycle;
    const passIndex = Math.floor(elapsed / cycle);
    const flying = inCycle < passMs;

    ctx.clearRect(0, 0, W, H);

    // Background twinkles.
    for (const st of stars) {
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(frame * 0.05 + st.ph));
      ctx.globalAlpha = tw * 0.7;
      ctx.fillStyle = '#cfe0ff';
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    let bx = 0;
    let by = 0;
    if (flying) {
      const t = inCycle / passMs; // 0..1 across the screen
      bx = -span * 1.5 + t * passLen;
      // Each pass drifts at a slightly different height and gently undulates as it soars.
      by = baseY + (passIndex % 2 === 0 ? 0 : H * 0.12) + Math.sin(t * Math.PI * (albatross ? 2 : 3)) * span * 0.18;
      // Spawn trail particles from just behind the bird.
      const n = albatross ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const col = trailCols[Math.floor(rnd() * trailCols.length)]!;
        const r = (albatross ? 2.4 + rnd() * 3.2 : 1.4 + rnd() * 2) * dpr;
        trail.push({
          x: bx - span * 0.6 + (rnd() - 0.5) * span * 0.3,
          y: by + (rnd() - 0.5) * span * (albatross ? 0.5 : 0.3),
          vx: -speed * 0.25 + (rnd() - 0.5) * 0.4 * dpr,
          vy: (rnd() - 0.5) * 0.4 * dpr + (albatross ? 0.1 : 0),
          life: 0,
          max: albatross ? 70 + rnd() * 50 : 36 + rnd() * 26,
          col,
          r,
        });
      }
    }

    // Draw + age the trail (soft additive glow; no per-particle shadowBlur — cheap).
    ctx.globalCompositeOperation = 'lighter';
    for (let i = trail.length - 1; i >= 0; i--) {
      const p = trail[i]!;
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      const k = 1 - p.life / p.max;
      if (k <= 0) {
        trail.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, k)) * (albatross ? 0.55 : 0.7);
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * (0.5 + k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    if (flying) {
      const phase = (now / 1000) * flapHz * Math.PI * 2;
      drawBird(bx, by, span, phase);
    }

    (canvas as unknown as { _raf?: number })._raf = requestAnimationFrame(tick);
  };
  (canvas as unknown as { _raf?: number })._raf = requestAnimationFrame(tick);
}

/** A momentum rail: one pip per hole in the stop, coloured by the score already made (eagle gold →
 *  blow-up red), the current hole ringed, upcoming holes dim — so the run's shape reads at a glance. */
