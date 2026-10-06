/**
 * THE DRIVING RANGE (GS-driving-range) — the tutorial off the title.
 *
 * Three lesson holes on the calmest world, a coach who stops the player at the moment each thing first
 * matters, Stableford taught on the end-of-hole card, and a wild-ball hole where the Pro Shop's own
 * spray-zone upgrades are fitted live. What these tests mostly pin is the PROMISES the copy makes:
 *
 *  - each hole does the job its lesson needs (no penalty on the first tee, water on the hazards hole,
 *    a straight line for the upgrades) — chosen by RULE off the live generator, so a generator bump
 *    cannot quietly hand the hazards lesson a dry hole;
 *  - an upgrade does exactly what its chip says (Shank Guard ⇒ zero shank, the freed odds flow to the
 *    clean strike), through the shop's own `apply`;
 *  - the wild range balls reach nothing outside the range;
 *  - the range parks nothing, posts nothing and pays nothing.
 *
 * Pure reducer + sim tests. The coach card and title tile are covered in a browser by
 * `tests/driving-range-browser.test.ts`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { initState, reduce, type UiState } from '../src/ui/game';
import { resumableState, abandonTarget, campaignWithLiveRound } from '../src/ui/resumable';
import { backIntent, resumePromise, abandonPrompt } from '../src/ui/back';
import { runModeOf } from '../src/sim/rpg/runSlots';
import { RANGE_FORMAT } from '../src/sim/rpg/formats';
import { currentCourse } from '../src/sim/rpg/run';
import {
  drivingRangeCourse,
  rangeLessonDue,
  rangeLoadoutFor,
  rangeText,
  rangeScoringFor,
  rangeRivalHole,
  rangeMatchResult,
  strokeLadder,
  RANGE_MATCH_HOLE,
  RANGE_BALL_SHAPE,
  RANGE_GOLFER,
  RANGE_LESSONS,
  RANGE_UPGRADE_HOLE,
  RANGE_UPGRADES,
  stablefordLadder,
  stablefordRungFor,
  startRangeRun,
} from '../src/sim/rpg/drivingRange';
import { hasPenaltyHazard } from '../src/sim/rpg/drivingRangeCourse';
import { applyShapeMod, DEFAULT_SHAPE } from '../src/sim/shot';
import { stablefordPoints, scoreName } from '../src/sim/score';
import { shopItem } from '../src/sim/rpg/economy';

const shapeOf = (s: UiState) => applyShapeMod(DEFAULT_SHAPE, s.run.loadout.shapeMod);

/** Open the range from a fresh title. */
function onRange(seed = 'range-test'): UiState {
  return reduce(initState(seed), { type: 'openRange' });
}

/** Auto-finish the current hole and walk off it. */
function finishHole(s: UiState): UiState {
  let guard = 0;
  while (s.play && !s.play.done && guard++ < 400) s = reduce(s, { type: 'autoShotHole' });
  return reduce(s, { type: 'holeComplete' });
}

describe('the lesson holes', () => {
  const course = drivingRangeCourse();
  const len = (i: number) => {
    const h = course.holes[i]!;
    return Math.hypot(h.green[0] - h.tee[0], h.green[1] - h.tee[1]);
  };

  it('is three holes, each doing the job its lesson needs', () => {
    expect(course.holes).toHaveLength(3);
    // Lesson 1 + 2: a short par 3 that cannot cost a penalty on the very first swing of the game.
    expect(course.holes[0]!.par).toBe(3);
    expect(hasPenaltyHazard(course.holes[0]!)).toBe(false);
    expect(len(0)).toBeLessThanOrEqual(165);
    // Lesson 3: a par 4 with water on it — a hazards lesson on a dry hole teaches nothing.
    expect(course.holes[1]!.par).toBe(4);
    expect(course.holes[1]!.hazards.some((z) => z.kind === 'water')).toBe(true);
    // Lesson 4: a straight, not-thin par 4, where a removed spray wedge is visible down the line.
    expect(course.holes[RANGE_UPGRADE_HOLE]!.par).toBe(4);
    expect(course.holes[RANGE_UPGRADE_HOLE]!.shapeId).toMatch(/straight/);
    expect(course.holes[RANGE_UPGRADE_HOLE]!.widthId).not.toBe('thin');
  });

  it('is the same course every time, and a caller cannot reach the cached copy', () => {
    const a = drivingRangeCourse();
    a.holes.pop();
    const b = drivingRangeCourse();
    expect(b.holes).toHaveLength(3);
    expect(JSON.stringify(b)).toBe(JSON.stringify(drivingRangeCourse()));
  });

  it('is what a range run plays, and no other format reaches it', () => {
    const run = startRangeRun();
    expect(run.formatId).toBe(RANGE_FORMAT);
    expect(run.loadout.characterId).toBe(RANGE_GOLFER);
    expect(JSON.stringify(currentCourse(run))).toBe(JSON.stringify(drivingRangeCourse()));
  });
});

describe('the wild balls and the upgrades', () => {
  const run = startRangeRun();

  it('plays every hole but the upgrades hole with the golfer’s own loadout', () => {
    const base = rangeLoadoutFor(run, 0, []);
    expect(rangeLoadoutFor(run, 1, ['shank-guard']).shapeMod).toEqual(base.shapeMod);
    expect(rangeLoadoutFor(run, 0, []).perks).toEqual(base.perks);
  });

  it('widens every miss zone on the upgrades hole — and stays under the sim’s miss cap', () => {
    const plain = applyShapeMod(DEFAULT_SHAPE, rangeLoadoutFor(run, 0, []).shapeMod);
    const wild = applyShapeMod(DEFAULT_SHAPE, rangeLoadoutFor(run, RANGE_UPGRADE_HOLE, []).shapeMod);
    for (const z of ['hookL', 'sliceR', 'duckHookL', 'shankR'] as const) expect(wild[z]).toBeGreaterThan(plain[z]);
    // Under the cap the zones are the sum, not a rescale — so a chip's quoted odds are the honest ones.
    expect(wild.shankR).toBeCloseTo(plain.shankR + RANGE_BALL_SHAPE.shankR!, 6);
  });

  it('each upgrade removes or trims exactly the zone its chip names, the freed odds going to the clean strike', () => {
    const wild = applyShapeMod(DEFAULT_SHAPE, rangeLoadoutFor(run, RANGE_UPGRADE_HOLE, []).shapeMod);
    for (const u of RANGE_UPGRADES) {
      const fitted = applyShapeMod(DEFAULT_SHAPE, rangeLoadoutFor(run, RANGE_UPGRADE_HOLE, [u.id]).shapeMod);
      expect(fitted[u.zone], u.id).toBeLessThan(wild[u.zone]);
      expect(fitted.green, u.id).toBeGreaterThan(wild.green);
      for (const other of RANGE_UPGRADES.filter((o) => o.zone !== u.zone)) expect(fitted[other.zone]).toBeCloseTo(wild[other.zone], 9);
      expect(shopItem(u.id), `${u.id} is a real Pro Shop row`).toBeTruthy();
    }
    // The headline promise: Shank Guard means NO shanks.
    expect(applyShapeMod(DEFAULT_SHAPE, rangeLoadoutFor(run, RANGE_UPGRADE_HOLE, ['shank-guard']).shapeMod).shankR).toBe(0);
  });

  it('ignores an id the range never offered, and fitting order cannot matter', () => {
    const a = rangeLoadoutFor(run, RANGE_UPGRADE_HOLE, ['shank-guard', 'hook-corrector']);
    const b = rangeLoadoutFor(run, RANGE_UPGRADE_HOLE, ['hook-corrector', 'shank-guard', 'range-booster']);
    expect(applyShapeMod(DEFAULT_SHAPE, b.shapeMod)).toEqual(applyShapeMod(DEFAULT_SHAPE, a.shapeMod));
    expect(b.perks).not.toContain('range-booster');
  });

  it('the wild balls are named nowhere outside the range module (a teaching prop with no balance reach)', () => {
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk('src');
    const users = files.filter((f) => readFileSync(f, 'utf8').includes('RANGE_BALL_SHAPE'));
    expect(users.map((f) => f.replace(/\\/g, '/'))).toEqual(['src/sim/rpg/drivingRange.ts']);
  });
});

describe('the coach', () => {
  it('teaches in order, each lesson at the first moment it applies', () => {
    expect(rangeLessonDue(0, 'aim', [])).toBe('swing');
    expect(rangeLessonDue(0, 'aim', ['swing'])).toBeNull();
    expect(rangeLessonDue(0, 'putt', ['swing'])).toBe('putt');
    // Putting is taught on the first green you putt on, wherever that is (e.g. hole 1 was auto-finished).
    expect(rangeLessonDue(2, 'putt', ['swing', 'hazards', 'upgrades'])).toBe('putt');
    expect(rangeLessonDue(1, 'aim', ['swing', 'putt'])).toBe('hazards');
    // The last hole: the match is explained before the upgrades, then nothing more.
    expect(rangeLessonDue(RANGE_UPGRADE_HOLE, 'aim', ['swing', 'putt', 'hazards'])).toBe('match');
    expect(rangeLessonDue(RANGE_UPGRADE_HOLE, 'aim', ['swing', 'putt', 'hazards', 'match'])).toBe('upgrades');
    expect(rangeLessonDue(RANGE_UPGRADE_HOLE, 'aim', ['swing', 'putt', 'hazards', 'match', 'upgrades'])).toBeNull();
    // A skipped first hole still meets the swing lesson before anything else.
    expect(rangeLessonDue(RANGE_UPGRADE_HOLE, 'aim', [])).toBe('swing');
  });

  it('mirrors left and right for a left-handed player', () => {
    const line = RANGE_LESSONS.swing.steps.find((s) => s.text.includes('{L}'))!.text;
    expect(rangeText(line, false)).toContain('hook (left)');
    expect(rangeText(line, true)).toContain('hook (right)');
    expect(rangeText(line, true)).not.toMatch(/\{[LR]\}/);
  });

  it('every lesson has steps and a way out', () => {
    for (const l of Object.values(RANGE_LESSONS)) {
      expect(l.steps.length).toBeGreaterThan(0);
      expect(l.cta.length).toBeGreaterThan(0);
    }
  });
});

describe('three holes, three scoring formats', () => {
  it('teaches stroke play, then Stableford, then matchplay on the last hole', () => {
    expect([0, 1, 2].map(rangeScoringFor)).toEqual(['stroke', 'stableford', 'match']);
    expect(RANGE_MATCH_HOLE).toBe(drivingRangeCourse().holes.length - 1);
  });

  it('the stroke-play ladder is the sim’s own score names', () => {
    for (const r of strokeLadder(4).filter((r) => r.toPar < 2)) expect(r.name).toBe(scoreName(4, 4 + r.toPar));
  });

  it('the rival plays the matchplay hole on their own stream: deterministic, and the player’s shots are untouched', () => {
    const course = drivingRangeCourse();
    const a = rangeRivalHole(course);
    expect(JSON.stringify(rangeRivalHole(course))).toBe(JSON.stringify(a));
    expect(a.record.par).toBe(course.holes[RANGE_MATCH_HOLE]!.par);
    expect(a.record.strokes).toBeGreaterThan(0);
    // Two INDEPENDENT walks (each with its own play stream — `holeRng` is a mutable object, so the two
    // must not share one). In the second the rival is played three extra times mid-hole: if it ever drew
    // from the player's stream, the player's card would change.
    const walk = (extra: boolean): UiState => {
      let s = onRange();
      for (let i = 0; i < RANGE_MATCH_HOLE; i++) s = finishHole(s);
      expect(s.rangeRival).toEqual(a);
      if (extra) for (let k = 0; k < 3; k++) rangeRivalHole(s.course);
      return finishHole(s);
    };
    expect(JSON.stringify(walk(true).played)).toBe(JSON.stringify(walk(false).played));
  });

  it('the match result is the game’s own matchplay rule', () => {
    const rival = rangeRivalHole(drivingRangeCourse());
    const mk = (strokes: number) => ({ ...rival, record: { ...rival.record, strokes } });
    expect(rangeMatchResult(mk(rival.record.strokes - 1), rival).winner).toBe('player');
    expect(rangeMatchResult(mk(rival.record.strokes + 1), rival).winner).toBe('boss');
    expect(rangeMatchResult(mk(rival.record.strokes), rival).winner).toBe('halved');
  });
});

describe('Stableford, as taught', () => {
  it('the ladder is the sim’s own points, with par worth 2 and a blow-up floored at 0', () => {
    for (const par of [3, 4, 5]) {
      for (const r of stablefordLadder(par)) expect(r.points).toBe(stablefordPoints(par, par + r.toPar));
      expect(stablefordLadder(par).find((r) => r.toPar === 0)!.points).toBe(2);
      expect(stablefordPoints(par, par + 6)).toBe(0);
    }
  });

  it('a score off either end of the ladder lights its end rung', () => {
    expect(stablefordRungFor(4, 9)).toBe(2);
    expect(stablefordRungFor(5, 2)).toBe(-2);
    expect(stablefordRungFor(4, 4)).toBe(0);
  });
});

describe('the reducer', () => {
  it('opens from the title straight onto the first tee, and from nowhere else', () => {
    const s = onRange();
    expect(s.screen).toBe('playing');
    expect(s.run.formatId).toBe(RANGE_FORMAT);
    expect(s.play?.holeIndex).toBe(0);
    expect(s.rangeSeen).toEqual([]);
    expect(s.rangeUpgrades).toEqual([]);
    expect(s.rangeRival).toBeUndefined();
    expect(reduce(s, { type: 'openRange' })).toBe(s);
  });

  it('marks a lesson seen once', () => {
    const s = reduce(onRange(), { type: 'rangeDismissLesson', id: 'swing' });
    expect(s.rangeSeen).toEqual(['swing']);
    expect(reduce(s, { type: 'rangeDismissLesson', id: 'swing' })).toBe(s);
  });

  it('only fits upgrades on the wild-ball hole, and on/off/on lands where it started', () => {
    let s = onRange();
    expect(reduce(s, { type: 'rangeToggleUpgrade', id: 'shank-guard' })).toBe(s); // hole 1: refused
    for (let i = 0; i < RANGE_UPGRADE_HOLE; i++) s = finishHole(s);
    expect(s.play?.holeIndex).toBe(RANGE_UPGRADE_HOLE);
    const wild = shapeOf(s);
    expect(wild.shankR).toBeGreaterThan(0.05); // the range balls are in the bag now
    const on = reduce(s, { type: 'rangeToggleUpgrade', id: 'shank-guard' });
    expect(shapeOf(on).shankR).toBe(0);
    expect(on.rangeUpgrades).toEqual(['shank-guard']);
    const off = reduce(on, { type: 'rangeToggleUpgrade', id: 'shank-guard' });
    expect(shapeOf(off)).toEqual(wild);
    expect(reduce(s, { type: 'rangeToggleUpgrade', id: 'range-booster' })).toBe(s); // not a range upgrade
  });

  it('ends on the graduation card and banks nothing, anywhere', () => {
    const start = onRange();
    let s = start;
    for (let i = 0; i < 3; i++) s = finishHole(s);
    expect(s.screen).toBe('rangeResult');
    expect(s.played).toHaveLength(3);
    // Nothing parked, nothing posted, nothing paid.
    expect(resumableState(s)).toEqual({ runSlots: start.runSlots, lastPlayed: start.lastPlayed });
    expect(s.shards).toBe(start.shards);
    expect(s.lifetimeAces).toBe(start.lifetimeAces);
    expect(s.strokePlayBest).toBe(start.strokePlayBest);
    expect(s.bestStableford).toBe(start.bestStableford);
    expect(s.ownedShips).toBe(start.ownedShips);
    // Back and both buttons lead somewhere real.
    expect(backIntent(s)).toEqual({ kind: 'navigate', action: { type: 'toTitle' } });
    expect(reduce(s, { type: 'toTitle' }).screen).toBe('title');
    expect(reduce(s, { type: 'openRange' }).screen).toBe('playing');
  });

  it('leaving mid-lesson parks nothing and says so', () => {
    const s = finishHole(onRange());
    expect(runModeOf(RANGE_FORMAT)).toBeNull();
    expect(abandonTarget(s)).toBeNull();
    expect(abandonPrompt(s)).toBeNull();
    expect(resumePromise(s)).toMatch(/nothing to lose/i);
    const home = reduce(s, { type: 'toTitle' });
    expect(home.runSlots).toEqual(s.runSlots);
    expect(home.lastPlayed).toEqual(s.lastPlayed);
    expect(home.rangeSeen).toBeUndefined();
  });

  it('opening the range leaves a parked Story round exactly where it was', () => {
    let s = reduce(initState('range-story'), { type: 'openStory' });
    s = reduce(s, { type: 'selectCharacter', characterId: 'backspin-bo' });
    let g = 0;
    while (s.screen === 'lore' && g++ < 8) s = reduce(s, { type: 'dismissLore' });
    s = reduce(s, { type: 'storyPlayWorld', courseId: 'standrews-18' });
    g = 0;
    while (s.screen === 'lore' && g++ < 8) s = reduce(s, { type: 'dismissLore' });
    s = finishHole(reduce(s, { type: 'playInteractive' }));
    const title = reduce(s, { type: 'toTitle' });
    const parked = title.story?.liveRound;
    expect(parked).toBeTruthy();
    // `persistStory` writes `campaignWithLiveRound(state)` after every action — on the range it must
    // still hold the parked round, or a lesson would silently cost a campaign its round.
    const range = finishHole(reduce(title, { type: 'openRange' }));
    expect(campaignWithLiveRound(range)?.liveRound).toEqual(parked);
  });

  it('back closes the coach card before it can raise the leave confirm', () => {
    const s = onRange();
    expect(backIntent(s, { rangeLesson: 'swing' })).toEqual({ kind: 'dismiss', action: { type: 'rangeDismissLesson', id: 'swing' } });
    expect(backIntent(s).kind).toBe('confirm');
  });
});
