/**
 * Story-Tour GEAR (GS-story-gear) — effect-bearing equipment sold in the per-world Pro Shops: a glove,
 * a cap, shoes, a ball. Unlike a cosmetic, each fold a REAL `PlayerLoadout` effect into a Story round
 * (tighter dispersion, a wider putt window, lie relief out of trouble, more approach bite). PURE +
 * DOM-free; the Pro Shop screen + the reusable lore card render it.
 *
 * One item per SLOT is equipped at a time (`StoryState.equippedGear[slot]`), swapped by buying/equipping
 * another of that slot. Effects are folded onto the round loadout by `applyStoryGear` at tee-off — Story
 * rounds ONLY, so Voyage/Unending are byte-for-byte unchanged (they never call it; the folded fields all
 * default to no-ops, the caddy-field pattern). Ids are `gear:<slot>:<variant>`; the art routes off the
 * slot (`render/itemArt.ts itemArtKind`), the rarity tints it.
 *
 * Item-authoring rule (GS-story-lore-cards): every gear row carries its own art (via the slot), a
 * mechanical DETAIL, and bespoke LORE — never a bare stat. See docs/decisions/story-mode.md.
 */

import type { Rarity } from '../course/contract';
import type { PlayerLoadout } from './economy';
import { addCredits, type GearSlot, type StoryState } from './story';

/** A purchasable, equippable piece of Story gear. `apply` folds its effect onto a round loadout. */
export interface StoryGearItem {
  id: string;
  slot: GearSlot;
  name: string;
  rarity: Rarity;
  price: number;
  /** A short rack-card blurb. */
  blurb: string;
  /** The mechanical detail line(s) for the lore card (what it does). */
  detail: string[];
  /** The flavour lore paragraph(s). */
  lore: string[];
  /** Fold this item's effect onto the round loadout (pure). */
  apply: (loadout: PlayerLoadout) => PlayerLoadout;
}

// The gear catalogue. Effects mirror the Voyage gear economy's proven levers so they're balanced +
// familiar: dispersionMult (×<1 = tighter), puttBoost (+ = wider make-window), lieRelief (0..1 = softer
// bad-lie penalty), backspinBoost (+ = more approach check). Each defaults to a no-op when unequipped.
export const STORY_GEAR: readonly StoryGearItem[] = [
  // ── Glove (grip → tighter dispersion) ──────────────────────────────────────
  {
    id: 'gear:glove:tacky',
    slot: 'glove',
    name: 'Tacky Tour Glove',
    rarity: 'rare',
    price: 200,
    blurb: 'A surer grip — tighter shots.',
    detail: ['Dispersion ×0.93 — shots scatter less.'],
    lore: [
      'Cut from the hide of something that lived on a heavier world, the leather stays tacky in any ' +
        'atmosphere — vacuum-cold, jungle-wet, forge-hot. The grip never slips, so the swing never has ' +
        'to grip harder than it means to.',
      'A steady hand is the cheapest stroke you will ever buy.',
    ],
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.93 }),
  },
  {
    id: 'gear:glove:vice',
    slot: 'glove',
    name: 'Vice-Grip Gauntlet',
    rarity: 'epic',
    price: 380,
    blurb: 'A locked wrist — far tighter shots.',
    detail: ['Dispersion ×0.85 — a much tighter shot pattern.'],
    lore: [
      'Half glove, half exo-brace: micro-servos in the cuff sense the top of the backswing and lock ' +
        'the lead wrist flat for a fraction of a second at impact. The Wardens issue them to golfers ' +
        'flying into the gale-worlds, where a loose hand is a lost ball.',
      'It is said the first pilot to wear one shot the Draco Gale in the storm of the century and never ' +
        'missed a fairway. It is also said she never took it off again.',
    ],
    apply: (m) => ({ ...m, dispersionMult: m.dispersionMult * 0.85 }),
  },
  // ── Cap (a clear read → a wider putt make-window) ──────────────────────────
  {
    id: 'gear:hat:visor',
    slot: 'hat',
    name: 'Polarised Tour Visor',
    rarity: 'rare',
    price: 200,
    blurb: 'A cleaner read — holes more putts.',
    detail: ['Putt make-window +8% — the line reads truer.'],
    lore: [
      'The lens filters out a star’s glare and paints the green’s fall-lines in faint false colour, so ' +
        'the break stops being a guess. Old caddies grumble that reading greens should be an art, not a ' +
        'setting — then quietly ask where you got one.',
      'You still have to roll it. The visor only tells you the truth.',
    ],
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.08 }),
  },
  {
    id: 'gear:hat:focus',
    slot: 'hat',
    name: 'Focus Crown',
    rarity: 'epic',
    price: 380,
    blurb: 'Total focus — holes far more putts.',
    detail: ['Putt make-window +16% — the read is dead certain.'],
    lore: [
      'A circlet of quiet: it damps the noise of the gallery, the hum of the ship, the whisper of the ' +
        'Coil at the edge of hearing, until there is nothing left but the ball, the cup, and the line ' +
        'between them. Wardens meditate in it before a final round.',
      'Some who wear it too long say the silence starts to feel like company. They put it away for a while.',
    ],
    apply: (m) => ({ ...m, puttBoost: (m.puttBoost ?? 0) + 0.16 }),
  },
  // ── Shoes (traction → lie relief out of trouble) ───────────────────────────
  {
    id: 'gear:shoes:spikes',
    slot: 'shoes',
    name: 'All-Terrain Spikes',
    rarity: 'rare',
    price: 200,
    blurb: 'A planted stance — better from bad lies.',
    detail: ['Lie relief — bad lies (rough / sand / trees) hurt less.'],
    lore: [
      'Self-adjusting cleats bite dune-sand, wet fescue, cracked lava-crust and bare deck-plate alike, ' +
        'so a lousy stance stops stealing the shot. The soles were reverse-engineered from a mountain ' +
        'grazer that never once lost its footing on a cliff.',
      'You can’t always find the fairway. You can always stand up straight when you don’t.',
    ],
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.3) }),
  },
  {
    id: 'gear:shoes:gravlock',
    slot: 'shoes',
    name: 'Gravity-Lock Boots',
    rarity: 'epic',
    price: 380,
    blurb: 'Rooted to the ground — great from any lie.',
    detail: ['Strong lie relief — even brutal lies play close to clean.'],
    lore: [
      'Mag-clamp soles that grip the planet itself. On the low-gravity worlds — the bomber’s junkyards, ' +
        'the drifting wrecks — they are the difference between a swing and a slow-motion tumble into the ' +
        'void. Plant, load, fire; the ground holds you the whole way through.',
      'The Wardens who salvage the Ghost Wreck will not step aboard without them.',
    ],
    apply: (m) => ({ ...m, lieRelief: Math.max(m.lieRelief ?? 0, 0.45) }),
  },
  // ── Ball (cover → approach bite / check) ───────────────────────────────────
  {
    id: 'gear:ball:soft',
    slot: 'ball',
    name: 'Soft-Cover Tour Ball',
    rarity: 'rare',
    price: 180,
    blurb: 'More check — approaches bite and hold.',
    detail: ['Backspin +8% — wedges and short irons stop faster.'],
    lore: [
      'A urethane cover milled so fine the grooves of a wedge can really grab it, so an approach lands, ' +
        'skips once, and sits. On a firm green that is the whole game: fly it to the flag and trust it ' +
        'to stay.',
      'A box of a dozen, refilled at every Pro Shop. You will lose some. Buy more.',
    ],
    apply: (m) => ({ ...m, backspinBoost: (m.backspinBoost ?? 0) + 0.08 }),
  },
  {
    id: 'gear:ball:zip',
    slot: 'ball',
    name: 'Zip-Spin Ball',
    rarity: 'epic',
    price: 360,
    blurb: 'Vicious check — approaches rip back.',
    detail: ['Backspin +15% — approaches bite hard and can spin back.'],
    lore: [
      'A dual-core ball with a cover that seems to remember the groove it was struck with: it flies flat ' +
        'and hot, then the moment it touches turf it snaps into reverse, hunting back toward the pin. ' +
        'First-timers routinely spin it off the front of the green and swear off it — then buy another sleeve.',
      'Respect the check. A back pin wants it; a front pin punishes it.',
    ],
    apply: (m) => ({ ...m, backspinBoost: (m.backspinBoost ?? 0) + 0.15 }),
  },
  {
    id: 'gear:ball:comet',
    slot: 'ball',
    name: 'Comet Ball',
    rarity: 'legendary',
    price: 620,
    blurb: 'Long AND biting — the apex ball.',
    detail: ['Backspin +18% AND a longer carry on the distance clubs.', 'Trails a faint comet tail in flight.'],
    lore: [
      'A ball with a real cometary chip at its core — a mote of ice and iron that fell across half the ' +
        'galaxy before someone caught it and wound a cover around it. It flies further than it has any ' +
        'right to and still bites like a tour ball, and it draws a thin silver tail behind it so the ' +
        'whole gallery can watch it go.',
      'The Wardens only sell them in the serpent’s reaches, to golfers who have earned the right to lose one.',
    ],
    apply: (m) => ({
      ...m,
      backspinBoost: (m.backspinBoost ?? 0) + 0.18,
      minCarryBoost: m.minCarryBoost + 0.04,
    }),
  },
];

/** Per-world gear stock (content-as-data) — a curated 1–2 items per world, tiered by chapter, so travel
 *  fills out the locker. Filtered to hide what you own (see `storyGearStock`). */
export const STORY_GEAR_STOCK: Record<string, readonly string[]> = {
  // Chapter 1 — the rare Warden basics.
  'verdant-18': ['gear:glove:tacky'],
  'verdant2-18': ['gear:hat:visor'],
  'desert-18': ['gear:shoes:spikes', 'gear:ball:soft'],
  // Chapter 2 — a first epic appears.
  'inferno-18': ['gear:glove:vice'],
  'inferno2-18': ['gear:ball:soft'],
  'frost-18': ['gear:hat:visor', 'gear:shoes:spikes'],
  // Chapter 3 — the epic line fills in.
  'tempest-18': ['gear:glove:vice', 'gear:hat:focus'],
  'crystal-18': ['gear:hat:focus'],
  'fungal-18': ['gear:ball:zip'],
  // Chapter 4 — epics everywhere.
  'ocean-18': ['gear:shoes:gravlock', 'gear:ball:zip'],
  'void2-18': ['gear:shoes:gravlock'],
  'crystal2-18': ['gear:glove:vice', 'gear:hat:focus'],
  // Chapter 5 — the legendary ball in the serpent's reaches.
  'swamp-18': ['gear:ball:comet'],
  'derelict-18': ['gear:shoes:gravlock', 'gear:ball:comet'],
  'cetus-18': ['gear:ball:comet'],
};

/** Look up a gear item by id. */
export function storyGearById(id: string): StoryGearItem | undefined {
  return STORY_GEAR.find((g) => g.id === id);
}

/** Does the player own this gear? */
export function storyGearOwned(story: StoryState, id: string): boolean {
  return story.ownedGearIds.includes(id);
}

/** Is this gear currently equipped in its slot? */
export function storyGearEquipped(story: StoryState, item: StoryGearItem): boolean {
  return story.equippedGear[item.slot] === item.id;
}

/** A world's gear rack: the curated stock minus anything already owned. */
export function storyGearStock(story: StoryState, worldId: string): StoryGearItem[] {
  const ids = STORY_GEAR_STOCK[worldId] ?? [];
  return ids
    .map((id) => storyGearById(id))
    .filter((it): it is StoryGearItem => !!it && !story.ownedGearIds.includes(it.id));
}

/** Can the player buy this gear right now — not owned and affordable? */
export function canBuyStoryGear(story: StoryState, item: StoryGearItem): boolean {
  return !storyGearOwned(story, item.id) && story.credits >= item.price;
}

/**
 * Buy a gear item (pure): deduct credits, add to owned, and EQUIP it in its slot (replacing whatever was
 * there — one item per slot). No-op if unaffordable/owned. Immutable.
 */
export function buyStoryGear(story: StoryState, item: StoryGearItem): StoryState {
  if (!canBuyStoryGear(story, item)) return story;
  let next = addCredits(story, -item.price);
  if (!next.ownedGearIds.includes(item.id)) next = { ...next, ownedGearIds: [...next.ownedGearIds, item.id] };
  return { ...next, equippedGear: { ...next.equippedGear, [item.slot]: item.id } };
}

/**
 * Fold every equipped gear item's effect onto a round loadout (pure). Story rounds ONLY — called at
 * tee-off after the bag is set. Unknown/absent gear is skipped, so an un-geared campaign is a no-op
 * (byte-for-byte the plain loadout). Voyage/Unending never call this.
 */
export function applyStoryGear(loadout: PlayerLoadout, story: StoryState): PlayerLoadout {
  let out = loadout;
  for (const slot of Object.keys(story.equippedGear) as GearSlot[]) {
    const id = story.equippedGear[slot];
    const item = id ? storyGearById(id) : undefined;
    if (item) out = item.apply(out);
  }
  return out;
}
