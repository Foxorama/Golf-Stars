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
import { proAvatarSVG } from '../render/golferCards';
import { roughBaseFor } from '../render/palette';
import { storyWorldServicesHTML, storyServiceBackLabel } from './storyServices';
import type { BiomeArchetype } from '../sim/course/themes';
import {
  storyShopStock,
  storyGearStock,
  storyCardFor,
  storyCardOwned,
  storyCardEquipped,
  canBuyStoryCard,
  storyShopSlotView,
  WORLD_SHOP_INTRO,
  type StorySlotView,
  type SlotRelation,
} from '../sim/rpg/storyShop';

/**
 * GS-story-shop-scene: the per-world PRO SHOP scene — an illustrated shop interior instead of a flat rack
 * list. A world-tinted counter + glass club display, a picture window onto the world's own ground/sky, and
 * the world's CLUB PRO (the archetype-themed `proAvatarSVG`) standing behind the till. Pure SVG + one
 * positioned bust (byte-stable, zero rng), own `.gs-sshop-scene*` scope. Makes each world's shop feel like
 * a place you've travelled to, not a generic grid.
 */
function proShopSceneHTML(archetype: BiomeArchetype, worldName: string): string {
  const ground = roughBaseFor(archetype);
  const ground2 = roughBaseFor(archetype, 1.3);
  return `<div class="gs-sshop-scene" aria-hidden="true">
    <svg viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style="display:block;">
      <defs>
        <linearGradient id="sshs-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2c2016"/><stop offset="100%" stop-color="#1a120b"/></linearGradient>
        <linearGradient id="sshs-counter" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6e4a2c"/><stop offset="100%" stop-color="#3a2614"/></linearGradient>
        <linearGradient id="sshs-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#0c1330"/><stop offset="100%" stop-color="#20264a"/></linearGradient>
      </defs>
      <!-- shop wall + shelving -->
      <rect width="400" height="150" fill="url(#sshs-wall)"/>
      ${[26, 52].map((y) => `<rect x="8" y="${y}" width="150" height="4" fill="#3f2b18"/>`).join('')}
      <!-- little boxed goods on the shelves -->
      ${[[16, 12], [44, 14], [72, 12], [104, 13], [130, 12]].map(([x, y], i) => `<rect x="${x}" y="${28 - (y as number) + 16 - 16}" width="18" height="${y}" rx="2" fill="${['#7fe0a0', '#e8c25a', '#6ab6ff', '#ff8a6b', '#b58cff'][i]}" opacity="0.8"/>`).join('')}
      <!-- picture window onto the world (right) -->
      <g>
        <rect x="250" y="16" width="130" height="74" rx="5" fill="#0a0d18"/>
        <rect x="255" y="21" width="120" height="64" fill="url(#sshs-sky)"/>
        <rect x="255" y="63" width="120" height="22" fill="${ground}"/>
        <path d="M255,66 Q300,58 340,64 T375,62 L375,85 L255,85 Z" fill="${ground2}"/>
        <circle cx="290" cy="38" r="1" fill="#fff"/><circle cx="330" cy="30" r="1.2" fill="#fff"/><circle cx="358" cy="44" r="1" fill="#fff"/>
        <line x1="315" y1="21" x2="315" y2="85" stroke="#0a0d18" stroke-width="3"/>
        <rect x="250" y="16" width="130" height="74" rx="5" fill="none" stroke="#5a4326" stroke-width="4"/>
      </g>
      <!-- neon PRO SHOP sign -->
      <rect x="150" y="8" width="96" height="20" rx="5" fill="#0d1512" stroke="#274a38" stroke-width="1.2"/>
      <text x="198" y="22" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-weight="800" font-size="12" fill="#d6ffe6">PRO SHOP</text>
      <!-- glass club display, front-left -->
      <g>
        <rect x="14" y="96" width="150" height="46" rx="4" fill="#12100a" stroke="#3a2a17" stroke-width="1.5"/>
        <rect x="18" y="100" width="142" height="30" rx="3" fill="#1a2433" opacity="0.5"/>
        ${[34, 62, 90, 118].map((x) => `<g transform="translate(${x},128)"><line x1="0" y1="0" x2="6" y2="-24" stroke="#cbd3e0" stroke-width="2"/><path d="M6,-24 l8,2 l-6,4 Z" fill="#8fa0b8"/></g>`).join('')}
      </g>
      <!-- counter across the front -->
      <rect x="0" y="120" width="400" height="10" fill="#8a6034"/>
      <rect x="0" y="130" width="400" height="20" fill="url(#sshs-counter)"/>
    </svg>
    <span class="gs-sshop-procorner">
      <span class="gs-sshop-pro" title="${worldName}'s club pro">${proAvatarSVG(archetype, 66, 78)}</span>
      <span class="gs-sshop-proplate">${worldName} pro</span>
    </span>
  </div>`;
}

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
  const archetype: BiomeArchetype = spec?.archetype ?? 'verdant';
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
      ${proShopSceneHTML(archetype, courseName)}
      <p class="gs-sshop-intro">“<em>${intro}</em>”</p>
      ${body}
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:16px auto 0;">
      ${storyWorldServicesHTML(story, worldId, 'shop')}
      ${
        // GS-story-venue-services: hidden on the Sigil-recap detour — teeing off from there would strand
        // the major's continuation chain (the reducer refuses it too; this keeps the dead button off the
        // screen rather than relying on the refusal).
        state.storyShopReturn === 'storyTournamentResult'
          ? ''
          : `<button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'storyPlayWorld', courseId: worldId })}'>↺ Play this world again</button>`
      }
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStoryShop' })}'>${storyServiceBackLabel(state.storyShopReturn)}</button>
    </div>
    ${overlay}
    <style>
      .gs-sshop-scene{position:relative;width:100%;aspect-ratio:400/150;max-height:160px;border-radius:14px;
        overflow:hidden;border:1px solid #3a2f1f;margin:6px 0 2px;box-shadow:0 6px 20px -12px #000a;}
      .gs-sshop-procorner{position:absolute;right:10px;bottom:4px;display:flex;flex-direction:column;
        align-items:center;gap:2px;filter:drop-shadow(0 4px 6px #000a);}
      .gs-sshop-pro{width:60px;}
      .gs-sshop-pro svg{width:100%;height:auto;display:block;}
      .gs-sshop-proplate{font-size:10px;font-weight:700;color:#e8dcc0;
        background:#2a1c10cc;border:1px solid #5a4326;border-radius:8px;padding:1px 6px;white-space:nowrap;}
      .gs-sshop-intro{text-align:center;color:var(--gs-dim,#9fb0c8);font-size:13px;line-height:1.5;
        margin:10px auto 12px;max-width:460px;}
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
      .gs-sshop-slot{display:inline-block;max-width:100%;font-size:10.5px;font-weight:700;line-height:1.2;
        padding:2px 7px;border-radius:999px;border:1px solid #2a3346;background:#0b0f18cc;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .gs-sshop-card--have{opacity:0.82;}
      .gs-sshop-price{font-size:13px;font-weight:800;color:var(--gs-gold,#e9c46a);}
      .gs-sshop-price--no{color:#c86a6a;}
      .gs-sshop-empty{text-align:center;color:var(--gs-dim,#9fb0c8);font-size:13px;
        line-height:1.5;padding:22px 12px;border:1px dashed #2a3346;border-radius:12px;}
    </style>`;
}

/** GS-story-shop-slots: the per-relation chip colour + label — so a glance tells you Equipped / Owned /
 *  Upgrade / Sidegrade / Lower-tier / New, and what's in the slot now, without opening the locker. */
const REL_STYLE: Record<SlotRelation, { col: string; icon: string; word: string }> = {
  equipped: { col: '#7fe0a0', icon: '✓', word: 'Equipped' },
  owned: { col: '#9fb0c8', icon: '✓', word: 'Owned' },
  upgrade: { col: '#e9c46a', icon: '↑', word: 'Upgrade' },
  sidegrade: { col: '#6ab6ff', icon: '↔', word: 'Sidegrade' },
  downgrade: { col: '#b08a5a', icon: '↓', word: 'Lower tier' },
  new: { col: '#8fe6c0', icon: '✦', word: 'New' },
};

/** The slot-state line for a rack card / the lore card: what fills the slot now + the upgrade relation. */
function slotLineHTML(v: StorySlotView): string {
  const s = REL_STYLE[v.relation];
  let text: string;
  if (v.relation === 'equipped') text = `${s.icon} Equipped now`;
  else if (v.relation === 'owned') text = `${s.icon} Owned · benched`;
  else if (v.relation === 'new') text = `${s.icon} New ${v.slotWord}`;
  else text = `${s.icon} ${s.word} · now ${v.equippedName ?? '—'}`;
  return `<span class="gs-sshop-slot" style="color:${s.col};border-color:${s.col}44;">${text}</span>`;
}

/** One rack card (art + name + blurb + slot/upgrade state + price). Tapping opens the lore card. */
function rackCard(id: string): string {
  const card = storyCardFor(id);
  if (!card) return '';
  const afford = state.story ? state.story.credits >= card.price : false;
  const ac = rarCol(card.rarity);
  const v = state.story ? storyShopSlotView(state.story, id) : undefined;
  const slot = v ? slotLineHTML(v) : '';
  const dim = v && (v.relation === 'owned' || v.relation === 'equipped') ? ' gs-sshop-card--have' : '';
  return `
    <div class="gs-sshop-card${dim}" style="--ac:${ac};" data-action='${JSON.stringify({ type: 'storyInspectItem', itemId: id })}'>
      <span class="gs-sshop-art" aria-hidden="true">${cardArt(id)}</span>
      <span class="gs-sshop-name">${card.name}</span>
      <span class="gs-sshop-blurb">${card.blurb}</span>
      ${slot}
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
  // GS-story-shop-slots: a comparison line at the top of the card's detail, so you see what this replaces
  // and whether it's an upgrade before you buy — no need to close the shop and open the locker.
  const v = storyShopSlotView(story, itemId);
  const compare: string[] = [];
  if (v && !v.equipped) {
    if (v.relation === 'owned') {
      compare.push('✓ Owned — benched in your locker.');
    } else if (v.equippedName) {
      const rel = REL_STYLE[v.relation];
      compare.push(`In your ${v.slotWord} now: ${v.equippedName} — this is ${rel.icon} ${rel.word.toLowerCase()}.`);
    } else {
      compare.push(`Fills an empty ${v.slotWord} — you carry nothing here yet.`);
    }
  }
  const detail = [...compare, ...card.detail];
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
      detail,
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
