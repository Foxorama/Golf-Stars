/**
 * The journey screens (GS-routes / GS-journey-vertical / GS-fuel): the star-chart travel screen
 * with its three tappable branch planets, the route-info bottom sheet with the full jump detail
 * (bet levers, weather hooks, salvage gamble, fuel bill), and the bank/stranded exits.
 */

import { btn, header, state } from './ctx';
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
import { archetypeFor, themeById } from '../sim/course/themes';
import { journeyMapHTML, type StarmapChoice } from '../render/starmap';
import { skyCoordForName } from '../render/sky-coords';
import { shipForCharacter } from '../ui/game';
import { fuelGaugeHTML } from '../render/fuel';

// The route-info sheet's open route (GS-journey-vertical): view-only module state (like
// shopView.inspectGearId / settingsOpen) — toggled via [data-route-inspect] + re-render, reset on
// leaving travel, so a stale id (route ids repeat 1..3 each stop) can't auto-reopen a sheet.
export const travelView = { inspectRouteId: null as number | null };

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
};

// The functional family of a route event → a short pill label + accent (distinct from the rarity ring).
const EVENT_CATEGORY: Record<EventCategory, { label: string; col: string }> = {
  calm: { label: 'SAFE', col: '#2bb673' },
  payout: { label: 'PAYOUT', col: '#ffce54' },
  toll: { label: 'GAMBLE', col: '#ff8b6b' },
  salvage: { label: 'SALVAGE', col: '#4fd0e0' },
};

// A small pill token (label + accent) — shared by the travel screen + the route-info sheet.
function travelChip(txt: string, col: string): string {
  return `<span style="display:inline-block;font-size:11.5px;font-weight:700;color:${col};border:1px solid ${col}66;border-radius:5px;padding:1px 7px;">${txt}</span>`;
}

/** Route-event copy, kept honest per format (GS-unending): in the Unending Universe there is no
 *  Stableford cut — an event's `cutDelta` lands as course WILDNESS (`routeDifficulty`) instead, so
 *  its "cut +1" phrasing is rewritten to say what actually happens. Other formats read as authored. */
export function eventDescFor(desc: string): string {
  if (!holeGateArmed(state.run)) return desc;
  return desc.replace(/cut \+\d+/gi, 'wilder course').replace(/cut -\d+/gi, 'calmer course');
}

/** The route-info sheet (GS-journey-vertical): tapping a branch planet on the star-chart opens this
 *  bottom-sheet with the FULL jump detail — the world you'll play (biome + difficulty + weather), the
 *  bet's levers, and a confirm/cancel. Confirm dispatches the existing { type:'route' } action; cancel
 *  closes it so you can inspect another lane. A view overlay (module state), not reducer state. */
export function routeInfoOverlay(): string {
  const r = (state.routes ?? []).find((x) => x.id === travelView.inspectRouteId);
  if (!r) return '';
  const ev = r.event;
  const credits = state.run.credits;
  const ring = rarCol(ev.rarity);
  const accent = r.elite ? '#ffce54' : ring;
  const cat = EVENT_CATEGORY[ev.category];
  const b = BIOME_BADGE[r.theme.archetype] ?? { glyph: '🪐', label: r.theme.archetype, col: '#8aa0c0' };
  const dd = routeDifficulty(ev);
  const diff =
    dd <= -0.1 ? { t: 'Gentler course', c: '#2bb673' }
    : dd < 0.07 ? { t: 'Standard course', c: '#9fb0cf' }
    : dd < 0.16 ? { t: 'Tougher course', c: '#ffb04a' }
    : { t: 'Brutal course', c: '#ff6b4a' };
  const eff = COURSE_EFFECTS[routeEffect(ev)];

  // The lane's levers, each its own readable token.
  const tags: string[] = [];
  if (ev.creditMult !== 1) {
    const pct = Math.round((ev.creditMult - 1) * 100);
    tags.push(travelChip(`${pct > 0 ? '+' : ''}${pct}% credits`, pct >= 0 ? '#ffce54' : '#ff8b6b'));
  }
  // In the Unending Universe the cut lever doesn't exist — the difficulty line above already says
  // what cutDelta really does there (a wilder/gentler generated course via routeDifficulty).
  if (ev.cutDelta !== 0 && !holeGateArmed(state.run))
    tags.push(travelChip(`cut ${ev.cutDelta > 0 ? '+' : ''}${ev.cutDelta}`, ev.cutDelta > 0 ? '#ff8b6b' : '#2bb673'));
  if (ev.creditToll) {
    const afford = credits >= ev.creditToll;
    tags.push(travelChip(`−${ev.creditToll} toll${afford ? '' : ' ⚠'}`, '#ff8b6b'));
  }
  // The weather's play hooks (GS-journey-variety wind; GS-journey-fx-2 carry + ground twists): the
  // sky is a real lever now — say EXACTLY what it does to your golf, computed from the same tables
  // the physics read so the card can never drift from the course.
  const windMult = effectWindMult(eff.id);
  if (windMult > 1) tags.push(travelChip(`💨 winds +${Math.round((windMult - 1) * 100)}%`, '#ff8b6b'));
  else if (windMult < 1) tags.push(travelChip(`🍃 still air −${Math.round((1 - windMult) * 100)}%`, '#2bb673'));
  const carryMult = effectCarryMult(eff.id);
  if (carryMult > 1) tags.push(travelChip(`🎈 shots fly +${Math.round((carryMult - 1) * 100)}%`, '#2bb673'));
  else if (carryMult < 1) tags.push(travelChip(`⚓ shots fly −${Math.round((1 - carryMult) * 100)}%`, '#ff8b6b'));
  tags.push(travelChip(`↗ +${r.distanceJump} distance`, '#9fb0cf'));
  // The jump's FUEL bill (GS-fuel-2): ONE tank-before → tank-after chip, and any shortfall is
  // priced on the Jump button itself (below) — never a silent surcharge.
  const fuelCost = routeFuelCost(state.run, r);
  const fuelAfter = Math.max(0, state.run.fuel - fuelCost);
  tags.push(travelChip(`⛽ ${state.run.fuel} → ${fuelAfter}`, state.run.fuel >= fuelCost ? '#4fd0e0' : '#ff8b6b'));
  // The sky prices the passage (GS-fuel-4): a tail/headwind chip states the EFFECTIVE delta —
  // computed against the same 1-unit floor `routeFuelCost` applies, so a tailwind that can't bite
  // on a 1-hop shows nothing rather than a discount the bill doesn't give.
  const skyBurn = Math.max(1, r.distanceJump + effectFuelDelta(eff.id)) - Math.max(1, r.distanceJump);
  if (skyBurn < 0) tags.push(travelChip(`🌬 tailwind ${skyBurn} ⛽`, '#2bb673'));
  else if (skyBurn > 0) tags.push(travelChip(`🌪 headwind +${skyBurn} ⛽`, '#ff8b6b'));
  // Ion Thrusters (GS-fuel-3): the drive's OWN saving on this jump — what the bill would be under
  // this sky without the retrofit, minus what it is.
  const ionSave = Math.max(1, r.distanceJump + effectFuelDelta(eff.id)) - fuelCost;
  if (ionSave > 0) tags.push(travelChip(`🌀 ion drive −${ionSave} ⛽`, '#7ff3ff'));
  // A fuel-salvage lane (GS-fuel-4): the arrival siphon, loud and exact.
  if (ev.fuelBonus) tags.push(travelChip(`⛽ +${ev.fuelBonus} on arrival`, '#4fd0e0'));
  const shortfall = fuelShortfall(state.run, r);

  const markers = [
    r.bossAhead ? `<span style="color:#ff8b6b;font-weight:700;">⚔ Boss ahead</span>` : '',
    r.elite ? `<span style="color:#ffce54;font-weight:700;">🔥 Harder path</span>` : '',
  ]
    .filter(Boolean)
    .join('&nbsp;·&nbsp;');

  const tollWarn =
    ev.creditToll && credits < ev.creditToll
      ? `<div style="font-size:12px;color:#ff8b6b;margin-top:6px;">⚠ You can't cover the ${ev.creditToll}-credit toll (you have ${credits}).</div>`
      : '';
  // Not enough fuel AND not enough credits to buy the shortfall (GS-fuel): this lane is locked.
  const travellable = canTravel(state.run, r);
  const fuelWarn = !travellable
    ? `<div style="font-size:12px;color:#ff8b6b;margin-top:6px;">⛽ Not enough fuel for this ${routeFuelCost(state.run, r)}-unit jump — the missing ${fuelShortfall(state.run, r)} unit${fuelShortfall(state.run, r) === 1 ? '' : 's'} would cost ${travelRefuelCost(state.run, r)} cr at this depot (you have ${credits}). Pick a shorter jump.</div>`
    : '';

  // A SALVAGE lane's club find (GS-journey-fx-3, GS-salvage-mystery) is a BLIND gamble — the card
  // previews only the TIER, never the exact club. The find rolls when you ARRIVE (off the private
  // `salvage:<seed>:<arrivingStop>:<eventId>` stream `travel` grants it on), and that stream is keyed
  // to the destination, so each salvage stop is its own roll: skip it here and the next lane's loot may
  // differ. We deliberately don't resolve the club for the preview — knowing it in advance killed the
  // gamble and made every salvage lane read as the same fixed reward.
  const findRarity = routeClubFind(ev);
  let salvageLine = '';
  if (findRarity) {
    salvageLine = `<div style="font-size:12.5px;margin:4px 0 0;color:${rarCol(findRarity)};font-weight:600;">🎁 Salvage: a mystery <b>${findRarity.toUpperCase()}</b> club find — rolled on arrival, unknown until you commit (a credit payout if your bag's already stocked). Grab it here; the next salvage may be something else.</div>`;
  }
  // The effect's GEOMETRIC play hook (tents / craters / turf patches) gets its own loud line — the
  // consequence you'll actually putt around, not just sky-dressing (GS-journey-fx-2).
  const playLine = eff.play
    ? `<div style="font-size:12.5px;margin:4px 0 0;color:#ffce54;font-weight:600;">🎯 ${eff.play}</div>`
    : '';
  const effLine =
    eff.id !== 'none'
      ? `<div style="font-size:13px;margin:8px 0 0;opacity:.9;">${eff.icon} <b>${eff.label}</b> · <span style="opacity:.75;">${eff.blurb}</span></div>${playLine}`
      : '';

  return `
    <div class="gs-sheet-backdrop" data-route="close">
      <div class="gs-sheet gs-routesheet" data-route="keep" style="--rs-accent:${accent};">
        <div class="gs-sheet-head">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <div style="flex:0 0 auto;width:52px;height:52px;border-radius:13px;background:radial-gradient(circle at 35% 30%, ${b.col}44, #0c1020);border:2px solid ${accent};display:flex;align-items:center;justify-content:center;font-size:28px;">${b.glyph}</div>
            <div style="min-width:0;">
              <div style="font-size:12px;font-weight:700;color:${b.col};line-height:1.1;">${b.label} world</div>
              <b style="font-size:19px;line-height:1.15;display:block;">${r.theme.name}</b>
            </div>
          </div>
          <button class="gs-mapbtn" data-route="close" title="Close">✕</button>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 10px;">
          ${travelChip(ev.icon + ' ' + ev.label, accent)}
          ${travelChip(ev.rarity.toUpperCase(), ring)}
          ${travelChip(cat.label, cat.col)}
          ${travelChip(diff.t, diff.c)}
        </div>

        <div style="font-size:13.5px;opacity:.95;margin-bottom:4px;">${eventDescFor(ev.desc)}</div>
        <div style="font-size:12.5px;opacity:.6;font-style:italic;margin-bottom:6px;">${ev.lore}</div>
        ${effLine}
        ${salvageLine}

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">${tags.join('')}</div>
        ${markers ? `<div style="font-size:12.5px;margin-top:8px;">${markers}</div>` : ''}
        ${tollWarn}
        ${fuelWarn}

        <div style="display:flex;gap:9px;margin-top:16px;">
          <button class="gs-btn gs-btn--block" data-route="close" style="flex:1 1 0;">Cancel</button>
          ${
            travellable
              ? btn(
                  // A short tank prints its refuel bill ON the launch button (GS-fuel-2): the local
                  // price is charged at lift-off, and the player commits to it with the tap — the
                  // exact surcharge `travel` folds in, never a silent deduction.
                  shortfall > 0
                    ? `🚀 Refuel +${shortfall} ⛽ (−${travelRefuelCost(state.run, r)} cr) & jump`
                    : `🚀 Jump to ${r.theme.name}`,
                  { type: 'route', routeId: r.id },
                  { variant: 'primary', block: true, borderColor: accent },
                )
              : `<span class="gs-btn gs-btn--block" style="flex:1 1 0;opacity:.4;cursor:not-allowed;">⛽ Out of range</span>`
          }
        </div>
      </div>
    </div>`;
}

export function travelScreen(): string {
  const routeList = state.routes ?? [];
  const credits = state.run.credits;

  // The starmap (GS-routes, GS-journey-vertical): three tappable branch planets across the TOP → YOU →
  // the travelled trail winding DOWN to Earth at the bottom. Tapping a planet opens its info sheet.
  const zoneName = themeById(state.course.meta?.themeId ?? '')?.name ?? 'Deep Space';
  const choices: StarmapChoice[] = routeList.map((r) => ({
    id: r.id,
    label: r.event.label,
    icon: r.event.icon,
    rarity: r.event.rarity,
    distanceJump: r.distanceJump,
    // The world this lane flies into (GS-journey-biome) — so the map planet reads the biome you'll play.
    archetype: r.theme.archetype,
    worldName: r.theme.name,
    // The atmospheric effect this lane brings (GS-journey-fx) — previewed as a small planet badge.
    effectIcon: COURSE_EFFECTS[routeEffect(r.event)].icon,
    elite: r.elite,
    bossAhead: r.bossAhead,
    // GS-fuel-2: a lane the tank + purse can't cover draws DIMMED with a red fuel bill, so the
    // blocker reads on the map itself — not only after tapping into the sheet.
    locked: !canTravel(state.run, r),
    // GS-fuel-3: the label's ⛽ bill honours the Ion Thrusters discount (it may undercut the jump).
    fuelCost: routeFuelCost(state.run, r),
  }));
  // The travelled trail: every cleared stop BEFORE the current one (which is YOU), oldest → newest,
  // labelled with its zone name AND its real-sky position (GS-galaxy-map) — so the journey plots a
  // true path through the constellations as it builds. Each node wears its world's biome glyph
  // (GS-journey-history) so a cleared step reads as the world you played.
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
    // GS-fuel-3: an Ion Thrusters retrofit trails its luminous wake behind the YOU ship.
    ionThrusters: (state.run.loadout.fuelEfficiency ?? 0) > 0,
  });

  // Push-your-luck cash-out (GS-bank): bank the run now to lock its credits in as permanent shards
  // (busting at the next cut would forfeit them). Shown with the exact shard payout so the "push or
  // bank" call is informed. Lives below the map (under Earth) — the secondary "quit while ahead" exit.
  const cashOut = cashOutShards(state.run);
  const banked =
    state.run.bonusShards > 0
      ? ` <span style="color:#4fd0e0;">(✦ ${state.run.bonusShards} salvage already banked)</span>`
      : '';
  const bankBtn =
    state.run.stopIndex > 0
      ? `<div style="margin-top:14px;border-top:1px solid var(--gs-line);padding-top:12px;">
           <p style="opacity:.7;font-size:13px;margin:0 0 6px;">…or quit while you're ahead — cash your <b>${credits}</b> credits into permanent shards. Push deeper and a missed cut forfeits them.${banked}</p>
           ${btn(`✦ Bank run & cash out${cashOut > 0 ? ` (+${cashOut} shards)` : ''}`, { type: 'bank' }, { variant: 'ghost', block: true })}
         </div>`
      : '';
  const safeNote = routeList.some((r) => r.event.cutDelta <= 0)
    ? "There's a safer option here."
    : '<span style="color:#ff8b6b;">Out here, every lane is a gamble — or bank the run below.</span>';
  // The Unending Universe (GS-unending) has no Stableford cut — deeper jumps buy shard pace at the
  // price of WILDER worlds under an ever-tightening per-hole bar.
  const stakes = holeGateArmed(state.run)
    ? 'Deeper jumps land wilder worlds — and the survival bar keeps tightening.'
    : 'Deeper jumps raise the cut.';
  // GS-fuel: every lane burns its distance in fuel. With NO payable lane the run is STRANDED — the
  // forced exit (mirrors bank; pocket change still converts). Otherwise the depot rides along so a
  // low tank can be topped up before committing to a jump.
  const anyLane = routeList.some((r) => canTravel(state.run, r));
  // The SECTOR SCAN (GS-fuel-4): burn fuel to redraw the three lanes — fuel's first use besides
  // jumping. The price escalates per scan at this stop (reroll-precedent, so lane-fishing can't be
  // spammed) and the scan always leaves ≥1 cell in the tank. When every lane is out of range it
  // doubles as the last-ditch lifeline, so it rides INSIDE the stranded box there.
  const scanCost = scanFuelCost(state.run);
  const scanBtn = canScanRoutes(state.run)
    ? btn(`📡 Scan new sectors — redraw the lanes (−${scanCost} ⛽)`, { type: 'scanRoutes' }, { variant: 'ghost', block: true })
    : `<span class="gs-btn gs-btn--block" style="display:block;opacity:.4;cursor:not-allowed;">📡 Scan new sectors (needs ${scanCost + 1} ⛽ in the tank)</span>`;
  const strandedBox = !anyLane
    ? `<div style="margin-top:12px;border:1px solid #ff6b4a88;border-left:4px solid #ff6b4a;border-radius:10px;padding:10px 12px;background:#ff6b4a0d;">
         <p style="font-size:13.5px;margin:0 0 8px;"><b style="color:#ff6b4a;">🆘 Stranded in deep space.</b> The tank holds <b>${state.run.fuel}</b> ⛽ and your <b>${credits}</b> credits can't buy any offered jump.${canScanRoutes(state.run) ? ' One hope left: burn a cell to scan for closer worlds.' : " The journey ends here — what's left in your pockets converts to shards."}</p>
         ${canScanRoutes(state.run) ? scanBtn : ''}
         ${btn('🆘 Abandon ship & end the run', { type: 'strand' }, { variant: 'primary', block: true, borderColor: '#ff6b4a' })}
       </div>`
    : '';
  // A one-shot note after returning from the Asgard interlude (GS-asgard): win or lose, the Rainbow
  // Ball is spent and the voyage is back on its true worlds. Cleared the moment the player jumps on.
  const asgardBanner = state.asgardBanner
    ? `<div style="margin:2px 0 10px;border-radius:10px;padding:10px 12px;border:1px solid ${state.asgardBanner === 'won' ? 'rgba(255,210,110,0.45)' : 'var(--gs-line-2)'};background:${state.asgardBanner === 'won' ? 'rgba(255,210,110,0.1)' : 'transparent'};font-size:13px;line-height:1.5;">
         ${state.asgardBanner === 'won'
           ? "🏆 <b style=\"color:#ffd97a;\">You conquered Asgard!</b> Thor's Hammer awaits in your Clubhouse wardrobe, and Odin's Favour rides with you."
           : '⚡ <b>The Bifröst fades.</b> Better luck next time — but the tale of your great shot will be told in the halls of Asgard.'}
         <span style="color:var(--gs-dim);"> The Rainbow Ball is spent; your worlds are true once more.</span>
       </div>`
    : '';
  // The ship-status pill (GS-fuel-2): the segmented tank gauge rides the screen title, so the fuel
  // question is on-screen before any lane is tapped — no more hunting a small number.
  return `
    ${header()}
    ${asgardBanner}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:2px 0 3px;">
      <h2 style="font-size:18px;margin:0;letter-spacing:0.6px;background:linear-gradient(90deg,#ffce54,#7fd6e6);-webkit-background-clip:text;background-clip:text;color:transparent;">◆ CHOOSE YOUR JUMP</h2>
      <span style="flex:0 0 auto;display:inline-flex;align-items:center;gap:7px;font-size:11px;font-weight:700;color:#9fb0cf;border:1px solid var(--gs-line);border-radius:999px;padding:3px 10px;white-space:nowrap;">🛰 dist ${state.run.distanceFromStart} · ${fuelGaugeHTML(state.run.fuel, tankCapacity(state.run))}</span>
    </div>
    <p style="opacity:.75;font-size:13px;margin:0 0 10px;">Tap a glowing world up top to preview where you'll play &amp; its bet, then confirm the jump. Each jump burns its distance in ⛽ fuel. ${stakes} ${safeNote}</p>
    ${map}
    ${strandedBox}
    ${anyLane ? `<div style="margin-top:10px;">${scanBtn}</div>` : ''}
    ${anyLane ? fuelDepotHTML() : ''}
    ${bankBtn}`;
}
