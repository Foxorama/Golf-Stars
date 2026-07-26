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

/** Feel knobs for the run-out. All of these ride `_gsFeel` through `playView`'s existing merge, so
 *  they are tunable live without a new top-level hook. */
export interface RunoutFeel {
  /** Fraction of a run-out spent BOUNCING on the softest ground / on the firmest. The rest rolls. */
  bounceShareSoft: number;
  bounceShareFirm: number;
  /** Speed kept through a bounce on the softest ground / on the firmest (the restitution). */
  restitutionSoft: number;
  restitutionFirm: number;
  /** First-hop apex as a fraction of the bounce phase's distance, and its ceiling in yards. */
  hopApexFrac: number;
  hopApexMax: number;
  /** Stop hopping once a hop is shorter than this (yards), or after this many hops. */
  hopMinYd: number;
  hopMax: number;
  /** Floor on the speed the ball ENTERS its closing roll at, as a fraction of its landing speed.
   *  Without it the geometric hop decay hands the roll ~8% of landing speed and a long run-out spends
   *  well over a second crawling the last few yards — the tail reads as a stall, not a settle. */
  rollEntryFloor: number;
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
  bounceShareSoft: 0.14,
  bounceShareFirm: 0.62,
  restitutionSoft: 0.38,
  restitutionFirm: 0.72,
  hopApexFrac: 0.18,
  hopApexMax: 6,
  hopMinYd: 0.5,
  hopMax: 4,
  rollEntryFloor: 0.22,
  runoutMinMs: 340,
  runoutMaxMs: 1500,
  backspinSkidFrac: 0.55,
  backspinSkidMax: 7,
  backspinMsPerYd: 55,
  backspinMinMs: 700,
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
  /** Backspin plan (absent on a forward run-out): the ball skids this far FORWARD first, then the
   *  spin bites and drags it back to rest. */
  check?: { skid: number; skidMs: number; skidApex: number; backMs: number };
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Plan the run-out. `dist` is the sim's |roll| in yards, `firm` the landing surface's firmness
 * (0..1, `surfaceFirmness`), `v0` the ball's horizontal speed as the flight ends (yards per ms —
 * measured off the SAME flight geometry the ball was just drawn flying, so there is no speed step at
 * touchdown), and `checking` true for a backspin run-out (the sim's roll was negative).
 */
export function planRunout(
  dist: number,
  firm: number,
  v0: number,
  checking: boolean,
  feel: RunoutFeel = DEFAULT_RUNOUT_FEEL,
): RunoutPlan {
  const f = clamp(firm, 0, 1);
  const speed = Math.max(0.02, v0); // yd/ms; guard a degenerate zero-carry shot
  const D = Math.max(0, dist);

  if (checking) {
    // Two beats: a forward skid carrying the flight's own speed, then the spin grabs and drags the
    // ball back past its pitch mark. The sim's rest point is already behind the touchdown, so the
    // total travel drawn is skid + D.
    const skid = Math.min(D * feel.backspinSkidFrac, feel.backspinSkidMax);
    // Floored generously: the forward skid is the beat that SELLS the spin (the ball goes the wrong way
    // first), and at flight speed it is over in ~30ms, which is invisible.
    const skidMs = clamp(skid / speed, 170, 420);
    const skidApex = Math.min(feel.hopApexMax * 0.5, skid * 0.22 + 0.4) * (0.35 + 0.75 * f);
    const backMs = Math.max(feel.backspinMinMs, (skid + D) * feel.backspinMsPerYd);
    return {
      hops: [],
      rollDist: 0,
      rollMs: 0,
      totalMs: skidMs + backMs,
      totalDist: D,
      check: { skid, skidMs, skidApex, backMs },
    };
  }

  // How much of the run is covered IN THE AIR: a firm fairway or slick ice skips most of the way, a
  // plugged bunker or deep tangle barely hops.
  const share = lerp(feel.bounceShareSoft, feel.bounceShareFirm, f);
  const k = lerp(feel.restitutionSoft, feel.restitutionFirm, f); // speed kept per contact
  const Db = D * share;
  const Dr = D - Db;

  // Hop distances decay as k² (constant horizontal speed within a hop, speed × k per contact, hang
  // time × k per contact ⇒ distance × k²), normalised so they sum to exactly Db. Hop APEX decays as
  // k² too — hang time is proportional to √apex, which keeps the whole train self-consistent.
  const q = k * k;
  const hops: Hop[] = [];
  const apex0 = Math.min(feel.hopApexMax, Db * feel.hopApexFrac + 0.35) * (0.25 + 0.85 * f);
  // The ball leaves the FIRST contact having already lost a slice to the ground.
  let v = speed * k;
  let remaining = Db;
  for (let i = 0; i < feel.hopMax && remaining > feel.hopMinYd; i++) {
    // Geometric share of what is left; the last hop takes the remainder so the train sums exactly.
    const want = i === feel.hopMax - 1 ? remaining : Db * (1 - q) * Math.pow(q, i);
    const d = Math.min(remaining, Math.max(0, want));
    if (d <= 1e-6) break;
    hops.push({ dist: d, ms: d / Math.max(0.01, v), apex: apex0 * Math.pow(q, i) });
    remaining -= d;
    v *= k;
  }
  // Anything the hop train did not cover rolls out with the rest.
  const rollDist = Dr + remaining;
  // Constant deceleration to rest: distance = ½·v·t ⇒ t = 2d/v.
  const vRoll = Math.max(v, speed * feel.rollEntryFloor);
  const rollMs = rollDist > 1e-6 ? (2 * rollDist) / Math.max(0.01, vRoll) : 0;

  const raw = hops.reduce((a, h) => a + h.ms, 0) + rollMs;
  const totalMs = D < 0.3 ? 0 : clamp(raw, feel.runoutMinMs, feel.runoutMaxMs);
  return { hops, rollDist, rollMs, totalMs, totalDist: D };
}

/** Where the ball is at run-out progress `t` ∈ [0,1]: `s` is the SIGNED distance travelled along the
 *  sim's roll path (yards; negative only inside a backspin drag-back, which travels back past the
 *  pitch mark), `h` its height above the ground (yards). Pure. */
export function sampleRunout(plan: RunoutPlan, t: number): { s: number; h: number } {
  const tt = clamp(t, 0, 1);
  if (plan.check) {
    const { skid, skidMs, skidApex, backMs } = plan.check;
    const total = skidMs + backMs;
    const ms = tt * total;
    if (ms <= skidMs) {
      // Airborne skid: constant forward speed (nothing has touched the ground yet), one low hop.
      const u = skidMs > 0 ? ms / skidMs : 1;
      return { s: skid * u, h: skidApex * Math.sin(Math.PI * u) };
    }
    // The spin bites. Smoothstep from the skid peak back to rest: it accelerates out of the grab and
    // eases into the finish, instead of the old ease-in-out that yanked away from a dead stop.
    const u = backMs > 0 ? (ms - skidMs) / backMs : 1;
    const e = u * u * (3 - 2 * u);
    return { s: skid + (-plan.totalDist - skid) * e, h: 0 };
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
  // Constant deceleration: covers ground fast on contact and eases to a dead stop.
  return { s: s + plan.rollDist * (1 - (1 - u) * (1 - u)), h: 0 };
}
