/**
 * Story-Tour Pro Shops (GS-story-econ) — the per-world rack you spend campaign credits at to grow the
 * green bag. PURE + DOM-free (vitest exercises the catalogue + buy logic headlessly); screens live in
 * `src/app/storyShopScreens.ts` and the reusable lore card in `src/render/loreCard.ts`.
 *
 * WHAT'S SOLD: individual THEMED clubs — the existing Voyage reward sets (Planet / Phoenix Flames /
 * Solar Storm), each an `club:<set>:<type>` id that resolves through the shared `buildRewardClub`
 * machinery (so a bought Pro-Shop club plays exactly as the same Voyage reward: carry bonus on distance
 * clubs, a wider putt make-window, themed art the golfer swings). Buying grows/upgrades the bag; the
 * campaign is unchanged otherwise. No save bump — owned/equipped stay id-lists (`StoryState`).
 *
 * LORE-CARD PRINCIPLE (GS-story-lore-cards): there's never room for image + name + detail + lore inline,
 * and the lore is what fills out the galaxy. So every item carries composed flavour — a SET lore line +
 * a per-TYPE flavour + a mechanical detail line — surfaced on a tap-to-inspect card. New content reuses
 * existing flavour (the set names are canon: Planet / Phoenix Flames / Solar Storm) or adds its own here.
 */

import type { Rarity } from '../course/contract';
import { clubById } from '../clubs';
import { clubSetById, buildRewardClub, isDistanceType, type ClubSet } from './economy';
import { addCredits, equipStoryClub, worldCleared, type StoryState } from './story';

/** A single purchasable Pro-Shop item. Today only themed CLUBS (gear/ships/upgrades land in later
 *  chunks reusing this shape); a club item's `id` IS the granted `club:<set>:<type>` club id. */
export interface StoryShopItem {
  id: string;
  kind: 'club';
  /** The set + base type it grants (a club item). */
  setId: string;
  clubType: string;
}

/** Credit price per themed set (Story Tour's single persistent purse; ~1–2 world clears afford an early
 *  club). Planet clubs are the affordable staples; Phoenix and Solar climb with the campaign. */
const STORY_CLUB_PRICE: Record<string, number> = {
  tour: 180, // Planet — distance woods/hybrids
  pro: 160, // Planet — scoring irons + putter
  masters: 340, // Phoenix Flames — epic complete line
  solar: 600, // Solar Storm — legendary apex line
};

/**
 * Per-world Pro-Shop stock (content-as-data). Each charted world sells a curated 3-item rack, tiered by
 * chapter (Planet early → Phoenix mid → Solar late) and picked so TRAVEL is COLLECTION — different worlds
 * carry different clubs. An id already OWNED is filtered out of the rack (see `storyShopStock`). The
 * Earth prologue (`standrews-18`) has no rack — you shop only once the campaign opens up to space.
 */
export const STORY_SHOP: Record<string, readonly string[]> = {
  // Chapter 1 — the Planet line (rare staples that grow the lean green bag).
  'verdant-18': ['club:tour:3W', 'club:pro:3i', 'club:pro:putter'],
  'verdant2-18': ['club:tour:5W', 'club:tour:2H', 'club:pro:7i'],
  'desert-18': ['club:tour:D', 'club:pro:4H', 'club:pro:9i'],
  // Chapter 2 — the first Phoenix Flames pieces sit beside Planet stock.
  'inferno-18': ['club:masters:D', 'club:tour:3W', 'club:pro:5i'],
  'inferno2-18': ['club:masters:3W', 'club:masters:putter', 'club:pro:3i'],
  'frost-18': ['club:masters:5W', 'club:tour:2H', 'club:pro:7i'],
  // Chapter 3 — the full Phoenix Flames line.
  'tempest-18': ['club:masters:2H', 'club:masters:4H', 'club:masters:5i'],
  'crystal-18': ['club:masters:3i', 'club:masters:7i', 'club:masters:putter'],
  'fungal-18': ['club:masters:D', 'club:masters:9i', 'club:pro:putter'],
  // Chapter 4 — the first Solar Storm apex clubs appear.
  'ocean-18': ['club:solar:D', 'club:masters:3W', 'club:masters:4H'],
  'void2-18': ['club:solar:3W', 'club:masters:2H', 'club:masters:5i'],
  'crystal2-18': ['club:solar:5W', 'club:masters:3i', 'club:masters:putter'],
  // Chapter 5 — the serpent's reaches: the legendary Solar Storm line.
  'swamp-18': ['club:solar:2H', 'club:solar:4H', 'club:solar:putter'],
  'derelict-18': ['club:solar:3i', 'club:solar:5i', 'club:solar:7i'],
  'cetus-18': ['club:solar:D', 'club:solar:9i', 'club:solar:putter'],
};

/** Parse a club item id (`club:<set>:<type>`) into a `StoryShopItem`, validating both halves resolve. */
export function storyItemById(id: string): StoryShopItem | undefined {
  if (!id.startsWith('club:')) return undefined;
  const [, setId, clubType] = id.split(':');
  if (!setId || !clubType) return undefined;
  if (!clubSetById(setId) || !clubById(clubType)) return undefined;
  return { id, kind: 'club', setId, clubType };
}

/** Does the player already own this item's club (by exact themed id)? */
export function storyItemOwned(story: StoryState, item: StoryShopItem): boolean {
  return story.ownedClubIds.includes(item.id);
}

/** The credit price of an item. */
export function storyItemPrice(item: StoryShopItem): number {
  return STORY_CLUB_PRICE[item.setId] ?? 200;
}

/** The rarity of an item (its set's rarity). */
export function storyItemRarity(item: StoryShopItem): Rarity {
  return clubSetById(item.setId)?.rarity ?? 'common';
}

/** The display name of an item (the themed reward-club name, e.g. "Planet 3-Wood"). */
export function storyItemName(item: StoryShopItem): string {
  const set = clubSetById(item.setId);
  const base = clubById(item.clubType);
  if (!set || !base) return item.id;
  return buildRewardClub(set, item.clubType).name;
}

/**
 * A world's Pro-Shop rack: the curated stock MINUS anything already owned (so a revisit shows only what's
 * left, and an emptied rack reads "all bought"). Ids that fail to parse are dropped defensively.
 */
export function storyShopStock(story: StoryState, worldId: string): StoryShopItem[] {
  const ids = STORY_SHOP[worldId] ?? [];
  return ids
    .map((id) => storyItemById(id))
    .filter((it): it is StoryShopItem => !!it && !story.ownedClubIds.includes(it.id));
}

/** Can this world be shopped at all (has a rack and the campaign has opened up to space)? */
export function worldHasShop(worldId: string): boolean {
  return (STORY_SHOP[worldId]?.length ?? 0) > 0;
}

/** Can the player buy this item right now — not owned and affordable? */
export function canBuyStoryItem(story: StoryState, item: StoryShopItem): boolean {
  return !storyItemOwned(story, item) && story.credits >= storyItemPrice(item);
}

/**
 * Buy an item (pure): deduct credits, add it to owned clubs, and EQUIP it into the bag (upgrading a type
 * already carried in place, or appending a new type up to `MAX_STORY_BAG`). A no-op if unaffordable or
 * already owned (the caller gates on `canBuyStoryItem`, but this stays safe). Immutable.
 */
export function buyStoryItem(story: StoryState, item: StoryShopItem): StoryState {
  if (!canBuyStoryItem(story, item)) return story;
  let next = addCredits(story, -storyItemPrice(item));
  if (!next.ownedClubIds.includes(item.id)) next = { ...next, ownedClubIds: [...next.ownedClubIds, item.id] };
  next = equipStoryClub(next, item.id);
  return next;
}

// ── Lore composition (GS-story-lore-cards) ────────────────────────────────────────────────────────

/** The flavour line for each themed set — the canon behind the "planet clubs / phoenix flames". */
const SET_LORE: Record<string, string> = {
  tour:
    'Cast in the ringed foundries that circle a dead gas-giant, each Planet club is poured around a ' +
    'sliver of the world it is named for. The metal remembers orbit — it wants to swing true and long. ' +
    'The Wardens issue the Planet line to every golfer who leaves their home star for the first time.',
  pro:
    'The Planet scoring irons are ground on the same ringed foundries as the woods, but tuned for ' +
    'coverage over carry: a club for every yardage the lean bag skips, so you can dial the shot in ' +
    'close to the flag instead of forcing a swing you do not have.',
  masters:
    'When a club is broken on the fire-worlds it is not discarded — it is burned, and what rises from ' +
    'the ash is lighter, hungrier, and warm to the grip long after the shot. Phoenix Flames are said ' +
    'to score a hair truer the further you are from home, as if the fire wants you to keep going.',
  solar:
    'Tempered inside a living coronal loop, a Solar Storm shaft holds a charge you can feel through ' +
    'your glove at address. The apex line — there is no distance a Solar club fears and no wind it ' +
    'respects. Only champions who have crossed half the galaxy are ever offered one.',
};

/** The per-family flavour for the club itself. */
function typeFlavour(clubType: string): string {
  if (clubType === 'D') return 'The tee cannon — everything downrange begins here.';
  if (/W$/.test(clubType)) return 'A fairway wood: the long, safe reach that keeps a par-5 honest.';
  if (/H$/.test(clubType)) return 'The rescue club — forgiveness off a bad lie, distance without the long-iron nerves.';
  if (/i$/.test(clubType)) return 'A scoring iron: coverage for a yardage the lean bag skips, so you can dial it in.';
  if (clubType === 'putter') return 'The last club of the hole and the first of the argument. Roll it true.';
  return 'A trusty stick for the short game.';
}

/** The mechanical detail lines shown on the lore card (what the club actually does). */
export function storyItemDetail(item: StoryShopItem): string[] {
  const set = clubSetById(item.setId);
  const base = clubById(item.clubType);
  if (!set || !base) return [];
  const club = buildRewardClub(set, item.clubType);
  const lines: string[] = [];
  if (item.clubType === 'putter') {
    lines.push('On the greens — the putter.');
    if (set.puttBoost) lines.push(`Steadier make-window: +${Math.round(set.puttBoost * 100)}%.`);
  } else if (isDistanceType(item.clubType)) {
    const bonus = club.carry - base.carry;
    lines.push(`Distance club — carries ~${club.carry} yd${bonus > 0 ? ` (+${bonus} over standard)` : ''}.`);
  } else {
    lines.push(`Scoring club — carries ~${club.carry} yd.`);
    lines.push('Fills a gap in the lean green bag.');
  }
  return lines;
}

/** The composed lore paragraph(s) for the card: the set line + the club's own flavour. */
export function storyItemLore(item: StoryShopItem): string[] {
  const out: string[] = [];
  const setLore = SET_LORE[item.setId];
  if (setLore) out.push(setLore);
  out.push(typeFlavour(item.clubType));
  return out;
}

/** A short one-line blurb for the rack card face (distinct from the full lore). */
export function storyItemBlurb(item: StoryShopItem): string {
  const set = clubSetById(item.setId) as ClubSet | undefined;
  const label = set?.label || 'Themed';
  if (item.clubType === 'putter') return `${label} putter — a steadier roll.`;
  if (isDistanceType(item.clubType)) return `${label} distance — longer and truer.`;
  return `${label} coverage — dial the approach in.`;
}

/** The shopkeeper's one-line intro over the rack, per world (flavour). */
export const WORLD_SHOP_INTRO: Record<string, string> = {
  'verdant-18': 'The pro shop smells of cut grass and engine oil. Green-world staples on the wall.',
  'verdant2-18': 'A tidy little rack under a twin-sun awning.',
  'desert-18': 'Sun-bleached clubs stacked in the shade of a sail — everything here is built to take sand.',
  'inferno-18': 'The counter is an anvil. Everything on the wall has been through the fire once already.',
  'inferno2-18': 'Heat-hazed racks by the lava run. Handle with the glove on.',
  'frost-18': 'Frost on the shafts; the shopkeep breathes steam. Cold-forged, they say — steadier.',
  'tempest-18': 'The awning snaps in the gale, the clubs chained to the rack so they do not fly off.',
  'crystal-18': 'Light splits off every shaft into little rainbows. Precision gear.',
  'fungal-18': 'A shop grown, not built — shelves of living wood in the spore-glow.',
  'ocean-18': 'Salt-rimed racks on a floating deck, everything sold sealed against the sea.',
  'void2-18': 'A shop at the edge of a black hole. Prices in something rarer than credits — but they take credits.',
  'crystal2-18': 'Three-sided racks, everything angular. The shopkeep never blinks.',
  'swamp-18': 'The rack sits on stilts above the acid. The Coil trades here too — watch your back.',
  'derelict-18': 'A shop bolted into a dead ship’s hold. Half the stock is salvage; all of it works.',
  'cetus-18': 'A stall on the lip of a star-waterfall, the whale-song rattling the clubs on their hooks.',
};

/** Whether a cleared world's dossier should offer the "revisit → Pro Shop" action (has a rack). */
export function storyWorldShoppable(story: StoryState, worldId: string): boolean {
  return worldCleared(story, worldId) && worldHasShop(worldId);
}

/** Is this owned-club id currently equipped in the bag? (For the "Owned · in your bag" card state.) */
export function storyItemEquipped(story: StoryState, item: StoryShopItem): boolean {
  return story.equippedBagIds.includes(item.id);
}
