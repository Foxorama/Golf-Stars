/**
 * The journey screen (GS-routes / GS-journey-vertical / GS-fuel / GS-journey-cockpit /
 * GS-journey-map-redesign): the star-chart travel screen, redesigned MAP-FIRST.
 *
 * GS-journey-map-redesign replaces the fixed cockpit's status strip + comparison rail + docked
 * bottom-sheet with a single full-screen star map framed by sticky glass controls:
 *   • ONE-LINE top bar — character name · (voyage) Arc / (endless) Hole · credits · the settings cog.
 *   • The journey MAP fills the entire rest of the screen (panning internally on a long voyage, never a
 *     page scroll — the first stop shows with no scroll at all).
 *   • A BRIDGE HUD (GS-journey-hud) frames the chart like a starship command deck: glowing corner
 *     brackets + a bottom console bezel that houses the 🚪 EXIT door (left) and the 📡 SCANNER command
 *     dial (bottom-CENTRE), with the ⛽ FUEL gauge climbing a right-edge pillar (count on top) that
 *     meets the console at the corner. The whole frame recolours to the flown ship (`hudThemeForShip`)
 *     via `--hud-*` custom properties, so a per-fleet livery is a table row (see `render/hudTheme.ts`).
 *     All absolutely anchored to the map viewport so the frame stays put while the chart pans inside it.
 *   • Tapping a world raises an INFO CARD over the bottom HALF of the screen — the world + weather with
 *     fun lore/history, its Boons & Rewards and Hazards & Conditions laid out clearly, and the Jump
 *     action. Comparing worlds is: tap one, read, tap the next.
 *
 * The `{type:'route'}` / `scanRoutes` / `bank` / `strand` / `buyFuel` reducer actions are UNCHANGED —
 * this is a pure app/render reshape (no reducer/save/rng impact, no `_gs*`/URL hook). See
 * docs/decisions/rpg-meta-loop.md.
 */

import { btn, state } from './ctx';
import { fuelDepotHTML } from './shopScreens';
import type { EventCategory } from '../sim/rpg/events';
import { COURSE_EFFECTS, effectCarryMult, effectFuelDelta, effectWindMult, routeClubFind, routeDifficulty, routeEffect } from '../sim/rpg/effects';
import { rarCol } from '../sim/rpg/loot';
import {
  canScanRoutes,
  canTravel,
  cashOutShards,
  fuelShortfall,
  holeGateArmed,
  routeFuelCost,
  scanFuelCost,
  tankCapacity,
  travelRefuelCost,
} from '../sim/rpg/run';
import type { Route } from '../sim/rpg/run';
import { getFormat } from '../sim/rpg/formats';
import { arcIndexOf } from '../sim/rpg/competition';
import { archetypeFor, themeById } from '../sim/course/themes';
import { journeyMapHTML, type StarmapChoice } from '../render/starmap';
import { skyCoordForName } from '../render/sky-coords';
import { getCharacter } from '../sim/rpg/characters';
import { shipForCharacter } from '../ui/game';
import { fuelGaugeHTML } from '../render/fuel';
import { hudThemeForShip, hudThemeVars } from '../render/hudTheme';

// The travel screen's view-only module state (like shopView.inspectGearId / settingsOpen): which world is
// SELECTED (its detail fills the bottom-half card; a tap on a world picks it, ✕ / another world swaps it),
// and whether the fuel depot / exit-confirm bottom sheets are open. Reset on leaving travel (app.ts) so a
// stale id — route ids repeat 1..3 each stop — can't carry over. Defaults to NO selection so the screen
// opens on the FULL map with no card and no scroll (the user's core ask), not a pre-picked lane.
export const travelView = { selectedRouteId: null as number | null, depotOpen: false, exitOpen: false };

// The destination biome a lane flies into (GS-journey-biome) → a glyph + label + accent for the info
// card, so picking a jump reads as choosing a world, not an unrelated surprise on arrival.
const BIOME_BADGE: Record<string, { glyph: string; label: string; col: string }> = {
  verdant: { glyph: '🌳', label: 'Verdant', col: '#5fd45a' },
  desert: { glyph: '🏜️', label: 'Desert', col: '#e0b15a' },
  frost: { glyph: '❄️', label: 'Frost', col: '#7fd6e6' },
  inferno: { glyph: '🌋', label: 'Inferno', col: '#ff6b4a' },
  void: { glyph: '🌌', label: 'Void', col: '#9a7bd0' },
  crystal: { glyph: '💎', label: 'Crystal', col: '#9fe0f5' },
  tempest: { glyph: '🌪️', label: 'Tempest', col: '#c8b8ff' },
  fungal: { glyph: '🍄', label: 'Jungle', col: '#54dba0' },
  ocean: { glyph: '🌊', label: 'Ocean', col: '#5fd49e' },
  cetus: { glyph: '🐋', label: 'Cetus', col: '#5fd8dc' },
  derelict: { glyph: '🛸', label: 'Derelict', col: '#8fb0c0' },
  swamp: { glyph: '☣️', label: 'Toxic Mire', col: '#9fd84a' },
  metal: { glyph: '🛰️', label: 'Scrap Belt', col: '#d98c4c' },
};

// Fun lore/history for each biome (GS-journey-map-redesign) — a couple of flavour sentences so the info
// card reads as arriving somewhere with a STORY, not just a difficulty stat. Data, self-contained here.
const BIOME_LORE: Record<string, string> = {
  verdant: 'Terraformed millennia ago and never re-wilded, these emerald links breathe easy — the sport’s ancestral home among the stars.',
  desert: 'A sun-scorched world of glass dunes and cactus greens, where the fairways shimmer with heat and every carry is a bargain with the mirage.',
  frost: 'A frozen moon whose polar greens hold a putt like glass. Locals swear the ice remembers every ball that ever crossed it.',
  inferno: 'A volcanic hell-world of cooling lava crust and ember-lit rough. The fairways are young — they were molten last week.',
  void: 'The deep dark between the stars, where island greens hang in nothing and a wayward ball is simply lost to the abyss forever.',
  crystal: 'A shattered gem-world of prismatic spires; light bends strangely here and the greens ring like struck glass underfoot.',
  tempest: 'A storm-wracked gas world where the wind writes the rules. Read the gusts or the gusts read you.',
  fungal: 'A riotous spore-jungle where the rough grows back as you walk it. Bring a machete and a strong short game.',
  ocean: 'An endless water world of dune-linked atolls — true seaside golf, if the sea were bottomless and a mile of it lay between tees.',
  cetus: 'A living ocean-world named for the star-whales that sing beneath its waterfalls of light; its currents pull at ball and mind alike.',
  derelict: 'The gutted hull of the lost starliner “Starlit Wanderer,” drifting dark. You play golf down her bulkhead corridors and across breached decks open to vacuum.',
  swamp: 'A toxic mire of glowing acid pools and neon fog. Beautiful, and quietly trying to dissolve your ball.',
  metal: 'A belt of derelict machinery and rusted hulls — a graveyard of dead ships reforged into corroded, clanging links.',
};

// The functional family of a route event → a short pill label + accent (distinct from the rarity ring).
const EVENT_CATEGORY: Record<EventCategory, { label: string; col: string }> = {
  calm: { label: 'SAFE', col: '#2bb673' },
  payout: { label: 'PAYOUT', col: '#ffce54' },
  toll: { label: 'GAMBLE', col: '#ff8b6b' },
  salvage: { label: 'SALVAGE', col: '#4fd0e0' },
};

// A small pill token (label + accent) — shared across the info card's reward/hazard rows.
function travelChip(txt: string, col: string): string {
  return `<span class="gs-tchip" style="color:${col};border-color:${col}66;">${txt}</span>`;
}

/** Route-event copy, kept honest per format (GS-unending): in the Unending Universe there is no
 *  Stableford cut — an event's `cutDelta` lands as course WILDNESS (`routeDifficulty`) instead, so
 *  its "cut +1" phrasing is rewritten to say what actually happens. Other formats read as authored. */
export function eventDescFor(desc: string): string {
  if (!holeGateArmed(state.run)) return desc;
  return desc.replace(/cut \+\d+/gi, 'wilder course').replace(/cut -\d+/gi, 'calmer course');
}

// ---- per-lane derived facts (shared by the world map + the card) -----------------------------------
interface LaneMeta {
  biome: { glyph: string; label: string; col: string };
  accent: string;
  ring: string;
  cat: { label: string; col: string };
  diff: { t: string; c: string; sev: number };
  fuelCost: number;
  fuelAfter: number;
  travellable: boolean;
  shortfall: number;
}

function laneMeta(r: Route): LaneMeta {
  const ev = r.event;
  const ring = rarCol(ev.rarity);
  const accent = r.elite ? '#ffce54' : ring;
  const biome = BIOME_BADGE[r.theme.archetype] ?? { glyph: '🪐', label: r.theme.archetype, col: '#8aa0c0' };
  const dd = routeDifficulty(ev);
  const diff =
    dd <= -0.1 ? { t: 'Gentler', c: '#2bb673', sev: 0 }
    : dd < 0.07 ? { t: 'Standard', c: '#9fb0cf', sev: 1 }
    : dd < 0.16 ? { t: 'Tougher', c: '#ffb04a', sev: 2 }
    : { t: 'Brutal', c: '#ff6b4a', sev: 3 };
  const fuelCost = routeFuelCost(state.run, r);
  return {
    biome,
    accent,
    ring,
    cat: EVENT_CATEGORY[ev.category],
    diff,
    fuelCost,
    fuelAfter: Math.max(0, state.run.fuel - fuelCost),
    travellable: canTravel(state.run, r),
    shortfall: fuelShortfall(state.run, r),
  };
}

// ---- the selected world's full readout (fills the bottom-half info card) ----------------------------
// All the honest, physics-derived detail, now split into clear BOONS & REWARDS vs HAZARDS & CONDITIONS
// groups, wrapped around fun world/weather lore. Every number is computed from the same tables the physics
// read, so the card can never drift from the course you'll play.
function laneCard(r: Route): string {
  const m = laneMeta(r);
  const ev = r.event;
  const credits = state.run.credits;
  const eff = COURSE_EFFECTS[routeEffect(ev)];

  // Split the levers into the two buckets the player actually thinks in.
  const boons: string[] = [];
  const hazards: string[] = [];

  if (ev.creditMult !== 1) {
    const pct = Math.round((ev.creditMult - 1) * 100);
    (pct >= 0 ? boons : hazards).push(travelChip(`💰 ${pct > 0 ? '+' : ''}${pct}% credits`, pct >= 0 ? '#ffce54' : '#ff8b6b'));
  }
  if (ev.fuelBonus) boons.push(travelChip(`⛽ +${ev.fuelBonus} refuel on arrival`, '#4fd0e0'));
  // A SALVAGE lane's club find is a BLIND gamble (GS-salvage-mystery) — a boon, but preview only the TIER.
  const findRarity = routeClubFind(ev);
  if (findRarity) boons.push(travelChip(`🎁 mystery ${findRarity.toUpperCase()} club`, rarCol(findRarity)));

  // The weather's play hooks (GS-journey-variety wind; GS-journey-fx-2 carry): the sky is a real lever.
  const windMult = effectWindMult(eff.id);
  if (windMult > 1) hazards.push(travelChip(`💨 winds +${Math.round((windMult - 1) * 100)}%`, '#ff8b6b'));
  else if (windMult < 1) boons.push(travelChip(`🍃 still air −${Math.round((1 - windMult) * 100)}%`, '#2bb673'));
  const carryMult = effectCarryMult(eff.id);
  if (carryMult > 1) boons.push(travelChip(`🎈 shots fly +${Math.round((carryMult - 1) * 100)}%`, '#2bb673'));
  else if (carryMult < 1) hazards.push(travelChip(`⚓ shots fly −${Math.round((1 - carryMult) * 100)}%`, '#ff8b6b'));

  if (ev.cutDelta !== 0 && !holeGateArmed(state.run))
    (ev.cutDelta > 0 ? hazards : boons).push(travelChip(`✂ cut ${ev.cutDelta > 0 ? '+' : ''}${ev.cutDelta}`, ev.cutDelta > 0 ? '#ff8b6b' : '#2bb673'));
  if (ev.creditToll) {
    const afford = credits >= ev.creditToll;
    hazards.push(travelChip(`−${ev.creditToll} toll${afford ? '' : ' ⚠'}`, '#ff8b6b'));
  }
  hazards.push(travelChip(`↗ +${r.distanceJump} dist`, '#9fb0cf'));
  // The jump's FUEL bill (GS-fuel-2): ONE tank-before → tank-after chip; any shortfall is priced on the
  // Jump button itself, never a silent surcharge.
  hazards.push(travelChip(`⛽ ${state.run.fuel} → ${m.fuelAfter}`, m.travellable ? '#4fd0e0' : '#ff8b6b'));
  const skyBurn = Math.max(1, r.distanceJump + effectFuelDelta(eff.id)) - Math.max(1, r.distanceJump);
  if (skyBurn < 0) boons.push(travelChip(`🌬 tailwind ${skyBurn} ⛽`, '#2bb673'));
  else if (skyBurn > 0) hazards.push(travelChip(`🌪 headwind +${skyBurn} ⛽`, '#ff8b6b'));
  const ionSave = Math.max(1, r.distanceJump + effectFuelDelta(eff.id)) - m.fuelCost;
  if (ionSave > 0) boons.push(travelChip(`🌀 ion −${ionSave} ⛽`, '#7ff3ff'));

  // The effect's GEOMETRIC play hook (tents / craters / turf patches) — the consequence you'll putt around.
  const playLine = eff.play ? `<div class="gs-card__play">🎯 ${eff.play}</div>` : '';
  const salvageLine = findRarity
    ? `<div class="gs-card__play" style="color:${rarCol(findRarity)};">🎁 A mystery <b>${findRarity.toUpperCase()}</b> club is rolled on arrival — unknown until you commit to the jump.</div>`
    : '';

  // The world + weather LORE (GS-journey-map-redesign): the theme's own blurb, a couple of biome-history
  // sentences, and the weather's flavour — the "fun information" the redesign restores.
  const worldBlurb = r.theme.blurb ? `<span class="gs-card__blurb">${r.theme.blurb}</span> ` : '';
  const biomeLore = BIOME_LORE[r.theme.archetype] ?? '';
  const weatherLore =
    eff.id !== 'none'
      ? `<div class="gs-card__weather">${eff.icon} <b>${eff.label}</b> — <span>${eff.blurb}</span></div>`
      : '';

  const tollWarn =
    ev.creditToll && credits < ev.creditToll
      ? `<div class="gs-card__warn">⚠ You can't cover the ${ev.creditToll}-credit toll (you have ${credits}).</div>`
      : '';
  const fuelWarn = !m.travellable
    ? `<div class="gs-card__warn">⛽ Not enough fuel for this ${m.fuelCost}-unit jump — the missing ${m.shortfall} unit${m.shortfall === 1 ? '' : 's'} cost ${travelRefuelCost(state.run, r)} cr here (you have ${credits}). Pick a shorter jump, tap the fuel gauge to top up, or scan.</div>`
    : '';

  // The Jump action (GS-fuel-2): a short tank prints its refuel bill ON the button. Locked → placeholder.
  const jumpBtn = m.travellable
    ? btn(
        m.shortfall > 0 ? `🚀 Refuel +${m.shortfall} ⛽ & jump (−${travelRefuelCost(state.run, r)} cr)` : `🚀 Jump to ${r.theme.name}`,
        { type: 'route', routeId: r.id },
        { variant: 'primary', block: true, borderColor: m.accent },
      )
    : `<span class="gs-btn gs-btn--block" style="opacity:.4;cursor:not-allowed;text-align:center;">⛽ Out of range — top up or scan</span>`;

  const stakes = [r.bossAhead ? '⚔ boss ahead' : '', r.elite ? '🔥 elite' : ''].filter(Boolean).join(' · ');

  return `
    <div class="gs-travel__card" style="--rs-accent:${m.accent};">
      <button class="gs-travel__cardclose" data-route-close="1" aria-label="Close">✕</button>
      <div class="gs-card__scroll">
        <div class="gs-card__hero">
          <span class="gs-card__glyph" style="border-color:${m.biome.col};">${m.biome.glyph}</span>
          <div class="gs-card__heading">
            <div class="gs-card__sub" style="color:${m.biome.col};">${m.biome.label} · ${ev.label}${stakes ? ` · ${stakes}` : ''}</div>
            <b class="gs-card__name">${r.theme.name}</b>
          </div>
          <span class="gs-tchip gs-tchip--diff" style="color:${m.diff.c};border-color:${m.diff.c}66;">${m.diff.t}</span>
        </div>
        <p class="gs-card__lore">${worldBlurb}${biomeLore}</p>
        <div class="gs-card__desc">${eventDescFor(ev.desc)}</div>
        ${weatherLore}${playLine}${salvageLine}
        <div class="gs-card__groups">
          <div class="gs-card__group">
            <div class="gs-card__glabel" style="color:#7fe3a0;">✦ Boons & Rewards</div>
            <div class="gs-card__chips">${boons.length ? boons.join('') : '<span class="gs-card__none">Nothing extra — a clean jump.</span>'}</div>
          </div>
          <div class="gs-card__group">
            <div class="gs-card__glabel" style="color:#ffb98a;">⚠ Hazards & Conditions</div>
            <div class="gs-card__chips">${hazards.join('')}</div>
          </div>
        </div>
        ${tollWarn}${fuelWarn}
      </div>
      <div class="gs-card__cta">${jumpBtn}</div>
    </div>`;
}

// ---- the one-line top bar (character · progress · credits; the settings cog sits fixed top-right) ----
function topBar(): string {
  const r = state.run;
  const ch = getCharacter(r.loadout.characterId);
  const who = ch ? `<span style="color:${ch.style.cap};">${ch.name}</span>` : 'Voyager';
  const format = getFormat(r.formatId);
  // Voyage → which of the 3 arcs you're climbing; endless → the hole you're up to. The one fact that
  // orients "how deep am I" for the mode being played.
  const progress = format.winnable
    ? `<span class="gs-topbar__prog">🗺️ Arc <b>${arcIndexOf(r.stopIndex) + 1}</b>/3</span>`
    : `<span class="gs-topbar__prog">🕳️ Hole <b>${r.holesSurvived + 1}</b></span>`;
  return `
    <div class="gs-travel__topbar" style="border-left:3px solid ${rarCol(state.course.rarity)};">
      <span class="gs-topbar__who">⛳ ${who}</span>
      ${progress}
      <span class="gs-topbar__credits">💰 <b>${r.credits}</b></span>
    </div>`;
}

export function travelScreen(): string {
  const routeList = state.routes ?? [];
  const r = state.run;
  const anyLane = routeList.some((rt) => canTravel(r, rt));

  // Resolve the selected world: keep the player's pick if still a valid lane, else NONE (the card is
  // hidden and the map shows in full — the default, no-scroll state the user asked for).
  const selRoute = routeList.find((rt) => rt.id === travelView.selectedRouteId) ?? null;
  travelView.selectedRouteId = selRoute?.id ?? null;

  // ---- the star map (GS-routes): three tappable branch worlds across the top → YOU → the trail down
  // to Earth. Tapping a world SELECTS it and raises its info card. ------------------------------------
  const zoneName = themeById(state.course.meta?.themeId ?? '')?.name ?? 'Deep Space';
  const choices: StarmapChoice[] = routeList.map((rt) => ({
    id: rt.id,
    label: rt.event.label,
    icon: rt.event.icon,
    rarity: rt.event.rarity,
    distanceJump: rt.distanceJump,
    archetype: rt.theme.archetype,
    worldName: rt.theme.name,
    effectIcon: COURSE_EFFECTS[routeEffect(rt.event)].icon,
    elite: rt.elite,
    bossAhead: rt.bossAhead,
    locked: !canTravel(r, rt),
    fuelCost: routeFuelCost(r, rt),
    selected: rt.id === travelView.selectedRouteId,
  }));
  const trail = r.history.slice(0, -1).map((h) => {
    const name = themeById(h.themeId ?? '')?.name ?? 'Deep Space';
    const sky = skyCoordForName(name);
    const badge = BIOME_BADGE[archetypeFor(h.themeId, h.biome)];
    return { label: name, ra: sky?.ra, dec: sky?.dec, glyph: badge?.glyph, col: badge?.col };
  });
  const shipId = shipForCharacter(state, r.loadout.characterId);
  const map = journeyMapHTML({
    seed: r.seed,
    stopIndex: r.stopIndex,
    distanceFromStart: r.distanceFromStart,
    currentLabel: zoneName,
    trail,
    choices,
    shipId,
    ionThrusters: (r.loadout.fuelEfficiency ?? 0) > 0,
  });
  // The bridge HUD's livery follows the flown ship (GS-journey-hud) — id → set → the standard cyan
  // console. Piped into the frame as CSS custom properties so a new fleet livery is a table row.
  const hud = hudThemeForShip(shipId);

  // ---- the bridge HUD: a command-console FRAME around the star map (GS-journey-hud). Corner brackets
  // wrap the chart; a bottom console bezel houses the EXIT door (left) + the SCANNER (centre command
  // dial); the full FUEL gauge climbs a right-edge pillar that meets the console at the corner. All
  // absolutely anchored to the map viewport so the frame stays put while the chart pans inside it. -----
  const scanCost = scanFuelCost(r);
  const scanner = canScanRoutes(r)
    ? `<button class="gs-travel__scan" data-action='${JSON.stringify({ type: 'scanRoutes' })}' title="Scan for closer worlds (−${scanCost} ⛽)" aria-label="Scan for new routes, costs ${scanCost} fuel"><span class="gs-travel__scan-ico">📡</span><span class="gs-travel__scan-lbl">SCAN</span><span class="gs-travel__scan-cost">−${scanCost}⛽</span></button>`
    : `<button class="gs-travel__scan gs-travel__scan--off" disabled title="Not enough fuel to scan" aria-label="Scanner offline — needs ${scanCost + 1} fuel"><span class="gs-travel__scan-ico">📡</span><span class="gs-travel__scan-lbl">SCAN</span><span class="gs-travel__scan-cost">${scanCost + 1}⛽</span></button>`;

  // The fuel pillar doubles as the depot button (tap → buy fuel).
  const fuelRail = `<button class="gs-travel__fuel" data-depot="toggle" title="Fuel — tap to top up" aria-label="Fuel gauge — tap to open the fuel depot">${fuelGaugeHTML(r.fuel, tankCapacity(r), { vertical: true })}</button>`;

  // The exit: bank now and return to port. Offered once underway (there are shards to bank) OR when
  // stranded (the only way out). A tap opens the confirm sheet rather than ending the run on one touch.
  const canExit = r.stopIndex > 0 || !anyLane;
  const exit = canExit
    ? `<button class="gs-travel__exit" data-exit-confirm="1" title="End the run and bank" aria-label="End the run and bank your credits"><span class="gs-travel__exit-ico">🚪</span><span class="gs-travel__exit-lbl">EXIT</span></button>`
    : '';

  // Assemble the frame: decorative corner brackets (aria-hidden) + the L-shaped console (bottom bezel +
  // right fuel pillar). `pointer-events` is off on the frame so map taps pass through; only the console
  // controls catch touches. The whole thing recolours to the ship via the `--hud-*` custom properties.
  const hudFrame = `
    <div class="gs-hud gs-hud--${hud.variant}" style="${hudThemeVars(hud)}">
      <div class="gs-hud__frame" aria-hidden="true">
        <span class="gs-hud__corner gs-hud__corner--tl"></span>
        <span class="gs-hud__corner gs-hud__corner--tr"></span>
        <span class="gs-hud__corner gs-hud__corner--bl"></span>
        <span class="gs-hud__corner gs-hud__corner--br"></span>
      </div>
      <div class="gs-hud__console">
        <div class="gs-hud__slot gs-hud__slot--exit">${exit}</div>
        <div class="gs-hud__slot gs-hud__slot--scan">${scanner}</div>
      </div>
      <div class="gs-hud__fueldock">${fuelRail}</div>
    </div>`;

  // ---- the bottom-half overlays (mutually exclusive, priority: exit-confirm > depot > world card) ----
  let sheet = '';
  if (travelView.exitOpen) {
    const cashOut = cashOutShards(r);
    const stranded = !anyLane;
    // Stranded → the FORCED end (endedReason 'stranded'), whatever the depth. A voluntary exit (a lane is
    // still payable — only offered past stop 0) is the push-your-luck BANK cash-out. Preserves the exact
    // prior semantics: `strand` was always the stranded lifeline, `bank` the voluntary one.
    const endAction = stranded ? { type: 'strand' as const } : { type: 'bank' as const };
    const endLabel = stranded ? '🆘 Abandon ship' : `✦ Bank${cashOut > 0 ? ` +${cashOut}` : ''} & end run`;
    sheet = `
      <div class="gs-travel__sheet">
        <button class="gs-travel__cardclose" data-exit-confirm="0" aria-label="Close">✕</button>
        <div class="gs-sheet__body">
          <div class="gs-sheet__title">${stranded ? '🆘 Stranded in deep space' : '🚪 End the voyage here?'}</div>
          <p class="gs-sheet__note">${
            stranded
              ? `No jump you can afford — the tank holds <b>${r.fuel}</b> ⛽. Cash out what you've earned and head home${canScanRoutes(r) ? ', or burn a cell to scan for closer worlds.' : '.'}`
              : `Return to port now and lock <b style="color:var(--gs-warn);">${r.credits}</b> credits in${cashOut > 0 ? ` as <b style="color:#c9a0ff;">+${cashOut}</b> permanent Star Shards` : ''}. Push deeper and bust, and they're forfeit.`
          }</p>
          <div class="gs-sheet__actions">
            ${btn(endLabel, endAction, { variant: 'primary', block: true, borderColor: '#ff8b6b' })}
            ${stranded && canScanRoutes(r) ? `<button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'scanRoutes' })}'>📡 Scan (−${scanCost} ⛽)</button>` : ''}
          </div>
        </div>
      </div>`;
  } else if (travelView.depotOpen) {
    sheet = `
      <div class="gs-travel__sheet">
        <button class="gs-travel__cardclose" data-depot="toggle" aria-label="Close">✕</button>
        <div class="gs-sheet__body">${fuelDepotHTML()}</div>
      </div>`;
  } else if (selRoute) {
    sheet = laneCard(selRoute);
  }

  // A one-shot note after the Asgard interlude (GS-asgard): the Rainbow Ball is spent; cleared on jump.
  const asgardBanner = state.asgardBanner
    ? `<div class="gs-travel__asgard" style="border-color:${state.asgardBanner === 'won' ? 'rgba(255,210,110,0.45)' : 'var(--gs-line-2)'};background:${state.asgardBanner === 'won' ? 'rgba(255,210,110,0.1)' : 'transparent'};">
         ${state.asgardBanner === 'won'
           ? "🏆 <b style=\"color:#ffd97a;\">You conquered Asgard!</b> Thor's Hammer awaits in your Clubhouse, and Odin's Favour rides with you."
           : '⚡ <b>The Bifröst fades.</b> The Rainbow Ball is spent; your worlds are true once more.'}
       </div>`
    : '';

  return `
    <div class="gs-travel gs-travel--map">
      ${topBar()}
      <div class="gs-travel__viewport">
        <div class="gs-travel__map">${map}</div>
        ${asgardBanner}
        ${hudFrame}
        ${sheet}
      </div>
    </div>`;
}
