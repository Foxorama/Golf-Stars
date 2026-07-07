/**
 * Warp-scramble prototype (measurement only): what if warp auto-plays the Unending Universe with an
 * N-ball CREW SCRAMBLE — every stroke (full swings AND putts) plays N balls and keeps the best?
 *
 * Faithful to the real engine: uses the exported sim pieces (executeShot / pickBetterExec /
 * layupTarget / aiClub / attackTarget / onePutt) in playHole's exact loop shape, the shipped
 * pin-attack arming rule, and the real run loop (startRun → finishStop → shop → travel).
 */
import {
  executeShot,
  pickBetterExec,
  layupTarget,
  aiClub,
  attackTarget,
  onePutt,
  pinOf,
  biomeCarryMult,
  HOLE_OUT_RADIUS,
  MAX_OVER_PAR,
  type ExecOpts,
  type ExecResult,
} from '../src/sim/round';

const MAX_FULL_SWINGS = 20; // mirrors round.ts's private constant
import { dist, type Hole, type Vec, type FeatureKind } from '../src/sim/course/contract';
import { Rng } from '../src/sim/rng';
import {
  startRun,
  currentCourse,
  finishStop,
  travel,
  routeOptions,
  buy,
  shopOffer,
  playerHoleOpts,
  endlessAttackArmed,
} from '../src/sim/rpg/run';
import type { Run } from '../src/sim/rpg/run';
import { usableBag } from '../src/sim/rpg/economy';
import type { PlayedHole } from '../src/sim/round';

/** One hole with an N-ball scramble on every stroke (swings + putts). balls=1 ≈ the solo AI. */
function warpHole(hole: Hole, rng: Rng, opts: ReturnType<typeof playerHoleOpts>, balls: number, attack: boolean): PlayedHole {
  const bag = opts.bag!;
  const flag = pinOf(hole);
  const carryMult = opts.carryMult ?? biomeCarryMult(hole);
  let ball: Vec = [...hole.tee] as Vec;
  let lie: FeatureKind = 'tee';
  let strokes = 0;
  let penalties = 0;
  let putts = 0;
  let holed = false;
  let pickedUp = false;
  const maxStrokes = hole.par + MAX_OVER_PAR;
  const shots: any[] = [];

  for (let swing = 0; swing < MAX_FULL_SWINGS; swing++) {
    const remaining = dist(ball, flag);
    if (lie === 'green' || remaining <= HOLE_OUT_RADIUS) break;
    const usable = usableBag(bag as any, lie, false);
    const tgt = (attack ? attackTarget(hole, ball, usable, carryMult) : null) ?? layupTarget(hole, ball, lie, usable, carryMult);
    const club = aiClub(hole, ball, tgt, carryMult, usable);
    const execOpts: ExecOpts = {
      carryMult,
      dispersionMult: opts.dispersionMult,
      shotMods: opts.shotMods,
      shapeMod: opts.shapeMod,
      minCarryBoost: opts.minCarryBoost,
      wedgeWindow: opts.wedgeWindow,
      windResist: opts.windResist,
      backspinBoost: opts.backspinBoost,
      hazardImmune: opts.hazardImmune,
    };
    let ex: ExecResult = executeShot(hole, ball, lie, tgt, club, execOpts, rng);
    for (let b = 1; b < balls; b++) {
      ex = pickBetterExec(ex, executeShot(hole, ball, lie, tgt, club, execOpts, rng), flag).ex;
    }
    strokes += 1 + ex.penaltyStrokes;
    penalties += ex.penaltyStrokes;
    shots.push(ex.log);
    ball = ex.ballAfter;
    lie = ex.lieAfter;
    if (ex.holed) {
      holed = true;
      break;
    }
    if (strokes >= maxStrokes) {
      pickedUp = true;
      strokes = maxStrokes;
      break;
    }
    if (lie === 'green' || dist(ball, flag) <= HOLE_OUT_RADIUS) break;
  }

  const puttLog: any[] = [];
  if (!holed && !pickedUp) {
    if (dist(ball, flag) <= HOLE_OUT_RADIUS) holed = true;
    else {
      let pos: Vec = ball;
      while (dist(pos, flag) > HOLE_OUT_RADIUS && strokes < maxStrokes) {
        putts++;
        strokes++;
        // N-ball putt: keep a holed draw, else the closest finishing ball.
        let best = onePutt(rng, pos, flag, opts.puttSkill ?? {});
        for (let b = 1; b < balls; b++) {
          const alt = onePutt(rng, pos, flag, opts.puttSkill ?? {});
          if (alt.holed && !best.holed) best = alt;
          else if (alt.holed === best.holed && dist(alt.to, flag) < dist(best.to, flag)) best = alt;
        }
        puttLog.push(best);
        pos = best.to;
        if (best.holed) break;
      }
      holed = dist(pos, flag) <= HOLE_OUT_RADIUS;
      if (!holed) {
        pickedUp = true;
        strokes = maxStrokes;
      }
    }
  }
  return {
    record: { par: hole.par, strokes },
    stat: { fairwayHit: null, gir: false, putts } as any,
    shots,
    putts: puttLog,
    holed,
    pickedUp,
  } as PlayedHole;
}

function greedyBuy(run: Run): Run {
  for (let i = 0; i < 40; i++) {
    const offer = shopOffer(run);
    const affordable = offer.filter((o) => o.cost <= run.credits).sort((a, b) => b.cost - a.cost);
    if (!affordable.length) break;
    const next = buy(run, affordable[0]!.item.id);
    if (next === run) break;
    run = next;
  }
  return run;
}

function warpRun(seed: number, balls: number, maxStops = 100): number {
  let run = startRun(seed, 'unending');
  for (let i = 0; i < maxStops && run.status === 'active'; i++) {
    const course = currentCourse(run);
    const rng = new Rng(`${course.seed}:play`);
    const opts = playerHoleOpts(run);
    const attack = endlessAttackArmed(run);
    // GS-set-survival: play the whole set of four (no mid-set death); finishStop scores the cumulative total.
    const played: PlayedHole[] = course.holes.map((h) => warpHole(h, rng, opts, balls, attack));
    const fin = finishStop(run, course, played);
    run = fin.run;
    if (run.status !== 'active') break;
    run = greedyBuy(run);
    const routes = routeOptions(run);
    run = travel(run, routes.reduce((b, r) => (r.distanceJump < b.distanceJump ? r : b), routes[0]!));
  }
  return run.holesSurvived;
}

const SEEDS = Number(process.env.SEEDS ?? 400);
const BALLS = (process.env.BALLS ?? '1,2,4,8,16').split(',').map(Number);
const CAP = Number(process.env.CAP ?? 100); // maxStops safety cap (100 stops = 400 holes)

for (const balls of BALLS) {
  const t0 = performance.now();
  const depths: number[] = [];
  for (let seed = 1; seed <= SEEDS; seed++) depths.push(warpRun(seed, balls, CAP));
  const sorted = [...depths].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)))]!;
  const reach = (n: number) => ((100 * depths.filter((d) => d >= n).length) / depths.length).toFixed(1);
  console.log(
    `balls=${balls} (${SEEDS} seeds, ${((performance.now() - t0) / 1000).toFixed(0)}s): ` +
      `min ${sorted[0]} | p0.1% ${q(0.001)} | p1 ${q(0.01)} | median ${q(0.5)} | p90 ${q(0.9)} | max ${sorted[sorted.length - 1]}`,
  );
  console.log(`  reach: 24→${reach(24)}%  32→${reach(32)}%  36→${reach(36)}%  40→${reach(40)}%  48→${reach(48)}%  60→${reach(60)}%  100→${reach(100)}%`);
}
// Run with:  npx vite-node scripts/warp-scramble-depth.ts
// Env knobs: SEEDS (default 400), BALLS (default "1,2,4,8,16"), CAP (max stops, default 100).
// Companion: scripts/endless-ai-depth.ts (solo baseline) + reports/endless-ai-depth-2026-07-04.md.
