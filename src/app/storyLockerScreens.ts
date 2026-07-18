/**
 * The Story-Tour LOCKER (GS-story-locker). Reached from the spaceport clubhouse ("🎒 Locker"): manage
 * everything the campaign owns — build the 14-club BAG from your owned clubs (green + bought themed), and
 * swap the equipped GEAR per slot. Every owned item is tappable → the reusable lore card (read-only here,
 * with an equip/unequip footer). Built from design tokens + a self-contained `.gs-lock*` style block (own
 * prefix — no global CSS collision). Reads the live `state`; actions dispatch via `data-action` wiring.
 */

import { state } from './ctx';
import { rarCol } from '../sim/rpg/loot';
import { itemArtSVG } from '../render/itemArt';
import { loreCardHTML } from '../render/loreCard';
import { clubSetById, shopItem } from '../sim/rpg/economy';
import {
  resolveStoryClub,
  storyClubType,
  storyBagFull,
  MAX_STORY_BAG,
  type GearSlot,
  type StoryState,
} from '../sim/rpg/story';
import { storyGearById, ownedGearForSlot } from '../sim/rpg/storyGear';
import { activeStoryCaddy } from '../sim/rpg/storyCaddies';
import { storyCardFor, type StoryCard } from '../sim/rpg/storyShop';

const SLOT_LABEL: Record<GearSlot, string> = {
  glove: '🧤 Glove', hat: '🧢 Cap', shoes: '👟 Shoes', ball: '🏐 Ball', bag: '🎒 Bag',
};
// Gear slots the locker manages (the four effect-bearing ones; the cosmetic bag lands later).
const LOCKER_SLOTS: GearSlot[] = ['glove', 'hat', 'shoes', 'ball'];

/** The art id for a club: a themed id as-is, else the plain 'starter' skin so it draws a real club head. */
function clubArtId(id: string): string {
  return id.startsWith('club:') ? id : `club:starter:${storyClubType(id)}`;
}
function clubTheme(id: string): string | undefined {
  if (!id.startsWith('club:')) return undefined;
  return clubSetById(id.split(':')[1])?.theme;
}
function clubArt(id: string): string {
  const club = resolveStoryClub(id);
  return itemArtSVG(clubArtId(id), club?.rarity ?? 'common', clubTheme(id));
}

export function storyLockerScreen(): string {
  const story = state.story;
  if (!story) {
    return `
      <header class="gs-hero"><h1 class="gs-hero-title">🎒 Locker</h1></header>
      <div style="max-width:420px;margin:24px auto 0;">
        <button class="gs-btn" data-action='${JSON.stringify({ type: 'exitStoryLocker' })}'>‹ Back</button>
      </div>`;
  }

  // ── Bag builder ──
  const bagIds = [...story.equippedBagIds];
  const benchIds = story.ownedClubIds.filter((id) => !story.equippedBagIds.includes(id));
  const full = storyBagFull(story);

  const bagCards = bagIds.length
    ? bagIds.map((id) => clubChip(id, 'bag')).join('')
    : `<div class="gs-lock-empty">Your bag is empty — equip clubs from the bench below.</div>`;
  const benchCards = benchIds.length
    ? benchIds.map((id) => clubChip(id, 'bench', full)).join('')
    : `<div class="gs-lock-empty">Nothing on the bench. Buy clubs at a world's Pro Shop to build up your set.</div>`;

  // ── Gear ──
  const gearRows = LOCKER_SLOTS.map((slot) => gearSlotRow(slot)).join('');

  const overlay = state.storyItemInspectId ? inspectOverlay(state.storyItemInspectId) : '';

  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title">🎒 Locker</h1>
      <p class="gs-hero-tag">Build your bag · swap your gear</p>
    </header>
    <section style="max-width:600px;margin:2px auto 0;">
      <h2 class="gs-lock-sec">Your bag <span class="gs-lock-count${full ? ' gs-lock-count--full' : ''}">${bagIds.length} / ${MAX_STORY_BAG}</span></h2>
      <div class="gs-lock-grid">${bagCards}</div>

      ${benchIds.length || !bagIds.length ? `<h2 class="gs-lock-sec">Bench <span class="gs-lock-hint">not in the bag</span></h2><div class="gs-lock-grid">${benchCards}</div>` : ''}

      <h2 class="gs-lock-sec">Gear</h2>
      <div class="gs-lock-gear">${gearRows}</div>

      ${crewSectionHTML(story)}
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:16px auto 0;">
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStoryLocker' })}'>‹ Back to the clubhouse</button>
    </div>
    ${overlay}
    ${LOCKER_STYLE}`;
}

/** A club chip in the bag or on the bench. Tap art → lore card; the ✕/＋ equips/unequips inline. */
function clubChip(id: string, where: 'bag' | 'bench', bagFull = false): string {
  const club = resolveStoryClub(id);
  if (!club) return '';
  const ac = rarCol(club.rarity ?? 'common');
  const type = storyClubType(id);
  const carry = type === 'putter' ? '' : `${club.carry} yd`;
  // A bench club can be equipped unless the bag is full for a NEW type (a same-type swap is always allowed).
  const sameTypeInBag = state.story!.equippedBagIds.some((b) => storyClubType(b) === type);
  const canEquip = !bagFull || sameTypeInBag;
  const action =
    where === 'bag'
      ? `<button class="gs-lock-btn gs-lock-btn--off" data-action='${JSON.stringify({ type: 'storyUnequipClub', clubId: id })}' title="Take out of the bag">✕</button>`
      : canEquip
      ? `<button class="gs-lock-btn gs-lock-btn--on" data-action='${JSON.stringify({ type: 'storyEquipClub', clubId: id })}' title="Put in the bag">＋</button>`
      : `<span class="gs-lock-btn gs-lock-btn--dim" title="Bag full — take one out first">🔒</span>`;
  return `
    <div class="gs-lock-chip" style="--ac:${ac};">
      <span class="gs-lock-art" data-action='${JSON.stringify({ type: 'storyInspectItem', itemId: lorableId(id) })}' role="button" aria-label="${club.name}">${clubArt(id)}</span>
      <span class="gs-lock-name">${club.name}</span>
      <span class="gs-lock-meta">${carry}</span>
      ${action}
    </div>`;
}

/** GS-story-caddies: the caddy ROSTER — the friends you've gathered. One carries the bag (tap ＋ to make
 *  a friend active, ✕ to bench all). Empty until you recruit one out at the worlds where they wait. */
function crewSectionHTML(story: StoryState): string {
  if (!story.hiredCaddyIds.length) {
    return `<h2 class="gs-lock-sec">Your crew <span class="gs-lock-hint">gather your friends</span></h2>
      <div class="gs-lock-empty">No friends aboard yet — recruit them out in the galaxy, at the worlds where each one waits.</div>`;
  }
  const active = activeStoryCaddy(story);
  const chips = story.hiredCaddyIds
    .map((id) => {
      const name = shopItem(id)?.name ?? id;
      const on = id === active;
      const btn = on
        ? `<button class="gs-lock-btn gs-lock-btn--off" data-action='${JSON.stringify({ type: 'setStoryCaddy' })}' title="Bench (nobody carries the bag)">✕</button>`
        : `<button class="gs-lock-btn gs-lock-btn--on" data-action='${JSON.stringify({ type: 'setStoryCaddy', caddyId: id })}' title="Carry my bag">＋</button>`;
      return `<div class="gs-lock-gchip${on ? ' gs-lock-gchip--on' : ''}" style="--ac:#f0a8c8;">
          <span class="gs-lock-gname">🎒 ${name}${on ? ' · on the bag' : ''}</span>
          ${btn}
        </div>`;
    })
    .join('');
  return `<h2 class="gs-lock-sec">Your crew <span class="gs-lock-hint">one carries the bag</span></h2>
    <div class="gs-lock-gitems">${chips}</div>`;
}

/** One gear slot: the equipped item (or empty) + owned alternatives to switch to, and a remove. */
function gearSlotRow(slot: GearSlot): string {
  const story = state.story!;
  const owned = ownedGearForSlot(story, slot);
  const equippedId = story.equippedGear[slot];
  const items = owned.length
    ? owned
        .map((g) => {
          const on = g.id === equippedId;
          const ac = rarCol(g.rarity);
          return `
        <div class="gs-lock-gchip${on ? ' gs-lock-gchip--on' : ''}" style="--ac:${ac};">
          <span class="gs-lock-gart" data-action='${JSON.stringify({ type: 'storyInspectItem', itemId: g.id })}' role="button" aria-label="${g.name}">${itemArtSVG(g.id, g.rarity)}</span>
          <span class="gs-lock-gname">${g.name}</span>
          ${
            on
              ? `<button class="gs-lock-btn gs-lock-btn--off" data-action='${JSON.stringify({ type: 'storyUnequipGear', slot })}' title="Take off">✕</button>`
              : `<button class="gs-lock-btn gs-lock-btn--on" data-action='${JSON.stringify({ type: 'storyEquipGear', gearId: g.id })}' title="Equip">＋</button>`
          }
        </div>`;
        })
        .join('')
    : `<span class="gs-lock-none">None owned — buy some at a Pro Shop.</span>`;
  return `
    <div class="gs-lock-slot">
      <div class="gs-lock-slothdr">${SLOT_LABEL[slot]}</div>
      <div class="gs-lock-gitems">${items}</div>
    </div>`;
}

/** The id to inspect for a club: themed ids carry lore directly; a plain club maps to its 'starter' card. */
function lorableId(id: string): string {
  return id.startsWith('club:') ? id : `plain:${storyClubType(id)}`;
}

/** Resolve any locker id (themed club / `plain:<type>` / gear) to a display card for the lore overlay. */
function lockerCard(id: string): StoryCard | undefined {
  if (id.startsWith('plain:')) {
    const type = id.slice('plain:'.length);
    const club = resolveStoryClub(type);
    if (!club) return undefined;
    const kindWord = type === 'D' ? 'Driver' : /W$/.test(type) ? 'Fairway wood' : /H$/.test(type) ? 'Hybrid' : /i$/.test(type) ? 'Iron' : type === 'putter' ? 'Putter' : 'Club';
    return {
      id,
      kind: 'club',
      name: club.name,
      rarity: 'common',
      price: 0,
      tag: `Starter · ${kindWord}`,
      blurb: '',
      detail: type === 'putter' ? ['On the greens — your trusty starter putter.'] : [`Carries ~${club.carry} yd.`],
      lore: [
        'A dependable starter club — the one you learned the game with. It will not out-drive a Planet ' +
          'wood or bite like a Phoenix iron, but it has never once let you down.',
      ],
    };
  }
  return storyCardFor(id);
}

/** The read-only lore card for an owned item, footer = its equip state (managed inline on the chips). */
function inspectOverlay(itemId: string): string {
  const story = state.story;
  const card = lockerCard(itemId);
  if (!story || !card) return '';
  // A gear card can be equipped from here too; clubs are managed on their chips.
  let footer = '';
  if (card.kind === 'gear') {
    const g = storyGearById(itemId);
    if (g) {
      const on = story.equippedGear[g.slot] === g.id;
      footer = on
        ? `<div class="gs-lock-eqnote">✓ Equipped</div>`
        : `<button class="gs-btn" data-action='${JSON.stringify({ type: 'storyEquipGear', gearId: g.id })}'>Equip</button>`;
    }
  } else {
    footer = `<div class="gs-lock-eqnote">Manage this club from your bag / bench.</div>`;
  }
  return (
    loreCardHTML({
      icon: card.kind === 'gear' ? itemArtSVG(itemId, card.rarity) : clubArt(itemId.startsWith('plain:') ? storyClubType(itemId.slice('plain:'.length)) : itemId),
      name: card.name,
      tag: card.tag,
      accent: rarCol(card.rarity),
      detail: card.detail,
      lore: card.lore,
      footerHTML: footer,
      closeAttr: 'data-story-item-close="1"',
    }) + `<style>.gs-lock-eqnote{text-align:center;color:#7fe0a0;font-weight:700;font-size:13px;padding:8px;}</style>`
  );
}

const LOCKER_STYLE = `
  <style>
    .gs-lock-sec{font-size:13px;font-weight:800;letter-spacing:.04em;color:var(--gs-ink,#eaf1fb);
      margin:14px 0 8px;display:flex;align-items:center;gap:8px;}
    .gs-lock-count{font-size:12px;font-weight:800;color:#7fe0a0;background:#12211a;border:1px solid #244a37;border-radius:20px;padding:1px 9px;}
    .gs-lock-count--full{color:#e9c46a;background:#26200f;border-color:#5a4a22;}
    .gs-lock-hint{font-size:11px;font-weight:600;color:var(--gs-dim,#9fb0c8);text-transform:none;letter-spacing:0;}
    .gs-lock-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;}
    .gs-lock-chip{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;text-align:center;
      background:linear-gradient(180deg,#141926,#0f131c);border:1px solid #262f42;border-top:3px solid var(--ac,#5b8bd0);
      border-radius:11px;padding:8px 6px 7px;}
    .gs-lock-art{width:56px;height:56px;cursor:pointer;}
    .gs-lock-art svg,.gs-lock-gart svg{width:100%;height:100%;}
    .gs-lock-name{font-size:11.5px;font-weight:700;color:var(--gs-ink,#eaf1fb);line-height:1.15;}
    .gs-lock-meta{font-size:10.5px;color:var(--gs-dim,#9fb0c8);min-height:1em;}
    .gs-lock-btn{position:absolute;top:5px;right:5px;width:24px;height:24px;border-radius:50%;border:1px solid #333c50;
      background:#0d1119;color:#cdd8ea;font-size:13px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}
    .gs-lock-btn--on{color:#7fe0a0;border-color:#2a5a40;}
    .gs-lock-btn--off{color:#c98a8a;border-color:#5a2a2a;}
    .gs-lock-btn--dim{color:#5a6478;cursor:default;}
    .gs-lock-empty,.gs-lock-none{color:var(--gs-dim,#9fb0c8);font-size:12px;line-height:1.5;padding:10px 4px;}
    .gs-lock-gear{display:flex;flex-direction:column;gap:8px;}
    .gs-lock-slot{background:#0d1119;border:1px solid #232b3b;border-radius:12px;padding:9px 11px;}
    .gs-lock-slothdr{font-size:12px;font-weight:800;color:var(--gs-ink,#eaf1fb);margin-bottom:7px;}
    .gs-lock-gitems{display:flex;flex-wrap:wrap;gap:7px;}
    .gs-lock-gchip{position:relative;display:flex;align-items:center;gap:7px;background:linear-gradient(180deg,#141926,#0f131c);
      border:1px solid #262f42;border-left:3px solid var(--ac,#5b8bd0);border-radius:10px;padding:5px 30px 5px 6px;}
    .gs-lock-gchip--on{box-shadow:0 0 0 1px var(--ac,#5b8bd0) inset;}
    .gs-lock-gart{width:34px;height:34px;cursor:pointer;flex:0 0 auto;}
    .gs-lock-gname{font-size:12px;font-weight:700;color:var(--gs-ink,#eaf1fb);}
    .gs-lock-gchip .gs-lock-btn{width:22px;height:22px;top:50%;transform:translateY(-50%);right:5px;font-size:12px;}
  </style>`;
