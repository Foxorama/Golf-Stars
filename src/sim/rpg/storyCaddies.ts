/**
 * Story-Tour CADDY ROSTER (GS-story-caddies) — "gather your friends". The campaign's Warden allies are the
 * existing NAMED caddies (Driver Dan, Penelope, Sandy, …); you RECRUIT them one at a time out in the galaxy
 * — each waits at a thematically-fitting world (Dan at the derelict that was his old ship, Sandy in the
 * dunes, …) and is hired for credits when you've cleared that world. The same per-world, travel-back economy
 * as the Pro Shop and the ship vendors: a friend belongs to a place, so you go and find them. Hiring is
 * once-and-kept (`hiredCaddyIds`, a permanent roster — no fire); you CHOOSE which one carries your bag in the
 * clubhouse Locker (`activeCaddyId`, an equip, not a purchase). The active caddy folds its real loadout
 * effect into every Story round (auto ≡ interactive, via the shared `loadout.perks`) and appears on the
 * course, exactly like a Voyage caddy — so a friend on the bag both helps and shows.
 *
 * PURE + DOM-free. `hiredCaddyIds`/`activeCaddyId` already live on `StoryState` (no save bump).
 */

import { shopItem, isNamedCaddy, startingLoadout, type PlayerLoadout } from './economy';
import { heraldCaddyEffect, isHeraldAgent } from './storyHeraldCrew';
import type { StoryState } from './story';

/** Which named caddy waits at which world (recruit them there once it's cleared). One friend per world,
 *  placed where they belong. A world can host both a caddy AND a ship vendor — more reasons to travel. */
export const STORY_CADDY_STOCK: Record<string, string> = {
  'derelict-18': 'driver-dan', // the Ghost Wreck — the derelict that was his old long-haul girl
  'desert-18': 'sandy-sandsaver', // Vela Dunes — the sand-saver in her element
  'inferno-18': 'dr-chipinski', // Orion Forge — the short-game doctor amid the fire
  'crystal-18': 'auto-caddie', // Coronae Prism — Penelope Putter, serene on true crystal greens
  'frost-18': 'suggestible-sam', // Cygnus Links — Suggestible Sam out on the exposed edge
  'swamp-18': 'mystic-mole', // Hydra Mire — Mystic Mole, at home in the deep
};

/** The flat credit cost to recruit a caddy (a legendary friend — a real, but affordable, commitment). */
export const STORY_CADDY_PRICE = 350;

/** The caddy that can be recruited at a world (undefined if none waits there). */
export function worldCaddy(worldId: string): string | undefined {
  return STORY_CADDY_STOCK[worldId];
}
/** Does a world host a recruitable caddy? */
export function worldHasCaddy(worldId: string): boolean {
  return !!STORY_CADDY_STOCK[worldId];
}
/** Is this caddy already on the roster? */
export function storyCaddyHired(story: StoryState, caddyId: string): boolean {
  return story.hiredCaddyIds.includes(caddyId);
}
/** The active caddy id (the one carrying your bag), or undefined. */
export function activeStoryCaddy(story: StoryState): string | undefined {
  return story.activeCaddyId && story.hiredCaddyIds.includes(story.activeCaddyId) ? story.activeCaddyId : undefined;
}

/**
 * GS-story-caddy-rep: has the player completed a Story round with this caddy on the bag? The lightweight
 * REPUTATION gate the ally side quests read — a friend opens up about their personal quest only after
 * you've actually carried the bag together, never the instant you recruit. Path-agnostic (a Warden caddy or
 * a Herald Coil volunteer alike).
 */
export function caddiedWith(story: StoryState, caddyId: string): boolean {
  return story.caddiedRoundIds.includes(caddyId);
}

/**
 * GS-story-caddy-rep: record that a Story round was just played with the ACTIVE caddy on the bag (pure,
 * idempotent) — a no-op when no caddy is active. Called from every Story-round resolution (world clear /
 * qualifier / quest / tournament), so a caddy earns their quest by carrying the bag, not by being hired.
 */
export function recordCaddyRound(story: StoryState): StoryState {
  const id = activeStoryCaddy(story);
  if (!id || story.caddiedRoundIds.includes(id)) return story;
  return { ...story, caddiedRoundIds: [...story.caddiedRoundIds, id] };
}

/**
 * Recruit a caddy (pure): spend `STORY_CADDY_PRICE`, add to the kept roster, and — if this is your FIRST
 * friend — make them active by default. No-op if already hired, unaffordable, or not a real named caddy.
 */
export function hireStoryCaddy(story: StoryState, caddyId: string): StoryState {
  if (story.hiredCaddyIds.includes(caddyId)) return story;
  if (!isNamedCaddy(caddyId)) return story;
  // GS-story-quality (GAP1): the Warden friends won't join the golfer who betrayed them — no recruiting on
  // the Herald path (their Coil inner circle stands in the clubhouse instead).
  if (story.alignment === 'herald') return story;
  if (story.credits < STORY_CADDY_PRICE) return story;
  const hiredCaddyIds = [...story.hiredCaddyIds, caddyId];
  const activeCaddyId = story.activeCaddyId ?? caddyId; // first hire carries the bag by default
  return { ...story, credits: story.credits - STORY_CADDY_PRICE, hiredCaddyIds, activeCaddyId };
}

/** Choose which owned caddy carries your bag (pure, an EQUIP — no cost). `undefined` benches all of them.
 *  No-op if the id isn't on the roster. */
export function setActiveStoryCaddy(story: StoryState, caddyId: string | undefined): StoryState {
  if (caddyId !== undefined && !story.hiredCaddyIds.includes(caddyId)) return story;
  return { ...story, activeCaddyId: caddyId };
}

/**
 * Fold the active caddy's effect onto a Story-round loadout (pure) — the caddy shop-item's own `apply`,
 * which adds its effect fields AND its perk id, so the shared engine + the on-course render both see it
 * (auto ≡ interactive). A no-op when no active caddy is set. The sibling of `applyStoryGear`.
 */
export function applyStoryCaddy(loadout: PlayerLoadout, story: StoryState): PlayerLoadout {
  const id = activeStoryCaddy(story);
  if (!id) return loadout;
  // GS-story-quality: a Herald's Coil VOLUNTEER (an inner-circle agent, not a shop caddy) folds its own
  // effect; a Warden named caddy folds its shop-item effect. Either way the active bag caddy HELPS the round.
  if (isHeraldAgent(id)) {
    const fx = heraldCaddyEffect(id);
    return fx ? fx.apply(loadout) : loadout;
  }
  const item = shopItem(id);
  return item?.apply ? item.apply(loadout) : loadout;
}

/**
 * GS-story-caddy-read: does THIS caddy read the break for you? PROBED off the caddy's own loadout fold —
 * the same `apply` the round uses — so there is no second list of "who reads greens" to fall out of step
 * when a new caddy grants it. Works for a Warden shop caddy (the Mystic Mole) and a Coil volunteer (the
 * Whisperer) alike; false for a caddy with no read (and for the `undefined` bag).
 *
 * The read ROW on the putt screen needs this to name whoever actually found the line: `loadout.greenRead`
 * alone says a read exists, not where it came from — it can equally be gear (the Seer's Circlet) or a
 * reward club (Penelope's putter) — and the row hard-coded "Mole reads" for all of them.
 */
export function caddyReadsGreen(id: string | undefined): boolean {
  if (!id) return false;
  const base = startingLoadout();
  const item = shopItem(id);
  if (item?.apply) return !!item.apply(base).greenRead;
  return !!heraldCaddyEffect(id)?.apply(base).greenRead;
}
