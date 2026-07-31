/**
 * Putting model (extracted from round.ts, GS-refactor-split).
 *
 * The green-side putting sim: the pace-meter / make-band model, the break read + preview curve,
 * the contour-aware slope field sampling, and the auto (`onePutt`/`puttOut`) + manual putt
 * resolvers. A pure LEAF — it imports only the course contract, the contour field, and the RNG,
 * never round.ts, so there is no import cycle: round.ts imports the pieces it needs back and
 * re-exports the whole putting surface, leaving all external importers unchanged. Behaviour is
 * byte-for-byte identical to when this lived inside round.ts — a pure move.
 *
 * `HOLE_OUT_RADIUS` (the cup catch radius) lives here beside the putt resolvers that hole the
 * ball; round.ts re-exports it so `sim/round` remains its public import path.
 */

import { dist, type GreenLobe, type Vec } from './course/contract';
import { slopeFieldAt } from './contour';
import type { Rng } from './rng';

// House-style local clamp (round.ts keeps its own copy for its non-putting code).
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Ball within this many yards of the pin counts as holed. */
export const HOLE_OUT_RADIUS = 1.2;

/** A single putt's roll on the green, for the play view to animate (flat, no arc). */
export interface PuttLog {
  from: Vec;
  to: Vec;
  holed: boolean;
  /**
   * The CURVED travel of a manual putt (GS-green-contour-2), sampled course-space points from
   * `from` to exactly `to`: the break-preview curve at the struck aim/pace with the wobble sheared
   * in linearly — so the ball the player watches curls along the very break line they read, and a
   * double-breaker visibly S-bends into (or past) the cup. Absent (auto `onePutt`, old logs) ⇒ the
   * play view falls back to the classic straight lerp. Pure geometry, zero extra rng.
   */
  path?: Vec[];
}


/** Putting skill — a lower handicap / a caddie / putter perk tightens these. */
export interface PuttSkill {
  /** Make chance inside ~2.2 yds (default 0.85). */
  makeChance?: number;
  /** Lag distance left as a fraction of the putt length (default 0.07). */
  lagFrac?: number;
  /** Lag std-dev as a fraction of the putt length (default 0.05). */
  lagSd?: number;
  /** MANUAL putting only: half-width of the pace-meter "make" band, as a pace fraction (default
   *  DEFAULT_MANUAL_BAND). Wider = more forgiving timing window. Putter upgrades raise it. */
  manualBand?: number;
  /** MANUAL putting only (GS-putt-depth): the putter's confident RANGE (yards). Inside it the make
   *  band is full; beyond it the band shrinks with distance (a long putt is a nervier stroke), so a
   *  better putter — which reads and holes from further — is a real upgrade. Default DEFAULT_PUTT_RANGE. */
  puttRange?: number;
}

/** Manual-putt pace-meter tuning (shared by the resolver and the on-screen meter so they agree). */
export const MANUAL_IDEAL_PACE = 1.06; // perfect pace: firm enough to reach the cup and drop just past
export const MANUAL_PACE_MAX = 1.7; // top of the meter (a bold, runs-well-past stroke)
export const DEFAULT_MANUAL_BAND = 0.13; // base make-band half-width (pace fraction)

// GS-putt-depth — the make band SHRINKS with distance past the putter's confident range, so a long
// putt has a nervier timing window than a tap-in and a better putter (bigger `puttRange`) genuinely
// holes more from distance. Inside the range the factor is 1 (byte-for-byte the old flat band).
export const DEFAULT_PUTT_RANGE = 6.5; // base putter's confident range (yards) — full band within it
const PUTT_BAND_DECAY = 0.085; // how fast the band tightens per yard beyond the range
const PUTT_BAND_FLOOR = 0.32; // the band never shrinks below this fraction of its full width

/** The make-band multiplier at putt length `d` for a putter of confident range `range` (GS-putt-depth):
 *  1 within the range, then a smooth reciprocal taper to `PUTT_BAND_FLOOR` beyond it. Pure. Shared by
 *  the resolver and the on-screen meter so the drawn MAKE band is exactly the one you must hit. */
export function puttBandDistanceFactor(d: number, range = DEFAULT_PUTT_RANGE): number {
  const over = Math.max(0, d - range);
  return Math.max(PUTT_BAND_FLOOR, 1 / (1 + over * PUTT_BAND_DECAY));
}

/** The player's manual-putt input from the pace meter. */
export interface PuttControl {
  /** Struck pace as a fraction of the distance to the cup: 1 ≈ dies at the hole, MANUAL_IDEAL_PACE
   *  drops it, <1 leaves it short, >1 runs it past. Captured when the sweeping marker is tapped. */
  pace: number;
  /** Lateral AIM at the cup (yards, + = right of the ball→cup line; GS-greens-3). The player aims
   *  HIGH to let a sidehill putt BREAK back into the hole. Default 0 = straight at the cup. */
  aim?: number;
}

/** Break strength (GS-greens-3): how many yards a fully-sidehill putt curves, scaling with distance^1.35
 *  and (inversely) pace. Tuned so a 3-yd putt barely breaks but a 16-yd sidehiller swings several feet. */
const BREAK_K = 0.18;

/**
 * The LOCAL green slope (downhill vector, course space) at point `p` (GS-green-contour): the
 * dominant `greenSlope` plane plus each contour lobe's radial gradient. A mound's (h > 0) downhill
 * points away from its crest, a hollow's (h < 0) toward its centre; each lobe's magnitude ramps
 * 0 → |h| out to its radius `r` and fades smoothly beyond, so the field is continuous everywhere.
 * The ONE field the putt resolver, the green roll-out, the break-line preview, and the renderer's
 * fall-line arrows all sample — the graphic IS the physics. No lobes → exactly the plane. Pure,
 * zero rng. (GS-green-contour-2: the math lives in the green-agnostic `sim/contour.ts` so future
 * contoured FAIRWAYS share the same field; this is the green-named face of it.)
 */
export function greenSlopeAt(p: Vec, slope?: Vec, lobes?: readonly GreenLobe[]): Vec {
  return slopeFieldAt(p, slope, lobes);
}

/**
 * Cumulative BREAK profile (GS-green-contour): the signed lateral drift (yards, + = right of the
 * ball→cup line) accumulated at each of `samples`+1 evenly-spaced points along the stroke's travel.
 * The last entry is the net break at the ball's finish. Without lobes it is EXACTLY the GS-greens-3
 * closed form (brk · t^1.8 — the classic late-accelerating curl), byte-for-byte; with lobes the
 * LOCAL field is integrated along the line with the same late weighting (w(t) = t^0.8, the t^1.8
 * curve's derivative shape, normalised so a constant field still lands on the closed form at the
 * cup) — so a putt crossing a mound curls one way then the other, and the profile shows it. Pure.
 */
export function puttBreakProfile(
  from: Vec,
  pin: Vec,
  slope: Vec | undefined,
  pace: number,
  lobes?: readonly GreenLobe[],
  samples = 12,
): number[] {
  const d = dist(from, pin) || 1e-6;
  const ux = (pin[0] - from[0]) / d;
  const uy = (pin[1] - from[1]) / d;
  const rperp: Vec = [-uy, ux]; // right of the ball→cup line
  const paceFac = Math.max(0.7, Math.min(1.6, MANUAL_IDEAL_PACE / Math.max(0.4, pace)));
  const scale = BREAK_K * Math.pow(d, 1.35) * paceFac;
  const out: number[] = [0];
  if (!lobes || lobes.length === 0) {
    // Constant plane → the exact classic curl (keeps every existing preview/resolve byte-for-byte).
    const lat = slope ? slope[0] * rperp[0] + slope[1] * rperp[1] : 0;
    for (let i = 1; i <= samples; i++) out.push(scale * lat * Math.pow(i / samples, 1.8));
    return out;
  }
  const along = pace * d; // sample the field where the ball actually travels
  let acc = 0;
  let tot = 0;
  const accs: number[] = [];
  for (let i = 0; i < samples; i++) {
    const tm = (i + 0.5) / samples; // midpoint of each travel slice
    const s = greenSlopeAt([from[0] + ux * along * tm, from[1] + uy * along * tm], slope, lobes);
    acc += Math.pow(tm, 0.8) * (s[0] * rperp[0] + s[1] * rperp[1]);
    tot += Math.pow(tm, 0.8);
    accs.push(acc);
  }
  for (let i = 0; i < samples; i++) out.push((scale * accs[i]!) / tot);
  return out;
}

/**
 * The lateral BREAK (yards, + = right) a manual putt picks up from the green, for a straight
 * (aim-0) line from `from` to `pin` at the given pace — the NET drift at the finish. The shared
 * truth for the resolver, the on-screen break-curve preview, and the Mystic Mole's read. With
 * contour lobes the green can double-break; this is the net of the whole journey. Flat green → 0.
 */
export function puttBreakYd(
  from: Vec,
  pin: Vec,
  slope: Vec | undefined,
  pace: number,
  lobes?: readonly GreenLobe[],
): number {
  if (!lobes || lobes.length === 0) {
    // The original GS-greens-3 closed form, byte-for-byte for every plane-only green.
    if (!slope) return 0;
    const d = dist(from, pin) || 1e-6;
    const ux = (pin[0] - from[0]) / d;
    const uy = (pin[1] - from[1]) / d;
    const rperp: Vec = [-uy, ux];
    const lat = slope[0] * rperp[0] + slope[1] * rperp[1];
    const paceFac = Math.max(0.7, Math.min(1.6, MANUAL_IDEAL_PACE / Math.max(0.4, pace)));
    return BREAK_K * lat * Math.pow(d, 1.35) * paceFac;
  }
  const prof = puttBreakProfile(from, pin, slope, pace, lobes);
  return prof[prof.length - 1]!;
}

/** The widest lateral BOW of the break curve either side of the line at ideal pace (GS-green-contour):
 *  `max` ≥ 0 the rightmost drift, `min` ≤ 0 the leftmost. Aim-independent — the putt screen frames off
 *  it (a double-breaker bows BOTH ways, wider than its net break) and reads "double-breaks" off both
 *  sides exceeding a threshold. Pure. */
export function puttBreakBow(
  from: Vec,
  pin: Vec,
  slope: Vec | undefined,
  lobes?: readonly GreenLobe[],
): { max: number; min: number } {
  let max = 0;
  let min = 0;
  for (const v of puttBreakProfile(from, pin, slope, MANUAL_IDEAL_PACE, lobes)) {
    if (v > max) max = v;
    if (v < min) min = v;
  }
  return { max, min };
}

/** The lateral AIM (yards) that cancels the break at the ideal pace — the line the Mystic Mole reads
 *  out for you, and what the UI snaps to with a green-reading caddy. Pure. */
export function idealPuttAim(from: Vec, pin: Vec, slope: Vec | undefined, lobes?: readonly GreenLobe[]): number {
  return -puttBreakYd(from, pin, slope, MANUAL_IDEAL_PACE, lobes);
}

/** Sample the predicted curved PATH of a manual putt (course-space points) for drawing the break line,
 *  so the graphic IS the physics. The ball leaves along the aim and curves by the cumulative break as
 *  it slows (`puttBreakProfile` — on a contoured green the line can S-curve through a double-break).
 *  No wobble (that's the random part). Pure. */
export function puttPathPreview(
  from: Vec,
  pin: Vec,
  slope: Vec | undefined,
  aim: number,
  pace: number,
  lobes?: readonly GreenLobe[],
  samples = 12,
): Vec[] {
  const d = dist(from, pin) || 1e-6;
  const ux = (pin[0] - from[0]) / d;
  const uy = (pin[1] - from[1]) / d;
  const rperp: Vec = [-uy, ux];
  const prof = puttBreakProfile(from, pin, slope, pace, lobes, samples);
  const along = pace * d;
  const pts: Vec[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const lat = aim * t + prof[i]!;
    pts.push([from[0] + ux * along * t + rperp[0] * lat, from[1] + uy * along * t + rperp[1] * lat]);
  }
  return pts;
}

/**
 * Resolve ONE manual putt from the player's PACE input (skill, not pure luck). Auto-aimed at the cup;
 * the player controls speed via the meter. Holing needs the pace inside the make-band AND the ball
 * staying on-line — a small lateral wobble (one rng draw, scaled by distance and reduced by putter
 * skill) means long putts can slide by even on good pace, while short putts drop reliably. A missed
 * pace finishes short or long by the pace error; the lateral makes a miss read as sliding past. Pure
 * given (from, pin, control, skill, rng).
 */
export function manualPutt(
  rng: Rng,
  from: Vec,
  pinPt: Vec,
  control: PuttControl,
  skill: PuttSkill = {},
  slope?: Vec,
  lobes?: readonly GreenLobe[],
): PuttLog {
  const d = dist(from, pinPt) || 1e-6;
  const band = skill.manualBand ?? DEFAULT_MANUAL_BAND;
  // GS-putt-depth: the pace make-band tightens once the putt is past the putter's confident range —
  // a long putt is a nervier stroke, and a better putter (bigger range) holds a full band further out.
  // Within the range the factor is 1, so a tap-in / short putt is byte-for-byte the old flat band.
  const effBand = band * puttBandDistanceFactor(d, skill.puttRange ?? DEFAULT_PUTT_RANGE);
  const pace = Math.max(0, control.pace);
  const aim = control.aim ?? 0; // lateral aim at the cup (yd, + = right) — the player's break read
  const paceErr = pace - MANUAL_IDEAL_PACE; // <0 short, >0 long (in pace units)
  // Unit vector to the cup + its right-perpendicular (the line/break axis).
  const ux = (pinPt[0] - from[0]) / d;
  const uy = (pinPt[1] - from[1]) / d;
  const rperp: Vec = [-uy, ux];
  // Skill 0..1: a better putter (bigger band) wobbles less off-line. Keyed to the putter's INHERENT
  // band, not the distance-shrunk one, so the lateral skill is a property of the flat-stick (the
  // distance penalty lives entirely in the pace window above).
  const skillF = clamp01((band - DEFAULT_MANUAL_BAND) / 0.3);
  const wobble = rng.gaussian(0, d * 0.05 * (1 - 0.6 * skillF));
  // GS-greens-3: the green slope BREAKS the putt. The ball's lateral position AT THE CUP is your AIM
  // plus the slope's break plus a little wobble — so on a sidehill green you must aim HIGH (aim ≈
  // −break) for it to curl in. Flat green (no slope) → break 0 → byte-for-byte the old straight putt.
  // GS-green-contour: with contour lobes the break is the INTEGRATED local field along the line (a
  // double-breaker's net) — same wobble draw, so the rng stream is untouched either way.
  const breakYd = puttBreakYd(from, pinPt, slope, pace, lobes);
  const netLat = aim + breakYd + wobble;
  // The watchable travel (GS-green-contour-2): the same preview curve the aim screen drew, at the
  // ACTUAL struck aim/pace, then sheared linearly so it finishes exactly at the resolved rest point
  // — the wobble (and a make's drop into the cup) ease in over the whole roll instead of teleporting
  // at the end. Pure geometry off already-drawn numbers: the rng stream is untouched.
  const curvedPathTo = (end: Vec): Vec[] => {
    const pts = puttPathPreview(from, pinPt, slope, aim, pace, lobes);
    const last = pts[pts.length - 1]!;
    const ex = end[0] - last[0];
    const ey = end[1] - last[1];
    return pts.map((p, i) => {
      const t = i / (pts.length - 1);
      return [p[0] + ex * t, p[1] + ey * t] as Vec;
    });
  };
  // A make: pace inside the (distance-scaled) band AND the net lateral (aim + break + wobble) holds
  // within the cup.
  if (Math.abs(paceErr) <= effBand && Math.abs(netLat) <= HOLE_OUT_RADIUS) {
    return { from, to: pinPt, holed: true, path: curvedPathTo(pinPt) };
  }
  // Missed the make band: it travels `pace × d` along the line with the net lateral offset
  // (short/long + off-line).
  const travel = pace * d;
  const to: Vec = [from[0] + ux * travel + rperp[0] * netLat, from[1] + uy * travel + rperp[1] * netLat];
  // ...but it can still finish inside the cup's catch radius, and then it IS holed. In that case the
  // ball must END AT THE CUP, exactly like the make branch above (GS-putt-holed-position).
  //
  // It used to be reported holed while resting wherever it stopped — up to HOLE_OUT_RADIUS (1.2yd)
  // away, which at the putt camera is 9–20 screen pixels. So the ball was drawn sitting BESIDE the
  // hole with a visible gap and the round counted it as in: reported as "the hole here and the ball
  // there, a pretty big discrepancy". A holed ball is in the hole — there is no resting spot next to
  // it to draw. This is contract 5 (the graphic IS the physics) at the one moment it matters most.
  if (dist(to, pinPt) <= HOLE_OUT_RADIUS) {
    return { from, to: pinPt, holed: true, path: curvedPathTo(pinPt) };
  }
  return { from, to, holed: false, path: curvedPathTo(to) };
}

/**
 * Resolve ONE putt from `from` toward the pin. Pure/deterministic via `rng`. Short putts
 * usually drop; long putts lag close, with a small lateral miss so a miss reads as sliding
 * past the hole. The single building block both auto putt-out and manual putting share.
 */
export function onePutt(rng: Rng, from: Vec, pinPt: Vec, skill: PuttSkill = {}): PuttLog {
  const d = dist(from, pinPt);
  let newD: number;
  if (d <= 2.2) {
    newD = rng.bool(skill.makeChance ?? 0.85) ? 0 : rng.range(0.4, 1.0);
  } else {
    newD = Math.abs(rng.gaussian(d * (skill.lagFrac ?? 0.07), d * (skill.lagSd ?? 0.05)));
  }
  if (newD <= HOLE_OUT_RADIUS) return { from, to: pinPt, holed: true };
  // Place the ball `newD` from the pin along the pin→ball line, nudged laterally.
  let dx = from[0] - pinPt[0];
  let dy = from[1] - pinPt[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const lateral = rng.gaussian(0, newD * 0.3);
  return { from, to: [pinPt[0] + dx * newD - dy * lateral, pinPt[1] + dy * newD + dx * lateral], holed: false };
}

/** Putt out fully (auto), stepping `onePutt` until holed or the budget runs out. */
export function puttOut(
  rng: Rng,
  from: Vec,
  pinPt: Vec,
  maxPutts = 6,
  skill: PuttSkill = {},
): { putts: number; log: PuttLog[]; holed: boolean } {
  const log: PuttLog[] = [];
  let pos: Vec = from;
  let putts = 0;
  while (dist(pos, pinPt) > HOLE_OUT_RADIUS && putts < maxPutts) {
    putts++;
    const p = onePutt(rng, pos, pinPt, skill);
    log.push(p);
    pos = p.to;
    if (p.holed) break;
  }
  return { putts, log, holed: dist(pos, pinPt) <= HOLE_OUT_RADIUS };
}
