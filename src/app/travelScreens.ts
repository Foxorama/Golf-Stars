/**
 * The journey screen (GS-routes / GS-journey-vertical / GS-fuel / GS-journey-cockpit): the star-chart
 * travel screen, redesigned as ONE fixed-viewport cockpit — a compact status strip, the star map filling
 * the screen (panning internally, never forcing a page scroll), and a docked control bar that carries the
 * three lanes as an at-a-glance COMPARISON RAIL, the selected lane's full bet, and the jump/scan/depot/bank
 * actions all in reach. Selecting a lane is INLINE (tap a world or a rail cell → the dock swaps in place),
 * so comparing three options is three taps with zero windows to open and close. (GS-journey-cockpit replaced
 * the old vertical stack + per-lane bottom-sheet modal — see docs/decisions/rpg-meta-loop.md.)
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
import { archetypeFor, themeById } from '../sim/course/themes';
import { journeyMapHTML, type StarmapChoice } from '../render/starmap';
import { skyCoordForName } from '../render/sky-coords';
import { getCharacter } from '../sim/rpg/characters';
import { shipForCharacter } from '../ui/game';
import { fuelGaugeHTML } from '../render/fuel';

// The travel screen's view-only module state (like shopView.inspectGearId / settingsOpen): which lane is
// SELECTED (its detail fills the dock; a tap on a world or rail cell picks it) and whether the fuel depot
// is expanded. Reset on leaving travel (app.ts) so a stale id — route ids repeat 1..3 each stop — can't
// carry over. `selectedRouteId` replaces the old modal `inspectRouteId`: selection is now inline, not a sheet.
export const travelView = { selectedRouteId: null as number | null, depotOpen: false };

// The destination biome a lane flies into (GS-journey-biome) → a glyph + label + accent for the route
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
};

// The functional family of a route event → a short pill label + accent (distinct from the rarity ring).
const EVENT_CATEGORY: Record<EventCategory, { label: string; col: string }> = {
  calm: { label: 'SAFE', col: '#2bb673' },
  payout: { label: 'PAYOUT', col: '#ffce54' },
  toll: { label: 'GAMBLE', col: '#ff8b6b' },
  salvage: { label: 'SALVAGE', col: '#4fd0e0' },
};

// A small pill token (label + accent) — shared by the dock detail + the comparison rail.
function travelChip(txt: string, col: string): string {
  return `<span style="display:inline-block;font-size:11.5px;font-weight:700;color:${col};border:1px solid ${col}66;border-radius:5px;padding:1px 7px;white-space:nowrap;">${txt}</span>`;
}

/** Route-event copy, kept honest per format (GS-unending): in the Unending Universe there is no
 *  Stableford cut — an event's `cutDelta` lands as course WILDNESS (`routeDifficulty`) instead, so
 *  its "cut +1" phrasing is rewritten to say what actually happens. Other formats read as authored. */
export function eventDescFor(desc: string): string {
  if (!holeGateArmed(state.run)) return desc;
  return desc.replace(/cut \+\d+/gi, 'wilder course').replace(/cut -\d+/gi, 'calmer course');
}

// ---- per-lane derived facts (shared by the rail + the detail) --------------------------------------
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

// ---- the comparison rail: three lanes side-by-side, tap to select ----------------------------------
// The user's core ask — compare all three at a glance without opening a window per option. Each cell reads
// the world (biome glyph + name), its difficulty (a coloured severity bar), and the two numbers that decide
// the bet (⛽ fuel bill + credit swing), with ⚔/🔥 stakes flagged. The whole cell is `data-route-inspect`
// (the same tap target the map worlds use) so tapping it selects the lane and the dock detail swaps in place.
function laneCell(r: Route, selected: boolean): string {
  const m = laneMeta(r);
  const ev = r.event;
  const name = r.theme.name.length > 13 ? `${r.theme.name.slice(0, 12)}…` : r.theme.name;
  const pct = ev.creditMult !== 1 ? Math.round((ev.creditMult - 1) * 100) : 0;
  const creditTag = pct !== 0 ? `<span style="color:${pct > 0 ? '#ffce54' : '#ff8b6b'};font-weight:700;">${pct > 0 ? '+' : ''}${pct}%</span>` : '';
  const fuelTag = `<span style="color:${m.travellable ? '#4fd0e0' : '#ff6b4a'};font-weight:700;">⛽${m.fuelCost}${m.travellable ? '' : '✕'}</span>`;
  const stakes = [r.bossAhead ? '⚔' : '', r.elite ? '🔥' : ''].filter(Boolean).join('');
  // A 4-segment severity bar so difficulty reads without words at rail size.
  const bar = [0, 1, 2, 3]
    .map((i) => `<span style="flex:1;height:3px;border-radius:2px;background:${i <= m.diff.sev ? m.diff.c : '#ffffff18'};"></span>`)
    .join('');
  const cls = `gs-lane${selected ? ' gs-lane--sel' : ''}${m.travellable ? '' : ' gs-lane--locked'}`;
  return `
    <button class="${cls}" data-route-inspect="${r.id}" style="--lane:${m.accent};" aria-pressed="${selected}">
      <span class="gs-lane__top">
        <span class="gs-lane__glyph" style="border-color:${m.biome.col};">${m.biome.glyph}</span>
        <b class="gs-lane__name">${name}</b>
        ${stakes ? `<span class="gs-lane__stakes">${stakes}</span>` : ''}
      </span>
      <span class="gs-lane__bar">${bar}</span>
      <span class="gs-lane__foot">${fuelTag}${creditTag}</span>
    </button>`;
}

// ---- the selected lane's full readout (fills the dock detail zone) ----------------------------------
// All the honest, physics-derived detail that used to live in the bottom-sheet, now docked and compact: the
// world + difficulty, the levers as tokens (credits / wind / carry / fuel bill / salvage), the sky effect's
// real play hook, and any toll/fuel warning. Computed from the same tables the physics read, so the card can
// never drift from the course you'll play.
function laneDetail(r: Route): string {
  const m = laneMeta(r);
  const ev = r.event;
  const credits = state.run.credits;
  const eff = COURSE_EFFECTS[routeEffect(ev)];

  const tags: string[] = [];
  if (ev.creditMult !== 1) {
    const pct = Math.round((ev.creditMult - 1) * 100);
    tags.push(travelChip(`${pct > 0 ? '+' : ''}${pct}% credits`, pct >= 0 ? '#ffce54' : '#ff8b6b'));
  }
  if (ev.cutDelta !== 0 && !holeGateArmed(state.run))
    tags.push(travelChip(`cut ${ev.cutDelta > 0 ? '+' : ''}${ev.cutDelta}`, ev.cutDelta > 0 ? '#ff8b6b' : '#2bb673'));
  if (ev.creditToll) {
    const afford = credits >= ev.creditToll;
    tags.push(travelChip(`−${ev.creditToll} toll${afford ? '' : ' ⚠'}`, '#ff8b6b'));
  }
  // The weather's play hooks (GS-journey-variety wind; GS-journey-fx-2 carry): the sky is a real lever —
  // say EXACTLY what it does to your golf, computed from the same tables the physics read.
  const windMult = effectWindMult(eff.id);
  if (windMult > 1) tags.push(travelChip(`💨 winds +${Math.round((windMult - 1) * 100)}%`, '#ff8b6b'));
  else if (windMult < 1) tags.push(travelChip(`🍃 still air −${Math.round((1 - windMult) * 100)}%`, '#2bb673'));
  const carryMult = effectCarryMult(eff.id);
  if (carryMult > 1) tags.push(travelChip(`🎈 shots fly +${Math.round((carryMult - 1) * 100)}%`, '#2bb673'));
  else if (carryMult < 1) tags.push(travelChip(`⚓ shots fly −${Math.round((1 - carryMult) * 100)}%`, '#ff8b6b'));
  tags.push(travelChip(`↗ +${r.distanceJump} dist`, '#9fb0cf'));
  // The jump's FUEL bill (GS-fuel-2): ONE tank-before → tank-after chip; any shortfall is priced on the
  // Jump button itself, never a silent surcharge.
  tags.push(travelChip(`⛽ ${state.run.fuel} → ${m.fuelAfter}`, m.travellable ? '#4fd0e0' : '#ff8b6b'));
  const skyBurn = Math.max(1, r.distanceJump + effectFuelDelta(eff.id)) - Math.max(1, r.distanceJump);
  if (skyBurn < 0) tags.push(travelChip(`🌬 tailwind ${skyBurn} ⛽`, '#2bb673'));
  else if (skyBurn > 0) tags.push(travelChip(`🌪 headwind +${skyBurn} ⛽`, '#ff8b6b'));
  const ionSave = Math.max(1, r.distanceJump + effectFuelDelta(eff.id)) - m.fuelCost;
  if (ionSave > 0) tags.push(travelChip(`🌀 ion −${ionSave} ⛽`, '#7ff3ff'));
  if (ev.fuelBonus) tags.push(travelChip(`⛽ +${ev.fuelBonus} arrival`, '#4fd0e0'));

  // A SALVAGE lane's club find is a BLIND gamble (GS-salvage-mystery) — preview only the TIER.
  const findRarity = routeClubFind(ev);
  const salvageLine = findRarity
    ? `<div style="font-size:12px;margin:6px 0 0;color:${rarCol(findRarity)};font-weight:600;">🎁 Mystery <b>${findRarity.toUpperCase()}</b> club — rolled on arrival, unknown until you commit.</div>`
    : '';
  // The effect's GEOMETRIC play hook (tents / craters / turf patches) — the consequence you'll putt around.
  const playLine = eff.play ? `<div style="font-size:12px;margin:6px 0 0;color:#ffce54;font-weight:600;">🎯 ${eff.play}</div>` : '';
  const effLine =
    eff.id !== 'none'
      ? `<div style="font-size:12.5px;margin:6px 0 0;opacity:.9;">${eff.icon} <b>${eff.label}</b> · <span style="opacity:.7;">${eff.blurb}</span></div>`
      : '';

  const tollWarn =
    ev.creditToll && credits < ev.creditToll
      ? `<div class="gs-dock__warn">⚠ You can't cover the ${ev.creditToll}-credit toll (you have ${credits}).</div>`
      : '';
  const fuelWarn = !m.travellable
    ? `<div class="gs-dock__warn">⛽ Not enough fuel for this ${m.fuelCost}-unit jump — the missing ${m.shortfall} unit${m.shortfall === 1 ? '' : 's'} cost ${travelRefuelCost(state.run, r)} cr here (you have ${credits}). Pick a shorter jump, top up, or scan.</div>`
    : '';

  return `
    <div class="gs-dock__detail" style="--rs-accent:${m.accent};">
      <div class="gs-dock__title">
        <span class="gs-lane__glyph" style="border-color:${m.biome.col};width:30px;height:30px;font-size:17px;">${m.biome.glyph}</span>
        <div style="min-width:0;flex:1 1 auto;">
          <div style="font-size:11px;font-weight:700;color:${m.biome.col};line-height:1.1;">${m.biome.label} · ${r.event.label}</div>
          <b style="font-size:16px;line-height:1.15;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.theme.name}</b>
        </div>
        ${travelChip(m.diff.t, m.diff.c)}
      </div>
      <div style="font-size:12.5px;opacity:.9;margin-top:5px;">${eventDescFor(ev.desc)}</div>
      ${effLine}${playLine}${salvageLine}
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;">${tags.join('')}</div>
      ${tollWarn}${fuelWarn}
    </div>`;
}

// ---- the compact status strip (replaces the heavy header on this screen) ----------------------------
// Only the facts a JUMP decision needs: who you are, how deep you've come, fuel, credits. The old header's
// Hcp / Best dist / Best SF are irrelevant here (and were a wall of text up top), so they're dropped.
function travelStrip(): string {
  const r = state.run;
  const ch = getCharacter(r.loadout.characterId);
  const who = ch ? `<span style="color:${ch.style.cap};font-weight:700;">${ch.name}</span>` : 'Voyager';
  return `
    <div class="gs-travel__strip" style="border-left:3px solid ${rarCol(state.course.rarity)};">
      <span style="font-size:15px;font-weight:800;">⛳ ${who}</span>
      <span class="gs-travel__stats">
        <span>Stop <b>${r.stopIndex + 1}</b></span>
        <span>dist <b>${r.distanceFromStart}</b></span>
        <span>${fuelGaugeHTML(r.fuel, tankCapacity(r), { mini: true })}</span>
        <span>💰 <b style="color:var(--gs-warn);">${r.credits}</b></span>
      </span>
    </div>`;
}

export function travelScreen(): string {
  const routeList = state.routes ?? [];
  const credits = state.run.credits;

  // Resolve the selected lane: keep the player's pick if still valid, else default to the first
  // travellable lane (so the dock opens on a jump you can actually take), else the first lane.
  const validSel = routeList.find((r) => r.id === travelView.selectedRouteId);
  const selRoute = validSel ?? routeList.find((r) => canTravel(state.run, r)) ?? routeList[0] ?? null;
  travelView.selectedRouteId = selRoute?.id ?? null;

  // The starmap (GS-routes, GS-journey-vertical): three tappable branch worlds across the TOP → YOU →
  // the travelled trail winding DOWN to Earth. Tapping a world SELECTS it (inline — the dock detail swaps).
  const zoneName = themeById(state.course.meta?.themeId ?? '')?.name ?? 'Deep Space';
  const choices: StarmapChoice[] = routeList.map((r) => ({
    id: r.id,
    label: r.event.label,
    icon: r.event.icon,
    rarity: r.event.rarity,
    distanceJump: r.distanceJump,
    archetype: r.theme.archetype,
    worldName: r.theme.name,
    effectIcon: COURSE_EFFECTS[routeEffect(r.event)].icon,
    elite: r.elite,
    bossAhead: r.bossAhead,
    locked: !canTravel(state.run, r),
    fuelCost: routeFuelCost(state.run, r),
    // GS-journey-cockpit: the selected world wears a bright selection halo so the map + dock agree.
    selected: r.id === travelView.selectedRouteId,
  }));
  const trail = state.run.history.slice(0, -1).map((h) => {
    const name = themeById(h.themeId ?? '')?.name ?? 'Deep Space';
    const sky = skyCoordForName(name);
    const badge = BIOME_BADGE[archetypeFor(h.themeId, h.biome)];
    return { label: name, ra: sky?.ra, dec: sky?.dec, glyph: badge?.glyph, col: badge?.col };
  });
  const map = journeyMapHTML({
    seed: state.run.seed,
    stopIndex: state.run.stopIndex,
    distanceFromStart: state.run.distanceFromStart,
    currentLabel: zoneName,
    trail,
    choices,
    shipId: shipForCharacter(state, state.run.loadout.characterId),
    ionThrusters: (state.run.loadout.fuelEfficiency ?? 0) > 0,
  });

  // ---- the dock: comparison rail + selected detail + actions -----------------------------------
  const rail = routeList.length
    ? `<div class="gs-travel__rail">${routeList.map((r) => laneCell(r, r.id === travelView.selectedRouteId)).join('')}</div>`
    : '';

  const anyLane = routeList.some((r) => canTravel(state.run, r));
  const scanCost = scanFuelCost(state.run);
  const scanBtn = canScanRoutes(state.run)
    ? btn(`📡 Scan (−${scanCost} ⛽)`, { type: 'scanRoutes' }, { variant: 'ghost', borderColor: '#7aa0d0aa' })
    : `<span class="gs-btn gs-btn--ghost" style="opacity:.4;cursor:not-allowed;">📡 Scan (needs ${scanCost + 1} ⛽)</span>`;

  // The SELECTED lane's jump button (GS-fuel-2): a short tank prints its refuel bill ON the button — the
  // exact surcharge `travel` folds in, never a silent deduction. Locked → an out-of-range placeholder.
  const jumpBtn = (() => {
    if (!selRoute) return '';
    const m = laneMeta(selRoute);
    if (!m.travellable) return `<span class="gs-btn gs-btn--block" style="flex:2 1 0;opacity:.4;cursor:not-allowed;text-align:center;">⛽ Out of range</span>`;
    const label = m.shortfall > 0 ? `🚀 Refuel +${m.shortfall} ⛽ & jump (−${travelRefuelCost(state.run, selRoute)} cr)` : `🚀 Jump to ${selRoute.theme.name}`;
    return btn(label, { type: 'route', routeId: selRoute.id }, { variant: 'primary', block: true, borderColor: m.accent });
  })();

  // Push-your-luck cash-out (GS-bank): a compact secondary action in the dock — bank now to lock credits
  // into permanent shards; pushing deeper and busting forfeits them. Only offered once underway.
  const cashOut = cashOutShards(state.run);
  const bankBtn =
    state.run.stopIndex > 0
      ? btn(`✦ Bank${cashOut > 0 ? ` +${cashOut}` : ''}`, { type: 'bank' }, { variant: 'ghost' })
      : '';

  // The fuel depot rides behind a toggle so its buy-buttons + notes don't eat the dock unless wanted.
  // A plain button (not `btn()`) so it carries a `data-depot` handler instead of a game action dispatch.
  const depotBtn = `<button class="gs-btn gs-btn--ghost${travelView.depotOpen ? ' gs-btn--on' : ''}" data-depot="toggle">${travelView.depotOpen ? '⛽ ✕' : '⛽ Fuel'}</button>`;
  const depot = travelView.depotOpen ? fuelDepotHTML() : '';

  // GS-fuel: with NO payable lane the run is STRANDED — the forced exit (mirrors bank; pocket change still
  // converts). The sector scan doubles as the last-ditch lifeline, so it rides inside the stranded box.
  const strandedBox = !anyLane
    ? `<div class="gs-dock__stranded">
         <p style="font-size:13px;margin:0 0 8px;"><b style="color:#ff6b4a;">🆘 Stranded in deep space.</b> The tank holds <b>${state.run.fuel}</b> ⛽ and your <b>${credits}</b> credits can't buy any offered jump.${canScanRoutes(state.run) ? ' One hope: burn a cell to scan for closer worlds.' : " The journey ends here — what's left converts to shards."}</p>
         <div class="gs-dock__actions">
           ${canScanRoutes(state.run) ? scanBtn : ''}
           ${btn('🆘 Abandon ship', { type: 'strand' }, { variant: 'primary', borderColor: '#ff6b4a' })}
         </div>
       </div>`
    : '';

  // A one-shot note after the Asgard interlude (GS-asgard): the Rainbow Ball is spent; cleared on jump.
  const asgardBanner = state.asgardBanner
    ? `<div class="gs-travel__asgard" style="border-color:${state.asgardBanner === 'won' ? 'rgba(255,210,110,0.45)' : 'var(--gs-line-2)'};background:${state.asgardBanner === 'won' ? 'rgba(255,210,110,0.1)' : 'transparent'};">
         ${state.asgardBanner === 'won'
           ? "🏆 <b style=\"color:#ffd97a;\">You conquered Asgard!</b> Thor's Hammer awaits in your Clubhouse, and Odin's Favour rides with you."
           : '⚡ <b>The Bifröst fades.</b> The Rainbow Ball is spent; your worlds are true once more.'}
       </div>`
    : '';

  const dock = anyLane
    ? `<div class="gs-travel__dock">
         ${rail}
         ${selRoute ? laneDetail(selRoute) : ''}
         <div class="gs-dock__actions">
           ${jumpBtn}
           ${scanBtn}
           ${depotBtn}
           ${bankBtn}
         </div>
         ${depot}
       </div>`
    : `<div class="gs-travel__dock">${strandedBox}${bankBtn ? `<div class="gs-dock__actions" style="margin-top:8px;">${bankBtn}</div>` : ''}</div>`;

  return `
    <div class="gs-travel">
      ${travelStrip()}
      ${asgardBanner}
      <div class="gs-travel__map">${map}</div>
      ${dock}
    </div>`;
}
