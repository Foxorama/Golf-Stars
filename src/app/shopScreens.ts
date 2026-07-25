/**
 * The credit-economy shop screens: the Pro Shop and the mid-hole StarMart (GS-tent-interactions),
 * plus the Fuel Depot block (GS-fuel-2) the travel screen also mounts.
 *
 * GS-pro-shop-redesign / GS-shop-stop-layout: the shop stop reads as one deck instead of a stack of
 * disjointed boxes. The TOP ROW is two-up — the Travel-Onward hero button (its own ship-art CTA,
 * `travelOnwardCardHTML`) beside a COMPACT Fuel Depot (`fuelDepotHTML({compact:true})`, quick-buys
 * stacked to fit the half-column). Below it the Pro & Pro Shop are COMBINED into one panel: the pro
 * greeting + credits purse + stock-reroll (`proShopIntroHTML`) open the same accordion as the stock
 * rack. Then Upgrades & Effects sits ABOVE the Golf Bag. The fuel top-up buttons are ALWAYS shown
 * (greyed when unaffordable) so the panel never jumps as fuel drains. Each lower panel is a
 * tap-to-expand accordion (`shopView.open`, independent so the shop and bag can both be open to
 * compare). Pure renders off the live state; buys dispatch through `data-action`. Applies to both
 * the Voyage and the Unending Universe (both use `shopScreen`). The full (non-compact) Fuel Depot
 * still backs the journey screen's depot sheet.
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
import { apparelById } from '../sim/rpg/apparel';
import { apparelCardSVG } from '../render/apparelArt';
import { golfBagForCharacter, shipForCharacter } from '../ui/game';
import { shipSVG } from '../render/shipArt';
import { fuelUnitCost, STARMART_COST, starmartRerollCost, tankCapacity } from '../sim/rpg/run';
import { fuelColour, fuelGaugeHTML } from '../render/fuel';
import { rerollCost } from '../ui/game';

// Shop view state (GS-pro-shop-redesign). `inspectGearId`: which owned gear chip's card is popped for
// comparison (toggle). `open`: which expand panels are showing — the Pro Shop and the Golf Bag are
// independent so BOTH can be open to compare stock against the bag. View-only module state, toggled via
// [data-inspect] / [data-shop-panel] + re-render, never persisted. Pro Shop opens expanded by default.
export const shopView = {
  inspectGearId: null as string | null,
  open: new Set<string>(['shop']),
};

/** One tap-to-expand Pro-Shop panel (GS-pro-shop-redesign) — the shop's own accordion, sharing the
 *  `.gs-acc` chrome the Trade Market uses but keyed to `shopView.open` so several can stay open at once
 *  (native <details> can't be used: render() replaces app.innerHTML on every buy, resetting open state). */
function shopPanel(id: string, icon: string, title: string, count: string, body: string, accent?: string): string {
  const open = shopView.open.has(id);
  const tint = accent ? ` style="--acc-accent:${accent};"` : '';
  return `
    <section class="gs-acc gs-acc--shop${open ? '' : ' gs-acc--collapsed'}"${tint}>
      <button class="gs-acc__head" data-shop-panel="${id}" aria-expanded="${open ? 'true' : 'false'}">
        <span class="gs-acc__icon" aria-hidden="true">${icon}</span>
        <span class="gs-acc__title">${title}</span>
        ${count ? `<span class="gs-acc__count">${count}</span>` : ''}
        <span class="gs-acc__chev" aria-hidden="true">▾</span>
      </button>
      <div class="gs-acc__body">${body}</div>
    </section>`;
}

/** The world's club pro + a pithy line on how the last section went — the guts of the splash hero.
 *  Returns undefined when there's no last result (a fresh run / deep-link), so the hero can fall back. */
function proGreeting(): { avatar: string; name: string; title: string; line: string } | undefined {
  const last = state.lastResult;
  if (!last) return undefined;
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
  return { avatar: proAvatarSVG(archetype), name: pro.name, title: pro.title, line };
}

/** The TRAVEL-ONWARD hero button (GS-shop-stop-layout) — its own primary CTA with a ship graphic,
 *  sharing the top row with the Fuel Depot. The whole card is the button; a starfield backs the
 *  golfer's own ship streaking to the next world with an ion wake, so the next action reads as the
 *  hero it is. Dispatches `{type:'leaveShop'}` (same as the old hero CTA). */
function travelOnwardCardHTML(): string {
  const shipId = shipForCharacter(state, state.run.loadout.characterId);
  const action = JSON.stringify({ type: 'leaveShop' });
  // A compact starfield + the flying ship (ion wake armed) — pure SVG, no rng (fixed star positions).
  const stars = [
    [14, 20], [42, 12], [70, 30], [96, 16], [120, 26], [150, 14], [30, 44], [86, 50], [134, 46],
  ]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 1.3 : 0.8}" fill="#cfe8ff" opacity="${0.35 + (i % 4) * 0.14}"/>`)
    .join('');
  const art = `
    <svg viewBox="0 0 168 68" role="img" aria-label="Travel onward" style="display:block;width:100%;height:100%;">
      <defs><radialGradient id="gs-travelsky" cx="30%" cy="30%" r="90%">
        <stop offset="0%" stop-color="#16351f"/><stop offset="100%" stop-color="#0a1a12"/>
      </radialGradient></defs>
      <rect x="0" y="0" width="168" height="68" fill="url(#gs-travelsky)"/>
      ${stars}
      <g transform="rotate(-7 112 38)">${shipSVG(shipId, 112, 38, 1.55, { ion: true })}</g>
    </svg>`;
  return `
    <button class="gs-travelcard" data-action='${action}' aria-label="Travel onward to the next world">
      <span class="gs-travelcard__art">${art}</span>
      <span class="gs-travelcard__body">
        <span class="gs-travelcard__k">🚀 Travel onward</span>
        <span class="gs-travelcard__sub">Jump to the next world →</span>
      </span>
    </button>`;
}

/** The pro greeting + credits purse + reroll bar that opens the combined Pro Shop panel
 *  (GS-shop-stop-layout): the head pro, the run purse, and the stock-reroll all live together at the
 *  top of the one Pro Shop panel now, instead of a separate splash hero. */
function proShopIntroHTML(): string {
  const credits = state.run.credits;
  const pro = proGreeting();
  const proBlock = pro
    ? `<div class="gs-proshop__pro">
         <div class="gs-proshop__ava">${pro.avatar}</div>
         <div class="gs-proshop__say">
           <div class="gs-proshop__name">${pro.name}</div>
           <div class="gs-proshop__role">${pro.title}</div>
           <div class="gs-proshop__line">&ldquo;${pro.line}&rdquo;</div>
         </div>
       </div>`
    : `<div class="gs-proshop__pro">
         <div class="gs-proshop__say">
           <div class="gs-proshop__name">🏌 Head pro</div>
           <div class="gs-proshop__line">Kit out your bag before the next jump — stock rotates every stop.</div>
         </div>
       </div>`;
  const rr = rerollCost(state.shopRerolls ?? 0);
  const rerollBtn = credits >= rr
    ? btn(`🎲 Reroll · ${rr} cr`, { type: 'rerollShop' }, { variant: 'ghost' })
    : `<span class="gs-btn gs-btn--ghost" style="opacity:.45;cursor:not-allowed;font-size:12px;">🎲 Reroll needs ${rr} cr</span>`;
  return `
    ${proBlock}
    <div class="gs-proshop__bar">
      <span class="gs-proshop__purse">💰 <b>${credits}</b> credits</span>
      <div class="gs-proshop__cta">${rerollBtn}</div>
    </div>`;
}

// A short headline for a club chip — the bag ids ('D','5W','PW','60') already read well; only the
// long-form ids need a friendly cap.
function shortClubLabel(id: string): string {
  if (id === 'putter') return 'Putt';
  if (id === 'chip') return 'Chip';
  return id;
}

// The player's FULL bag inventory (GS-clubs-2, GS-pro-shop-redesign): the equipped-cosmetic staff BAG
// thumbnail for THIS golfer (or the default tier bag if no cosmetic is equipped), your gear/accessories,
// then every club you carry with its rarity + every reward-club SLOT you don't yet carry greyed out — so
// you can see what's in the bag, what a shop club would replace, and which gaps a new club would fill.
// Pure render off the live loadout + the golfer's cosmetics (no hook, no save state).
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
  // The bag header thumbnail (GS-pro-shop-redesign): prefer THIS golfer's equipped cosmetic staff bag;
  // otherwise fall back to the default-bag-tier thumbnail (only once the default bag is upgraded).
  const cid = loadout.characterId;
  const cosmeticBagId = golfBagForCharacter(state, cid);
  const cosmeticBag = apparelById(cosmeticBagId);
  const bt = loadout.bagTier ?? 'common';
  const bs = bagSet(bt);
  const bagHeader = (() => {
    if (cosmeticBag) {
      const art = `<div style="width:52px;flex:0 0 auto;border-radius:7px;overflow:hidden;">${apparelCardSVG(cosmeticBagId, 52, 52)}</div>`;
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">${art}<div style="font-size:12px;font-weight:700;opacity:.85;">🎒 ${cosmeticBag.name} — equipped bag</div></div>`;
    }
    const art = bt !== 'common' && bs ? `<div style="width:48px;flex:0 0 auto;border-radius:7px;overflow:hidden;">${drawGolfBag(bs.tint, bt)}</div>` : '';
    const label = bs && bt !== 'common' ? `🎒 ${bs.name} — your bag` : '🎒 Your bag — equipped clubs &amp; empty slots';
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">${art}<div style="font-size:12px;font-weight:700;opacity:.85;">${label}</div></div>`;
  })();
  return `
    <div style="padding:2px 2px 0;">
      ${gearRow}
      ${inspectCard}
      ${bagHeader}
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${chips}</div>
      <div style="font-size:10px;opacity:.55;margin-top:7px;">Coloured = equipped (border shows rarity). Greyed = an empty slot a reward club could fill. 🛒 = on sale in this shop.</div>
    </div>`;
}

/** The active-upgrades digest (GS-pro-shop-redesign): a headline row of every buff currently applying
 *  to the run — distance, accuracy, credits, putting, caddy, weather, ship — computed off the live
 *  loadout, then a tap-to-expand DETAIL that lists the actual items/perks producing them. So a player
 *  can see at a glance what's stacked up and drill into what's making each modification. */
type UpLine = { icon: string; label: string };
function upgradeLines(): UpLine[] {
  const l = state.run.loadout;
  const out: UpLine[] = [];
  const pct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}%`;
  // Distance & power
  if ((l.distanceClubBonus ?? 0) !== 0)
    out.push({ icon: '🚀', label: `${l.distanceClubBonus > 0 ? '+' : ''}${l.distanceClubBonus} yd off the tee` });
  const classBoost = Object.values(l.minCarryBoostByClass ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  if ((l.minCarryBoost ?? 0) > 0 || classBoost > 0) out.push({ icon: '📏', label: 'Tighter distance control' });
  if ((l.overpower ?? 0) > 0) out.push({ icon: '💥', label: `Overdrive ${pct((l.overpower ?? 0) * 100)} power` });
  // Accuracy
  if (l.dispersionMult < 1) out.push({ icon: '🎯', label: `${Math.round((1 - l.dispersionMult) * 100)}% tighter spread` });
  // Credits
  if (l.creditMult > 1) out.push({ icon: '💰', label: `${pct((l.creditMult - 1) * 100)} credits earned` });
  if ((l.birdieCredit ?? 0) > 0 || (l.eagleCredit ?? 0) > 0) out.push({ icon: '🐦', label: 'Birdie & eagle credit bonuses' });
  if ((l.comebackCredit ?? 0) > 0) out.push({ icon: '🛟', label: 'Comeback credits on a blow-up' });
  // Putting
  if ((l.puttBoost ?? 0) > 0) out.push({ icon: '⛳', label: `Putting skill +${l.puttBoost}` });
  if ((l.puttReadBonus ?? 0) > 0) out.push({ icon: '📖', label: `Green-read range +${l.puttReadBonus} yd` });
  if (l.greenRead) out.push({ icon: '🔮', label: 'Break read for you' });
  if (l.autoPutt) out.push({ icon: '🤖', label: 'Auto-putt' });
  // Caddy
  const caddy = namedCaddyOwned(l.perks);
  if (caddy) out.push({ icon: '🧢', label: `Caddy: ${shopItem(caddy)?.name ?? 'hired'}` });
  if (l.driverAnywhere && !caddy) out.push({ icon: '🏌', label: 'Driver from any lie' });
  // Weather & spin
  if ((l.windResist ?? 0) > 0) out.push({ icon: '🌬', label: `${Math.round((l.windResist ?? 0) * 100)}% less wind` });
  if ((l.backspinBoost ?? 0) > 0) out.push({ icon: '🌀', label: 'More backspin — approaches bite' });
  if (l.spinReadFull) out.push({ icon: '🎯', label: 'Reads the FULL approach roll' });
  else if ((l.spinReadBonus ?? 0) > 0) out.push({ icon: '🎯', label: `Backspin-line read +${l.spinReadBonus} yd` });
  // Hazard skips / novelty
  if (l.hazardImmune?.length) out.push({ icon: '🛡', label: `Skips ${[...new Set(l.hazardImmune)].join(' / ')}` });
  if (l.rainbowRoad) out.push({ icon: '🌈', label: 'Rainbow Ball' });
  // Ship / fuel
  if ((l.fuelEfficiency ?? 0) > 0) out.push({ icon: '🌀', label: `Ion thrusters — −${l.fuelEfficiency} ⛽ / jump` });
  if ((l.tankBonus ?? 0) > 0) out.push({ icon: '🛢', label: `Reserve tank — +${l.tankBonus} capacity` });
  // Bag tier
  const bt = l.bagTier ?? 'common';
  if (bt !== 'common') out.push({ icon: '🎒', label: `${bt.charAt(0).toUpperCase()}${bt.slice(1)} default bag` });
  return out;
}

/** The expandable DETAIL under the upgrades digest: the actual owned items/perks producing the buffs,
 *  grouped (reward clubs / caddy / gear & relics), each with its name and effect blurb. */
function upgradeDetailHTML(): string {
  const perks = [...new Set(state.run.loadout.perks)];
  const caddyIds: string[] = [];
  const clubIds: string[] = [];
  const gearIds: string[] = [];
  for (const id of perks) {
    const it = shopItem(id);
    if (!it) continue;
    if (it.caddy) caddyIds.push(id);
    else if (it.clubType) clubIds.push(id);
    else gearIds.push(id);
  }
  const groups: { title: string; ids: string[] }[] = [
    { title: '🧢 Caddy', ids: caddyIds },
    { title: '⛳ Reward clubs', ids: clubIds },
    { title: '🧤 Gear & relics', ids: gearIds },
  ];
  const rows = groups
    .filter((g) => g.ids.length)
    .map((g) => {
      const items = g.ids
        .map((id) => {
          const it = shopItem(id)!;
          const n = ownedCount(state.run.loadout.perks, id);
          const col = rarCol(it.rarity);
          return `<li style="margin:0 0 5px;list-style:none;">
            <span style="font-weight:700;color:${col};">${it.name}${n > 1 ? ` ×${n}` : ''}</span>
            <span style="opacity:.7;"> — ${it.desc}</span>
          </li>`;
        })
        .join('');
      return `<div style="margin:0 0 8px;">
        <div style="font-size:11px;font-weight:800;opacity:.8;letter-spacing:.02em;margin:0 0 4px;">${g.title}</div>
        <ul style="margin:0;padding:0;font-size:12px;line-height:1.4;">${items}</ul>
      </div>`;
    })
    .join('');
  const bt = state.run.loadout.bagTier ?? 'common';
  const baked = bt !== 'common'
    ? `<div style="margin:2px 0 0;font-size:11.5px;opacity:.65;">⚙ Baked in: <b>${bt}</b> default-bag tier (all your starter clubs upgraded).</div>`
    : '';
  return rows || baked
    ? `${rows}${baked}`
    : `<p style="font-size:12px;opacity:.6;margin:2px 0 0;">Every buff above comes from your golfer &amp; ship — buy gear below to stack more.</p>`;
}

function upgradesPanelBodyHTML(): string {
  const lines = upgradeLines();
  const chips = lines.length
    ? `<div class="gs-upchips">${lines
        .map((u) => `<span class="gs-upchip"><span class="gs-upchip__i" aria-hidden="true">${u.icon}</span>${u.label}</span>`)
        .join('')}</div>`
    : `<p style="font-size:12px;opacity:.6;margin:2px 0 8px;">No upgrades active yet — buy gear from the Pro Shop to power up your run.</p>`;
  const detailOpen = shopView.open.has('upgradesDetail');
  const detail = `
    <button class="gs-updetail__toggle" data-shop-panel="upgradesDetail" aria-expanded="${detailOpen ? 'true' : 'false'}">
      ${detailOpen ? '▾ Hide' : '▸ Show'} what's making these modifications
    </button>
    ${detailOpen ? `<div class="gs-updetail__body">${upgradeDetailHTML()}</div>` : ''}`;
  return `${chips}${detail}`;
}

/** The FUEL DEPOT (GS-fuel, restyled GS-fuel-2, GS-pro-shop-redesign) — the fixed refuelling counter
 *  shown at the Pro Shop and on the journey screen (never part of the rotating offer, so fuel is always
 *  purchasable). The LOCAL price is the headline (it rises with galaxy depth). GS-pro-shop-redesign: the
 *  +1 / +3 / Fill quick-buy buttons ALWAYS render (greyed when the purse or tank says no) so the panel
 *  never changes height as fuel drains — no more layout jump when the options appear/disappear. */
export function fuelDepotHTML(opts: { compact?: boolean } = {}): string {
  const r = state.run;
  const compact = !!opts.compact;
  const cap = tankCapacity(r);
  const price = fuelUnitCost(r);
  const space = Math.max(0, cap - r.fuel);
  // A fixed quick-buy button: it buys exactly `units` (Fill = all remaining), disabled when the tank
  // can't take that many or the purse can't cover it. Always rendered so the row height is constant.
  const quick = (units: number, label: string): string => {
    const n = Math.min(units, space);
    const cost = n * price;
    const ok = n > 0 && r.credits >= cost;
    const text = `${label} · ${cost} cr`;
    return ok
      ? btn(text, { type: 'buyFuel', units: n }, { variant: 'ghost', borderColor: '#4fd0e066' })
      : `<span class="gs-btn gs-btn--ghost" style="opacity:.38;cursor:not-allowed;flex:1 1 auto;font-size:13px;padding:9px 10px;text-align:center;">${text}</span>`;
  };
  const tankNote = space <= 0
    ? `<span class="gs-fueldepot__state" style="color:#4fd0e0;">tank full</span>`
    : r.fuel <= 2
      ? `<span class="gs-fueldepot__state" style="color:var(--gs-danger);">running dry!</span>`
      : '';
  // The compact variant (GS-shop-stop-layout) rides the shop's top row beside Travel Onward: a tighter
  // header, the quick-buy buttons STACKED to fit the narrow half-column, and the long explainer dropped
  // (it stays on the journey-screen depot sheet). The fitted-upgrade one-liners are kept — they're live
  // status, not filler. The full variant (no opts) is unchanged for the travel screen's depot sheet.
  const fittedNotes = `${
    (r.loadout.fuelEfficiency ?? 0) > 0
      ? `<p class="gs-fueldepot__note" style="color:#7ff3ff;opacity:.85;">🌀 Ion thrusters — −${r.loadout.fuelEfficiency} ⛽ / jump.</p>`
      : ''
  }${
    (r.loadout.tankBonus ?? 0) > 0
      ? `<p class="gs-fueldepot__note" style="color:#4fd0e0;opacity:.85;">🛢 Reserve tank — +${r.loadout.tankBonus} cap.</p>`
      : ''
  }`;
  if (compact) {
    return `
      <div class="gs-fueldepot gs-fueldepot--compact">
        <div class="gs-fueldepot__head">
          <span class="gs-fueldepot__title">⛽ FUEL</span>
          <b style="font-size:13px;color:${fuelColour(r.fuel, cap)};margin-left:auto;">${r.fuel}/${cap}</b>
        </div>
        <div class="gs-fueldepot__gauge">${fuelGaugeHTML(r.fuel, cap, { bare: true })}</div>
        <div class="gs-fueldepot__meta">
          ${tankNote || `<span class="gs-fueldepot__price">${price} cr / unit</span>`}
        </div>
        <div class="gs-fueldepot__row gs-fueldepot__row--stack">${quick(1, '+1 ⛽')}${quick(3, '+3 ⛽')}${quick(space || 1, 'Fill ⛽')}</div>
        ${fittedNotes}
      </div>`;
  }
  return `
    <div class="gs-fueldepot">
      <div class="gs-fueldepot__head">
        <span class="gs-fueldepot__title">⛽ FUEL DEPOT</span>
        ${fuelGaugeHTML(r.fuel, cap, { bare: true })}
        <b style="font-size:13px;color:${fuelColour(r.fuel, cap)};">${r.fuel}/${cap}</b>
        ${tankNote}
        <span class="gs-fueldepot__price">${price} cr / unit</span>
      </div>
      <div class="gs-fueldepot__row">${quick(1, '+1 ⛽')}${quick(3, '+3 ⛽')}${quick(space || 1, 'Fill ⛽')}</div>
      <p class="gs-fueldepot__note">A jump burns its distance in fuel (a deep jump = 2–3 units). Fuel gets dearer the deeper you fly — launching short-tanked auto-charges the local price.</p>
      ${fittedNotes}
    </div>`;
}

export function shopScreen(): string {
  const perks = state.run.loadout.perks;
  const credits = state.run.credits;
  // The caddy-swap warning (GS-caddy-factions): clicking a new caddy while one is on the bag parks a
  // `pendingFireCaddy`; show a "they won't be happy to be fired" confirmation before the hire lands.
  const fireWarning = (() => {
    const p = state.pendingFireCaddy;
    if (!p) return '';
    const oldName = shopItem(p.oldId)?.name ?? 'your caddy';
    const newItem = shopItem(p.newId);
    const newName = newItem?.name ?? 'the new caddy';
    const cost = newItem ? itemCost(newItem, ownedCount(perks, p.newId)) : 0;
    return `
      <div class="gs-panel" style="margin:0 0 10px;padding:12px 14px;border:2px solid var(--gs-danger);border-radius:12px;background:color-mix(in srgb, var(--gs-danger) 12%, transparent);">
        <div style="font-weight:800;font-size:14px;margin-bottom:5px;">⚠️ Fire ${oldName}?</div>
        <div style="font-size:12.5px;line-height:1.45;opacity:.92;margin-bottom:10px;">
          You can only keep <b>one</b> caddy on the bag. Hiring <b>${newName}</b> means giving <b>${oldName}</b> their marching orders — and nobody likes being sacked. ${oldName} will storm off and <b>won't work for you again for the rest of this run</b>.
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${btn(`Fire ${oldName} · hire ${newName} (${cost} cr)`, { type: 'buy', id: p.newId, confirmFire: true }, { variant: 'primary' })}
          ${btn(`Keep ${oldName}`, { type: 'cancelFireCaddy' }, { variant: 'ghost' })}
        </div>
      </div>`;
  })();
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
  // clubs (GS-clubs-2) share ONE rack — no separate row.
  const stockItems = (state.shopOffer ?? [])
    .map((id) => shopItem(id))
    .filter((it): it is NonNullable<typeof it> => !!it)
    // Named caddies STAY on the rack even once you've hired one (GS-caddy-factions) — hiring a new one
    // fires the incumbent, so the swap must be offerable. Drop only the one you already own (nothing to
    // buy) and any caddy you FIRED this run (they've stormed off and won't return until a future run).
    .filter((it) => it.caddy !== 'named' || (ownedCount(perks, it.id) === 0 && !state.run.firedCaddies.includes(it.id)));
  const stock = stockItems.map(renderCard).join('');
  // The combined Pro Shop panel (GS-shop-stop-layout): the pro greeting + credits purse + reroll
  // (the old separate splash hero) now open the SAME panel as the stock rack — Pro & Pro Shop as one.
  const shopBody = `
    ${proShopIntroHTML()}
    <p class="gs-acc__blurb" style="text-align:left;">Tap a card to buy. Stock rotates each stop — deeper stops carry rare/epic power. Stackables cost more the more you own; you can only keep one caddy (hiring fires your current one).</p>
    <div style="display:flex;flex-wrap:wrap;justify-content:center;">${stock || '<p style="font-size:13px;opacity:.6;">Sold out — reroll or travel on.</p>'}</div>`;
  const clubCount = state.run.loadout.bag.length;
  // Layout (GS-shop-stop-layout): a two-up top row — the Travel-Onward hero button beside a compact
  // Fuel Depot — then the combined Pro Shop, then Upgrades & Effects ABOVE the Golf Bag.
  return `
    ${header()}
    ${fireWarning}
    <div class="gs-shoptop">
      ${travelOnwardCardHTML()}
      ${fuelDepotHTML({ compact: true })}
    </div>
    ${shopPanel('shop', '🛒', 'Pro Shop', `${stockItems.length} in stock`, shopBody, rarCol(state.course.rarity))}
    ${shopPanel('upgrades', '⭐', 'Upgrades & Effects', `${upgradeLines().length} active`, upgradesPanelBodyHTML())}
    ${shopPanel('bag', '🎒', 'Golf Bag', `${clubCount} clubs`, bagInventoryHTML())}`;
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
