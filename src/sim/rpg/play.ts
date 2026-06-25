/**
 * Interactive play driver (pure) — the player makes a strategic decision per shot
 * (which club, attack the pin or play safe) and the shot resolves with handicap +
 * randomness via the SAME executeShot physics the AI uses. Putting is auto-resolved
 * once the ball is on the green (the interesting decisions are the full shots).
 *
 * Deterministic: randomness comes from the passed `Rng`. No DOM. The UI renders a
 * `HolePlay` and calls `takeShot` with the player's `ShotDecision`.
 */

import { dist, type FeatureKind, type Hole, type Vec } from '../course/contract';
import { type Club } from '../clubs';
import {
  aiClub,
  biomeCarryMult,
  executeShot,
  HOLE_OUT_RADIUS,
  MAX_OVER_PAR,
  layupTarget,
  pinOf,
  puttOutFrom,
  type PuttLog,
  type ShotLog,
} from '../round';
import type { HoleRecord } from '../score';
import type { HoleStat } from '../stats';
import type { Rng } from '../rng';
import { netDispersion, type PlayerLoadout } from './economy';

export type AimMode = 'attack' | 'safe';

export interface ShotDecision {
  clubId: string;
  aim: AimMode;
}

export interface HolePlay {
  hole: Hole;
  holeIndex: number;
  ball: Vec;
  lie: FeatureKind;
  strokes: number;
  penalties: number;
  putts: number;
  shots: ShotLog[];
  puttLogs: PuttLog[];
  fairwayHit: boolean | null;
  done: boolean;
  holed: boolean;
  /** True if the hole was picked up at the max-score cap (par + MAX_OVER_PAR). */
  pickedUp: boolean;
}

export function beginHole(hole: Hole, holeIndex = 0): HolePlay {
  return {
    hole,
    holeIndex,
    ball: [...hole.tee] as Vec,
    lie: 'tee',
    strokes: 0,
    penalties: 0,
    putts: 0,
    shots: [],
    puttLogs: [],
    fairwayHit: hole.par >= 4 ? false : null,
    done: false,
    holed: false,
    pickedUp: false,
  };
}

export interface ShotView {
  distToPin: number;
  lie: FeatureKind;
  wind: Hole['wind'];
  /** Suggested club id for an attack at the pin. */
  attackClubId: string;
  /** Suggested club id for a safe lay-up to the corridor. */
  safeClubId: string;
  /** True when the safe target differs from the pin (the line is blocked). */
  blocked: boolean;
  strokesSoFar: number;
}

/** Info the UI shows the player before they choose a shot. */
export function shotView(state: HolePlay, loadout: PlayerLoadout): ShotView {
  const pin = pinOf(state.hole);
  const safe = layupTarget(state.hole, state.ball);
  const carryMult = biomeCarryMult(state.hole);
  return {
    distToPin: Math.round(dist(state.ball, pin)),
    lie: state.lie,
    wind: state.hole.wind,
    attackClubId: aiClub(state.hole, state.ball, pin, carryMult, loadout.bag).id,
    safeClubId: aiClub(state.hole, state.ball, safe, carryMult, loadout.bag).id,
    blocked: dist(safe, pin) > 1,
    strokesSoFar: state.strokes,
  };
}

/** The decision the AI would make (mirrors playHole): lay up to the corridor, AI club. */
export function autoDecision(state: HolePlay, loadout: PlayerLoadout): ShotDecision {
  return { aim: 'safe', clubId: shotView(state, loadout).safeClubId };
}

/** Resolve one player shot (or, if on the green, auto putt-out to finish the hole). */
export function takeShot(
  state: HolePlay,
  decision: ShotDecision,
  loadout: PlayerLoadout,
  rng: Rng,
): HolePlay {
  if (state.done) return state;
  const pin = pinOf(state.hole);
  const carryMult = biomeCarryMult(state.hole);
  const target = decision.aim === 'attack' ? pin : layupTarget(state.hole, state.ball);
  const club: Club =
    loadout.bag.find((c) => c.id === decision.clubId) ??
    aiClub(state.hole, state.ball, target, carryMult, loadout.bag);

  const ex = executeShot(state.hole, state.ball, state.lie, target, club, {
    carryMult,
    dispersionMult: netDispersion(loadout),
  }, rng);

  const firstShot = state.shots.length === 0;
  let fairwayHit = state.fairwayHit;
  if (firstShot && state.hole.par >= 4) fairwayHit = ex.restLie === 'fairway';

  const maxStrokes = state.hole.par + MAX_OVER_PAR;
  let strokes = state.strokes + 1 + ex.penaltyStrokes;
  let putts = state.putts;
  const puttLogs = [...state.puttLogs];
  let done = false;
  let holed = false;
  let pickedUp = false;
  const ball = ex.ballAfter;
  const lie = ex.lieAfter;

  if (ex.holed) {
    done = true;
    holed = true;
  } else if (dist(ball, pin) <= HOLE_OUT_RADIUS) {
    done = true;
    holed = true;
  } else if (strokes >= maxStrokes) {
    // Max-score rule: pick up at par + MAX_OVER_PAR.
    done = true;
    pickedUp = true;
    strokes = maxStrokes;
  } else if (lie === 'green') {
    // On the green → auto putt-out within the remaining stroke budget.
    const out = puttOutFrom(rng, ball, pin, Math.max(1, maxStrokes - strokes));
    putts = out.putts;
    puttLogs.push(...out.log);
    strokes += out.putts;
    done = true;
    if (out.holed) holed = true;
    else {
      pickedUp = true;
      strokes = maxStrokes;
    }
  }

  return {
    ...state,
    ball,
    lie,
    strokes,
    penalties: state.penalties + ex.penaltyStrokes,
    putts,
    pickedUp,
    shots: [...state.shots, ex.log],
    puttLogs,
    fairwayHit,
    done,
    holed,
  };
}

/** Finalise a completed hole into the same shape `playHole` returns. */
export function holeResult(state: HolePlay): {
  record: HoleRecord;
  stat: HoleStat;
  shots: ShotLog[];
  putts: PuttLog[];
  holed: boolean;
  pickedUp: boolean;
} {
  return {
    record: { par: state.hole.par, strokes: state.strokes },
    stat: {
      par: state.hole.par,
      strokes: state.strokes,
      putts: state.putts,
      penalties: state.penalties,
      fairwayHit: state.fairwayHit,
    },
    shots: state.shots,
    putts: state.puttLogs,
    holed: state.holed,
    pickedUp: state.pickedUp,
  };
}
