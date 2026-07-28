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
 *   • THE HERALD FIGHTS THE WARDEN ARK, NOT THE SERPENT (GS-story-warden-ark). On the Coil road you are the
 *     serpent's liberator — what stands between you and the root is the Wardens' CAPITAL SHIP, your old
 *     friends at its helm. It used to be the serpent's head spitting venom at you, which made no sense on
 *     either count (the player report). The Ark is `paintWardenArk`, and it fights like a warship: FLAK
 *     bursts, spinal LANCE lock-ons, seeker TORPEDOES — the same three attack shapes on the same timings
 *     and the same dodgeable arcs, so the fight's balance and fairness are untouched and only the WEAPON
 *     changed. Both bosses return the same `BossAnchors`, so targeting, the muzzle and the golf finisher
 *     (the Ark's exposed reactor core / the serpent's bared eye) are one piece of code.
 *   • EVERY WEAPON IS ITS OWN TRIGGER. The bottom HUD seats one button per owned weapon upgrade
 *     (`FinaleLoadout.weapons` — scatter / railgun / nova / lance / wyrmfang), each with its own damage,
 *     cooldown ring and projectile style, so a stocked arsenal plays like an arsenal.
 *   • THE FIGHT IS A PHASE SCRIPT (sim `FINALE_PHASES`): at 75% health the serpent opens the ACID SPRAY
 *     (slow globes you fly around), 50% adds telegraphed LIGHTNING lines, 25% adds detonating VOID
 *     BLASTS, and at 5% one OVERWHELMING near-undodgeable barrage spends `FINALE_OVERWHELM_HITS` shield
 *     cells — survive it with shields in hand and the spent serpent bares its eye for the golf FINISHER.
 *     Phases key off health, so a maxed arsenal shortens the fight but never skips the gauntlet.
 *
 *   • IT IS A SET-PIECE, NOT A SKIRMISH (GS-story-battle-epic). The player report: *"given it's the final
 *     boss battle it should be pretty flashy and epic, and at the moment it is just fine."* Five spectacle
 *     rules answer it, all render-only — the fight's balance, spawns and fairness are untouched:
 *       1. THE BOSS ARRIVES. A 2.8s ENTRANCE (`battleIntro.ts`, pure) — it looms up out of the dark, its
 *          NAME slams on, it ROARS (shockwave · hitstop · frame kick), and only THEN does the HUD wipe in
 *          and the assault begin. You never used to see the boss arrive, so it never landed as the thing
 *          five Sigils were spent reaching. Tap skips the entrance (Skip still ends the fight).
 *       2. HITS BITE. Heavy damage buys HITSTOP (the whole world freezes for a beat — the single loudest
 *          impact trick there is), the boss FLINCHES back along the shot's own axis, the wound throws
 *          sparks and shrapnel, and the damage floats off it as a number. Nothing about damage changed.
 *       3. THE PHASE TURN IS A BEAT. A screen-wide shockwave that visibly BLOWS THE FIELD CLEAR, a wash in
 *          the phase's own colour, a hitstop, and the title slams instead of fading up.
 *       4. THE ARENA HAS A FLOOR AND A DEPTH. The dead black middle gains the ROOT the serpent is coiled
 *          round (Herald: the Warden fleet burning at anchor), two parallax layers of tumbling battle
 *          debris, and a distant storm that wakes with the phases.
 *       5. THE BOSS BAR IS A BOSS BAR. A framed plate with the name AND its epithet, a pale CHIP bar that
 *          drains a beat behind the real one (so you SEE what a nova took), phase notches, and a bar that
 *          runs hot as it empties.
 *     WHAT THIS DELIBERATELY DOES NOT DO: re-light the serpent for the turned camera. The player's other
 *     report — *"because all our graphics are side on it looks pretty weird"* — is real, and the obvious
 *     lever (rotating `paintSerpent`'s form-shading key light onto the screen's up) was BUILT AND THROWN
 *     AWAY: the beast is composed lying horizontally, so its dorsal/belly gradient runs across design +y.
 *     Point that at screen-up (design +x) and you are no longer lighting it from above, you are shading it
 *     along its own SPINE — the head, which is the focal point, falls into shadow. Shot side by side the
 *     two are near-indistinguishable. The side-on read is a property of turning a side-on COMPOSITION and
 *     only a portrait-authored pose fixes it; a light direction cannot.
 *
 *   • IT IS DRAWN AT THE ORIENTATION THE SCREEN HAS ROOM FOR (GS-story-battle-portrait). The fight is
 *     composed in a 1000×600 LANDSCAPE frame and the rest of the game is portrait, so on a phone it
 *     meet-fitted to a 390×234 strip between two slabs of black. There is no orientation lock worth
 *     having (none at all on iOS Safari, fullscreen-only on Android, a native plugin in the shell), so
 *     on a taller-than-wide screen the whole arena TURNS 90° instead: the boss looms at the top, your
 *     ship flies at the bottom, its fire rains down. Every piece of art was drawn facing along design
 *     +x, so it all comes along for free. `battleFrame.ts` owns that camera; the fight NEVER leaves
 *     design space, so nothing about its balance or fairness moves — only the HUD, which draws in its
 *     own always-upright frame.
 *
 * FAIR BY CONSTRUCTION: the deterministic gate verdict still rules what is POSSIBLE — under the breach
 * gate the hide holds at the hopeless floor (the serpent can be worn to it but never past); the Skip
 * button / reduced-motion (guarded at the call site) always resolve the ARMED verdict cleanly (never a
 * punishment). Self-contained (own mount/rAF/skip), everything vector-drawn or rasterized from the
 * game's own SVG art (no downloaded asset), zero sim rng (a private mulberry32 seeds the backdrop).
 * Keeps the `data-gs-storyfinale` overlay marker for the browser smoke.
 */

import { paintSerpent, type SerpentAnchors } from './sigilCeremony';
import { paintWardenArk, arkBatteryPos } from './wardenArk';
import { shipSVG } from './shipArt';
import { canvasRatio } from './pixelRatio';
import { safeAreaInsets } from './safeArea';
import {
  BATTLE_DW,
  BATTLE_DH,
  battleFrame,
  toDesignPoint,
  toHudPoint,
  designViewRect,
  arenaTopHud,
  type BattleFrame,
} from './battleFrame';
import { bossTitle, entryBeat, ENTRY_MS, ENTRY_ROAR_MS } from './battleIntro';
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

const DW = BATTLE_DW;
const DH = BATTLE_DH;

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
const WEAPON_BAR_H = 72; // deep triggers — they letterbox down to thumb-size on phones
// ── spectacle (GS-story-battle-epic) — pure feel; none of it touches damage, spawns or timing ──────────
const HITSTOP_HEAVY = 105; // ms the world freezes on a heavy hit — the loudest impact trick there is
const HITSTOP_LIGHT = 34;
const HITSTOP_PHASE = 150; // …and the phase turn gets the longest one
const FLINCH_K = 190; // boss recoil spring stiffness
const FLINCH_DAMP = 12;

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
  // GS-story-battle-epic: the fight OPENS on the entrance — the boss looms out of the dark, names itself
  // and roars before a single shot is fired. `entry` runs the beat; the assault starts when it ends.
  type Phase = 'entry' | 'assault' | 'overwhelm' | 'aim' | 'climax-win' | 'climax-lose';
  let phase: Phase = 'entry';
  const title = bossTitle(herald);
  let entryStart = 0;
  let entryRoared = false;
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
  // ── spectacle state (GS-story-battle-epic) ──
  let stopUntil = 0; // HITSTOP: the world holds still (draw, don't update) — impact you FEEL
  let animMs = 0; // the art clock, frozen by hitstop, so the boss stops mid-writhe with everything else
  let hpGhost = hp; // the pale CHIP bar chasing the real one down
  let barFlash = 0; // the boss bar lit on damage
  let phaseWash = 0; // the phase turn's full-frame colour wash
  let phaseWashCol = '120,255,180';
  let shieldBreakAt = -9e9; // the pip that just shattered
  /** The boss recoils along the shot's own axis and springs back — a body that takes the hit. */
  const flinch = { x: 0, y: 0, vx: 0, vy: 0 };

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
  // GS-story-battle-epic: the wound throws SPARKS and shrapnel, the damage floats off as a NUMBER, and a
  // phase turn sends a SHOCKWAVE across the whole field. All three are drawn in world space.
  type Spark = { x: number; y: number; vx: number; vy: number; born: number; life: number; col: string; len: number };
  const sparks: Spark[] = [];
  type DmgNum = { x: number; y: number; born: number; val: number; col: string; big: boolean };
  const dmgNums: DmgNum[] = [];
  type Wave = { x: number; y: number; born: number; life: number; r1: number; col: string; w: number };
  const waves: Wave[] = [];

  let anchors: SerpentAnchors = { eyeX: 730, eyeY: 300, eyeR: 18, browX: 720, browY: 250, headH: 46, headAng: 3 };
  // GS-story-serpent-2: pulled left from 1040 so the great coil behind the skull stays on-canvas —
  // the boss now rears out of its own coils instead of a lone head poking in from the wing.
  const SERPENT_CX = 950;
  const SERPENT_CY = 200;
  // GS-story-warden-ark: the HERALD's boss is not the serpent — it is the Wardens' capital ship, come to
  // hold the seal you mean to break. It sits a shade further in-field than the serpent's head so the whole
  // hull (and the reactor core amidships, the finisher's target) stays on canvas.
  const ARK_CX = 760;
  const ARK_CY = 250;
  const POSE_T = 1.5; // held pose for the aim reveal (keeps the head framed + targetable)

  let raf = 0;
  let last = 0;
  let now0 = 0;
  let finished = false;
  let dpr = 1;
  let cssW = 0;
  let cssH = 0;
  /** The camera: which way the arena is turned, and the upright HUD frame beside it (GS-story-battle-portrait). */
  let view: BattleFrame = battleFrame(DW, DH);

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
  // GS-story-battle-epic: the arena's DEPTH rides its OWN seeded stream, so adding scenery cannot shift a
  // single draw of the stream that spawns the boss's volleys (`rng`) — the fight's pattern is untouched.
  const drng = mulberry32(0x1d4b07 ^ (herald ? 0x77 : 0x11));
  /** Tumbling battle wreckage in two parallax layers — the deep is a battlefield, not a backdrop. */
  type Debris = { x: number; y: number; r: number; spin: number; ang: number; layer: number; k: number };
  const debris: Debris[] = Array.from({ length: 26 }, (_, i) => ({
    x: drng() * (DW + 200) - 100,
    y: drng() * DH,
    r: 3 + drng() * (i % 5 === 0 ? 13 : 6),
    spin: (drng() - 0.5) * 0.9,
    ang: drng() * 6.28,
    layer: 1 + (i % 2),
    k: Math.floor(drng() * 4),
  }));
  /** The burning Warden fleet at anchor behind the Ark (Herald), or the far watch-lights (Warden). */
  const farFleet = Array.from({ length: 7 }, () => ({
    x: 520 + drng() * 460,
    y: 40 + drng() * 520,
    s: 0.5 + drng() * 0.8,
    burn: drng(),
  }));

  function resize(): void {
    if (!ctx) return;
    dpr = canvasRatio();
    cssW = overlay.clientWidth || window.innerWidth;
    cssH = overlay.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    // A turned frame hugs the screen edges, so its HUD has to clear the notch / home indicator; the
    // classic landscape frame sits inside its own letterbox and never did.
    view = battleFrame(cssW, cssH, safeAreaInsets());
    // Skip must never sit under the weapon bar, and a turned bar spans the full width — so it moves to
    // the top corner exactly when the arena turns.
    skip.style.top = view.rotated ? 'calc(16px + env(safe-area-inset-top, 0px))' : '';
    skip.style.bottom = view.rotated ? '' : '16px';
  }

  /** The WORLD transform: design space, turned to match the screen. Everything the fight simulates draws here. */
  function applyWorld(shx: number, shy: number): void {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(view.offX, view.offY);
    ctx.scale(view.scale, view.scale);
    if (view.rotated) {
      ctx.translate(0, DW);
      ctx.rotate(-Math.PI / 2);
    }
    ctx.translate(shx, shy);
  }

  /** The HUD transform: ALWAYS upright, whatever the arena did. Readouts, triggers and captions draw here. */
  function applyHud(shx: number, shy: number): void {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(view.hudX, view.hudY);
    ctx.scale(view.scale, view.scale);
    ctx.translate(shx, shy);
  }

  /** Fill the whole VISIBLE screen in world space — a full-frame wash must cover the letterbox bands too. */
  function fillView(): void {
    if (!ctx) return;
    const v = designViewRect(view, cssW, cssH);
    ctx.fillRect(v.x, v.y, v.w, v.h);
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
    return toDesignPoint(view, e.clientX - r.left, e.clientY - r.top);
  }

  function toHud(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = overlay.getBoundingClientRect();
    return toHudPoint(view, e.clientX - r.left, e.clientY - r.top);
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

  /** A tap: `d` in arena design space (where the ship flies), `h` in upright HUD space (the triggers). */
  function onTap(d: { x: number; y: number }, h: { x: number; y: number }): void {
    if (finished || !interactive) return;
    // GS-story-battle-epic: a tap during the ENTRANCE skips to the fight (Skip still ends the battle) —
    // the beat is a showpiece, not a wall, and the second time through you may not want it.
    if (phase === 'entry') {
      if (now0) beginAssault(); // …but never before the first frame has set the clock
      return;
    }
    if (phase === 'aim' && !struck) {
      if (now0 < lashUntil) return;
      const t = now0 / 1000;
      // The sweep is ONE offset, so the strike tolerance is identical whichever axis it is drawn on.
      const dx = Math.abs(reticleOffset(t));
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
      if (h.x >= r.x && h.x <= r.x + r.w && h.y >= r.y && h.y <= r.y + r.h) {
        fireWeapon(i);
        return;
      }
    }
    ship.tx = clamp(d.x, SHIP_MIN_X, SHIP_MAX_X);
    ship.ty = clamp(d.y, SHIP_MIN_Y, SHIP_MAX_Y);
    moveMark = 1;
    moveMarkX = ship.tx;
    moveMarkY = ship.ty;
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') skipToEnd();
    else if (e.key >= '1' && e.key <= '5') fireWeapon(Number(e.key) - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (phase === 'aim') onTap({ x: DW / 2, y: DH / 2 }, { x: -1, y: -1 });
      else fireWeapon(weaponReadyAt.findIndex((t) => now0 >= t));
    }
  };
  skip.addEventListener('click', (e) => {
    e.stopPropagation();
    skipToEnd();
  });
  overlay.addEventListener('pointerdown', (e) => {
    onTap(toDesign(e), toHud(e));
  });
  window.addEventListener('keydown', onKey);

  // ── boss attack patterns ─────────────────────────────────────────────────────
  /** Where the volleys come FROM: the serpent's maw, or the Ark's lance batteries (GS-story-warden-ark).
   *  One seam, so every attack spawner is boss-agnostic. */
  const muzzlePos = (): { x: number; y: number } =>
    herald
      ? arkBatteryPos(anchors)
      : { x: anchors.browX + anchors.headH * 0.7, y: anchors.browY + anchors.headH * 1.6 };

  /** A fan of the boss's bread-and-butter shot: the serpent SPITS acid, the Ark walks FLAK across the
   *  field. Same slow, dodgeable arcs (the fairness the fight is built on) — a different weapon. */
  function spawnAcidFan(count: number, aimed: boolean): void {
    const m = muzzlePos();
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

  /** The telegraphed line: the serpent CALLS LIGHTNING, the Ark's spinal LANCE locks on. Both draw a
   *  warning across the field first — leave the line before it fires. */
  function spawnBolt(targetY?: number): void {
    const y = targetY ?? ship.y + (rng() - 0.5) * 40;
    // The serpent CALLS the bolt down across the field (it arrives from the dark); the Ark's spinal lance
    // is FIRED — so on the Herald path the line starts at the battery that fires it and runs out past you.
    const m = muzzlePos();
    const from = herald ? { x: m.x, y: m.y } : { x: -30, y: y + (rng() - 0.5) * 30 };
    const to = herald ? { x: -30, y: y + (rng() - 0.5) * 30 } : { x: anchors.browX, y };
    enemyShots.push({
      kind: 'bolt',
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      fireAt: now0 + BOLT_TELEGRAPH_MS,
      doneAt: now0 + BOLT_TELEGRAPH_MS + BOLT_ACTIVE_MS,
      hit: false,
    });
  }

  /** The heavy round: a collapsing VOID orb from the serpent, a seeker TORPEDO from the Ark. Both fly a
   *  fuse and then detonate into an expanding ring. */
  function spawnVoid(): void {
    const e = herald ? muzzlePos() : { x: anchors.eyeX, y: anchors.eyeY };
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
      // GS-story-warden-ark: a WARDEN warship's escalation — flak, then the spinal lances, then torpedoes.
      return (
        [
          ['THE ARK COMES ABOUT', 'tap the field to fly · tap a weapon to fire'],
          ['⚠ FLAK CURTAIN', 'the batteries find their range — fly around the bursts'],
          ['⚠ LANCE BATTERIES', 'a lance locks on — leave the marked line before it fires'],
          ['⚠ TORPEDO SALVO', 'seeker warheads detonate into shock rings — keep your distance'],
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
  /** The phase colours — each escalation washes the sky in the weapon it just unlocked, in ITS OWN boss's
   *  palette. (The first pass washed the Ark's entrance in serpent green, which flattened a cold ivory
   *  warship to a pale sage smear for a beat.) */
  const PHASE_WASH = herald
    ? (['170,205,255', '255,200,140', '200,225,255', '255,170,120'] as const)
    : (['120,255,180', '150,255,150', '190,220,255', '190,140,255'] as const);

  /**
   * A ROAR (GS-story-battle-epic) — the boss's set-piece beat, fired on the entrance and on every phase
   * turn. A shockwave crosses the whole field and visibly BLOWS THE VOLLEYS AWAY (the escalation is felt,
   * not just captioned), the sky takes the new phase's colour, and the world holds still for a moment.
   * Pure spectacle: it never spawns, damages, or changes what the next volley will be.
   */
  function bossRoar(idx: number, wash = 1): void {
    const src = herald ? { x: ARK_CX, y: ARK_CY } : { x: anchors.browX, y: anchors.browY };
    phaseWashCol = PHASE_WASH[Math.min(idx, PHASE_WASH.length - 1)]!;
    phaseWash = wash;
    stopUntil = Math.max(stopUntil, now0 + HITSTOP_PHASE);
    waves.push({ x: src.x, y: src.y, born: now0, life: 1100, r1: 1500, col: phaseWashCol, w: 9 });
    waves.push({ x: src.x, y: src.y, born: now0 + 120, life: 900, r1: 1100, col: '255,255,255', w: 3 });
    // the front pushes the field: acid and orbs are thrown outward, then the fight resumes
    for (const s of enemyShots) {
      if (s.kind === 'bolt') continue;
      const a = Math.atan2(s.y - src.y, s.x - src.x);
      s.vx += Math.cos(a) * 260;
      s.vy += Math.sin(a) * 260;
    }
  }

  /**
   * GS-story-battle-epic: the WOUND. Sparks + shrapnel thrown back along the shot's own axis, the damage
   * floating off as a number, the boss flinching, and a HITSTOP scaled to the blow. Zero rng from the
   * fight's stream (see `drng`) and zero balance — the damage was already applied.
   */
  function dressHit(x: number, y: number, w: FinaleWeapon, heavy: boolean): void {
    // the incoming axis: the wound sprays BACK toward the ship that made it
    const ax = Math.atan2(ship.y - y, ship.x - x);
    const n = heavy ? 16 : 8;
    for (let k = 0; k < n; k++) {
      const a = ax + (drng() - 0.5) * 2.4;
      const sp = (heavy ? 190 : 130) * (0.45 + drng());
      sparks.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        born: now0,
        life: 320 + drng() * (heavy ? 480 : 260),
        col: drng() < 0.4 ? '#ffffff' : w.color2,
        len: heavy ? 9 + drng() * 12 : 5 + drng() * 6,
      });
    }
    dmgNums.push({ x, y, born: now0, val: w.damage, col: w.color2, big: heavy });
    // recoil: an impulse AWAY from the shooter, sprung back by `flinch`'s damped spring
    const push = heavy ? 15 : 6;
    flinch.vx -= Math.cos(ax) * push * 9;
    flinch.vy -= Math.sin(ax) * push * 9;
    stopUntil = Math.max(stopUntil, now0 + (heavy ? HITSTOP_HEAVY : HITSTOP_LIGHT));
    barFlash = 1;
  }

  function landPlayerHit(x: number, y: number, w: FinaleWeapon): void {
    const before = hp;
    hp = Math.max(hpFloor, hp - w.damage);
    const heavy = w.damage >= 30;
    bursts.push({ x, y, at: now0, col: w.color2, big: heavy });
    dressHit(x, y, w, heavy);
    if (heavy) shake = Math.max(shake, 9);
    // phase turns: the serpent escalates as its health falls (each threshold crossed once)
    while (phaseIdx < FINALE_PHASES.length - 1 && hp <= hpMax * FINALE_PHASES[phaseIdx]!) {
      phaseIdx += 1;
      roar = 1;
      shake = Math.max(shake, 16);
      shield = Math.min(shieldMax, shield + FINALE_PHASE_REGEN); // the breather beat
      const [cap, sub] = phaseLabel(phaseIdx);
      phaseCaption = cap;
      phaseCaptionSub = sub;
      phaseCaptionUntil = now0 + 2600;
      bossRoar(phaseIdx);
      opts.onPhase?.();
    }
    // the 5% OVERWHELM — the climax barrage (only an armed ship can get here; the floor sits above it)
    if (phase === 'assault' && won && hp <= hpMax * FINALE_PHASES[3]! && before > hpFloor) {
      phase = 'overwhelm';
      overwhelmStart = now0;
      overwhelmHitsDealt = 0;
      enemyShots.length = 0; // the field clears for the set-piece
      shake = 12;
      phaseCaption = herald ? 'THE ARK FIRES EVERYTHING' : 'THE WORLD-EATER UNCOILS';
      phaseCaptionSub = 'an overwhelming barrage — your shields must hold';
      phaseCaptionUntil = now0 + 3000;
      bossRoar(3);
      opts.onPhase?.();
    }
  }

  function shipHit(undodgeable = false): void {
    if (!undodgeable && now0 < invulnUntil) return;
    invulnUntil = now0 + INVULN_MS;
    shield -= 1;
    hitFlash = 1;
    shake = Math.max(shake, 8);
    shieldBreakAt = now0; // the pip SHATTERS on the HUD — losing a cell has to land
    stopUntil = Math.max(stopUntil, now0 + HITSTOP_LIGHT);
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
    // ── spectacle (GS-story-battle-epic) ──
    barFlash = Math.max(0, barFlash - dts * 3.4);
    phaseWash = Math.max(0, phaseWash - dts * 2.1);
    // the boss's recoil, a damped spring back to station (never far enough to move the fight)
    flinch.vx += (-FLINCH_K * flinch.x - FLINCH_DAMP * flinch.vx) * dts;
    flinch.vy += (-FLINCH_K * flinch.y - FLINCH_DAMP * flinch.vy) * dts;
    flinch.x = clamp(flinch.x + flinch.vx * dts, -22, 22);
    flinch.y = clamp(flinch.y + flinch.vy * dts, -22, 22);
    // the chip bar chases the real one down — a beat behind, so a nova's bite is VISIBLE
    hpGhost += (hp - hpGhost) * Math.min(1, dts * 3.4);
    if (hpGhost < hp) hpGhost = hp;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i]!;
      if (now0 - s.born > s.life) {
        sparks.splice(i, 1);
        continue;
      }
      s.x += s.vx * dts;
      s.y += s.vy * dts;
      s.vx *= 1 - Math.min(0.9, dts * 2.2);
      s.vy *= 1 - Math.min(0.9, dts * 2.2);
    }
    for (let i = dmgNums.length - 1; i >= 0; i--) if (now0 - dmgNums[i]!.born > 900) dmgNums.splice(i, 1);
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i]!;
      if (now0 - w.born > w.life) waves.splice(i, 1);
    }

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
        phaseCaption = herald ? 'THE REACTOR LIES BARE' : 'ITS EYE IS BARED';
        phaseCaptionSub = herald ? 'strike the core and break the blockade' : 'strike the ball home';
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
  /**
   * THE ROOT (GS-story-battle-epic) — the colossal world-root the whole campaign has been about: what the
   * serpent is coiled round, and what the Ark's blockade is holding shut. It sweeps across the far deep as
   * a dark silhouette with a rim of light and a few live seams, so the arena's middle is a PLACE rather
   * than the black gap between two sprites. Pure geometry off a fixed curve — no rng, no state.
   */
  function drawRoot(t: number): void {
    if (!ctx) return;
    // A tapering band along a fixed quadratic: it enters from behind the boss and runs out past the player.
    const P0 = { x: DW + 120, y: 620 };
    const P1 = { x: 480, y: 180 };
    const P2 = { x: -140, y: 40 };
    const N = 24;
    const pts: { x: number; y: number; nx: number; ny: number; w: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const iv = 1 - u;
      const x = iv * iv * P0.x + 2 * iv * u * P1.x + u * u * P2.x;
      const y = iv * iv * P0.y + 2 * iv * u * P1.y + u * u * P2.y;
      const dx = 2 * iv * (P1.x - P0.x) + 2 * u * (P2.x - P1.x);
      const dy = 2 * iv * (P1.y - P0.y) + 2 * u * (P2.y - P1.y);
      const l = Math.hypot(dx, dy) || 1;
      // narrow where it runs away behind the boss, broad where it passes the player — the taper IS the
      // depth cue, and it is what stops the silhouette reading as a painted stripe
      const wob = Math.sin(u * 11.3) * 9 + Math.sin(u * 4.1 + 2.2) * 14;
      pts.push({ x, y, nx: -dy / l, ny: dx / l, w: 46 + 150 * u + wob });
    }
    const edge = (sign: number): void => {
      for (let i = 0; i <= N; i++) {
        const p = sign > 0 ? pts[i]! : pts[N - i]!;
        const x = p.x + p.nx * p.w * sign;
        const y = p.y + p.ny * p.w * sign;
        if (i === 0 && sign > 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    };
    // It sits FAR back: everything about it is drawn at a fraction of strength, because a backdrop that
    // competes with the boss is not depth — it is a second subject. (First pass shipped a bright diagonal
    // that read as a strip of grass laid across the fight.)
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.beginPath();
    edge(1);
    edge(-1);
    ctx.closePath();
    ctx.fillStyle = herald ? 'rgba(4,7,13,0.95)' : 'rgba(4,9,8,0.95)';
    ctx.fill();
    // bark strata + live seams: a handful of glowing veins running the length of it
    ctx.save();
    ctx.clip();
    for (let k = -3; k <= 3; k++) {
      const off = k / 3.4;
      const live = k % 2 === 0;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const p = pts[i]!;
        const wob = Math.sin(i * 0.7 + k * 1.9) * 9;
        const x = p.x + p.nx * (p.w * off + wob);
        const y = p.y + p.ny * (p.w * off + wob);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (live) {
        const pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.7 + k));
        ctx.strokeStyle = herald ? `rgba(120,170,225,${0.05 * pulse})` : `rgba(90,220,155,${0.06 * pulse})`;
        ctx.lineWidth = 3.4;
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 7;
      }
      ctx.stroke();
    }
    ctx.restore();
    // the rim the boss's own light catches — the silhouette needs ONE lit edge or it is a hole in the sky
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const p = pts[i]!;
      const x = p.x + p.nx * p.w;
      const y = p.y + p.ny * p.w;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = herald ? 'rgba(150,195,240,0.12)' : 'rgba(100,225,165,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /** The far fleet: the Order's blockade burning at anchor (Herald), or distant watch-lights (Warden). */
  function drawFarFleet(t: number): void {
    if (!ctx) return;
    for (const f of farFleet) {
      const bob = Math.sin(t * 0.3 + f.burn * 6) * 3;
      ctx.save();
      ctx.translate(f.x, f.y + bob);
      ctx.scale(f.s, f.s);
      ctx.rotate(-0.4);
      if (herald) {
        ctx.fillStyle = 'rgba(120,140,175,0.45)';
        ctx.fillRect(-26, -3, 52, 6);
        ctx.fillStyle = 'rgba(150,175,215,0.4)';
        ctx.fillRect(-8, -8, 16, 16);
        // guttering fires along the hull — the blockade is already paying for this
        const fl = 0.5 + 0.5 * Math.sin(t * 5 + f.burn * 9);
        ctx.fillStyle = `rgba(255,170,90,${0.25 + 0.35 * fl * f.burn})`;
        ctx.beginPath();
        ctx.arc(10, -2, 3 + fl * 2.5, 0, 6.283);
        ctx.fill();
      } else {
        const tw = 0.4 + 0.6 * Math.sin(t * 1.1 + f.burn * 7);
        ctx.fillStyle = `rgba(150,230,190,${0.16 * tw})`;
        ctx.beginPath();
        ctx.arc(0, 0, 4.5, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Tumbling wreckage drifting through the field, two parallax layers — the deep is in motion. */
  function drawDebris(t: number): void {
    if (!ctx) return;
    for (const d of debris) {
      const drift = (t * 8 * d.layer) % (DW + 200);
      const x = (((d.x - drift) % (DW + 200)) + DW + 200) % (DW + 200) - 100;
      const a = d.ang + t * d.spin;
      ctx.save();
      ctx.translate(x, d.y);
      ctx.rotate(a);
      ctx.fillStyle = d.layer === 1 ? 'rgba(46,56,74,0.5)' : 'rgba(72,86,112,0.6)';
      ctx.beginPath();
      if (d.k === 0) {
        ctx.fillRect(-d.r, -d.r * 0.35, d.r * 2, d.r * 0.7);
      } else if (d.k === 1) {
        ctx.moveTo(-d.r, -d.r * 0.6);
        ctx.lineTo(d.r, -d.r * 0.2);
        ctx.lineTo(d.r * 0.4, d.r * 0.8);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.moveTo(-d.r, 0);
        ctx.lineTo(-d.r * 0.2, -d.r * 0.8);
        ctx.lineTo(d.r * 0.9, -d.r * 0.3);
        ctx.lineTo(d.r * 0.3, d.r * 0.7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawSpace(t: number, flash: number): void {
    if (!ctx) return;
    // The deep runs top-of-SCREEN to bottom-of-screen, so its axis follows the turn — and it covers the
    // whole visible frame, bands included, or the letterbox reads as a seam against the flat overlay.
    const v = designViewRect(view, cssW, cssH);
    const g = view.rotated
      ? ctx.createLinearGradient(v.x + v.w, 0, v.x, 0)
      : ctx.createLinearGradient(0, v.y, 0, v.y + v.h);
    g.addColorStop(0, '#05060f');
    g.addColorStop(0.5, '#090714');
    g.addColorStop(1, '#04060e');
    ctx.fillStyle = g;
    fillView();
    // seeded nebula washes (the star-map family look)
    for (const n of nebulae) {
      const ng = ctx.createRadialGradient(n.x, n.y, 10, n.x, n.y, n.r);
      ng.addColorStop(0, `rgba(${n.hue},${n.a})`);
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng;
      ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    // three parallax star layers, drifting slowly toward the serpent (a battlefield in motion). During the
    // ENTRANCE they STREAK: the camera is closing on the boss, and a rushing deep says so (GS-story-battle-epic).
    const streak = phase === 'entry' ? entryBeat(now0 - entryStart).streak : 0;
    for (const s of stars) {
      const drift = (t * 2.2 * s.layer) % (DW + 40);
      const x = ((s.x - drift) % (DW + 40) + DW + 40) % (DW + 40) - 20;
      const tw = 0.45 + 0.55 * Math.sin(t * 1.6 + s.tw);
      ctx.globalAlpha = (0.16 + s.layer * 0.1) * tw;
      ctx.fillStyle = s.layer === 3 ? '#dfe8ff' : '#aabdd8';
      const rr = s.r * (0.7 + s.layer * 0.15);
      if (streak > 0.02) {
        // the streak runs back down the approach line (design −x), longest on the nearest layer
        const len = streak * (26 + s.layer * 34);
        ctx.strokeStyle = s.layer === 3 ? '#dfe8ff' : '#aabdd8';
        ctx.lineWidth = rr * 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, s.y);
        ctx.lineTo(x - len, s.y);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, s.y, rr, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    // THE PLACE, behind everything the fight puts in front of it (GS-story-battle-epic)
    drawRoot(t);
    drawFarFleet(t);
    drawDebris(t);
    // …and a distant storm that wakes with the phases — the far deep answering the boss
    if (phaseIdx >= 2) {
      const beat = Math.sin(t * 0.9) * Math.sin(t * 3.7 + 1.3);
      const strike = Math.max(0, beat - 0.72) / 0.28;
      if (strike > 0) {
        const sx = 300 + ((phaseIdx * 211) % 400);
        const sg = ctx.createRadialGradient(sx, 90, 10, sx, 90, 300);
        const col = herald ? '190,215,255' : '150,255,200';
        sg.addColorStop(0, `rgba(${col},${strike * 0.22})`);
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(sx - 300, -210, 600, 600);
      }
    }
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
    // the light bleeding in from the boss's side — the serpent's corruption green, or the Ark's cold halo
    const haze = herald
      ? ctx.createRadialGradient(ARK_CX, ARK_CY, 60, ARK_CX, ARK_CY, 560)
      : ctx.createRadialGradient(860, 260, 60, 860, 260, 560);
    haze.addColorStop(0, herald ? `rgba(150,190,255,${0.1 + roar * 0.08})` : `rgba(60,200,140,${0.1 + roar * 0.08})`);
    haze.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = haze;
    fillView();
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,120,80,${flash * 0.32})`;
      fillView();
    }
    // the phase turn's colour wash — the whole sky takes the boss's escalation (GS-story-battle-epic)
    if (phaseWash > 0) {
      ctx.fillStyle = `rgba(${phaseWashCol},${phaseWash * 0.2})`;
      fillView();
    }
  }

  /** How far the boss has been worn down, 0 → 1 — the serpent's waking level and the Ark's battle damage
   *  are the same number read two ways (the Warden fights a serpent already wide awake). */
  const worn = (): number => 1 - hp / hpMax;

  /** Paint the boss for this path: the world-serpent (Warden) or the Warden Ark (Herald). ONE anchors
   *  seam, so everything downstream — targeting, the muzzle, the finisher — is boss-agnostic. */
  /** Which way is UP on the SCREEN, in design units — the turned camera rotates design +x to screen up.
   *  Anything that has to read as UPRIGHT (a floating damage number and the way it rises) asks this
   *  rather than assuming the design frame's own vertical. */
  const screenUp = (): { x: number; y: number } => (view.rotated ? { x: 1, y: 0 } : { x: 0, y: -1 });

  /**
   * How big the boss is drawn (GS-story-battle-epic). A TURNED frame is the tall one — it has the room,
   * and the final boss should crowd the sky rather than sit politely in the top third — so portrait gets
   * a fifth again. Landscape stays at 1, so the shipped landscape fight is unchanged.
   *
   * The scale is about a FIXED pivot near the head/bow, so the end the player shoots at (and the maw the
   * volleys come out of) barely moves: the beast grows AWAY from you, into the deep.
   */
  const bossScale = (): number => (view.rotated ? 1.18 : 1);
  const bossPivot = (): { x: number; y: number } =>
    herald ? { x: ARK_CX - 130, y: ARK_CY } : { x: SERPENT_CX - 310, y: SERPENT_CY + 42 };

  function drawBoss(t: number, focus: number, dim: number): void {
    if (!ctx) return;
    if (dim > 0) ctx.globalAlpha = 1 - dim;
    const tPose = focus > 0 ? lerp(t, POSE_T + 0.06 * Math.sin(t * 0.9), Math.min(1, focus / 0.6)) : t;
    // the maw gapes / the batteries flare around each volley: winds up as the attack builds, fires, settles
    const fighting = phase === 'assault' || phase === 'overwhelm';
    const windUp = clamp01(1 - (nextAttackAt - now0) / 380);
    const spit = clamp01(1 - (now0 - lastVolleyAt) / 520);
    const rage = fighting ? Math.max(windUp * 0.85, spit) : 0;
    // GS-story-battle-epic: the ENTRANCE looms the boss up out of the dark (small + faint + set back), and
    // every hit FLINCHES it along the shot's own axis. Both ride the anchor position, so the aim, the
    // muzzle and the finisher all track the drawn body — one description of where the boss is.
    let cx = herald ? ARK_CX : SERPENT_CX;
    let cy = herald ? ARK_CY : SERPENT_CY;
    cx += flinch.x;
    cy += flinch.y;
    // …and it releases back to 1 as the aim REVEAL pushes in: that framing is already composed around the
    // bared eye / reactor core, and stacking the portrait boost on top pushes the target off the frame.
    let s = lerp(bossScale(), 1, clamp01(focus));
    if (phase === 'entry') {
      // NB the fade is a VEIL over the whole frame, not `globalAlpha` — `paintWardenArk` resets alpha to 1
      // mid-hull, so an alpha fade would tear the Ark in half. The dark parting reads better anyway.
      const b = entryBeat(now0 - entryStart);
      s *= lerp(0.62, 1, b.loom);
      cx += (1 - b.loom) * 210; // set back into the dark, off past the boss's own side of the frame
    }
    const pv = bossPivot();
    ctx.save();
    if (s !== 1) {
      ctx.translate(pv.x, pv.y);
      ctx.scale(s, s);
      ctx.translate(-pv.x, -pv.y);
    }
    const raw = herald
      ? paintWardenArk(ctx, cx, cy, tPose, worn(), focus + roar * 0.08, { rage })
      : // its haze covers the frame WE have, not the ceremony's — a turned camera sees past the design box
        paintSerpent(ctx, cx, cy, tPose, 1, focus + roar * 0.12, {
          rage,
          frame: designViewRect(view, cssW, cssH),
        });
    ctx.restore();
    // The painters return anchors in their OWN pre-scale space, so map them through the same uniform
    // scale — there is one description of where the boss is, and targeting/muzzle/finisher all read it.
    anchors =
      s === 1
        ? raw
        : {
            eyeX: pv.x + (raw.eyeX - pv.x) * s,
            eyeY: pv.y + (raw.eyeY - pv.y) * s,
            eyeR: raw.eyeR * s,
            browX: pv.x + (raw.browX - pv.x) * s,
            browY: pv.y + (raw.browY - pv.y) * s,
            headH: raw.headH * s,
            headAng: raw.headAng,
          };
    ctx.globalAlpha = 1;
  }

  /** The FINISHER's target: the Ark's exposed reactor core, or the serpent's bared eye. Both ride the same
   *  anchor, so the aim phase, the reticle and the ball flight are one piece of code. */
  const coreTarget = (): { x: number; y: number; r: number } => ({
    x: anchors.eyeX,
    y: anchors.eyeY,
    r: herald ? anchors.eyeR * 1.6 : anchors.headH * 0.55,
  });
  const aimTarget = (): { x: number; y: number } => ({ x: anchors.eyeX, y: anchors.eyeY });
  /** The sweep is ONE offset — the strike test reads it directly, so the tolerance can't drift per axis. */
  const reticleOffset = (t: number): number => Math.sin(t * SWEEP_SPEED) * SWEEP_AMP;
  /** …and it is DRAWN across the boss's face on SCREEN: design x when flat, design y when turned. */
  const reticleAt = (t: number, target: { x: number; y: number }): { x: number; y: number } => {
    const o = reticleOffset(t);
    return view.rotated ? { x: target.x, y: target.y + o } : { x: target.x + o, y: target.y };
  };

  /** GS-story-warden-ark: the exposed REACTOR CORE, laid bare when the Ark's hull finally fails — the
   *  Herald finisher's target (the serpent's bared eye needs no ring; the Ark's core does). */
  function drawCoreTarget(t: number, lash: boolean): void {
    if (!ctx) return;
    const s = coreTarget();
    const pulse = 0.7 + 0.3 * Math.sin(t * 2.6);
    const glow = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, s.r * 1.8);
    glow.addColorStop(0, `rgba(190,235,255,${0.45 * pulse})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * 1.8, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = lash ? 'rgba(255,120,80,0.95)' : `rgba(255,224,138,${0.9 * pulse})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, 6.283);
    ctx.stroke();
    // containment vanes venting light — a reactor coming apart, not a rune
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * pulse})`;
    ctx.lineWidth = 2.4;
    for (let k = 0; k < 6; k++) {
      const a = k * 1.047 + t * 0.5;
      ctx.beginPath();
      ctx.moveTo(s.x + Math.cos(a) * s.r * 0.45, s.y + Math.sin(a) * s.r * 0.45);
      ctx.lineTo(s.x + Math.cos(a) * s.r * 0.95, s.y + Math.sin(a) * s.r * 0.95);
      ctx.stroke();
    }
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
      if (s.kind === 'acid' && herald) {
        // GS-story-warden-ark: the Ark fires FLAK, not venom — a hard shell in a burst of gold sparks,
        // travelling the same slow, readable arc the acid globe did (the fight's fairness is unchanged).
        const wob = Math.sin(t * 5 + s.wob) * 2;
        const y = s.y + wob;
        const ta = Math.atan2(s.vy, s.vx);
        const g = ctx.createRadialGradient(s.x, y, 1, s.x, y, s.r * 2.2);
        g.addColorStop(0, 'rgba(255,236,190,0.55)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, y, s.r * 2.2, 0, 6.283);
        ctx.fill();
        // the smoke-and-spark trail
        ctx.strokeStyle = 'rgba(210,222,240,0.28)';
        ctx.lineWidth = s.r * 0.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x - Math.cos(ta) * s.r * 3.2, y - Math.sin(ta) * s.r * 3.2);
        ctx.lineTo(s.x, y);
        ctx.stroke();
        ctx.lineCap = 'butt';
        // the shell itself — a bright slug with a gold burst around it
        ctx.save();
        ctx.translate(s.x, y);
        ctx.rotate(ta);
        ctx.fillStyle = '#ffe08a';
        ctx.beginPath();
        ctx.ellipse(0, 0, s.r * 0.95, s.r * 0.62, 0, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(s.r * 0.25, 0, s.r * 0.42, s.r * 0.3, 0, 0, 6.283);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,246,214,${0.5 + 0.35 * Math.sin(t * 12 + s.wob)})`;
        ctx.lineWidth = 1.6;
        for (let k = 0; k < 4; k++) {
          const a = k * 1.57 + t * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * s.r * 0.9, Math.sin(a) * s.r * 0.9);
          ctx.lineTo(Math.cos(a) * s.r * 1.7, Math.sin(a) * s.r * 1.7);
          ctx.stroke();
        }
        ctx.restore();
      } else if (s.kind === 'acid') {
        const wob = Math.sin(t * 5 + s.wob) * 2;
        const acid = '110,230,120';
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
          // the warning glyph sits at the screen edge — whichever end of the line runs off it
          ctx.fillText(herald ? '⚔' : '⚡', 8, (s.x1 < s.x2 ? s.y1 : s.y2) - 8);
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
        // GS-story-warden-ark: the Ark's heavy round is a seeker TORPEDO — a lit warhead running a fuse,
        // then a white shock ring. The serpent's is a void orb collapsing into a violet rift. Same flight,
        // same fuse, same ring radius: only the weapon changed.
        const col = herald ? '190,235,255' : '170,120,255';
        if (sinceDet < 0) {
          if (herald) {
            const ta = Math.atan2(s.vy, s.vx);
            const g = ctx.createRadialGradient(s.x, s.y, 1, s.x, s.y, 24);
            g.addColorStop(0, 'rgba(190,235,255,0.5)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(s.x, s.y, 24, 0, 6.283);
            ctx.fill();
            ctx.save();
            ctx.translate(s.x, s.y);
            ctx.rotate(ta);
            // the drive plume behind the warhead
            ctx.fillStyle = `rgba(143,230,255,${0.5 + 0.4 * Math.sin(t * 18)})`;
            ctx.beginPath();
            ctx.moveTo(-9, -3.4);
            ctx.lineTo(-26 - Math.sin(t * 20) * 5, 0);
            ctx.lineTo(-9, 3.4);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#eaf2ff';
            ctx.beginPath();
            ctx.ellipse(0, 0, 12, 4.6, 0, 0, 6.283);
            ctx.fill();
            ctx.fillStyle = '#ffe08a';
            ctx.beginPath();
            ctx.ellipse(8, 0, 4.4, 3, 0, 0, 6.283);
            ctx.fill();
            ctx.restore();
          } else {
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
          }
        } else {
          // the detonation ring
          const p = clamp01(sinceDet / VOID_RING_MS);
          const ringR = p * VOID_RING_MAX;
          ctx.strokeStyle = `rgba(${col},${(1 - p) * 0.85})`;
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

  /**
   * GS-story-battle-epic — the wound's own particles, plus the roar's shockwave. Drawn in WORLD space so
   * they sit on the boss wherever the camera put it; the damage NUMBER counter-rotates, because a number
   * lying on its side is not a number.
   */
  function drawImpacts(): void {
    if (!ctx) return;
    for (const w of waves) {
      const age = clamp01((now0 - w.born) / w.life);
      if (now0 < w.born) continue;
      const r = w.r1 * (1 - Math.pow(1 - age, 2.4));
      ctx.strokeStyle = `rgba(${w.col},${(1 - age) * 0.75})`;
      ctx.lineWidth = w.w * (1 - age * 0.7);
      ctx.beginPath();
      ctx.arc(w.x, w.y, r, 0, 6.283);
      ctx.stroke();
    }
    ctx.lineCap = 'round';
    for (const s of sparks) {
      const age = clamp01((now0 - s.born) / s.life);
      const sp = Math.hypot(s.vx, s.vy) || 1;
      ctx.strokeStyle = s.col;
      ctx.globalAlpha = (1 - age) * 0.95;
      ctx.lineWidth = 2.2 * (1 - age * 0.6);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - (s.vx / sp) * s.len, s.y - (s.vy / sp) * s.len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
    for (const d of dmgNums) {
      const age = clamp01((now0 - d.born) / 900);
      const rise = 20 + age * 46;
      // "up" for a floating number is the SCREEN's up, like the glyph itself
      const u = screenUp();
      ctx.save();
      ctx.translate(d.x + u.x * rise, d.y + u.y * rise);
      if (view.rotated) ctx.rotate(Math.PI / 2);
      ctx.globalAlpha = clamp01(1 - Math.max(0, age - 0.55) / 0.45);
      ctx.textAlign = 'center';
      ctx.font = `800 ${d.big ? 30 : 20}px Georgia, serif`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(String(d.val), 0, 0);
      ctx.fillStyle = d.col;
      ctx.fillText(String(d.val), 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // ── HUD (always upright — it draws in the HUD frame, never the arena) ────────
  /** The classic side-by-side cluster (shields left, boss bar right) needs a WIDE frame; a turned
   *  portrait frame stacks them into the band above the arena. `wide` reproduces the shipped numbers. */
  const wideHud = (): boolean => view.hudW >= 900;
  /** The weapon bar's top edge — every bottom caption hangs off it, so both orientations agree. */
  const barTop = (): number => view.hudH - WEAPON_BAR_H - 12;

  function drawHealthBar(): void {
    if (!ctx) return;
    const wide = wideHud();
    const x = wide ? 470 : 16;
    const y = wide ? 40 : 112;
    const w = wide ? 470 : view.hudW - 32;
    const H = 15;
    const frac = clamp01(hp / hpMax);
    const ghost = clamp01(hpGhost / hpMax);
    // the PLATE: the boss's name AND what it is — an ordinary hazard gets a strip, the finale gets billing
    ctx.textAlign = 'left';
    ctx.fillStyle = `rgba(255,255,255,${0.85 + barFlash * 0.15})`;
    ctx.font = '800 15px Georgia, serif';
    ctx.fillText(title.name, x, y - 16);
    ctx.fillStyle = 'rgba(178,192,214,0.7)';
    ctx.font = '600 9.5px system-ui, sans-serif';
    ctx.fillText(title.epithet, x, y - 4);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y + 4, w, H);
    // the CHIP bar — what the last blow took, still draining. A nova's bite is SEEN, not inferred.
    if (ghost > frac) {
      ctx.fillStyle = 'rgba(255,236,190,0.55)';
      ctx.fillRect(x + w * frac, y + 4, w * (ghost - frac), H);
    }
    const bg = ctx.createLinearGradient(x, 0, x + w, 0);
    bg.addColorStop(0, herald ? '#eaf2ff' : '#8fe0a0');
    bg.addColorStop(1, frac < 0.3 ? (herald ? '#ff9a6a' : '#ff8f5a') : herald ? '#ffe08a' : '#4fb87a');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y + 4, w * frac, H);
    // a lit crown along the fill — the bar reads as a lamp burning down, not a coloured swatch
    ctx.fillStyle = `rgba(255,255,255,${0.22 + barFlash * 0.5})`;
    ctx.fillRect(x, y + 4, w * frac, 3);
    // phase notches — the escalation is READABLE on the bar
    for (const f of FINALE_PHASES) {
      const nx = x + w * f;
      ctx.strokeStyle = hp <= hpMax * f ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(nx, y + 1);
      ctx.lineTo(nx, y + H + 7);
      ctx.stroke();
    }
    ctx.strokeStyle = `rgba(255,255,255,${0.3 + barFlash * 0.45})`;
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x, y + 4, w, H);
    // under-gate: the last chunk visibly HOLDS — the honest "not enough gun" read
    if (!won && hp <= hpFloor + 0.5) {
      ctx.fillStyle = '#ff9a6a';
      ctx.font = '700 12.5px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(herald ? 'the Ark\u2019s armour HOLDS — not enough gun' : 'its hide HOLDS — not enough gun', x + w, y + 38);
    }
  }

  function drawShieldPips(): void {
    if (!ctx) return;
    const x = wideHud() ? 60 : 16;
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
      // GS-story-battle-epic: the cell you JUST lost shatters where it stood — losing a shield has to land
      const shatter = clamp01(1 - (now0 - shieldBreakAt) / 460);
      if (i === shield && shatter > 0) {
        const cx2 = x + i * (pw + 4) + pw / 2;
        const cy2 = y + 8;
        ctx.strokeStyle = `rgba(190,225,255,${shatter * 0.9})`;
        ctx.lineWidth = 1.6;
        for (let k = 0; k < 6; k++) {
          const a = k * 1.047 + 0.4;
          const r0 = 4 + (1 - shatter) * 12;
          ctx.beginPath();
          ctx.moveTo(cx2 + Math.cos(a) * r0, cy2 + Math.sin(a) * r0);
          ctx.lineTo(cx2 + Math.cos(a) * (r0 + 5), cy2 + Math.sin(a) * (r0 + 5));
          ctx.stroke();
        }
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

  /** The multi-weapon HUD bar — one trigger per owned weapon, cooldown ring + hotkey. A turned frame is
   *  narrower, so the buttons centre up and fall back to a stacked GLYPH-over-NAME face rather than
   *  running their labels off the edge (the wide branch is the shipped landscape layout, untouched). */
  function drawWeaponBar(): void {
    if (!ctx) return;
    weaponRects.length = 0;
    const n = loadout.weapons.length;
    const wide = wideHud();
    const bw = wide
      ? Math.min(160, Math.floor((view.hudW - 240) / Math.max(1, n)) - 10)
      : Math.min(160, Math.floor((view.hudW - 24 - 10 * (n - 1)) / Math.max(1, n)));
    const compact = bw < 116; // no room for a label beside the glyph — stack them instead
    const bh = WEAPON_BAR_H; // deep buttons — they letterbox down to thumb-size on phones
    const y = barTop();
    let x = wide ? 20 : Math.max(12, (view.hudW - (bw * n + 10 * (n - 1))) / 2);
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
      if (compact) {
        drawWeaponGlyph(w.style, x + bw / 2, y + 22, w.color, w.color2);
        ctx.textAlign = 'center';
        ctx.fillStyle = ready ? '#eaf1fb' : 'rgba(200,210,225,0.55)';
        ctx.font = '800 12px system-ui, sans-serif';
        ctx.fillText(w.name, x + bw / 2, y + 48);
        ctx.fillStyle = ready ? w.color : 'rgba(160,170,190,0.5)';
        ctx.font = '600 11.5px system-ui, sans-serif';
        ctx.fillText(ready ? `⚡ ${w.damage}` : `${(readyIn / 1000).toFixed(1)}s`, x + bw / 2, y + 63);
      } else {
        drawWeaponGlyph(w.style, x + 22, y + bh / 2, w.color, w.color2);
        ctx.fillStyle = ready ? '#eaf1fb' : 'rgba(200,210,225,0.55)';
        ctx.font = '800 14px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(w.name, x + 42, y + 31);
        ctx.fillStyle = ready ? w.color : 'rgba(160,170,190,0.5)';
        ctx.font = '600 12.5px system-ui, sans-serif';
        ctx.fillText(ready ? `⚡ ${w.damage} dmg` : `${(readyIn / 1000).toFixed(1)}s`, x + 42, y + 50);
      }
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
    const base = barTop();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f4ecd6';
    ctx.font = '800 40px Georgia, serif';
    ctx.fillText(text, view.hudW / 2, base - 36);
    if (sub) {
      ctx.fillStyle = '#c2ccda';
      ctx.font = '500 17px system-ui, sans-serif';
      ctx.fillText(sub, view.hudW / 2, base - 4);
    }
    ctx.globalAlpha = 1;
  }

  function phaseBanner(t: number): void {
    if (!ctx || now0 > phaseCaptionUntil || !phaseCaption) return;
    // The banner rides the ARENA, not the screen — a turned frame has a HUD band above the arena, and a
    // caption floated up into it would sit on the boss health bar.
    const top = (wideHud() ? 0 : arenaTopHud(view)) + 118;
    const left = (phaseCaptionUntil - now0) / 2600;
    const a = clamp01(left * 3) * clamp01((1 - left) * 6 + 0.3);
    // GS-story-battle-epic: the title SLAMS in (over-scale, settling) instead of drifting up — an
    // escalation caption that fades on reads as a subtitle, not an announcement. It rides a dark scrim so
    // it stays legible over the boss, and a rule sweeps out under it.
    const inT = clamp01((1 - left) * 5.5);
    const sc = 1 + (1 - Math.pow(inT, 0.45)) * 0.5;
    const cxm = view.hudW / 2;
    ctx.globalAlpha = a;
    ctx.save();
    ctx.translate(cxm, top);
    const scrim = ctx.createLinearGradient(-cxm, 0, cxm, 0);
    scrim.addColorStop(0, 'rgba(0,0,0,0)');
    scrim.addColorStop(0.5, 'rgba(2,5,10,0.68)');
    scrim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(-cxm, -30, cxm * 2, 66);
    ctx.scale(sc, sc);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd9a0';
    ctx.font = '800 30px Georgia, serif';
    ctx.fillText(phaseCaption, 0, Math.sin(t * 2) * 2);
    if (phaseCaptionSub) {
      ctx.fillStyle = '#cdd8e8';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillText(phaseCaptionSub, 0, 26);
    }
    ctx.restore();
    const rule = Math.pow(inT, 0.6) * cxm * 0.86;
    ctx.strokeStyle = `rgba(255,217,160,${a * 0.7})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cxm - rule, top + 9);
    ctx.lineTo(cxm + rule, top + 9);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /**
   * THE ENTRANCE PLATE (GS-story-battle-epic) — the boss names itself. Drawn in the upright HUD frame so
   * it reads the same whichever way the arena turned, centred in the frame rather than hung off the
   * weapon bar (there is no weapon bar yet — the HUD wipes in behind this).
   */
  function entryPlate(b: { plate: number; plateAlpha: number; roar: number }): void {
    if (!ctx || b.plateAlpha <= 0.01) return;
    const cx = view.hudW / 2;
    const cy = view.hudH * 0.5;
    const sc = 1 + (1 - b.plate) * 0.55;
    ctx.save();
    ctx.globalAlpha = b.plateAlpha;
    // a scrim band so the name reads over whatever the boss is doing behind it
    const scrim = ctx.createLinearGradient(0, cy - 74, 0, cy + 74);
    scrim.addColorStop(0, 'rgba(0,0,0,0)');
    scrim.addColorStop(0.5, `rgba(2,5,10,${0.72 * b.plateAlpha})`);
    scrim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, cy - 74, view.hudW, 148);
    ctx.translate(cx, cy);
    ctx.scale(sc, sc);
    ctx.textAlign = 'center';
    // the name, with the roar blowing a glow through it
    const glow = 0.35 + b.roar * 0.65;
    ctx.shadowColor = herald ? `rgba(190,225,255,${glow})` : `rgba(140,255,190,${glow})`;
    ctx.shadowBlur = 18 + b.roar * 26;
    ctx.fillStyle = '#f6efdc';
    // one size for both plates: the longer name is the Ark's, and it must not run off a 390px phone
    const size = Math.min(46, (view.hudW * 0.9) / (title.name.length * 0.56));
    ctx.font = `800 ${size}px Georgia, serif`;
    ctx.fillText(title.name, 0, 0);
    ctx.shadowBlur = 0;
    // the rules above and below, drawn out from the centre as the plate lands
    const rule = b.plate * view.hudW * 0.42;
    ctx.strokeStyle = herald ? 'rgba(200,225,255,0.75)' : 'rgba(150,255,200,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-rule, -size * 0.86);
    ctx.lineTo(rule, -size * 0.86);
    ctx.moveTo(-rule, 20);
    ctx.lineTo(rule, 20);
    ctx.stroke();
    ctx.fillStyle = 'rgba(205,216,232,0.92)';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(title.epithet, 0, 38);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function prompt(text: string, col: string, t: number): void {
    if (!ctx) return;
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t * 4);
    ctx.fillStyle = col;
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, view.hudW / 2, barTop() - 22); // clears the deep weapon bar
    ctx.globalAlpha = 1;
  }

  // ── the entrance (GS-story-battle-epic) ──────────────────────────────────────
  /** The entrance ends: the assault's clocks start HERE, so every deadline it owns is measured from the
   *  first volley, not from the mount. */
  function beginAssault(): void {
    phase = 'assault';
    assaultStart = now0;
    nextAttackAt = now0 + PHASE_ATTACK_MS[phaseIdx]!;
    hintUntil = now0 + 5200;
    const [cap, sub] = phaseLabel(phaseIdx);
    phaseCaption = cap;
    phaseCaptionSub = sub;
    phaseCaptionUntil = now0 + 3000;
  }

  /**
   * The whole entrance frame. The boss looms up out of a dark that parts around it, the plate lands, and
   * the HUD wipes in underneath on the way out — so the first assault frame is already fully dressed.
   * Its frame kick draws from the DECOR stream (`drng`), never the fight's, so the volley pattern the
   * assault opens with is exactly the one it always had.
   */
  function drawEntry(t: number, b: ReturnType<typeof entryBeat>): void {
    if (!ctx) return;
    const kick = shake > 0.4 ? shake : 0;
    const shx = kick ? (drng() - 0.5) * kick : 0;
    const shy = kick ? (drng() - 0.5) * kick : 0;
    applyWorld(shx, shy);
    drawSpace(t, 0);
    drawBoss(t, 0, 0);
    drawImpacts();
    drawShip(t); // you are ON the field for the whole beat — the ship must not pop in at the first volley
    // the dark it comes OUT of — a veil that parts as it arrives, and a hard white flash on the roar
    const veil = clamp01(1 - b.loom) * 0.85;
    if (veil > 0.01) {
      ctx.fillStyle = `rgba(2,4,9,${veil})`;
      fillView();
    }
    if (b.roar > 0.72) {
      ctx.fillStyle = `rgba(255,255,255,${((b.roar - 0.72) / 0.28) * 0.34})`;
      fillView();
    }
    // a closing vignette so the eye is pinned on the boss for the whole beat
    const v = designViewRect(view, cssW, cssH);
    const vg = ctx.createRadialGradient(
      v.x + v.w / 2,
      v.y + v.h / 2,
      Math.min(v.w, v.h) * 0.28,
      v.x + v.w / 2,
      v.y + v.h / 2,
      Math.max(v.w, v.h) * 0.72,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${0.45 + veil * 0.3})`);
    ctx.fillStyle = vg;
    fillView();

    applyHud(shx, shy);
    // the HUD wipes in behind the plate, so the fight opens fully dressed
    if (b.hudIn > 0.01) {
      ctx.globalAlpha = b.hudIn;
      ctx.save();
      ctx.translate(0, (1 - b.hudIn) * -20);
      drawHealthBar();
      drawShieldPips();
      ctx.restore();
      ctx.save();
      ctx.translate(0, (1 - b.hudIn) * 30);
      drawWeaponBar();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    entryPlate(b);
    if (interactive && b.plateAlpha < 0.5 && b.loom > 0.9) {
      prompt('tap to begin', '#ffe6a0', t * 1.2);
    }
  }

  // ── frame ────────────────────────────────────────────────────────────────────
  function frame(nowMs: number): void {
    if (finished || !ctx) return;
    if (!now0) {
      now0 = nowMs;
      last = nowMs;
      // GS-story-battle-epic: the ENTRANCE runs first — the assault's own clocks are set when it ends.
      entryStart = nowMs;
      assaultStart = nowMs + ENTRY_MS;
      nextAttackAt = assaultStart + PHASE_ATTACK_MS[0];
      hintUntil = assaultStart + 5200;
    }
    const dt = Math.min(64, nowMs - last);
    last = nowMs;
    now0 = nowMs;
    // HITSTOP (GS-story-battle-epic): a heavy hit FREEZES the world — we keep drawing, but nothing moves
    // and the art clock stops with it, so the boss holds mid-writhe instead of gliding through the blow.
    const frozen = nowMs < stopUntil;
    if (!frozen) animMs += dt;
    const t = animMs / 1000 + 1;

    // `update` is inert outside the fighting phases (every mover is guarded on `phase`), so the entrance
    // runs it too — the decays, the recoil spring and the shockwave all tick with one call.
    if (!frozen) update(dt);

    if (phase === 'entry') {
      const b = entryBeat(now0 - entryStart);
      if (!entryRoared && now0 - entryStart >= ENTRY_ROAR_MS) {
        entryRoared = true;
        bossRoar(0, 0.4); // the entrance already has the white bloom — a full wash on top greys the frame
        shake = Math.max(shake, 20);
        opts.onPhase?.(); // the app's one audio seam — the entrance roar borrows the phase cue
      }
      if (now0 - entryStart >= ENTRY_MS) beginAssault();
      else {
        drawEntry(t, b);
        raf = requestAnimationFrame(frame);
        return;
      }
    }

    // One shake offset, spent by BOTH passes — the world and the upright HUD rock together, and the
    // private rng is drawn exactly as often as it always was.
    const shx = shake > 0.4 ? (rng() - 0.5) * shake : 0;
    const shy = shake > 0.4 ? (rng() - 0.5) * shake : 0;
    /** What the HUD pass owes this frame — the climax captions are raised inside the WORLD block. */
    let pendingCaption: [string, string, number] | null = null;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    applyWorld(shx, shy);

    if (phase === 'assault' || phase === 'overwhelm') {
      drawSpace(t, hitFlash * 0.55 + (phase === 'overwhelm' ? 0.12 : 0));
      drawBoss(t, phase === 'overwhelm' ? clamp01((now0 - overwhelmStart) / 1600) * 0.4 : 0, 0);
      drawEnemyShots(t);
      drawPlayerShots(t);
      drawBursts();
      drawImpacts();
      drawShip(t);
      applyHud(shx, shy);
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
      drawBoss(t, focus, 0);
      const lash = now0 < lashUntil;
      if (herald) drawCoreTarget(t, lash);
      const r = reticleAt(now0 / 1000, aimTarget());
      const rx = r.x;
      const ry = r.y;
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
      applyHud(shx, shy);
      drawShieldPips();
      if (interactive) {
        prompt(lash ? (herald ? 'the batteries swing round — steady…' : 'it lashes — steady…') : herald ? '🎯 TAP TO STRIKE THE CORE' : '🎯 TAP TO STRIKE THE EYE', '#ffe6a0', t * 1.25);
      }
    } else if (phase === 'climax-win') {
      const e = nowMs - climaxStart;
      const ballT = clamp01(e / 380); // the golf ball streaks home first
      const p = clamp01((e - 380) / 1600);
      drawSpace(t, 0);
      if (herald) {
        // GS-story-warden-ark: the core takes the ball, the Ark comes apart — and behind the wreck the
        // root the blockade was holding shut lies open, the serpent's green rising through it.
        drawBoss(t, 0.95, ballT < 1 ? 0 : Math.min(0.85, p));
        const s = coreTarget();
        if (ballT < 1) {
          drawCoreTarget(t, false);
          const bx = lerp(ship.x + 30, s.x, ballT);
          const by = lerp(ship.y, s.y, ballT) - Math.sin(ballT * Math.PI) * 90;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(bx, by, 7, 0, 6.283);
          ctx.fill();
        } else {
          // the reactor lets go: gold shock-rings, then hull debris thrown across the field
          ctx.strokeStyle = `rgba(255,240,190,${(1 - p) * 0.95})`;
          ctx.lineWidth = 3;
          for (let k = 0; k < 12; k++) {
            const a = k * 0.52;
            const rr = 20 + p * 300;
            ctx.beginPath();
            ctx.moveTo(s.x + Math.cos(a) * rr * 0.5, s.y + Math.sin(a) * rr * 0.5);
            ctx.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr);
            ctx.stroke();
          }
          ctx.fillStyle = `rgba(201,214,234,${(1 - p) * 0.9})`;
          for (let k = 0; k < 16; k++) {
            const a = k * 0.98 + 0.3;
            const rr = p * (160 + (k % 4) * 90);
            ctx.save();
            ctx.translate(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr * 0.7);
            ctx.rotate(a + p * 3);
            ctx.fillRect(-7, -2.5, 14, 5);
            ctx.restore();
          }
          ctx.strokeStyle = `rgba(255,224,138,${(1 - p) * 0.8})`;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 30 + p * 700, 0, 6.283);
          ctx.stroke();
          // the root, unbarred: a green light welling up from below as the last of the fleet burns
          const rg = ctx.createRadialGradient(DW / 2, DH + 60, 40, DW / 2, DH + 60, 620);
          rg.addColorStop(0, `rgba(120,255,180,${p * 0.5})`);
          rg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = rg;
          fillView();
          const vg = ctx.createRadialGradient(DW / 2, DH / 2, 200, DW / 2, DH / 2, 640);
          vg.addColorStop(0, 'rgba(0,0,0,0)');
          vg.addColorStop(1, `rgba(0,4,2,${p * 0.9})`);
          ctx.fillStyle = vg;
          fillView();
          pendingCaption = [
            strike === 'clean' ? 'The Ark breaks clean.' : 'A clipping blow — enough.',
            'The blockade is gone — the root lies open, and something vast begins to stir.',
            p,
          ];
        }
      } else {
        drawBoss(t, 0.95, ballT < 1 ? 0 : p);
        if (ballT < 1) {
          const bx = lerp(ship.x + 30, anchors.eyeX, ballT);
          const by = lerp(ship.y, anchors.eyeY, ballT) - Math.sin(ballT * Math.PI) * 90;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(bx, by, 7, 0, 6.283);
          ctx.fill();
        } else {
          ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - Math.abs(p - 0.25) / 0.25) * 0.8})`;
          fillView();
          ctx.fillStyle = `rgba(140,255,190,${(1 - p) * 0.8})`;
          for (let k = 0; k < 26; k++) {
            const a = k * 0.97;
            const rr = p * (140 + (k % 5) * 60);
            ctx.beginPath();
            ctx.arc(anchors.eyeX + Math.cos(a) * rr, anchors.eyeY + Math.sin(a) * rr, 3, 0, 6.283);
            ctx.fill();
          }
          pendingCaption = [
            strike === 'clean' ? 'A perfect strike.' : 'A clipping blow — enough.',
            'The serpent comes apart across the sky.',
            p,
          ];
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
      drawBoss(t, 0, 0);
      drawShip(t);
      const repelled = won; // an armed ship that lost the fight was merely repelled
      pendingCaption = [
        repelled ? 'Driven back.' : 'Overwhelmed.',
        repelled
          ? herald
            ? 'The blockade holds you off — this once. Re-engage and finish the rite.'
            : 'Your ship holds together — barely. Catch your breath and strike again.'
          : herald
            ? 'The Wardens drive you back — but the root will keep. Arm up and return.'
            : 'You pull back into the dark — but the campaign is saved. Arm up and return.',
        p,
      ];
      if (e > 1800) {
        finish();
        return;
      }
    }

    if (pendingCaption) {
      applyHud(shx, shy);
      caption(pendingCaption[0], pendingCaption[1], pendingCaption[2]);
    }
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
