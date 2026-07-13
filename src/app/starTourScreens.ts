/**
 * STAR TOUR course-picker screen (GS-star-tour / GS-star-tour-2).
 *
 * A full-screen, free-roam celestial star map you FLY: the player's ship (their character's cosmetic
 * ride) starts docked at the clubhouse SPACEPORT and flies wherever you tap — orienting toward the
 * point and cruising there. Tapping a WORLD flies the ship to it and, on arrival, opens the course
 * DOSSIER (flavour, difficulty, your record, a weather picker, Fly-here-&-play). The chart pans by
 * native scroll + drag. A bottom-left GOLFER pod swaps the character (and thus the ship); a bottom-
 * right pill toggles the course-record boards.
 *
 * Character select comes BEFORE this screen (GS-star-tour-2), so `run.loadout.characterId` is set and
 * the ship is the golfer's own. Cockpit chrome uses its OWN class prefix `.gs-sthud` (never the play
 * screen's `.gs-hud` nor the journey map's `.gs-bhud` — the class-collision rule). The ship's motion is
 * an app-layer rAF animation (starTourView holds its position); the reducer stays pure.
 */

import { state } from './ctx';
import { STATIC_COURSES, staticCourseSpec } from '../sim/course/staticCourses';
import { COURSE_EFFECTS, type CourseEffectId } from '../sim/rpg/effects';
import { starTourMapSVG, SHIP_DOCK_HEADING, type StarTourWorld } from '../render/starTourMap';
import { bestStrokeFor, bestStrokeRounds } from '../sim/rpg/strokePlay';
import { formatToPar, toParColour } from '../sim/rpg/endless';
import { shipForCharacter } from '../ui/gameCosmetics';
import { getCharacter } from '../sim/rpg/characters';
import { shipById } from '../sim/rpg/ships';
import type { CosmeticRarity } from '../sim/rpg/cosmetics';

/** View state for the star map (mutated by app.ts; reset on entry). */
export const starTourView = {
  /** The world whose dossier is open, or null. */
  selectedId: null as string | null,
  /** The weather sky chosen for the round (a CourseEffectId). */
  effect: 'none' as CourseEffectId,
  /** The course-record boards panel is open. */
  recordsOpen: false,
  /** Set once the viewport has been auto-centred on the spaceport (app.ts). */
  centred: false,
  /** The chart scroll offset, preserved across re-renders (each render rebuilds the viewport node, so
   *  the browser scroll is lost otherwise). Updated on pan/scroll and while the camera follows the ship. */
  scrollX: null as number | null,
  scrollY: null as number | null,
  /** Ship position (chart coords) + heading (deg, 0 = nose along +x — the right-facing ship art) —
   *  animated by app.ts; null = dock at port. `flip` (+1/−1) mirrors the hull when it flies LEFT so a
   *  wheeled craft never reads belly-up. */
  shipX: null as number | null,
  shipY: null as number | null,
  heading: SHIP_DOCK_HEADING,
  flip: 1,
  /** Current flight target (chart coords), or null when idle. */
  targetX: null as number | null,
  targetY: null as number | null,
  /** The course id to open on arrival (a flight triggered by tapping a world), or null (free flight). */
  flyingTo: null as string | null,
  /** Chart zoom (pinch/scroll), 1 = intrinsic. Preserved across re-renders like the scroll offset. */
  zoom: 1,
};

/** Ship cruise speed by RARITY (GS-star-tour-map-improvements): the flown ship's rarity scales its
 *  per-frame cruise step around the flat "current slow speed" the small map wants — commons cruise a
 *  touch slower, the mythic grail a touch faster. Multiplies the flight loop's constant base step (the
 *  app owns the base + long-haul acceleration; this table owns only the rarity feel). */
const RARITY_SPEED_MULT: Record<CosmeticRarity, number> = {
  common: 0.9,
  rare: 1.0,
  epic: 1.1,
  legendary: 1.2,
  mythic: 1.3,
};

/** The current golfer's ship-rarity cruise multiplier for the star-map flight (1.0 if no ship). */
export function starTourShipSpeedMult(): number {
  const ship = shipById(shipForCharacter(state, state.run.loadout.characterId));
  return ship ? RARITY_SPEED_MULT[ship.rarity] : 1.0;
}

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

/** The cockpit HUD frame: corner brackets, title plate, an EXIT switch, the top-right stat pod, plus
 *  the bottom dock (golfer swap + records toggle). Its own `.gs-sthud` prefix; `pointer-events:none`
 *  so map scroll/taps pass through — only the buttons catch pointers. */
function stHud(): string {
  const charId = state.run.loadout.characterId;
  const ch = charId ? getCharacter(charId) : undefined;
  const shipId = shipForCharacter(state, charId);
  const ship = shipById(shipId);
  const accent = ch?.style.cap ?? '#7fe0ff';
  return `
    <div class="gs-sthud" aria-hidden="false">
      <div class="gs-sthud__frame"></div>
      <button class="gs-sthud__back" data-action='{"type":"exitStarTour"}'>‹ Exit</button>
      <div class="gs-sthud__plate">✦ STAR TOUR</div>
      <div class="gs-sthud__statpod">
        <span class="gs-sthud__shards">✦ <b>${state.shards}</b></span>
        <button class="gs-sthud__cog" data-open-settings="1" title="Settings" aria-label="Settings">⚙</button>
      </div>
      <div class="gs-sthud__dock">
        <button class="gs-sthud__golfer" data-action='{"type":"openStarTour"}' title="Change golfer">
          <span class="gs-sthud__golfer-dot" style="background:${accent};"></span>
          <span class="gs-sthud__golfer-txt">
            <b>${ch?.name ?? 'Pick golfer'}</b>
            <span>🚀 ${ship?.name ?? 'ship'} · change ▸</span>
          </span>
        </button>
        <button class="gs-sthud__records" data-startour-records="1">🏆 Records</button>
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

/** The course-record boards panel (toggled by the dock pill). */
function recordsSheet(): string {
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
    <div class="gs-st-sheet gs-st-sheet--records">
      <button class="gs-st-sheet__close" data-startour-records="0" aria-label="Close">✕</button>
      <div class="gs-st-sheet__head">
        <h2 class="gs-st-sheet__title">Course records</h2>
        <span class="gs-st-tier" style="--tc:#7fe0ff;">${played}/${starTourWorlds().length} played</span>
      </div>
      <div class="gs-st-sheet__wxlabel">Your best rounds overall</div>
      <div class="gs-st-board">${rows}</div>
    </div>`;
}

/** The whole Star Tour screen. */
export function starTourScreen(): string {
  const worlds = starTourWorlds();
  const sel = starTourView.selectedId ? worlds.find((w) => w.id === starTourView.selectedId) : undefined;
  const chart = starTourMapSVG({
    seed: `startour:${state.run.seed}`,
    worlds,
    selectedId: sel?.id,
    shipId: shipForCharacter(state, state.run.loadout.characterId),
    shipX: starTourView.shipX ?? undefined,
    shipY: starTourView.shipY ?? undefined,
    shipHeading: starTourView.heading,
    shipFlip: starTourView.flip,
    zoom: starTourView.zoom,
  });
  const sheet = sel ? dossier(sel) : starTourView.recordsOpen ? recordsSheet() : '';
  return `
    <div class="gs-startour">
      <div class="gs-startour__viewport" id="gs-st-viewport">${chart}</div>
      ${stHud()}
      ${sheet}
    </div>`;
}
