/**
 * The Trade Market (GS-clubhouse / GS-market-accordion): the Star-Shard cosmetic catalogue —
 * ships, apparel and bag tiers — split into uniform collapsible sections. Buying grants GLOBAL
 * ownership; equipping happens per golfer in the Clubhouse. Unlock-gated gear stays hidden until
 * unlockable (GS-hide-unlocks) via the per-catalogue reveal predicates.
 */

import { btn, state } from './ctx';
import type { Action } from '../ui/game';
import { canBuyShip, shipCatalogue, shipRevealedInMarket, type Ship } from '../sim/rpg/ships';
import { shipCardSVG } from '../render/shipArt';
import { cosmeticRarCol, isMythic } from '../sim/rpg/cosmetics';
import { apparelForSlot, apparelRevealedInMarket, canBuyApparel, type Apparel, type ApparelSlot } from '../sim/rpg/apparel';
import { apparelCardSVG } from '../render/apparelArt';
import { BAG_SETS, bagSet, bagSetRevealedInMarket, bagSetUnlocked, bagTierRank, canBuyBagSet, type BagSet } from '../sim/rpg/bag';
import { rarCol } from '../sim/rpg/loot';
import { drawGolfBag } from '../render/itemArt';

// Trade Market view state: every section starts collapsed (re-seeded from MARKET_SECTION_IDS each
// time the market opens — see app.ts's dispatch) and "Show Owned" starts OFF, so the market lands
// compact and on the buyable racks. View-only module state, toggled via [data-toggle-section] /
// [data-market-showowned] + re-render, never persisted.
export const MARKET_SECTION_IDS = ['ships', 'hat', 'shirt', 'pants', 'driver', 'bag', 'bags'] as const;
export const marketView = {
  showOwned: false,
  collapsed: new Set<string>(MARKET_SECTION_IDS),
};

/** A ship card (GS-garage) — the vector ship over a rarity-ringed panel, with name/set + a footer
 *  (cost in the market, or a SELECT / SELECTED state in the garage). Clickable when `action` given. */
export function shipCardHTML(ship: Ship, footer: string, opts: { action?: Action; ring: string; dim?: boolean; glow?: boolean } = { ring: '#8aa0c0' }): string {
  const inner = `
    <div style="border:2px solid ${opts.ring};border-radius:12px;padding:8px 6px 6px;background:radial-gradient(circle at 50% 28%, ${opts.ring}22, #0b0d12);text-align:center;width:130px;${opts.dim ? 'opacity:.55;' : ''}${opts.glow ? `box-shadow:0 0 0 2px ${opts.ring}, 0 0 14px ${opts.ring}66;` : ''}">
      ${shipCardSVG(ship.id, 116, 60)}
      <div style="font-size:12.5px;font-weight:700;margin-top:2px;">${ship.name}</div>
      <div style="font-size:10px;opacity:.55;">${ship.set} · ${ship.rarity}</div>
      <div style="font-size:11px;margin-top:3px;color:${opts.ring};font-weight:700;">${footer}</div>
    </div>`;
  return opts.action
    ? `<div class="gs-clickcard" data-action='${JSON.stringify(opts.action)}' style="cursor:pointer;margin:5px;">${inner}</div>`
    : `<div style="margin:5px;">${inner}</div>`;
}

/** One collapsible Trade-Market section (GS-market-accordion): a tap-to-toggle header (icon · title ·
 *  owned/total count · chevron) over a card rack, so the long catalogue stays navigable as it grows.
 *  Collapse state is module-local (`marketView.collapsed`) + re-rendered — same view-only pattern as
 *  `shopView.inspectGearId` (native <details> can't be used: render() replaces app.innerHTML on every
 *  buy, which would reset the open state). Sections start collapsed on open (see marketView). Every
 *  section shares this chrome so the catalogue reads consistently. */
function marketSection(
  id: string,
  icon: string,
  title: string,
  owned: number,
  total: number,
  blurb: string,
  rack: string,
): string {
  const collapsed = marketView.collapsed.has(id);
  return `
    <section class="gs-acc${collapsed ? ' gs-acc--collapsed' : ''}">
      <button class="gs-acc__head" data-toggle-section="${id}" aria-expanded="${collapsed ? 'false' : 'true'}">
        <span class="gs-acc__icon" aria-hidden="true">${icon}</span>
        <span class="gs-acc__title">${title}</span>
        <span class="gs-acc__count">${owned}/${total}</span>
        <span class="gs-acc__chev" aria-hidden="true">▾</span>
      </button>
      <div class="gs-acc__body">
        ${blurb ? `<p class="gs-acc__blurb">${blurb}</p>` : ''}
        <div class="gs-acc__rack">${rack}</div>
      </div>
    </section>`;
}

/** The Trade Market (GS-clubhouse): spend Star Shards on cosmetic ships, clothing, and bag tiers. Buying
 *  grants GLOBAL ownership — you then outfit each golfer individually in the Clubhouse. The full browsable
 *  catalogue is split into uniform collapsible sections (GS-market-accordion) so it stays navigable. */
export function tradeMarketScreen(): string {
  // Earned Unending-Universe unlocks (ships/apparel) and locked Ascension bag tiers stay OUT of the
  // rack entirely until they're unlocked/owned (GS-hide-unlocks) — the market only shows what you can
  // actually buy or already have, never spoiling a milestone reward.
  // A section whose only items are owned goes empty once Show Owned is off — show this instead of a
  // blank rack so the fold still reads (its count header still shows the owned/total tally).
  const emptyRackNote = '<p class="gs-acc__blurb" style="opacity:.55;">You own everything here — flip on <b>Show Owned</b> above to browse it.</p>';
  const ships = shipCatalogue().filter((s) => shipRevealedInMarket(s, state.ownedShips));
  // Owned rides sink to the bottom of the rack (greyed out) so the buyable fleet reads first (stable
  // sort keeps rarity order within each group). With Show Owned off they're dropped from the rack
  // entirely — a fully-owned section shows a gentle note instead of an empty rack.
  const shipCards =
    ships
      .filter((s) => marketView.showOwned || !state.ownedShips.includes(s.id))
      .sort((a, b) => Number(state.ownedShips.includes(a.id)) - Number(state.ownedShips.includes(b.id)))
    .map((ship) => {
      const ring = cosmeticRarCol(ship.rarity);
      const owned = state.ownedShips.includes(ship.id);
      const afford = canBuyShip(ship, state.shards, state.ownedShips);
      let footer: string;
      let action: Action | undefined;
      if (owned) {
        footer = '✓ owned';
      } else if (afford) {
        footer = `✦ ${ship.cost}`;
        action = { type: 'buyShip', id: ship.id };
      } else {
        footer = `✦ ${ship.cost} — short`;
      }
      return shipCardHTML(ship, footer, { ring, dim: owned || !afford, glow: isMythic(ship.rarity) && !owned, action });
    })
    .join('') || emptyRackNote;
  const shipsOwned = ships.filter((s) => state.ownedShips.includes(s.id)).length;

  // One uniform collapsible clothing rack per slot (hats / shirts / pants / bag), each with its owned
  // tally. Earned-only garments (Unending-Universe trophies) are hidden until owned, so a slot with
  // nothing yet revealed (e.g. Caddy Bags before any are earned) drops out of the market entirely.
  const apparelSection = (slot: ApparelSlot, icon: string, title: string, blurb: string) => {
    const items = apparelForSlot(slot).filter((a) => apparelRevealedInMarket(a, state.ownedApparel));
    if (!items.length) return '';
    const owned = items.filter((a) => state.ownedApparel.includes(a.id)).length;
    // With Show Owned off, owned garments drop out of the rack; on, they sink to the bottom (greyed)
    // so the buyable rack still reads first. Stable sort keeps rarity order within each group.
    const rack =
      items
        .filter((a) => marketView.showOwned || !state.ownedApparel.includes(a.id))
        .sort((a, b) => Number(state.ownedApparel.includes(a.id)) - Number(state.ownedApparel.includes(b.id)))
        .map(marketApparelCardHTML)
        .join('') || emptyRackNote;
    return marketSection(slot, icon, title, owned, items.length, blurb, rack);
  };

  return `
    <header style="border-left:4px solid #e08a2b;padding-left:10px;">
      <h1 style="margin:0;font-size:22px;">🚀 Trade Market</h1>
      <p style="opacity:.75;font-size:13px;margin:.3em 0;">Spend Star Shards on ships, clothing &amp; bag tiers. Cosmetic only — buy it here, then outfit each golfer in the <b>Clubhouse</b>. Tap a section to fold it away.</p>
    </header>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:.6em 0 .4em;flex-wrap:wrap;">
      <h2 style="font-size:16px;margin:0;">✦ ${state.shards} Star Shards</h2>
      <button class="gs-setrow" data-market-showowned="1" aria-pressed="${marketView.showOwned}" style="width:auto;padding:6px 10px;gap:9px;border-top:none;border-radius:999px;background:#ffffff08;">
        <span class="gs-setlabel"><b>Show Owned</b></span>
        <span class="gs-toggle${marketView.showOwned ? ' gs-toggle--on' : ''}" aria-hidden="true"><span class="gs-knob"></span></span>
      </button>
    </div>
    ${marketSection(
      'ships',
      '🚀',
      'Ships',
      shipsOwned,
      ships.length,
      'The full fleet. The rarer the ride, the steeper the shard price — the Mothership is the grail.',
      shipCards,
    )}
    ${apparelSection('hat', '🎩', 'Hats', 'Caps &amp; crowns. Complete a matching set across every slot for the full look.')}
    ${apparelSection('shirt', '👕', 'Shirts', 'Tops &amp; jackets to suit each golfer.')}
    ${apparelSection('pants', '👖', 'Pants', 'Trousers &amp; legwear to finish the outfit.')}
    ${apparelSection('driver', '🔨', 'Clubs', 'Legendary driver skins your golfer swings — earned on the course, never sold.')}
    ${apparelSection('bag', '🎒', 'Caddy Bags', 'Cosmetic staff bags your golfer poses with in the Clubhouse — earned in the <b>Unending Universe</b>, never sold.')}
    ${bagSetSection()}
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
      ${btn('🏠 Clubhouse', { type: 'openClubhouseHall' }, { variant: 'ghost' })}
      ${btn('← Back to title', { type: 'closeMarket' }, { variant: 'ghost' })}
    </div>`;
}

/** A bag-set card (GS-bag-tiers): the blinged golf bag over a rarity panel, with a buy / owned /
 *  equipped / locked footer. Clickable only when it's a buyable, unlocked, affordable upgrade. */
function bagSetCardHTML(set: BagSet): string {
  const ring = rarCol(set.tier);
  const currentRank = bagTierRank(state.bagTier);
  const current = state.bagTier === set.tier;
  const owned = bagTierRank(set.tier) <= currentRank && currentRank > 0;
  const unlocked = bagSetUnlocked(set, state.maxAscension);
  const afford = canBuyBagSet(set, state.bagTier, state.maxAscension, state.shards);
  let footer: string;
  let action: Action | undefined;
  if (current) {
    footer = '✓ EQUIPPED';
  } else if (owned) {
    footer = '✓ owned';
  } else if (!unlocked) {
    // Defensive only: a locked set is filtered out of the market until its gate clears
    // (GS-hide-unlocks, `bagSetRevealedInMarket`), so a visible card is always unlocked/owned.
    footer = `🔒 Clear ${set.gateLabel}`;
  } else if (afford) {
    footer = `✦ ${set.cost}`;
    action = { type: 'buyBagTier', tier: set.tier };
  } else {
    footer = `✦ ${set.cost} — short`;
  }
  // Grey out anything that isn't the buyable frontier: locked gates, owned lower tiers, and
  // can't-affords all dim; only the equipped tier (highlighted) and buyable upgrades stay bright.
  const dim = !current && (!unlocked || owned || !afford);
  const inner = `
    <div title="${set.blurb}" style="border:2px solid ${current ? '#ffce54' : ring};border-radius:12px;padding:8px 6px 6px;background:radial-gradient(circle at 50% 28%, ${ring}22, #0b0d12);text-align:center;width:130px;${dim ? 'opacity:.55;' : ''}${current ? `box-shadow:0 0 0 2px #ffce54, 0 0 14px ${ring}66;` : ''}">
      ${drawGolfBag(set.tint, set.tier)}
      <div style="font-size:12.5px;font-weight:700;margin-top:3px;">${set.name}</div>
      <div style="font-size:10px;opacity:.55;text-transform:capitalize;">${set.tier} · clear ${set.gateLabel}</div>
      <div style="font-size:11px;margin-top:3px;color:${current ? '#ffce54' : ring};font-weight:700;">${footer}</div>
    </div>`;
  return action
    ? `<div class="gs-clickcard" data-action='${JSON.stringify(action)}' style="cursor:pointer;margin:4px;">${inner}</div>`
    : `<div style="margin:4px;">${inner}</div>`;
}

/** The Bag & Club Sets shop (GS-bag-tiers): permanent Star-Shard upgrades that lift EVERY golfer's
 *  starting bag to a higher loot rarity (better distance clubs + a steadier putter + blinged graphics),
 *  unlocked by CLEARING the Ascension gates. The won-bag also makes the Pro Shop skip lower-rarity clubs. */
function bagSetSection(): string {
  // Locked club-set upgrades stay hidden until their Ascension gate is cleared (GS-hide-unlocks) — the
  // market only shows tiers you can actually buy now or already own. If none are revealed yet (a fresh
  // common-bag player who's cleared no gate), the whole section drops out rather than teasing locked gear.
  const sets = BAG_SETS.filter((s) => bagSetRevealedInMarket(s, state.maxAscension, state.bagTier));
  if (!sets.length) return '';
  const current = bagSet(state.bagTier);
  const currentLabel = current ? `${current.name} (${state.bagTier})` : 'Starter bag (common)';
  const moreToUnlock = BAG_SETS.some((s) => !bagSetUnlocked(s, state.maxAscension) && bagTierRank(s.tier) > bagTierRank(state.bagTier));
  // Keep the roadmap generic so a not-yet-unlocked tier isn't named/spoiled before its gate is cleared.
  const hint = moreToUnlock
    ? 'Clear a higher Ascension gate to unlock the next tier.'
    : 'Every bag tier is unlocked — outfit the deepest run.';
  // "Owned" = every tier at or below the equipped one (the starter/common tier doesn't count).
  const currentRank = bagTierRank(state.bagTier);
  const owned = currentRank > 0 ? sets.filter((s) => bagTierRank(s.tier) <= currentRank).length : 0;
  const blurb = `Permanent upgrades that re-outfit <b>every</b> golfer's starting bag in a higher rarity — longer woods, a steadier putter, and a blingier bag for the deep-Ascension grind. Buying one also stops the Pro Shop dangling clubs below your bag's rarity. Current: <b>${currentLabel}</b>. ${hint}`;
  // A tier at or below the equipped one counts as owned — hidden with Show Owned off.
  const rack =
    sets.filter((s) => marketView.showOwned || bagTierRank(s.tier) > currentRank).map(bagSetCardHTML).join('') ||
    '<p class="gs-acc__blurb" style="opacity:.55;">You own every tier here — flip on <b>Show Owned</b> above to browse it.</p>';
  return marketSection('bags', '🎒', 'Bag &amp; Club Sets', owned, sets.length, blurb, rack);
}

/** Shared apparel card chrome — the garment art over a rarity-ringed panel with a footer. */
export function apparelCardChrome(item: Apparel, footer: string, opts: { ring: string; accent: string; action?: Action; dim?: boolean; glow?: boolean }): string {
  const inner = `
    <div style="border:2px solid ${opts.accent};border-radius:12px;padding:8px 6px 6px;background:radial-gradient(circle at 50% 30%, ${opts.ring}22, #0b0d12);text-align:center;width:130px;${opts.dim ? 'opacity:.5;' : ''}${opts.glow ? `box-shadow:0 0 0 2px ${opts.accent}, 0 0 14px ${opts.ring}88;` : ''}">
      ${apparelCardSVG(item.id, 104, 64)}
      <div style="font-size:12.5px;font-weight:700;margin-top:2px;">${item.name}</div>
      <div style="font-size:10px;opacity:.55;">${item.set} · ${item.rarity}</div>
      <div style="font-size:11px;margin-top:3px;color:${opts.accent};font-weight:700;">${footer}</div>
    </div>`;
  return opts.action
    ? `<div class="gs-clickcard" data-action='${JSON.stringify(opts.action)}' style="cursor:pointer;margin:4px;">${inner}</div>`
    : `<div style="margin:4px;">${inner}</div>`;
}

/** A Trade-Market clothing card (GS-clubhouse) — buy if unowned & affordable, else "owned" / "short". */
function marketApparelCardHTML(item: Apparel): string {
  const ring = cosmeticRarCol(item.rarity);
  const owned = state.ownedApparel.includes(item.id);
  const afford = canBuyApparel(item, state.shards, state.ownedApparel);
  let footer: string;
  let action: Action | undefined;
  if (owned) {
    footer = '✓ owned';
  } else if (item.unlockHoles) {
    // Defensive only: an unowned Unending-Universe trophy is filtered out of the market entirely now
    // (GS-hide-unlocks, `apparelRevealedInMarket`), so a visible unlockHoles card is always owned above.
    footer = `🔒 Survive ${item.unlockHoles} holes · Unending Universe`;
  } else if (afford) {
    footer = `✦ ${item.cost}`;
    action = { type: 'buyApparel', id: item.id };
  } else {
    footer = `✦ ${item.cost} — short`;
  }
  return apparelCardChrome(item, footer, { ring, accent: ring, action, dim: owned || !afford, glow: isMythic(item.rarity) && !owned });
}
