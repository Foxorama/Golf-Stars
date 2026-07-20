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
import { caddyPortraitSVG } from '../render/caddyPortraits';
import { lorePortraitSVG } from '../render/loreArt';
import { loreCardHTML } from '../render/loreCard';
import { isHeraldAgent, heraldAgent, heraldCaddyEffect, COIL_FACTION_BLURB } from '../sim/rpg/storyHeraldCrew';
import { clubSetById, shopItem } from '../sim/rpg/economy';
import { allyFactionBlurb } from '../sim/rpg/storyAllies';
import {
  resolveStoryClub,
  storyClubType,
  storyRewardBaseId,
  storyBagFull,
  MAX_STORY_BAG,
  type GearSlot,
  type StoryState,
} from '../sim/rpg/story';
import { storyGearById, ownedGearForSlot } from '../sim/rpg/storyGear';
import { storyClubEffectLabel } from '../sim/rpg/storyClubEffects';
import { activeStoryCaddy } from '../sim/rpg/storyCaddies';
import { storyCardFor, type StoryCard } from '../sim/rpg/storyShop';

const SLOT_LABEL: Record<GearSlot, string> = {
  glove: '🧤 Glove', hat: '🧢 Cap', shoes: '👟 Shoes', ball: '🏐 Ball', bag: '🎒 Bag',
};
// Gear slots the locker manages (the four effect-bearing ones; the cosmetic bag lands later).
const LOCKER_SLOTS: GearSlot[] = ['glove', 'hat', 'shoes', 'ball'];

// GS-story-locker-sections: which accordion panels are open. A module-level view object (the marketView /
// clubhouseView pattern) so it survives the re-render an equip/unequip triggers — a native <details> would
// snap shut on every dispatch. Defaults to the BAG open; the other headers sit compactly beneath it, so the
// crew/gear are one tap away instead of a long scroll past the whole bag.
export const storyLockerView = { open: new Set<string>(['bag']) };

/** One collapsible accordion panel: a tappable header (icon + title + a live summary chip + chevron) and a
 *  body shown only when open. `[data-lockersec]` toggles it (wired in app.ts, re-render preserves the set). */
function accordion(id: string, icon: string, title: string, summary: string, body: string): string {
  const open = storyLockerView.open.has(id);
  return `
    <section class="gs-lock-acc${open ? ' gs-lock-acc--open' : ''}">
      <button class="gs-lock-acchdr" data-lockersec="${id}" aria-expanded="${open}">
        <span class="gs-lock-accicon" aria-hidden="true">${icon}</span>
        <span class="gs-lock-acctitle">${title}</span>
        <span class="gs-lock-accsum">${summary}</span>
        <span class="gs-lock-accchev" aria-hidden="true">${open ? '▾' : '▸'}</span>
      </button>
      ${open ? `<div class="gs-lock-accbody">${body}</div>` : ''}
    </section>`;
}

/** The art id for a club: a themed/quest id → its base themed id, else the plain 'starter' skin. */
function clubArtId(id: string): string {
  const base = storyRewardBaseId(id);
  return base.startsWith('club:') ? base : `club:starter:${storyClubType(id)}`;
}
function clubTheme(id: string): string | undefined {
  const base = storyRewardBaseId(id);
  if (!base.startsWith('club:')) return undefined;
  return clubSetById(base.split(':')[1])?.theme;
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
    : `<div class="gs-lock-empty">Your bag is empty — equip clubs from the bench.</div>`;
  const benchCards = benchIds.length
    ? benchIds.map((id) => clubChip(id, 'bench', full)).join('')
    : `<div class="gs-lock-empty">Nothing on the bench. Buy clubs at a world's Pro Shop to build up your set.</div>`;

  // ── Gear ──
  const gearRows = LOCKER_SLOTS.map((slot) => gearSlotRow(slot)).join('');
  const gearCount = LOCKER_SLOTS.filter((s) => story.equippedGear[s]).length;

  // ── Crew ──
  const active = activeStoryCaddy(story);
  const crewSummary = story.hiredCaddyIds.length
    ? `${active ? `${caddyDisplayName(active).split(' ')[0]} ★` : 'benched'} · ${story.hiredCaddyIds.length} aboard`
    : 'none yet';

  const overlay = state.storyItemInspectId ? inspectOverlay(state.storyItemInspectId) : '';

  // GS-story-locker-sections: collapsible panels (Bag / Crew / Gear / Bench), so the crew + gear are one tap
  // from the top instead of a long scroll past the whole bag. Crew is high (the "gather your friends" ask).
  const sections =
    accordion('bag', '🎒', 'Your bag', `${bagIds.length} / ${MAX_STORY_BAG}`, `<div class="gs-lock-grid">${bagCards}</div>`) +
    accordion('crew', '🫂', 'Your crew', crewSummary, crewBodyHTML(story)) +
    accordion('gear', '🧤', 'Gear', gearCount ? `${gearCount} equipped` : 'none', `<div style="font-size:12px;color:#8fa0b8;line-height:1.4;margin:0 0 8px;">One item per slot — like your clubs, you carry a single glove, cap, shoes and ball. A higher-tier piece is strong enough to beat stacking, so chase the upgrade.</div><div class="gs-lock-gear">${gearRows}</div>`) +
    accordion('bench', '📦', 'Bench', benchIds.length ? `${benchIds.length} spare` : 'empty', `<div class="gs-lock-grid">${benchCards}</div>`);

  return `
    <header class="gs-hero gs-storyhub">
      <h1 class="gs-hero-title">🎒 Locker Room</h1>
      <p class="gs-hero-tag">Build your bag · your crew · swap your gear</p>
    </header>
    <section style="max-width:600px;margin:2px auto 0;">
      ${lockerRoomHeaderSVG()}
      ${sections}
    </section>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:520px;margin:16px auto 0;">
      <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'exitStoryLocker' })}'>‹ Back to the clubhouse</button>
    </div>
    ${overlay}
    ${LOCKER_STYLE}`;
}

/** A compact illustrated locker-room banner (a bank of lockers + a bench + a bag) — a little scene so the
 *  screen isn't a flat list. Pure SVG, byte-stable, purely decorative. */
function lockerRoomHeaderSVG(): string {
  return `<div class="gs-lock-scene" aria-hidden="true">
    <svg viewBox="0 0 400 96" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" style="display:block;">
      <defs>
        <linearGradient id="lk-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1a2233"/><stop offset="100%" stop-color="#0f1522"/></linearGradient>
        <linearGradient id="lk-door" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2a3448"/><stop offset="100%" stop-color="#1c2637"/></linearGradient>
      </defs>
      <rect width="400" height="96" fill="url(#lk-wall)"/>
      <rect x="0" y="74" width="400" height="22" fill="#0c1220"/>
      <line x1="0" y1="74" x2="400" y2="74" stroke="#05080f" stroke-width="2"/>
      ${[8, 52, 96, 140].map((x) => `<g>
        <rect x="${x}" y="12" width="38" height="62" rx="3" fill="url(#lk-door)" stroke="#3a4864" stroke-width="1.2"/>
        <rect x="${x + 5}" y="17" width="28" height="10" rx="1.5" fill="#141c2b"/>
        <circle cx="${x + 31}" cy="46" r="1.8" fill="#8a97ad"/>
      </g>`).join('')}
      <!-- a bench + a leaning bag on the right -->
      <rect x="238" y="58" width="150" height="8" rx="3" fill="#3a2614"/>
      <rect x="248" y="66" width="6" height="10" fill="#2a1a0e"/><rect x="372" y="66" width="6" height="10" fill="#2a1a0e"/>
      <g transform="translate(330 22)">
        <rect x="0" y="0" width="20" height="42" rx="7" fill="#2f7f5a"/>
        <rect x="1" y="-8" width="18" height="12" rx="3" fill="#245f44"/>
        ${[4, 8, 12].map((gx) => `<line x1="${gx}" y1="-8" x2="${gx - 2}" y2="-20" stroke="#ccd" stroke-width="1.4"/>`).join('')}
      </g>
    </svg>
  </div>`;
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

/** GS-story-quality: a caddy's display name — a Coil VOLUNTEER (Herald path) reads off the agent roster,
 *  a Warden friend off the shop item. */
function caddyDisplayName(id: string): string {
  return (isHeraldAgent(id) ? heraldAgent(id)?.name : shopItem(id)?.name) ?? id;
}
/** A caddy's bust for the locker — the Coil agent's lore portrait, else the caddy portrait. */
function caddyBustSVG(id: string): string {
  const a = isHeraldAgent(id) ? heraldAgent(id) : undefined;
  return a ? lorePortraitSVG(a.portrait) : caddyPortraitSVG(id);
}

/** GS-story-caddies: the caddy ROSTER body — the friends you've gathered. One carries the bag (tap ＋ to make
 *  a friend active, ✕ to bench all). Empty until you recruit one out at the worlds where they wait. Returns
 *  just the panel body (the accordion supplies the header). */
function crewBodyHTML(story: StoryState): string {
  if (!story.hiredCaddyIds.length) {
    return `<div class="gs-lock-empty">No friends aboard yet — recruit them out in the galaxy, at the worlds where each one waits.</div>`;
  }
  const active = activeStoryCaddy(story);
  const chips = story.hiredCaddyIds
    .map((id) => {
      const name = caddyDisplayName(id);
      const on = id === active;
      const btn = on
        ? `<button class="gs-lock-btn gs-lock-btn--off" data-action='${JSON.stringify({ type: 'setStoryCaddy' })}' title="Bench (nobody carries the bag)">✕</button>`
        : `<button class="gs-lock-btn gs-lock-btn--on" data-action='${JSON.stringify({ type: 'setStoryCaddy', caddyId: id })}' title="Carry my bag">＋</button>`;
      return `<div class="gs-lock-gchip${on ? ' gs-lock-gchip--on' : ''}" style="--ac:#f0a8c8;">
          <span class="gs-lock-gart" data-action='${JSON.stringify({ type: 'storyInspectItem', itemId: id })}' role="button" aria-label="${name} — view their effect">${caddyBustSVG(id)}</span>
          <span class="gs-lock-gname" data-action='${JSON.stringify({ type: 'storyInspectItem', itemId: id })}' role="button">🎒 ${name}${on ? ' · on the bag' : ''}</span>
          ${btn}
        </div>`;
    })
    .join('');
  return `<div class="gs-lock-gitems">${chips}</div>`;
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

/** The id to inspect for a club: themed + NAMED reward ids (quest / major / charquest) carry lore directly;
 *  a plain club maps to its 'starter' card. A NAMED reward is any id `storyRewardBaseId` remaps to a real
 *  `club:` base — so a friend's `charquest:` signature is inspected as itself, not mis-mapped to the green
 *  starter of its base type (the "tapping a reward shows the original green club" bug). */
function lorableId(id: string): string {
  return id.startsWith('club:') || storyRewardBaseId(id) !== id ? id : `plain:${storyClubType(id)}`;
}

/** Resolve any locker id (themed / quest / major / charquest / `plain:<type>` / gear) to a display card for
 *  the lore overlay. */
function lockerCard(id: string): StoryCard | undefined {
  // A NAMED reward club — an ally's gift (`quest:`/`charquest:`) or a Galaxy-Tournament prize (`major:`).
  if (storyRewardBaseId(id) !== id) {
    // A named reward club — an ally's gift (GS-story-quest-club) or a Galaxy-Tournament prize
    // (GS-story-tournament-reward): its own signature name, legendary tier, and its signature EFFECT.
    const club = resolveStoryClub(id);
    const type = storyClubType(id);
    if (!club) return undefined;
    const isMajor = id.startsWith('major:');
    const fx = storyClubEffectLabel(id);
    const carryLine = type === 'putter' ? 'A solar-true putter — reads run honest and long.' : `Carries ~${club.carry} yd.`;
    return {
      id,
      kind: 'club',
      name: club.name,
      rarity: club.rarity ?? 'legendary',
      price: 0,
      tag: isMajor ? 'A major prize · Legendary' : "An ally's gift · Legendary",
      blurb: '',
      detail: fx ? [carryLine, `✦ Special: ${fx}`] : [carryLine],
      lore: [
        isMajor
          ? 'A signature club won at a Galaxy Tournament — the prize the whole gallery came to see handed over. It plays like the major it was won at.'
          : "A friend's signature club, forged out in the galaxy and given to you when you played their story true. It carries a little of them on every swing.",
      ],
    };
  }
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
  // GS-story-quality: a Coil VOLUNTEER caddy (Herald path) — their effect + Coil faction lore.
  if (isHeraldAgent(id)) {
    const a = heraldAgent(id)!;
    return {
      id,
      kind: 'caddy',
      name: a.name,
      rarity: 'legendary',
      price: 0,
      tag: `Coil caddy · ${a.title}`,
      blurb: '',
      detail: [heraldCaddyEffect(id)?.label ?? 'Carries your bag for the Coil.'],
      lore: [COIL_FACTION_BLURB],
    };
  }
  // GS-story-locker-inspect: a hired caddy — show their EFFECT (the shop-item desc) + faction lore.
  const caddy = shopItem(id);
  if (caddy?.caddy) {
    const rar = caddy.rarity ?? 'legendary';
    return {
      id,
      kind: 'caddy',
      name: caddy.name,
      rarity: rar,
      price: 0,
      tag: `Caddy · ${rar.charAt(0).toUpperCase()}${rar.slice(1)}`,
      blurb: '',
      detail: [caddy.desc ?? 'Carries your bag.'],
      lore: [allyFactionBlurb(id) || 'A friend you gathered out in the galaxy — they carry a little of their world onto every bag.'],
    };
  }
  return storyCardFor(id);
}

/** The read-only lore card for an owned item, footer = its equip state (managed inline on the chips). */
function inspectOverlay(itemId: string): string {
  const story = state.story;
  const card = lockerCard(itemId);
  if (!story || !card) return '';
  // A gear card can be equipped from here too; a caddy can be put on the bag; clubs are managed on their chips.
  let footer = '';
  if (card.kind === 'gear') {
    const g = storyGearById(itemId);
    if (g) {
      const on = story.equippedGear[g.slot] === g.id;
      footer = on
        ? `<div class="gs-lock-eqnote">✓ Equipped</div>`
        : `<button class="gs-btn" data-action='${JSON.stringify({ type: 'storyEquipGear', gearId: g.id })}'>Equip</button>`;
    }
  } else if (card.kind === 'caddy') {
    footer =
      activeStoryCaddy(story) === itemId
        ? `<div class="gs-lock-eqnote">🎒 Carrying your bag</div>`
        : `<button class="gs-btn" data-action='${JSON.stringify({ type: 'setStoryCaddy', caddyId: itemId })}'>🎒 Carry my bag</button>`;
  } else {
    footer = `<div class="gs-lock-eqnote">Manage this club from your bag / bench.</div>`;
  }
  return (
    loreCardHTML({
      icon:
        card.kind === 'gear'
          ? itemArtSVG(itemId, card.rarity)
          : card.kind === 'caddy'
            ? caddyBustSVG(itemId)
            : clubArt(itemId.startsWith('plain:') ? storyClubType(itemId.slice('plain:'.length)) : itemId),
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
    .gs-lock-scene{width:100%;aspect-ratio:400/96;max-height:96px;border-radius:12px;overflow:hidden;
      border:1px solid #2a3346;margin:0 0 12px;}
    .gs-lock-acc{border:1px solid #262f42;border-radius:12px;background:linear-gradient(180deg,#12172200,#0f131c66);
      margin:0 0 8px;overflow:hidden;}
    .gs-lock-acc--open{border-color:#33405a;background:#0d111a;}
    .gs-lock-acchdr{display:flex;align-items:center;gap:10px;width:100%;padding:11px 13px;cursor:pointer;
      background:linear-gradient(180deg,#161d2c,#111623);border:0;color:var(--gs-ink,#eaf1fb);font:inherit;text-align:left;
      transition:background .12s ease;}
    .gs-lock-acchdr:hover{background:linear-gradient(180deg,#1b2436,#141a29);}
    .gs-lock-acc--open .gs-lock-acchdr{border-bottom:1px solid #232b3b;}
    .gs-lock-accicon{font-size:17px;flex:0 0 auto;}
    .gs-lock-acctitle{font-size:14px;font-weight:800;letter-spacing:.02em;flex:0 0 auto;}
    .gs-lock-accsum{flex:1 1 auto;text-align:right;font-size:11.5px;font-weight:700;color:#7fe0a0;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .gs-lock-accchev{flex:0 0 auto;color:#8a97ad;font-size:12px;width:1em;text-align:center;}
    .gs-lock-accbody{padding:11px 12px 13px;}
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
