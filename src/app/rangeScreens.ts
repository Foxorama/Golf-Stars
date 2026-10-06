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
  rangeText,
  stablefordLadder,
  stablefordRungFor,
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

/**
 * The Stableford lesson, on the end-of-hole card of every range hole (in place of the leaderboard the
 * range has no field for). It is taught AGAINST the score just made — the ladder lights the rung you
 * landed on — because "par is 2 points" means far more the moment after you made one.
 */
export function rangeStablefordHTML(hole: PlayedHole, playedSoFar: readonly PlayedHole[]): string {
  const par = hole.record.par;
  const strokes = hole.record.strokes;
  const lit = hole.pickedUp ? 2 : stablefordRungFor(par, strokes);
  const pts = hole.pickedUp ? 0 : stablefordPoints(par, strokes);
  const total = playedSoFar.reduce((s, p) => s + (p.pickedUp ? 0 : stablefordPoints(p.record.par, p.record.strokes)), 0);
  const rows = stablefordLadder(par)
    .map(
      (r) => `<div class="gs-range-ladder__row${r.toPar === lit ? ' gs-range-ladder__row--you' : ''}">
        <span>${r.name}</span><span>${r.toPar === 0 ? 'par' : r.toPar > 0 ? `+${r.toPar}` : r.toPar}</span><b>${r.points} pt${r.points === 1 ? '' : 's'}</b>
      </div>`,
    )
    .join('');
  const what = hole.pickedUp ? 'You picked up' : `You made ${scoreName(par, strokes).toLowerCase() === 'hole-in-one' ? 'a hole-in-one' : `a ${scoreName(par, strokes).toLowerCase()}`}`;
  return `
    <div class="gs-panel gs-range-stab">
      <div class="gs-range-coach__kicker">🎓 How scoring works · Stableford</div>
      <p class="gs-range-stab__lead">${what} — that’s <b>${pts} point${pts === 1 ? '' : 's'}</b>.</p>
      <div class="gs-range-ladder" aria-label="Stableford points for each score">${rows}</div>
      <p class="gs-range-stab__note">Every hole turns into points: <b>par is worth 2</b>, each stroke better adds one, each stroke worse takes one away — and a bad hole bottoms out at 0, so one disaster can’t sink a round. On a Voyage you race a field of golfers on points, and you need enough at each stop to make the cut.</p>
      <div class="gs-range-stab__total">Range total so far: <b>${total} pts</b> from ${playedSoFar.length} hole${playedSoFar.length === 1 ? '' : 's'}</div>
    </div>`;
}

/** The graduation card — the three-hole card, the points, what was covered, and where to go next. */
export function rangeResultScreen(): string {
  const played = state.played ?? [];
  const cells = played
    .map((p, i) => {
      const pts = p.pickedUp ? 0 : stablefordPoints(p.record.par, p.record.strokes);
      return `<div class="gs-range-card__cell">
        <span class="gs-range-card__n">Hole ${i + 1} · par ${p.record.par}</span>
        <span class="gs-range-card__s">${p.pickedUp ? '—' : p.record.strokes}</span>
        <span class="gs-range-card__p">${pts} pt${pts === 1 ? '' : 's'}</span>
      </div>`;
    })
    .join('');
  const total = played.reduce((s, p) => s + (p.pickedUp ? 0 : stablefordPoints(p.record.par, p.record.strokes)), 0);
  const par = played.length * 2;
  const verdict = total > par ? 'Better than par golf — you’re a natural.' : total === par ? 'Exactly par golf. Textbook.' : 'Every round teaches something. Go again, or go for real.';
  const learned = ['Reading the cone and hitting a shot', 'Reading a green and setting putt pace', 'Keeping the cone off the water', 'How Stableford points work', 'What an upgrade does to your spray']
    .map((t) => `<li>✓ ${t}</li>`)
    .join('');
  return `
    <div class="gs-range-grad">
      <header class="gs-range-grad__hero">
        <div class="gs-range-grad__icon" aria-hidden="true">🎓</div>
        <h1 class="gs-range-grad__title">Range complete</h1>
        <div class="gs-range-grad__score">${total} <span>Stableford points</span></div>
        <p class="gs-range-grad__verdict">${verdict}</p>
      </header>
      <div class="gs-range-card">${cells}</div>
      <div class="gs-panel gs-range-grad__learned">
        <div class="gs-range-coach__kicker">What you covered</div>
        <ul>${learned}</ul>
      </div>
      <div class="gs-panel gs-range-grad__next">
        <div class="gs-range-coach__kicker">Where next</div>
        <p><b>🚀 The Voyage</b> — the campaign: three arcs, three bosses, a field to beat on points. <b>🌌 The Unending Universe</b> — how deep can you go? <b>🌠 Story Tour</b> — save the galaxy with a crew of friends. Pick one from the title.</p>
      </div>
      <div class="gs-range-grad__actions">
        <button class="gs-btn gs-btn--primary" data-action='${JSON.stringify({ type: 'toTitle' })}'>🏠 Back to the title</button>
        <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'openRange' })}'>🔁 Go round again</button>
      </div>
    </div>`;
}
