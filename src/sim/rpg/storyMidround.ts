/**
 * Story-Tour MID-ROUND OMEN (GS-story-midround-omen) — the pre-Choice betrayal foreshadow shown at the
 * NINE-HOLE PAUSE (the turn) of the Chapter-3 major, before The Choice forks the campaign.
 *
 * By Chapter 3 both team-Sigil partner picks are locked, so `betrayerId` — the odd one out — is already
 * settled. This beat makes that betrayal STOP being a switch-flip: at the turn you witness the future
 * betrayer's first real crack, keyed to WHY they're the odd one out (`betrayerOddness`):
 *   • SIDELINED (you picked two different partners → the betrayer is the one you NEVER chose): they mutter
 *     from the ropes that they're never good enough, and a Coil NPC (Voss or Venoma, per that golfer's own
 *     thread) drifts to their shoulder. The defection later lands softer because you saw this.
 *   • TEMPTED (you picked the SAME partner twice → the betrayer is the friend you TRUSTED most): they stood
 *     at the tee beside you when the Coil spoke, heard the word the same as you, and admit "maybe there's
 *     something to it". Pays off both ways — if you stay Warden they fall to it; if you turn Herald they
 *     resist it and cannot forgive that you didn't.
 *
 * PURE + DOM-free (no rng, no window): the render layer paints it, the reducer decides WHEN. It rides the
 * campaign's own `seenStoryBeats` set (the `SeenLore` twin) so it fires exactly ONCE per run — never touches
 * the main save or any seeded stream. The dialogue is the betrayer's own `BETRAYAL_VOICE` (storyBetrayal),
 * so the same friend's foreshadow, defection and farewell all read as one arc.
 */

import { betrayerId, betrayerOddness, betrayalSidelined, betrayalTempted } from './storyBetrayal';
import { getCharacter } from './characters';
import type { DoubtLine } from './storyBetrayal';
import type { StoryState } from './story';

/** The one-off tracking key (in `seenStoryBeats`) — fires once per campaign run. */
export const MIDROUND_OMEN_ID = 'midround-omen';

/** The chapter whose nine-hole pause carries the omen: the Storm Championship (Sigil 3), the last major
 *  before The Choice, by which point both partner picks are locked and the betrayer is settled. */
export const MIDROUND_OMEN_CHAPTER = 3;

/** The assembled beat: the betrayer, the flavour, and their voice lines (a `LoreEvent`-shaped payload the
 *  shared beat screen renders). `portrait` is the friend's real figure (`golfer:<id>`). */
export interface MidroundOmen {
  id: string;
  /** The odd-one-out golfer id (the future betrayer). */
  charId: string;
  /** Why they turned: benched-and-overlooked, or trusted-and-tempted. */
  flavour: 'sidelined' | 'tempted';
  kicker: string;
  title: string;
  accent: string;
  cta: string;
  portrait: string;
  lines: readonly DoubtLine[];
}

/** Has the mid-round omen already fired this run? */
export function midroundOmenSeen(story: StoryState): boolean {
  return story.seenStoryBeats[MIDROUND_OMEN_ID] === true;
}

/**
 * The mid-round omen for this arrival, or undefined when none qualifies (pure). Fires only at the turn of
 * the Chapter-3 major, BEFORE The Choice (`alignment` unset), once both team-Sigil picks are locked, and only
 * if unseen. Every gate is a pre-condition so a normal trunk round returns undefined and the classic halftime
 * pop shows unchanged.
 */
export function midroundOmen(story: StoryState | undefined, chapter: number | undefined): MidroundOmen | undefined {
  if (!story) return undefined;
  if (chapter !== MIDROUND_OMEN_CHAPTER) return undefined; // only the Storm Championship turn
  if (story.alignment) return undefined; // strictly before The Choice (the fork is set at end of Ch.3)
  if (midroundOmenSeen(story)) return undefined; // once per run
  const flavour = betrayerOddness(story);
  if (!flavour) return undefined; // both team Sigils not yet on record → betrayer not settled
  const charId = betrayerId(story);
  const ch = getCharacter(charId);
  if (!ch) return undefined;
  const lines = flavour === 'sidelined' ? betrayalSidelined(charId) : betrayalTempted(charId);
  return {
    id: MIDROUND_OMEN_ID,
    charId,
    flavour,
    portrait: `golfer:${charId}`,
    accent: flavour === 'sidelined' ? '#9b6cc0' : '#c98adf',
    kicker: flavour === 'sidelined' ? 'At the ropes' : 'At the turn',
    title: flavour === 'sidelined' ? `${ch.shortName}, Overlooked` : `${ch.shortName} Heard It Too`,
    cta: 'Play the back nine →',
    lines,
  };
}

/** Mark the mid-round omen seen (pure) — fires once, recorded on dismiss. A no-op if already seen. */
export function applyMidroundOmen(story: StoryState): StoryState {
  if (midroundOmenSeen(story)) return story;
  return { ...story, seenStoryBeats: { ...story.seenStoryBeats, [MIDROUND_OMEN_ID]: true as const } };
}
