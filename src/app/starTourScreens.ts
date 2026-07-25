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
import { COURSE_EFFECTS, effectCarryMult, effectWindMult, type CourseEffectId } from '../sim/rpg/effects';
import { starTourMapSVG, SHIP_DOCK_HEADING, YGGDRASIL_REALMS, type StarTourWorld } from '../render/starTourMap';
import { bestStrokeFor, bestStrokeRounds } from '../sim/rpg/strokePlay';
import { STORY_WORLDS, storyWorldUnlocked, storyWorldEffect, STORY_CHAPTER_COUNT, worldCleared } from '../sim/rpg/story';
import { storyWorldNav, storyWorldMarker, type StoryWorldNav } from '../sim/rpg/storyMapNav';
import { qualifyTop } from '../sim/rpg/storyQualifiers';
import { qualifierPartnerPool } from '../sim/rpg/storyQualifierFormats';
import { tournamentRival } from '../sim/rpg/storyTournaments';
import { storyWorldShoppable, worldHasShop } from '../sim/rpg/storyShop';
import { worldIsShipVendor } from '../sim/rpg/storyShips';
import { ownedCategoryCount } from '../sim/rpg/storyShipUpgrades';
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
import { tourWeaponFor, weaponReticleSVG } from '../render/shipWeapons';

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
  /** GS-story-qualifier-partner-pick: the tour-mate the player picked to play a PAIRED qualifying event
   *  beside, keyed by world id (so each event on the chart remembers its own pick). View-only, like
   *  `effect` — carried onto the run in the tee-off action, never persisted; an absent entry means "the
   *  draw's suggestion", which is what the plan falls back to. */
  qualifierPartnerBy: {} as Record<string, string>,
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

/** The weather skies offered on the star map — the full atmospheric palette, GROUND-mark skies
 *  included (GS-weather-depth: patches/craters are seeded off the hole geometry, so a chosen sky is
 *  the same fair, repeatable test every round — a record under acid rain is comparable to every other
 *  acid-rain round). Only the trade camp is excluded: a record decided by a tent bounce reads as a
 *  gimmick, not weather. Ordered calm → wild. */
export const STAR_TOUR_WEATHERS: readonly CourseEffectId[] = [
  'none',
  'moonlight',
  'nebula',
  'eclipse',
  'aurora',
  'radiant',
  'comet',
  'solarWind',
  'gravityWell',
  'darkMatter',
  'frostfall',
  'spaceJunk',
  'meteorShower',
  'dustStorm',
  'solarStorm',
  'acidRain',
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
      // GS-story-map-nav: stamp the campaign MARKER so quests / qualifiers / the Sigil venue are findable
      // straight off the chart (the top pill + a qualifier bottom flag), not only via the clubhouse.
      const nav = storyWorldNav(story, w.courseId);
      return [{
        id: c.id,
        name: c.name,
        archetype: c.archetype,
        tier: c.tier ?? 'testing',
        themeId: c.themeId,
        hasRecord: !!best,
        bestToPar: best?.toPar,
        // GS-star-map-services: mark where the player can outfit — the 5 ship-vendor SHIPYARD worlds
        // (🚀 buy ships/weapons — the key differentiator) and any world with a PRO SHOP (🛒 clubs/gear).
        hasShipyard: worldIsShipVendor(w.courseId),
        hasProShop: worldHasShop(w.courseId),
        storyMarker: storyWorldMarker(nav),
        qualifierFlag: nav.qualifier ? (nav.qualifier.qualified ? 'qualified' : 'open') : undefined,
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
  const weapon = tourWeaponFor(shipId, state.story?.ownedShipUpgradeIds);
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

/** A read-only weather INFO line (GS-weather-depth): the sky's icon + name + its PLAY consequence —
 *  wind/carry chips computed off the SAME physics tables the sim reads (so they can never drift) plus
 *  the geometric play hook (craters / patches / tents). Makes a world's weather a READABLE part of the
 *  test instead of an invisible multiplier — the Story dossier's designed-sky row and the free-roam
 *  picker's selected-sky readout both use it. '' for clear skies. */
function weatherInfoHTML(effectId: string): string {
  const e = COURSE_EFFECTS[effectId as CourseEffectId];
  if (!e || e.id === 'none') return '';
  const chips: string[] = [];
  const wind = effectWindMult(e.id);
  const carry = effectCarryMult(e.id);
  if (wind !== 1) chips.push(wind > 1 ? `💨 winds +${Math.round((wind - 1) * 100)}%` : `🍃 still air −${Math.round((1 - wind) * 100)}%`);
  if (carry !== 1) chips.push(carry > 1 ? `🎈 shots fly +${Math.round((carry - 1) * 100)}%` : `⚓ shots fly −${Math.round((1 - carry) * 100)}%`);
  if (e.play) chips.push(`🎯 ${e.play}`);
  const detail = chips.length ? `<br><span style="opacity:.85;">${chips.join(' &nbsp;·&nbsp; ')}</span>` : '';
  return `<div class="gs-st-rec" style="margin-top:6px;display:block;">${e.icon} <b>${e.label}</b> — <span style="opacity:.8;">${e.blurb}</span>${detail}</div>`;
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

/**
 * GS-story-qualifier-partner-pick: the partner PICKER for a paired qualifying event — the three tour-mates
 * as chips, the chosen one ringed, mirroring the team-Sigil lobby's picker. The draw sets the format and
 * the pairing; WHO plays it beside you is your call, which is what makes the partner tally (and so the
 * betrayal it feeds) a record of your choices rather than of the dice. Tapping a chip writes the view-only
 * override and re-renders in place; the tee-off action carries it onto the run.
 */
function qualifierPartnerPickerHTML(worldId: string, selectedId: string): string {
  const story = state.story;
  if (!story) return '';
  const chips = qualifierPartnerPool(story)
    .map((p) => {
      const on = p.id === selectedId;
      return `<button class="gs-st-wx${on ? ' gs-st-wx--on' : ''}" data-startour-qpartner="${p.id}" data-startour-qworld="${worldId}"
          aria-label="Play this event with ${p.name}">${on ? '✓ ' : ''}${p.name}</button>`;
    })
    .join('');
  return `<div style="margin-top:8px;">
      <div style="font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#8fd0e8;">🤝 Your partner — you choose</div>
      <div class="gs-st-wxrow" style="margin-top:4px;">${chips}</div>
    </div>`;
}

/** Ordinal suffix for a finishing place (1st, 2nd, 3rd, 11th…). */
function ordinalPlace(n: number): string {
  const v = n % 100;
  const s = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

/**
 * GS-story-map-nav: the campaign-navigation sections for a world's dossier — the SIGIL venue call-to-action,
 * an ally QUEST (accept & fly / go play / a "soon" hint), and the QUALIFYING-event status line. These make
 * the three campaign pulls actionable straight from the star chart instead of only via the clubhouse. Empty
 * for an ordinary world / the free-roam records chase (`nav` undefined).
 */
function storyNavSectionsHTML(w: StarTourWorld, nav: StoryWorldNav | undefined): string {
  if (!nav) return '';
  let out = '';

  // ── The Sigil TOURNAMENT venue — fly here and tee off the major directly (GS-story-map-nav). ──
  if (nav.venue) {
    const v = nav.venue;
    const t = v.tournament;
    // GS-story-sigil-rivals: name the EFFECTIVE rival (the betrayal-arc friend on the back-half Sigils).
    const rival = tournamentRival(t, state.story).name.split(' ')[0];
    if (v.ready) {
      out += `
        <div class="gs-st-rec" style="margin-top:10px;padding:10px 12px;background:linear-gradient(180deg,#2a2410,#1c1808);border:1px solid #6a5320;border-radius:10px;">
          <div style="font-size:13px;font-weight:800;color:#ffe6a6;">🏆 ${t.name} — you're qualified</div>
          <div style="font-size:11.5px;color:#d8c089;font-weight:600;margin-top:2px;">Play for ${t.sigilName} · beat your rival ${rival}</div>
        </div>
        <button class="gs-st-play" style="margin-top:8px;background:linear-gradient(180deg,#3a2c08,#231a06);border-color:#8a6a20;color:#ffe6a6;" data-action='${JSON.stringify({ type: 'openStoryTournament' })}'>⚔ Enter ${t.name}</button>`;
    } else if (v.won) {
      out += `<div class="gs-st-rec" style="margin-top:10px;color:#9dffce;">🏆 ${t.sigilName} won here — the Sigil is yours.</div>`;
    } else {
      const need = Math.max(1, v.needed - v.qualifiersMet);
      out += `<div class="gs-st-rec" style="margin-top:10px;padding:10px 12px;background:#181510;border:1px solid #3a3320;border-radius:10px;color:#d8c089;">
        🔒 <b style="color:#ffe6a6;">${t.name}</b> — the Sigil major. Finish top ${qualifyTop(t.chapter)} in <b>${need}</b> more qualifying ${need === 1 ? 'event' : 'events'} this chapter to earn your start.</div>`;
    }
  }

  // ── An ally SIDE QUEST that plays HERE — accept & fly / go play / a "soon" hint (GS-story-map-nav). ──
  if (nav.quest) {
    const q = nav.quest;
    const reward = `
      <div style="margin:8px 0 0;background:#181322;border:1px solid #3a2f4a;border-left:3px solid #a97b25;border-radius:10px;padding:7px 11px;">
        <div style="font-size:12px;font-weight:800;color:#f0c874;">🎁 ${q.rewardName}</div>
        ${q.rewardEffect ? `<div style="font-size:11px;font-weight:700;color:#7fe0a0;margin-top:2px;">✦ ${q.rewardEffect}</div>` : ''}
      </div>`;
    if (q.state === 'offerable') {
      out += `
        <div style="margin-top:10px;padding:11px 13px;background:linear-gradient(180deg,#1e1630,#140e1e);border:1px solid #5a3f8a;border-radius:12px;">
          <div style="font-size:13px;font-weight:800;color:#d6c2ff;">🗺 ${q.title} — with ${q.giver}</div>
          <div style="font-size:11.5px;color:#b6a8d6;margin-top:3px;line-height:1.4;">${q.hook}</div>
          ${reward}
        </div>
        <button class="gs-st-play" style="margin-top:8px;background:linear-gradient(180deg,#2a1e44,#1a1230);border-color:#7a5ab0;color:#e2d4ff;" data-action='${JSON.stringify({ type: 'storyStartQuest', courseId: w.id })}'>🎒 Accept &amp; play with ${q.giver} — 9 holes</button>`;
    } else if (q.state === 'active') {
      out += `
        <div style="margin-top:10px;padding:11px 13px;background:linear-gradient(180deg,#1e1630,#140e1e);border:1px solid #7a5ab0;border-radius:12px;">
          <div style="font-size:13px;font-weight:800;color:#e2d4ff;">🗺 ${q.title} — your active quest</div>
          <div style="font-size:11.5px;color:#c6b8e6;margin-top:3px;line-height:1.4;">${q.hook}</div>
          ${reward}
        </div>
        <button class="gs-st-play" style="margin-top:8px;background:linear-gradient(180deg,#2a1e44,#1a1230);border-color:#9a7ad0;color:#f0e6ff;" data-action='${JSON.stringify({ type: 'storyStartQuest', courseId: w.id })}'>▸ Play the quest with ${q.giver} — 9 holes</button>`;
    } else {
      out += `<div class="gs-st-rec" style="margin-top:10px;color:#9a8fb8;">🎒 ${q.giver} has something to show you here — carry their bag a round, then fly on, and they'll open up.</div>`;
    }
  }

  // ── QUALIFYING-event status: what to shoot for, and where you stand (GS-story-map-nav). ──
  if (nav.qualifier) {
    const qu = nav.qualifier;
    const verdict = qu.qualified
      ? `<span style="color:#7fe0a0;font-weight:800;">✓ Qualified</span>${qu.place ? ` <span style="opacity:.75;">(best ${ordinalPlace(qu.place)})</span>` : ''}`
      : qu.place !== undefined
      ? `<span style="color:#ffb0b0;font-weight:700;">not yet</span> <span style="opacity:.75;">(best ${ordinalPlace(qu.place)} — replay to improve)</span>`
      : `<span style="opacity:.75;">not yet played</span>`;
    // GS-story-qualifier-formats: the DRAW SHEET, shown before you fly — the shape and the length.
    // GS-story-qualifier-partner-pick: and, on a paired event, a PICKER for who plays it beside you. The
    // draw sets the format and the pairing; the company is your call, exactly as it is for a team Sigil.
    const bar = qu.matchplay ? 'win or halve the match to qualify' : `finish top ${qu.top} of ${qu.field} to qualify`;
    out += `<div class="gs-st-rec" style="margin-top:10px;padding:9px 12px;background:#0c1a22;border:1px solid #234a5a;border-radius:10px;color:#bfe6f5;">
      🏁 <b>Qualifying event</b> · ${bar} — ${verdict}
      <div style="margin-top:6px;font-size:11.5px;color:#8fd0e8;">🎲 <b>${qu.formatName}</b> · ${qu.holes} holes</div>
      ${qu.formatBlurb ? `<div style="margin-top:3px;font-size:11.5px;color:#9ab8c8;line-height:1.4;">${qu.formatBlurb}</div>` : ''}
      ${qu.partnerId ? qualifierPartnerPickerHTML(w.id, qu.partnerId) : ''}</div>`;
  }

  return out;
}

/** The bottom dossier for a selected world — flavour, difficulty, your record, weather + play. In STORY
 *  mode (GS-story-map) it reads the campaign's own best, swaps the weather PICKER for a read-only row
 *  showing the world's DESIGNED sky + its play consequence (GS-weather-depth), and tees off into the
 *  campaign (`storyPlayWorld`) instead of a records round. */
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
  // GS-story-map-nav: the campaign status for this world (quest / qualifier / Sigil venue), stamped as
  // actionable dossier sections so the three pulls are reachable straight from the chart.
  const nav = story ? storyWorldNav(state.story!, w.id, starTourView.qualifierPartnerBy[w.id]) : undefined;
  const navSections = storyNavSectionsHTML(w, nav);
  const playAction = story
    ? // GS-story-qualifier-partner-pick: carry the chosen tour-mate onto the run (validated in the plan,
      // so an unpicked event simply tees off with the draw's suggestion).
      { type: 'storyPlayWorld', courseId: w.id, ...(starTourView.qualifierPartnerBy[w.id] ? { partnerId: starTourView.qualifierPartnerBy[w.id] } : {}) }
    : { type: 'pickStarTourCourse', courseId: w.id, effect: starTourView.effect };
  // The plain world round is a secondary "practice" at a Sigil venue (the tournament is the headline CTA
  // above); at a qualifying event it's the qualifying round itself, so it says so.
  const playLabel = !story
    ? 'Fly here &amp; play 18'
    : nav?.venue?.ready
    ? 'Practice round — no Sigil'
    : nav?.qualifier
    ? cleared
      ? 'Replay this qualifying event'
      : 'Fly here &amp; tee off — qualifying event'
    : cleared
    ? 'Play again'
    : 'Fly here &amp; tee off';
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
  // GS-story-quality (GAP1): on the Herald path the Warden friends are rivals to crush, not recruits — hide
  // the recruit offer (an already-recruited pre-Choice friend still reads as "in your crew").
  const canRecruit = state.story?.alignment !== 'herald';
  const caddyBtn = cleared && caddyId
    ? storyCaddyHired(state.story!, caddyId)
      ? `<div class="gs-st-rec" style="margin-top:8px;color:#7fe0a0;">🎒 ${shopItem(caddyId)?.name ?? 'A friend'} is in your crew</div>`
      : canRecruit
        ? `<button class="gs-st-play" style="margin-top:8px;background:linear-gradient(180deg,#22161f,#170f16);border-color:#6a3a52;color:#f0a8c8;" data-action='${JSON.stringify({ type: 'hireStoryCaddy', worldId: w.id, caddyId })}'>🎒 Recruit ${shopItem(caddyId)?.name ?? 'a friend'} · ✦ ${STORY_CADDY_PRICE}</button>`
        : ''
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
      ${story ? weatherInfoHTML(storyWorldEffect(w.id)) : ''}
      ${navSections}
      ${story ? '' : `<div class="gs-st-sheet__wxlabel">Weather sky</div>${weatherPicker()}${weatherInfoHTML(starTourView.effect)}`}
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
    // GS-story-ship-interior: in the Story campaign the ship is tappable → board it (manage the loadout on
    // the go). Star Tour proper leaves it inert decor.
    shipTappable: inStoryTour(),
    // GS-story-quality: draw mounted gun pods for the campaign's installed WEAPON upgrades, so arming up at
    // the shipyard visibly changes the ship on the chart (Star Tour proper has no upgrades → bare hull).
    shipWeaponLevel: inStoryTour() && state.story ? ownedCategoryCount(state.story, 'weapon') : 0,
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
