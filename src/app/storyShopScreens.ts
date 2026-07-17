/**
 * The Story-Tour Pro Shop screen (GS-story-econ / GS-story-gear). Reached from a CLEARED world's dossier
 * on the galaxy map ("🛒 Pro Shop"): a per-world rack of themed CLUBS + effect-bearing GEAR you spend
 * campaign credits on. Tapping an item raises the reusable LORE CARD (GS-story-lore-cards) — art + name +
 * mechanical detail + flavour + a Buy action. Built from existing design tokens + a self-contained
 * `.gs-sshop*` style block (own prefix — no global CSS collision). Reads the live `state`; actions
 * dispatch via `data-action` wiring in app.ts.
 */

import { state } from './ctx';
import { rarCol } from '../sim/rpg/loot';
import { staticCourseSpec } from '../sim/course/staticCourses';
import { itemArtSVG } from '../render/itemArt';
import { loreCardHTML } from '../render/loreCard';
import {
  storyShopStock,
  storyGearStock,
  storyCardFor,
  storyCardOwned,
  storyCardEquipped,
  canBuyStoryCard,
  WORLD_SHOP_INTRO,
} from '../sim/rpg/storyShop';

/** The procedural art for any rack id — a themed club head, or the gear's kit (glove/cap/shoes/ball). */
function cardArt(id: string): string {
  const card = storyCardFor(id);
  if (!card) return '';
  return itemArtSVG(id, card.rarity, card.theme);
}

export function storyShopScreen(): string {
  const story = state.story;
  const worldId = state.storyShopWorldId;
  if (!story || !worldId) {
    // Defensive — should always open with a world; never crash.
    return `
      <header class="gs-hero"><h1 class="gs-hero-title">🛒 Pro Shop</h1></header>
      <div style="max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'exitStoryShop' })}'>‹ Back</button>
      </div>`;
  }
  const spec = staticCourseSpec(worldId);
  const courseName = spec?.name ?? 'this world';
  const intro = WORLD_SHOP_INTRO[worldId] ?? 'The pro shop is open for business.';
  const clubIds = storyShopStock(story, worldId).map((it) => it.id);
  const gearIds = storyGearStock(story, worldId).map((it) => it.id);

  const section = (label: string, ids: string[]): string =>
    ids.length ? `<h2 class="gs-sshop-sec">${label}</h2><div class="gs-sshop-grid">${ids.map(rackCard).join('')}</div>` : '';

  const anyStock = clubIds.length || gearIds.length;
  const body = anyStock
    ? `${section('Clubs', clubIds)}${section('Gear', gearIds)}`
    : `<div class="gs-sshop-empty">You've bought everything on this rack. Come back after you've charted new worlds.</div>`;

  const overlay = state.storyItemInspectId ? inspectOverlay(state.storyItemInspectId) : '';

  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title">🛒 Pro Shop</h1>
      <p class="gs-hero-tag">${courseName}</p>
      <div class="gs-hero-chips">
        <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:14px;" title="credits">✦ <b>${story.credits}</b></span>
        <span class="gs-chip" style="border-color:#2a3a2a;color:#7fe0a0;font-size:14px;" title="clubs in the bag">🎒 <b>${story.equippedBagIds.length}</b> / 14</span>
      </div>
    </header>
    <section style="max-width:560px;margin:2px auto 0;">
      <p style="text-align:center;color:var(--gs-dim);font-size:13px;line-height:1.5;margin:2px 0 10px;">
        <em>${intro}</em>
      </p>
      ${body}
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:16px auto 0;">
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'storyPlayWorld', courseId: worldId })}'>↺ Play this world again</button>
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStoryShop' })}'>‹ Back to the star chart</button>
    </div>
    ${overlay}
    <style>
      .gs-sshop-sec{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gs-dim,#9fb0c8);
        margin:12px 0 8px;padding-bottom:4px;border-bottom:1px solid #232b3b;}
      .gs-sshop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}
      .gs-sshop-card{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;cursor:pointer;
        background:linear-gradient(180deg,#141926,#0f131c);border:1px solid #262f42;border-top:3px solid var(--ac,#5b8bd0);
        border-radius:14px;padding:12px 10px 11px;transition:transform .12s ease,box-shadow .12s ease;}
      .gs-sshop-card:hover{transform:translateY(-2px);box-shadow:0 6px 18px -8px var(--ac,#5b8bd0);}
      .gs-sshop-art{width:76px;height:76px;}
      .gs-sshop-art svg{width:100%;height:100%;}
      .gs-sshop-name{font-size:13.5px;font-weight:700;color:var(--gs-ink,#eaf1fb);line-height:1.2;}
      .gs-sshop-blurb{font-size:11px;color:var(--gs-dim,#9fb0c8);line-height:1.3;min-height:2.2em;}
      .gs-sshop-price{font-size:13px;font-weight:800;color:var(--gs-gold,#e9c46a);}
      .gs-sshop-price--no{color:#c86a6a;}
      .gs-sshop-empty{text-align:center;color:var(--gs-dim,#9fb0c8);font-size:13px;
        line-height:1.5;padding:22px 12px;border:1px dashed #2a3346;border-radius:12px;}
    </style>`;
}

/** One rack card (art + name + blurb + price). Tapping opens the lore card. Works for any rack id. */
function rackCard(id: string): string {
  const card = storyCardFor(id);
  if (!card) return '';
  const afford = state.story ? state.story.credits >= card.price : false;
  const ac = rarCol(card.rarity);
  return `
    <div class="gs-sshop-card" style="--ac:${ac};" data-action='${JSON.stringify({ type: 'storyInspectItem', itemId: id })}'>
      <span class="gs-sshop-art" aria-hidden="true">${cardArt(id)}</span>
      <span class="gs-sshop-name">${card.name}</span>
      <span class="gs-sshop-blurb">${card.blurb}</span>
      <span class="gs-sshop-price${afford ? '' : ' gs-sshop-price--no'}">✦ ${card.price}</span>
    </div>`;
}

/** The tap-to-inspect lore card for one item, with a context-aware footer (Buy / Owned / Can't afford). */
function inspectOverlay(itemId: string): string {
  const story = state.story;
  const card = storyCardFor(itemId);
  if (!story || !card) return '';
  const owned = storyCardOwned(story, itemId);
  const equipped = storyCardEquipped(story, itemId);
  const equippedWord = card.kind === 'club' ? 'in your bag' : 'equipped';
  let footer: string;
  if (owned) {
    footer = `<div class="gs-sshop-owned">✓ Owned${equipped ? ` · ${equippedWord}` : ' · in the locker'}</div>`;
  } else if (canBuyStoryCard(story, itemId)) {
    footer = `<button class="gs-btn" data-action='${JSON.stringify({ type: 'storyBuyItem', itemId })}'>Buy · ✦ ${card.price}</button>`;
  } else {
    footer = `<div class="gs-sshop-cant">Not enough credits — ✦ ${card.price} (you have ✦ ${story.credits})</div>`;
  }
  return (
    loreCardHTML({
      icon: cardArt(itemId),
      name: card.name,
      tag: card.tag,
      accent: rarCol(card.rarity),
      detail: card.detail,
      lore: card.lore,
      footerHTML: footer,
      closeAttr: 'data-story-item-close="1"',
    }) +
    `<style>
      .gs-sshop-owned{text-align:center;color:#7fe0a0;font-weight:700;font-size:14px;padding:8px;}
      .gs-sshop-cant{text-align:center;color:#c86a6a;font-size:13px;line-height:1.4;padding:6px;}
    </style>`
  );
}
