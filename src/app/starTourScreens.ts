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
 * the ship is the golfer's own. The cockpit HUD REUSES the journey bridge HUD (GS-star-tour-hud): the map
 * renders a `.gs-bhud gs-bhud--st gs-bhud--<variant>` frame themed by `hudThemeForShip`/`hudChromeFor`, so
 * it recolours to the flown ship AND inherits the same fleet ornaments — with a `.gs-bhud--st` context
 * modifier swapping the travel controls (fuel/scan/credits/hole) for Star Tour's own (records stat pod,
 * golfer-swap centre command, records readout, EXIT in the bottom-left slot). Star-Tour content keeps the
 * `.gs-sthud__` prefix; the class-collision guard is unchanged (never the play screen's `.gs-hud`). The
 * ship's motion is an app-layer rAF animation (starTourView holds its position); the reducer stays pure.
 */

import { state } from './ctx';
import { STATIC_COURSES, staticCourseSpec } from '../sim/course/staticCourses';
import { COURSE_EFFECTS, type CourseEffectId } from '../sim/rpg/effects';
import { starTourMapSVG, SHIP_DOCK_HEADING, YGGDRASIL_REALMS, type StarTourWorld } from '../render/starTourMap';
import { bestStrokeFor, bestStrokeRounds } from '../sim/rpg/strokePlay';
import { STORY_WORLDS, storyWorldUnlocked, STORY_CHAPTER_COUNT, worldCleared } from '../sim/rpg/story';
import { storyWorldShoppable } from '../sim/rpg/storyShop';
import { worldIsShipVendor } from '../sim/rpg/storyShips';
import { worldCaddy, storyCaddyHired, STORY_CADDY_PRICE } from '../sim/rpg/storyCaddies';
import { shopItem } from '../sim/rpg/economy';
import { formatToPar, toParColour } from '../sim/rpg/endless';
import { shipForCharacter } from '../ui/gameCosmetics';
import { getCharacter } from '../sim/rpg/characters';
import { shipById } from '../sim/rpg/ships';
import type { CosmeticRarity } from '../sim/rpg/cosmetics';
import { hudThemeForShip, hudThemeVars } from '../render/hudTheme';
import { hudChromeFor } from '../render/hudChrome';
import { fuelGaugeHTML } from '../render/fuel';
import { shipWeaponFor, weaponReticleSVG } from '../render/shipWeapons';

/** The star-map fuel tank (GS-star-tour-fuel): flying burns fuel by DISTANCE travelled; visiting any
 *  station (a world / Earth / the spaceport) tops it back to full; draining it in deep space calls the
 *  space tanker. A round display value (one gauge cell per unit) — app-layer feel only, never persisted. */
export const STAR_TOUR_FUEL_CAP = 10;

/** The weapon charge magazine (GS-star-tour-weapons): a couple of shots on the dashboard fire button,
 *  refilled whenever the fuel tank tops up (at any station, or after the space tanker's visit). App-layer
 *  feel only — never the sim, a save, or the rng stream. */
export const WEAPON_AMMO_CAP = 2;

/** The refuel-tanker animation state (GS-star-tour-fuel): when the tank hits empty mid-flight the ship
 *  stalls, a fuel truck flies in from the viewport edge (`in`), hoses the tank up (`hose`), then flies out
 *  (`out`); the interrupted flight resumes afterwards. Chart-space coords; driven by app.ts's rAF loop. */
export interface StarTourRefuel {
  phase: 'in' | 'hose' | 'out';
  /** Tanker position (chart coords), lerped toward the dock/exit each frame. */
  truckX: number;
  truckY: number;
  /** Where the tanker docks beside the stalled ship, and the edge it exits toward. */
  dockX: number;
  dockY: number;
  exitX: number;
  exitY: number;
  /** Horizontal facing (+1 nose-right / −1 nose-left) so the cab points at the ship. */
  flip: number;
  /** The flight to resume once the tank is full again (null = the ship was idle when it ran dry). */
  resume: { targetX: number; targetY: number; flyingTo: string | null } | null;
}

/** View state for the star map (mutated by app.ts; reset on entry). */
export const starTourView = {
  /** GS-story-map: the star map is being flown as the STORY campaign navigator (worlds gated by chapter,
   *  story ship + credits, a clubhouse exit) rather than the free-roam records chase. Set by app.ts on
   *  `openStoryMap`, cleared on `openStarTour`. */
  storyMode: false,
  /** The world whose dossier is open, or null. */
  selectedId: null as string | null,
  /** The weather sky chosen for the round (a CourseEffectId). */
  effect: 'none' as CourseEffectId,
  /** The course-record boards panel is open. */
  recordsOpen: false,
  /** The Yggdrasil realm-tree overlay is open (GS-star-tour-yggdrasil): opened by flying to the World
   *  Tree (visible only once Thor's Hammer is won), it lists the Nine Realms with Asgard playable. */
  yggdrasilOpen: false,
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
  /** Camera-follow intent (GS-star-map-jerky-movement): true while the player is flying the ship around
   *  (set by any fly*), cleared the instant they take manual control (pan/pinch/wheel). The chase-cam eases
   *  toward the ship whenever this is set — NOT only while a hop is actively cruising — so a completed hop
   *  finishes centring smoothly instead of hard-freezing the map, and rapid "tap to keep moving" taps read
   *  as one continuous glide rather than a freeze→lurch stutter between hops. */
  following: false,
  /** The course id to open on arrival (a flight triggered by tapping a world), or null (free flight). */
  flyingTo: null as string | null,
  /** Flying home to the SPACEPORT (GS-star-tour-port): on arrival the ship docks and the Clubhouse opens
   *  (the map's way OUT). Set by tapping the spaceport, cleared by any other fly. */
  dockingAtPort: false,
  /** Flying to the hidden YGGDRASIL (GS-star-tour-yggdrasil): on arrival the realm-tree overlay opens.
   *  Set by tapping the World Tree, cleared by any other fly. */
  flyingToYggdrasil: false,
  /** Chart zoom (pinch/scroll), 1 = intrinsic. Preserved across re-renders like the scroll offset. */
  zoom: 1,
  /** Ship fuel (GS-star-tour-fuel), 0..STAR_TOUR_FUEL_CAP. Drains while cruising, tops up at stations. */
  fuel: STAR_TOUR_FUEL_CAP,
  /** Throttle: 'fast' cruises +25% and burns 1.5× the fuel per distance (the console speed control). */
  speed: 'normal' as 'normal' | 'fast',
  /** Weapon charges left (GS-star-tour-weapons), 0..WEAPON_AMMO_CAP. Firing spends one; refuelling refills. */
  ammo: WEAPON_AMMO_CAP,
  /** Active refuel-tanker sequence, or null. */
  refuel: null as StarTourRefuel | null,
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

/** GS-story-map: is the star map the STORY campaign navigator (vs the records chase)? */
export function inStoryTour(): boolean {
  return !!starTourView.storyMode && !!state.story;
}
/** GS-story-startour-champion: free-roam Star Tour played as the DEVELOPED champion (a completed campaign
 *  is playing its reward free-roam, NOT the campaign navigator). The champion + developed ship are fixed,
 *  so the chart flies the earned Story ship and drops the records-chase "change golfer" swap. */
export function championFreeRoam(): boolean {
  return !inStoryTour() && !!state.story?.completed;
}
/** The active golfer id on the chart — the story protagonist in story mode, else the run's golfer. */
function tourCharacterId(): string | undefined {
  return inStoryTour() ? state.story!.characterId : state.run.loadout.characterId;
}
/** The ship flown on the chart — the campaign's equipped ship in story mode / the developed champion's
 *  free-roam reward (its own progression), else the character's cosmetic ride. Exported so app.ts's flight
 *  loop (weapon/hover) reads the same ship. */
export function tourShipId(): string {
  return inStoryTour() || championFreeRoam()
    ? state.story!.equippedShipId
    : shipForCharacter(state, state.run.loadout.characterId);
}

/** The current golfer's ship-rarity cruise multiplier for the star-map flight (1.0 if no ship). */
export function starTourShipSpeedMult(): number {
  const ship = shipById(tourShipId());
  return ship ? RARITY_SPEED_MULT[ship.rarity] : 1.0;
}

/** Whether the flown ship is a nose-LESS HOVER craft (GS-ship-fly-orient) — a flying saucer / disc that
 *  glides level and banks rather than pointing a nose along the flight. Drives the app's per-frame body
 *  transform so the disc never tumbles its under-beam out the side. */
export function starTourShipHovers(): boolean {
  const ship = shipById(tourShipId());
  return ship?.look.fly === 'hover';
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

/** The Thor's Hammer cosmetic id (GS-asgard) — winning it on Asgard is what REVEALS the hidden Yggdrasil
 *  on the star map (GS-star-tour-yggdrasil). */
const THOR_HAMMER_ID = 'thors-hammer';

/** Whether the hidden Yggdrasil (the World Tree) is revealed on the chart — only once Thor's Hammer is
 *  owned. Drives both the map glyph and whether the realm overlay can open. */
export function yggdrasilArmed(): boolean {
  return state.ownedApparel.includes(THOR_HAMMER_ID);
}

/** The Star Tour catalogue as plottable worlds, stamped with the player's records. */
export function starTourWorlds(): StarTourWorld[] {
  // GS-story-map: the campaign navigator plots only the CHARTED story worlds (unlocked by chapter), read
  // through the story's own best scores — so the chart fills in as the story advances.
  if (inStoryTour()) {
    const story = state.story!;
    return STORY_WORLDS.filter((w) => storyWorldUnlocked(w, story.chapter)).flatMap((w) => {
      const c = staticCourseSpec(w.courseId);
      if (!c || !c.themeId || !c.archetype) return [];
      const best = story.worldBest[w.courseId];
      return [{
        id: c.id,
        name: c.name,
        archetype: c.archetype,
        tier: c.tier ?? 'testing',
        themeId: c.themeId,
        hasRecord: !!best,
        bestToPar: best?.toPar,
      }];
    });
  }
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

/** The themed fuel glyph for the flown ship (the ship's bridge livery swaps the default ⛽ for its own
 *  cell/plasma/drum glyph). Shared by the HUD's initial paint and app.ts's per-frame gauge refresh. */
function starTourFuelIcon(): string {
  const shipId = tourShipId();
  const hud = hudThemeForShip(shipId);
  const chrome = hudChromeFor(hud.variant, shipById(shipId));
  return chrome?.fuelIcon ?? '⛽';
}

/** The fuel gauge markup for the console's bottom-right readout. Rebuilt in place each rAF frame by
 *  app.ts (`#gs-st-fuel`) so the tank visibly ticks down as fuel burns, without a whole-SVG re-render. */
export function starTourFuelHTML(): string {
  return fuelGaugeHTML(starTourView.fuel, STAR_TOUR_FUEL_CAP, { icon: starTourFuelIcon() });
}

/** The weapon ammo pips for the fire button — one cell per `WEAPON_AMMO_CAP`, lit up to the charges left.
 *  Rebuilt in place each fire by app.ts (`#gs-st-ammo`) so it ticks down without a whole-SVG re-render. */
export function starTourAmmoHTML(): string {
  let cells = '';
  for (let i = 0; i < WEAPON_AMMO_CAP; i++) {
    cells += `<span class="gs-sthud__pip${i < starTourView.ammo ? ' gs-sthud__pip--on' : ''}"></span>`;
  }
  return cells;
}

/** A two-notch THROTTLE lever (GS-star-tour-fuel) for the console speed control — reads the livery
 *  `--hud-*` props so each ship's speed control is its own cockpit colour. The knob rides UP on `fast`
 *  (a `.gs-sthud__speed--fast` class), so the graphic reads the throttle position. */
function throttleSVG(): string {
  return `<svg class="gs-sthud__speed-svg" viewBox="0 0 20 26" aria-hidden="true">
    <rect x="8.4" y="3" width="3.2" height="20" rx="1.6" fill="none" stroke="var(--hud-accent2)" stroke-width="1.2" opacity=".6"/>
    <line x1="10" y1="4.5" x2="10" y2="21.5" stroke="var(--hud-accent)" stroke-width="1" opacity=".35"/>
    <rect class="gs-sthud__speed-knob" x="3.5" y="15" width="13" height="5.5" rx="2.2" fill="var(--hud-accent)"/>
  </svg>`;
}

/** The cockpit HUD (GS-star-tour-hud → GS-star-tour-fuel): the star map reuses the journey bridge HUD
 *  (`.gs-bhud`) so it recolours to the flown ship IDENTICALLY (id → set → standard cyan) and inherits the
 *  same fleet ornaments (title plate = ship name, side rails, corner nodes, wings, deck). A `.gs-bhud--st`
 *  context modifier swaps the travel-only controls for Star Tour's own. Star Tour has no bank/run, so
 *  there is NO exit switch and NO big golfer name plate crowding the console (they used to obscure the
 *  dashboard); the RECORDS board is baked into the top-left "STAR TOUR n/N" link, and the bottom console
 *  is the ship's DASHBOARD: a compact pilot-swap dot, the themed instrument deck, a NORMAL/FAST speed
 *  control in the focal centre slot, and the live FUEL gauge on the right. `pointer-events:none` on the
 *  frame so map scroll/taps pass through — only the console controls catch pointers. */
function stHud(): string {
  const story = inStoryTour();
  const charId = tourCharacterId();
  const ch = charId ? getCharacter(charId) : undefined;
  const shipId = tourShipId();
  const ship = shipById(shipId);
  const accent = ch?.style.cap ?? '#7fe0ff';

  // The livery follows the flown ship, exactly like the travel screen — piped in as `--hud-*` custom
  // properties + a `gs-bhud--<variant>` frame class, plus optional bespoke CHROME (themed deck/ornaments).
  const hud = hudThemeForShip(shipId);
  const chrome = hudChromeFor(hud.variant, ship);

  const total = starTourWorlds().length;
  const played = Object.keys(state.strokePlayBest).length;
  const recordsToggle = starTourView.recordsOpen ? '0' : '1';
  const fast = starTourView.speed === 'fast';
  // The dashboard weapon (GS-star-tour-weapons): a thematically-matched gun for the flown ship, fired from
  // the console. A couple of charges, refilled at any fuel stop. Icon + label tint to the weapon's colours.
  const weapon = shipWeaponFor(shipId);
  const empty = starTourView.ammo <= 0;

  return `
    <div class="gs-bhud gs-bhud--st gs-bhud--${hud.variant}" style="${hudThemeVars(hud)}">
      <div class="gs-bhud__frame" aria-hidden="true">
        <span class="gs-bhud__corner gs-bhud__corner--tl"></span>
        <span class="gs-bhud__corner gs-bhud__corner--tr"></span>
        <span class="gs-bhud__corner gs-bhud__corner--bl"></span>
        <span class="gs-bhud__corner gs-bhud__corner--br"></span>
      </div>
      ${chrome?.frame ?? ''}
      ${
        story
          ? `<button class="gs-bhud__idpod gs-sthud__recordslink" data-action='${JSON.stringify({ type: 'exitStoryMap' })}' title="Back to the clubhouse">
        <span class="gs-bhud__who">‹ <b class="gs-bhud__name">CLUBHOUSE</b></span>
        <span class="gs-bhud__prog">Chapter <b>${state.story!.chapter}</b>/${STORY_CHAPTER_COUNT}</span>
      </button>`
          : `<button class="gs-bhud__idpod gs-sthud__recordslink" data-startour-records="${recordsToggle}" aria-pressed="${starTourView.recordsOpen}" title="Course records">
        <span class="gs-bhud__who">✦ <b class="gs-bhud__name">STAR TOUR</b></span>
        <span class="gs-bhud__prog">🏆 <b>${played}</b>/${total}</span>
      </button>`
      }
      <div class="gs-bhud__statpod">
        <span class="gs-bhud__shards">✦ <b>${story ? state.story!.credits : state.shards}</b></span>
        <button class="gs-bhud__cog" data-open-settings="1" title="Settings" aria-label="Settings">⚙</button>
      </div>
      <div class="gs-bhud__console gs-bhud__console--st">
        <div class="gs-bhud__slot gs-bhud__slot--exit">
          ${
            story || championFreeRoam()
              ? // Story Mode / the developed-champion free-roam reward: the protagonist is FIXED (you are
                // your champion) — the pod is a plain identity dot, never the records-chase golfer swap.
                `<div class="gs-sthud__pilot" title="${ch?.name ?? 'your golfer'}" aria-hidden="true">
            <span class="gs-sthud__pilot-dot" style="background:${accent};"></span>
          </div>`
              : `<button class="gs-sthud__pilot" data-action='{"type":"openStarTour"}' title="Change golfer — ${ch?.name ?? 'pick a pilot'}" aria-label="Change golfer">
            <span class="gs-sthud__pilot-dot" style="background:${accent};"></span>
            <span class="gs-sthud__pilot-swap">⇄</span>
          </button>`
          }
        </div>
        ${chrome?.deck ?? ''}
        <div class="gs-bhud__slot gs-bhud__slot--scan">
          <button class="gs-sthud__speed${fast ? ' gs-sthud__speed--fast' : ''}" data-startour-speed="1" title="Cruise speed — fast is +25% speed and burns 1.5× fuel" aria-pressed="${fast}">
            <span class="gs-sthud__speed-ico">${throttleSVG()}</span>
            <span class="gs-sthud__speed-lbl">${fast ? 'FAST' : 'NORMAL'}</span>
            <span class="gs-sthud__speed-cost">${fast ? '1.5× ⛽' : 'cruise'}</span>
          </button>
        </div>
        <div class="gs-bhud__slot gs-bhud__slot--fire">
          <button class="gs-sthud__fire${empty ? ' gs-sthud__fire--empty' : ''}" id="gs-st-fire" data-startour-fire="1" style="--wpn:${weapon.color};--wpn2:${weapon.color2};" title="Fire ${weapon.name} — ${starTourView.ammo}/${WEAPON_AMMO_CAP} charges (refuel to reload)" aria-label="Fire ${weapon.name}">
            <span class="gs-sthud__fire-ico">${weaponReticleSVG(weapon)}</span>
            <span class="gs-sthud__fire-lbl">${weapon.name}</span>
            <span class="gs-sthud__fire-ammo" id="gs-st-ammo">${starTourAmmoHTML()}</span>
          </button>
        </div>
        <div class="gs-bhud__slot gs-bhud__slot--fuel">
          <div class="gs-sthud__fuel" id="gs-st-fuel">${starTourFuelHTML()}</div>
        </div>
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

/** The bottom dossier for a selected world — flavour, difficulty, your record, weather + play. In STORY
 *  mode (GS-story-map) it reads the campaign's own best, drops the weather picker (story worlds play their
 *  designed sky), and tees off into the campaign (`storyPlayWorld`) instead of a records round. */
function dossier(w: StarTourWorld): string {
  const spec = staticCourseSpec(w.id);
  const story = inStoryTour();
  const sBest = story ? state.story!.worldBest[w.id] : undefined;
  const recordLine = story
    ? sBest
      ? `<span class="gs-st-rec">🏆 Your best: <b style="color:${toParColour(sBest.toPar)};">${formatToPar(sBest.toPar)}</b> <span style="opacity:.7;">(${sBest.strokes} strokes, par ${sBest.par})</span></span>`
      : `<span class="gs-st-rec" style="opacity:.7;">Not yet played — chart a course!</span>`
    : (() => {
        const best = bestStrokeFor(state.strokePlayBest, w.id);
        return best
          ? `<span class="gs-st-rec">🏆 Your best: <b style="color:${toParColour(best.toPar)};">${formatToPar(best.toPar)}</b> <span style="opacity:.7;">(${best.strokes} strokes, par ${best.par})</span></span>`
          : `<span class="gs-st-rec" style="opacity:.7;">No record yet — set the first!</span>`;
      })();
  const cleared = story && worldCleared(state.story!, w.id);
  const shoppable = story && storyWorldShoppable(state.story!, w.id);
  const playAction = story
    ? { type: 'storyPlayWorld', courseId: w.id }
    : { type: 'pickStarTourCourse', courseId: w.id, effect: starTourView.effect };
  const playLabel = story ? (cleared ? 'Play again' : 'Fly here &amp; tee off') : 'Fly here &amp; play 18';
  // GS-story-econ: a cleared, shoppable world offers its Pro Shop right from the dossier.
  const shopBtn = shoppable
    ? `<button class="gs-st-play" style="margin-top:8px;background:linear-gradient(180deg,#2a2416,#1c1810);border-color:#5a4a22;color:#e9c46a;" data-action='${JSON.stringify({ type: 'openStoryShop', worldId: w.id })}'>🛒 Pro Shop</button>`
    : '';
  // GS-story-ship-vendors: a cleared SHIP-VENDOR world also opens its shipyard here (buy ships/upgrades;
  // fly back to re-buy). Only the handful of vendor worlds show it — the galaxy stays a place you travel.
  const yardBtn = cleared && worldIsShipVendor(w.id)
    ? `<button class="gs-st-play" style="margin-top:8px;background:linear-gradient(180deg,#161f2e,#0f1622);border-color:#2f5a7a;color:#7fd8ff;" data-action='${JSON.stringify({ type: 'openStoryShipyard', worldId: w.id })}'>🚀 Shipyard</button>`
    : '';
  // GS-story-caddies: a friend waits at this cleared world — recruit them (once, kept), or see they're aboard.
  const caddyId = story ? worldCaddy(w.id) : undefined;
  const caddyBtn = cleared && caddyId
    ? storyCaddyHired(state.story!, caddyId)
      ? `<div class="gs-st-rec" style="margin-top:8px;color:#7fe0a0;">🎒 ${shopItem(caddyId)?.name ?? 'A friend'} is in your crew</div>`
      : `<button class="gs-st-play" style="margin-top:8px;background:linear-gradient(180deg,#22161f,#170f16);border-color:#6a3a52;color:#f0a8c8;" data-action='${JSON.stringify({ type: 'hireStoryCaddy', worldId: w.id, caddyId })}'>🎒 Recruit ${shopItem(caddyId)?.name ?? 'a friend'} · ✦ ${STORY_CADDY_PRICE}</button>`
    : '';
  return `
    <div class="gs-st-sheet" role="dialog" aria-label="${w.name}">
      <button class="gs-st-sheet__close" data-startour-close="1" aria-label="Close">✕</button>
      <div class="gs-st-sheet__head">
        <h2 class="gs-st-sheet__title">${w.name}</h2>
        <span class="gs-st-tier" style="--tc:${TIER_COL[w.tier]};">${TIER_LABEL[w.tier]}</span>
      </div>
      <p class="gs-st-sheet__blurb">${spec?.blurb ?? ''}</p>
      ${recordLine}
      ${story ? '' : `<div class="gs-st-sheet__wxlabel">Weather sky</div>${weatherPicker()}`}
      <button class="gs-st-play" data-action='${JSON.stringify(playAction)}'>▸ ${playLabel}</button>
      ${shopBtn}
      ${yardBtn}
      ${caddyBtn}
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

/** The Yggdrasil realm-tree overlay (GS-star-tour-yggdrasil): the Nine Realms hanging on the World Tree.
 *  ASGARD is playable (a "Cross the Bifröst" button dispatching `playYggdrasilRealm`); the other eight are
 *  BARE branches — placeholder rows awaiting the realms they'll host, so a new realm is a data flip. */
function yggdrasilSheet(): string {
  const realms = YGGDRASIL_REALMS.map((r) => {
    if (r.playable) {
      return `<div class="gs-st-realm gs-st-realm--open">
        <div class="gs-st-realm__head">
          <span class="gs-st-realm__icon">⚔</span>
          <b class="gs-st-realm__name">${r.name}</b>
          <span class="gs-st-realm__badge">Open</span>
        </div>
        <p class="gs-st-realm__blurb">${r.blurb}</p>
        <button class="gs-st-play" data-action='${JSON.stringify({ type: 'playYggdrasilRealm', realmId: r.id })}'>⚡ Cross the Bifröst &amp; play The Warrior&apos;s Tee</button>
      </div>`;
    }
    return `<div class="gs-st-realm gs-st-realm--locked">
      <div class="gs-st-realm__head">
        <span class="gs-st-realm__icon">🌱</span>
        <b class="gs-st-realm__name">${r.name}</b>
        <span class="gs-st-realm__badge gs-st-realm__badge--soon">Yet to bloom</span>
      </div>
    </div>`;
  }).join('');
  return `
    <div class="gs-st-sheet gs-st-sheet--ygg" role="dialog" aria-label="Yggdrasil — the World Tree">
      <button class="gs-st-sheet__close" data-startour-ygg="0" aria-label="Close">✕</button>
      <div class="gs-st-sheet__head">
        <h2 class="gs-st-sheet__title">🌳 Yggdrasil</h2>
        <span class="gs-st-tier" style="--tc:#7fe0a2;">The World Tree</span>
      </div>
      <p class="gs-st-sheet__blurb">The nine realms hang from the branches of the World Tree. Only Asgard has bloomed — the others await their worlds.</p>
      <div class="gs-st-realms">${realms}</div>
    </div>`;
}

/** The whole Star Tour screen. */
export function starTourScreen(): string {
  const worlds = starTourWorlds();
  const sel = starTourView.selectedId ? worlds.find((w) => w.id === starTourView.selectedId) : undefined;
  // Yggdrasil (the Warrior's Tee off the World Tree) is a Star-Tour/Asgard feature — hidden in the story
  // campaign navigator (the story has its own finale at Yggdrasil's root).
  const armed = !inStoryTour() && yggdrasilArmed();
  const chart = starTourMapSVG({
    seed: `startour:${state.run.seed}`,
    worlds,
    selectedId: sel?.id,
    shipId: tourShipId(),
    shipX: starTourView.shipX ?? undefined,
    shipY: starTourView.shipY ?? undefined,
    shipHeading: starTourView.heading,
    shipFlip: starTourView.flip,
    zoom: starTourView.zoom,
    showYggdrasil: armed,
    yggdrasilSelected: starTourView.yggdrasilOpen,
  });
  const sheet = sel
    ? dossier(sel)
    : starTourView.yggdrasilOpen && armed
    ? yggdrasilSheet()
    : starTourView.recordsOpen
    ? recordsSheet()
    : '';
  return `
    <div class="gs-startour gs-st-space">
      <div class="gs-startour__viewport gs-st-space" id="gs-st-viewport">${chart}</div>
      ${stHud()}
      ${sheet}
    </div>`;
}
