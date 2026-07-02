/**
 * Shot resolution: lie model, penalty model, plays-like wind, and the deterministic
 * shot itself. Reimplemented from the harvest manifest's spec (golf-finder's source
 * isn't in this repo).
 *
 * Pure & headless: randomness comes ONLY from the passed `Rng`. No DOM, no globals.
 * The wind math reads head/tail/cross off the SHOT bearing (not the hole bearing) —
 * that's the golf-finder insight worth keeping. Arcade, not sim: exact, not a forecast.
 *
 * Tunables are exported consts so the render/feel layer can expose them behind
 * `window._*` escape hatches without the sim ever touching `window`.
 */

import type { FeatureKind, Hole, Vec, Wind } from './course/contract';
import { bearing, pointInPoly } from './course/contract';
import type { Club } from './clubs';
import { clubDist, type ClubStats } from './clubs';
import { arcApex } from './flight';
import type { Rng } from './rng';

// --- Feel tunables -----------------------------------------------------------
export const TUNABLES = {
  /** Carry yards gained per mph of pure tailwind (lost per mph headwind). */
  windCarryPerMph: 1.0,
  /** Lateral yards pushed per mph of pure crosswind. */
  windLateralPerMph: 0.8,
  // Per-club dispersion: longer clubs spray WILDER in both line and distance; shorter
  // clubs are tighter and more accurate (a 5-iron over a driver). A club's wildness `t`
  // ramps 0→1 from `accurateCarry` to `wildCarry` by its nominal carry; the *Long values
  // apply to the driver, the *Short values to the wedges. All fractions are of the
  // shot's intended carry. (At the driver: lateral σ 20% → ±50% at the 2.5σ cone edge,
  // distance 50%–110% of full — i.e. "can come up well short", matching the design.)
  /** Carry at/below which a club is fully accurate (t=0). */
  accurateCarry: 70,
  /** Carry at which a club is fully wild (t=1, ~the driver). */
  wildCarry: 250,
  /** Lateral std-dev as a fraction of carry — short club → long club. Under the angular
   *  dispersion model these are the small-angle σ (radians) about the bearing; the long value
   *  is trimmed a touch from the old flat-offset model because an angled miss now also loses
   *  forward distance (carry·cosθ), so the same number sprays slightly harder. */
  lateralFracShort: 0.05,
  lateralFracLong: 0.17,
  /** Distance std-dev as a fraction of carry — short → long. */
  carryFracShort: 0.04,
  carryFracLong: 0.13,
  /** Mean carry as a fraction of full (long clubs sit a touch short of nominal). */
  meanFracShort: 0.98,
  meanFracLong: 0.9,
  /** Hard lower clamp on carry (fraction of intended) — short → long. */
  distLowShort: 0.85,
  distLowLong: 0.5,
  /** Hard upper clamp on carry (fraction of intended) — short → long. */
  distHighShort: 1.05,
  distHighLong: 1.1,
} as const;

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

export interface DispersionProfile {
  /** Mean carry as a fraction of intended (full) carry. */
  meanFrac: number;
  /** Distance std-dev as a fraction of intended carry. */
  carryFrac: number;
  /** Lateral std-dev as a fraction of intended carry. */
  lateralFrac: number;
  /** Hard lower clamp on carry (fraction of intended). */
  lowFrac: number;
  /** Hard upper clamp on carry (fraction of intended). */
  highFrac: number;
}

/**
 * The per-club dispersion profile for a club of the given nominal carry. Pure. Shared by
 * `resolveShot` (which samples it) and `shotSpread` (which previews it) so the on-screen
 * spray cone reads EXACTLY true to the physics. Longer clubs = wilder; shorter = tighter.
 */
export function dispersionProfile(nominalCarry: number): DispersionProfile {
  const T = TUNABLES;
  const t = clamp01((nominalCarry - T.accurateCarry) / (T.wildCarry - T.accurateCarry));
  const mix = (short: number, long: number): number => short + (long - short) * t;
  return {
    meanFrac: mix(T.meanFracShort, T.meanFracLong),
    carryFrac: mix(T.carryFracShort, T.carryFracLong),
    lateralFrac: mix(T.lateralFracShort, T.lateralFracLong),
    lowFrac: mix(T.distLowShort, T.distLowLong),
    highFrac: mix(T.distHighShort, T.distHighLong),
  };
}

// --- Spray shape: the asymmetric 5-zone dispersion model (GS-dispersion-2) ---
/**
 * The angular spray is modelled as FIVE zones whose probabilities sum to 1. The graphic and the
 * physics BOTH derive from this single object, so the cone reads exactly true to where the ball
 * actually lands — and a zone reduced to 0 simply vanishes (no shots, no band). Left/right are
 * independent, so a golfer/upgrade can suppress one miss without touching its mirror.
 *
 *   green     — the central "great shot" cluster (the good outcome)
 *   hookL     — left ORANGE: a hook (a moderate pull left)
 *   sliceR    — right ORANGE: a slice (a moderate push right)
 *   duckHookL — left RED: a duck-hook (the wild left tail)
 *   shankR    — right RED: a shank (the wild right tail)
 *
 * INVARIANT: `green = 1 − (hookL+sliceR+duckHookL+shankR)` — green is the derived remainder. So
 * reducing ANY miss zone raises green's % (its band stays the same width — "great shots land where
 * great shots land"); a trade-off between two miss zones leaves green untouched.
 */
export interface SprayShape {
  green: number;
  hookL: number;
  sliceR: number;
  duckHookL: number;
  shankR: number;
}

/** The neutral shape: 80% centre, 8% each orange flank, 2% each red tail. */
export const DEFAULT_SHAPE: SprayShape = { green: 0.8, hookL: 0.08, sliceR: 0.08, duckHookL: 0.02, shankR: 0.02 };

/** Additive deltas to the four MISS zones (green is derived). A character or an upgrade contributes
 *  one of these; combine many then `applyShapeMod` once. A negative drops misses → more green; a
 *  pair that sums to zero (e.g. −duckHookL/+shankR) is a pure trade-off that doesn't feed green. */
export interface ShapeMod {
  hookL?: number;
  sliceR?: number;
  duckHookL?: number;
  shankR?: number;
}

/** Total miss probability is capped so green can never go negative (a wild golfer still has a core). */
const MAX_MISS = 0.6;

/** Sum two shape mods (additive deltas), so a global upgrade and a per-club character shape combine. */
export function combineShapeMods(a?: ShapeMod, b?: ShapeMod): ShapeMod {
  return {
    hookL: (a?.hookL ?? 0) + (b?.hookL ?? 0),
    sliceR: (a?.sliceR ?? 0) + (b?.sliceR ?? 0),
    duckHookL: (a?.duckHookL ?? 0) + (b?.duckHookL ?? 0),
    shankR: (a?.shankR ?? 0) + (b?.shankR ?? 0),
  };
}

/** Apply a shape mod to a base shape: clamp each miss zone ≥0, cap the total miss mass, then derive
 *  green as the remainder. The freed probability of a reduced miss zone flows to GREEN, never to the
 *  opposite side — exactly the redistribution rule the design asks for. Pure. */
export function applyShapeMod(base: SprayShape, mod?: ShapeMod): SprayShape {
  const pos = (x: number) => (x > 0 ? x : 0);
  let hookL = pos(base.hookL + (mod?.hookL ?? 0));
  let sliceR = pos(base.sliceR + (mod?.sliceR ?? 0));
  let duckHookL = pos(base.duckHookL + (mod?.duckHookL ?? 0));
  let shankR = pos(base.shankR + (mod?.shankR ?? 0));
  let miss = hookL + sliceR + duckHookL + shankR;
  if (miss > MAX_MISS) {
    const k = MAX_MISS / miss;
    hookL *= k;
    sliceR *= k;
    duckHookL *= k;
    shankR *= k;
    miss = MAX_MISS;
  }
  return { green: 1 - miss, hookL, sliceR, duckHookL, shankR };
}

/** Resolve the final per-shot shape from a global upgrade mod and a per-club character mod. */
export function resolveShape(globalMod?: ShapeMod, charMod?: ShapeMod): SprayShape {
  return applyShapeMod(DEFAULT_SHAPE, combineShapeMods(globalMod, charMod));
}

/**
 * Spray geometry constants (escape-hatch overridable via `_gsSpray`). They turn a shape + a base
 * angular spread (σ0, radians) into the drawn/sampled angular bands:
 *   - the GREEN band is a fixed ±`greenZ·σ0` wedge (its width does NOT track its %, so boosting
 *     great-shots raises the number without fattening the wedge);
 *   - each orange/red band's width is `sideK·σ0·(zone probability)` — so the drawn size is exactly
 *     proportional to the chance of landing there (a 2% red is ¼ the width of an 8% orange).
 */
export interface SprayGeom {
  greenZ: number;
  sideK: number;
}
export const SPRAY_GEOM: SprayGeom = { greenZ: 1.0, sideK: 18 };

export type BandTier = 'green' | 'orange' | 'red';
/** One drawn/sampled angular band: [a0,a1] radians off the bearing, its tier, its probability, and
 *  whether its within-band angle is triangular (green, centre-peaked) or uniform (a miss is a miss). */
export interface SprayBand {
  tier: BandTier;
  a0: number;
  a1: number;
  prob: number;
  tri: boolean;
}

/** The five angular bands (left→right) for a shape at a base spread σ0. Zero-probability zones get a
 *  zero-width band (omitted by the renderer, never sampled). Shared by `resolveShot` (sampling) and
 *  the renderer (drawing) so the cone is exactly the landing distribution. Pure. */
export function sprayBands(shape: SprayShape, baseSpread: number, geom: SprayGeom = SPRAY_GEOM): SprayBand[] {
  const g = geom.greenZ * baseSpread;
  const oL = geom.sideK * baseSpread * shape.hookL;
  const oR = geom.sideK * baseSpread * shape.sliceR;
  const rL = geom.sideK * baseSpread * shape.duckHookL;
  const rR = geom.sideK * baseSpread * shape.shankR;
  return [
    { tier: 'red', a0: -(g + oL + rL), a1: -(g + oL), prob: shape.duckHookL, tri: false },
    { tier: 'orange', a0: -(g + oL), a1: -g, prob: shape.hookL, tri: false },
    { tier: 'green', a0: -g, a1: g, prob: shape.green, tri: true },
    { tier: 'orange', a0: g, a1: g + oR, prob: shape.sliceR, tri: false },
    { tier: 'red', a0: g + oR, a1: g + oR + rR, prob: shape.shankR, tri: false },
  ];
}

/** One of the five spray zones a sampled shot can fall in (the green plus the four miss tails). */
export type SprayZone = 'green' | 'hookL' | 'sliceR' | 'duckHookL' | 'shankR';

/**
 * Which zone a sampled spray ANGLE (radians off the bearing, PRE-bias) falls in, by the same band
 * boundaries `sprayBands` draws. Pure — no rng. Used by the caddy-guard interception (Space Ducks /
 * Convict Sheep): a ball sampled into a left/right miss tail can be knocked back onto the fairway.
 */
export function classifySprayZone(
  angle: number,
  shape: SprayShape,
  baseSpread: number,
  geom: SprayGeom = SPRAY_GEOM,
): SprayZone {
  const g = geom.greenZ * baseSpread;
  const oL = geom.sideK * baseSpread * shape.hookL;
  const oR = geom.sideK * baseSpread * shape.sliceR;
  if (angle < -(g + oL)) return 'duckHookL';
  if (angle < -g) return 'hookL';
  if (angle <= g) return 'green';
  if (angle <= g + oR) return 'sliceR';
  return 'shankR';
}

/**
 * A caddy's in-flight ball guard (GS-caddy): the named caddy that watches your misses and knocks the
 * ball back onto the SHORT GRASS mid-flight. It fires whenever the ball is about to come down OFF the
 * fairway on the caddy's `side` — every qualifying miss, no chance roll. A GREENSIDE miss is dropped ON
 * the green (the most useful save); any other miss is recentred onto the fairway. `side` is the world
 * side it covers ('left' = a Space Duck's laser, 'right' = a Convict Sheep's boomerang); `kind` is the
 * render flavour. Unlike a `ShapeMod`, this does NOT change the spray distribution (the cone still shows
 * the tails) — it intercepts a shot already sampled into an off-fairway miss, so the renderer can play the
 * projectile redirect. The course-aware tests are supplied by the caller (`ShotInput.offFairway` +
 * `ShotInput.greenAim`); resolved identically in auto + interactive.
 */
export interface CaddyGuard {
  side: 'left' | 'right';
  kind: 'laser' | 'boomerang';
}

/** A mid-flight redirect record — the caddy zapped a miss back onto the fairway (render-only flavour). */
export interface ShotRedirect {
  kind: 'laser' | 'boomerang';
  /** The miss zone the shot was sampled into before being knocked back. */
  fromZone: SprayZone;
  /** Where the ball WOULD have come down (the hook/shank) had the caddy not intervened. */
  originalLanding: Vec;
}

/** Sample a centre-band (fairway) angle (centre-peaked triangular on [−g, g]) with a single rng draw —
 *  the on-line landing a caddy-guard redirect knocks a miss back to. Mirrors the green branch of sampleShapeAngle. */
function sampleGreenAngle(baseSpread: number, rng: Rng, geom: SprayGeom = SPRAY_GEOM): number {
  const h = geom.greenZ * baseSpread;
  const v = rng.float();
  return v < 0.5 ? h * (Math.sqrt(2 * v) - 1) : h * (1 - Math.sqrt(2 * (1 - v)));
}

/** RMS of the spray angle (radians) for a shape — the effective σ the cone "reads as", exposed so
 *  the preview and the dispersion test agree with the sampled scatter. Pure. */
export function sprayAngleRms(shape: SprayShape, baseSpread: number, geom: SprayGeom = SPRAY_GEOM): number {
  let m2 = 0;
  for (const b of sprayBands(shape, baseSpread, geom)) {
    if (b.prob <= 0) continue;
    // E[x²]: triangular on [−h,h] → h²/6; uniform on [a,b] → (a²+ab+b²)/3.
    const e2 = b.tri ? (b.a1 * b.a1) / 6 : (b.a0 * b.a0 + b.a0 * b.a1 + b.a1 * b.a1) / 3;
    m2 += b.prob * e2;
  }
  return Math.sqrt(Math.max(0, m2));
}

/** Sample a spray angle (radians, off the bearing) from a shape, consuming EXACTLY two rng draws
 *  (zone pick + within-band position) so the per-shot draw count matches the old gaussian angle. */
function sampleShapeAngle(shape: SprayShape, baseSpread: number, rng: Rng): number {
  const bands = sprayBands(shape, baseSpread);
  const u = rng.float();
  let acc = 0;
  let chosen = bands[bands.length - 1]!;
  for (const b of bands) {
    acc += b.prob;
    if (u < acc) {
      chosen = b;
      break;
    }
  }
  const v = rng.float();
  if (chosen.tri) {
    // Symmetric triangular (centre-peaked) on [−h,h] via a single uniform draw — great shots cluster.
    const h = chosen.a1;
    return v < 0.5 ? h * (Math.sqrt(2 * v) - 1) : h * (1 - Math.sqrt(2 * (1 - v)));
  }
  return chosen.a0 + v * (chosen.a1 - chosen.a0);
}

// --- Lie model (LIE_INFO analogue) ------------------------------------------
export interface LieInfo {
  /** Multiplies intended carry — a buried bunker lie robs distance. */
  carryMult: number;
  /** Multiplies dispersion — bad lies spray. */
  dispersionMult: number;
  /** If set, being here costs strokes (handled by the round sim, not the swing). */
  penalty?: PenaltyKind;
  /** Human label for HUD. */
  label: string;
}

export type PenaltyKind = 'water' | 'ob' | 'lost' | 'unplayable' | 'lava' | 'void' | 'voidlost' | 'ravine' | 'cetuslost';

/**
 * Surface → playing characteristics. Open table (content-as-data): fantasy surfaces
 * are added as rows, exactly like a new lie in golf-finder. A few fantasy lies ship
 * here as examples (lava = water-like penalty, lowgrav handled via biomeMods on carry).
 */
export const LIE_INFO: Record<string, LieInfo> = {
  tee: { carryMult: 1.0, dispersionMult: 0.85, label: 'Tee' },
  fairway: { carryMult: 1.0, dispersionMult: 1.0, label: 'Fairway' },
  green: { carryMult: 1.0, dispersionMult: 0.8, label: 'Green' },
  rough: { carryMult: 0.9, dispersionMult: 1.4, label: 'Rough' }, // 10% distance penalty
  waste: { carryMult: 0.9, dispersionMult: 1.2, label: 'Waste' },
  bunker: { carryMult: 0.5, dispersionMult: 1.6, label: 'Bunker' }, // 50% distance penalty — a real escape tax
  // Deep POT bunker (GS-hazards-2): steeper-faced, smaller — a harsher escape than open sand. Sand
  // class → NON-penalty (always fair), so it may pinch the landing zone / encircle a small green.
  pot: { carryMult: 0.4, dispersionMult: 1.75, label: 'Pot bunker' }, // ~60% tax, a real sideways-out lie
  // Thick FESCUE / native rough (GS-hazards-2): a non-penalty deep-rough lie that sits BETWEEN rough
  // and the woods — heavier carry tax + wilder than ordinary rough, recoverable (you hack it out, you
  // never lose a stroke). Fills the deep rough on links/parkland/desert worlds.
  fescue: { carryMult: 0.72, dispersionMult: 1.55, label: 'Fescue' },
  // Trees are a tough non-penalty LIE, not a mid-flight collision: a sprayed ball ends up
  // "in the woods" and has to punch out (short carry, wild line) — fair and readable, since
  // only an offline shot finds them. NOT a penalty, so they may line the corridor edge.
  trees: { carryMult: 0.6, dispersionMult: 1.7, label: 'Trees' },
  water: { carryMult: 1.0, dispersionMult: 1.0, penalty: 'water', label: 'Water' },
  // Fantasy examples (each biome that uses one references it by this key):
  lava: { carryMult: 1.0, dispersionMult: 1.0, penalty: 'lava', label: 'Lava' },
  // A lava river/creek crossing the fairway (GS-19): plays like lava (penalty), but the generator
  // sanctions it as a forced carry (`validateCrossings`) so it may sit on the corridor.
  lavariver: { carryMult: 1.0, dispersionMult: 1.0, penalty: 'lava', label: 'Lava river' },
  // The frost world's frozen-pond crossing (GS-mechanics): a meltwater channel across the fairway —
  // plays as water (penalty), sanctioned as a forced carry exactly like the lava river.
  frozenpond: { carryMult: 1.0, dispersionMult: 1.0, penalty: 'water', label: 'Frozen pond' },
  // A parkland water creek crossing the fairway (GS-terrain): plays as water (penalty), sanctioned
  // as a forced carry exactly like the lava river / frozen pond.
  creek: { carryMult: 1.0, dispersionMult: 1.0, penalty: 'water', label: 'Creek' },
  // A dry RAVINE / barranca crossing the fairway (GS-hazards-2): a penalty-area forced carry exactly
  // like the creek/lava river (sanctioned by `validateCrossings`), but a rocky chasm rather than water
  // — diversifies the forced-carry vocabulary on desert/parkland worlds.
  barranca: { carryMult: 1.0, dispersionMult: 1.0, penalty: 'ravine', label: 'Ravine' },
  void: { carryMult: 1.0, dispersionMult: 1.0, penalty: 'void', label: 'The Void' },
  // The void's "lost rough" (GS-19): off the fairway is the abyss. A penalty, but a NON-replay
  // drop-back-on-the-island (`voidlost`) — a stroke-and-distance cascade made max-wildness void
  // stops a ball-shredder; a +1 drop keeps it brutal-but-fair (the miss still costs, no death loop).
  voidrough: { carryMult: 1.0, dispersionMult: 1.0, penalty: 'voidlost', label: 'Lost to the void' },
  // The Cetus world's clifftop "lost rough" (GS-cetus): off the plateau is the star-ocean below the
  // cliffs. A penalty exactly like the void's lost rough (a +1 NON-replay drop-back-on-the-plateau,
  // so the miss bites but never cascades into a ball-shredder), reskinned as the deep sea.
  cetusdeep: { carryMult: 1.0, dispersionMult: 1.0, penalty: 'cetuslost', label: 'Lost to the star-ocean' },
  ice: { carryMult: 1.02, dispersionMult: 1.5, label: 'Ice' }, // slick: hard to control
  crystal: { carryMult: 1.05, dispersionMult: 0.85, label: 'Crystal' }, // true & fast
  // Meteor-strike scorch (GS-meteor-scorch): charred, baked crust under a meteor-shower sky. The
  // ball flies HOT off it (a touch long) but ash and cinders make it WILD — spicier than rough,
  // never a penalty. `lieAt` never returns this: it exists only via the rest-lie conversion in
  // `executeShot`, armed by the meteor-shower course effect (sim/scorch.ts).
  scorch: { carryMult: 1.05, dispersionMult: 1.45, label: 'Scorched' },
  // Effect ground patches (GS-journey-fx-2, sim/patches.ts) — like scorch, `lieAt` never returns
  // these: they exist only via the rest-lie conversion, armed by their course effect. Comet stardust
  // is the BONUS patch: charged dust launches the ball hot AND true — the one lie worth aiming at.
  stardust: { carryMult: 1.08, dispersionMult: 0.9, label: 'Stardust' },
  // Debris-field wreckage snags the club: robbed distance, wide spray — worse than rough, gentler
  // than trees, never a stroke. ('ice' above doubles as the frostfall patch's lie.)
  junk: { carryMult: 0.85, dispersionMult: 1.6, label: 'Wreckage' },
};

/** Default lie when a point is off every polygon (native / out-of-frame): rough. */
export const DEFAULT_LIE = 'rough';

/**
 * The lie a point OFF every feature reads as for this hole. Normally `rough`, but a world can
 * arm a `roughLie` biomeMod (GS-19) so off-fairway is something else — the void's "lost rough"
 * sets it to the `void` penalty so a sprayed ball is lost (stroke-and-distance). Pure.
 */
export function roughLieOf(hole: Hole): string {
  const mod = hole.biomeMods?.find((m) => m.kind === 'roughLie');
  return mod?.note ?? DEFAULT_LIE;
}

export function lieInfo(kind: string): LieInfo {
  return LIE_INFO[kind] ?? LIE_INFO[DEFAULT_LIE]!;
}

/**
 * The "rainbow road" SAFE surfaces (GS-rainbow): the mown ribbon you start, travel and finish on,
 * plus the sand the player explicitly counts as in-play ("off the fairway/bunkers/green is OOB").
 * The legendary **Rainbow Ball** turns every OTHER surface into out-of-bounds — off the road is the
 * void of space. One source of truth shared by the sim (the OOB rule in `executeShot`) and the
 * renderer (which paints exactly these surfaces as the rainbow ribbon and lets space show elsewhere),
 * so what you SEE as road is what's actually in-bounds. Sand FAMILY (bunker/pot/waste/sand) is safe.
 */
export const ROAD_LIES: ReadonlySet<string> = new Set([
  'fairway',
  'green',
  'tee',
  'bunker',
  'pot',
  'waste',
  'sand',
]);

/** Whether a lie is on the rainbow road (in-play under the Rainbow Ball). Pure; see `ROAD_LIES`. */
export function isRoadLie(kind: string): boolean {
  return ROAD_LIES.has(kind);
}

/**
 * Apply an escape-specialist caddy's LIE RELIEF (GS-mux): lerp a PENALIZING lie's carry/dispersion
 * back toward neutral by `relief` (0..1). It only ever helps a lie that's worse than neutral
 * (carryMult < 1 or dispersionMult > 1) — never improves an already-clean fairway/tee/green lie.
 * `relief` 0 / undefined returns the lie's exact values, so a relief-less shot is byte-for-byte
 * unchanged (the determinism contract for every caddy field).
 */
export function reliedLie(li: LieInfo, relief?: number): { carryMult: number; dispersionMult: number } {
  if (!relief) return { carryMult: li.carryMult, dispersionMult: li.dispersionMult };
  const r = Math.max(0, Math.min(1, relief));
  return {
    carryMult: li.carryMult < 1 ? li.carryMult + (1 - li.carryMult) * r : li.carryMult,
    dispersionMult: li.dispersionMult > 1 ? li.dispersionMult + (1 - li.dispersionMult) * r : li.dispersionMult,
  };
}

// --- Penalty model (PEN_INFO analogue) --------------------------------------
export interface PenaltyInfo {
  /** Penalty strokes added. */
  strokes: number;
  /** true = stroke-and-distance (replay from previous spot). */
  replay: boolean;
  label: string;
}

export const PEN_INFO: Record<PenaltyKind, PenaltyInfo> = {
  water: { strokes: 1, replay: false, label: 'Water hazard' },
  ob: { strokes: 1, replay: true, label: 'Out of bounds' },
  lost: { strokes: 1, replay: true, label: 'Lost ball' },
  unplayable: { strokes: 1, replay: false, label: 'Unplayable' },
  lava: { strokes: 1, replay: false, label: 'Lava' },
  void: { strokes: 1, replay: true, label: 'Lost to the void' },
  voidlost: { strokes: 1, replay: false, label: 'Lost to the void' },
  ravine: { strokes: 1, replay: false, label: 'Ravine' },
  cetuslost: { strokes: 1, replay: false, label: 'Lost to the star-ocean' },
};

// --- Lie lookup against a hole ----------------------------------------------
/**
 * Surface precedence for OVERLAPPING features (higher wins). Features are emitted in
 * draw order (fairway first, then tee, green, scatter), so a naive first-match read lets
 * the broad fairway slab override the green/tee/scatter that sit ON it — the classic "it
 * thinks you're on the fairway when you're on the green" bug. Instead we pick the
 * most-specific surface under the point: the green (and tee) win over the fairway base,
 * and the in-play scatter spice (ice/crystal/waste) wins over plain fairway/rough too.
 * Unlisted features fall back to 1 (the rough/fairway base level).
 */
const SURFACE_PRIORITY: Record<string, number> = {
  green: 5,
  tee: 4,
  ice: 3,
  crystal: 3,
  waste: 3,
  fescue: 3, // thick native rough reads over plain fairway/rough it overlaps
  fairway: 2,
};

/**
 * Read the lie at a point. Hazards are checked first (they're drawn on top and they
 * dominate play). Among the underlying features we pick the HIGHEST-precedence surface
 * containing the point (see `SURFACE_PRIORITY`) so a green that overlaps the fairway reads
 * as green, not fairway. Off everything → DEFAULT_LIE.
 */
export function lieAt(hole: Hole, p: Vec): FeatureKind {
  for (const f of hole.hazards) if (pointInPoly(p, f.poly)) return f.kind;
  let best: FeatureKind | undefined;
  let bestPri = -Infinity;
  for (const f of hole.features) {
    if (!pointInPoly(p, f.poly)) continue;
    const pri = SURFACE_PRIORITY[f.kind] ?? 1;
    if (pri > bestPri) {
      bestPri = pri;
      best = f.kind;
    }
  }
  return best ?? roughLieOf(hole);
}

// --- Wind --------------------------------------------------------------------
const deg2rad = (d: number) => (d * Math.PI) / 180;

export interface WindBreakdown {
  /** Along-shot component, yards/sec-equivalent in mph; + = tailwind, − = headwind. */
  along: number;
  /** Cross component in mph; + = pushes toward the shot's right, − = left. */
  cross: number;
}

/**
 * Decompose wind relative to the SHOT bearing. `wind.dir` is the direction the wind
 * blows toward (deg cw from up). When the wind blows the same way the ball travels
 * (dir == shotBearing) it's a pure tailwind (+along).
 */
export function playWind(wind: Wind, shotBearingDeg: number): WindBreakdown {
  const theta = deg2rad(wind.dir - shotBearingDeg);
  return {
    along: wind.spd * Math.cos(theta),
    cross: wind.spd * Math.sin(theta),
  };
}

/**
 * Plays-like distance: what a target distance effectively "plays" into the given wind
 * along the shot bearing. Headwind makes it play longer (need more club); tailwind
 * shorter. Mirrors golf-finder's `_playsLike`, minus the forecast conservatism.
 */
export function playsLike(distance: number, wind: Wind | undefined, shotBearingDeg: number): number {
  if (!wind) return distance;
  const { along } = playWind(wind, shotBearingDeg);
  return distance - along * TUNABLES.windCarryPerMph;
}

// --- Shot resolution ---------------------------------------------------------
export interface ShotInput {
  from: Vec;
  /** The point the player aims at; defines the shot bearing and intended distance. */
  aim: Vec;
  club: Club;
  /** Lie the ball is currently sitting on. */
  lie: FeatureKind;
  wind?: Wind;
  /** Per-hole biome modifiers (e.g. low-gravity carry multiplier). */
  carryMult?: number;
  /** Player dispersion multiplier (<1 = a forgiveness/stability perk). */
  dispersionMult?: number;
  /** Escape-specialist caddy lie relief (GS-mux), 0..1: softens a bad lie's carry/spray penalty.
   *  Undefined = no relief (byte-for-byte). */
  lieRelief?: number;
  /** Reduced weather impact (GS-proshop-2, Wind-Cheater): 0..1 fraction the wind's carry loss AND
   *  crosswind push are scaled DOWN by. Applied to the SAME wind breakdown used for both, so it never
   *  desyncs from the upwind aim (which scales by the matching factor). Undefined/0 = full wind. */
  windResist?: number;
  /**
   * Shot POWER (GS-power): the intended carry as a fraction of the club's full carry. 1 = a full
   * swing (the default — byte-for-byte unchanged), 0.5 = a half-power shot landing ~half as far,
   * down to ~0.01 (a soft tap). Values ABOVE 1 are OVERPOWERED shots (the Overdrive upgrade lets the
   * player dial past 100%). A pure scalar on `intended` — it consumes NO extra rng and the angular
   * spread is keyed off the club (unchanged), so the cone in YARDS scales with power (a soft shot has
   * a small cone, a full swing the full cone). Undefined/1 keeps the old fixed-club-distance shot. */
  power?: number;
  stats?: ClubStats;
  /**
   * Deterministic directional bias (radians) added to the random spray angle — a character's
   * shot SHAPE (GS-18). + curves the ball toward the bearing's right (a fade), − toward the left
   * (a hook). It shifts the MEAN of the angular draw, not its width, so a biased player still
   * sprays the same amount around a curved mean line. Added to the SAME gaussian draw the
   * unbiased shot uses (no extra rng), so a 0 bias is byte-for-byte identical to before.
   */
  angleBias?: number;
  /**
   * The asymmetric spray-zone shape (GS-dispersion-2). When given, the random angle is sampled from
   * these zones (so a duck-hook/shank can be suppressed or skewed per side); defaults to the
   * symmetric `DEFAULT_SHAPE`. The display derives from the same shape, so it reads exactly true.
   */
  shape?: SprayShape;
  /** Distance-control upgrade (point 5): raise the LOWER carry clamp by this fraction of intended,
   *  shrinking the gap between a club's min and max carry from below (more reliable distance). */
  minCarryFracBoost?: number;
  /** Wedge distance-control (point 6): pull BOTH carry clamps toward the mean by this fraction
   *  (0..1), tightening the wedge's carry window so it lands the chosen distance. */
  carryWindowTighten?: number;
  /** A named caddy's in-flight ball guard (GS-caddy): redirects an off-fairway miss back onto the
   *  fairway. Absent (the default) consumes NO extra rng, so a guard-less shot is byte-for-byte the
   *  same — the interception draw only fires when a caddy is watching AND `offFairway` says it's a miss. */
  guard?: CaddyGuard;
  /** Course-aware test for the caddy guard (GS-caddy): given a candidate touchdown, returns true if it
   *  lands OFF the fairway (rough/sand/void/water/…, i.e. not fairway and not green). The caller closes
   *  this over the hole (`(p) => lieAt(hole, p)` mapped to off-fairway), keeping `resolveShot` itself
   *  course-agnostic. Absent ⇒ the guard never fires (and draws no extra rng), so a hole-less unit call
   *  or a guard-less shot is byte-for-byte the base shot. */
  offFairway?: (landing: Vec) => boolean;
  /** Course-aware GREENSIDE target for the caddy guard (GS-caddy): given a would-be off-fairway miss,
   *  returns an on-green point to drop the ball on if the miss is GREENSIDE (near the green), else null —
   *  so a greenside save lands ON the green, not just the fairway. The caller closes it over the hole's
   *  green + pin. Absent/null ⇒ the guard recentres onto the fairway line instead (no green teleport). */
  greenAim?: (landing: Vec) => Vec | null;
  /**
   * Left-handed mode (GS-lefty): mirror the player's lateral shot tendencies in WORLD space. A
   * left-handed golfer is the mirror image of a right-handed one — their hook curves right, their
   * slice left — so on a fixed course their misses (and a character's baked fade/hook) go the
   * OPPOSITE way. Implemented as a single sign flip on the FINAL lateral angle (spray + bias), AFTER
   * the rng draws and the canonical-frame guard classification: zero extra rng, and `false`/undefined
   * is byte-for-byte identical to right-handed. Crosswind is NOT flipped — it's a world phenomenon,
   * independent of the golfer's stance — so wind still shifts the cone the same way for both. */
  lefty?: boolean;
  rng: Rng;
}

export interface ShotResult {
  /** Where the ball came to rest (course-space). */
  landing: Vec;
  /** Actual carry achieved (yards), after lie, wind, biome, and dispersion. */
  carry: number;
  shotBearing: number;
  wind: WindBreakdown;
  /** Intended (pre-noise) carry, for HUD / debugging. */
  intended: number;
  /** Aerial arc apex height (yards) for this carry+club — the loft-scaled parabola peak. Shared
   *  with the renderer (it draws this exact arc) and the sim's tree-knockdown check, so the ball
   *  the player SEES clear/clip a tree is the ball the sim let through/knocked down. */
  apex: number;
  /** Set when a named caddy knocked a miss back onto the fairway mid-flight (GS-caddy). The `landing`
   *  above is already the redirected (centre-line) finish; this carries the would-be miss for the render. */
  redirect?: ShotRedirect;
}

/**
 * Resolve one swing deterministically. The caller reads the resulting lie via
 * `lieAt(hole, result.landing)` and applies any penalty — the swing itself doesn't
 * know the course, keeping this function pure and reusable.
 */
export function resolveShot(input: ShotInput): ShotResult {
  const { from, aim, club, lie, wind, rng } = input;
  const li = lieInfo(lie);

  const shotBearing = bearing(from, aim);
  const biomeMult = input.carryMult ?? 1;
  const nominal = clubDist(club, input.stats);
  // Escape-specialist relief (no-op when absent → byte-for-byte unchanged).
  const relief = reliedLie(li, input.lieRelief);
  // Shot power (GS-power) scales the intended carry — 1 (full swing) is the default and leaves the
  // shot byte-for-byte unchanged; a pure scalar, no extra rng. The carry-window clamps below are
  // fractions of `intended`, so they scale with power; the angular spread is keyed off the club's
  // nominal carry (unchanged), so a soft shot's cone is small and a full swing's is the full cone.
  const power = input.power ?? 1;
  const intended = nominal * relief.carryMult * biomeMult * power;

  // Reduced weather impact (GS-proshop-2): scale the wind breakdown down by `windResist`. Both the
  // headwind carry loss (carryMean below) and the crosswind push (windLat below) read off this `w`, so
  // they shrink TOGETHER — and `aimWithWind` scales its upwind compensation by the same factor, so the
  // aim stays consistent. windResist 0/undefined ⇒ `wr === 1` ⇒ byte-for-byte unchanged.
  const wr = 1 - clamp01(input.windResist ?? 0);
  const wRaw = wind ? playWind(wind, shotBearing) : { along: 0, cross: 0 };
  const w = wr === 1 ? wRaw : { along: wRaw.along * wr, cross: wRaw.cross * wr };

  const dispMult = relief.dispersionMult * (input.dispersionMult ?? 1);
  const prof = dispersionProfile(nominal);
  const carrySd = intended * prof.carryFrac * dispMult;
  // Random spray is ANGULAR, not a flat sideways offset: a fraction-of-carry std-dev becomes the
  // base angular spread σ0 (radians) about the shot bearing. Because a rotation preserves length,
  // the ball's distance from the tee is the sampled `carry` in EVERY direction — so a wide miss
  // never finishes farther than the carry window (the old square-box bug).
  const angleSd = prof.lateralFrac * dispMult;

  // Carry window: distance-control upgrades raise the lower clamp (less coming-up-short) and the
  // wedge window-tighten pulls both clamps toward the mean (reliable wedge distance). Pure number
  // tweaks on the club's [low, high] fractions — the AUTO sim and the preview apply the same ones.
  let lowFrac = prof.lowFrac;
  let highFrac = prof.highFrac;
  if (input.minCarryFracBoost) lowFrac = Math.min(highFrac, lowFrac + input.minCarryFracBoost);
  if (input.carryWindowTighten) {
    const t = clamp01(input.carryWindowTighten);
    lowFrac = lowFrac + (prof.meanFrac - lowFrac) * t;
    highFrac = highFrac - (highFrac - prof.meanFrac) * t;
  }

  // Distance: a mean a touch short of full (long clubs more so), gaussian noise, then a hard clamp
  // to the (possibly tightened) [low, high] window so a shot can come up short but never absurdly so.
  const carryMean = intended * prof.meanFrac + w.along * TUNABLES.windCarryPerMph;
  const carryNoisy = carryMean + rng.gaussian(0, carrySd);
  let carry = Math.max(
    intended * lowFrac,
    Math.min(intended * highFrac, Math.max(0, carryNoisy)),
  );
  // SECOND + THIRD rng draws (replace the old single gaussian-angle draw, same 2-draw budget so the
  // headless sim and the interactive driver stay in step): a categorical zone pick + a within-band
  // position, sampled from the spray SHAPE. A character/upgrade shot-shape bias (fade +, hook −)
  // shifts the MEAN of the resulting angle; the shape skews which side misses, never the bias.
  const shape = input.shape ?? DEFAULT_SHAPE;
  let sprayAngle = sampleShapeAngle(shape, angleSd, rng);
  let thetaRand = (input.angleBias ?? 0) + sprayAngle;
  // Crosswind is a DETERMINISTIC lateral push (the AI already aims upwind to cancel it), kept
  // separate from the random angular spray so wind shifts the cone rather than widening it.
  const windLat = w.cross * TUNABLES.windLateralPerMph;

  // Forward unit vector along the shot bearing (cw from +Y), rotated by the random angle.
  const br = deg2rad(shotBearing);
  // Right-perpendicular of the unrotated bearing — the crosswind push axis (+θ also turns
  // toward this axis, matching the old "+lateral = right" convention).
  const rx = Math.cos(br);
  const ry = -Math.sin(br);
  // Left-handed mirror (GS-lefty): negate the PLAYER's lateral angle so hook/slice (and a character
  // bias) curve the opposite world way — a pure sign on the final rotation, no rng touched, so a
  // right-handed shot (h=1) is byte-for-byte unchanged. Crosswind (windLat) is world-fixed → NOT
  // flipped, so wind shifts the cone identically for both hands.
  const h = input.lefty ? -1 : 1;
  const landAt = (theta: number): Vec => {
    const brR = br + h * theta;
    return [from[0] + Math.sin(brR) * carry + rx * windLat, from[1] + Math.cos(brR) * carry + ry * windLat];
  };
  let landing = landAt(thetaRand);

  // Caddy-guard interception (GS-caddy): a named caddy that watches the ball mid-flight and, if it's
  // about to come down OFF the fairway on the caddy's side, zaps it back onto the SHORT GRASS. Outcome-
  // based: `offFairway(landing)` (a course-aware predicate the caller closes over the hole with) tests
  // the would-be touchdown, and the side is read off the landing's WORLD lateral sign (− = left of the
  // bearing, + = right) so it matches "off the left/right side of the fairway". Where it sends the ball
  // depends on WHERE the miss is: a GREENSIDE miss (one `greenAim` returns an on-green target for) is put
  // straight ON the green — the most useful save; any other miss is recentred onto the fairway line at the
  // same carry. Fires on EVERY qualifying miss — no chance roll. Only runs when a guard is present AND a
  // fairway test was supplied, so a guard-less shot (or a hole-less unit call) draws NO extra rng and
  // stays byte-for-byte identical — the fairway recentre is the single added draw (the greenside teleport
  // is a deterministic point → no draw), and only on an actual knock-back.
  let redirect: ShotRedirect | undefined;
  if (input.guard && input.offFairway && input.offFairway(landing)) {
    const lateral = (landing[0] - from[0]) * rx + (landing[1] - from[1]) * ry;
    const side: 'left' | 'right' = lateral < 0 ? 'left' : 'right';
    if (side === input.guard.side) {
      const origLanding = landing;
      const onGreen = input.greenAim ? input.greenAim(landing) : null;
      if (onGreen) {
        // Greenside save: drop it on the green (toward the pin) — carry follows so roll-out reads true.
        landing = onGreen;
        carry = Math.hypot(onGreen[0] - from[0], onGreen[1] - from[1]);
      } else {
        // Fairway save: recentre the angle onto the bearing line, same carry.
        sprayAngle = sampleGreenAngle(angleSd, rng);
        thetaRand = (input.angleBias ?? 0) + sprayAngle;
        landing = landAt(thetaRand);
      }
      redirect = {
        kind: input.guard.kind,
        fromZone: side === 'left' ? 'duckHookL' : 'shankR',
        originalLanding: origLanding,
      };
    }
  }

  return { landing, carry, shotBearing, wind: w, intended, apex: arcApex(carry, nominal), redirect };
}
