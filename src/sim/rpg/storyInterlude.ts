/**
 * Story-Tour EMOTIONAL MID-CHAPTERS (GS-story-midchapter) — the Sigil-less interlude between the two route
 * majors (after the Chapter-4 major, before Chapter 5). Not a tournament: a story BEAT with a real stake in
 * the heart, per the bible.
 *   • WARDEN — "The Prism Accord": a friend has fallen to the Coil, and at the Coronae Prism you reach them
 *     and win them back to the light. A warm reunion; they leave you a parting gift.
 *   • HERALD — "The Severing": to complete the rite you must cut a friend loose and let their world drown.
 *     A cold betrayal; the Coil pays in blood-money (a larger, darker windfall — power with a price).
 *
 * PURE + DOM-free (the screen renders it). Fires exactly once per run, tracked in `seenStoryBeats`. The
 * "friend" is a fellow golfer from the roster (the first who isn't the protagonist), so the portrait is a
 * real face you've seen. The only mechanical consequence is a credit outcome; the weight is the story.
 */

import { CHARACTERS, type Character } from './characters';
import { addCredits, type StoryState, type StoryAlignment } from './story';

export type InterludeSpeaker = 'friend' | 'you' | 'parrot' | 'coil';
export interface InterludeLine {
  who: InterludeSpeaker;
  text: string;
}

export interface InterludeBeat {
  id: string;
  alignment: StoryAlignment;
  title: string;
  kicker: string;
  /** Credits awarded on dismiss (a friend's gift / the Coil's blood-money). */
  creditGift: number;
  /** Build the dialogue for a named friend. */
  lines: (friend: string) => InterludeLine[];
  /** The closing outcome line shown under the dialogue. */
  outcome: (friend: string) => string;
}

/** The beat id for a path (one-off key in `seenStoryBeats`). */
export function interludeBeatId(alignment: StoryAlignment): string {
  return `interlude-${alignment}`;
}

const BEATS: Record<StoryAlignment, InterludeBeat> = {
  warden: {
    id: 'interlude-warden',
    alignment: 'warden',
    title: 'The Prism Accord',
    kicker: 'Coronae Prism · a friend fell to the Coil, and you go to bring them home',
    creditGift: 300,
    lines: (f) => [
      { who: 'friend', text: `You shouldn’t have come. I’m not… I’m theirs now. The Coil showed me things.` },
      { who: 'you', text: `${f}. Put the ball down. Play one hole with me. Like the old days — before any of this.` },
      { who: 'friend', text: `…One hole. That’s all. I don’t remember how to want anything else.` },
      { who: 'parrot', text: `Easy, champion. You’re not out-driving the Coil here. You’re just reminding them who they were.` },
      { who: 'friend', text: `(a long silence, then a real swing) …I remember this. I remember you. Get me out of here.` },
    ],
    outcome: (f) => `${f} walks off the Prism at your side — won back from the Coil. They press a few credits into your hand: everything they have left, and gladly given.`,
  },
  herald: {
    id: 'interlude-herald',
    alignment: 'herald',
    title: 'The Severing',
    kicker: 'The rite demands a price — and the price is a friend',
    creditGift: 600,
    lines: (f) => [
      { who: 'friend', text: `Please. Whatever they promised you — it isn’t worth this. It isn’t worth me. Look at me.` },
      { who: 'coil', text: `The seal will not break while you hold on to who you were, Herald. ${f} is an anchor. Let it go.` },
      { who: 'you', text: `(you don’t look up from the tee)` },
      { who: 'friend', text: `…So that’s it. After everything. I hope it was worth it. I really do.` },
      { who: 'coil', text: `It is done. The Coil rewards its Herald. There is no one left to slow you now.` },
    ],
    outcome: (f) => `You leave ${f} to the drowning world and do not look back. The Coil’s blood-money is heavy in the hold. Something in you is quieter now — you tell yourself that’s strength.`,
  },
};

/** The interlude beat for a path. */
export function interludeBeat(alignment: StoryAlignment): InterludeBeat {
  return BEATS[alignment];
}

/** Has this path's interlude already played this run? */
export function interludeSeen(story: StoryState, alignment: StoryAlignment): boolean {
  return story.seenStoryBeats[interludeBeatId(alignment)] === true;
}

/** The "friend" golfer for the beat — the first roster golfer who isn't the protagonist. */
export function interludeFriend(story: StoryState): Character {
  return CHARACTERS.find((c) => c.id !== story.characterId) ?? CHARACTERS[0]!;
}

/**
 * Apply the interlude on dismiss (pure): mark it seen (fires once) + award the credit outcome. A no-op if
 * already seen, so a double-dismiss can't double-pay.
 */
export function applyInterlude(story: StoryState, alignment: StoryAlignment): StoryState {
  if (interludeSeen(story, alignment)) return story;
  const beat = BEATS[alignment];
  const seen = { ...story.seenStoryBeats, [beat.id]: true as const };
  return addCredits({ ...story, seenStoryBeats: seen }, beat.creditGift);
}
