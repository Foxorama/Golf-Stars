/**
 * THE DRIVING RANGE (GS-driving-range) — the tutorial, as data and pure rules.
 *
 * A new player gets three holes on the calmest world in the game and a coach who stops them at the
 * moment each thing first matters: the first swing, the first putt, the first hole with water on it,
 * the end of the first hole (what the score MEANT), and a hole played with a bucket of wild range
 * balls where the upgrades are fitted live and the aim cone changes under the player's thumb.
 *
 * Three rules shape everything here:
 *
 *  - **It teaches the REAL game, never a simplified one.** The holes come off the live generator
 *    (`drivingRangeCourse`), the shots resolve through the live sim, and the upgrades are the Pro
 *    Shop's own rows (`shopItem(id).apply`) — so a lesson cannot drift from the thing it describes.
 *    The upgrade chips name the item from its shop row, and the odds they quote are the SAME
 *    `SprayShape` the cone draws.
 *  - **It is never persisted and it pays nothing.** No run slot, no record, no shards, no ace
 *    reward. A practice ground that paid out would be a farm, and one that saved would need a resume
 *    story for a thing that takes five minutes.
 *  - **The wild balls are the range's, not the golfer's.** `RANGE_BALL_SHAPE` is added only on the
 *    upgrades hole and only here. No other mode can reach it, so it is a teaching prop with zero
 *    balance reach.
 *
 * Pure: no DOM, no clock, no storage. The reducer (`ui/game.ts`) and the play screen read it.
 */

import { combineShapeMods, PEN_INFO, type ShapeMod, type SprayZone } from '../shot';
import { stablefordPoints, scoreName } from '../score';
import { Rng } from '../rng';
import { playHole, type PlayedHole } from '../round';
import type { Course } from '../course/contract';
import { shopItem, type PlayerLoadout } from './economy';
import { RANGE_FORMAT } from './formats';
import { startRun, playerHoleOpts, type Run } from './run';
import { baseLoadoutForRun } from './runLoadout';
import { getCharacter } from './characters';
import { holeDuel, type HoleDuel } from './match';

export { drivingRangeCourse } from './drivingRangeCourse';

/** The golfer the lesson is played as. The tutorial comes BEFORE choosing anyone, so it uses the first
 *  name on the roster — a balanced all-rounder — rather than asking a beginner to pick blind. */
export const RANGE_GOLFER = 'feather-fade';

/** The opponent (declared before `RANGE_LESSONS`, which names them at load) on the matchplay hole: another starter golfer, playing the range's own course. */
export const RANGE_RIVAL = 'longshot-larry';
export function rivalName(): string {
  return getCharacter(RANGE_RIVAL)?.name ?? 'your rival';
}

/** Which hole (0-based) is played with the wild range balls and offers the upgrades. */
export const RANGE_UPGRADE_HOLE = 2;

/**
 * A bucket of battered range balls: every miss zone is wider than a real ball's. Added on top of the
 * golfer's own shape on the upgrades hole ONLY, so switching an upgrade off a zone is a change the
 * player can see on the cone (a 2% shank is a sliver nobody notices; a 9% one is a wedge of red).
 * Sized so the result stays well under the sim's own `MAX_MISS` cap, which would otherwise rescale it.
 */
export const RANGE_BALL_SHAPE: ShapeMod = { hookL: 0.06, sliceR: 0.06, duckHookL: 0.05, shankR: 0.07 };

/** One upgrade the range lets you fit: a real Pro Shop row, and the cone zone it acts on. */
export interface RangeUpgrade {
  /** The shop item id — its name and copy come from the shop row, never from here. */
  id: string;
  /** The spray zone it cuts, so the chip can wear that zone's colour and the coach can name it. */
  zone: SprayZone;
}

/**
 * The four spray-zone shapers, one per miss zone — so each chip maps to exactly one wedge of the cone
 * and "turn it on, watch that colour go" is a one-to-one lesson. Shank Guard first, because it is the
 * one the player asked to see (and the most dramatic: the whole red right wedge disappears).
 */
export const RANGE_UPGRADES: readonly RangeUpgrade[] = [
  { id: 'shank-guard', zone: 'shankR' },
  { id: 'anti-duck-hook', zone: 'duckHookL' },
  { id: 'slice-corrector', zone: 'sliceR' },
  { id: 'hook-corrector', zone: 'hookL' },
];

/** Is this one of the range's upgrades? (The reducer refuses anything else.) */
export function isRangeUpgrade(id: string): boolean {
  return RANGE_UPGRADES.some((u) => u.id === id);
}

/** A fresh tutorial run. Ascension 0, the starter bag, no meta upgrades — the game as it first is. */
export function startRangeRun(): Run {
  const run = startRun('driving-range', RANGE_FORMAT, {}, RANGE_GOLFER);
  return { ...run, loadout: rangeLoadoutFor(run, 0, []) };
}

/**
 * The loadout for a range hole — THE one rule for what the player is swinging with.
 *
 * Off the upgrades hole it is the golfer's own starting loadout, exactly as a real first run would
 * be. On it, the wild range balls go on first and each fitted upgrade's REAL shop `apply` after it
 * (shape mods sum, so the order cannot matter: Shank Guard's −100% zeroes the shank whatever sits
 * beneath it). Unknown ids are ignored, so a forged action cannot equip something the range never
 * offered. Pure.
 */
export function rangeLoadoutFor(run: Run, holeIndex: number, upgrades: readonly string[]): PlayerLoadout {
  const base = baseLoadoutForRun(run);
  if (holeIndex !== RANGE_UPGRADE_HOLE) return base;
  let m: PlayerLoadout = { ...base, shapeMod: combineShapeMods(base.shapeMod, RANGE_BALL_SHAPE) };
  for (const u of RANGE_UPGRADES) {
    if (!upgrades.includes(u.id)) continue;
    const item = shopItem(u.id);
    if (item) m = item.apply(m);
  }
  return m;
}

// --- The coach ------------------------------------------------------------------------------------

/** The moments the coach stops you. Stableford is NOT one of these — it is taught on the end-of-hole
 *  card itself, against the score you just made, every hole (see `stablefordLadder`). */
export type RangeLessonId = 'swing' | 'putt' | 'hazards' | 'match' | 'upgrades';

/** One line of a lesson: an icon (usually the control's own glyph), a bold lead, and the rest. */
export interface RangeStep {
  icon: string;
  lead: string;
  text: string;
}

export interface RangeLesson {
  id: RangeLessonId;
  /** Small caps over the title — where you are in the lesson. */
  kicker: string;
  title: string;
  steps: readonly RangeStep[];
  /** The button that closes the card. */
  cta: string;
}

const waterStrokes = PEN_INFO.water.strokes;
const obStrokes = PEN_INFO.ob.strokes;

/** Every lesson, keyed by id (a `Record`, so a new id fails to compile until it has its card). */
export const RANGE_LESSONS: Readonly<Record<RangeLessonId, RangeLesson>> = {
  swing: {
    id: 'swing',
    kicker: 'Driving Range · Lesson 1',
    title: 'Hitting a shot',
    steps: [
      { icon: '🎯', lead: 'The cone is your shot.', text: 'The shape drawn from your ball is where it can land. The arcs are how far it may carry; the coloured bands are how likely each landing is.' },
      { icon: '🟩', lead: 'Green is a good strike.', text: 'Most shots land in the green band. Orange is a hook ({L}) or a slice ({R}); red, at the edges, is the wild miss — a duck-hook or a shank.' },
      { icon: '👇', lead: 'Pull down on the map to swing.', text: 'The further you pull, the more power. Drag left or right as you pull to aim, then let go to hit. Pull back to nothing to cancel.' },
      { icon: '🏌', lead: 'Or just tap Swing.', text: 'It hits the shot the cone is showing, at the power on the button. Arrow keys aim and set power, too.' },
      { icon: '🎒', lead: 'The golf bag picks the club.', text: 'Tap it (bottom corner) for every club and how far each one carries. The game pre-picks a sensible one each shot.' },
    ],
    cta: 'Let’s hit one',
  },
  putt: {
    id: 'putt',
    kicker: 'Driving Range · Lesson 2',
    title: 'Putting',
    steps: [
      { icon: '⛳', lead: 'On the green, you putt.', text: 'The dotted line is the path the ball will roll. Greens slope, so a putt BREAKS — it curls downhill on the way to the cup.' },
      { icon: '◄►', lead: 'Aim off to read the break.', text: 'Nudge the aim with ◄ and ►, uphill of the cup, until the dotted line curls into the hole.' },
      { icon: '📏', lead: 'Then set the pace.', text: 'A marker sweeps across the meter. Tap the meter, or press ⛳ Putt, while it is in the MAKE band. Left of the band comes up short; right of it runs past.' },
      { icon: '🕳', lead: 'Long putts are harder.', text: 'The make band shrinks with distance. From a long way out, a firm two-putt is a fine result.' },
    ],
    cta: 'Read the green',
  },
  hazards: {
    id: 'hazards',
    kicker: 'Driving Range · Lesson 3',
    title: 'Staying out of trouble',
    steps: [
      { icon: '💧', lead: `Water costs a stroke.`, text: `Land in it and you add ${waterStrokes} penalty stroke${waterStrokes === 1 ? '' : 's'}, then play on from dry ground back along your shot’s line. Lava and the void work the same way on other worlds.` },
      { icon: '🚧', lead: 'Out of bounds sends you back.', text: `Past the dashed boundary line is +${obStrokes}, and you replay from where you just hit.` },
      { icon: '🏖', lead: 'Sand, trees and deep rough cost distance.', text: 'No penalty — but the next shot flies shorter and sprays wider. The lie under your ball is shown in the top bar.' },
      { icon: '🎯', lead: 'Keep the whole cone dry.', text: 'Aim so the colours stay off the water, not just the centre line. If they won’t, take less club and lay up short.' },
      { icon: '🛟', lead: 'Let the aim button help.', text: 'The round button cycles ◎ Auto (sensible line), 🚩 Attack (straight at the flag) and 🛟 Safe (finds a dry, open line). 🎯 puts your aim back if you drag it somewhere silly.' },
    ],
    cta: 'Play it safe',
  },
  match: {
    id: 'match',
    kicker: 'Driving Range · Lesson 4',
    title: `Matchplay vs ${rivalName()}`,
    steps: [
      { icon: '⚔️', lead: 'The last hole is a match.', text: `You are playing ${rivalName()} head to head. In matchplay you don’t add up strokes — whoever takes FEWER on a hole wins that hole.` },
      { icon: '👻', lead: 'Your opponent’s ball is on the map.', text: `The faint line is the path ${rivalName()}’s ball took on this hole, so you can see what you have to beat.` },
      { icon: '🤝', lead: 'Same score is a half.', text: 'Nobody wins a halved hole. Over a longer match you count holes won: "2 up" means two more than your opponent, and a match can be over early — "3 & 2" is three up with only two left to play.' },
    ],
    cta: 'Game on',
  },
  upgrades: {
    id: 'upgrades',
    kicker: 'Driving Range · Lesson 5',
    title: 'Upgrades change your shot',
    steps: [
      { icon: '🪣', lead: 'This hole is played with old range balls.', text: 'They spray everywhere — look how wide the orange and red bands are on the cone.' },
      { icon: '🛡', lead: 'Fit an upgrade in the panel below.', text: 'Each one cuts one miss zone. Shank Guard removes the red band on the {R}; watch it vanish and the green band’s odds go up.' },
      { icon: '🔁', lead: 'Switch them on and off any time.', text: 'Try a shot with them, then without. On a real run you buy these in the Pro Shop between stops.' },
    ],
    cta: 'Try them out',
  },
};

/**
 * Resolve a lesson line's `{L}`/`{R}` tokens for the player's handedness. Left-handed mode (GS-lefty)
 * mirrors the cone, so a lefty's hook flies RIGHT — a lesson that said "left" would be teaching them the
 * wrong side of their own cone.
 */
export function rangeText(text: string, lefty: boolean): string {
  return text.replace(/\{L\}/g, lefty ? 'right' : 'left').replace(/\{R\}/g, lefty ? 'left' : 'right');
}

/** Where the play screen is: deciding a full shot, or on the green with the putter. */
export type RangePhase = 'aim' | 'putt';

/**
 * Which lesson should be on screen right now, if any — the ONE predicate the play screen asks.
 *
 * The first UNSEEN lesson whose moment has come, in teaching order. A lesson's moment is a place in the
 * round, not a hole number, so a player who skips ahead (the » auto-finish) still meets every lesson at
 * the next moment it applies — putting is taught on the first green you actually putt on, wherever that
 * is. Pure: the "seen" set is the reducer's.
 */
export function rangeLessonDue(holeIndex: number, phase: RangePhase, seen: readonly RangeLessonId[]): RangeLessonId | null {
  const unseen = (id: RangeLessonId): boolean => !seen.includes(id);
  if (phase === 'putt') return unseen('putt') ? 'putt' : null;
  if (unseen('swing')) return 'swing';
  if (holeIndex >= 1 && unseen('hazards')) return 'hazards';
  if (holeIndex >= RANGE_MATCH_HOLE && unseen('match')) return 'match';
  if (holeIndex >= RANGE_UPGRADE_HOLE && unseen('upgrades')) return 'upgrades';
  return null;
}

// --- Scoring formats ------------------------------------------------------------------------------

/**
 * How each range hole is SCORED — one format per hole, so the end-of-hole card teaches all three the
 * game uses: stroke play (Star Tour, the Asgard tournament, some Story events), Stableford (the Voyage's
 * field, some Story events) and matchplay (every Voyage boss, the Story Sigil duels). Indexed by hole, so
 * the card, the HUD pod and the graduation card all read the same answer.
 */
export type RangeScoring = 'stroke' | 'stableford' | 'match';
export const RANGE_SCORING: readonly RangeScoring[] = ['stroke', 'stableford', 'match'];
export function rangeScoringFor(holeIndex: number): RangeScoring {
  return RANGE_SCORING[Math.max(0, Math.min(RANGE_SCORING.length - 1, holeIndex))]!;
}

/** The hole played as matchplay — the last one. */
export const RANGE_MATCH_HOLE = RANGE_SCORING.indexOf('match');


/**
 * The rival's ball on the matchplay hole — the same headless sim every AI golfer plays, on its OWN
 * stream (`:rival`), so it draws nothing from the player's `:play` stream and the player's shots are
 * unchanged by its existence. The rival plays proper balls with their starter bag: the wild balls are
 * the player's teaching prop, and a rival hobbled by them would make the match a lie. Deterministic.
 */
export function rangeRivalHole(course: Course): PlayedHole {
  const rivalRun = startRun('driving-range:rival', RANGE_FORMAT, {}, RANGE_RIVAL);
  return playHole(course.holes[RANGE_MATCH_HOLE]!, new Rng(`${course.seed}:rival`), playerHoleOpts(rivalRun));
}

/** The matchplay result for the hole — the game's own `holeDuel`, the rule every Voyage boss uses. */
export function rangeMatchResult(player: PlayedHole, rival: PlayedHole): HoleDuel {
  return holeDuel(RANGE_MATCH_HOLE, player.record.par, player, rival);
}

/** One rung of the stroke-play ladder: the score's NAME, read off the sim's own `scoreName`. */
export function strokeLadder(par: number): { toPar: number; name: string }[] {
  return [-2, -1, 0, 1, 2].map((d) => ({ toPar: d, name: d === 2 ? 'Double bogey' : scoreName(par, par + d) }));
}

// --- Stableford -----------------------------------------------------------------------------------

/** One rung of the Stableford ladder. */
export interface StablefordRung {
  /** Strokes relative to par (−2 eagle … +2 double bogey or worse). */
  toPar: number;
  name: string;
  points: number;
}

/**
 * The points ladder the end-of-hole card teaches from. The POINTS come from the sim's own
 * `stablefordPoints`, so the table can never disagree with the score the run actually banks.
 */
export function stablefordLadder(par: number): StablefordRung[] {
  const names: Record<number, string> = { [-2]: 'Eagle', [-1]: 'Birdie', 0: 'Par', 1: 'Bogey', 2: 'Double bogey +' };
  return [-2, -1, 0, 1, 2].map((d) => ({ toPar: d, name: names[d]!, points: stablefordPoints(par, par + d) }));
}

/** The rung a hole's score lands on — clamped into the ladder, so a triple bogey lights the bottom
 *  rung (0 points, the true score) and anything better than an eagle lights the top one. The card
 *  prints the hole's REAL points beside it, so the clamp only decides which row is highlighted. */
export function stablefordRungFor(par: number, strokes: number): number {
  return Math.max(-2, Math.min(2, strokes - par));
}
