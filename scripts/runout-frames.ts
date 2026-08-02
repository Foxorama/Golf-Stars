/**
 * Reconstructs the DRAWN run-out frame by frame, exactly as `playView.ts` draws it, for a matrix of
 * clubs x power x landing surface (GS-runout-visible). The point is to answer a question the eyes-on
 * sheet cannot: at the camera scales the game actually uses, is the bounce VISIBLE, and does the ball
 * move smoothly from its last bounce to its final lie?
 *
 * Every number here comes from the shipped functions - `planRunout`, `sampleRunout`, `ballRadiusPx`,
 * the same `flightScaleFor`/`rollFractionFor` the sim resolves a shot with, and the same
 * `height * scale * heightExaggeration * hopDrawBoost` the play view converts to pixels. Nothing is
 * re-derived, so a fix shows up here.
 *
 * THREE columns matter, and the first two were missing while the bounce was reported invisible
 * (GS-landing-camera):
 *   - `runPx`  the whole run-out's DRAWN length. A driver's 38 yards at the shot camera is sixty
 *              screen pixels; six bounces cannot be shown in sixty pixels whatever the model says.
 *   - `px/fr`  how fast the ball leaves its FIRST CONTACT, in pixels per frame. Not the mean over the
 *              run-out — the closing roll decelerates to a dead stop by design, so a mean measures how
 *              much roll a club has rather than whether the ball is moving. Under ~1 the ball is not
 *              travelling, it is being redrawn in almost the same place, which is what "it lands and
 *              just sits there" looks like.
 *   - `seen`   hops whose drawn apex clears the DRAWN BALL (`ballRadiusPx`, not a hard-coded 3px)
 *              for long enough to register.
 *
 *   npx tsx scripts/runout-frames.ts
 */
import { planRunout, sampleRunout, DEFAULT_RUNOUT_FEEL, RUNOUT_BY_CLASS } from '../src/render/runout';
import { ballRadiusPx } from '../src/render/ball';
import { CLUBS } from '../src/sim/clubs';
import { flightProfileOf, arcApex, ARC_FEEL, arcShapeOf, arrivalAngleDeg, flightScaleFor, rollFractionFor, flightClassOf } from '../src/sim/flight';
import { sampleCurvedFlight, flightDurationMs, flightGroundAt } from '../src/render/trajectory';
import type { Vec } from '../src/sim/course/contract';

// What the play view multiplies a modelled height by to get pixels (playView.ts DEFAULT_PLAY_FEEL).
const HEIGHT_EXAGGERATION = 0.55;
// The camera the run-out is WATCHED at — the shipped constant, never a copy of it. `GS_LANDING_ZOOM=1`
// re-runs the sheet at the FLIGHT camera, which is what the run-out was drawn at before
// GS-landing-camera — i.e. it reproduces the reported "no bounce anywhere" baseline.
const LANDING_ZOOM = Number(process.env.GS_LANDING_ZOOM ?? DEFAULT_RUNOUT_FEEL.landingZoom);
// ⚠️ `timeBase` below is NOT cosmetic. It is `totalMs / raw`, i.e. how much the `runoutMaxMs` ceiling
// compresses the run-out — and it compresses the HOPS, which are already sitting on `hopMinMs`. A row
// under 1 is a row whose bounces are being played below the shortest duration that can be watched.
// This was printing 0.65 for a driver while the bounce was being reported invisible (GS-runout-clock).
const HOP_DRAW_BOOST = DEFAULT_RUNOUT_FEEL.hopDrawBoost;
// ⚠️ THE COLUMN THAT EXPLAINS "club X does not bounce" (GS-bounce-flat): a hop's DRAWN height divided
// by its DRAWN length. Under 1.0 the hop is flatter than it is long and reads as a smear; over 1.0 it
// reads as a bounce. A play-test named D/3W/4H/3i as not bouncing and 7i/9i/PW/SW as fine, and the
// shipped ratios split at exactly 1.0 across that line. It is a property of the DESCENT ANGLE, so a
// uniform `hopDrawBoost` under-serves precisely the clubs that land flattest.
const FRAME_MS = 1000 / 60;
// The measured camera band (GS-ball-art): ~0.5-5.7 px/yd for shots. A drive watches from far out, an
// approach/chip from close in, so each shot is judged at the scale it is actually seen at. That is the
// camera the FLIGHT is framed at; the run-out is watched at `scale / landingZoom` (GS-landing-camera).
const shotCam = (carry: number): number => (carry > 200 ? 1.6 : carry > 120 ? 3.0 : 5.0);
const landCam = (carry: number): number => shotCam(carry) / LANDING_ZOOM;
// A hop the player can SEE has to lift the ball clear of its own drawn radius for more than a frame or
// two. The radius is the one the play view draws (`ballRadiusPx`), never a constant — the ball's size
// is a function of the camera, and so therefore is this question.
const VISIBLE_FRAMES = 3;
// Below this the ball is not travelling, it is being redrawn in nearly the same place.
const MOVING_PX_PER_FRAME = 1;

/** Arrival speed + descent angle off the DRAWN arc, exactly as playView.ts takes them. */
function arrival(actualCarry: number, nominal: number, clubId: string) {
  const pr = flightProfileOf(clubId);
  const apex = arcApex(actualCarry, nominal, ARC_FEEL, pr);
  const shape = arcShapeOf(clubId);
  const from: Vec = [0, 0];
  const land: Vec = [0, actualCarry];
  const dur = flightDurationMs(apex);
  const VEPS = 0.02;
  const at = (u: number) => sampleCurvedFlight(from, land, 0, flightGroundAt(u, undefined, pr.dragTaper), apex, shape);
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
  drawnRatio: number;
  ballPx: number;
  runPx: number;
  hopPxPerFrame: number;
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
  // The run-out is watched at the LANDING camera, so that is the scale every pixel column below uses.
  const scale = landCam(carry);
  const ballPx = ballRadiusPx(scale);
  // The play view tells the plan how big the ball is DRAWN, so a hop it could not show is never
  // planned (GS-runout-seen). Same conversion the pixel columns below use, run backwards.
  const ballYd = ballPx / (scale * HEIGHT_EXAGGERATION * HOP_DRAW_BOOST);
  const plan = planRunout(
    { dist: Math.abs(roll), firm, v0: a.v0, carry, descentDeg: a.descentDeg, clubId, vary: 0.5, checking: roll < -0.3, ballYd },
    DEFAULT_RUNOUT_FEEL,
  );

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
  const runPx = Math.abs(plan.totalDist) * scale;
  const firstHop = plan.hops[0];
  const hopPxPerFrame = firstHop && firstHop.ms > 0 ? ((firstHop.dist * scale) / firstHop.ms) * FRAME_MS : 0;
  // A hop counts as SEEN if its drawn apex clears the ball and it holds that lift for a few frames.
  let visibleHops = 0;
  let peakPx = 0;
  for (const h of plan.hops) {
    const apexPx = h.apex * scale * HEIGHT_EXAGGERATION * HOP_DRAW_BOOST;
    peakPx = Math.max(peakPx, apexPx);
    const framesUp = (h.ms / FRAME_MS) * 0.6; // the middle 60% of a sine arch is meaningfully lifted
    if (apexPx >= ballPx && framesUp >= VISIBLE_FRAMES) visibleHops++;
  }
  if (plan.check) {
    const apexPx = plan.check.skidApex * scale * HEIGHT_EXAGGERATION * HOP_DRAW_BOOST;
    peakPx = Math.max(peakPx, apexPx);
    if (apexPx >= ballPx && (plan.check.skidMs / FRAME_MS) * 0.6 >= VISIBLE_FRAMES) visibleHops++;
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
    drawnRatio: plan.hops[0] ? (plan.hops[0].apex * HEIGHT_EXAGGERATION * HOP_DRAW_BOOST) / plan.hops[0].dist : 0,
    ballPx,
    runPx,
    hopPxPerFrame,
    hopShare: plan.totalDist > 0.01 ? hopDist / plan.totalDist : 0,
    runoutMs: plan.totalMs,
    worstJumpPx,
    timeBaseSkew,
  };
}

/**
 * What the play-test asked for, per club FAMILY: visible bounces (GS-bounce-ladder).
 *
 * ⚠️ The band is judged on the FIRM landing only. On a soft green a driver correctly comes down to two
 * skips and a wood to two — the forward restitution falls from 0.77 to 0.55 and the sim's own roll
 * collapses with it, which is the ground killing the bounce through the physics. A ball plugging into
 * a soft green is not a bug to tune out; holding the ladder there would be the bug.
 */
const WANT: Record<string, [number, number]> = {
  driver: [4, 6],
  wood: [3, 5],
  hybrid: [2, 4],
  ironLong: [1, 3],
  ironShort: [1, 2],
  wedge: [0, 1],
  putter: [0, 2],
};

const CLUBS_UNDER_TEST = ['D', '3W', '4H', '3i', '7i', '9i', 'PW', 'SW'];
const POWERS = [1, 0.85, 0.7, 0.55, 0.4];

for (const firm of [0.85, 0.45]) {
  console.log(`\n=================  landing firmness ${firm} (${firm > 0.6 ? 'firm fairway' : 'soft green'})  =================`);
  console.log('  club  pow   carry   roll  class       hops  seen  want   apexPx  ratio  ballPx   runPx  px/fr  hop%   msRunout  timeBase');
  const rows: Row[] = [];
  for (const club of CLUBS_UNDER_TEST) {
    for (const p of POWERS) rows.push(measure(club, p, firm));
  }
  const judged = firm > 0.6; // the ladder is a FIRM-ground promise — see WANT
  for (const r of rows) {
    const want = WANT[flightClassOf(r.club)]!;
    const short = !judged ? '' : r.visibleHops < want[0] ? '  <== TOO FEW BOUNCES' : r.visibleHops > want[1] ? '  <== too many' : '';
    const still = r.hopPxPerFrame < MOVING_PX_PER_FRAME ? '  <== NOT MOVING' : '';
    const squashed = r.timeBaseSkew < 0.99 ? '  <== HOPS COMPRESSED' : '';
    console.log(
      `  ${r.club.padEnd(4)} ${r.power.toFixed(2)} ${r.carry.toFixed(0).padStart(6)} ${r.roll.toFixed(1).padStart(6)}  ` +
        `${flightClassOf(r.club).padEnd(10)} ${String(r.hops).padStart(4)} ${String(r.visibleHops).padStart(5)} ` +
        `${(want[0] + '-' + want[1]).padStart(5)} ${r.peakPx.toFixed(1).padStart(8)} ${r.drawnRatio.toFixed(2).padStart(6)} ${r.ballPx.toFixed(1).padStart(7)} ` +
        `${r.runPx.toFixed(0).padStart(7)} ${r.hopPxPerFrame.toFixed(2).padStart(6)} ${(r.hopShare * 100).toFixed(0).padStart(4)}% ` +
        `${r.runoutMs.toFixed(0).padStart(9)} ${r.timeBaseSkew.toFixed(2).padStart(9)}${short}${still}${squashed}`,
    );
  }
  if (judged) {
    const off = rows.filter((r) => {
      const w = WANT[flightClassOf(r.club)]!;
      return r.visibleHops < w[0] || r.visibleHops > w[1];
    });
    console.log(`\n  rows outside the asked-for bounce band: ${off.length}/${rows.length}` + (off.length ? `  (${off.map((r) => `${r.club}@${r.power}:${r.visibleHops}`).join(', ')})` : ''));
  } else {
    console.log(`\n  (bounce band not judged on soft ground — the surface is meant to kill the train)`);
  }
  const squashedRows = rows.filter((r) => r.timeBaseSkew < 0.99);
  console.log(`  run-outs whose HOPS are compressed by the runoutMaxMs ceiling: ${squashedRows.length}/${rows.length}`);
  const crawling = rows.filter((r) => r.hopPxPerFrame < MOVING_PX_PER_FRAME);
  console.log(`  run-outs drawn under ${MOVING_PX_PER_FRAME}px/frame (reads as stationary): ${crawling.length}/${rows.length}`);
  const noBounce = rows.filter((r) => r.visibleHops === 0 && flightClassOf(r.club) !== 'wedge');
  console.log(`  non-wedge shots with NO visible bounce: ${noBounce.length}/${rows.length}`);
}
