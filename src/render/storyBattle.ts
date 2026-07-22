/**
 * The FINALE BATTLE (GS-story-battle-3) — Canvas2D, render-only, the R-Type-style sequence fight against
 * the world-serpent that SPENDS the arsenal you built. The rework answers the standing complaints ("it
 * doesn't use the game's art, the difficulty is trivially outclassed, one fire button for a whole
 * arsenal"):
 *
 *   • YOUR SHIP IS YOUR SHIP. The fighter is the equipped story ship's real `shipSVG` art (rasterized at
 *     mount), shield bubble and thrust flame around the same hull you fly on the star map. TAP THE FIELD
 *     to fly there (engine-scaled speed) — dodging is real navigation, not a parry prompt.
 *   • THE SERPENT IS THE TEASER SERPENT. `paintSerpent` (the sigil-ceremony art) IS the boss — the same
 *     horns, fanged maw and slit-pupil eye the ceremonies tease, glaring wide-eyed (GS-story-serpent-eye).
 *   • EVERY WEAPON IS ITS OWN TRIGGER. The bottom HUD seats one button per owned weapon upgrade
 *     (`FinaleLoadout.weapons` — scatter / railgun / nova / lance / wyrmfang), each with its own damage,
 *     cooldown ring and projectile style, so a stocked arsenal plays like an arsenal.
 *   • THE FIGHT IS A PHASE SCRIPT (sim `FINALE_PHASES`): at 75% health the serpent opens the ACID SPRAY
 *     (slow globes you fly around), 50% adds telegraphed LIGHTNING lines, 25% adds detonating VOID
 *     BLASTS, and at 5% one OVERWHELMING near-undodgeable barrage spends `FINALE_OVERWHELM_HITS` shield
 *     cells — survive it with shields in hand and the spent serpent bares its eye for the golf FINISHER.
 *     Phases key off health, so a maxed arsenal shortens the fight but never skips the gauntlet.
 *
 * FAIR BY CONSTRUCTION: the deterministic gate verdict still rules what is POSSIBLE — under the breach
 * gate the hide holds at the hopeless floor (the serpent can be worn to it but never past); the Skip
 * button / reduced-motion (guarded at the call site) always resolve the ARMED verdict cleanly (never a
 * punishment). Self-contained (own mount/rAF/skip), everything vector-drawn or rasterized from the
 * game's own SVG art (no downloaded asset), zero sim rng (a private mulberry32 seeds the backdrop).
 * Keeps the `data-gs-storyfinale` overlay marker for the browser smoke.
 */

import { paintSerpent, type SerpentAnchors } from './sigilCeremony';
import { shipSVG } from './shipArt';
import {
  FINALE_SERPENT_HP,
  FINALE_PHASES,
  FINALE_OVERWHELM_HITS,
  FINALE_PHASE_REGEN,
  FINALE_HOPELESS_FLOOR_FRAC,
  type FinaleLoadout,
  type FinaleWeapon,
  type FinaleWeaponStyle,
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

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
const clamp01 = (x: number): number => clamp(x, 0, 1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── battle constants (feel; the balance numbers live in the sim) ─────────────────────────────────────────
const SHIP_R = 24; // ship hit radius (design px)
const SHIP_MIN_X = 60;
const SHIP_MAX_X = 560;
const SHIP_MIN_Y = 70;
const SHIP_MAX_Y = 470;
const INVULN_MS = 900; // post-hit mercy window
const ACID_SPEED = 135; // design px/s — slow enough to fly around (the ask)
const BOLT_TELEGRAPH_MS = 1000; // lightning warning before the zap
const BOLT_ACTIVE_MS = 260;
const VOID_FUSE_MS = 1300; // void orb flight before detonation
const VOID_RING_MS = 900; // ring expansion time
const VOID_RING_MAX = 150;
const PLAYER_SHOT_SPEED = 900;
const OVERWHELM_MS = 5200; // the scripted 5% barrage
const HOPELESS_DEADLINE_MS = 40000; // under-gate ships are driven off by here regardless
const AUTO_DEADLINE_MS = 9000; // non-interactive: resolve the gate outcome briskly
const HIT_ZONE = 88; // finisher reticle tolerances (the golf strike)
const CLEAN_ZONE = 26;
const SWEEP_AMP = 220;
const SWEEP_SPEED = 1.9;

/** Serpent attack cadence per phase index (ms between volleys) — pressure rises as it wakes. */
const PHASE_ATTACK_MS = [2600, 2300, 2100, 1900] as const;

export function mountStoryBattle(opts: {
  /** The deterministic gate verdict — what is POSSIBLE. A gate-lost ship can never win the battle. */
  won: boolean;
  /** The live loadout derived from the arsenal (`finaleLoadout`) — the battle consumes it. */
  loadout: FinaleLoadout;
  /** The equipped story ship — the fighter is YOUR ship's real art. */
  shipId?: string;
  interactive?: boolean;
  /** The HERALD frees the bound serpent: same gauntlet, the Warden blockade's gold lances in the
   *  lightning slot, the serpent visibly WAKING as its wards wear down, the final SEAL as the target. */
  herald?: boolean;
  /** SFX hooks (the app layer owns audio — this module stays node-clean). */
  onFire?: (style: FinaleWeaponStyle) => void;
  onShipHit?: () => void;
  onPhase?: () => void;
  onDone?: (strike: FinaleStrike, outcome: BattleOutcome) => void;
  /** PREVIEW-ONLY (battle-preview.mjs): open the fight at this serpent-health fraction. */
  startHpFrac?: number;
}): StoryBattleHandle {
  const won = opts.won;
  const interactive = opts.interactive !== false;
  const herald = opts.herald === true;
  const loadout = opts.loadout;

  // ── overlay scaffolding ─────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.setAttribute('data-gs-storyfinale', '1');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#03040a;overflow:hidden;cursor:pointer;touch-action:none;';
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

  // ── the fighter: YOUR ship, rasterized from its real SVG art ────────────────
  const SHIP_W = 118; // drawn width in design px (art frame is ~62u wide → ~1.9x)
  const SHIP_H = (SHIP_W * 40) / 62;
  const shipImg = new Image();
  let shipImgReady = false;
  shipImg.onload = () => {
    shipImgReady = true;
  };
  shipImg.src =
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="372" height="240" viewBox="-34 -20 62 40">${shipSVG(opts.shipId, 0, 0, 1)}</svg>`,
    );

  // ── battle state ─────────────────────────────────────────────────────────────
  type Phase = 'assault' | 'overwhelm' | 'aim' | 'climax-win' | 'climax-lose';
  let phase: Phase = 'assault';
  const hpMax = FINALE_SERPENT_HP;
  let hp = hpMax * clamp01(opts.startHpFrac ?? 1);
  const hpFloor = won ? 0 : hpMax * FINALE_HOPELESS_FLOOR_FRAC;
  const shieldMax = loadout.shieldCells;
  let shield = shieldMax;
  let phaseIdx = FINALE_PHASES.filter((f) => hp <= hpMax * f).length; // thresholds already crossed (preview starts)
  if (phaseIdx > 3) phaseIdx = 3;
  let phaseCaptionUntil = 0;
  let phaseCaption = '';
  let phaseCaptionSub = '';
  let roar = 0; // 0..1 phase-turn roar animation
  let invulnUntil = 0;
  let hitFlash = 0;
  let shake = 0;
  let assaultStart = 0;
  let nextAttackAt = 0;
  let lastVolleyAt = -9e9; // the maw gapes around each volley (GS-story-serpent-2)
  let overwhelmStart = 0;
  let overwhelmHitsDealt = 0;
  let aimStart = 0;
  let lashUntil = 0;
  let struck = false;
  let strike: FinaleStrike = 'clean';
  let outcome: BattleOutcome = 'won';
  let climaxStart = 0;
  let hintUntil = 0; // "tap to fly / tap a weapon" opening hint
  let lastAutoFire = 0; // non-interactive autopilot fire cadence

  // your ship
  const ship = { x: 180, y: 320, tx: 180, ty: 320, vx: 0, vy: 0 };
  let moveMark = 0; // fading tap-destination marker
  let moveMarkX = 0;
  let moveMarkY = 0;

  // weapons — one live cooldown per HUD trigger
  const weaponReadyAt: number[] = loadout.weapons.map(() => 0);

  // projectiles
  type PlayerShot = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    tx: number;
    ty: number;
    w: FinaleWeapon;
    born: number;
  };
  const playerShots: PlayerShot[] = [];
  type Beam = { x1: number; y1: number; x2: number; y2: number; until: number; w: FinaleWeapon };
  const beams: Beam[] = [];
  type Acid = { kind: 'acid'; x: number; y: number; vx: number; vy: number; r: number; wob: number; born: number };
  type Bolt = { kind: 'bolt'; x1: number; y1: number; x2: number; y2: number; fireAt: number; doneAt: number; hit: boolean };
  type Void = { kind: 'void'; x: number; y: number; vx: number; vy: number; detonateAt: number; hit: boolean };
  type Enemy = Acid | Bolt | Void;
  const enemyShots: Enemy[] = [];
  type Burst = { x: number; y: number; at: number; col: string; big: boolean };
  const bursts: Burst[] = [];

  let anchors: SerpentAnchors = { eyeX: 730, eyeY: 300, eyeR: 18, browX: 720, browY: 250, headH: 46, headAng: 3 };
  // GS-story-serpent-2: pulled left from 1040 so the great coil behind the skull stays on-canvas —
  // the boss now rears out of its own coils instead of a lone head poking in from the wing.
  const SERPENT_CX = 950;
  const SERPENT_CY = 200;
  const POSE_T = 1.5; // held pose for the aim reveal (keeps the head framed + targetable)

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

  // ── the deep-space backdrop (star-map family: parallax starfields + seeded nebula washes) ───────────
  const rng = mulberry32(0x5e79a1 ^ (herald ? 0x77 : 0x11));
  type Star = { x: number; y: number; r: number; tw: number; layer: number };
  const stars: Star[] = Array.from({ length: 170 }, (_, i) => ({
    x: rng() * DW,
    y: rng() * DH,
    r: 0.4 + rng() * (i % 9 === 0 ? 2.2 : 1.3),
    tw: rng() * 6.28,
    layer: 1 + (i % 3),
  }));
  type Nebula = { x: number; y: number; r: number; hue: string; a: number };
  const nebulae: Nebula[] = [
    { x: 240, y: 130, r: 340, hue: '96,60,170', a: 0.1 },
    { x: 700, y: 430, r: 380, hue: '30,120,90', a: 0.1 },
    { x: 520, y: 90, r: 260, hue: '40,90,150', a: 0.08 },
    ...Array.from({ length: 3 }, () => ({
      x: rng() * DW,
      y: rng() * DH,
      r: 140 + rng() * 200,
      hue: rng() < 0.5 ? '80,50,140' : '30,110,80',
      a: 0.05 + rng() * 0.05,
    })),
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

  // ── input ────────────────────────────────────────────────────────────────────
  /** Weapon-bar button rects (design space), rebuilt each frame for hit-testing. */
  const weaponRects: { x: number; y: number; w: number; h: number }[] = [];

  function toDesign(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = overlay.getBoundingClientRect();
    return { x: (e.clientX - r.left - offX) / scale, y: (e.clientY - r.top - offY) / scale };
  }

  function fireWeapon(i: number): void {
    const w = loadout.weapons[i];
    if (!w || (phase !== 'assault' && phase !== 'overwhelm')) return;
    if (now0 < weaponReadyAt[i]!) return;
    weaponReadyAt[i] = now0 + w.cooldownMs;
    opts.onFire?.(w.style);
    const sx = ship.x + SHIP_W * 0.42;
    const sy = ship.y;
    // aim at the serpent's fore-body (between brow and eye — the drawn head is the target)
    const tx = anchors.browX + 24;
    const ty = (anchors.browY + anchors.eyeY) / 2 + 14;
    if (w.style === 'lance') {
      // the star-blessed lance is a near-instant beam — damage lands now
      beams.push({ x1: sx, y1: sy, x2: tx, y2: ty, until: now0 + 340, w });
      landPlayerHit(tx, ty, w);
      return;
    }
    const count = w.style === 'scatter' ? 5 : 1;
    for (let k = 0; k < count; k++) {
      const spread = w.style === 'scatter' ? (k - (count - 1) / 2) * 0.075 : 0;
      const dx = tx - sx;
      const dy = ty - sy;
      const base = Math.atan2(dy, dx) + spread;
      const speed = w.style === 'railgun' ? PLAYER_SHOT_SPEED * 1.5 : w.style === 'nova' ? PLAYER_SHOT_SPEED * 0.55 : PLAYER_SHOT_SPEED;
      playerShots.push({
        x: sx,
        y: sy,
        vx: Math.cos(base) * speed,
        vy: Math.sin(base) * speed,
        tx,
        ty,
        w,
        born: now0,
      });
    }
  }

  function onTap(x: number, y: number): void {
    if (finished || !interactive) return;
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
      return;
    }
    if (phase !== 'assault' && phase !== 'overwhelm') return;
    // a tap on a weapon trigger FIRES it; anywhere else FLIES the ship there
    for (let i = 0; i < weaponRects.length; i++) {
      const r = weaponRects[i]!;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        fireWeapon(i);
        return;
      }
    }
    ship.tx = clamp(x, SHIP_MIN_X, SHIP_MAX_X);
    ship.ty = clamp(y, SHIP_MIN_Y, SHIP_MAX_Y);
    moveMark = 1;
    moveMarkX = ship.tx;
    moveMarkY = ship.ty;
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') skipToEnd();
    else if (e.key >= '1' && e.key <= '5') fireWeapon(Number(e.key) - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (phase === 'aim') onTap(DW / 2, DH / 2);
      else fireWeapon(weaponReadyAt.findIndex((t) => now0 >= t));
    }
  };
  skip.addEventListener('click', (e) => {
    e.stopPropagation();
    skipToEnd();
  });
  overlay.addEventListener('pointerdown', (e) => {
    const p = toDesign(e);
    onTap(p.x, p.y);
  });
  window.addEventListener('keydown', onKey);

  // ── serpent attack patterns ──────────────────────────────────────────────────
  const mawPos = (): { x: number; y: number } => ({
    x: anchors.browX + anchors.headH * 0.7,
    y: anchors.browY + anchors.headH * 1.6,
  });

  function spawnAcidFan(count: number, aimed: boolean): void {
    const m = mawPos();
    const baseA = Math.atan2(ship.y - m.y, ship.x - m.x);
    for (let k = 0; k < count; k++) {
      const a = baseA + (k - (count - 1) / 2) * (aimed ? 0.16 : 0.26) + (rng() - 0.5) * 0.06;
      const sp = ACID_SPEED * (0.85 + rng() * 0.35);
      enemyShots.push({
        kind: 'acid',
        x: m.x,
        y: m.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: 10 + rng() * 5,
        wob: rng() * 6.28,
        born: now0,
      });
    }
  }

  function spawnBolt(targetY?: number): void {
    // a full-width lightning line telegraphed through the ship's CURRENT height — dodge by leaving it
    const y = targetY ?? ship.y + (rng() - 0.5) * 40;
    enemyShots.push({
      kind: 'bolt',
      x1: -30,
      y1: y + (rng() - 0.5) * 30,
      x2: anchors.browX,
      y2: y,
      fireAt: now0 + BOLT_TELEGRAPH_MS,
      doneAt: now0 + BOLT_TELEGRAPH_MS + BOLT_ACTIVE_MS,
      hit: false,
    });
  }

  function spawnVoid(): void {
    const e = { x: anchors.eyeX, y: anchors.eyeY };
    const a = Math.atan2(ship.y - e.y, ship.x - e.x) + (rng() - 0.5) * 0.2;
    const sp = ACID_SPEED * 1.15;
    enemyShots.push({
      kind: 'void',
      x: e.x,
      y: e.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      detonateAt: now0 + VOID_FUSE_MS,
      hit: false,
    });
  }

  /** One volley for the current phase — the escalation the phases promise. */
  function spawnVolley(): void {
    if (phaseIdx === 0) {
      spawnAcidFan(1 + (rng() < 0.4 ? 1 : 0), true); // opening spits
    } else if (phaseIdx === 1) {
      spawnAcidFan(4 + Math.floor(rng() * 2), false); // ACID SPRAY
    } else if (phaseIdx === 2) {
      spawnAcidFan(4, false);
      if (rng() < 0.8) spawnBolt(); // + LIGHTNING
    } else {
      spawnAcidFan(3 + Math.floor(rng() * 3), false);
      if (rng() < 0.65) spawnBolt();
      if (rng() < 0.75) spawnVoid(); // + VOID BLASTS
    }
  }

  function phaseLabel(i: number): [string, string] {
    if (herald) {
      return (
        [
          ['THE WARDS STRAIN', 'acid wells up between the bindings — fly clear of the globes'],
          ['IT BEGINS TO WAKE', 'the acid spray thickens as the serpent stirs'],
          ['THE BLOCKADE OPENS FIRE', 'warden lances sweep the field — leave the line before they land'],
          ['THE LAST WARD CRACKS', 'void-rifts tear open — keep flying, keep firing'],
        ][i] ?? ['', '']
      ) as [string, string];
    }
    return (
      [
        ['JÖRMUNGANDR STIRS', 'tap the field to fly · tap a weapon to fire'],
        ['⚠ ACID SPRAY', 'slow globes of venom — fly around them'],
        ['⚠ LIGHTNING', 'it calls the storm — leave the marked line before it lands'],
        ['⚠ VOID BLASTS', 'collapsing orbs detonate into rings — keep your distance'],
      ][i] ?? ['', '']
    ) as [string, string];
  }

  // ── damage ───────────────────────────────────────────────────────────────────
  function landPlayerHit(x: number, y: number, w: FinaleWeapon): void {
    const before = hp;
    hp = Math.max(hpFloor, hp - w.damage);
    bursts.push({ x, y, at: now0, col: w.color2, big: w.damage >= 30 });
    if (w.damage >= 30) shake = Math.max(shake, 6);
    // phase turns: the serpent escalates as its health falls (each threshold crossed once)
    while (phaseIdx < FINALE_PHASES.length - 1 && hp <= hpMax * FINALE_PHASES[phaseIdx]!) {
      phaseIdx += 1;
      roar = 1;
      shake = Math.max(shake, 9);
      shield = Math.min(shieldMax, shield + FINALE_PHASE_REGEN); // the breather beat
      const [cap, sub] = phaseLabel(phaseIdx);
      phaseCaption = cap;
      phaseCaptionSub = sub;
      phaseCaptionUntil = now0 + 2600;
      opts.onPhase?.();
    }
    // the 5% OVERWHELM — the climax barrage (only an armed ship can get here; the floor sits above it)
    if (phase === 'assault' && won && hp <= hpMax * FINALE_PHASES[3]! && before > hpFloor) {
      phase = 'overwhelm';
      overwhelmStart = now0;
      overwhelmHitsDealt = 0;
      enemyShots.length = 0; // the field clears for the set-piece
      shake = 12;
      phaseCaption = herald ? 'THE LAST WARD SHATTERS' : 'THE WORLD-EATER UNCOILS';
      phaseCaptionSub = 'an overwhelming barrage — your shields must hold';
      phaseCaptionUntil = now0 + 3000;
      opts.onPhase?.();
    }
  }

  function shipHit(undodgeable = false): void {
    if (!undodgeable && now0 < invulnUntil) return;
    invulnUntil = now0 + INVULN_MS;
    shield -= 1;
    hitFlash = 1;
    shake = Math.max(shake, 8);
    opts.onShipHit?.();
    if (shield < 0) {
      phase = 'climax-lose';
      outcome = 'lost';
      climaxStart = now0;
    }
  }

  // ── update ───────────────────────────────────────────────────────────────────
  function update(dt: number): void {
    const dts = dt / 1000;
    // ship flight (tap-to-move, engine-scaled)
    const dx = ship.tx - ship.x;
    const dy = ship.ty - ship.y;
    const d = Math.hypot(dx, dy);
    const step = loadout.shipSpeed * dts;
    if (d > 2) {
      const f = Math.min(1, step / d);
      ship.vx = (dx / d) * loadout.shipSpeed;
      ship.vy = (dy / d) * loadout.shipSpeed;
      ship.x += dx * f;
      ship.y += dy * f;
    } else {
      ship.vx *= 0.8;
      ship.vy *= 0.8;
    }
    moveMark = Math.max(0, moveMark - dts * 1.6);
    hitFlash = Math.max(0, hitFlash - dts * 2.2);
    shake = Math.max(0, shake - dts * 14);
    roar = Math.max(0, roar - dts * 0.9);

    // player shots → the serpent
    for (let i = playerShots.length - 1; i >= 0; i--) {
      const s = playerShots[i]!;
      s.x += s.vx * dts;
      s.y += s.vy * dts;
      const remaining = (s.tx - s.x) * s.vx + (s.ty - s.y) * s.vy;
      if (remaining <= 0 || s.x > DW + 60) {
        landPlayerHit(s.tx + (rng() - 0.5) * 24, s.ty + (rng() - 0.5) * 24, s.w);
        playerShots.splice(i, 1);
      }
    }
    for (let i = beams.length - 1; i >= 0; i--) if (now0 > beams[i]!.until) beams.splice(i, 1);

    if (phase === 'assault') {
      // non-interactive autopilot: a measured one-gun-at-a-time cadence + a weaving flight path (the
      // cinematic pace — a burst-fires-everything opener would rush past the phases)
      if (!interactive) {
        if (now0 - lastAutoFire > 800) {
          const i = weaponReadyAt.findIndex((r) => now0 >= r);
          if (i >= 0) {
            fireWeapon(i);
            lastAutoFire = now0;
          }
        }
        ship.tx = 200 + Math.sin(now0 / 1400) * 60;
        ship.ty = 300 + Math.sin(now0 / 900) * 130;
      }
      // volleys
      if (now0 >= nextAttackAt) {
        spawnVolley();
        lastVolleyAt = now0;
        nextAttackAt = now0 + PHASE_ATTACK_MS[phaseIdx]! * (0.9 + rng() * 0.2);
      }
      const elapsed = now0 - assaultStart;
      if (!interactive && elapsed > AUTO_DEADLINE_MS) {
        // non-interactive: force the deterministic gate outcome briskly
        if (won) {
          phase = 'aim';
          aimStart = now0;
          enemyShots.length = 0;
        } else {
          shield = -1;
          phase = 'climax-lose';
          outcome = 'lost';
          climaxStart = now0;
        }
      } else if (!won && elapsed > HOPELESS_DEADLINE_MS) {
        // an under-gate ship is always driven off by here (the hide HOLDS by construction)
        shield = -1;
        phase = 'climax-lose';
        outcome = 'lost';
        climaxStart = now0;
      }
    } else if (phase === 'overwhelm') {
      const e = now0 - overwhelmStart;
      // a rolling curtain of acid + bolts fills the field (dense on purpose — this one is not dodged)
      if (e > 900 && rng() < dts * 14) spawnAcidFan(2, false);
      if (e > 1200 && rng() < dts * 1.6) spawnBolt(rng() * (SHIP_MAX_Y - SHIP_MIN_Y) + SHIP_MIN_Y);
      // the scripted undodgeable strikes — shields absorb them or the ship breaks
      const hitTimes = [1800, 3300];
      while (overwhelmHitsDealt < FINALE_OVERWHELM_HITS && overwhelmHitsDealt < hitTimes.length && e >= hitTimes[overwhelmHitsDealt]!) {
        overwhelmHitsDealt += 1;
        shipHit(true);
        if (phase !== 'overwhelm') return; // shields broke — the barrage ends it
      }
      if (e >= OVERWHELM_MS) {
        hp = 0;
        enemyShots.length = 0;
        phase = 'aim';
        aimStart = now0;
        phaseCaption = herald ? 'THE SEAL LIES BARE' : 'ITS EYE IS BARED';
        phaseCaptionSub = herald ? 'strike the seal and let it rise' : 'strike the ball home';
        phaseCaptionUntil = now0 + 2400;
      }
    } else if (phase === 'aim' && !interactive && now0 - aimStart > 1400) {
      struck = true;
      strike = 'clean';
      phase = 'climax-win';
      outcome = 'won';
      climaxStart = now0;
    }

    // enemy projectiles fly + collide (assault AND overwhelm — the curtain is real)
    if (phase === 'assault' || phase === 'overwhelm') {
      for (let i = enemyShots.length - 1; i >= 0; i--) {
        const s = enemyShots[i]!;
        if (s.kind === 'acid') {
          s.x += s.vx * dts;
          s.y += s.vy * dts;
          if (s.x < -40 || s.y < -40 || s.y > DH + 40) {
            enemyShots.splice(i, 1);
            continue;
          }
          if (Math.hypot(s.x - ship.x, s.y - ship.y) < s.r + SHIP_R) {
            enemyShots.splice(i, 1);
            shipHit();
            continue;
          }
        } else if (s.kind === 'bolt') {
          if (now0 > s.doneAt) {
            enemyShots.splice(i, 1);
            continue;
          }
          if (!s.hit && now0 >= s.fireAt) {
            // active zap: point-to-segment distance
            const vx = s.x2 - s.x1;
            const vy = s.y2 - s.y1;
            const len2 = vx * vx + vy * vy || 1;
            const t = clamp01(((ship.x - s.x1) * vx + (ship.y - s.y1) * vy) / len2);
            const px = s.x1 + vx * t;
            const py = s.y1 + vy * t;
            if (Math.hypot(ship.x - px, ship.y - py) < 20 + SHIP_R * 0.7) {
              s.hit = true;
              shipHit();
            }
          }
        } else {
          // void orb → detonation ring
          const sinceDet = now0 - s.detonateAt;
          if (sinceDet < 0) {
            s.x += s.vx * dts;
            s.y += s.vy * dts;
            if (Math.hypot(s.x - ship.x, s.y - ship.y) < 14 + SHIP_R) {
              s.hit = true;
              enemyShots.splice(i, 1);
              shipHit();
              continue;
            }
          } else if (sinceDet > VOID_RING_MS) {
            enemyShots.splice(i, 1);
            continue;
          } else if (!s.hit) {
            const ringR = (sinceDet / VOID_RING_MS) * VOID_RING_MAX;
            const dd = Math.hypot(s.x - ship.x, s.y - ship.y);
            if (Math.abs(dd - ringR) < 16 + SHIP_R * 0.5) {
              s.hit = true;
              shipHit();
            }
          }
        }
      }
    }
  }

  // ── drawing ──────────────────────────────────────────────────────────────────
  function drawSpace(t: number, flash: number): void {
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, DH);
    g.addColorStop(0, '#05060f');
    g.addColorStop(0.5, '#090714');
    g.addColorStop(1, '#04060e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, DW, DH);
    // seeded nebula washes (the star-map family look)
    for (const n of nebulae) {
      const ng = ctx.createRadialGradient(n.x, n.y, 10, n.x, n.y, n.r);
      ng.addColorStop(0, `rgba(${n.hue},${n.a})`);
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng;
      ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    // three parallax star layers, drifting slowly toward the serpent (a battlefield in motion)
    for (const s of stars) {
      const drift = (t * 2.2 * s.layer) % (DW + 40);
      const x = ((s.x - drift) % (DW + 40) + DW + 40) % (DW + 40) - 20;
      const tw = 0.45 + 0.55 * Math.sin(t * 1.6 + s.tw);
      ctx.globalAlpha = (0.16 + s.layer * 0.1) * tw;
      ctx.fillStyle = s.layer === 3 ? '#dfe8ff' : '#aabdd8';
      ctx.beginPath();
      ctx.arc(x, s.y, s.r * (0.7 + s.layer * 0.15), 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // a distant ringed world, low and dim — the last inhabited light behind you (depth, star-map family)
    ctx.save();
    ctx.translate(150, 500);
    ctx.rotate(-0.28);
    const pg = ctx.createRadialGradient(-8, -8, 2, 0, 0, 30);
    pg.addColorStop(0, 'rgba(120,150,190,0.5)');
    pg.addColorStop(1, 'rgba(40,55,90,0.35)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,180,220,0.28)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, 44, 12, 0, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(160,180,220,0.16)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.ellipse(0, 0, 52, 15, 0, 0.3, Math.PI - 0.3);
    ctx.stroke();
    ctx.restore();
    // the corruption haze bleeding in from the serpent's side
    const haze = ctx.createRadialGradient(860, 260, 60, 860, 260, 560);
    haze.addColorStop(0, `rgba(60,200,140,${0.1 + roar * 0.08})`);
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, DW, DH);
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,120,80,${flash * 0.32})`;
      ctx.fillRect(0, 0, DW, DH);
    }
  }

  /** The serpent's waking level: the Warden fights it wide awake; the Herald watches it WAKE as the
   *  wards (its health) wear down. */
  const wakeLevel = (): number => (herald ? 0.3 + 0.7 * (1 - hp / hpMax) : 1);

  function drawSerpent(t: number, focus: number, dim: number): void {
    if (!ctx) return;
    if (dim > 0) ctx.globalAlpha = 1 - dim;
    const tPose = focus > 0 ? lerp(t, POSE_T + 0.06 * Math.sin(t * 0.9), Math.min(1, focus / 0.6)) : t;
    // the maw gapes around each volley (GS-story-serpent-2): opens as the attack winds up, spits, closes
    const fighting = phase === 'assault' || phase === 'overwhelm';
    const windUp = clamp01(1 - (nextAttackAt - now0) / 380);
    const spit = clamp01(1 - (now0 - lastVolleyAt) / 520);
    const rage = fighting ? Math.max(windUp * 0.85, spit) : 0;
    anchors = paintSerpent(ctx, SERPENT_CX, SERPENT_CY, tPose, wakeLevel(), focus + roar * 0.12, { rage });
    ctx.globalAlpha = 1;
  }

  /** The Herald's final SEAL sits on the serpent's drawn brow. */
  const sealPos = (): { x: number; y: number; r: number } => ({
    x: anchors.browX - anchors.headH * 0.1,
    y: anchors.browY + anchors.headH * 0.15,
    r: anchors.headH * 0.55,
  });
  const aimTarget = (): { x: number; y: number } => (herald ? sealPos() : { x: anchors.eyeX, y: anchors.eyeY });
  const reticleX = (t: number, cx: number): number => cx + Math.sin(t * SWEEP_SPEED) * SWEEP_AMP;

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
    // the ouroboros — a serpent ring biting its tail
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

  function drawShip(t: number): void {
    if (!ctx) return;
    const flicker = now0 < invulnUntil && Math.floor(now0 / 90) % 2 === 0;
    const bob = Math.sin(t * 1.8) * 3;
    const bank = clamp(ship.vy / 900, -0.3, 0.3);
    const x = ship.x;
    const y = ship.y + bob;
    // tap-destination marker
    if (moveMark > 0) {
      ctx.strokeStyle = `rgba(127,216,255,${moveMark * 0.6})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(moveMarkX, moveMarkY, 14 + (1 - moveMark) * 10, 0, 6.283);
      ctx.stroke();
    }
    // shield bubble — hugs the hull; brightness reads the remaining pool
    if (shield >= 0) {
      const frac = shieldMax > 0 ? shield / shieldMax : 0;
      const sa = 0.1 + 0.24 * frac + hitFlash * 0.5;
      const rx = SHIP_W * 0.6;
      const ry = SHIP_H * 0.78;
      const grad = ctx.createRadialGradient(x, y, ry * 0.6, x, y, rx);
      grad.addColorStop(0, 'rgba(127,200,255,0)');
      grad.addColorStop(0.82, `rgba(127,200,255,${sa * 0.5})`);
      grad.addColorStop(1, 'rgba(127,200,255,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, rx, 0, 6.283);
      ctx.fill();
      ctx.strokeStyle = `rgba(127,200,255,${sa})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, 6.283);
      ctx.stroke();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bank * 0.5);
    if (flicker) ctx.globalAlpha = 0.45;
    // thrust flame behind the hull while flying
    const spd = Math.hypot(ship.vx, ship.vy);
    if (spd > 30) {
      const f = clamp01(spd / loadout.shipSpeed);
      const len = 26 + f * 26 + Math.sin(t * 22) * 5;
      const fg = ctx.createLinearGradient(-SHIP_W * 0.42, 0, -SHIP_W * 0.42 - len, 0);
      fg.addColorStop(0, 'rgba(255,210,110,0.85)');
      fg.addColorStop(0.5, 'rgba(255,140,70,0.5)');
      fg.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-SHIP_W * 0.4, -5);
      ctx.lineTo(-SHIP_W * 0.42 - len, 0);
      ctx.lineTo(-SHIP_W * 0.4, 5);
      ctx.closePath();
      ctx.fill();
    }
    if (shipImgReady) {
      ctx.drawImage(shipImg, -SHIP_W * 0.53, -SHIP_H * 0.5, SHIP_W, SHIP_H);
    } else {
      // pre-load fallback silhouette (the image resolves within a frame or two)
      ctx.fillStyle = '#cfd8e6';
      ctx.beginPath();
      ctx.moveTo(SHIP_W * 0.3, 0);
      ctx.lineTo(-SHIP_W * 0.2, -11);
      ctx.lineTo(-SHIP_W * 0.26, 0);
      ctx.lineTo(-SHIP_W * 0.2, 11);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ── projectile painters ──────────────────────────────────────────────────────
  function drawPlayerShots(t: number): void {
    if (!ctx) return;
    for (const s of playerShots) {
      const a = Math.atan2(s.vy, s.vx);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(a);
      const w = s.w;
      if (w.style === 'scatter' || w.style === 'pea') {
        ctx.fillStyle = w.color2;
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, 6.283);
        ctx.fill();
        ctx.strokeStyle = w.color;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = `rgba(255,211,107,0.3)`;
        ctx.fillRect(-22, -1.4, 18, 2.8);
      } else if (w.style === 'railgun') {
        ctx.fillStyle = `rgba(255,107,90,0.4)`;
        ctx.fillRect(-52, -1, 52, 2);
        ctx.fillStyle = w.color;
        ctx.fillRect(-16, -2.2, 26, 4.4);
        ctx.fillStyle = w.color2;
        ctx.fillRect(-10, -1.1, 22, 2.2);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(13, 0, 2.6, 0, 6.283);
        ctx.fill();
      } else if (w.style === 'nova') {
        const age = (now0 - s.born) / 1000;
        ctx.strokeStyle = w.color;
        ctx.lineWidth = 2.4;
        ctx.globalAlpha = 0.9 - (age % 0.8);
        ctx.beginPath();
        ctx.arc(0, 0, 6 + ((age * 22) % 18), 0, 6.283);
        ctx.stroke();
        ctx.globalAlpha = 1;
        const ng = ctx.createRadialGradient(0, 0, 1, 0, 0, 12);
        ng.addColorStop(0, '#ffffff');
        ng.addColorStop(0.4, w.color2);
        ng.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ng;
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = '#1a1030';
        ctx.beginPath();
        ctx.arc(0, 0, 3.4, 0, 6.283);
        ctx.fill();
      } else if (w.style === 'venom') {
        ctx.fillStyle = `rgba(176,224,79,0.35)`;
        ctx.fillRect(-26, -2, 22, 4);
        ctx.fillStyle = w.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, 9, 4.6, 0, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = w.color2;
        ctx.beginPath();
        ctx.ellipse(2, 0, 4.6, 2.6, 0, 0, 6.283);
        ctx.fill();
        // dripping venom motes
        ctx.fillStyle = `rgba(176,224,79,${0.5 + 0.3 * Math.sin(t * 9)})`;
        ctx.beginPath();
        ctx.arc(-12, 4, 1.8, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();
    }
    for (const b of beams) {
      const a = clamp01((b.until - now0) / 340);
      ctx.strokeStyle = `rgba(200,236,255,${0.25 * a})`;
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * a})`;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
    }
  }

  function drawEnemyShots(t: number): void {
    if (!ctx) return;
    for (const s of enemyShots) {
      if (s.kind === 'acid') {
        const wob = Math.sin(t * 5 + s.wob) * 2;
        const acid = herald ? '176,224,79' : '110,230,120';
        const g = ctx.createRadialGradient(s.x, s.y + wob, 1, s.x, s.y + wob, s.r * 2);
        g.addColorStop(0, `rgba(${acid},0.5)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, s.y + wob, s.r * 2, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = `rgba(${acid},0.9)`;
        ctx.beginPath();
        ctx.arc(s.x, s.y + wob, s.r, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = 'rgba(234,255,214,0.9)';
        ctx.beginPath();
        ctx.arc(s.x - s.r * 0.3, s.y + wob - s.r * 0.3, s.r * 0.35, 0, 6.283);
        ctx.fill();
        // a short venom trail
        const ta = Math.atan2(s.vy, s.vx);
        ctx.strokeStyle = `rgba(${acid},0.3)`;
        ctx.lineWidth = s.r * 0.9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x - Math.cos(ta) * s.r * 2.6, s.y + wob - Math.sin(ta) * s.r * 2.6);
        ctx.lineTo(s.x, s.y + wob);
        ctx.stroke();
        ctx.lineCap = 'butt';
      } else if (s.kind === 'bolt') {
        const col = herald ? '255,214,110' : '190,210,255';
        if (now0 < s.fireAt) {
          // telegraph: a crackling dashed warning line + edge glyph
          const p = 1 - (s.fireAt - now0) / BOLT_TELEGRAPH_MS;
          ctx.strokeStyle = `rgba(${col},${0.2 + p * 0.5})`;
          ctx.setLineDash([10, 9]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = `rgba(${col},${0.5 + p * 0.5})`;
          ctx.font = '700 15px system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(herald ? '⚔' : '⚡', 8, s.y1 - 8);
        } else {
          // the zap: a jagged bolt along the line
          const a = clamp01((s.doneAt - now0) / BOLT_ACTIVE_MS);
          ctx.strokeStyle = `rgba(${col},${0.35 * a})`;
          ctx.lineWidth = 12;
          ctx.beginPath();
          ctx.moveTo(s.x1, s.y1);
          ctx.lineTo(s.x2, s.y2);
          ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`;
          ctx.lineWidth = 2.8;
          ctx.beginPath();
          const segs = 9;
          for (let k = 0; k <= segs; k++) {
            const tt = k / segs;
            const jx = lerp(s.x1, s.x2, tt);
            const jy = lerp(s.y1, s.y2, tt) + (k > 0 && k < segs ? Math.sin(k * 7 + now0 / 24) * 7 : 0);
            if (k === 0) ctx.moveTo(jx, jy);
            else ctx.lineTo(jx, jy);
          }
          ctx.stroke();
        }
      } else {
        const sinceDet = now0 - s.detonateAt;
        if (sinceDet < 0) {
          // the falling void orb — a dark core eating the light around it
          const g = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, 26);
          g.addColorStop(0, 'rgba(20,8,40,0.95)');
          g.addColorStop(0.55, 'rgba(90,50,160,0.5)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 26, 0, 6.283);
          ctx.fill();
          ctx.strokeStyle = `rgba(190,140,255,${0.5 + 0.4 * Math.sin(t * 10)})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 12 + Math.sin(t * 8) * 2, 0, 6.283);
          ctx.stroke();
        } else {
          // the detonation ring
          const p = clamp01(sinceDet / VOID_RING_MS);
          const ringR = p * VOID_RING_MAX;
          ctx.strokeStyle = `rgba(170,120,255,${(1 - p) * 0.85})`;
          ctx.lineWidth = 7 * (1 - p) + 2;
          ctx.beginPath();
          ctx.arc(s.x, s.y, ringR, 0, 6.283);
          ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${(1 - p) * 0.5})`;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(s.x, s.y, ringR * 0.92, 0, 6.283);
          ctx.stroke();
        }
      }
    }
  }

  function drawBursts(): void {
    if (!ctx) return;
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
  }

  // ── HUD ──────────────────────────────────────────────────────────────────────
  function drawHealthBar(): void {
    if (!ctx) return;
    const x = 470;
    const y = 34;
    const w = 470;
    const frac = hp / hpMax;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(herald ? 'THE BOUND WORLD-EATER' : 'JÖRMUNGANDR', x, y - 7);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, w, 13);
    const bg = ctx.createLinearGradient(x, 0, x + w, 0);
    bg.addColorStop(0, herald ? '#ffd66e' : '#8fe0a0');
    bg.addColorStop(1, herald ? '#e0a94f' : '#4fb87a');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w * clamp01(frac), 13);
    // phase notches — the escalation is READABLE on the bar
    for (const f of FINALE_PHASES) {
      const nx = x + w * f;
      ctx.strokeStyle = hp <= hpMax * f ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(nx, y - 2);
      ctx.lineTo(nx, y + 15);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, 13);
    // under-gate: the last chunk visibly HOLDS — the honest "not enough gun" read
    if (!won && hp <= hpFloor + 0.5) {
      ctx.fillStyle = '#ff9a6a';
      ctx.font = '700 12.5px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(herald ? 'the last ward HOLDS — not enough gun' : 'its hide HOLDS — not enough gun', x + w, y + 32);
    }
  }

  function drawShieldPips(): void {
    if (!ctx) return;
    const x = 60;
    const y = 34;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SHIELDS', x, y - 7);
    const pw = Math.max(8, Math.min(22, Math.floor(240 / Math.max(1, shieldMax)) - 4));
    for (let i = 0; i < shieldMax; i++) {
      const lit = i < shield;
      ctx.fillStyle = lit ? '#7fc8ff' : 'rgba(120,130,150,0.25)';
      ctx.beginPath();
      ctx.moveTo(x + i * (pw + 4), y + 6);
      ctx.lineTo(x + i * (pw + 4) + pw / 2, y);
      ctx.lineTo(x + i * (pw + 4) + pw, y + 6);
      ctx.lineTo(x + i * (pw + 4) + pw, y + 13);
      ctx.lineTo(x + i * (pw + 4) + pw / 2, y + 17);
      ctx.lineTo(x + i * (pw + 4), y + 13);
      ctx.closePath();
      ctx.fill();
      if (lit) {
        ctx.strokeStyle = 'rgba(220,240,255,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  /** The weapon-glyph mini icon for a style (echoes the star-map reticle look, canvas-drawn). */
  function drawWeaponGlyph(style: FinaleWeaponStyle, x: number, y: number, col: string, col2: string): void {
    if (!ctx) return;
    ctx.save();
    ctx.translate(x, y);
    if (style === 'scatter') {
      ctx.fillStyle = col2;
      for (const [px, py] of [[-5, -3], [2, -5], [5, 2], [-2, 4], [0, 0]] as const) {
        ctx.beginPath();
        ctx.arc(px, py, 2.4, 0, 6.283);
        ctx.fill();
      }
    } else if (style === 'railgun') {
      ctx.fillStyle = col;
      ctx.fillRect(-9, -2.4, 15, 4.8);
      ctx.fillStyle = col2;
      ctx.fillRect(-6, -1.2, 13, 2.4);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(8, 0, 2.4, 0, 6.283);
      ctx.fill();
    } else if (style === 'nova') {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, 6.283);
      ctx.stroke();
      ctx.fillStyle = col2;
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = '#1a1030';
      ctx.beginPath();
      ctx.arc(0, 0, 1.8, 0, 6.283);
      ctx.fill();
    } else if (style === 'lance') {
      ctx.strokeStyle = col2;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-9, 3);
      ctx.lineTo(9, -3);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(9, -3, 2.2, 0, 6.283);
      ctx.fill();
    } else if (style === 'venom') {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(-6, -5);
      ctx.quadraticCurveTo(2, -2, 7, 6);
      ctx.quadraticCurveTo(-1, 2, -6, -5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = col2;
      ctx.beginPath();
      ctx.arc(7, 6, 1.8, 0, 6.283);
      ctx.fill();
    } else {
      ctx.fillStyle = col2;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }

  /** The multi-weapon HUD bar — one trigger per owned weapon, cooldown ring + hotkey. */
  function drawWeaponBar(): void {
    if (!ctx) return;
    weaponRects.length = 0;
    const n = loadout.weapons.length;
    const bw = Math.min(160, Math.floor((DW - 240) / Math.max(1, n)) - 10);
    const bh = 72; // deep buttons — they letterbox down to thumb-size on phones
    const y = DH - bh - 12;
    let x = 20;
    for (let i = 0; i < n; i++) {
      const w = loadout.weapons[i]!;
      const readyIn = Math.max(0, weaponReadyAt[i]! - now0);
      const ready = readyIn <= 0;
      const cdFrac = ready ? 1 : 1 - readyIn / w.cooldownMs;
      weaponRects.push({ x, y, w: bw, h: bh });
      // panel
      ctx.fillStyle = ready ? 'rgba(10,16,26,0.88)' : 'rgba(8,11,18,0.82)';
      ctx.strokeStyle = ready ? w.color : 'rgba(90,100,120,0.5)';
      ctx.lineWidth = ready ? 2 : 1.2;
      roundRect(ctx, x, y, bw, bh, 10);
      ctx.fill();
      roundRect(ctx, x, y, bw, bh, 10);
      ctx.stroke();
      // cooldown fill sweeping up from the bottom
      if (!ready) {
        ctx.save();
        roundRect(ctx, x, y, bw, bh, 10);
        ctx.clip();
        ctx.fillStyle = 'rgba(120,150,190,0.14)';
        ctx.fillRect(x, y + bh * (1 - cdFrac), bw, bh * cdFrac);
        ctx.restore();
      }
      // glyph + label + damage
      drawWeaponGlyph(w.style, x + 22, y + bh / 2, w.color, w.color2);
      ctx.fillStyle = ready ? '#eaf1fb' : 'rgba(200,210,225,0.55)';
      ctx.font = '800 14px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(w.name, x + 42, y + 31);
      ctx.fillStyle = ready ? w.color : 'rgba(160,170,190,0.5)';
      ctx.font = '600 12.5px system-ui, sans-serif';
      ctx.fillText(ready ? `⚡ ${w.damage} dmg` : `${(readyIn / 1000).toFixed(1)}s`, x + 42, y + 50);
      // ready pulse edge
      if (ready && interactive) {
        ctx.strokeStyle = `rgba(255,255,255,${0.2 + 0.2 * Math.sin(now0 / 220 + i)})`;
        ctx.lineWidth = 1;
        roundRect(ctx, x + 2.5, y + 2.5, bw - 5, bh - 5, 8);
        ctx.stroke();
      }
      x += bw + 10;
    }
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

  function phaseBanner(t: number): void {
    if (!ctx || now0 > phaseCaptionUntil || !phaseCaption) return;
    const left = (phaseCaptionUntil - now0) / 2600;
    const a = clamp01(left * 3) * clamp01((1 - left) * 6 + 0.3);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd9a0';
    ctx.font = '800 30px Georgia, serif';
    ctx.fillText(phaseCaption, DW / 2, 108 + Math.sin(t * 2) * 2);
    if (phaseCaptionSub) {
      ctx.fillStyle = '#cdd8e8';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillText(phaseCaptionSub, DW / 2, 134);
    }
    ctx.globalAlpha = 1;
  }

  function prompt(text: string, col: string, t: number): void {
    if (!ctx) return;
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 4);
    ctx.fillStyle = col;
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, DW / 2, DH - 106); // clears the deep weapon bar
    ctx.globalAlpha = 1;
  }

  // ── frame ────────────────────────────────────────────────────────────────────
  function frame(nowMs: number): void {
    if (finished || !ctx) return;
    if (!now0) {
      now0 = nowMs;
      last = nowMs;
      assaultStart = nowMs;
      nextAttackAt = nowMs + PHASE_ATTACK_MS[0];
      hintUntil = nowMs + 5200;
      const [cap, sub] = phaseLabel(phaseIdx === 0 ? 0 : phaseIdx);
      phaseCaption = cap;
      phaseCaptionSub = sub;
      phaseCaptionUntil = nowMs + 3400;
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
    if (shake > 0.4) ctx.translate((rng() - 0.5) * shake, (rng() - 0.5) * shake);

    if (phase === 'assault' || phase === 'overwhelm') {
      drawSpace(t, hitFlash * 0.55 + (phase === 'overwhelm' ? 0.12 : 0));
      drawSerpent(t, phase === 'overwhelm' ? clamp01((now0 - overwhelmStart) / 1600) * 0.4 : 0, 0);
      drawEnemyShots(t);
      drawPlayerShots(t);
      drawBursts();
      drawShip(t);
      drawHealthBar();
      drawShieldPips();
      drawWeaponBar();
      phaseBanner(t);
      if (interactive && now0 < hintUntil && phase === 'assault') {
        prompt('tap the field to FLY · tap a weapon to FIRE', '#ffe6a0', t);
      }
    } else if (phase === 'aim') {
      drawSpace(t, 0);
      // the REVEAL: the camera pushes to the head exactly like the fifth-Sigil teaser
      const focus = clamp01((now0 - aimStart) / 1400) * 0.95;
      drawSerpent(t, focus, 0);
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
      drawShip(t);
      drawShieldPips();
      if (interactive) {
        prompt(lash ? 'it lashes — steady…' : herald ? '🎯 TAP TO STRIKE THE SEAL' : '🎯 TAP TO STRIKE THE EYE', '#ffe6a0', t * 1.25);
      }
    } else if (phase === 'climax-win') {
      const e = nowMs - climaxStart;
      const ballT = clamp01(e / 380); // the golf ball streaks home first
      const p = clamp01((e - 380) / 1600);
      drawSpace(t, 0);
      if (herald) {
        // the seal breaks — the serpent RISES, and the stars begin to go out
        drawSerpent(t, 0.95, 0);
        const s = sealPos();
        if (ballT < 1) {
          drawSeal(t, false);
          const bx = lerp(ship.x + 30, s.x, ballT);
          const by = lerp(ship.y, s.y, ballT) - Math.sin(ballT * Math.PI) * 90;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(bx, by, 7, 0, 6.283);
          ctx.fill();
        } else {
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
        drawSerpent(t, 0.95, ballT < 1 ? 0 : p);
        if (ballT < 1) {
          const bx = lerp(ship.x + 30, anchors.eyeX, ballT);
          const by = lerp(ship.y, anchors.eyeY, ballT) - Math.sin(ballT * Math.PI) * 90;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(bx, by, 7, 0, 6.283);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - Math.abs(p - 0.25) / 0.25) * 0.8})`;
          ctx.fillRect(0, 0, DW, DH);
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
      drawSpace(t, (1 - p) * 0.6);
      drawSerpent(t, 0, 0);
      drawShip(t);
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

/** Rounded-rect path helper (canvas). */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
