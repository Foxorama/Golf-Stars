/**
 * The Story-Tour Pro Shop screen (GS-story-econ). Reached from a CLEARED world's dossier on the galaxy
 * map ("🛒 Pro Shop"): a per-world rack of themed clubs you spend campaign credits on to grow the green
 * bag. Tapping an item raises the reusable LORE CARD (GS-story-lore-cards) — art + name + mechanical
 * detail + flavour + a Buy action. Built from existing design tokens + a self-contained `.gs-sshop*`
 * style block (own prefix — no global CSS collision). Reads the live `state`; actions dispatch via
 * `data-action` wiring in app.ts.
 */

import { state } from './ctx';
import { rarCol } from '../sim/rpg/loot';
import { staticCourseSpec } from '../sim/course/staticCourses';
import { itemArtSVG } from '../render/itemArt';
import { loreCardHTML } from '../render/loreCard';
import { clubSetById } from '../sim/rpg/economy';
import {
  storyShopStock,
  storyItemById,
  storyItemName,
  storyItemPrice,
  storyItemRarity,
  storyItemBlurb,
  storyItemDetail,
  storyItemLore,
  storyItemOwned,
  storyItemEquipped,
  canBuyStoryItem,
  WORLD_SHOP_INTRO,
  type StoryShopItem,
} from '../sim/rpg/storyShop';

/** A human tag for an item's kind + rarity, e.g. "Rare · Fairway wood". */
function itemTag(item: StoryShopItem): string {
  const rar = storyItemRarity(item);
  const rarWord = rar.charAt(0).toUpperCase() + rar.slice(1);
  const t = item.clubType;
  const kind =
    t === 'D' ? 'Driver'
    : /W$/.test(t) ? 'Fairway wood'
    : /H$/.test(t) ? 'Hybrid'
    : /i$/.test(t) ? 'Iron'
    : t === 'putter' ? 'Putter'
    : 'Club';
  return `${rarWord} · ${kind}`;
}

/** The procedural art for an item (its themed reward-club head). */
function itemArt(item: StoryShopItem): string {
  const theme = clubSetById(item.setId)?.theme;
  return itemArtSVG(item.id, storyItemRarity(item), theme);
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
  const stock = storyShopStock(story, worldId);

  const cards = stock.length
    ? stock.map((it) => shopCard(it)).join('')
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
      <p style="text-align:center;color:var(--gs-dim);font-size:13px;line-height:1.5;margin:2px 0 12px;">
        <em>${intro}</em>
      </p>
      <div class="gs-sshop-grid">${cards}</div>
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:16px auto 0;">
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'storyPlayWorld', courseId: worldId })}'>↺ Play this world again</button>
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStoryShop' })}'>‹ Back to the star chart</button>
    </div>
    ${overlay}
    <style>
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
      .gs-sshop-empty{grid-column:1/-1;text-align:center;color:var(--gs-dim,#9fb0c8);font-size:13px;
        line-height:1.5;padding:22px 12px;border:1px dashed #2a3346;border-radius:12px;}
    </style>`;
}

/** One rack card (art + name + blurb + price). Tapping opens the lore card. */
function shopCard(item: StoryShopItem): string {
  const price = storyItemPrice(item);
  const afford = state.story ? state.story.credits >= price : false;
  const ac = rarCol(storyItemRarity(item));
  return `
    <div class="gs-sshop-card" style="--ac:${ac};" data-action='${JSON.stringify({ type: 'storyInspectItem', itemId: item.id })}'>
      <span class="gs-sshop-art" aria-hidden="true">${itemArt(item)}</span>
      <span class="gs-sshop-name">${storyItemName(item)}</span>
      <span class="gs-sshop-blurb">${storyItemBlurb(item)}</span>
      <span class="gs-sshop-price${afford ? '' : ' gs-sshop-price--no'}">✦ ${price}</span>
    </div>`;
}

/** The tap-to-inspect lore card for one item, with a context-aware footer (Buy / Owned / Can't afford). */
function inspectOverlay(itemId: string): string {
  const story = state.story;
  const item = storyItemById(itemId);
  if (!story || !item) return '';
  const price = storyItemPrice(item);
  const owned = storyItemOwned(story, item);
  const equipped = storyItemEquipped(story, item);
  let footer: string;
  if (owned) {
    footer = `<div class="gs-sshop-owned">✓ Owned${equipped ? ' · in your bag' : ' · in the locker'}</div>`;
  } else if (canBuyStoryItem(story, item)) {
    footer = `<button class="gs-btn" data-action='${JSON.stringify({ type: 'storyBuyItem', itemId: item.id })}'>Buy · ✦ ${price}</button>`;
  } else {
    footer = `<div class="gs-sshop-cant">Not enough credits — ✦ ${price} (you have ✦ ${story.credits})</div>`;
  }
  return (
    loreCardHTML({
      icon: itemArt(item),
      name: storyItemName(item),
      tag: itemTag(item),
      accent: rarCol(storyItemRarity(item)),
      detail: storyItemDetail(item),
      lore: storyItemLore(item),
      footerHTML: footer,
      closeAttr: 'data-story-item-close="1"',
    }) +
    `<style>
      .gs-sshop-owned{text-align:center;color:#7fe0a0;font-weight:700;font-size:14px;padding:8px;}
      .gs-sshop-cant{text-align:center;color:#c86a6a;font-size:13px;line-height:1.4;padding:6px;}
    </style>`
  );
}
