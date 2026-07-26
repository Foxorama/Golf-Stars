/**
 * The ball's LAND → BOUNCE → RUN-OUT (and the backspin CHECK) as a ballistic model — PURE (no DOM,
 * no time source, no rng), so it is unit-tested and reproducible (GS-runout-feel).
 *
 * The sim already decided WHERE the ball finishes and, on a contoured green, the exact curved path it
 * travels (`rollOut` → `shot.roll` / `shot.rollPath`). That is physics and this module never touches
 * it — contract 5 still holds, the drawn run-out walks the sim's own path to the sim's own rest point.
 * What this module owns is the *time parameterisation* and the *hop heights*: given the path's total
 * length and the surface it landed on, when is the ball where, and how high is it off the ground.
 *
 * The old run-out was one `easeOutCubic` over the whole distance with an independent `|sin|` hop
 * train laid over the top, in a duration of `20ms × yards` clamped to a 150ms floor. Three things
 * were wrong with it, and together they produced the playtest report — "it looked like the ball
 * landed and then teleported away":
 *
 *  1. **It was far too fast.** A short check ran at the 150ms floor. At the chip/putt camera (~6.6
 *     px/yard, six times the whole-hole map) those yards are six times the pixels, so the same
 *     150ms reads as an instant jump. Duration was tuned at map zoom and played at green zoom.
 *  2. **The ball decelerated from the instant it touched down.** `easeOutCubic` is at maximum speed
 *     at t=0 and braking immediately — but a real ball leaves its first bounce at very nearly flight
 *     speed and covers a big share of its run-out in the air. Deceleration happens ON CONTACT.
 *  3. **The hops were decoupled from the travel.** Height ran on its own `|sin|` clock while the
 *     ground position ran on the ease, so the ball was airborne while braking and on the ground
 *     while sliding — a jiggle laid over a skid, not a bounce.
 *
 * The model here is the obvious physical one, and it fixes all three at once. The run-out splits into
 * a BOUNCE phase and a ROLL phase whose share is set by the landing surface's firmness (a firm
 * fairway skips most of its run out; a plugged bunker barely hops at all). Within the bounce phase
 * the ball flies at CONSTANT horizontal speed and loses a slice of it at each contact, so hop
 * distances and hop durations both decay geometrically off one restitution — and the ball is
 * genuinely travelling fastest during the first, biggest hop. The roll phase is constant
 * deceleration to rest. Speeds are chained end to end, starting from the ball's ACTUAL horizontal
 * speed as the flight ends, so there is no velocity step anywhere from strike to rest.
 *
 * The BACKSPIN check is the same idea in two beats: the ball skids forward through the air carrying
 * its flight speed, the spin bites at the first contact, and it is dragged back — accelerating out
 * of the grab and easing to a stop. The old version yanked it back in ~200ms, which is where the
 * "rubber band" read came from; a real check-back takes well over a second, so it gets one.
 */

import { flightClassOf, type FlightClass } from '../sim/flight';

/** Feel knobs for the run-out. All of these ride `_gsFeel` through `playView`'s existing merge, so
 *  they are tunable live without a new top-level hook. */
export interface RunoutFeel {
  /** Speed kept through a bounce on the softest ground / on the firmest (the restitution) — the
   *  FORWARD component. */
  restitutionSoft: number;
  restitutionFirm: number;
  /** The VERTICAL restitution on the softest / firmest ground: how much of the ball's downward speed
   *  comes back as height. Soft ground absorbs it (a plop); firm ground returns it (a skip). */
  bounceSoft: number;
  bounceFirm: number;
  /** First hop LENGTH as a fraction of `carry · cos²(descent)` — the ball's own flight decides how
   *  far it skips, so a long flat drive skips a long way and a short steep wedge barely moves. */
  hopLenK: number;
  /** First hop APEX as a fraction of `carry · sin²(descent)` — the STEEPER the arrival, the higher
   *  the pop, which is why a wedge bounces up and a driver skids along. Plus a ceiling in yards. */
  hopApexK: number;
  hopApexMax: number;
  /** Stop hopping once a hop is shorter than this (yards), or after this many hops. There is always
   *  at least ONE hop: every full shot arrives out of the air. */
  hopMinYd: number;
  hopMax: number;
  /** Floor on a single hop's DURATION (ms). A wedge's hop is under a yard, which at the run-out's own
   *  time base is ~70ms — four frames, and you see nothing. The floor only bites on hops that are too
   *  brief to watch, and on those the ball is going UP more than forward anyway. */
  hopMinMs: number;
  /** SAFETY NET for the first hop: at least this share of the run-out, up to `hopFloorMax` yards. A
   *  wedge's modelled skip is a few inches — true, and unwatchable; the ball has to be SEEN to land.
   *  The cap keeps it a net and not a second model: a club whose own bounce is bigger keeps it. */
  hopFirstMinShare: number;
  hopFloorMax: number;
  /** Ceiling on a hop's apex as a fraction of its own length, BEFORE `hopDrawBoost`. Uncapped, a
   *  short wedge hop peaks higher than it travels and the ball bounces vertically off the turf. */
  apexOverLen: number;
  /** Below this carry the ball did not really arrive from the SKY — a putter tap, a dribbled chip —
   *  so it is not given the guaranteed bounce. */
  minAirCarry: number;
  /** Speed a HOLED roll still carries as it arrives, as a fraction of the speed it entered at. */
  holedEndSpeed: number;
  /** Smallest share of the run-out reserved for the closing ROLL, so the ball is always seen rolling
   *  to a stop rather than bouncing to a halt. */
  rollMinShare: number;
  /**
   * How much taller the hops are DRAWN than they are modelled.
   *
   * A real driver's first bounce peaks around two yards over a fifteen-yard skip. On the shot camera
   * (~2 px per yard) that is four pixels, under a ball drawn at three — which is why the bounce was
   * invisible even once it existed. The same reasoning as the drawn ball's own size: a scale model
   * is not on the table.
   *
   * But it has to stay SMALL. Height is exaggerated and length is not, so the boost multiplies the
   * drawn height-to-length ratio directly: at 4x a driver's shallow 1:5.5 skip is drawn at 1:1.4 and
   * the ball appears to bounce vertically off the turf rather than skip along it. 1.8x lifts the
   * first hop about eight pixels clear of its shadow at the shot camera, which is enough to read as
   * air, and keeps the skip looking like a skip.
   */
  hopDrawBoost: number;
  /** How much a shot's deterministic variation may stretch a hop train (±). Without it every drive
   *  bounces identically, which is the tell that it is animation and not golf. */
  varyLen: number;
  varyApex: number;
  /**
   * DEPRECATED, kept at 0 and honoured only if a caller raises it.
   *
   * It used to floor the speed the ball ENTERS its closing roll at, to stop a long tail crawling. But
   * flooring an entry speed IS a velocity step: whenever the floor bit, the roll started faster than
   * the last hop ended and the ball visibly picked up as it settled. The crawl it was guarding
   * against is handled by `runoutMaxMs`, which compresses the whole run-out proportionally and so
   * cannot introduce a join.
   */
  rollEntryFloor: number;
  /**
   * The run-out's own TIME BASE, as a fraction of the flight's.
   *
   * The drawn flight is ~8x real time — 750ms for a 250-yard drive that really takes six seconds.
   * Chaining the bounce to the ball's arrival speed therefore inherits that 8x, and the bounce becomes
   * physically correct and visually impossible: measured in game, a driver's six hops totalled **87ms**
   * and the first was **27ms**, under two frames at 60fps. The report was "there is no bounce. the ball
   * drops, touches ground and then rolls a little bit", and that is exactly what 87ms looks like.
   *
   * So the run-out owns a slower time base than the flight, deliberately. That IS a discontinuity at
   * touchdown, and pretending otherwise is what produced an invisible bounce — the honest thing is to
   * name it. Everything WITHIN the run-out stays chained (hop to hop to roll), which is the continuity
   * that actually shows.
   */
  runoutTimeScale: number;
  /** Clamp on the whole run-out's animation (ms). */
  runoutMinMs: number;
  runoutMaxMs: number;
  /** Backspin: forward skid on the bounce as a fraction of the eventual check-back distance + a cap. */
  backspinSkidFrac: number;
  backspinSkidMax: number;
  /** Backspin: how long the drag-back takes per yard of check, and its floor (ms). A real check-back
   *  is a slow, readable thing — the old 200ms snap is what read as a teleport. */
  backspinMsPerYd: number;
  backspinMinMs: number;
}

export const DEFAULT_RUNOUT_FEEL: RunoutFeel = {
  restitutionSoft: 0.30,
  restitutionFirm: 0.74,
  bounceSoft: 0.16,
  bounceFirm: 0.62,
  hopLenK: 0.05,
  hopApexK: 0.05,
  hopApexMax: 6,
  hopMinYd: 0.35,
  hopMax: 6,
  hopMinMs: 130,
  hopFirstMinShare: 0.35,
  hopFloorMax: 2.5,
  apexOverLen: 0.3,
  minAirCarry: 12,
  rollMinShare: 0.3,
  holedEndSpeed: 0.45,
  hopDrawBoost: 3,
  varyLen: 0.22,
  varyApex: 0.3,
  rollEntryFloor: 0,
  runoutTimeScale: 0.16,
  runoutMinMs: 340,
  runoutMaxMs: 2400,
  backspinSkidFrac: 0.55,
  backspinSkidMax: 7,
  backspinMsPerYd: 55,
  backspinMinMs: 700,
};

/**
 * How a club FAMILY bounces (GS-runout-club). Multipliers on the surface-derived numbers, so the
 * landing still decides the base — a driver into a plugged bunker does not skip — and the club
 * decides how much of that the strike had in it.
 *
 * The run itself is NOT here: that is the sim's, via `FLIGHT_PROFILES.carryFrac`, and it already
 * differs per family. This is the shape of the landing.
 */
export interface RunoutClassProfile {
  /** Scales how far each skip CARRIES (the forward restitution). */
  restitution: number;
  /** Scales how high it POPS (the vertical restitution). A wedge's spin and steep face kill forward
   *  speed but not height; a driver's shallow arrival does the reverse. */
  bounce: number;
  /** Scales the first hop's length outright — the club's own bite on the turf. */
  len: number;
}

/**
 * Driver skips long, low and often; a wood does nearly the same; a hybrid comes in steeper and
 * bounces less but still releases; a long iron is the low runner; a short iron lands steep and
 * checks; a wedge plops once and stops, which is where the backspin build takes over.
 */
export const RUNOUT_BY_CLASS: Record<FlightClass, RunoutClassProfile> = {
  driver: { restitution: 1.1, bounce: 0.88, len: 1.15 },
  wood: { restitution: 1.06, bounce: 0.92, len: 1.08 },
  hybrid: { restitution: 0.98, bounce: 1.02, len: 0.95 },
  ironLong: { restitution: 1.03, bounce: 0.96, len: 1.05 },
  ironShort: { restitution: 0.9, bounce: 1.08, len: 0.8 },
  wedge: { restitution: 0.7, bounce: 1.2, len: 0.55 },
  putter: { restitution: 0.6, bounce: 0.6, len: 0.3 },
};

/** One hop of the bounce phase: how far along the path it carries the ball, how long it takes, and
 *  how high it flies. */
export interface Hop {
  dist: number;
  ms: number;
  apex: number;
}

/** A resolved run-out: the hop train, the closing roll, and the total duration the play view should
 *  spend on it. `dist` values are in COURSE YARDS along the sim's own roll path. */
export interface RunoutPlan {
  hops: Hop[];
  /** Distance covered by the closing roll, and how long it takes. */
  rollDist: number;
  rollMs: number;
  /** Total run-out duration (ms) — hops + roll, after the min/max clamp. */
  totalMs: number;
  /** Total distance travelled (yards) — equals the sim's |roll|. */
  totalDist: number;
  /** Speed the closing roll still has when it ARRIVES, as a fraction of the speed it entered at.
   *  0 on an ordinary run-out (a dead stop); positive when the ball finishes in the cup. */
  rollEndFrac: number;
  /** Backspin plan (absent on a forward run-out): the ball skids this far FORWARD first, then the
   *  spin bites and drags it back to rest. */
  check?: { skid: number; skidMs: number; skidApex: number; backMs: number; skidV: number };
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Everything the landing needs to know about the SHOT that produced it (GS-landing-real).
 *
 * The first version of this took only the run-out distance and the landing firmness, so every drive
 * landed identically and a wedge landed like a short drive. A real landing is decided by how the ball
 * ARRIVED — how far it flew and how steeply it came down — and that is all available at the moment
 * the play view draws the touchdown.
 */
export interface Landing {
  /** The sim's |roll| — the ground the ball must cover after touchdown (yards). Physics; never moved. */
  dist: number;
  /** Landing surface firmness 0..1 (`surfaceFirmness`). */
  firm: number;
  /** Horizontal ground speed as the flight ends (yards per ms), off the drawn arc — so the run-out
   *  starts at exactly the speed the ball arrived at. */
  v0: number;
  /** How far the ball FLEW (yards). The energy in the landing: a 250-yard drive skips, a 40-yard
   *  pitch does not, however similar their descent angles. */
  carry: number;
  /** How steeply it came down, degrees from horizontal, measured over the closing stretch of ground.
   *  Measured per club on the drawn arc: driver 36°, woods 41–43°, long irons 49°, hybrids 52–54°,
   *  short irons 56–58°, wedges 61–63°. SHALLOW skips and runs; STEEP pops up and stops. */
  descentDeg: number;
  /** True for a backspin check (the sim's roll was negative). */
  checking?: boolean;
  /**
   * The run-out ends IN THE CUP (a hole-out or a Dr Chipinski chip-in). A closing roll normally eases
   * to a dead stop; one that finishes in the hole must NOT — a ball still has pace when it drops, and
   * easing to zero at the lip is what made the chip-in read as "land, roll, stop, and then roll in".
   */
  holed?: boolean;
  clubId?: string;
  /**
   * Per-shot variation, 0..1 — NOT rng. The play view derives it from the shot's own geometry, so it
   * is stable for a given shot and costs zero draws (contract 1). Without it every drive bounces the
   * same way, which is the tell that you are watching an animation rather than a golf ball.
   */
  vary?: number;
  /**
   * Firmness of the ground `along` yards into the run-out. This is how a HAZARD gets to act on the
   * bounce: a ball that skips into a bunker loses the rest of its train there instead of skipping
   * merrily across it. Absent ⇒ the landing firmness the whole way.
   */
  firmAt?: (along: number) => number;
}

/**
 * Plan the LAND → BOUNCE → RUN-OUT.
 *
 * The hop train is ballistic and built from the shot itself. At each contact the ball keeps a share
 * of its forward speed (`restitution`, from the surface and the club) and a share of its downward
 * speed as height (`bounce`). A hop's LENGTH scales with `carry · cos²(descent)` — how far it flew
 * and how flat it arrived — and its APEX with `carry · sin²(descent)` — how steeply. That one
 * distinction is most of what makes clubs feel different on the ground: a driver at 36° skips long
 * and low several times, a wedge at 62° pops up once and sits down.
 *
 * Three rules hold whatever the numbers say:
 *  - **every airborne shot bounces at least once.** A ball arriving from the sky does not begin by
 *    rolling. Wedges used to plan ZERO hops (their run is too short to reach the old length floor),
 *    which is precisely the "irons and wedges never bounce" report.
 *  - **the hop train can never outrun the sim.** Its total is capped so a closing ROLL always
 *    remains, and since the sim's `dist` already collapses on soft ground, the surface kills the
 *    bounce through the physics rather than through a second opinion about it.
 *  - **speed is chained.** The first hop leaves at the ball's actual arrival speed times the
 *    restitution, so there is no step at touchdown.
 */
export function planRunout(landing: Landing, feel: RunoutFeel = DEFAULT_RUNOUT_FEEL): RunoutPlan {
  const f = clamp(landing.firm, 0, 1);
  const speed = Math.max(0.02, landing.v0); // yd/ms; guard a degenerate zero-carry shot
  const D = Math.max(0, landing.dist);
  const carry = Math.max(1, landing.carry);
  const cls = RUNOUT_BY_CLASS[flightClassOf(landing.clubId)];
  const vary = clamp(landing.vary ?? 0.5, 0, 1);
  const rad = (clamp(landing.descentDeg, 5, 85) * Math.PI) / 180;
  const cosD = Math.cos(rad);
  const sinD = Math.sin(rad);

  // Forward restitution: what survives a contact. Clamped short of 1 — a bounce that lost nothing
  // would never stop hopping.
  const kh = clamp(lerp(feel.restitutionSoft, feel.restitutionFirm, f) * cls.restitution, 0.05, 0.86);
  // Vertical restitution: how much of the arrival's downward speed comes back as height.
  const kv = clamp(lerp(feel.bounceSoft, feel.bounceFirm, f) * cls.bounce, 0.03, 0.85);

  // The first hop, from the shot's own flight. `vary` stretches or shortens the whole train.
  const lenVary = 1 + (vary * 2 - 1) * feel.varyLen;
  const apexVary = 1 + ((vary * 7.3) % 1 * 2 - 1) * feel.varyApex; // a second, decorrelated draw
  const fromTheAir = carry >= feel.minAirCarry;
  let hopLen = feel.hopLenK * carry * cosD * cosD * cls.len * kh * lenVary;
  // Whatever the club, the first bounce takes a real share of the ground the ball has left. A sand
  // wedge's modelled skip is four inches: true, and completely unwatchable.
  if (fromTheAir) hopLen = Math.max(hopLen, Math.min(D * feel.hopFirstMinShare, feel.hopFloorMax));
  let hopApex = Math.min(feel.hopApexMax, feel.hopApexK * carry * sinD * sinD * kv * apexVary);

  if (landing.checking) {
    // A check still LANDS first. The ball takes one real bounce forward carrying its flight momentum,
    // and the spin bites at the contact that ends it — which is when spin actually acts. (The first
    // version skidded through the air with no bounce at all, and the report was blunt: "wedges still
    // need to bounce at least once and then spin/roll on the land from the bounce".)
    const skid = Math.min(Math.max(hopLen, Math.min(D * feel.hopFirstMinShare, feel.hopFloorMax)), feel.backspinSkidMax);
    const skidMs = clamp(skid / speed, 170, 420);
    const skidApex = Math.max(0.25, Math.min(feel.hopApexMax * 0.6, hopApex, skid * feel.apexOverLen));
    const backMs = Math.max(feel.backspinMinMs, (skid + D) * feel.backspinMsPerYd);
    const skidV = skidMs > 0 ? skid / skidMs : 0;
    return {
      hops: [],
      rollDist: 0,
      rollMs: 0,
      totalMs: skidMs + backMs,
      totalDist: D,
      rollEndFrac: 0,
      check: { skid, skidMs, skidApex, backMs, skidV },
    };
  }

  // Never let the bounce swallow the whole run-out: the ball has to be SEEN rolling to a stop.
  const airBudget = D * (1 - feel.rollMinShare);
  const hops: Hop[] = [];
  // Speed leaving the first contact, in the RUN-OUT's own time base (see `runoutTimeScale`). Every
  // duration below derives from this one number, so hop→hop→roll stays continuous throughout.
  let v = speed * kh * feel.runoutTimeScale;
  let used = 0;
  let khRun = kh;
  let kvRun = kv;
  for (let i = 0; i < feel.hopMax; i++) {
    // The ground this hop lands ON decides what the ball keeps. A skip that finishes in a bunker or
    // deep rough loses the rest of its train there — the hazard acting on the bounce, not just on the
    // roll (which the sim already handles through `dist`).
    if (i > 0 && landing.firmAt) {
      const here = clamp(landing.firmAt(used), 0, 1);
      const drag = clamp((here + 0.15) / (f + 0.15), 0.15, 1.15);
      khRun *= drag;
      kvRun *= drag;
    }
    const want = Math.min(hopLen, Math.max(0, airBudget - used));
    // The FIRST hop always happens for a ball out of the sky — it does not begin by rolling. After
    // that a hop has to be worth drawing.
    if (want <= (i === 0 && fromTheAir ? 1e-4 : feel.hopMinYd)) break;
    // …and a hop is never taller than it is long by much, or the ball reads as bouncing vertically
    // off the turf instead of skipping along it.
    const apex = Math.max(0.05, Math.min(hopApex, want * feel.apexOverLen));
    hops.push({ dist: want, ms: Math.max(feel.hopMinMs, want / Math.max(0.01, v)), apex });
    used += want;
    v *= khRun;
    hopLen *= khRun * khRun; // constant horizontal speed within a hop ⇒ length decays as k²
    hopApex *= kvRun * kvRun;
  }

  const rollDist = Math.max(0, D - used);
  // The roll enters at the speed the LAST HOP ACTUALLY LEFT AT — `hopMinMs` can stretch a hop below
  // its chained speed, and reading `v` here would then start the roll faster than the hop that fed it.
  const last = hops[hops.length - 1];
  const vLast = last && last.ms > 0 ? Math.min(v, last.dist / last.ms) : v;
  const vRoll = Math.max(vLast, speed * feel.rollEntryFloor);
  // A roll that ends in the CUP keeps some pace: distance = mean speed x time, so the same ground at
  // a higher mean takes less time and the ball is still travelling when it disappears.
  const rollEndFrac = landing.holed ? feel.holedEndSpeed : 0;
  const rollMs = rollDist > 1e-6 ? (2 * rollDist) / Math.max(0.01, vRoll * (1 + rollEndFrac)) : 0;

  const raw = hops.reduce((a, h) => a + h.ms, 0) + rollMs;
  const totalMs = D < 0.3 && hops.length === 0 ? 0 : clamp(raw, feel.runoutMinMs, feel.runoutMaxMs);
  return { hops, rollDist, rollMs, totalMs, totalDist: D, rollEndFrac };
}

/** Where the ball is at run-out progress `t` ∈ [0,1]: `s` is the SIGNED distance travelled along the
 *  sim's roll path (yards; negative only inside a backspin drag-back, which travels back past the
 *  pitch mark), `h` its height above the ground (yards). Pure. */
export function sampleRunout(plan: RunoutPlan, t: number): { s: number; h: number } {
  const tt = clamp(t, 0, 1);
  if (plan.check) {
    const { skid, skidMs, skidApex, backMs, skidV } = plan.check;
    const total = skidMs + backMs;
    const ms = tt * total;
    if (ms <= skidMs) {
      // Airborne skid: constant forward speed (nothing has touched the ground yet), one low hop.
      const u = skidMs > 0 ? ms / skidMs : 1;
      return { s: skid * u, h: skidApex * Math.sin(Math.PI * u) };
    }
    // The spin bites. A CUBIC HERMITE whose start tangent is the skid's own velocity, so the ball
    // carries its momentum THROUGH the grab: still going forward as the spin takes hold, then
    // decelerating, reversing, and easing to rest.
    //
    // The first version of this used a smoothstep, whose derivative is ZERO at u = 0. That joins a
    // constant-speed forward skid to a dead stop — a hard velocity step, mid-animation — and only
    // then creeps backwards. It is exactly the reported "the ball now stops and then just slides",
    // and the reason the suite went green over it is that it only ever tested continuity at
    // TOUCHDOWN. Any piecewise run-out needs ds/dt checked across EVERY join.
    const u = backMs > 0 ? (ms - skidMs) / backMs : 1;
    const p0 = skid;
    const p1 = -plan.totalDist;
    const m0 = (skidV ?? 0) * backMs; // the skid's velocity, in this phase's own time units
    const h00 = 2 * u * u * u - 3 * u * u + 1;
    const h10 = u * u * u - 2 * u * u + u;
    const h01 = -2 * u * u * u + 3 * u * u;
    return { s: p0 * h00 + m0 * h10 + p1 * h01, h: 0 };
  }
  const total = plan.hops.reduce((a, h) => a + h.ms, 0) + plan.rollMs;
  if (total <= 0) return { s: plan.totalDist, h: 0 };
  let ms = tt * total;
  let s = 0;
  for (const hop of plan.hops) {
    if (ms <= hop.ms) {
      const u = hop.ms > 0 ? ms / hop.ms : 1;
      // Constant horizontal speed through the air; a clean parabolic arc for the height.
      return { s: s + hop.dist * u, h: hop.apex * Math.sin(Math.PI * u) };
    }
    ms -= hop.ms;
    s += hop.dist;
  }
  if (plan.rollMs <= 0) return { s: plan.totalDist, h: 0 };
  const u = clamp(ms / plan.rollMs, 0, 1);
  // Constant deceleration. `1 − (1−u)²` eases to a DEAD STOP; a roll that finishes in the cup blends
  // toward linear so the ball is still moving as it drops (`rollEndFrac`).
  const e = plan.rollEndFrac;
  const decel = 1 - (1 - u) * (1 - u);
  return { s: s + plan.rollDist * (decel * (1 - e) + u * e), h: 0 };
}
