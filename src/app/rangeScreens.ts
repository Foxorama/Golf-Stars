/**
 * THE DRIVING RANGE's screens (GS-driving-range): the coach card, the upgrades row on the wild-ball
 * hole, the Stableford lesson on every end-of-hole card, and the graduation card.
 *
 * Pure render off `state` + the pure rules in `sim/rpg/drivingRange.ts`. Every number here is read
 * from the sim, never restated: the upgrade chips quote the SAME `SprayShape` the aim cone draws, the
 * upgrade names come off their Pro Shop rows, and the points ladder is `stablefordPoints`.
 * Own class prefix (`.gs-range*`) — CSS classes are global and this is new chrome.
 */

import { state } from './ctx';
import { lefty } from './helpers';
import { shopItem } from '../sim/rpg/economy';
import {
  RANGE_LESSONS,
  RANGE_UPGRADES,
  rangeMatchResult,
  rangeScoringFor,
  rangeText,
  rivalName,
  stablefordLadder,
  stablefordRungFor,
  strokeLadder,
  type RangeLessonId,
  type RangeUpgrade,
} from '../sim/rpg/drivingRange';
import { stablefordPoints, scoreName } from '../sim/score';
import type { SprayShape } from '../sim/shot';
import type { PlayedHole } from '../sim/round';

/**
 * The coach card — a bottom sheet over the play screen, a DIRECT child of `#app` like every other sheet,
 * so it inherits the dialog/focus/`inert` pass (and silences the arrow-key aim while it is up). It has
 * ONE way out, the button, and Back/Escape read as the same "got it": a lesson card a stray tap on the
 * map could dismiss is one a beginner never reads.
 */
export function rangeCoachOverlay(id: RangeLessonId): string {
  const lesson = RANGE_LESSONS[id];
  const lh = lefty();
  const steps = lesson.steps
    .map(
      (s) => `<li class="gs-range-step">
        <span class="gs-range-step__icon" aria-hidden="true">${s.icon}</span>
        <span class="gs-range-step__text"><b>${rangeText(s.lead, lh)}</b> ${rangeText(s.text, lh)}</span>
      </li>`,
    )
    .join('');
  return `
    <div class="gs-sheet-backdrop gs-range-backdrop" data-range-coach="${id}">
      <div class="gs-sheet gs-range-coach">
        <div class="gs-range-coach__kicker">🎓 ${lesson.kicker}</div>
        <h2 class="gs-range-coach__title">${lesson.title}</h2>
        <ol class="gs-range-steps">${steps}</ol>
        <button class="gs-btn gs-btn--primary gs-range-coach__go" data-action='${JSON.stringify({ type: 'rangeDismissLesson', id })}'>${lesson.cta} ›</button>
      </div>
    </div>`;
}

/** The cone tier a zone is drawn in — the chip wears the colour of the wedge it removes. */
function zoneTier(u: RangeUpgrade): 'red' | 'orange' {
  return u.zone === 'shankR' || u.zone === 'duckHookL' ? 'red' : 'orange';
}

const ZONE_NAME: Record<RangeUpgrade['zone'], string> = {
  green: 'clean strike',
  hookL: 'hook',
  sliceR: 'slice',
  duckHookL: 'duck-hook',
  shankR: 'shank',
};

/**
 * The upgrades row on the wild-ball hole: one toggle chip per upgrade, each quoting the live odds of
 * the zone it acts on, and a headline with the clean-strike odds. `shape` is the very `SprayShape` the
 * cone on the map was drawn from (`previewShot(...).shape`), so the number under the chip and the wedge
 * on the map are one fact — flip a chip and both move together.
 */
export function rangeUpgradeRowHTML(shape: SprayShape, fitted: readonly string[]): string {
  const pct = (p: number): string => `${Math.round(p * 100)}%`;
  const chips = RANGE_UPGRADES.map((u) => {
    const item = shopItem(u.id);
    const on = fitted.includes(u.id);
    const odds = shape[u.zone];
    const tier = zoneTier(u);
    const sub = odds <= 0.0005 ? `no ${ZONE_NAME[u.zone]}s` : `${ZONE_NAME[u.zone]} ${pct(odds)}`;
    return `<button class="gs-range-chip gs-range-chip--${tier}${on ? ' gs-range-chip--on' : ''}" aria-pressed="${on}"
        title="${item?.desc ?? ''}"
        data-action='${JSON.stringify({ type: 'rangeToggleUpgrade', id: u.id })}'>
        <span class="gs-range-chip__name">${on ? '✓ ' : ''}${item?.name ?? u.id}</span>
        <span class="gs-range-chip__sub">${sub}</span>
      </button>`;
  }).join('');
  return `
    <div class="gs-range-ups" role="group" aria-label="Range upgrades">
      <div class="gs-range-ups__head"><span>🧪 Upgrades</span><span>Clean strike <b>${pct(shape.green)}</b></span></div>
      <div class="gs-range-ups__chips">${chips}</div>
    </div>`;
}

const toParTag = (d: number): string => (d === 0 ? 'par' : d > 0 ? `+${d}` : `${d}`);
const pts = (p: PlayedHole): number => (p.pickedUp ? 0 : stablefordPoints(p.record.par, p.record.strokes));
const aOrAn = (name: string): string => (/^[aeiou]/i.test(name) ? 'an' : 'a');

/** What the player just made, in words — "a bogey", "a hole-in-one", or that they picked up. */
function madeLine(hole: PlayedHole): string {
  if (hole.pickedUp) return 'You picked up';
  const name = scoreName(hole.record.par, hole.record.strokes).toLowerCase();
  return `You made ${aOrAn(name)} ${name}`;
}

/** A ladder of rungs with the player's own score lit. */
function ladderHTML(rows: { toPar: number; name: string; value: string }[], lit: number, label: string): string {
  return `<div class="gs-range-ladder" aria-label="${label}">${rows
    .map(
      (r) => `<div class="gs-range-ladder__row${r.toPar === lit ? ' gs-range-ladder__row--you' : ''}">
        <span>${r.name}</span><span>${toParTag(r.toPar)}</span><b>${r.value}</b>
      </div>`,
    )
    .join('')}</div>`;
}

/**
 * STROKE PLAY, taught on the first hole's card: every stroke counts, the score is read against par.
 * The ladder names come off the sim's own `scoreName`.
 */
function strokeHTML(hole: PlayedHole): string {
  const par = hole.record.par;
  const d = hole.pickedUp ? 2 : stablefordRungFor(par, hole.record.strokes);
  const rows = strokeLadder(par).map((r) => ({ ...r, value: `${par + r.toPar} shot${par + r.toPar === 1 ? '' : 's'}` }));
  return `
    <div class="gs-panel gs-range-stab">
      <div class="gs-range-coach__kicker">🎓 Scoring format 1 of 3 · Stroke play</div>
      <p class="gs-range-stab__lead">${madeLine(hole)} — <b>${hole.record.strokes} shots</b> on a par ${par}.</p>
      ${ladderHTML(rows, d, 'Stroke-play score names for this par')}
      <p class="gs-range-stab__note">The simplest format: <b>count every shot</b>, penalty strokes included, and the lowest total wins. Each hole has a <b>par</b> — the score a good player expects — and your score is named against it. Star Tour’s course records, the Asgard tournament and the Unending Universe’s survival sets are all played on strokes.</p>
    </div>`;
}

/**
 * STABLEFORD, taught on the second hole's card against the score just made — "par is 2 points" means far
 * more the moment after you made one. Points are `stablefordPoints`, the number the Voyage banks.
 */
function stablefordHTML(hole: PlayedHole): string {
  const par = hole.record.par;
  const lit = hole.pickedUp ? 2 : stablefordRungFor(par, hole.record.strokes);
  const n = pts(hole);
  const rows = stablefordLadder(par).map((r) => ({ toPar: r.toPar, name: r.name, value: `${r.points} pt${r.points === 1 ? '' : 's'}` }));
  return `
    <div class="gs-panel gs-range-stab">
      <div class="gs-range-coach__kicker">🎓 Scoring format 2 of 3 · Stableford</div>
      <p class="gs-range-stab__lead">${madeLine(hole)} — that’s <b>${n} point${n === 1 ? '' : 's'}</b>.</p>
      ${ladderHTML(rows, lit, 'Stableford points for each score')}
      <p class="gs-range-stab__note">Here you score <b>points</b>, and the highest total wins: <b>par is worth 2</b>, each stroke better adds one, each stroke worse takes one away — and a bad hole bottoms out at 0, so one disaster can’t sink a round. On a Voyage you race a field of golfers on points, and you need enough at each stop to make the cut.</p>
    </div>`;
}

/**
 * MATCHPLAY, taught on the last hole's card: the hole is won, lost or halved against the rival — the
 * game's own `holeDuel` decides it, the same rule every Voyage boss is played under.
 */
function matchHTML(hole: PlayedHole, rival: PlayedHole | undefined): string {
  const who = rivalName();
  if (!rival) return '';
  const r = rangeMatchResult(hole, rival);
  const head =
    r.winner === 'player'
      ? `You win the hole, ${r.playerStrokes} to ${r.bossStrokes} — <b>1 up</b> and the match is yours.`
      : r.winner === 'boss'
      ? `${who} wins the hole, ${r.bossStrokes} to ${r.playerStrokes} — <b>1 down</b>, and the match goes to ${who}.`
      : `${r.playerStrokes} each — the hole is <b>halved</b> and the match finishes <b>all square</b>.`;
  return `
    <div class="gs-panel gs-range-stab">
      <div class="gs-range-coach__kicker">🎓 Scoring format 3 of 3 · Matchplay</div>
      <p class="gs-range-stab__lead">${head}</p>
      <div class="gs-range-ladder" aria-label="This hole, head to head">
        <div class="gs-range-ladder__row${r.winner === 'player' ? ' gs-range-ladder__row--you' : ''}"><span>You</span><span>par ${r.par}</span><b>${r.playerStrokes}</b></div>
        <div class="gs-range-ladder__row${r.winner === 'boss' ? ' gs-range-ladder__row--you' : ''}"><span>${who}</span><span>par ${r.par}</span><b>${r.bossStrokes}</b></div>
      </div>
      <p class="gs-range-stab__note">In matchplay the total doesn’t matter — <b>each hole is a contest</b> won by whoever takes fewer shots, and the match is the count of holes won. A blow-up only ever costs you ONE hole. “2 up” means two holes ahead; a match ends early once you’re up by more than are left (“3 &amp; 2”). Every Voyage boss is a matchplay duel.</p>
    </div>`;
}

/** The scoring lesson for a finished range hole, in that hole's format — the end-of-hole card's panel. */
export function rangeHoleLessonHTML(holeIndex: number, hole: PlayedHole, rival: PlayedHole | undefined): string {
  switch (rangeScoringFor(holeIndex)) {
    case 'stroke':
      return strokeHTML(hole);
    case 'stableford':
      return stablefordHTML(hole);
    case 'match':
      return matchHTML(hole, rival);
  }
}

/** The end-of-hole banner's two format-specific readouts, so the big number is the one the format
 *  scores by: the strokes, the points, or the hole's match result. */
export function rangeBannerParts(holeIndex: number, hole: PlayedHole, rival: PlayedHole | undefined): { line: string; big: string; cap: string } {
  const d = hole.record.strokes - hole.record.par;
  switch (rangeScoringFor(holeIndex)) {
    case 'stroke':
      return { line: `${toParTag(d) === 'par' ? 'level par' : `${toParTag(d)} to par`} · stroke play`, big: `${hole.record.strokes}`, cap: 'STROKES' };
    case 'stableford': {
      const n = pts(hole);
      return { line: `+${n} pt${n === 1 ? '' : 's'} · Stableford`, big: `${n}`, cap: 'POINTS' };
    }
    case 'match': {
      const w = rival ? rangeMatchResult(hole, rival).winner : 'halved';
      return { line: `matchplay vs ${rivalName()}`, big: w === 'player' ? 'WON' : w === 'boss' ? 'LOST' : 'HALVED', cap: 'THE HOLE' };
    }
  }
}

/** The graduation card — each hole in its own format, what was covered, and where to go next. */
export function rangeResultScreen(): string {
  const played = state.played ?? [];
  const cells = played
    .map((p, i) => {
      const b = rangeBannerParts(i, p, state.rangeRival);
      const fmt = { stroke: 'Stroke play', stableford: 'Stableford', match: 'Matchplay' }[rangeScoringFor(i)];
      return `<div class="gs-range-card__cell">
        <span class="gs-range-card__n">Hole ${i + 1} · ${fmt}</span>
        <span class="gs-range-card__s">${b.big}</span>
        <span class="gs-range-card__u">${b.cap.toLowerCase()}</span>
        <span class="gs-range-card__p">${p.pickedUp ? 'picked up' : `${p.record.strokes} on a par ${p.record.par}`}</span>
      </div>`;
    })
    .join('');
  const strokes = played.reduce((s, p) => s + p.record.strokes, 0);
  const par = played.reduce((s, p) => s + p.record.par, 0);
  const d = strokes - par;
  const verdict = d < 0 ? 'Under par on the range — you’re a natural.' : d === 0 ? 'Level par. Textbook.' : 'Every round teaches something. Go again, or go for real.';
  const learned = ['Reading the cone and hitting a shot', 'Reading a green and setting putt pace', 'Keeping the cone off the water', 'Stroke play, Stableford and matchplay', 'What an upgrade does to your spray']
    .map((t) => `<li>✓ ${t}</li>`)
    .join('');
  return `
    <div class="gs-range-grad">
      <header class="gs-range-grad__hero">
        <div class="gs-range-grad__icon" aria-hidden="true">🎓</div>
        <h1 class="gs-range-grad__title">Range complete</h1>
        <div class="gs-range-grad__score">${strokes} <span>shots · ${d === 0 ? 'level par' : `${toParTag(d)} to par`}</span></div>
        <p class="gs-range-grad__verdict">${verdict}</p>
      </header>
      <div class="gs-range-card">${cells}</div>
      <div class="gs-panel gs-range-grad__learned">
        <div class="gs-range-coach__kicker">What you covered</div>
        <ul>${learned}</ul>
      </div>
      <div class="gs-panel gs-range-grad__next">
        <div class="gs-range-coach__kicker">Where next</div>
        <p><b>🚀 The Voyage</b> — the campaign: three arcs, a field to beat on Stableford points, and a matchplay boss at the end of each. <b>🌌 The Unending Universe</b> — how deep can you go on strokes? <b>🌠 Story Tour</b> — save the galaxy with a crew of friends. Pick one from the title.</p>
      </div>
      <div class="gs-range-grad__actions">
        <button class="gs-btn gs-btn--primary" data-action='${JSON.stringify({ type: 'toTitle' })}'>🏠 Back to the title</button>
        <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'openRange' })}'>🔁 Go round again</button>
      </div>
    </div>`;
}
