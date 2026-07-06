/**
 * The credit-economy shop screens: the Pro Shop (stock rack + pro greeting + bag inventory), the
 * mid-hole StarMart (GS-tent-interactions), and the Fuel Depot block (GS-fuel-2) the travel screen
 * also mounts. Pure renders off the live state; buys dispatch through `data-action`.
 */

import { btn, header, state } from './ctx';
import { archetypeFor } from '../sim/course/themes';
import { proLine, proMood, sectionEvents, shopPro } from '../sim/course/zones';
import { proAvatarSVG } from '../render/golferCards';
import {
  clubOfferNote,
  clubSetById,
  isHybridType,
  itemCap,
  itemCost,
  namedCaddyOwned,
  ownedCount,
  REWARD_CLUB_TYPES,
  shopItem,
} from '../sim/rpg/economy';
import { CLUBS, clubById } from '../sim/clubs';
import { rarCol } from '../sim/rpg/loot';
import { drawGolfBag, itemArtSVG } from '../render/itemArt';
import { itemCardHTML } from '../render/cards';
import { bagSet } from '../sim/rpg/bag';
import { fuelUnitCost, STARMART_COST, starmartRerollCost, tankCapacity } from '../sim/rpg/run';
import { fuelColour, fuelGaugeHTML } from '../render/fuel';
import { rerollCost } from '../ui/game';

// Shop bag-inventory inspect: tap an owned gear chip to pop its card (toggle), for comparison with
// the stock. View-only module state — toggled via [data-inspect] + re-render, never persisted.
export const shopView = { inspectGearId: null as string | null };

/** The Pro Shop greeting block: the world's club pro + a pithy line on how the last section went. */
function proGreetingHTML(): string {
  const last = state.lastResult;
  if (!last) return '';
  const archetype = archetypeFor(last.themeId, last.biome);
  const pro = shopPro(archetype);
  const mood = proMood(last.stableford, last.cut);
  // React to the section's drama (an ace, a blow-up, a birdie blitz) over the generic grade.
  const events = sectionEvents(
    (state.played ?? []).map((p) => ({
      par: p.stat.par,
      strokes: p.stat.strokes,
      pickedUp: p.pickedUp,
      holed: p.holed,
    })),
  );
  const line = proLine(pro, mood, events, state.run.stopIndex);
  return `
    <div class="gs-panel" style="display:flex;gap:12px;align-items:center;margin:0 0 10px;">
      <div style="flex:0 0 auto;">${proAvatarSVG(archetype)}</div>
      <div style="flex:1 1 auto;min-width:0;">
        <div style="font-weight:600;font-size:14px;">${pro.name}</div>
        <div style="font-size:11px;opacity:.6;margin-bottom:6px;">${pro.title}</div>
        <div style="font-size:13px;font-style:italic;opacity:.92;">&ldquo;${line}&rdquo;</div>
      </div>
    </div>`;
}

// A short headline for a club chip — the bag ids ('D','5W','PW','60') already read well; only the
// long-form ids need a friendly cap.
function shortClubLabel(id: string): string {
  if (id === 'putter') return 'Putt';
  if (id === 'chip') return 'Chip';
  return id;
}

// The player's FULL bag inventory on the shop screen (GS-clubs-2): every club you carry shown with its
// rarity, plus every reward-club SLOT you don't yet carry greyed out — so you can see at a glance what
// is in the bag, what a shop club would replace, and which gaps a new club would fill. Pure render off
// the live loadout (no hook, no save state).
function bagInventoryHTML(): string {
  const loadout = state.run.loadout;
  const bag = loadout.bag;
  // Universe of club TYPES: everything you carry, plus every rewardable slot (so empty slots read as
  // greyed gaps). Larry never sees hybrids, so don't show empty hybrid slots he could never fill.
  const types = new Set<string>(bag.map((c) => c.id));
  for (const t of REWARD_CLUB_TYPES) {
    if (loadout.noHybrids && isHybridType(t)) continue;
    types.add(t);
  }
  // Club types for sale this stop, so an owned-or-empty slot can flag "available now".
  const offered = new Set<string>(
    (state.shopOffer ?? []).map((id) => shopItem(id)?.clubType).filter((t): t is string => !!t),
  );
  const carryOf = (t: string) => bag.find((c) => c.id === t)?.carry ?? clubById(t, CLUBS)?.carry ?? 0;
  const chips = [...types]
    .sort((a, b) => carryOf(b) - carryOf(a))
    .map((t) => {
      const owned = bag.find((c) => c.id === t);
      const base = clubById(t, CLUBS);
      const name = owned?.name ?? base?.name ?? t;
      const carry = carryOf(t);
      const rarity = owned?.rarity ?? 'common';
      const col = owned ? rarCol(rarity) : '#5a6172';
      const inShop = offered.has(t);
      // Owned tier label: a reward club shows its rarity, a starting club reads "stock"; an empty slot reads "empty".
      const tierLabel = owned ? (owned.set && owned.set !== 'starter' ? rarity : 'stock') : 'empty';
      return `<div title="${name} · ~${carry} yd${owned ? ` · ${rarity}` : ' · not in bag'}"
        style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;min-width:50px;
        padding:5px 7px;border:1.5px solid ${owned ? col : col + '66'};border-radius:9px;
        background:${owned ? col + '14' : '#ffffff05'};opacity:${owned ? 1 : 0.5};">
        <span style="font-size:12.5px;font-weight:800;letter-spacing:.02em;">${shortClubLabel(t)}</span>
        <span style="font-size:9.5px;opacity:.75;">${carry} yd</span>
        <span style="font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:${col};">${inShop ? '🛒 ' : ''}${tierLabel}</span>
      </div>`;
    })
    .join('');
  // --- The gear/accessories line (GS-proshop-3): every non-club item you own — glove, ball, shoe,
  // shaft, putter, caddy, relic — sits ABOVE the clubs. Tap one to pop its card so you can compare it
  // with what's on sale. Owned ids, de-duped, in purchase order.
  const gearIds = [...new Set(loadout.perks)].filter((id) => {
    const it = shopItem(id);
    return !!it && !it.clubType; // clubs live in the row below
  });
  const gearChips = gearIds
    .map((id) => {
      const it = shopItem(id)!;
      const owned = ownedCount(state.run.loadout.perks, id);
      const col = rarCol(it.rarity);
      const sel = shopView.inspectGearId === id;
      const setTheme = it.clubSet ? clubSetById(it.clubSet)?.theme : undefined;
      const count = owned > 1 ? `<span style="font-size:9px;opacity:.8;">×${owned}</span>` : '';
      return `<div data-inspect="${id}" title="${it.name} — tap to compare"
        style="cursor:pointer;display:inline-flex;flex-direction:column;align-items:center;gap:2px;width:54px;
        padding:4px;border:1.5px solid ${sel ? col : col + '88'};border-radius:9px;background:${sel ? col + '22' : col + '10'};
        ${sel ? `box-shadow:0 0 8px ${col}66;` : ''}">
        <div style="width:100%;border-radius:6px;overflow:hidden;pointer-events:none;">${itemArtSVG(id, it.rarity, setTheme)}</div>
        <span style="font-size:8.5px;text-align:center;line-height:1.05;max-height:2.1em;overflow:hidden;">${it.name}</span>${count}
      </div>`;
    })
    .join('');
  const gearRow = gearIds.length
    ? `<div style="font-size:11px;font-weight:700;opacity:.8;margin:0 0 5px;">🧤 Your gear — tap to compare</div>
       <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px;">${gearChips}</div>`
    : '';
  // The inline inspect card for the tapped gear item (full card, for side-by-side comparison).
  let inspectCard = '';
  if (shopView.inspectGearId) {
    const it = shopItem(shopView.inspectGearId);
    if (it && gearIds.includes(shopView.inspectGearId)) {
      const owned = ownedCount(state.run.loadout.perks, shopView.inspectGearId);
      const setTheme = it.clubSet ? clubSetById(it.clubSet)?.theme : undefined;
      const card = itemCardHTML(
        { ...it, cost: itemCost(it, owned) },
        { owned: owned >= itemCap(it), count: owned, artSVG: itemArtSVG(it.id, it.rarity, setTheme) },
      );
      inspectCard = `<div style="display:flex;justify-content:center;margin:2px 0 9px;">${card}</div>`;
    }
  }
  return `
    <div style="margin:.2em 0 .9em;padding:9px 11px;border:1px solid var(--gs-line-2);border-radius:10px;background:#ffffff05;">
      ${gearRow}
      ${inspectCard}
      ${(() => {
        // A blinged golf-bag thumbnail beside the header once the default bag is upgraded (GS-bag-tiers).
        const bt = loadout.bagTier ?? 'common';
        const bs = bagSet(bt);
        const art = bt !== 'common' && bs ? `<div style="width:48px;flex:0 0 auto;border-radius:7px;overflow:hidden;">${drawGolfBag(bs.tint, bt)}</div>` : '';
        const label = bs ? `🎒 ${bs.name} — your bag` : '🎒 Your bag — equipped clubs &amp; empty slots';
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">${art}<div style="font-size:12px;font-weight:700;opacity:.85;">${label}</div></div>`;
      })()}
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${chips}</div>
      <div style="font-size:10px;opacity:.55;margin-top:7px;">Coloured = equipped (border shows rarity). Greyed = an empty slot a reward club could fill. 🛒 = on sale in this shop.</div>
    </div>`;
}

/** The FUEL DEPOT (GS-fuel, restyled GS-fuel-2) — the fixed refuelling counter shown at every Pro
 *  Shop and on the journey screen (never part of the rotating 4-card offer, so fuel is always
 *  purchasable). The LOCAL price is the headline — it rises with galaxy depth, so "fill up here or
 *  gamble on gear" is the depot's whole question — over the segmented tank gauge and quick-buy
 *  chips (+1 / +3 / fill the tank). Buttons grey out when the purse or capacity says no
 *  (`buyFuel` clamps anyway; the disabled state is just honest UI). */
export function fuelDepotHTML(): string {
  const r = state.run;
  const cap = tankCapacity(r);
  const price = fuelUnitCost(r);
  const space = Math.max(0, cap - r.fuel);
  const buyBtn = (units: number, label?: string): string => {
    const n = Math.min(units, space);
    const cost = n * price;
    const ok = n > 0 && r.credits >= cost;
    const text = `${label ?? `+${n} ⛽`} · ${cost} cr`;
    return ok
      ? btn(text, { type: 'buyFuel', units: n }, { variant: 'ghost', borderColor: '#4fd0e066' })
      : `<span class="gs-btn gs-btn--ghost" style="opacity:.4;cursor:not-allowed;flex:1 1 auto;font-size:13px;padding:9px 10px;text-align:center;">${text}</span>`;
  };
  const tankNote = space <= 0
    ? `<span style="font-size:12px;font-weight:700;color:#4fd0e0;">tank full</span>`
    : r.fuel <= 2
      ? `<span style="font-size:12px;font-weight:800;color:var(--gs-danger);">running dry!</span>`
      : '';
  const rows = space > 0
    ? `<div class="gs-fueldepot__row">${buyBtn(1)}${space > 1 ? buyBtn(3) : ''}${space > 3 ? buyBtn(space, `Fill +${space} ⛽`) : ''}</div>`
    : '';
  return `
    <div class="gs-fueldepot">
      <div class="gs-fueldepot__head">
        <span class="gs-fueldepot__title">⛽ FUEL DEPOT</span>
        ${fuelGaugeHTML(r.fuel, cap, { bare: true })}
        <b style="font-size:13px;color:${fuelColour(r.fuel, cap)};">${r.fuel}/${cap}</b>
        ${tankNote}
        <span class="gs-fueldepot__price">${price} cr / unit here</span>
      </div>
      ${rows}
      <p class="gs-fueldepot__note">A jump burns its distance in fuel (a deep jump = 2–3 units). Fuel gets dearer the deeper you fly — launching short-tanked auto-charges the local price.</p>
      ${
        (r.loadout.fuelEfficiency ?? 0) > 0
          ? `<p class="gs-fueldepot__note" style="color:#7ff3ff;opacity:.85;">🌀 Ion thrusters fitted — every jump burns ${r.loadout.fuelEfficiency} less ⛽ (min 1).</p>`
          : ''
      }${
        (r.loadout.tankBonus ?? 0) > 0
          ? `<p class="gs-fueldepot__note" style="color:#4fd0e0;opacity:.85;">🛢 Reserve tank strapped on — capacity +${r.loadout.tankBonus}.</p>`
          : ''
      }
    </div>`;
}

export function shopScreen(): string {
  const perks = state.run.loadout.perks;
  const credits = state.run.credits;
  const hasCaddy = !!namedCaddyOwned(perks);
  // A reward club (GS-clubs-2) shows whether it UPGRADES a club you carry or is a NEW club, and which
  // distance gap it fills — so the buy decision is legible at a glance.
  const clubBadge = (it: NonNullable<ReturnType<typeof shopItem>>): { text: string; tone?: 'up' | 'new' } | undefined => {
    if (!it.clubType) return undefined;
    const note = clubOfferNote(it, state.run.loadout);
    if (!note) return undefined;
    if (note.kind === 'upgrade') {
      if (note.putt) return { text: '▲ UPGRADE · putt', tone: 'up' };
      return { text: note.gainYd ? `▲ UPGRADE · +${note.gainYd} yd` : '▲ UPGRADE', tone: 'up' };
    }
    const between =
      note.longerName && note.shorterName
        ? `${note.longerName}→${note.shorterName}`
        : note.longerName
        ? `under ${note.longerName}`
        : note.shorterName
        ? `over ${note.shorterName}`
        : '';
    return { text: `✚ NEW · ~${note.carry} yd${between ? ` (${between})` : ''}`, tone: 'new' };
  };
  const renderCard = (it: NonNullable<ReturnType<typeof shopItem>>): string => {
    const owned = ownedCount(perks, it.id);
    const maxed = owned >= itemCap(it);
    const cost = itemCost(it, owned);
    const afford = credits >= cost;
    const buyable = !maxed && afford;
    const setTheme = it.clubSet ? clubSetById(it.clubSet)?.theme : undefined;
    const artSVG = itemArtSVG(it.id, it.rarity, setTheme);
    const card = itemCardHTML({ ...it, cost }, { owned: maxed, affordable: afford, count: owned, badge: clubBadge(it), artSVG });
    // Wrap the card so the whole thing is the buy button when purchasable.
    return buyable
      ? `<div class="gs-clickcard" data-action='${JSON.stringify({ type: 'buy', id: it.id })}' style="cursor:pointer;margin:4px;">${card}</div>`
      : `<div style="margin:4px;">${card}</div>`;
  };
  // The stock was fixed on shop entry (state.shopOffer); cost/stack state is live. Gear and reward
  // clubs (GS-clubs-2) share ONE 4-card rack — no separate row.
  const stock = (state.shopOffer ?? [])
    .map((id) => shopItem(id))
    .filter((it): it is NonNullable<typeof it> => !!it)
    // Once any named caddy is hired, the others vanish from the offer (you may keep only one).
    .filter((it) => it.caddy !== 'named' || !hasCaddy || ownedCount(perks, it.id) > 0)
    .map(renderCard)
    .join('');
  return `
    ${header()}
    <h2 style="font-size:16px;">🏌 Pro Shop · ${credits} credits</h2>
    ${proGreetingHTML()}
    <p style="font-size:12px;opacity:.6;margin:.2em 0 .6em;">Click a card to buy. Stock rotates each stop — early stops stock cheap commons, deeper stops stock rare/epic power. Stackable upgrades cost more the more you own; rare clubs (▲ upgrades or ✚ new gap-fillers) and a rare caddy may turn up. Hire one caddy and the rest stay home.</p>
    <div style="display:flex;flex-wrap:wrap;">${stock}</div>
    ${fuelDepotHTML()}
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      ${btn('Travel onward →', { type: 'leaveShop' }, { variant: 'primary' })}
      ${
        credits >= rerollCost(state.shopRerolls ?? 0)
          ? btn(`🎲 Reroll stock (${rerollCost(state.shopRerolls ?? 0)} cr)`, { type: 'rerollShop' }, { variant: 'ghost' })
          : `<span style="font-size:12px;opacity:.5;">🎲 Reroll needs ${rerollCost(state.shopRerolls ?? 0)} cr</span>`
      }
    </div>
    ${bagInventoryHTML()}`;
}

/**
 * The StarMart pop-up shop (GS-tent-interactions): a mid-hole shop a StarMart trade-tent opens, spending
 * cross-run STAR SHARDS instead of run credits. It stocks only rare/epic/legendary (no commons) and
 * skews epic/legendary; items last the run like any Pro-Shop buy. Priced in shards by rarity (5/10/15).
 */
export function starmartScreen(): string {
  const shards = state.shards;
  const perks = state.run.loadout.perks;
  const renderCard = (it: NonNullable<ReturnType<typeof shopItem>>): string => {
    const owned = ownedCount(perks, it.id);
    const maxed = owned >= itemCap(it);
    const cost = STARMART_COST[it.rarity];
    const afford = shards >= cost;
    const buyable = !maxed && afford;
    const setTheme = it.clubSet ? clubSetById(it.clubSet)?.theme : undefined;
    const artSVG = itemArtSVG(it.id, it.rarity, setTheme);
    const card = itemCardHTML(
      { ...it, cost },
      { owned: maxed, affordable: afford, count: owned, artSVG, costLabel: `${cost} ⭐`, unaffordableNote: 'NEED SHARDS' },
    );
    return buyable
      ? `<div class="gs-clickcard" data-action='${JSON.stringify({ type: 'buyStarmart', id: it.id })}' style="cursor:pointer;margin:4px;">${card}</div>`
      : `<div style="margin:4px;">${card}</div>`;
  };
  const stock = (state.starmartOffer ?? [])
    .map((id) => shopItem(id))
    .filter((it): it is NonNullable<typeof it> => !!it)
    .map(renderCard)
    .join('');
  const rerollCostShards = starmartRerollCost(state.starmartRerolls ?? 0);
  const empty = stock === '' ? `<p style="font-size:13px;opacity:.6;">Sold out! Nothing left on the rack — reroll or head back to your ball.</p>` : '';
  return `
    ${header()}
    <h2 style="font-size:16px;">🛰 StarMart · ${shards} ⭐ shards</h2>
    <p style="font-size:12px;opacity:.6;margin:.2em 0 .6em;">A trader's pop-up on the course! Spend your <b>Star Shards</b> on premium gear — rare, epic &amp; legendary only, no filler. Everything here lasts the rest of this run. Blue 5 ⭐ · Purple 10 ⭐ · Orange 15 ⭐.</p>
    <div style="display:flex;flex-wrap:wrap;">${stock}</div>
    ${empty}
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      ${btn('← Back to the hole', { type: 'leaveStarmart' }, { variant: 'primary' })}
      ${
        shards >= rerollCostShards
          ? btn(`🎲 Reroll stock (${rerollCostShards} ⭐)`, { type: 'rerollStarmart' }, { variant: 'ghost' })
          : `<span style="font-size:12px;opacity:.5;">🎲 Reroll needs ${rerollCostShards} ⭐</span>`
      }
    </div>`;
}
