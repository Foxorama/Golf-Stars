/**
 * Story-Tour ALLY interactions (GS-story-allies) — the content model behind the clubhouse crew wall. Once
 * you recruit a friend out in the galaxy (`hiredCaddyIds`, GS-story-caddies), they stand in the Clubhouse
 * and you can TAP them to talk: a portrait card with who they are, their faction, and a line of banter that
 * rotates as you tap. Pure content-as-data — a new ally is a row, never an engine edit.
 *
 * PURE + DOM-free. This is the seam the deeper per-ally SIDE QUESTS (GS-story-quests) hang off next: the
 * ally card is where a quest offer / progress / turn-in surfaces, so the interaction lives here so tests can
 * reason about it. For now it's flavour + faction; the quest layer extends the same rows.
 */

import { factionForCaddy, factionById } from './factions';
import { shopItem, isNamedCaddy } from './economy';
import { STORY_CADDY_STOCK } from './storyCaddies';
import type { StoryState } from './story';

/** One ally's talk content: a one-line "who they are" tagline + rotating banter lines (cycled by a tap
 *  counter, the Parrot-bar pattern). Chapter/alignment colouring can be layered on later; for now the lines
 *  are timeless character banter so a fresh recruit always has something to say. */
export interface StoryAllyTalk {
  /** The caddy shop-item id (the roster key). */
  caddyId: string;
  /** A short "who they are on this crew" line, shown under their name. */
  tagline: string;
  /** Rotating banter lines — tap the ally to cycle. Kept in-character (see the story bible roster). */
  lines: readonly string[];
}

/** The crew's talk rows (GS-story-allies) — one per recruitable caddy. Keyed by shop-item id. */
export const STORY_ALLY_TALK: Record<string, StoryAllyTalk> = {
  'driver-dan': {
    caddyId: 'driver-dan',
    tagline: 'Your first friend on the road — swears the answer to everything is more club.',
    lines: [
      '"Whatever the shot is, kid, the answer’s more club. Trust old Dan."',
      '"That wreck out past the Ghost Sector? …Never mind. Long time ago."',
      '"I hauled freight across this whole galaxy before I ever carried a bag. Seen things."',
      '"You keep the ball moving, I’ll keep you honest. That’s the deal."',
    ],
  },
  'auto-caddie': {
    caddyId: 'auto-caddie',
    tagline: 'The Wardens’ serene short-game sage — speaks in koans about pace and surrender.',
    lines: [
      '"The putt does not miss. The reader does. Breathe, and let the green tell you."',
      '"Pace first, line second. A ball that never stops rolling is the serpent’s dream."',
      '"You strike well. But can you let go at the top of the swing? That is the whole game."',
      '"I have read greens older than the Coil. They all say the same thing: be still."',
    ],
  },
  'sandy-sandsaver': {
    caddyId: 'sandy-sandsaver',
    tagline: 'Escape artist of the dunes — never met a bunker she couldn’t get out of.',
    lines: [
      '"Buried lie? Plugged in the face? Good. That’s where the fun is."',
      '"Out in the Vela dunes I once holed out from a fried-egg lie. Twice. Same hole."',
      '"Sand’s honest. It only punishes you as much as you deserve. Unlike people."',
      '"Open the face, trust the bounce, take a big cut. Works on planets, works on the void."',
    ],
  },
  'dr-chipinski': {
    caddyId: 'dr-chipinski',
    tagline: 'The Para-Spatial Medics’ short-game doctor — on call across space and time.',
    lines: [
      '"You rang? Ha — of course you did. Let’s have a look at that chipping stroke."',
      '"A cold wedge is a sick wedge. Warm hands, soft grip, and the patient recovers nicely."',
      '"I’ve stitched up worse rounds than yours in worse places than this. You’ll live."',
      '"Every up-and-down is a little resurrection. That’s the medicine I practise."',
    ],
  },
  'suggestible-sam': {
    caddyId: 'suggestible-sam',
    tagline: 'Eager Long-Haul yardage man — sure he’s handed you exactly the right stick.',
    lines: [
      '"Seven-iron! Unless you were thinking six? Six is good. Great, actually. Six!"',
      '"Whatever you reckon, boss, I reckon it too. Only more so."',
      '"I read the yardage twice to be sure. Then a third time. Then I trusted you."',
      '"You want the driver? You’ve GOT the driver. I love this club now. Best club."',
    ],
  },
  'mystic-mole': {
    caddyId: 'mystic-mole',
    tagline: 'A blind digging sage of the Putters’ Guild — reads the break by feel, from below.',
    lines: [
      '"I cannot see your line. I do not need to. I feel where the world wants the ball to rest."',
      '"Down in the dark, every green is the same green. It all slopes toward the Long Rest."',
      '"You surface-dwellers read with your eyes. Amateurs. The break lives in the soil."',
      '"The serpent is a burrower too, you know. We are… not so different. It worries me."',
    ],
  },
};

/** Talk content for an ally, or undefined if the id has none (a non-caddy, or an unrostered one). */
export function allyTalk(caddyId: string): StoryAllyTalk | undefined {
  return STORY_ALLY_TALK[caddyId];
}

/** The banter line to show for the given tap count (wraps). Empty string if the ally has no talk. */
export function allyLineAt(caddyId: string, talkCount: number): string {
  const t = allyTalk(caddyId);
  if (!t || t.lines.length === 0) return '';
  const i = ((talkCount % t.lines.length) + t.lines.length) % t.lines.length;
  return t.lines[i]!;
}

/** The faction display name for an ally ("The Long Haul Truckers", …), or '' if none. */
export function allyFactionName(caddyId: string): string {
  const fid = factionForCaddy(caddyId);
  return (fid && factionById(fid)?.name) || '';
}

/** The faction one-line blurb for an ally, or '' if none. */
export function allyFactionBlurb(caddyId: string): string {
  const fid = factionForCaddy(caddyId);
  return (fid && factionById(fid)?.blurb) || '';
}

/** The ally's display name (the caddy shop item's name), or a fallback. */
export function allyName(caddyId: string): string {
  return shopItem(caddyId)?.name ?? 'a friend';
}

/** The world where this ally was recruited (their "home"), or undefined. */
export function allyHomeWorld(caddyId: string): string | undefined {
  return Object.keys(STORY_CADDY_STOCK).find((worldId) => STORY_CADDY_STOCK[worldId] === caddyId);
}

/** Every ally that is a real recruitable caddy AND has talk content — a machine-checkable invariant
 *  (every roster caddy should be talkable so the crew wall never shows a mute friend). */
export function talkableAllies(): string[] {
  return Object.values(STORY_CADDY_STOCK).filter((id) => isNamedCaddy(id) && !!allyTalk(id));
}

/** The hired allies to show on the clubhouse crew wall, in a stable order (recruit order). */
export function crewRoster(story: StoryState): string[] {
  return story.hiredCaddyIds.filter((id) => !!allyTalk(id));
}
