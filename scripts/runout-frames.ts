/**
 * Reconstructs the DRAWN run-out frame by frame, exactly as `playView.ts` draws it, for a matrix of
 * clubs x power x landing surface (GS-runout-visible). The point is to answer a question the eyes-on
 * sheet cannot: at the camera scales the game actually uses, is the bounce VISIBLE, and does the ball
 * move smoothly from its last bounce to its final lie?
 *
 * Every number here comes from the shipped functions - `planRunout`, `sampleRunout`, the same
 * `flightScaleFor`/`rollFractionFor` the sim resolves a shot with, and the same
 * `height * scale * heightExaggeration * hopDrawBoost` the play view converts to pixels. Nothing is
 * re-derived, so a fix shows up here.
 *
 *   npx tsx scripts/runout-frames.ts
 */
import { planRunout, sampleRunout, DEFAULT_RUNOUT_FEEL, RUNOUT_BY_CLASS } from '../src/render/runout';
import { CLUBS } from '../src/sim/clubs';
import { flightProfileOf, arcApex, ARC_FEEL, arcShapeOf, arrivalAngleDeg, flightScaleFor, rollFractionFor, flightClassOf } from '../src/sim/flight';
import { sampleCurvedFlight, flightDurationMs, flightGroundAt } from '../src/render/trajectory';
import type { Vec } from '../src/sim/course/contract';

// What the play view multiplies a modelled height by to get pixels (playView.ts DEFAULT_PLAY_FEEL).
const HEIGHT_EXAGGERATION = 0.55;
const HOP_DRAW_BOOST = DEFAULT_RUNOUT_FEEL.hopDrawBoost;
const FRAME_MS = 1000 / 60;
// The measured camera band (GS-ball-art): ~0.5-5.7 px/yd for shots. A drive watches from far out, an
// approach/chip from close in, so each shot is judged at the scale it is actually seen at.
const scaleFor = (carry: number): number => (carry > 200 ? 1.6 : carry > 120 ? 3.0 : 5.0);
// A hop the player can SEE: it has to lift the ball clear of its own drawn radius (~3px) for more than
// a frame or two. These are the thresholds the report flags against, not tuning knobs.
const VISIBLE_PX = 3;
const VISIBLE_FRAMES = 3;

/** Arrival speed + descent angle off the DRAWN arc, exactly as playView.ts takes them. */
function arrival(actualCarry: number, nominal: number, clubId: string) {
  const pr = flightProfileOf(clubId);
  const apex = arcApex(actualCarry, nominal, ARC_FEEL, pr);
  const shape = arcShapeOf(clubId);
  const from: Vec = [0, 0];
  const land: Vec = [0, actualCarry];
  const dur = flightDurationMs(actualCarry);
  const VEPS = 0.02;
  const at = (u: number) => sampleCurvedFlight(from, land, 0, flightGroundAt(u), apex, shape);
  const a = at(1 - VEPS).ground;
  const b = at(1).ground;
  const v0 = Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(1, VEPS * dur);
  const descentDeg = arrivalAngleDeg(apex, actualCarry, shape);
  return { v0, descentDeg, flightDur: dur };
}

interface Row {
  club: string;
  power: number;
  firm: number;
  carry: number;
  roll: number;
  hops: number;
  visibleHops: number;
  peakPx: number;
  hopShare: number;
  runoutMs: number;
  worstJumpPx: number;
  timeBaseSkew: number;
}

function measure(clubId: string, power: number, firm: number): Row {
  const c = CLUBS.find((x) => x.id === clubId)!;
  const pr = flightProfileOf(clubId);
  // The shot the sim would resolve at this power: carry scales with power, the roll FRACTION is a club
  // property (keyed on the nominal), so the roll scales with the carry.
  const carry = c.carry * flightScaleFor(pr, c.carry) * power;
  const roll = carry * rollFractionFor(pr, c.carry);
  const a = arrival(carry, c.carry, clubId);
  const plan = planRunout(
    { dist: Math.abs(roll), firm, v0: a.v0, carry, descentDeg: a.descentDeg, clubId, vary: 0.5, checking: roll < -0.3 },
    DEFAULT_RUNOUT_FEEL,
  );
  const scale = scaleFor(carry);

  // The drawn track: walk the run-out at 60fps through `sampleRunout`, converting to pixels the way
  // playView does. `s` is course yards along the sim's roll path; the ball's on-screen vertical lift is
  // `h * scale * heightExaggeration * hopDrawBoost` (the run-out is always in the boosted phase).
  const frames: { s: number; px: number }[] = [];
  const steps = Math.max(2, Math.ceil(plan.totalMs / FRAME_MS));
  for (let i = 0; i <= steps; i++) {
    const rs = sampleRunout(plan, i / steps);
    frames.push({ s: rs.s * scale, px: rs.h * scale * HEIGHT_EXAGGERATION * HOP_DRAW_BOOST });
  }
  let worstJumpPx = 0;
  for (let i = 1; i < frames.length; i++) {
    worstJumpPx = Math.max(worstJumpPx, Math.abs(frames[i]!.s - frames[i - 1]!.s));
  }
  // A hop counts as SEEN if its drawn apex clears the ball and it holds that lift for a few frames.
  let visibleHops = 0;
  let peakPx = 0;
  for (const h of plan.hops) {
    const apexPx = h.apex * scale * HEIGHT_EXAGGERATION * HOP_DRAW_BOOST;
    peakPx = Math.max(peakPx, apexPx);
    const framesUp = (h.ms / FRAME_MS) * 0.6; // the middle 60% of a sine arch is meaningfully lifted
    if (apexPx >= VISIBLE_PX && framesUp >= VISIBLE_FRAMES) visibleHops++;
  }
  if (plan.check) {
    const apexPx = plan.check.skidApex * scale * HEIGHT_EXAGGERATION * HOP_DRAW_BOOST;
    peakPx = Math.max(peakPx, apexPx);
    if (apexPx >= VISIBLE_PX && (plan.check.skidMs / FRAME_MS) * 0.6 >= VISIBLE_FRAMES) visibleHops++;
  }
  const hopDist = plan.hops.reduce((s, h) => s + h.dist, 0);
  // playView drives the animation off `plan.totalMs` but `sampleRunout` maps t onto the RAW hop+roll
  // total. When the clamp bites, the two time bases differ - report the ratio so a uniform stretch
  // (harmless) is told apart from a mismatch.
  const raw = plan.hops.reduce((s, h) => s + h.ms, 0) + plan.rollMs;
  const timeBaseSkew = plan.check ? 1 : raw > 0 ? plan.totalMs / raw : 1;
  return {
    club: clubId,
    power,
    firm,
    carry,
    roll,
    hops: plan.hops.length + (plan.check ? 1 : 0),
    visibleHops,
    peakPx,
    hopShare: plan.totalDist > 0.01 ? hopDist / plan.totalDist : 0,
    runoutMs: plan.totalMs,
    worstJumpPx,
    timeBaseSkew,
  };
}

const CLUBS_UNDER_TEST = ['D', '3W', '4H', '3i', '7i', '9i', 'PW', 'SW'];
const POWERS = [1, 0.85, 0.7, 0.55, 0.4];

for (const firm of [0.85, 0.45]) {
  console.log(`\n=================  landing firmness ${firm} (${firm > 0.6 ? 'firm fairway' : 'soft green'})  =================`);
  console.log('  club  pow   carry   roll  class       hops  seen  apexPx  hop%   msRunout  maxJumpPx  timeBase');
  const rows: Row[] = [];
  for (const club of CLUBS_UNDER_TEST) {
    for (const p of POWERS) rows.push(measure(club, p, firm));
  }
  for (const r of rows) {
    const flag = r.visibleHops === 0 ? '  <== NO VISIBLE BOUNCE' : '';
    console.log(
      `  ${r.club.padEnd(4)} ${r.power.toFixed(2)} ${r.carry.toFixed(0).padStart(6)} ${r.roll.toFixed(1).padStart(6)}  ` +
        `${flightClassOf(r.club).padEnd(10)} ${String(r.hops).padStart(4)} ${String(r.visibleHops).padStart(5)} ` +
        `${r.peakPx.toFixed(1).padStart(7)} ${(r.hopShare * 100).toFixed(0).padStart(4)}% ${r.runoutMs.toFixed(0).padStart(9)} ` +
        `${r.worstJumpPx.toFixed(1).padStart(10)} ${r.timeBaseSkew.toFixed(2).padStart(9)}${flag}`,
    );
  }
  const noBounce = rows.filter((r) => r.visibleHops === 0);
  console.log(`\n  shots with NO visible bounce: ${noBounce.length}/${rows.length}` + (noBounce.length ? `  (${noBounce.map((r) => `${r.club}@${r.power}`).join(', ')})` : ''));
  const skewed = rows.filter((r) => Math.abs(r.timeBaseSkew - 1) > 0.01);
  console.log(`  shots whose animation clock differs from the sampler's: ${skewed.length}/${rows.length}`);
}
