/**
 * Story Tour — the BETRAYAL branch (GS-story-betrayer). The heart of the deep arc: after The Choice, WHO
 * turns on you is decided by the partners you picked for the two team Sigils (Scramble Ch.1 / Best-ball
 * Ch.2). This module is the single pure source for the betrayer's identity and the Ch.5 finale team
 * make-up, so every beat (Warden/Herald), the finale resolution, and the costume swap read one truth.
 *
 * THE ODD-ONE-OUT RULE (confirmed design):
 *   • Two DIFFERENT partners across Sigils 1 & 2 → the ONE friend you NEVER picked is the odd one out.
 *   • The SAME partner both times → the friend you TRUSTED most is the odd one out (the twist).
 * So the betrayer is always the friend who stands apart: the lone unpicked, or — if you were loyal to one
 * — that one.
 *
 * PER PATH:
 *   • WARDEN (you stayed true) — the odd-one-out DEFECTS to the Coil (corrupted costume). The Ch.5 finale
 *     is 2v2 best-ball matchplay: You + a LOYAL friend vs (the Betrayer + a Coil champion).
 *   • HERALD (you turned) — YOU are the traitor; your former friends come for you. The Ch.5 finale is 2v2:
 *     You + the top Coil champion who isn't your guide vs the two friends who partnered you.
 *
 * PURE + DOM-free (no rng, no window). Consumers: the interlude/beats (G/H), the 2v2 finale resolution
 * (storyTeams), and the clubhouse/finale costume (`corruptedLookOpts`). Reads only `StoryState`.
 */

import { CHARACTERS, getCharacter, type Character } from './characters';
import { otherGolferIds } from './storyCast';
import type { StoryState } from './story';

/** The two team-Sigil partner picks that are actually valid roster friends (locked by Ch.4). */
function validPicks(story: StoryState): string[] {
  const others = otherGolferIds(story);
  return [story.sigil1Partner, story.sigil2Partner].filter((x): x is string => !!x && others.includes(x));
}

/**
 * The BETRAYER — the odd one out of your two partner picks (pure). Two different partners → the unpicked
 * friend; the same partner twice → that trusted friend. Falls back to your first tour-mate if no team
 * Sigil has been played yet (the betrayer is only read from Ch.4 on, when both picks are locked).
 */
export function betrayerId(story: StoryState): string {
  const others = otherGolferIds(story);
  const picks = validPicks(story);
  if (picks.length === 0) return others[0] ?? story.characterId;
  const distinct = [...new Set(picks)];
  if (distinct.length >= 2) {
    // two different partners → the one you never picked betrays
    return others.find((id) => !distinct.includes(id)) ?? distinct[0]!;
  }
  // the same partner both times (or only one pick recorded) → that trusted friend betrays
  return distinct[0]!;
}

/** The betrayer as a `Character` (for portraits/dialogue). */
export function betrayerCharacter(story: StoryState): Character | undefined {
  return getCharacter(betrayerId(story));
}

/**
 * Your LOYAL friend ally for the WARDEN Ch.5 finale (pure): a friend who is NOT the betrayer. Prefer one
 * you actually PARTNERED (your Sigil-2 pick, then Sigil-1), so the friend at your side is one you chose;
 * else the first loyal tour-mate.
 */
export function loyalAllyId(story: StoryState): string {
  const betrayer = betrayerId(story);
  const loyal = otherGolferIds(story).filter((id) => id !== betrayer);
  const partnered = [story.sigil2Partner, story.sigil1Partner].find((id) => !!id && id !== betrayer && loyal.includes(id));
  return partnered ?? loyal[0] ?? story.characterId;
}

/**
 * The two FORMER FRIENDS who oppose you in the HERALD Ch.5 finale (pure) — the friends who trusted you.
 * Two different partners → both of them; the same partner twice → that one friend PLUS a tour-mate you
 * spurned (so the one you always picked AND one you never did both come for you). Always two ids.
 */
export function heraldOpponentIds(story: StoryState): [string, string] {
  const others = otherGolferIds(story);
  const distinct = [...new Set(validPicks(story))];
  if (distinct.length >= 2) return [distinct[0]!, distinct[1]!];
  if (distinct.length === 1) {
    const spurned = others.find((id) => id !== distinct[0]);
    return [distinct[0]!, spurned ?? others.find((id) => id !== distinct[0]) ?? others[0]!];
  }
  return [others[0] ?? story.characterId, others[1] ?? story.characterId];
}

/**
 * The friend you SEVER on the HERALD path (GS-story-sigil-rivals, pure): the one tour-mate who is NOT in
 * the Ch.5 opposing pair — always exactly one of the three. They are the Warden champion the Order sends
 * to stop you at the Drowning Rite (the Ch.4 Herald rival), and the same friend the Coil then makes you
 * cut loose in "The Severing" interlude — so the rival you crush and the friend you sever are ONE person,
 * and the two who remain are exactly the pair who come for you at the Ghost Harvest ("only two old
 * friends remain"). Distinct picks → the friend you never partnered; same-partner-twice → the second
 * spurned tour-mate (the trusted friend + the first spurned one keep coming at Ch.5).
 */
export function heraldSeveredId(story: StoryState): string {
  const opponents = heraldOpponentIds(story);
  const others = otherGolferIds(story);
  return others.find((id) => !opponents.includes(id)) ?? others[0] ?? story.characterId;
}

// ── The Coil champion who partners you on the Herald finale / opposes you on the Warden finale ──────────

/** The two top Coil champions (their lore-portrait / ghost ids). */
export const COIL_CHAMPIONS = ['voss', 'venoma'] as const;
export type CoilChampionId = (typeof COIL_CHAMPIONS)[number];

/** The top Coil champion who ISN'T your active guide (GS-story-betrayer): on the Herald finale this is the
 *  champion who partners YOU; pass your active caddy/guide id (a herald agent id) to exclude them. Falls
 *  back to Voss (the Apostate, your mentor) when neither/both match. */
export function coilChampionExcluding(activeGuideId?: string): CoilChampionId {
  return COIL_CHAMPIONS.find((id) => id !== activeGuideId) ?? 'voss';
}

/** Display names for the Coil champions (used in finale copy + pair labels). */
export function coilChampionName(id: CoilChampionId): string {
  return id === 'venoma' ? 'Venoma "the Viper" Krait' : 'Malachai "Sable" Voss';
}

/** A golfer's short name (for finale pair labels), or the raw id. */
function golferName(id: string): string {
  return getCharacter(id)?.shortName ?? id;
}

/** The 2v2 best-ball MATCHPLAY finale team make-up (GS-story-betrayer), derived from the partner picks +
 *  alignment. One source for the finale lobby, the resolution, and the recap. */
export interface FinaleMatchup {
  herald: boolean;
  /** Your PARTNER's ghost id (a loyal friend on Warden; a Coil champion on Herald). */
  allyId: string;
  allyName: string;
  /** True when your partner is a Coil champion (Herald), false when a friend (Warden). */
  allyIsChampion: boolean;
  /** The two opponent ghost ids you face. */
  oppIds: [string, string];
  oppNames: [string, string];
  /** On the Warden path, the DEFECTOR golfer id (for the corrupted costume); absent on Herald. */
  betrayerGolferId?: string;
}

/**
 * Resolve the Ch.5 2v2 finale teams (pure). WARDEN: You + a loyal friend vs (the Betrayer + Venoma the
 * Coil champion). HERALD: You + the top Coil champion who isn't your guide vs the two friends who partnered
 * you. `activeGuideId` is your active caddy/guide (a Coil agent on Herald) — the champion excludes them.
 */
export function finaleMatchup(story: StoryState, activeGuideId?: string): FinaleMatchup {
  if (story.alignment === 'herald') {
    const champ = coilChampionExcluding(activeGuideId ?? story.activeCaddyId);
    const opp = heraldOpponentIds(story);
    return {
      herald: true,
      allyId: champ,
      allyName: coilChampionName(champ),
      allyIsChampion: true,
      oppIds: opp,
      oppNames: [golferName(opp[0]), golferName(opp[1])],
    };
  }
  const ally = loyalAllyId(story);
  const betrayer = betrayerId(story);
  const champ: CoilChampionId = 'venoma'; // the Warden climax champion (the Viper, at the traitor's shoulder)
  return {
    herald: false,
    allyId: ally,
    allyName: golferName(ally),
    allyIsChampion: false,
    oppIds: [betrayer, champ],
    oppNames: [golferName(betrayer), coilChampionName(champ)],
    betrayerGolferId: betrayer,
  };
}

// ── Per-character betrayal VOICE (GS-story-betrayal-warden/herald) ─────────────────────────────────────
//
// The betrayal must land IN CHARACTER — a betrayal beat reads completely differently depending on WHO the
// odd one out is. `defection` = their words when THEY turn to the Coil (the Warden path, you stayed true);
// `farewell` = their words when YOU turn and cut them loose (the Herald path, they stay a Warden). Written
// against each golfer's cast profile (storyCast) so the same beat has four distinct hearts.

/** One beat of a doubt scene — the `LoreLine` shape (kept structural so this module stays free of a
 *  lore.ts import; lore.ts consumes these rows verbatim). */
export interface DoubtLine {
  kind: 'say' | 'action';
  text: string;
}

interface BetrayalVoice {
  defection: readonly string[]; // Warden: they defect to the Coil
  farewell: readonly string[]; // Herald: you betray them; they stay Warden, heartbroken
  /** GS-story-sigil-rivals — the friend as your RIVAL across a tee, per context. `confront` = the Herald
   *  Ch.4 Drowning Rite (they came to stop you, heartbroken, still hoping); `corrupt` = the Warden Ch.5
   *  shrine (they defected — the Coil speaks through their swing). Each is [pre-round taunt, halftime
   *  when they lead (brag), halftime when you lead (curse/plea)]. */
  confront: readonly [string, string, string];
  corrupt: readonly [string, string, string];
  /** GS-story-doubt — the Warden-path FORESHADOW, before the defection is revealed: the whisper working on
   *  this friend during the Chapter-4 qualifiers. `doubt` = the first strange question (a crack showing);
   *  `distance` = the eve-of-the-vigil beat (they're slipping away). Each references the same motifs their
   *  `defection` lines later pay off, so the betrayal reads as an arc, not a switch-flip. */
  doubt: readonly DoubtLine[];
  distance: readonly DoubtLine[];
}

const BETRAYAL_VOICE: Record<string, BetrayalVoice> = {
  'feather-fade': {
    defection: [
      'I spent my whole life aiming two yards right of the trouble. The Coil showed me a line with no trouble at all — just the long, still green at the end of everything. I took it.',
      'Don’t come looking for the girl you knew. She reads the wind quieter now than she ever has. She reads nothing at all.',
    ],
    farewell: [
      'I read the wind true my whole life, and I still didn’t see this coming off you. That’s the one that stings.',
      'Go on, then. I hope the stillness you’re chasing is worth the friend you spent to reach it.',
    ],
    confront: [
      '"The Wardens asked who would stand against you. Nobody spoke. So I did — because if it has to be anyone, it should be someone who still loves you. Aim true. I will."',
      '"You’re pressing. I can hear it in your tempo. The friend I knew never pressed… come back, and I’ll stop having to win."',
      '"You’re ahead. Of course you’re ahead — I taught you half of what you know. Just tell me the golfer beating me is still in there somewhere."',
    ],
    corrupt: [
      '"I don’t need to read the wind anymore. There is no wind where the serpent is taking us. Only the long, still green — and you, standing in the way of everyone’s rest."',
      '"See how quiet my ball flies now? No wind. No doubt. Nine holes more and you’ll stop fighting the stillness too."',
      '"You’re ahead… good. GOOD. Some small part of me — the old part — hoped you would be. Don’t you dare let up now."',
    ],
    doubt: [
      { kind: 'action', text: 'You find Feather alone on the observation deck, a ball turning slowly in her hand, watching the void go by.' },
      { kind: 'say', text: '"Can I ask you something strange? When you play a hole true — really true — do you ever wonder who we’re keeping the lights on FOR? Whether anyone down there ever asked us to?"' },
      { kind: 'say', text: '"The Apostate said order is a cage. I’ve aimed two yards right of the trouble my whole life, and I’m just… tired of the wind, sometimes. Forget I said anything."' },
      { kind: 'action', text: 'She flips the ball once, catches it without looking, and doesn’t say another word all night.' },
    ],
    distance: [
      { kind: 'action', text: 'The night before the vigil, Feather’s bunk is empty. You find her on the cargo ramp, staring into the black.' },
      { kind: 'say', text: '"Out there — no wind at all. Imagine reading a line with nothing left to read. Just the ball, and the still, and the end of the line."' },
      { kind: 'say', text: '"I’m fine. I’ll play tomorrow. I always play."' },
      { kind: 'action', text: 'In her open locker, half-wrapped in a towel, is a ball you have seen before. It is very quietly hissing.' },
    ],
  },
  'huang-woo-hook': {
    defection: [
      'The gallery went QUIET, and quiet kills me — you know it does. The Coil is the only thing loud enough now. It ROARS. How could I not go where the noise is?',
      'Come get noodles when it’s all over! …Ah. There won’t be an over. That’s rather the whole point, isn’t it. Ha. Ha.',
    ],
    farewell: [
      'I was your HYPE MAN. I’d have followed you onto any tee in any sky — but not this one. Not for this.',
      'I’m not clapping. For the first time in my life, I’ve got nothing to shout. Look what you did to me.',
    ],
    confront: [
      '"No gallery today. No noise. Just you, me, and the water you want to drown this world under. I came because your hype man is the only one who can still reach you — so REACH."',
      '"I’m beating you and I HATE it! Do you understand? I have waited my whole life to beat you and it was never supposed to feel like this!"',
      '"There you are! THAT swing — that’s my friend’s swing! Keep hitting it like that and maybe you’ll remember whose side you’re on!"',
    ],
    corrupt: [
      '"You want to know the secret? The serpent’s gallery never stops roaring. Never! I just had to stop caring who it was roaring FOR. Tee it up — the noise is on my side now."',
      '"HA! Hear that hum in the mire? That’s for ME now. Nine more holes and even you will want to kneel and listen."',
      '"Stop WINNING! You’re making the noise go quiet and I can’t— I won’t go back to the quiet. SWING SOFTER!"',
    ],
    doubt: [
      { kind: 'action', text: 'Woo hasn’t shouted in three worlds. At dinner they push noodles around the bowl, then finally look up.' },
      { kind: 'say', text: '"Hey. Real question. When the gallery goes quiet — REALLY quiet — do you hear it? Underneath? There’s a hum. Like a crowd, but a long, long way down."' },
      { kind: 'say', text: '"The hooded weirdos say everyone hears it eventually. HA! Creepy, right? …Right. Anyway. Forget it. GREAT noodles tonight!"' },
      { kind: 'action', text: 'Their laugh lands half a beat late, like an echo of itself.' },
    ],
    distance: [
      { kind: 'action', text: 'You find Woo in the hold with the lights off, forehead against the hull, listening.' },
      { kind: 'say', text: '"Sh— shh. There. You feel that, through the metal? It ROARS down there, friend. It never stops roaring. It never gets tired of me."' },
      { kind: 'say', text: '"I’m fine! Warm-up ritual! New thing I’m trying!"' },
      { kind: 'action', text: 'They snap the lights back on too fast and grin too wide, and neither of you mentions it at breakfast.' },
    ],
  },
  'longshot-larry': {
    defection: [
      'Reckon the void was always gonna win the long game, mate. I’ve lost that many balls into it — figured I’d stop fighting the tide and go stand in it.',
      'Grip it and rip it, straight down the serpent’s gullet. Farthest send of me whole life. You’ll see.',
    ],
    farewell: [
      'I’d have climbed into any bunker on any rock in the galaxy for you. Any but this one.',
      'You went QUIET, and that’s how I knew — I lost me best mate a long way back, before we ever teed it up here.',
    ],
    confront: [
      '"They told me not to come alone, mate. Came alone anyway. Figured if me best mate’s gonna drown a world, the least I can do is make ’em beat me first. Rip it. I’m not moving."',
      '"I’m up on ya. First time ever, and it’s the worst day of me life. Concede, eh? Come home. Noodles on Woo, bunkers on me."',
      '"Course you’re beating me. You always beat me. So beat THIS out of yourself while you’re at it — the mate I know is still swinging in there."',
    ],
    corrupt: [
      '"The void kept every ball I ever fed it, mate. Reckon it’s time I went and got ’em back — all of ’em, and everything else besides. Stand clear or get carried."',
      '"Longest front nine of me life, and every yard of it went MY way. The serpent likes a big send. Sit down, mate."',
      '"You’re ahead?! Good on ya… no. NO. Forget I said that. Grip it and rip it, serpent’s orders. I’m coming for the back nine."',
    ],
    doubt: [
      { kind: 'action', text: 'Larry is at the aft window with a bucket of range balls — not hitting them, just weighing one in his hand.' },
      { kind: 'say', text: '"Mate. Every ball I ever sent into the void — reckon they’re still out there somewhere? All of ’em, just… at rest. Kind of peaceful, when you put it like that."' },
      { kind: 'say', text: '"That Apostate bloke said the tide always wins the long game. I hate that he’s got a point. Don’t tell Woo I said that."' },
      { kind: 'action', text: 'He finally rips one down the range, and doesn’t watch where it lands.' },
    ],
    distance: [
      { kind: 'action', text: 'On the eve of the vigil, Larry’s driver is missing from the rack. So is Larry.' },
      { kind: 'say', text: '"Went for a spacewalk," he says later, too easily. "Wanted to see the black up close. It’s not scary, mate. That’s the bit nobody tells ya — it’s not scary at all."' },
      { kind: 'say', text: '"Course I’m right for tomorrow. Grip it and rip it, eh?"' },
      { kind: 'action', text: 'His grin is the same as ever. His eyes have gone very still — like the tide finally came in.' },
    ],
  },
  'backspin-bo': {
    defection: [
      'The serpent offered me the quietest green in all creation. No wind. No break. A pin that never, ever moves. I’ve chased that stillness my whole life — I couldn’t say no to being handed it.',
      'Don’t grieve me. I finally stopped chasing the read. The read was always the same: everything, everywhere, at rest.',
    ],
    farewell: [
      'I read greens for a living, and I read the dark growing in you hole by hole. I kept waiting for the line to turn back toward the light.',
      'It didn’t turn. I’m sorry — for you, not for me. Goodbye.',
    ],
    confront: [
      '"I read this green a hundred times on the flight out, hoping the line would break your way. It never did. So I’m here — the last still thing between you and the drowning. Play me true."',
      '"Your putts are dying low. They always die low when you’re ashamed. I’m ahead because you can’t look at what you’re doing — so LOOK at it."',
      '"You’re winning. Even now, you’re winning. That’s what breaks my heart — all that grace, spent on THIS."',
    ],
    corrupt: [
      '"I told you once: the ball always tells you the truth if you wait. I waited. The truth is rest — every ball, every world, still at last. Let me show you the final read."',
      '"Feel the mire pulling every putt toward the centre? That’s not break. That’s the truth, settling. Nine holes and you’ll stop fighting it."',
      '"Still ahead of me… you always could out-play my quiet. Then hear the old me, one last time: don’t stop. Whatever I say on the back nine — don’t stop."',
    ],
    doubt: [
      { kind: 'action', text: 'Bo has been reading the same practice green for an hour — walking the line, marking nothing.' },
      { kind: 'say', text: '"Here’s what I can’t stop thinking. Every green breaks somewhere. Every read bends. But there’s supposed to be one green, somewhere, that’s perfectly still. No break. No wind. A pin that never moves."' },
      { kind: 'say', text: '"The Apostate called it mercy. I read greens for a living — you can see why that reaches me. …It’s fine. It’s nothing. The line’s just noisy this week."' },
      { kind: 'action', text: 'They putt once, dead straight, and the ball dies exactly on the lip — and they stare at it for a long, long time.' },
    ],
    distance: [
      { kind: 'action', text: 'You find Bo asleep on the practice green, marker still in hand — every slope on it charted a dozen times over.' },
      { kind: 'say', text: '"I keep dreaming the final read," they say, without opening their eyes. "Everything, everywhere, at rest. And in the dream I’m not sad about it. That’s the part that scares me."' },
      { kind: 'say', text: '"I’ll be at the vigil. Whatever I’m becoming, I’ll be there. Promise."' },
      { kind: 'action', text: 'When they do open their eyes, it takes a moment too long for their gaze to find you.' },
    ],
  },
};

/** The betrayer's per-character DEFECTION lines (Warden path — they turn to the Coil). */
export function betrayalDefection(charId: string): readonly string[] {
  return BETRAYAL_VOICE[charId]?.defection ?? ['The Coil showed me the end of it all, and I chose the quiet. Don’t follow me.'];
}

const FALLBACK_DOUBT: readonly DoubtLine[] = [
  { kind: 'action', text: 'Your friend has gone quiet since the storm — and tonight they finally speak.' },
  { kind: 'say', text: '"Do you ever wonder if the Apostate was half right? About the cage? …Forget it. Forget I said anything."' },
];
const FALLBACK_DISTANCE: readonly DoubtLine[] = [
  { kind: 'action', text: 'On the eve of the vigil your friend is nowhere aboard — and when they return, they offer no explanation at all.' },
  { kind: 'say', text: '"I’ll be there tomorrow. I promise." They do not meet your eye when they say it.' },
];

/** GS-story-doubt: the betrayer's first CRACK — a strange question aboard the ship, in their own voice
 *  (the Warden-path Ch.4 foreshadow, before the defection is revealed). */
export function betrayalDoubt(charId: string): readonly DoubtLine[] {
  return BETRAYAL_VOICE[charId]?.doubt ?? FALLBACK_DOUBT;
}
/** GS-story-doubt: the betrayer DRIFTING — the eve-of-the-vigil beat, deeper than the first crack. */
export function betrayalDistance(charId: string): readonly DoubtLine[] {
  return BETRAYAL_VOICE[charId]?.distance ?? FALLBACK_DISTANCE;
}

/** The betrayer's display short-name for story copy (the `{betrayer}` token) — falls back generic so a
 *  fresh campaign with no picks still reads sensibly. */
export function betrayerName(story: StoryState): string {
  return getCharacter(betrayerId(story))?.shortName ?? 'your friend';
}
/** The betrayer's per-character FAREWELL lines (Herald path — you cut them loose; they stay a Warden). */
export function betrayalFarewell(charId: string): readonly string[] {
  return BETRAYAL_VOICE[charId]?.farewell ?? ['After everything we played through — this is how it ends. I hope it was worth it.'];
}

/** GS-story-sigil-rivals: a friend-rival's voice CONTEXT — a heartbroken Warden barring your way (Herald
 *  Ch.4) vs the corrupted defector across the shrine tee (Warden Ch.5). */
export type FriendRivalVoice = 'confront' | 'corrupt';

const FALLBACK_RIVAL_LINES: Record<FriendRivalVoice, readonly [string, string, string]> = {
  confront: [
    '"The Wardens sent me because no one else could bear to come. Play me true — it’s the last thing I’ll ever ask of you."',
    '"I’m ahead, and I’d trade every hole of it to have you back. Concede the round. Come home."',
    '"You’re still better than me. Then be better than THIS."',
  ],
  corrupt: [
    '"The Coil showed me the end of every line, and every one comes to rest. Stand aside, or be played through."',
    '"Feel the mire pulling? Nine holes more and you’ll stop fighting it."',
    '"You’re ahead… the old me would have been proud. Don’t let up now."',
  ],
};

/** The pre-round TAUNT a friend-rival gives across the tee, in their own voice, per context. */
export function friendRivalTaunt(charId: string, voice: FriendRivalVoice): string {
  return (BETRAYAL_VOICE[charId]?.[voice] ?? FALLBACK_RIVAL_LINES[voice])[0];
}
/** The halftime line — the friend-rival BRAGS/pleads when ahead, or CURSES/hopes when you lead. */
export function friendRivalHalftime(charId: string, voice: FriendRivalVoice, brag: boolean): string {
  const lines = BETRAYAL_VOICE[charId]?.[voice] ?? FALLBACK_RIVAL_LINES[voice];
  return brag ? lines[1] : lines[2];
}

/** Every playable golfer has a distinct betrayal voice (defection + farewell + both rival contexts + the
 *  GS-story-doubt foreshadow pair) — a coverage invariant. */
export function everyGolferHasBetrayalVoice(): boolean {
  return CHARACTERS.every((c) => {
    const v = BETRAYAL_VOICE[c.id];
    return (
      !!v &&
      v.defection.length >= 2 &&
      v.farewell.length >= 2 &&
      v.confront.length === 3 &&
      v.corrupt.length === 3 &&
      v.doubt.length >= 3 &&
      v.distance.length >= 3
    );
  });
}

// ── The corrupted (Coil) costume for a defector (GS-story-betrayer) ────────────────────────────────────

/** Deep Coil-violet garb + an acid-green accent — the shed-scale look a defector wears. Keeps the golfer's
 *  own HAIR (identity is above the neck, per the avatar rule) so they still read as themselves, corrupted. */
export const COIL_SHIRT = '#2e1840';
export const COIL_ACCENT = '#7fe0a0';
/** A CSS filter that venom-shifts a normal golfer figure toward the Coil palette (for the standee tint). */
export const COIL_FIGURE_TINT = 'saturate(1.15) hue-rotate(258deg) brightness(0.92)';

/** `golferPreviewSVG` opts that draw a golfer in corrupted Coil garb (their hair kept). */
export function corruptedLookOpts(character: Character): { skin: string; shirtBase: string; capColor: string; hair: Character['style']['hair'] } {
  return { skin: character.style.skin, shirtBase: COIL_SHIRT, capColor: COIL_ACCENT, hair: character.style.hair };
}
