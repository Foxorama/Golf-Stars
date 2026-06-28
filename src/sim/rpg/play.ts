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
  manualPutt,
  onePutt,
  pickBetterExec,
  pinOf,
  puttOutFrom,
  shotSpread,
  suggestPlayerClub,
  type ExecOpts,
  type PuttControl,
  type ScrambleOpts,
  type ShotSpread,
  type PuttLog,
  type ShotLog,
} from '../round';
import type { HoleRecord } from '../score';
import type { HoleStat } from '../stats';
import type { Rng } from '../rng';
import { netDispersion, puttSkillOf, usableBag, type PlayerLoadout } from './economy';
import { characterShotMods } from './characters';

export type AimMode = 'attack' | 'safe';

export interface ShotDecision {
  clubId: string;
  aim: AimMode;
  /** Free-aim target (course-space) from tapping/dragging the map; overrides `aim` when set. */
  target?: Vec;
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
  /** Scramble (GS-scramble): true if the LAST shot kept the partner's ball, for UI attribution. */
  partnerKept?: boolean;
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
  const carryMult = biomeCarryMult(state.hole);
  // The interactive "attack" suggestion reasons about green coverage (longest club that still
  // covers the front of the green), using the player's real dispersion so it reads true — see
  // suggestPlayerClub. The auto sim keeps using aiClub (its balance is tuned around it).
  const dispersionMult = netDispersion(loadout);
  // The driver is tee-only unless the Driver Dan caddy unlocks it from any lie (GS-caddy).
  const bag = usableBag(loadout.bag, state.lie, loadout.driverAnywhere ?? false);
  // Same forced-carry-aware layup the auto sim uses (same bag/lie/carryMult → byte-for-byte).
  const safe = layupTarget(state.hole, state.ball, state.lie, bag, carryMult);
  return {
    distToPin: Math.round(dist(state.ball, pin)),
    lie: state.lie,
    wind: state.hole.wind,
    attackClubId: suggestPlayerClub(state.hole, state.ball, state.lie, bag, {
      carryMult,
      dispersionMult,
    }).id,
    safeClubId: aiClub(state.hole, state.ball, safe, carryMult, bag).id,
    blocked: dist(safe, pin) > 1,
    strokesSoFar: state.strokes,
  };
}

/** The spread the player's contemplated shot would have — for the aiming spray cone.
 *  Resolves the SAME target/club `takeShot` would, so the preview reads true. Pure. */
export function previewShot(
  state: HolePlay,
  decision: ShotDecision,
  loadout: PlayerLoadout,
): ShotSpread {
  const carryMult = biomeCarryMult(state.hole);
  const bag = usableBag(loadout.bag, state.lie, loadout.driverAnywhere ?? false);
  const target =
    decision.target ??
    (decision.aim === 'attack' ? pinOf(state.hole) : layupTarget(state.hole, state.ball, state.lie, bag, carryMult));
  const club =
    bag.find((c) => c.id === decision.clubId) ?? aiClub(state.hole, state.ball, target, carryMult, bag);
  const dispersionMult = netDispersion(loadout);
  return shotSpread(state.hole, state.ball, state.lie, target, club, {
    carryMult,
    dispersionMult,
    shotMods: characterShotMods(loadout.characterId),
    shapeMod: loadout.shapeMod,
    minCarryBoost: loadout.minCarryBoost,
    wedgeWindow: loadout.wedgeWindow,
    lieRelief: loadout.lieRelief,
    // Suggestible Sam: the cone visibly tightens on the club he'd suggest (his confidence boost).
    confidence: loadout.confidenceMod,
    suggestedClubId: loadout.confidenceMod
      ? suggestPlayerClub(state.hole, state.ball, state.lie, bag, { carryMult, dispersionMult }).id
      : undefined,
  });
}

/** The decision the AI would make (mirrors playHole): lay up to the corridor, AI club. */
export function autoDecision(state: HolePlay, loadout: PlayerLoadout): ShotDecision {
  return { aim: 'safe', clubId: shotView(state, loadout).safeClubId };
}

/** Resolve one player shot. When the ball comes to rest on the green: if `autoPutt` is on
 *  the hole is putted out automatically; otherwise it's left on the green for manual
 *  putting via `takePutt`. */
export function takeShot(
  state: HolePlay,
  decision: ShotDecision,
  loadout: PlayerLoadout,
  rng: Rng,
  autoPutt = true,
  scramble?: ScrambleOpts,
): HolePlay {
  if (state.done) return state;
  const pin = pinOf(state.hole);
  const carryMult = biomeCarryMult(state.hole);
  const bag = usableBag(loadout.bag, state.lie, loadout.driverAnywhere ?? false);
  const target =
    decision.target ??
    (decision.aim === 'attack' ? pin : layupTarget(state.hole, state.ball, state.lie, bag, carryMult));
  const club: Club =
    bag.find((c) => c.id === decision.clubId) ?? aiClub(state.hole, state.ball, target, carryMult, bag);

  const dispersionMult = netDispersion(loadout);
  const execOpts: ExecOpts = {
    carryMult,
    dispersionMult,
    shotMods: characterShotMods(loadout.characterId),
    shapeMod: loadout.shapeMod,
    minCarryBoost: loadout.minCarryBoost,
    wedgeWindow: loadout.wedgeWindow,
    lieRelief: loadout.lieRelief,
    guard: loadout.caddyGuard,
    chipIn: loadout.chipInBoost,
    // Suggestible Sam: commit to his suggested club and the confidence boost folds into this shot.
    confidence: loadout.confidenceMod,
    suggestedClubId: loadout.confidenceMod
      ? suggestPlayerClub(state.hole, state.ball, state.lie, bag, { carryMult, dispersionMult }).id
      : undefined,
  };
  const playerEx = executeShot(state.hole, state.ball, state.lie, target, club, execOpts, rng);
  // Scramble (GS-scramble): the partner hits a second ball and the team keeps the better — same rule
  // and rng order as the auto sim (playHole), so auto≡interactive holds; absent ⇒ byte-for-byte solo.
  let partnerKept = false;
  let ex = playerEx;
  if (scramble) {
    const partnerEx = executeShot(state.hole, state.ball, state.lie, target, club, { ...execOpts, shotMods: scramble.partnerMods }, rng);
    const best = pickBetterExec(playerEx, partnerEx, pin);
    ex = best.ex;
    partnerKept = best.partnerKept;
  }

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
  } else if (lie === 'green' && autoPutt) {
    // On the green with auto-putt → putt-out within the remaining stroke budget.
    const out = puttOutFrom(rng, ball, pin, Math.max(1, maxStrokes - strokes), puttSkillOf(loadout));
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
  // else: on the green with manual putting → leave done=false; the player calls takePutt.

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
    partnerKept,
  };
}

/** True when the ball is on the green awaiting a manual putt (not yet done). */
export function awaitingPutt(state: HolePlay): boolean {
  return !state.done && state.lie === 'green';
}

/** Resolve ONE manual putt toward the pin. Holes out, lags, or — if the stroke budget is
 *  spent — picks up. The interactive counterpart to the auto putt-out. With a `control` (the
 *  player's pace-meter input) it resolves by SKILL via `manualPutt`; without one it falls back to
 *  the rng `onePutt` (used by the headless "auto-finish putts" path), keeping that byte-for-byte. */
export function takePutt(
  state: HolePlay,
  loadout: PlayerLoadout,
  rng: Rng,
  control?: PuttControl,
): HolePlay {
  if (state.done || state.lie !== 'green') return state;
  const pin = pinOf(state.hole);
  const maxStrokes = state.hole.par + MAX_OVER_PAR;
  const skill = puttSkillOf(loadout);
  const p = control ? manualPutt(rng, state.ball, pin, control, skill) : onePutt(rng, state.ball, pin, skill);
  let strokes = state.strokes + 1;
  let done = false;
  let holed = false;
  let pickedUp = false;
  if (p.holed) {
    done = true;
    holed = true;
  } else if (strokes >= maxStrokes) {
    done = true;
    pickedUp = true;
    strokes = maxStrokes;
  }
  return {
    ...state,
    ball: p.holed ? pin : p.to,
    lie: 'green',
    strokes,
    putts: state.putts + 1,
    puttLogs: [...state.puttLogs, p],
    done,
    holed,
    pickedUp,
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
