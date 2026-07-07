/**
 * The Clubhouse screens (GS-clubhouse / GS-clubhouse-lounge / GS-clubhouse-stage): the hall lounge
 * where the golfers loiter (tap one to outfit them) and the per-golfer tap-to-restyle stage with its
 * garage bay + slot pickers. Equipping is PER character; buying happens at the Trade Market.
 */

import { btn, state } from './ctx';
import { titleScreen } from './titleScreens';
import { apparelCardChrome, shipCardHTML } from './marketScreens';
import { CHARACTERS, getCharacter, type Character } from '../sim/rpg/characters';
import {
  golfBagForCharacter,
  hatForCharacter,
  pantsForCharacter,
  shipForCharacter,
  shirtForCharacter,
} from '../ui/game';
import { clubhouseLoungeHTML, type LoungeGolfer } from '../render/clubhouseLounge';
import { golferPreviewSVG } from '../render/apparelArt';
import { apparelById, apparelForSlot, equippedSet, type Apparel, type ApparelSlot } from '../sim/rpg/apparel';
import { shipCatalogue } from '../sim/rpg/ships';
import { cosmeticRarCol, isMythic } from '../sim/rpg/cosmetics';
import { shipSVG } from '../render/shipArt';

// Clubhouse stage (GS-clubhouse-stage): which slot's picker is open on the character stage — a body
// part (hat/shirt/pants/bag) or the garage. View-only module state (like shopView.inspectGearId),
// toggled via [data-clubslot] + re-render; app.ts's dispatch resets it on open/close/back.
export type ClubSlot = ApparelSlot | 'ship';
export const clubhouseView = { slot: null as ClubSlot | null };

/** The Clubhouse hall (GS-clubhouse / GS-clubhouse-lounge) — its own screen reached from the title's
 *  Clubhouse doorway. The four golfers loiter in a cosy bar + fireplace lounge wearing their own outfits;
 *  tap any of them to open their garage + wardrobe. They've shuffled to new spots since your last run. */
export function clubhouseHallScreen(): string {
  const golfers: LoungeGolfer[] = CHARACTERS.map((ch) => ({
    id: ch.id,
    shortName: ch.shortName,
    capColor: ch.style.cap,
    hatId: hatForCharacter(state, ch.id),
    shirtId: shirtForCharacter(state, ch.id),
    pantsId: pantsForCharacter(state, ch.id),
    shipId: shipForCharacter(state, ch.id),
    skin: ch.style.skin,
    shirtBase: ch.style.shirt,
  }));
  return `
    <header style="border-left:4px solid #d8a24a;padding-left:10px;">
      <h1 style="margin:0;font-size:22px;">🏠 The Clubhouse</h1>
      <p style="opacity:.75;font-size:13px;margin:.3em 0;">Your golfers are unwinding by the fire, their rides parked at the spaceport below. Tap a golfer or their ship to outfit them — their own ride, their own look head to toe. Buy gear at the <b>Trade Market</b>.</p>
    </header>
    <div style="margin:12px 0;">${clubhouseLoungeHTML(golfers, state.clubhouseVisit, state.marmotBartender, state.marmotTips)}</div>
    <div style="text-align:center;">${btn('← Back to title', { type: 'closeClubhouseHall' }, { variant: 'ghost' })}</div>`;
}

/** A hangar-bay backdrop for the Clubhouse garage tile (GS-clubhouse-stage): a launch pad under an open
 *  star-bay, pillars + neon strips tinted by the parked ship's rarity, with the ship itself sat on the
 *  glowing pad. Deterministic (fixed star spots — the render layer bans Math.random). */
function clubhouseGarageArt(shipId: string | undefined, accent: string): string {
  const stars = [
    [58, 20], [92, 12], [130, 26], [168, 15], [206, 24], [240, 18],
    [74, 34], [150, 8], [190, 36], [116, 40],
  ]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 1.4 : 0.9}" fill="#eaf2ff" opacity="${i % 2 ? 0.7 : 0.95}"/>`)
    .join('');
  const chevron = (y: number, o: number) =>
    `<path d="M132,${y} L150,${y + 6} L168,${y} L168,${y + 3} L150,${y + 9} L132,${y + 3} Z" fill="${accent}" opacity="${o}"/>`;
  return `<svg viewBox="0 0 300 130" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
    <defs>
      <linearGradient id="ghSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#080c1a"/><stop offset="100%" stop-color="#141d36"/></linearGradient>
      <radialGradient id="ghGlow" cx="50%" cy="88%" r="62%"><stop offset="0%" stop-color="${accent}" stop-opacity="0.4"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient>
      <linearGradient id="ghFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#28324f"/><stop offset="100%" stop-color="#0b0f1d"/></linearGradient>
    </defs>
    <rect width="300" height="130" fill="url(#ghSky)"/>
    ${stars}
    <path d="M34,4 Q150,-16 266,4 L266,60 L34,60 Z" fill="#0a0f22" opacity="0.55"/>
    <rect x="0" y="84" width="300" height="46" fill="url(#ghFloor)"/>
    <ellipse cx="150" cy="106" rx="104" ry="19" fill="url(#ghGlow)"/>
    <ellipse cx="150" cy="106" rx="74" ry="12.5" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0.75" stroke-dasharray="6 6"/>
    ${chevron(112, 0.8)}${chevron(118, 0.4)}
    <rect x="14" y="4" width="11" height="118" fill="#18223c"/>
    <rect x="275" y="4" width="11" height="118" fill="#18223c"/>
    <rect x="25" y="10" width="3.4" height="104" rx="1.7" fill="${accent}" opacity="0.55"/>
    <rect x="271.6" y="10" width="3.4" height="104" rx="1.7" fill="${accent}" opacity="0.55"/>
    ${shipSVG(shipId, 150, 80, 2.2)}
  </svg>`;
}

/** The open slot-picker below the character stage (GS-clubhouse-stage): when a body part or the garage is
 *  tapped, this reveals just that slot's owned rack (equip toggles / owned fleet). null = a resting hint. */
function clubhousePicker(
  ch: Character,
  hatId: string | undefined,
  shirtId: string | undefined,
  pantsId: string | undefined,
  shipId: string | undefined,
  bagId: string | undefined,
): string {
  if (!clubhouseView.slot) {
    return `<p class="gs-clubhint">Tap ${ch.shortName}'s hat, shirt, pants, bag — or the garage — to change it.</p>`;
  }
  const meta: Record<ClubSlot, { icon: string; title: string }> = {
    hat: { icon: '🎩', title: `Hats for ${ch.shortName}` },
    shirt: { icon: '👕', title: `Shirts for ${ch.shortName}` },
    pants: { icon: '👖', title: `Pants for ${ch.shortName}` },
    bag: { icon: '🎒', title: `Golf bags for ${ch.shortName}` },
    ship: { icon: '🛸', title: `${ch.shortName}'s garage` },
  };
  const m = meta[clubhouseView.slot];
  let body: string;
  if (clubhouseView.slot === 'ship') {
    body = `<div class="gs-cpick__rack">${shipCatalogue()
      .filter((s) => state.ownedShips.includes(s.id))
      .map((ship) => {
        const flying = ship.id === shipId;
        return shipCardHTML(ship, flying ? '✓ FLYING' : 'Fly this', {
          ring: flying ? '#ffce54' : cosmeticRarCol(ship.rarity),
          glow: flying,
          action: flying ? undefined : { type: 'selectShip', id: ship.id },
        });
      })
      .join('')}</div>`;
  } else {
    const owned = apparelForSlot(clubhouseView.slot).filter((a) => state.ownedApparel.includes(a.id));
    // Golf bags are Unending-Universe trophies (GS-unending) — an empty rack points at the run, not the shop.
    const emptyMsg =
      clubhouseView.slot === 'bag'
        ? `<div class="gs-cpick__empty">No golf bags earned yet.<br><span style="font-size:12px;opacity:.75;">Survive 40 holes of the <b>Unending Universe</b> to earn the Evergreen Tour Bag.</span></div>`
        : `<div class="gs-cpick__empty">No ${clubhouseView.slot}s owned yet.<br>${btn('🚀 Buy some at the Trade Market', { type: 'openMarket' }, { variant: 'ghost' })}</div>`;
    body = owned.length
      ? `<div class="gs-cpick__rack">${owned.map((a) => clubhouseApparelCardHTML(a, hatId, shirtId, pantsId, bagId)).join('')}</div>`
      : emptyMsg;
  }
  return `
    <section class="gs-cpick">
      <div class="gs-cpick__head">
        <span aria-hidden="true">${m.icon}</span>
        <span class="gs-cpick__title">${m.title}</span>
        <button class="gs-cpick__done" data-clubslot="${clubhouseView.slot}">Done ✕</button>
      </div>
      ${body}
    </section>`;
}

/** One character's Clubhouse (GS-clubhouse / GS-clubhouse-stage): a big full-body avatar you outfit by
 *  TAPPING the body part you want to change (hat / shirt / pants) plus a garage bay below you tap to pick
 *  the ride. Each tap reveals just that slot's owned rack. Outfitting is PER character — nothing shared. */
export function clubhouseScreen(): string {
  const ch = getCharacter(state.manageCharacterId);
  if (!ch) return titleScreen(); // safety: no character selected
  const hatId = hatForCharacter(state, ch.id);
  const shirtId = shirtForCharacter(state, ch.id);
  const pantsId = pantsForCharacter(state, ch.id);
  const shipId = shipForCharacter(state, ch.id);
  const bagId = golfBagForCharacter(state, ch.id);
  const preview = golferPreviewSVG(hatId, shirtId, pantsId, {
    skin: ch.style.skin,
    shirtBase: ch.style.shirt,
    capColor: ch.style.cap,
    uid: 'stage',
    w: 190,
    h: 210,
    bagId,
  });
  const setName = equippedSet(hatId, shirtId, pantsId, bagId);
  const setBadge = setName
    ? `<div class="gs-clubset">✦ ${setName} set complete!</div>`
    : '';
  const ship = shipCatalogue().find((s) => s.id === shipId);
  const shipAccent = ship ? cosmeticRarCol(ship.rarity) : '#8aa0c0';

  const nameOf = (id: string | undefined, fallback: string) => apparelById(id)?.name ?? fallback;
  // A tap zone over one body part: an invisible band with a floating "current item ✎" chip; the band
  // that owns the open picker glows. Tapping toggles that slot's rack open/closed.
  const zone = (slot: ApparelSlot, icon: string, label: string) => {
    const active = clubhouseView.slot === slot ? ' gs-czone--active' : '';
    return `<button class="gs-czone gs-czone--${slot}${active}" data-clubslot="${slot}" aria-label="Change ${ch.shortName}'s ${slot}">
      <span class="gs-czone__chip">${icon} ${label} <span class="gs-czone__pen">✎</span></span>
    </button>`;
  };
  const shipActive = clubhouseView.slot === 'ship' ? ' gs-garage--active' : '';

  return `
    <header style="border-left:4px solid ${ch.style.cap};padding-left:10px;">
      <h1 style="margin:0;font-size:22px;">🏠 ${ch.name}'s Clubhouse</h1>
      <p style="opacity:.75;font-size:13px;margin:.3em 0;">Tap ${ch.shortName} to restyle them, tap the garage to pick a ride.</p>
    </header>
    <div class="gs-cstage">
      <div class="gs-cstage__figure">${preview}</div>
      ${zone('hat', '🎩', nameOf(hatId, 'No hat'))}
      ${zone('shirt', '👕', nameOf(shirtId, 'Default shirt'))}
      ${zone('pants', '👖', nameOf(pantsId, 'Default pants'))}
      ${zone('bag', '🎒', nameOf(bagId, 'No bag'))}
    </div>
    ${setBadge}
    <button class="gs-garage${shipActive}" data-clubslot="ship" aria-label="Change ${ch.shortName}'s ride">
      <span class="gs-garage__art" aria-hidden="true">${clubhouseGarageArt(shipId, shipAccent)}</span>
      <span class="gs-garage__cap">
        <span>
          <span class="gs-garage__name">🛸 ${ship?.name ?? 'Ship'}</span>
          <span class="gs-garage__sub">${ship ? `${ship.set} · ${ship.rarity}` : ''}</span>
        </span>
        <span class="gs-garage__edit">Change ride ✎</span>
      </span>
    </button>
    ${clubhousePicker(ch, hatId, shirtId, pantsId, shipId, bagId)}
    <div style="margin-top:14px;text-align:center;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
      ${btn('🏠 Back to Clubhouse', { type: 'clubhouseBackToHall' }, { variant: 'ghost' })}
      ${btn('🚀 Buy more at Trade Market', { type: 'openMarket' }, { variant: 'ghost' })}
      ${btn('← Back to title', { type: 'closeClubhouse' }, { variant: 'ghost' })}
    </div>`;
}

/** A Clubhouse wardrobe card (GS-clubhouse) — an equip toggle for an OWNED garment on the managed
 *  golfer (worn → click to take off). Only ever rendered for owned pieces. */
function clubhouseApparelCardHTML(
  item: Apparel,
  hatId: string | undefined,
  shirtId: string | undefined,
  pantsId: string | undefined,
  bagId: string | undefined,
): string {
  const ring = cosmeticRarCol(item.rarity);
  const wornId =
    item.slot === 'hat' ? hatId : item.slot === 'shirt' ? shirtId : item.slot === 'bag' ? bagId : pantsId;
  const worn = wornId === item.id;
  const accent = worn ? '#ffce54' : ring;
  const footer = worn ? '✓ WEARING' : 'Wear this';
  return apparelCardChrome(item, footer, { ring, accent, action: { type: 'equipApparel', id: item.id }, glow: worn || isMythic(item.rarity) });
}
