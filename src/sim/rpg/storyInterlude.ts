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

import { CHARACTERS, getCharacter, type Character } from './characters';
import { otherGolfers } from './storyCast';
import { betrayerId, heraldSeveredId, betrayalDefection, betrayalFarewell } from './storyBetrayal';
import { heraldQuestHook } from './storyQuests';
import { addCredits, type StoryState, type StoryAlignment } from './story';

export type InterludeSpeaker = 'friend' | 'you' | 'parrot' | 'coil';
export interface InterludeLine {
  who: InterludeSpeaker;
  text: string;
}

/** The STATIC per-path meta for the interlude (the dynamic per-character dialogue is `interludeScene`). */
export interface InterludeBeat {
  id: string;
  alignment: StoryAlignment;
  title: string;
  kicker: string;
  /** Credits awarded on dismiss (the loyal ally's war-chest / the Coil's blood-money). */
  creditGift: number;
}

/** The DYNAMIC, per-character content of the interlude — built from the actual betrayer + (Herald) your
 *  caddy-quest history. `corrupt` = draw the betrayer's portrait in Coil garb (Warden defection). */
export interface InterludeScene {
  lines: InterludeLine[];
  outcome: string;
  corrupt: boolean;
}

/** The beat id for a path (one-off key in `seenStoryBeats`). */
export function interludeBeatId(alignment: StoryAlignment): string {
  return `interlude-${alignment}`;
}

const BEATS: Record<StoryAlignment, InterludeBeat> = {
  warden: {
    id: 'interlude-warden',
    alignment: 'warden',
    // GS-story-betrayal-warden: no longer "win a friend back" — the odd-one-out has DEFECTED and can't be
    // talked home; you'll have to out-PLAY them at the Ch.5 shrine. The reveal beat that sets up the finale.
    title: 'The Defection',
    kicker: 'A friend has turned to the Coil — and there is no talking them home',
    creditGift: 300,
  },
  herald: {
    id: 'interlude-herald',
    alignment: 'herald',
    title: 'The Severing',
    kicker: 'The rite demands you cut the last cord that ties you to who you were',
    creditGift: 600,
  },
};

/** The interlude META for a path (title/kicker/creditGift). */
export function interludeBeat(alignment: StoryAlignment): InterludeBeat {
  return BEATS[alignment];
}

/** Has this path's interlude already played this run? */
export function interludeSeen(story: StoryState, alignment: StoryAlignment): boolean {
  return story.seenStoryBeats[interludeBeatId(alignment)] === true;
}

/** The "friend" of the interlude. WARDEN: the BETRAYER (the odd one out of your team-Sigil partner picks)
 *  — the beat is the DEFECTION reveal. HERALD (GS-story-sigil-rivals): the friend you SEVER — the SAME
 *  friend whose round you just drowned at the Drowning Rite (`heraldSeveredId`), so the rival you crushed
 *  and the friend the Coil makes you cut loose are one person, and the two who remain are exactly the pair
 *  who come for you at the Ghost Harvest. Falls back to your first tour-mate when no team Sigil is on record. */
export function interludeFriend(story: StoryState): Character {
  const id = story.alignment === 'herald' ? heraldSeveredId(story) : betrayerId(story);
  return getCharacter(id) ?? otherGolfers(story)[0] ?? CHARACTERS[0]!;
}

/**
 * Build the per-character interlude dialogue + outcome (GS-story-betrayal-warden/herald). WARDEN: the
 * betrayer speaks their own DEFECTION (corrupted portrait); the Parrot tells you it ends at the shrine.
 * HERALD: the Coil leans on your caddy-quest history (the club they gave you), the betrayer gives their
 * FAREWELL, and you don't look up. Pure — reads the actual betrayer + `heraldQuestHook`.
 */
export function interludeScene(story: StoryState): InterludeScene {
  const align: StoryAlignment = story.alignment === 'herald' ? 'herald' : 'warden';
  const betrayer = interludeFriend(story);
  const name = betrayer.shortName;
  if (align === 'warden') {
    const [d0, d1] = betrayalDefection(betrayer.id);
    return {
      corrupt: true,
      lines: [
        { who: 'friend', text: d0! },
        { who: 'you', text: `${name}. Put the ball down. That isn’t your voice — the Coil is wearing your swing like a glove.` },
        { who: 'friend', text: d1! },
        // GS-story-scorpius: the payoff of the Silent Sting's wordless warning at the Vigil — he scratched
        // this exact name on a card and tipped his stinger at your ship. You told yourself it was a
        // mind-game. It wasn't.
        { who: 'you', text: `The Silent Sting held this up on a card at the Vigil and pointed it at my ship. I called it a bluff. …He wasn’t reading the future, ${name}. He was reading you.` },
        {
          who: 'parrot',
          // GS-story-ambiguous-fate: the Parrot promises the CONFRONTATION, never the rescue — his foresight
          // goes dark in the mire, so whether any of the old friend survives the whisper stays unknowable.
          text: `Save your breath, champion — they’re too far gone to talk back from. You’ll have to face them at the shrine — last Sigil, everything on the line. What’s left of the friend you knew, under all that shed-scale… I can’t see. My foresight goes dark in the mire. Take a friend who stayed true. Arm up.`,
        },
      ],
      outcome: `${name} walks into the mire in shed-scale robes and does not look back. There is no reunion — only the Serpent’s Vigil, where you and a loyal friend must out-play ${name} and the Viper for the last Sigil. What the whisper has left of them — and whether any road leads them home — not even the Parrot will say.`,
    };
  }
  // HERALD — the caddy-quest thread (the user's ask): the Coil pulls on the club a friend once gave you.
  // GS-story-sigil-rivals: `name` IS the rival whose round you just drowned at the Drowning Rite — the
  // severing lands on the eighteenth green of the round you took from them, not on some third party.
  const hook = heraldQuestHook(story);
  const [f0, f1] = betrayalFarewell(betrayer.id);
  const coilOpen = hook
    ? hook.stillUsing
      ? `${name} came alone to stop you, and you drowned their round. Now finish it. You still swing ${hook.clubName} — ${hook.caddyName}’s gift, pressed into your hands when you were still someone they could be proud of. ${name} is the same kind of anchor. Let go of both.`
      : `${name} came alone to stop you, and you drowned their round. You benched ${hook.caddyName}’s gift long ago — ${hook.clubName} gathers dust in the locker. Good. ${name} is the last cord. Cut it too.`
    : `${name} came alone to stop you, and you drowned their round. But the seal will not break while you hold on to who you were, Herald. ${name} is an anchor. Let it go.`;
  return {
    corrupt: false,
    lines: [
      { who: 'coil', text: coilOpen },
      { who: 'friend', text: f0! },
      { who: 'you', text: `(you don’t look up from the tee)` },
      { who: 'friend', text: f1! },
      { who: 'coil', text: `It is done. Only two old friends remain to slow you — at the Ghost Wreck — and they haven’t yet accepted that you’re gone.` },
    ],
    outcome:
      hook && hook.stillUsing
        ? `You leave ${name} standing on the green of the round you drowned. ${hook.clubName} is suddenly heavy in the bag — ${hook.caddyName}’s gift, swung now by a stranger. The Coil’s blood-money is heavier still. You tell yourself that’s strength.`
        : `You leave ${name} standing on the green of the round you drowned, and do not look back. The Coil’s blood-money is heavy in the hold. Something in you is quieter now — you tell yourself that’s strength.`,
  };
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
