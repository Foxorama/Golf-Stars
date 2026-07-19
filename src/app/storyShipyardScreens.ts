/**
 * The Story-Tour SHIPYARD (GS-story-ships). Reached from the spaceport clubhouse ("🚀 Shipyard"): buy and
 * fly the campaign fleet. Ships come a scattering of DIFFERENT WAYS — for sale, revealed after clearing N
 * worlds, earned by an ace, or a late grail — and each carries a credit-earning bonus, so a ship is a real
 * choice. Tapping one raises the reusable lore card (ship art + effect detail + bespoke lore + Buy/Fly).
 * Built from design tokens + a self-contained `.gs-yard*` style block (own prefix — no global collision).
 */

import { state } from './ctx';
import { rarCol } from '../sim/rpg/loot';
import { getCharacter } from '../sim/rpg/characters';
import { shipCardSVG } from '../render/shipArt';
import { itemArtSVG } from '../render/itemArt';
import { loreCardHTML } from '../render/loreCard';
import type { StoryState } from '../sim/rpg/story';
import { COSMETIC_RARITY } from '../sim/rpg/cosmetics';
import { DEFAULT_SHIP_ID } from '../sim/rpg/ships';
import { staticCourseSpec } from '../sim/course/staticCourses';
import {
  storyShipRow,
  storyShipHull,
  storyShipRevealed,
  storyShipOwned,
  storyShipEquipped,
  canBuyStoryShip,
  storyShipDetail,
  worldShipStock,
  type StoryShip,
} from '../sim/rpg/storyShips';
import {
  shipUpgradeById,
  isShipUpgradeId,
  upgradeRevealed,
  ownsUpgrade,
  canBuyUpgrade,
  upgradeDetail,
  combatRating,
  type UpgradeCategory,
  type StoryShipUpgrade,
} from '../sim/rpg/storyShipUpgrades';

/** The campaign golfer's short name for the Parrot's line. */
function who(story: StoryState): string {
  return getCharacter(story.characterId)?.name ?? 'Champion';
}

/** loreCard accent wants a base `Rarity`; a mythic hull maps to the legendary gold. */
function shipAccent(shipId: string): string {
  const hull = storyShipHull(shipId);
  if (!hull) return '#5b8bd0';
  return hull.rarity === 'mythic' ? '#e08a2b' : rarCol(hull.rarity as 'common' | 'rare' | 'epic' | 'legendary');
}

export function storyShipyardScreen(): string {
  const story = state.story;
  if (!story) {
    return `
      <header class="gs-hero"><h1 class="gs-hero-title">🚀 Shipyard</h1></header>
      <div style="max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'exitStoryShipyard' })}'>‹ Back</button>
      </div>`;
  }
  const overlay = state.storyItemInspectId ? inspectOverlay(state.storyItemInspectId) : '';
  const rating = combatRating(story);
  const vendorWorldId = state.storyShipyardWorldId;

  // ── HANGAR (clubhouse, no vendor world): fly an owned ship, see your combat rating. NO buying — ships
  //    and upgrades are bought at the ship-vendor WORLDS (GS-story-ship-vendors). ────────────────────────
  if (!vendorWorldId) {
    const owned = [DEFAULT_SHIP_ID, ...story.ownedShipIds.filter((id) => id !== DEFAULT_SHIP_ID)];
    const seen = new Set<string>();
    const cards = owned.filter((id) => (seen.has(id) ? false : (seen.add(id), true))).map((id) => yardCard(id)).join('');
    return `
      <header class="gs-hero gs-storyhub">
        <h1 class="gs-hero-title">🚀 Hangar</h1>
        <p class="gs-hero-tag">Fly your fleet</p>
        <div class="gs-hero-chips">
          <span class="gs-chip" style="border-color:#3a2030;color:#ff8a8a;font-size:14px;" title="fleet combat readiness for the finale">⚔ <b>${rating}</b> combat</span>
        </div>
      </header>
      <section style="max-width:600px;margin:2px auto 0;">
        <p style="text-align:center;color:var(--gs-dim);font-size:13px;line-height:1.5;margin:2px 0 12px;">
          <em>Your berth. Tap a ship you own to fly it.</em>
          <span style="display:block;margin-top:4px;color:#7fd8ff;font-size:12px;">New ships &amp; upgrades are bought at each world's <b>Shipyard</b> — fly out to the vendor worlds to arm up.</span>
        </p>
        <div class="gs-yard-grid">${cards}</div>
      </section>
      <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:16px auto 0;">
        <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStoryShipyard' })}'>‹ Back to the clubhouse</button>
      </div>
      ${overlay}
      ${YARD_STYLE}`;
  }

  // ── VENDOR (a cleared ship-vendor world): buy the ships + upgrades THIS world stocks. Travel back to
  //    a vendor world to buy what you skipped — the per-world economy (GS-story-ship-vendors). ───────────
  const worldName = staticCourseSpec(vendorWorldId)?.name ?? 'Shipyard';
  const stock = worldShipStock(vendorWorldId);
  const shipRows = stock.ships
    .map((id) => ({ id, row: storyShipRow(id) }))
    .filter(({ id, row }) => !row || storyShipRevealed(story, row) || storyShipOwned(story, id))
    .sort((a, b) => {
      const ra = storyShipHull(a.id)?.rarity ?? 'common';
      const rb = storyShipHull(b.id)?.rarity ?? 'common';
      return COSMETIC_RARITY[ra].order - COSMETIC_RARITY[rb].order;
    });
  const shipCards = shipRows.map(({ id }) => yardCard(id)).join('');

  const CATS: { cat: UpgradeCategory; label: string }[] = [
    { cat: 'weapon', label: '🔫 Weapons' },
    { cat: 'engine', label: '🚀 Engines' },
    { cat: 'shield', label: '🛡 Shields' },
  ];
  const stockUpgrades = stock.upgrades.map((id) => shipUpgradeById(id)).filter((u): u is StoryShipUpgrade => !!u);
  const upgradeSections = CATS.map(({ cat, label }) => {
    const items = stockUpgrades.filter((u) => u.category === cat && (upgradeRevealed(story, u) || ownsUpgrade(story, u.id)));
    if (!items.length) return '';
    return `<div class="gs-yard-usec">${label}</div><div class="gs-yard-grid">${items.map((u) => upgradeCard(u)).join('')}</div>`;
  }).join('');

  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title">🚀 ${worldName} Shipyard</h1>
      <p class="gs-hero-tag">Buy your ride · arm your ship</p>
      <div class="gs-hero-chips">
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:14px;" title="credits">✦ <b>${story.credits}</b></span>
        <span class="gs-chip" style="border-color:#3a2030;color:#ff8a8a;font-size:14px;" title="fleet combat readiness for the finale">⚔ <b>${rating}</b> combat</span>
      </div>
    </header>
    <section style="max-width:600px;margin:2px auto 0;">
      <p style="text-align:center;color:var(--gs-dim);font-size:13px;line-height:1.5;margin:2px 0 12px;">
        <em>This berth stocks its own hulls and arms — buy them here, or fly back for what you skip. The next world's yard carries different wares.</em>
      </p>
      ${shipCards ? `<div class="gs-yard-grid">${shipCards}</div>` : ''}

      ${upgradeSections ? `<h2 class="gs-yard-sec">Weapons &amp; upgrades</h2>
      <p style="text-align:center;color:var(--gs-dim);font-size:12px;line-height:1.5;margin:0 0 10px;">
        <span style="color:#7fe0a0;">🦜 "Arm up, ${who(story)}."</span> Every piece raises your <b style="color:#ff8a8a;">combat rating</b> — you'll need it when the serpent wakes.
      </p>${upgradeSections}` : ''}
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:16px auto 0;">
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStoryShipyard' })}'>‹ Leave the shipyard</button>
    </div>
    ${overlay}
    ${YARD_STYLE}`;
}

const YARD_STYLE = `
    <style>
      .gs-yard-sec{font-size:13px;font-weight:800;letter-spacing:.04em;color:var(--gs-ink,#eaf1fb);margin:18px 0 6px;padding-top:12px;border-top:1px solid #232b3b;}
      .gs-yard-usec{font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--gs-dim,#9fb0c8);margin:12px 0 7px;}
      .gs-yard-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;}
      .gs-yard-card{display:flex;flex-direction:column;align-items:center;gap:5px;text-align:center;cursor:pointer;
        background:linear-gradient(180deg,#141926,#0f131c);border:1px solid #262f42;border-top:3px solid var(--ac,#5b8bd0);
        border-radius:14px;padding:11px 10px 10px;transition:transform .12s ease,box-shadow .12s ease;position:relative;}
      .gs-yard-card:hover{transform:translateY(-2px);box-shadow:0 6px 18px -8px var(--ac,#5b8bd0);}
      .gs-yard-art{width:118px;height:66px;}
      .gs-yard-art svg{width:100%;height:100%;}
      .gs-yard-name{font-size:13.5px;font-weight:700;color:var(--gs-ink,#eaf1fb);line-height:1.2;}
      .gs-yard-state{font-size:12px;font-weight:800;}
      .gs-yard-state--flying{color:#7fe0a0;}
      .gs-yard-state--owned{color:#9fb0c8;}
      .gs-yard-state--price{color:var(--gs-gold,#e9c46a);}
      .gs-yard-state--no{color:#c86a6a;}
      .gs-yard-badge{position:absolute;top:8px;right:8px;font-size:10px;font-weight:800;letter-spacing:.03em;
        text-transform:uppercase;padding:1px 7px;border-radius:20px;background:#0b0f18;border:1px solid var(--ac,#5b8bd0);color:var(--ac,#5b8bd0);}
      .gs-yard-owned{text-align:center;color:#7fe0a0;font-weight:700;font-size:14px;padding:8px;}
      .gs-yard-cant{text-align:center;color:#c86a6a;font-size:13px;line-height:1.4;padding:6px;}
    </style>`;

/** A card per ship — art + name + its state (Flying / Fly / price / can't-afford). Tap → lore card. */
function yardCard(shipId: string): string {
  const story = state.story!;
  const hull = storyShipHull(shipId);
  const row = storyShipRow(shipId);
  if (!hull) return '';
  const ac = shipAccent(shipId);
  const owned = shipId === DEFAULT_SHIP_ID || storyShipOwned(story, shipId);
  const flying = storyShipEquipped(story, shipId);
  const badge = row ? acquireBadge(row) : '';
  let stateLine: string;
  if (flying) stateLine = `<span class="gs-yard-state gs-yard-state--flying">✈ Flying</span>`;
  else if (owned) stateLine = `<span class="gs-yard-state gs-yard-state--owned">Owned · tap to fly</span>`;
  else if (row && canBuyStoryShip(story, row)) stateLine = `<span class="gs-yard-state gs-yard-state--price">✦ ${row.price}</span>`;
  else if (row) stateLine = `<span class="gs-yard-state gs-yard-state--no">✦ ${row.price}</span>`;
  else stateLine = '';
  return `
    <div class="gs-yard-card" style="--ac:${ac};" data-action='${JSON.stringify({ type: 'storyInspectItem', itemId: shipId })}'>
      ${badge}
      <span class="gs-yard-art" aria-hidden="true">${shipCardSVG(shipId, 118, 66)}</span>
      <span class="gs-yard-name">${hull.name}</span>
      ${stateLine}
    </div>`;
}

/** An outfitting card (weapon/engine/shield). Tap → its lore card. */
function upgradeCard(u: StoryShipUpgrade): string {
  const story = state.story!;
  const owned = ownsUpgrade(story, u.id);
  const ac = rarCol(u.rarity);
  let stateLine: string;
  if (owned) stateLine = `<span class="gs-yard-state gs-yard-state--owned">✓ Installed</span>`;
  else if (canBuyUpgrade(story, u)) stateLine = `<span class="gs-yard-state gs-yard-state--price">✦ ${u.price}</span>`;
  else stateLine = `<span class="gs-yard-state gs-yard-state--no">✦ ${u.price}</span>`;
  return `
    <div class="gs-yard-card" style="--ac:${ac};" data-action='${JSON.stringify({ type: 'storyInspectItem', itemId: u.id })}'>
      <span class="gs-yard-badge">⚔ ${u.battle}</span>
      <span class="gs-yard-art" aria-hidden="true">${itemArtSVG(u.id, u.rarity)}</span>
      <span class="gs-yard-name">${u.name}</span>
      ${stateLine}
    </div>`;
}

/** A little corner badge naming the acquisition approach. */
function acquireBadge(row: StoryShip): string {
  const label =
    row.acquire === 'ace' ? 'Ace'
    : row.acquire === 'milestone' ? 'Earned'
    : row.acquire === 'secret' ? 'Grail'
    : '';
  return label ? `<span class="gs-yard-badge">${label}</span>` : '';
}

/** The tap-to-inspect lore card for a ship OR an upgrade, footer = the right buy/equip action.
 *  Exported so the ship interior's weapons/engine rooms (GS-story-ship-interior) reuse the same card. */
export function shipInspectOverlay(id: string): string {
  return inspectOverlay(id);
}
function inspectOverlay(id: string): string {
  const story = state.story;
  if (!story) return '';
  // GS-story-ship-upgrades: an outfitting item's lore card (Combat Rating + credit-bonus detail).
  if (isShipUpgradeId(id)) {
    const u = shipUpgradeById(id)!;
    const owned = ownsUpgrade(story, id);
    let footer: string;
    if (owned) footer = `<div class="gs-yard-owned">✓ Installed on your ship</div>`;
    else if (canBuyUpgrade(story, u)) footer = `<button class="gs-btn" data-action='${JSON.stringify({ type: 'storyBuyUpgrade', upgradeId: id })}'>Install · ✦ ${u.price}</button>`;
    else footer = `<div class="gs-yard-cant">Not enough credits — ✦ ${u.price} (you have ✦ ${story.credits})</div>`;
    return loreCardHTML({
      icon: itemArtSVG(id, u.rarity),
      name: u.name,
      tag: `${u.rarity.charAt(0).toUpperCase() + u.rarity.slice(1)} · ${u.category === 'weapon' ? 'Weapon' : u.category === 'engine' ? 'Engine' : 'Shield'}`,
      accent: rarCol(u.rarity),
      detail: upgradeDetail(u),
      lore: u.lore,
      footerHTML: footer,
      closeAttr: 'data-story-item-close="1"',
    });
  }
  const shipId = id;
  const hull = storyShipHull(shipId);
  const row = storyShipRow(shipId);
  if (!hull) return '';
  const owned = shipId === DEFAULT_SHIP_ID || storyShipOwned(story, shipId);
  const flying = storyShipEquipped(story, shipId);
  let footer: string;
  if (flying) {
    footer = `<div class="gs-yard-owned">✈ Flying this ship</div>`;
  } else if (owned) {
    footer = `<button class="gs-btn" data-action='${JSON.stringify({ type: 'storyEquipShip', shipId })}'>Fly this ship</button>`;
  } else if (row && canBuyStoryShip(story, row)) {
    footer = `<button class="gs-btn" data-action='${JSON.stringify({ type: 'storyBuyShip', shipId })}'>Buy &amp; fly · ✦ ${row.price}</button>`;
  } else if (row && row.acquire === 'ace') {
    footer = `<div class="gs-yard-cant">Earned only by a hole-in-one on a Story round.</div>`;
  } else if (row) {
    footer = `<div class="gs-yard-cant">Not enough credits — ✦ ${row.price} (you have ✦ ${story.credits})</div>`;
  } else {
    footer = `<div class="gs-yard-owned">Your starter ride.</div>`;
  }
  const detail = row ? storyShipDetail(row) : [`${hull.set} class · ${hull.rarity}`, 'Your trusty starter — where every voyage began.'];
  const lore = row ? row.lore : ['The woody station wagon you left Earth in. It has crossed more of the galaxy than most ships ever will, and it is not done yet.'];
  return (
    loreCardHTML({
      icon: shipCardSVG(shipId, 74, 74),
      name: hull.name,
      tag: `${hull.rarity === 'mythic' ? 'Mythic' : hull.rarity.charAt(0).toUpperCase() + hull.rarity.slice(1)} · ${hull.set} ship`,
      accent: shipAccent(shipId),
      detail,
      lore,
      footerHTML: footer,
      closeAttr: 'data-story-item-close="1"',
    })
  );
}
