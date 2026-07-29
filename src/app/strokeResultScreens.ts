/**
 * STAR TOUR round recap (GS-star-tour): the strokeResult screen shown after an 18-hole stroke-play
 * round. The card leads with the round's total to-par (a NEW-RECORD banner when it beat the course
 * best), a compact 18-hole scorecard strip, and the two personal boards — this course's record and
 * your best rounds overall. Pure render off `state`; the buttons dispatch back to the star map / title.
 */

import { state } from './ctx';
import { staticCourseSpec } from '../sim/course/staticCourses';
import { COURSE_EFFECTS, type CourseEffectId } from '../sim/rpg/effects';
import { scoreName, playTotals } from '../sim/score';
import { formatToPar, toParColour } from '../sim/rpg/endless';
import { bestStrokeFor, bestStrokeRounds } from '../sim/rpg/strokePlay';
import type { PlayedHole } from '../sim/round';

/** Colour a per-hole score by name (eagle+ gold, birdie green, par ink, bogey amber, worse red). */
function holeCellColour(par: number, strokes: number): string {
  const d = strokes - par;
  if (d <= -2) return '#ffce54';
  if (d === -1) return '#5fd45a';
  if (d === 0) return '#cdd3df';
  if (d === 1) return '#ffb454';
  return '#ff6b6b';
}

/** The 18-hole scorecard strip. */
function scorecardStrip(): string {
  const played = state.played ?? [];
  const cells = played
    .map((p, i) => {
      const { par, strokes } = p.record;
      const name = p.holed ? scoreName(par, strokes) : '—';
      return `<div class="gs-str-cell" title="Hole ${i + 1} · ${name}">
        <span class="gs-str-cell__n">${i + 1}</span>
        <span class="gs-str-cell__s" style="color:${holeCellColour(par, strokes)};">${strokes}</span>
        <span class="gs-str-cell__p">${par}</span>
      </div>`;
    })
    .join('');
  return `<div class="gs-str-strip">${cells}</div>`;
}

/** The between-hole progress board for a Star Tour round (GS-star-tour): the running to-par + gross
 *  over the holes finished so far, plus a compact hole-by-hole strip — the record-chase equivalent of
 *  the voyage's ghost leaderboard, which has no place in a solo stroke-play round. */
export function strokePlayProgressHTML(played: PlayedHole[]): string {
  const totals = playTotals(played.map((p) => p.record));
  const cells = played
    .map((p, i) => {
      const { par, strokes } = p.record;
      const name = p.holed ? scoreName(par, strokes) : '—';
      return `<div class="gs-str-cell" title="Hole ${i + 1} · ${name}">
        <span class="gs-str-cell__n">${i + 1}</span>
        <span class="gs-str-cell__s" style="color:${holeCellColour(par, strokes)};">${strokes}</span>
        <span class="gs-str-cell__p">${par}</span>
      </div>`;
    })
    .join('');
  return `
    <div class="gs-panel" style="padding:12px 14px;">
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:8px;">
        <span style="font-size:12px;letter-spacing:.08em;opacity:.6;">ROUND SO FAR</span>
        <span style="font-size:15px;font-weight:800;color:${toParColour(totals.toPar)};">${formatToPar(totals.toPar)} <span style="font-size:11px;opacity:.6;font-weight:600;">· ${totals.gross} thru ${played.length}</span></span>
      </div>
      <div class="gs-str-strip">${cells}</div>
    </div>`;
}

export function strokeResultScreen(): string {
  const rec = state.lastStrokeRecord;
  if (!rec) return `<div class="gs-panel">Round complete.</div>`;
  const spec = staticCourseSpec(rec.courseId);
  const eff = COURSE_EFFECTS[(rec.effect ?? 'none') as CourseEffectId];
  const best = bestStrokeFor(state.strokePlayBest, rec.courseId);
  const board = bestStrokeRounds(state.strokePlayBest, 5);
  const isRecord = state.strokeIsRecord;

  const boardRows = board
    .map((r, i) => {
      const s = staticCourseSpec(r.courseId);
      const here = r.courseId === rec.courseId && r.toPar === rec.toPar;
      // GS-story-startour-champions: ★ = set by a champion's developed loadout (descriptive; the board is
      // ranked on to-par alone, one board per course).
      const star = r.champion ? ` <span title="Set by a Star Tour champion" style="color:#ffd97a;">★</span>` : '';
      return `<div class="gs-st-boardrow${here ? ' gs-st-boardrow--you' : ''}"><span class="gs-st-boardrank">${i + 1}</span><span class="gs-st-boardname">${s?.name ?? r.courseId}${star}</span><span class="gs-st-boardscore" style="color:${toParColour(r.toPar)};">${formatToPar(r.toPar)}</span></div>`;
    })
    .join('');

  return `
    <div class="gs-strres">
      <header class="gs-strres__hero">
        <div class="gs-strres__course">${spec?.name ?? rec.courseId} ${eff && rec.effect !== 'none' ? `<span class="gs-strres__wx">${eff.icon} ${eff.label}</span>` : ''}</div>
        <div class="gs-strres__score" style="color:${toParColour(rec.toPar)};">${formatToPar(rec.toPar)}</div>
        <div class="gs-strres__sub">${rec.strokes} strokes &middot; par ${rec.par}</div>
        ${isRecord ? `<div class="gs-strres__record">🏆 New course record!</div>` : best ? `<div class="gs-strres__prev">Your best here: <b style="color:${toParColour(best.toPar)};">${formatToPar(best.toPar)}</b></div>` : ''}
      </header>

      ${scorecardStrip()}

      <div class="gs-strres__board">
        <div class="gs-strres__boardtitle">Best rounds overall</div>
        <div class="gs-st-board">${boardRows}</div>
      </div>

      <div class="gs-strres__actions">
        <button class="gs-btn gs-btn--primary" data-action='{"type":"openStarTour"}'>🗺 Star map</button>
        <button class="gs-btn gs-btn--ghost" data-action='{"type":"toTitle"}'>🏠 Title</button>
      </div>
    </div>`;
}
