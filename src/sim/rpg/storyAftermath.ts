/**
 * Story-Tour TOURNAMENT AFTERMATH (GS-story-aftermath) — the post-result CONFRONTATION beat shown after
 * the back-half Sigil scorecard (Chapters 4 & 5), win OR loss, before the interlude / clubhouse.
 *
 * The problem it fixes (player report): winning the Ch.4 Warden major cut STRAIGHT from the scorecard to
 * the betrayer's Defection — Scorpius, "the Silent Sting", who stalks you so vividly at the tee, just
 * VANISHED with no payoff (and a LOSS gave nothing at all). The back-half majors are the campaign's most
 * loaded rounds; each deserves a beat that lands the RESULT — the hunter withdrawing, the shrine's key
 * forging, the harvest — instead of an empty transition.
 *
 * Which majors get a beat (the audit — "make sure all the story beats land well"):
 *   • Ch.4 WARDEN  (Scorpius / The Abyssal Vigil) — WIN + LOSS. The gap: the pre-round beat is Scorpius,
 *     but the interlude that follows a win is the BETRAYER (a different person), so the Sting had no
 *     resolution. This is the beat the player asked for.
 *   • Ch.4 HERALD  (the severed friend / The Drowning Rite) — LOSS only. A WIN already flows into "The
 *     Severing" interlude, whose rival IS the friend you just drowned (`heraldSeveredId`), so the win is
 *     resolved — a second beat would duplicate it. The LOSS (no interlude fires) gets the friend's still-
 *     reaching relief.
 *   • Ch.5 WARDEN  (betrayer + Venoma / The Serpent's Vigil) — WIN + LOSS. The final Sigil forges the key;
 *     the win cut to the clubhouse with no moment. The friend's ULTIMATE fate stays for the ending
 *     (GS-story-ambiguous-fate) — this beat is the key igniting and the door to the root.
 *   • Ch.5 HERALD  (the two friends / The Ghost Harvest) — WIN + LOSS. Same: the last Sigil, the Coil's
 *     anointing, the root opening.
 *
 * PURE + DOM-free (no rng, no window): the render layer paints it via the shared `.gs-lore*` beat card
 * (`loreBeatHTML`), the reducer decides WHEN. It is NOT a `seenStoryBeats` one-off — a won Sigil can never
 * be replayed (`currentTournament` gates on `tournamentWon`), so a WIN beat fires exactly once naturally;
 * a LOSS beat re-shows on each retry (it IS that round's result, like the scorecard). The `{betrayer}`
 * token is resolved at render from the campaign's actual odd-one-out (the single betrayal-arc seam).
 */

import { getCharacter } from './characters';
import { betrayerId, heraldSeveredId, heraldOpponentIds } from './storyBetrayal';
import type { StoryState } from './story';
import type { StoryTournament } from './storyTournaments';
import type { LoreLine } from './lore';

/** A post-result confrontation beat (a `BeatView`-shaped payload the shared lore card renders). `portrait`
 *  is a lore-portrait id (`scorpius`/`venoma`/`crow`/…) or a `golfer:<id>` for a playable friend. Lines may
 *  carry the `{betrayer}` token, resolved at render. */
export interface TournamentAftermath {
  /** Stable id (for tests / tracking) — `aftermath-<chapter><path>-<win|loss>`. */
  id: string;
  won: boolean;
  accent: string;
  kicker: string;
  title: string;
  speaker: string;
  portrait: string;
  cta: string;
  lines: readonly LoreLine[];
}

/** The Coil's acid-green / the Coil violet — the palette every back-half aftermath wears. */
const COIL_GREEN = '#7fe0a0';
const COIL_VIOLET = '#c98adf';

/** A friend's display short-name (falls back to the raw id). */
function friendName(id: string): string {
  return getCharacter(id)?.shortName ?? id;
}

/**
 * The aftermath beat for a just-finished Sigil, or `undefined` when this major has none (pure). Trunk
 * majors (Ch.1–3) and the Ch.4 Herald WIN return `undefined` so their flow is unchanged; every other
 * back-half outcome returns its confrontation beat.
 */
export function tournamentAftermath(
  t: StoryTournament,
  story: StoryState,
  won: boolean,
): TournamentAftermath | undefined {
  const path = story.alignment;
  if (t.chapter === 4 && path === 'warden') return scorpiusAftermath(won);
  if (t.chapter === 4 && path === 'herald') return won ? undefined : heraldSeveredAftermath(story);
  if (t.chapter === 5 && path === 'warden') return serpentVigilAftermath(story, won);
  if (t.chapter === 5 && path === 'herald') return ghostHarvestAftermath(story, won);
  return undefined;
}

// ── Ch.4 Warden — Scorpius, "the Silent Sting" (the beat the player asked for) ─────────────────────────

/** The Silent Sting after the Abyssal Vigil. He never speaks (his one `say` is the name on the card); the
 *  scene is stage directions of a hunter who cared less for the Sigil than for the name he leaves you with.
 *  WIN: he withdraws, untroubled, the stinger tipped at your ship. LOSS: he confirms it and is gone. */
function scorpiusAftermath(won: boolean): TournamentAftermath {
  if (won) {
    return {
      id: 'aftermath-4warden-win',
      won: true,
      accent: COIL_GREEN,
      kicker: 'The vigil holds',
      title: 'The Sting Withdraws',
      speaker: 'Scorpius, "the Silent Sting"',
      portrait: 'scorpius',
      cta: 'Back to your ship →',
      lines: [
        {
          kind: 'action',
          text: 'The vigil holds. You outplayed the Coil’s quietest weapon across every cold hole of it — and you brace for the theatre, the snarl, the thrown club, the venom the Viper would have spat. Scorpius gives you none of it.',
        },
        {
          kind: 'action',
          text: 'He reads your finished card the way he read your hands on the tee: without heat, filing it. Then the smallest tilt of the head. Not respect — assessment. He was sent to take the Abyssal Sigil and he did not, and nothing in him seems troubled by that. That is the worst of him.',
        },
        { kind: 'action', text: 'He turns the little black card once more, so the acid-green name catches the light —' },
        { kind: 'say', text: '{betrayer}.' },
        {
          kind: 'action',
          text: '— then taps the stinger at his shoulder and tips it, unhurried, past you, toward your own ship. He came for more than a stone. He leaves you the name and folds back into the dark, and the cold at your back does not go with him.',
        },
      ],
    };
  }
  return {
    id: 'aftermath-4warden-loss',
    won: false,
    accent: COIL_GREEN,
    kicker: 'He confirms it',
    title: 'The Silent Sting',
    speaker: 'Scorpius, "the Silent Sting"',
    portrait: 'scorpius',
    cta: 'Regroup →',
    lines: [
      {
        kind: 'action',
        text: 'He closes the card of the round without a flicker. No triumph — triumph is for people who doubted the outcome. He simply confirms it, the way a blade confirms a vein, and the Abyssal Sigil stays on his side of the tee.',
      },
      {
        kind: 'action',
        text: 'You reach for the words you didn’t have at the start of the vigil and still don’t have them. He isn’t looking at the flag, or the Sigil, or even at you now — he is looking, one last time, at the crack he came here to find, and past you, toward your ship.',
      },
      { kind: 'action', text: 'He turns the small black card so you read it one final time.' },
      { kind: 'say', text: '{betrayer}.' },
      {
        kind: 'action',
        text: 'Then he pockets it, taps the stinger at his shoulder, and is gone. The stone was never the point; the name was, and he has left you alone with it. The vigil will keep — he knows you’ll be back, and he knows what you’ll bring aboard when you are.',
      },
    ],
  };
}

// ── Ch.4 Herald — the severed friend, on a LOSS (the win flows into "The Severing") ────────────────────

/** The Warden friend the Order sent to the Drowning Rite, having HELD you off. No gloating — relief, and
 *  the hope you can still be reached. Portrait = their real figure. (Win → the Severing interlude owns it.) */
function heraldSeveredAftermath(story: StoryState): TournamentAftermath {
  const id = heraldSeveredId(story);
  const name = friendName(id);
  return {
    id: 'aftermath-4herald-loss',
    won: false,
    accent: COIL_VIOLET,
    kicker: 'The shrine still stands',
    title: `${name} Holds the Line`,
    speaker: name,
    portrait: `golfer:${id}`,
    cta: 'Regroup →',
    lines: [
      {
        kind: 'action',
        text: `${name} outlasts your round on the flooded green, soaked to the bone — and the look on their face isn’t victory. It’s relief.`,
      },
      {
        kind: 'say',
        text: 'You didn’t take it. Good. …I mean it — good. I keep telling the others there’s still a version of this where you set that mark down and come home. Every hole you don’t win the rite, I get to keep believing that.',
      },
      {
        kind: 'say',
        text: 'They’ll send me again. I’ll come again. I’d rather stand across this tee from you a hundred times than watch you finish what the Coil started. Turn back. Please.',
      },
      {
        kind: 'action',
        text: 'The Coil’s mark itches at your collar. The shrine still stands, its wards unbroken — and the rite is not done with you yet.',
      },
    ],
  };
}

// ── Ch.5 Warden — The Serpent's Vigil (betrayer + Venoma). The final Sigil forges the key. ─────────────

/** The last Warden Sigil. WIN: the key ignites; the Parrot frames the descent to the root — the friend
 *  pulled back into the mire before you could reach them, their fate deliberately unresolved (the ending
 *  answers it, GS-story-ambiguous-fate). LOSS: Venoma keeps you from the key, the betrayer silent behind
 *  her. */
function serpentVigilAftermath(story: StoryState, won: boolean): TournamentAftermath {
  const name = friendName(betrayerId(story));
  if (won) {
    return {
      id: 'aftermath-5warden-win',
      won: true,
      accent: '#ffd97a',
      kicker: 'Five Sigils',
      title: 'The Key Is Forged',
      speaker: 'The Prognostic Parrot',
      portrait: 'prognostic-parrot',
      cta: 'To the finale →',
      lines: [
        {
          kind: 'action',
          text: 'The last team score falls your way and the mire goes very quiet. In your hand the five Sigils drift together and fuse — a single Green Key, warm as a coal, humming toward the root of the World-Tree like a compass needle finding true.',
        },
        {
          kind: 'say',
          text: `Five stones, champion. Five, and the Keystone is whole. That hum you feel — that’s the door at the base of Yggdrasil, and the key knows the way down.`,
        },
        {
          kind: 'action',
          text: `You look for ${name} in the shed-scale robes, but the Coil’s remnant has already folded them back into the acid fog, Venoma’s hand at their shoulder. Gone before you could say a word. Whatever the whisper left standing over there, it did not stay to be counted.`,
        },
        {
          kind: 'say',
          text: 'Grieve on the way down — we don’t have the luxury of doing it standing still. Jörmungandr is waking at the root, and the key in your fist is the only thing that opens the door between it and every world we’ve got. Arm the ship. It’s time.',
        },
      ],
    };
  }
  return {
    id: 'aftermath-5warden-loss',
    won: false,
    accent: COIL_VIOLET,
    kicker: 'The key stays out of reach',
    title: 'She Kept the Door',
    speaker: 'Venoma "the Viper" Krait',
    portrait: 'venoma',
    cta: 'Regroup →',
    lines: [
      {
        kind: 'action',
        text: 'The last hole slides to the Viper’s side of the ledger, and she doesn’t hiss or crow — she simply keeps the door shut, the way you keep a promise.',
      },
      {
        kind: 'say',
        text: `Four Sigils and no fifth, champion. The Keystone stays half-forged, and half a key opens nothing. You brought a loyal friend; I brought one of yours. That’s the whole story of this cult, if you ever cared to hear it.`,
      },
      {
        kind: 'action',
        text: `Behind her, ${name} says nothing at all, standing in the fog in robes that fit them a little better than they did last time. Venoma tees a hissing ball and waits, patient as the dark. The shrine will be here when you can hold your nerve. Steady the ship, and come back for it.`,
      },
    ],
  };
}

// ── Ch.5 Herald — The Ghost Harvest (the two friends). The rite completes; the root opens. ─────────────

/** The last Herald Sigil. WIN: you break the two who loved you best; the Coil anoints you and the key
 *  becomes a key to OPEN the root. LOSS: they hold the line and beg you home. */
function ghostHarvestAftermath(story: StoryState, won: boolean): TournamentAftermath {
  const [a, b] = heraldOpponentIds(story);
  const both = `${friendName(a)} & ${friendName(b)}`;
  if (won) {
    return {
      id: 'aftermath-5herald-win',
      won: true,
      accent: COIL_GREEN,
      kicker: 'The rite is complete',
      title: 'The Root Opens',
      speaker: 'The Coil',
      portrait: 'crow',
      cta: 'To the finale →',
      lines: [
        {
          kind: 'action',
          text: `You break ${both} on the last hole of the harvest, and they go quiet — the two who trusted you with their Sigils, out of holes and out of pleas. The Ghost Wreck exhales around you. In your hand the five Sigils fuse into one Green Key, cold as deep water.`,
        },
        {
          kind: 'say',
          text: 'The fifth stone, Herald. The Keystone is whole — and in your grip it is not a lock but a latch. The Wardens forged a key to seal the door; you will use it to open one. The tired old universe has earned its Long Rest, and you carry the hand that grants it.',
        },
        {
          kind: 'action',
          text: 'A Coil champion sets a hand on your shoulder where a friend’s once was. The key hums toward the root of the World-Tree, and Jörmungandr stirs to meet it. There is only the descent now, and the great sleep waiting under it.',
        },
      ],
    };
  }
  return {
    id: 'aftermath-5herald-loss',
    won: false,
    accent: COIL_VIOLET,
    kicker: 'They hold the line',
    title: `${friendName(a)} Bars the Way`,
    speaker: friendName(a),
    portrait: `golfer:${a}`,
    cta: 'Regroup →',
    lines: [
      {
        kind: 'action',
        text: `${both} hold the last hole between them, shoulder to shoulder across the tee, and the harvest stalls. ${friendName(a)} lowers their club and looks at you the way you used to look at each other on Earth, a lifetime and one Choice ago.`,
      },
      {
        kind: 'say',
        text: 'We’re not letting you finish it. Not because we can beat you forever — because every round you don’t is a round you might still turn around. That’s all we’ve got left, and we’ll spend it as long as it lasts.',
      },
      {
        kind: 'action',
        text: 'The Coil’s cold is patient in your chest, and the fifth Sigil stays just out of reach. The rite is not complete. The Ghost Wreck will be here when you steady yourself to try again.',
      },
    ],
  };
}
