/**
 * WHO tees it up beside you in a Story-Tour paired event (GS-story-coil-partners) — the one seam every
 * partner picker, draw sheet, scramble card and recap reads.
 *
 * The Story Tour's paired formats (the team Sigils, and now every paired QUALIFYING EVENT) hand you a
 * partner. That pool used to be one fixed list — `otherGolferIds`, your three Earth tour-mates — which was
 * right for the whole campaign right up until The Choice. Turn HERALD and those three are the people you
 * betrayed: they desert the bag (`applyHeraldCaddies` swaps the whole crew for the Coil's inner circle) and
 * two of them come for you at the Ghost Harvest. Offering "play this qualifier with Larry" to a player
 * flying the Coil's colours was the report — the picker had simply never been told about the fork.
 *
 * So: **the pool follows the path.** Warden / undecided → your three tour-mates, exactly as before. Herald →
 * the Coil circle who actually sail with you (Voss, Venoma, Ouros, Ecdysis). Both pools are the same size,
 * so the draw sheet's shape is unchanged; the pool is a pure function of `alignment`, so a campaign's sheet
 * stays FIXED (nothing here reads a mutable slot like the active caddy).
 *
 * PURE + DOM-free, zero rng. `storyPartnerName` resolves a display name for ANY partner id the game can
 * hand it — a playable golfer, a Coil agent, a Coil champion (the Sigil-5 finale ally) — so no caller needs
 * to know which kind it has.
 */

import { getCharacter } from './characters';
import { otherGolferIds } from './storyCast';
import { HERALD_CREW, heraldAgent } from './storyHeraldCrew';
import { isCoilChampionId, coilChampionName } from './storyBetrayal';
import type { StoryState } from './story';

/** One selectable partner: the id the plan/run carries, and the short name the UI shows. */
export interface StoryPartnerOption {
  id: string;
  name: string;
}

/** Is this campaign flying the Coil's colours (so its partners are Coil agents, not tour-mates)? */
function isHerald(story: StoryState): boolean {
  return story.alignment === 'herald';
}

/**
 * The partner POOL for a paired story event, in stable order — your three tour-mates on the Warden/
 * undecided path, the Coil inner circle once you are the Herald. Never empty.
 */
export function storyPartnerIds(story: StoryState): string[] {
  return isHerald(story) ? HERALD_CREW.map((a) => a.id) : otherGolferIds(story);
}

/** The same pool with display names, for a picker. */
export function storyPartnerPool(story: StoryState): StoryPartnerOption[] {
  return storyPartnerIds(story).map((id) => ({ id, name: storyPartnerName(id) }));
}

/** Is this id a partner the player may actually pick right now (the picker's validation)? */
export function isStoryPartnerId(story: StoryState, id: string | undefined): boolean {
  return !!id && storyPartnerIds(story).includes(id);
}

/**
 * The SHORT display name for any partner id — a playable golfer ("Larry"), a Coil agent ("Venoma"), or a
 * Coil champion id (the finale ally). Falls back to a neutral "your partner" so no surface can ever print a
 * raw id at the player.
 */
export function storyPartnerName(id: string | undefined): string {
  if (!id) return 'your partner';
  const golfer = getCharacter(id);
  if (golfer) return golfer.shortName;
  const agent = heraldAgent(id);
  if (agent) return agent.shortName;
  // A bare champion id (`venoma`) — strip the nickname quotes for a short, speakable name.
  if (isCoilChampionId(id)) return coilChampionName(id).split('"')[0]!.trim().split(' ')[0]!;
  return 'your partner';
}
