/**
 * STAR TOUR course-picker screen (GS-star-tour).
 *
 * A full-screen, free-roam celestial star map: every 18-hole Star Tour course sits at its
 * constellation's real sky position, and the player flies their ship (a fixed centre reticle) around
 * the chart — which pans by native scroll — to pick a world. Tapping a world raises a bottom DOSSIER
 * sheet (course flavour, difficulty, your record, a weather picker, and Fly-here-&-play). With no
 * world selected the sheet shows the personal course-record boards.
 *
 * Its cockpit chrome uses its OWN class prefix `.gs-sthud` (NOT the play screen's `.gs-hud` nor the
 * journey map's `.gs-bhud`) so it can never collide with another screen's styles (CLAUDE.md: new
 * screen chrome gets its own prefix). Pure render off `state` + this module's view object; the app
 * wires the taps. No reducer/save/rng impact — the course pick is a `pickStarTourCourse` action.
 */

import { state } from './ctx';
import { STATIC_COURSES, staticCourseSpec } from '../sim/course/staticCourses';
import { COURSE_EFFECTS, type CourseEffectId } from '../sim/rpg/effects';
import { starTourMapSVG, type StarTourWorld } from '../render/starTourMap';
import { bestStrokeFor, bestStrokeRounds } from '../sim/rpg/strokePlay';
import { formatToPar, toParColour } from '../sim/rpg/endless';

/** View state for the star map (mutated by app.ts; reset on entry). */
export const starTourView = {
  /** The world whose dossier is open, or null for the welcome/records sheet. */
  selectedId: null as string | null,
  /** The weather sky chosen for the round (a CourseEffectId). */
  effect: 'none' as CourseEffectId,
  /** Set once the viewport has been auto-centred on first mount (app.ts). */
  centred: false,
};

/** The weather skies offered on the star map — atmospheric choices (the trade-camp / mechanic effects
 *  are excluded so a record round is never decided by a tent bounce). Ordered calm → wild. */
export const STAR_TOUR_WEATHERS: readonly CourseEffectId[] = [
  'none',
  'moonlight',
  'nebula',
  'aurora',
  'radiant',
  'solarWind',
  'gravityWell',
  'dustStorm',
  'ionStorm',
  'blizzard',
];

const TIER_LABEL: Record<StarTourWorld['tier'], string> = {
  gentle: 'Gentle',
  testing: 'Testing',
  brutal: 'Brutal',
};
const TIER_COL: Record<StarTourWorld['tier'], string> = {
  gentle: '#5fd45a',
  testing: '#ffce54',
  brutal: '#ff6b6b',
};

/** The Star Tour catalogue as plottable worlds, stamped with the player's records. */
export function starTourWorlds(): StarTourWorld[] {
  return STATIC_COURSES.filter((c) => c.themeId && c.archetype).map((c) => {
    const best = bestStrokeFor(state.strokePlayBest, c.id);
    return {
      id: c.id,
      name: c.name,
      archetype: c.archetype!,
      tier: c.tier ?? 'testing',
      themeId: c.themeId!,
      hasRecord: !!best,
      bestToPar: best?.toPar,
    };
  });
}

/** The cockpit HUD frame: corner brackets, title plate, centre ship reticle, bottom console. Its own
 *  `.gs-sthud` prefix; `pointer-events:none` so map scroll/taps pass through, only the buttons catch. */
function stHud(): string {
  return `
    <div class="gs-sthud" aria-hidden="false">
      <div class="gs-sthud__frame"></div>
      <button class="gs-sthud__back" data-action='{"type":"exitStarTour"}'>‹ Exit</button>
      <div class="gs-sthud__plate">✦ STAR TOUR</div>
      <div class="gs-sthud__statpod">
        <span class="gs-sthud__shards">✦ <b>${state.shards}</b></span>
        <button class="gs-sthud__cog" data-open-settings="1" title="Settings" aria-label="Settings">⚙</button>
      </div>
      <div class="gs-sthud__reticle" aria-hidden="true">
        <svg viewBox="-30 -30 60 60" width="60" height="60">
          <circle r="26" fill="none" stroke="#7fe0ff" stroke-width="1" opacity="0.35"/>
          <path d="M0,-14 C7,-9 7,9 0,15 C-7,9 -7,-9 0,-14 Z" fill="#dfe6f2"/>
          <circle cx="0" cy="-2" r="3.2" fill="#8fe6ff"/>
          <path d="M-6,8 L-11,16 L-3,12 Z" fill="#7fe0ff"/>
          <path d="M6,8 L11,16 L3,12 Z" fill="#7fe0ff"/>
          <path d="M-2.4,15 L0,25 L2.4,15 Z" fill="#ffc454" opacity="0.9"><animate attributeName="opacity" values="0.5;1;0.5" dur="1.1s" repeatCount="indefinite"/></path>
        </svg>
      </div>
    </div>`;
}

/** The weather-picker chip row for the dossier. */
function weatherPicker(): string {
  const chips = STAR_TOUR_WEATHERS.map((id) => {
    const e = COURSE_EFFECTS[id];
    const sel = id === starTourView.effect;
    return `<button class="gs-st-wx${sel ? ' gs-st-wx--on' : ''}" data-startour-weather="${id}" title="${e.blurb}">${e.icon} ${id === 'none' ? 'Calm' : e.label}</button>`;
  }).join('');
  return `<div class="gs-st-wxrow">${chips}</div>`;
}

/** The bottom dossier for a selected world — flavour, difficulty, your record, weather + play. */
function dossier(w: StarTourWorld): string {
  const spec = staticCourseSpec(w.id);
  const best = bestStrokeFor(state.strokePlayBest, w.id);
  const recordLine = best
    ? `<span class="gs-st-rec">🏆 Your best: <b style="color:${toParColour(best.toPar)};">${formatToPar(best.toPar)}</b> <span style="opacity:.7;">(${best.strokes} strokes, par ${best.par})</span></span>`
    : `<span class="gs-st-rec" style="opacity:.7;">No record yet — set the first!</span>`;
  return `
    <div class="gs-st-sheet" role="dialog" aria-label="${w.name}">
      <button class="gs-st-sheet__close" data-startour-close="1" aria-label="Close">✕</button>
      <div class="gs-st-sheet__head">
        <h2 class="gs-st-sheet__title">${w.name}</h2>
        <span class="gs-st-tier" style="--tc:${TIER_COL[w.tier]};">${TIER_LABEL[w.tier]}</span>
      </div>
      <p class="gs-st-sheet__blurb">${spec?.blurb ?? ''}</p>
      ${recordLine}
      <div class="gs-st-sheet__wxlabel">Weather sky</div>
      ${weatherPicker()}
      <button class="gs-st-play" data-action='${JSON.stringify({ type: 'pickStarTourCourse', courseId: w.id, effect: starTourView.effect })}'>▸ Fly here &amp; play 18</button>
    </div>`;
}

/** The default sheet (no world selected) — a welcome + the personal course-record boards. */
function welcomeSheet(): string {
  const board = bestStrokeRounds(state.strokePlayBest, 5);
  const rows = board.length
    ? board
        .map((r, i) => {
          const spec = staticCourseSpec(r.courseId);
          return `<div class="gs-st-boardrow"><span class="gs-st-boardrank">${i + 1}</span><span class="gs-st-boardname">${spec?.name ?? r.courseId}</span><span class="gs-st-boardscore" style="color:${toParColour(r.toPar)};">${formatToPar(r.toPar)}</span></div>`;
        })
        .join('')
    : `<div class="gs-st-boardempty">Fly to a world and play its 18 to set your first course record.</div>`;
  const played = Object.keys(state.strokePlayBest).length;
  return `
    <div class="gs-st-sheet gs-st-sheet--welcome">
      <div class="gs-st-sheet__head">
        <h2 class="gs-st-sheet__title">Course records</h2>
        <span class="gs-st-tier" style="--tc:#7fe0ff;">${played}/${starTourWorlds().length} played</span>
      </div>
      <div class="gs-st-hint">🕹 Drag to fly around &middot; tap a world to play its 18</div>
      <div class="gs-st-sheet__wxlabel">Your best rounds</div>
      <div class="gs-st-board">${rows}</div>
    </div>`;
}

/** The whole Star Tour screen. */
export function starTourScreen(): string {
  const worlds = starTourWorlds();
  const sel = starTourView.selectedId ? worlds.find((w) => w.id === starTourView.selectedId) : undefined;
  const chart = starTourMapSVG({ seed: `startour:${state.run.seed}`, worlds, selectedId: sel?.id });
  const sheet = sel ? dossier(sel) : welcomeSheet();
  return `
    <div class="gs-startour">
      <div class="gs-startour__viewport" id="gs-st-viewport">${chart}</div>
      ${stHud()}
      ${sheet}
    </div>`;
}
