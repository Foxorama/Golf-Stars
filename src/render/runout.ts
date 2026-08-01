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
  /** First hop LENGTH as a fraction of `carry · sin(2·descent)` — the ball's own flight decides how
   *  far it skips, so a long flat drive skips a long way and a short steep wedge barely moves.
   *
   *  A real driver's first bounce carries 15–20yd of its 30yd run-out; the first pass here modelled
   *  7 and spent the rest on a stuttering tail. The ceiling is the run-out itself (`airBudget`), so
   *  this only decides how the available ground is DIVIDED — bigger means a decisive first skip and
   *  a shorter tail, which is the shape a landing actually has.
   *
   *  RE-BASED BY GS-runout-seen when the angle term was corrected (see `hopBite`): the constant is
   *  a normalisation of a term whose scale changed, and it is set so the DRIVER's skip is
   *  arithmetically unchanged — the play-test was explicit that the driver is the one club that
   *  already reads right. */
  hopLenK: number;
  /** First hop APEX as a fraction of `carry · sin²(descent)` — the STEEPER the arrival, the higher
   *  the pop, which is why a wedge bounces up and a driver skids along. Plus a ceiling in yards. */
  hopApexK: number;
  hopApexMax: number;
  /**
   * How much of the PHYSICAL decay rate a bounce train is drawn as keeping (GS-bounce-ladder).
   *
   * A hop's length falls by `kh²` per contact and this multiplies that rate — the same kind of number
   * as `hopDrawBoost`, and there for the same reason. A real skip peaks a couple of feet, which is
   * nothing at these cameras, so the HEIGHT has been exaggerated 5.4x since GS-landing-real; the
   * train's LENGTH never got the same treatment, and an honestly-decaying train is two big skips and
   * then it is over. That is what a drive looks like from a helicopter and it is not what a golf game
   * should feel like — the play-test asks for four to six visible bounces off a driver.
   *
   * ⚠️ `kh²` is itself already an exaggeration and has been since GS-runout-ladder, which is worth
   * naming because the module's own comment calls it the physics. A projectile ranges `2·vh·vv/g`, and
   * between contacts `vh` decays by `kh` while `vv` decays by `kv` — so the honest rate is **`kh·kv`**,
   * which for a driver on firm turf is 0.39 against `kh²`'s 0.59. This constant is the first one to say
   * out loud that the train is drawn, not simulated.
   *
   * It is ONE number rather than a per-class table because `kh` already ladders by family (the class
   * row's `restitution` runs 1.1 down to 0.7): measured, the per-class gains needed to hit the asked-for
   * counts came out between 1.13 and 1.27, i.e. flat. And it MULTIPLIES the physical rate rather than
   * replacing it, so the surface still kills the train — a drive plugging into rough decays at 0.25 and
   * dies in two hops, exactly as it should.
   */
  trainSustain: number;
  /** Stop hopping once a hop is shorter than this (yards), or after this many hops. There is always
   *  at least ONE hop: every full shot arrives out of the air.
   *
   *  `hopMax` is the ABSOLUTE ceiling (and the live `_gsFeel` lever); how many skips a given club
   *  takes is `RunoutClassProfile.hops`, and the loop runs to the smaller of the two.
   *
   *  `hopMinYd` is the FALLBACK floor, used only when the caller cannot say how big the ball is
   *  drawn (`Landing.ballYd`). A length in yards cannot answer "will this be seen" on its own — the
   *  camera frames the shot, so the same 0.75yd hop is four pixels behind a wedge and half a pixel
   *  behind a drive. See `Landing.ballYd`. */
  hopMinYd: number;
  hopMax: number;
  /**
   * Floor on a single hop's DURATION (ms). A wedge's hop is under a yard, which at the run-out's own
   * time base is ~70ms — four frames, and you see nothing. The floor only bites on hops that are too
   * brief to watch, and on those the ball is going UP more than forward anyway.
   *
   * 130 → 100 by GS-runout-clock. Six frames of arc, and it reads: what made the late skips
   * unwatchable was never their duration but the fact that the camera was tracking the ball, so they
   * had no forward travel to read against (see `runoutLeashFrac`). Shortening them is what makes the
   * TAIL of the train skip along instead of crawling — the fifth hop goes from 0.73 to 0.95 px per
   * frame — and it buys ~120ms of headroom under `runoutMaxMs`, whose compression is the other half
   * of that report.
   *
   * ⚠️ The saving comes ENTIRELY out of the hops, and an earlier draft of this comment claimed
   * otherwise — that the floor was "paid for twice", the second time by lengthening the roll. It is
   * not: the roll enters at whichever is SLOWER of the chained speed and the last hop's drawn speed,
   * and on a driver that is the chained speed either way, so the roll does not move. Measured, and
   * pinned by a test, because the plausible version of this was wrong.
   */
  hopMinMs: number;
  /** SAFETY NET for the first hop: at least this share of the run-out, up to `hopFloorMax` yards. A
   *  wedge's modelled skip is a few inches — true, and unwatchable; the ball has to be SEEN to land.
   *  The cap keeps it a net and not a second model: a club whose own bounce is bigger keeps it. */
  hopFirstMinShare: number;
  hopFloorMax: number;
  /** Bounds on a hop's apex as a fraction of its own length, BEFORE `hopDrawBoost`. The ratio itself
   *  is not tuned — it comes from the descent angle (`apexOverLenFor`). These are the safety rails:
   *  below the floor a hop is a scuff, above the ceiling the ball reads as bouncing vertically off the
   *  turf instead of skipping along it. */
  apexOverLenMin: number;
  apexOverLenMax: number;
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
   *
   * RE-CALIBRATED BY GS-flight-shape, because it was fitted against arrival angles that were an
   * ARTEFACT. The old arc dropped the ball on a near-vertical tangent, so the closing-tenth chord the
   * run-out sampled read a 7-iron in at 55° and a sand wedge at 62°. The honest tangents are 50° and
   * 57° — the driver got 2.5° STEEPER (35.4° → 37.9°) while every scoring club got 5–6° flatter, and
   * since the drawn ratio follows `tan(descent)`, the one constant that was rescuing the short clubs
   * quietly stopped: full-swing invisible bounces went 0 → 2 (a 141yd 7-iron into a soft green fell to
   * 2.9px under a 3px ball). 5 → 5.4 puts every shot at 0.7 power and above back over the floor on
   * both firmnesses, and leaves the driver's drawn skip at 1:1.7 — still a skip, with room before the
   * 1:1.4 line. Measured by `scripts/runout-frames.ts`, not guessed.
   */
  hopDrawBoost: number;
  /** How much a shot's deterministic variation may stretch a hop train (±). Without it every drive
   *  bounces identically, which is the tell that it is animation and not golf. */
  varyLen: number;
  varyApex: number;
  /** The gravity CREEP's own timing (GS-roll-hairpin), drawn AFTER the ball has come to rest: a beat of
   *  stillness so the stop is READ, then a slow trickle down the fall line. It has to be slower per yard
   *  than the roll it follows — a ball gravity is barely moving, not a ball still carrying pace. */
  creepPauseMs: number;
  creepMsPerYd: number;
  creepMinMs: number;
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
   *
   * RE-SET BY GS-landing-camera, which found the correction had gone the other way. At 0.16 the run-out
   * played at about 1.3x REAL time while the flight above it played at 8x — and it was drawn into sixty
   * screen pixels, because the camera was framed for the whole shot. Measured across the bag, all forty
   * club/power/surface rows crossed their run-out at under ONE PIXEL PER FRAME: the ball was not moving,
   * it was being redrawn in almost the same place, for three seconds. The camera push-in fixes the
   * picture's SIZE; this fixes its PACE. 0.30 lands a driver's landing at ~2 px/frame at the landing
   * camera — a ball you can watch skip and settle, still 2.5x slower than the flight it arrived on.
   */
  runoutTimeScale: number;
  /**
   * Clamp on the whole run-out's animation (ms).
   *
   * `runoutMaxMs` is a SAFETY NET for a monster run-out (an ice-world runner, a derelict carom), not a
   * pacing dial — see the note where it is applied. When it bites it compresses the hops along with
   * everything else, and the hops are the part with no slack; a test pins that a full-power driver on
   * a firm fairway comes in under it.
   */
  runoutMinMs: number;
  runoutMaxMs: number;
  /**
   * THE LANDING IS WATCHED FROM THE LANDING (GS-landing-camera).
   *
   * A `viewRadius` multiplier — smaller is zoomed IN, exactly like the redirect cinematic's
   * `REDIRECT_ZOOM` — that the play view's camera eases to as the ball comes down and holds for the
   * whole run-out. It lives here, in the run-out's own feel block, because the run-out's camera is a
   * property of the run-out: the number below and `ballYd` above are ONE decision, and separating them
   * is how the plan ends up answering "can this hop be seen" about a camera the player is not looking
   * through.
   *
   * The play camera frames the SHOT: `decisionReach` solves a radius that fits the ball's furthest
   * resting place into the map's clear band, which on the composed phone is ~99 course yards of
   * half-width and about **1.6 px per yard**. A driver's run-out is 38 of those yards, so the entire
   * land → bounce → roll was drawn into **sixty-one screen pixels** — and at the old `runoutTimeScale`
   * it spent three seconds crossing them, a THIRD OF A PIXEL PER FRAME. Measured across the bag
   * (`scripts/runout-frames.ts`), all forty club/power/surface rows drew their run-out at under one
   * pixel per frame.
   *
   * That is the play-test report — *"it's now not visible showing any bounces at all, regardless of
   * club… it doesn't feel like you're hitting a golf ball at all"* — and no bounce model can answer it.
   * The hops were planned, and drawn, and geometrically right; a two-yard skip is three pixels at that
   * camera, and the ball takes half a second to cross it. The picture was too small, and then too slow.
   *
   * So the camera pushes in for the landing — which is what the shot is ABOUT, and what every
   * broadcast does. It rides `cineZoom`, the redirect's existing lever, so there is no second camera
   * and no new machinery. It also very nearly RESTORES the continuity `runoutTimeScale` had to break:
   * apparent speed is yards-per-ms times pixels-per-yard, so pushing in 1/0.34 while playing at 0.30 of
   * flight pace leaves the first hop travelling at ~0.9 of the speed the ball arrived at, against 0.12
   * before. The velocity cliff at touchdown was mostly a CAMERA cliff all along.
   */
  landingZoom: number;
  /** How tight the landing camera may ever get (course yards of view radius). `landingZoom` is a
   *  MULTIPLIER, and the play camera's own radius has a 30-yard floor — so a chip already framed at 30
   *  would be pushed to ten, less than half the putt screen's framing, for a ball that then runs two
   *  yards. The push-in exists to make a landing readable, not to put the player's nose on the turf. */
  landingMinRadiusYd: number;
  /** How long before touchdown the push-in starts (ms). The camera should have ARRIVED as the ball
   *  does — a zoom that begins on the bounce is a lurch on the one frame the player is watching. */
  landingZoomLeadMs: number;
  /** Per-frame ease toward the zoom target (the follow-cam's own rate is 0.2). Deliberately gentler:
   *  this is a camera move, and it is NOT gated by reduced motion — gating it would hide the landing
   *  from exactly the players who asked for less motion, which is the trade `accessibility.md` forbids
   *  — so it has to be a glide rather than a snap. */
  landingZoomEase: number;
  /**
   * THE CAMERA LETS GO OF THE BALL WHEN IT LANDS (GS-runout-clock) — how far, as a fraction of the
   * frame's height, the ball may travel from its pitch mark before the camera starts moving again.
   *
   * A skip reads as a skip because the ball ARCS FORWARD. The follow-cam eases toward the ball at 0.2
   * a frame, which the ball outruns easily in flight and not at all on the ground — so through the
   * entire run-out it was pinned to the focus point and the forward travel was drawn as *the world
   * scrolling behind a stationary ball*. Traced out of the real canvas, the ball's screen x over a
   * driver's whole landing went 238 → 196 (all of it the camera's lag decaying) and then did not move
   * again. What was left of a bounce was a fourteen-pixel vertical bob, in place, for a third of a
   * second. That is the *"still no bouncing on screen"* report, and it is invisible to any model that
   * reasons in course yards — the yards were right the whole time.
   *
   * So the landing camera, which is already framed FOR the landing, holds still and lets the ball skip
   * across it. This is a dead-zone camera, and the leash is what keeps a monster run-out (an ice world
   * runner, a derelict carom) from walking off the top of the frame: past it the camera is dragged
   * along, so the ball can never leave. Zero is not an option and neither is 1 — hold everything and a
   * long roll exits the frame; hold nothing and you are back to the pinned ball.
   *
   * It also pays for itself twice: a camera that is not moving lets the static-scene cache hold
   * (GS-shot-lag), so the run-out is the one part of a shot that can run at full frame rate.
   */
  runoutLeashFrac: number;
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
  hopLenK: 0.0448,
  hopApexK: 0.05,
  hopApexMax: 6,
  hopMinYd: 0.35,
  trainSustain: 1.1,
  hopMax: 6,
  hopMinMs: 100,
  hopFirstMinShare: 0.35,
  hopFloorMax: 2.5,
  apexOverLenMin: 0.12,
  apexOverLenMax: 0.55,
  minAirCarry: 12,
  rollMinShare: 0.3,
  holedEndSpeed: 0.45,
  hopDrawBoost: 5.4,
  varyLen: 0.22,
  varyApex: 0.3,
  creepPauseMs: 260,
  creepMsPerYd: 420,
  creepMinMs: 380,
  rollEntryFloor: 0,
  runoutTimeScale: 0.30,
  runoutMinMs: 340,
  runoutMaxMs: 3000,
  landingZoom: 0.34,
  landingMinRadiusYd: 20,
  landingZoomLeadMs: 240,
  landingZoomEase: 0.12,
  runoutLeashFrac: 0.3,
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
  /**
   * The most times this family ever skips (GS-bounce-ladder).
   *
   * HOW MANY TIMES A BALL SKIPS IS A PROPERTY OF THE CLUB, and until now it was one number for the
   * whole bag (`RunoutFeel.hopMax`, 6). So the only thing separating a driver from a 9-iron was where
   * the geometric train happened to fall under the drawability floor — and that floor is a fact about
   * the CAMERA, not about the club. GS-landing-camera moved it, which is precisely why the short irons
   * suddenly started taking three skips: nothing about the golf changed, the ball just got drawn from
   * closer in.
   *
   * The play-test's ladder, which is also the golf: driver 4–6 ▸ wood 3–5 ▸ hybrid 2–4 ▸ long iron 1–3
   * ▸ short iron 1–2 ▸ wedge 0–1. These are the CEILINGS of that ladder; the bottom of each band falls
   * out on its own at lower power and on softer ground, where the sim's own roll collapses. The hybrid
   * sits at 3 rather than its permitted 4 so the ladder still steps — a hybrid skipping as often as a
   * 3-wood reads as no ladder at all.
   *
   * Compile-forced by the `Record<FlightClass, …>`: splitting a flight class makes this a decision that
   * has to be taken, not one that can be forgotten.
   */
  hops: number;
}

/**
 * Driver skips long, low and often; a wood does nearly the same; a hybrid comes in steeper and
 * bounces less but still releases; a long iron is the low runner; a short iron lands steep and
 * checks; a wedge plops once and stops, which is where the backspin build takes over.
 *
 * `len` CARRIES THE WHOLE OF A CLUB'S BITE NOW (GS-runout-seen). It used to sit beside a `cos²(θ)`
 * angle term that was itself a steepness penalty — so a steep club was charged twice, and the
 * ones charged hardest were the ones the play-test said never bounced. With `hopBite` in its place
 * the angle term is near-flat across the bag, and this row is the only place the club's spin and
 * face are expressed. The mid-bag went UP (`ironShort` 0.8 → 0.93, measured against a real 7-iron's
 * ~4.5yd first bounce off firm turf); `wedge` went DOWN by the same factor the term itself moved
 * (0.55 → 0.28), which is what HOLDS the wedge exactly where it was — its modelled skip stays under
 * `hopFirstMinShare`'s net, so every PW/SW landing AND the backspin check's skid are byte-for-byte.
 * That is deliberate: a wedge plopping once is the design, and it is where GS-backspin-optin's tuned
 * check lives.
 */
export const RUNOUT_BY_CLASS: Record<FlightClass, RunoutClassProfile> = {
  driver: { restitution: 1.1, bounce: 0.88, len: 1.15, hops: 6 },
  wood: { restitution: 1.06, bounce: 0.92, len: 1.08, hops: 5 },
  hybrid: { restitution: 0.98, bounce: 1.02, len: 0.95, hops: 3 },
  ironLong: { restitution: 1.03, bounce: 0.96, len: 1.05, hops: 3 },
  ironShort: { restitution: 0.9, bounce: 1.08, len: 0.93, hops: 2 },
  wedge: { restitution: 0.7, bounce: 1.2, len: 0.28, hops: 1 },
  putter: { restitution: 0.6, bounce: 0.6, len: 0.3, hops: 1 },
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
   * The DRAWN ball's radius, expressed in yards of modelled hop apex (GS-runout-seen) — i.e. the
   * play view's own `height · scale · heightExaggeration · hopDrawBoost` run backwards from the
   * ball's drawn radius. A hop whose apex is under it never lifts the ball clear of itself, so it
   * is not a bounce the player can see, and it is NOT PLANNED: the ground goes to the closing roll
   * instead of to a ≥`hopMinMs` segment of sub-pixel scuffing.
   *
   * Drawability is a question about PIXELS, and the model cannot answer it in yards. The camera
   * frames the shot, so a 0.75yd hop is a clearly-read 3.7px behind a 9-iron and an invisible 0.8px
   * behind a drive — measured, and the reason a yard floor could never separate the two (a driver
   * planned SIX hops and drew TWO while a 4-hybrid planned three and drew one). Rather than
   * re-derive the camera here from carry — a second description of a decision `project.ts` owns —
   * the caller passes what it is about to draw.
   *
   * Absent ⇒ the fixed `hopMinYd` floor, exactly as before.
   */
  ballYd?: number;
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
 * speed as height (`bounce`). A hop's LENGTH scales with `carry · sin(2·descent)` — the projectile
 * range relation, see `hopBite` — and its APEX with `carry · sin²(descent)`, so a steep arrival
 * pops up where a shallow one skips along. Most of what makes clubs feel different on the ground is
 * carried by the CLASS profile and by how much of its speed each keeps: a driver skips long and low
 * several times, a wedge pops up once and sits down.
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
/**
 * The apex-to-length ratio a hop leaving the turf at `descentDeg` actually has (GS-runout-visible).
 * There is nothing to tune here: a projectile launched at angle θ travels `v²·sin2θ/g` and peaks at
 * `v²·sin²θ/2g`, so **apex / length = tan(θ) / 4**. A driver arriving at 35° skips at 0.18; a wedge
 * dropping in at 62° pops at 0.47.
 *
 * This replaced a FLAT `apexOverLen` of 0.3, which was simultaneously too generous for the driver and
 * far too stingy for the wedge — and stingy in the one place it mattered. `hopApex` already carries the
 * steep-descent physics (it scales with `sin²(descent)`), but the flat cap threw it away: a hop's
 * length is bounded by the sim's ROLL, and a checking short iron's roll is deliberately tiny, so the
 * cap crushed the apex to nothing. Measured at the cameras the game actually uses, 18 of 40 club/power
 * combinations drew a peak bounce of 0.7–2.6px under a ball drawn at 3px — the ball never cleared
 * itself, which is exactly the reported "it lands and stops, or lands and does a flat roll". Pure.
 */
/**
 * The `viewRadius` multiplier the landing is actually watched at (GS-landing-camera).
 *
 * THE ONE ANSWER to "which camera is the run-out drawn at". The play view asks it twice — once to push
 * the camera in, and once to tell `planRunout` how big the ball will be drawn (`Landing.ballYd`) — and
 * the two must be the same number or the plan trims a train for a camera nobody is looking through.
 *
 * `undefined` radius means the play view is not in focus mode at all (the replay/demo path, where
 * `holeProjector` fits the whole hole and `cineZoom` is inert), so the honest answer is 1.
 */
export function landingZoomFor(viewRadius: number | undefined, feel: RunoutFeel = DEFAULT_RUNOUT_FEEL): number {
  if (viewRadius == null || !(viewRadius > 0)) return 1;
  return clamp(Math.max(feel.landingZoom, feel.landingMinRadiusYd / viewRadius), feel.landingZoom, 1);
}

/**
 * Where the camera should look while the ball runs out (GS-runout-clock) — a dead-zone camera.
 *
 * Given the pitch mark, where the ball is now, and how long the leash is IN YARDS, this returns the
 * point to ease toward: the pitch mark itself while the ball is inside the leash (so the ball visibly
 * skips ACROSS a still frame, which is the whole point), and a point dragged along behind it once the
 * ball goes further than that (so a monster roll can never walk off the top).
 *
 * Pure, so the leash rule is testable without a browser — the play view supplies the leash in yards by
 * converting `runoutLeashFrac` through its own projector, because "how far may the ball travel" is a
 * question about the SCREEN and only the caller knows the scale.
 */
export function runoutCameraTarget(
  pitch: readonly [number, number],
  ball: readonly [number, number],
  leashYd: number,
): [number, number] {
  const dx = ball[0] - pitch[0];
  const dy = ball[1] - pitch[1];
  const d = Math.hypot(dx, dy);
  if (!(d > leashYd) || !(d > 1e-9)) return [pitch[0], pitch[1]];
  const k = (d - leashYd) / d;
  return [pitch[0] + dx * k, pitch[1] + dy * k];
}

export function apexOverLenFor(descentDeg: number, feel: RunoutFeel = DEFAULT_RUNOUT_FEEL): number {
  const t = Math.tan((clamp(descentDeg, 5, 85) * Math.PI) / 180) / 4;
  return clamp(t, feel.apexOverLenMin, feel.apexOverLenMax);
}

/**
 * How far a hop leaving the turf at `descentDeg` CARRIES, as an angle term (GS-runout-seen).
 *
 * A projectile launched at θ ranges `v²·sin(2θ)/g`, and that is the other half of the relation
 * `apexOverLenFor` already derives from: `H/R = (v²sin²θ/2g) / (v²sin2θ/g) = tan(θ)/4`. So the
 * module has always held the correct geometry — it simply wrote the LENGTH term as `cos²(θ)`,
 * which is neither the range relation nor consistent with its own apex ratio.
 *
 * That single disagreement is the play-test report. `sin(2θ)` is almost FLAT across the bag's
 * arrival angles (0.97 at the driver's 38°, 1.00 at 45°, 0.99 at a 7-iron's 50°) because a bounce
 * trades forward speed for height and back again; `cos²(θ)` falls away steeply (0.62 → 0.41 over
 * the same range), so it charged every steep-landing club a penalty the physics does not, on top of
 * the one `RUNOUT_BY_CLASS.len` already charges. The clubs it hit hardest are exactly the ones the
 * play-test named: *"woods, hybrids and long irons don't really have any bounce animation, they land
 * and just stick."* A short iron's modelled first skip comes out ~1.5x longer for it; the driver's
 * is unchanged, because `hopLenK` is re-based on the driver's own arrival (see there).
 *
 * NOT a balance change: this re-cuts the roll the sim already computed between hops and the closing
 * roll. The ball still stops exactly where `rollOut` put it.
 */
export function hopBite(descentDeg: number): number {
  return Math.sin(2 * ((clamp(descentDeg, 5, 85) * Math.PI) / 180));
}

export function planRunout(landing: Landing, feel: RunoutFeel = DEFAULT_RUNOUT_FEEL): RunoutPlan {
  const f = clamp(landing.firm, 0, 1);
  const speed = Math.max(0.02, landing.v0); // yd/ms; guard a degenerate zero-carry shot
  const D = Math.max(0, landing.dist);
  const carry = Math.max(1, landing.carry);
  const cls = RUNOUT_BY_CLASS[flightClassOf(landing.clubId)];
  const vary = clamp(landing.vary ?? 0.5, 0, 1);
  const rad = (clamp(landing.descentDeg, 5, 85) * Math.PI) / 180;
  const bite = hopBite(landing.descentDeg);
  const sinD = Math.sin(rad);
  // How tall a hop is allowed to be relative to its length, from the arrival angle (GS-runout-visible).
  const apexOverLen = apexOverLenFor(landing.descentDeg, feel);

  // Forward restitution: what survives a contact. Clamped short of 1 — a bounce that lost nothing
  // would never stop hopping.
  const kh = clamp(lerp(feel.restitutionSoft, feel.restitutionFirm, f) * cls.restitution, 0.05, 0.86);
  // Vertical restitution: how much of the arrival's downward speed comes back as height.
  const kv = clamp(lerp(feel.bounceSoft, feel.bounceFirm, f) * cls.bounce, 0.03, 0.85);

  // The first hop, from the shot's own flight. `vary` stretches or shortens the whole train.
  const lenVary = 1 + (vary * 2 - 1) * feel.varyLen;
  const apexVary = 1 + ((vary * 7.3) % 1 * 2 - 1) * feel.varyApex; // a second, decorrelated draw
  const fromTheAir = carry >= feel.minAirCarry;
  let hopLen = feel.hopLenK * carry * bite * cls.len * kh * lenVary;
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
    const skidApex = Math.max(0.25, Math.min(feel.hopApexMax * 0.6, hopApex, skid * apexOverLen));
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
  // How much of a hop the NEXT one keeps (GS-bounce-ladder): the physical `kh²`, sustained. It is
  // tracked alongside `khRun` rather than derived from it inside the loop so a mid-train hazard drags
  // both by the same factor — a skip that finishes in a bunker loses its train there.
  let decay = khRun * khRun * feel.trainSustain;
  // How many times THIS CLUB skips, never a single number for the whole bag. `hopMax` stays the
  // absolute ceiling (and the live `_gsFeel` lever).
  const maxHops = Math.min(feel.hopMax, cls.hops);
  for (let i = 0; i < maxHops; i++) {
    // The ground this hop lands ON decides what the ball keeps. A skip that finishes in a bunker or
    // deep rough loses the rest of its train there — the hazard acting on the bounce, not just on the
    // roll (which the sim already handles through `dist`).
    if (i > 0 && landing.firmAt) {
      const here = clamp(landing.firmAt(used), 0, 1);
      const drag = clamp((here + 0.15) / (f + 0.15), 0.15, 1.15);
      khRun *= drag;
      kvRun *= drag;
      decay *= drag;
    }
    const want = Math.min(hopLen, Math.max(0, airBudget - used));
    // The FIRST hop always happens for a ball out of the sky — it does not begin by rolling. After
    // that a hop has to be worth drawing.
    if (want <= (i === 0 && fromTheAir ? 1e-4 : feel.hopMinYd)) break;
    // …and a hop is never taller than it is long by much, or the ball reads as bouncing vertically
    // off the turf instead of skipping along it.
    const apex = Math.max(0.05, Math.min(hopApex, want * apexOverLen));
    // A HOP THAT CANNOT BE DRAWN IS NOT PLANNED (GS-runout-seen). Its ground goes to the closing
    // roll, where it is at least seen as motion, rather than to a `hopMinMs` segment of the ball
    // scuffing along under its own radius. The first hop is exempt for the same reason it is above:
    // a ball out of the sky does not begin by rolling, whatever the camera.
    if (i > 0 && landing.ballYd !== undefined && apex < landing.ballYd) break;
    hops.push({ dist: want, ms: Math.max(feel.hopMinMs, want / Math.max(0.01, v)), apex });
    used += want;
    v *= khRun; // the SPEED chain stays physical — only the drawn train is sustained
    hopLen *= decay;
    // THE TRAIN STAYS SELF-SIMILAR AS IT DECAYS (GS-runout-ladder). Physically a hop's apex falls as
    // `kv²` — roughly 30% per bounce on firm turf — while its LENGTH falls as `kh²`, roughly 65%. Both
    // are right, and drawn together they mean the height collapses more than twice as fast as the
    // ground: measured in game, a driver planned SIX hops and the player saw TWO, the rest sub-pixel
    // scuffs under a 3px ball. Height is already the exaggerated axis here (`hopDrawBoost`) — this
    // simply exaggerates it CONSISTENTLY along the train instead of only on the first hop, so each
    // skip is a smaller copy of the one before and the whole landing reads. `kv` still sets the
    // FIRST hop's height, so soft ground still plops and firm ground still skips: the surface's
    // character is untouched, only the tail survives to be seen.
    hopApex *= decay;
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
  let rollMs = rollDist > 1e-6 ? (2 * rollDist) / Math.max(0.01, vRoll * (1 + rollEndFrac)) : 0;

  // THE CEILING COMPRESSES EVERY PHASE EQUALLY, AND IT MUST NOT BE ALLOWED TO BITE (GS-runout-clock).
  //
  // `sampleRunout` maps `t` onto this raw hop+roll total while the play view drives the animation off
  // `totalMs`, so a clamped run-out plays uniformly faster than it was planned. Uniform is the ONLY
  // safe way to shorten it — every phase's speed scales by the same factor, so no join gains a step —
  // but it is not free: the hops are already sitting on `hopMinMs`, the shortest duration that can be
  // watched, and the roll has seconds of slack. Measured in game, a driver's hops were being played at
  // **100ms each instead of 130** while the roll kept 1.9 seconds of the clock.
  //
  // ⚠️ Trimming the ROLL alone instead is the obvious fix and it is WRONG: the roll's duration is
  // `2·rollDist / vLast`, pinned by the speed it inherits, so shortening it makes the ball ACCELERATE
  // out of its last bounce. `tests/runout.test.ts` catches that at the hop→roll join — which is why
  // the ceiling is now set high enough not to bite on an ordinary shot rather than made cleverer.
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
