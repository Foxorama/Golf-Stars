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
 * GS-story-midround-omen: WHY the betrayer is the odd one out (pure) — the single classifier the pre-Choice
 * foreshadow (and later payoff) reads. `'sidelined'` when you picked two DIFFERENT partners (the betrayer is
 * the friend you NEVER chose — benched, resentful); `'tempted'` when you picked the SAME partner both times
 * (the betrayer is the friend you TRUSTED most — the twist, who heard the Coil's word right beside you).
 * Undefined until BOTH team-Sigil picks are locked, so a pre-Sigil-2 campaign has no omen yet.
 */
export function betrayerOddness(story: StoryState): 'sidelined' | 'tempted' | undefined {
  const picks = validPicks(story);
  if (picks.length < 2) return undefined; // both team Sigils not yet played → betrayer not yet settled
  return new Set(picks).size >= 2 ? 'sidelined' : 'tempted';
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
  /** GS-story-midround-omen — the PRE-CHOICE, nine-hole-pause foreshadow, keyed to WHY this friend became
   *  the odd one out of your two team-Sigil partner picks. `sidelined` = they were NEVER picked (two
   *  DISTINCT partners): benched twice, "never good enough", and a Coil NPC drifts to their shoulder while
   *  they mutter at the ropes. `tempted` = they were your partner BOTH times (the SAME pick twice): they
   *  stood at the tee when the Coil spoke and heard the word right beside you — "maybe there's something to
   *  it". Each is authored to seed this friend's later defection (Warden) / farewell (Herald), and each
   *  names this golfer's own Coil relationship (Voss the Apostate or Venoma the Viper), so the betrayal is
   *  personal and stops being a switch-flip. Shown at the turn of the Chapter-3 major, before The Choice. */
  sidelined: readonly DoubtLine[];
  tempted: readonly DoubtLine[];
  /** GS-story-heard-the-word — the HERALD payoff of the `tempted` mid-round omen. When YOU turned to the
   *  Coil, the friend who heard the word beside you (the trusted-twice betrayer) did NOT: they resisted the
   *  same whisper and now confront you, heartbroken and uncomprehending — "I heard the word the same as you…
   *  how could you side with them?" Fires only on the Herald path when this friend was the tempted odd one
   *  out (so it pays off exactly the seed the omen planted). In their own voice + Coil thread. */
  heardTheWord: readonly DoubtLine[];
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
    // Feather’s Coil thread is the APOSTATE — two quiet technicians; Voss respects a precise hand and
    // offers her the one thing a lifelong fader can never have: a line with no wind on it at all.
    sidelined: [
      { kind: 'action', text: 'Feather isn’t in the field today — not picked, again. You find her past the ropes, hitting the same buttery fade into an empty net, over and over, for no one.' },
      { kind: 'say', text: '"Two yards right of the trouble. Every single time. A perfect line… and I watch from the ropes while you tee off with somebody else. Starting to think a perfect line’s worth nothing if there’s never anyone at the end of it to see it land."' },
      { kind: 'action', text: 'A gaunt man in a coat of shed scale has stopped at her shoulder. You never saw him cross the range. The Apostate says something low; she doesn’t walk away.' },
      { kind: 'say', text: 'Voss, just loud enough to carry: "They overlook the steady hand. They always do. Come find me when the wind gets too loud to think, Feather — I know a green where it never blows at all."' },
    ],
    tempted: [
      { kind: 'action', text: 'Feather catches you at the turn, a ball turning slow in her hand, her wind-reader’s eyes fixed on something a long way past the flag.' },
      { kind: 'say', text: '"I was on the tee both times you picked me. Right beside you when that Voss man holed the one no one should hole. You heard the whisper down in the deep rough. So did I — I was close enough to."' },
      { kind: 'say', text: '"Don’t look at me like that. I’m not saying he’s right. I’m saying I’ve aimed off the trouble my whole life, and he offered me a line with no trouble on it at all. Just the still, and the end. Maybe there’s something to it. Maybe."' },
      { kind: 'action', text: 'She pockets the ball and heads for the back nine — and for the first time in fifteen years, you cannot read which way she’ll break.' },
    ],
    // GS-story-heard-the-word: the Herald payoff — she heard the windless line too, and chose the wind.
    heardTheWord: [
      { kind: 'action', text: 'Feather steps out of the Warden line and plants herself between you and the tee. There is no calm in her at all now.' },
      { kind: 'say', text: '"I heard it too, you know. Standing right beside you when Voss holed the impossible one — the whisper in the deep rough. I heard every word of it. Every single one."' },
      { kind: 'say', text: '"And I chose the wind. The doubt, the read, the trouble two yards right — all of it. A line with no trouble on it is a line with no LIFE on it. I heard the word the same as you. So how — HOW could you side with them?"' },
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
    // Woo’s Coil thread is VENOMA — the hype-man who needs a crowd, and the Viper who tells them the crowd
    // never goes quiet on her side. A charged, half-romantic pull: Venoma is the roar in the silence, and
    // Woo, who dies a little every time the gallery hushes, keeps going back to hear her say it again.
    sidelined: [
      { kind: 'action', text: 'Woo isn’t in the field again. So they’re working the gallery instead — high-fiving strangers, filling a silence that used to fill itself. Nobody picked the hype man. Twice.' },
      { kind: 'say', text: '"It’s FINE! Great spot, the ropes — best view in the house! …You didn’t pick me. Either time. Your loudest friend, out here clapping for the golfer who took my seat. Ha. Ha. Hilarious, honestly."' },
      { kind: 'action', text: 'Venoma has appeared at their shoulder — close, a hand on their arm, saying something meant only for Woo. And Woo, who never stops talking, has gone quiet, and is listening.' },
      { kind: 'say', text: 'Venoma, warm as poison: "They stuck a voice like YOURS behind the ropes? Darling. The Coil never lets a gallery go quiet — not for a second. Come stand where they’ll ROAR for you. I’ll keep you a place right at the front."' },
    ],
    tempted: [
      { kind: 'action', text: 'Woo drops onto the bench beside you at the turn and — for once — says nothing at all for a whole three seconds.' },
      { kind: 'say', text: '"Both majors, right there on the tee next to you. When the whole gallery went dead for that Voss guy’s shot — you felt it too, yeah? That HUM underneath the quiet. Like the biggest crowd in the universe, roaring, a long way down."' },
      { kind: 'say', text: '"And Venoma keeps saying it’s for me. That the noise never stops down there. I keep telling her to get lost… and I keep finding reasons to go back and hear her say it one more time. Maybe there’s something to it. Don’t you dare tell Larry."' },
      { kind: 'action', text: 'They wrestle the grin back on, bump your shoulder, and jog to the tenth — but the laugh lands half a beat late, like an echo of itself.' },
    ],
    // GS-story-heard-the-word: the Herald payoff — Venoma reached them too, and they chose the quiet nights.
    heardTheWord: [
      { kind: 'action', text: 'Woo is waiting on the tee. No high-fives. No gallery worked up. Just them — and it is the quietest you have ever seen them stand.' },
      { kind: 'say', text: '"I heard the roar same as you did. Venoma made sure of it — that hum under every silence, the biggest gallery in creation. It REACHED me, friend. Don’t you think it didn’t."' },
      { kind: 'say', text: '"And I said no. I chose the 2 a.m. noodles and the quiet nights and the person you used to be over a crowd that only roars because everything’s ENDING. I heard the word the same as you. So how could you say yes? HOW?!"' },
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
    // Larry’s Coil thread is the APOSTATE — the man who lost a hundred balls to the void and the priest who
    // tells him every one of them is safe out there, at rest. Voss’s fatalism (“the tide always wins the
    // long game”) is the exact line Larry half-quotes in his own doubt beat; here it finds its source.
    sidelined: [
      { kind: 'action', text: 'Larry’s not in the field. He’s out on the far range instead, bombing drivers off the deck edge into the void — watching each one vanish, and not reaching for the next.' },
      { kind: 'say', text: '"Passed over again, eh. Fair enough, fair enough. Who picks the bloke who loses half his balls into the black? …Bit rich, though, mate. Bit rich. I’d have sent one straight down the guts for ya. If you’d only asked."' },
      { kind: 'action', text: 'The Apostate is leaning on the rail beside him, watching a ball shrink to nothing. Larry doesn’t tell him to shove off.' },
      { kind: 'say', text: 'Voss, easy as a mate at the bar: "Every ball you ever sent out there is still going, Larry — safe, still, at rest. The void keeps them all. The tide always wins the long game. Stop fighting it, and you can finally stop losing."' },
    ],
    tempted: [
      { kind: 'action', text: 'Larry catches you at the turn with a range ball weighing in his palm — not gripping it, just holding it, like it might tell him something.' },
      { kind: 'say', text: '"Both times I was on the peg right next to ya, mate. When that scale-coat fella holed the one that shouldn’t go — dead quiet, and under the quiet, somethin’. You heard it. Don’t tell me ya didn’t. I KNOW ya did."' },
      { kind: 'say', text: '"He reckons every ball I ever lost is still out there, at rest. Peaceful, like. And I keep thinkin’ — that doesn’t sound so bad? THAT’S the bit’s got me rattled. That it doesn’t sound bad at all. Reckon there might be somethin’ to it."' },
      { kind: 'action', text: 'He rips one off the deck edge into the black and — for the first time you’ve ever seen him do it — doesn’t watch to see where it goes.' },
    ],
    // GS-story-heard-the-word: the Herald payoff — the Apostate whispered the still to him too; he picked the fight.
    heardTheWord: [
      { kind: 'action', text: 'Larry blocks the fairway, driver laid across his shoulders like a yoke, and for the first time in his life he is not grinning.' },
      { kind: 'say', text: '"I heard it, mate. Every ball I ever lost, safe and still out there forever — the Apostate whispered it right in me ear, same as he did yours. Don’t you DARE tell me I didn’t hear it."' },
      { kind: 'say', text: '"And I picked the fight anyway. The losing, the bunkers, the whole daft business of trying — ’cause that’s LIVING, and the still is just… stopping. I heard the word the same as you. So how could ya side with the thing that stops it ALL?"' },
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
    // Bo’s Coil thread is the APOSTATE — the green-reader and the priest who has stood on the one green Bo
    // has chased their whole life: perfectly still, no break, a pin that never moves. Voss calls it mercy;
    // for a golfer who reads greens for a living, that word lands harder than any taunt.
    sidelined: [
      { kind: 'action', text: 'Bo wasn’t picked. They’re on the practice green anyway, reading the line for a putt they won’t get to hit, in a match that was never theirs.' },
      { kind: 'say', text: '"I read greens better than anyone on this tour. You know I do. And twice now you’ve walked past me to the tee with someone else. I’m not angry. I’m just… quietly recalculating what all that reading was ever for."' },
      { kind: 'action', text: 'A gaunt figure in shed-scale has crouched at the low side, reading the same line. The Apostate nods, slow, like he agrees with a break only Bo can see.' },
      { kind: 'say', text: 'Voss, almost gentle: "You’ve spent your life chasing the one green that’s perfectly still. No break. No wind. A pin that never moves. I have stood on it, Bo. When you tire of reading lines nobody will let you play — I’ll show you the way there."' },
    ],
    tempted: [
      { kind: 'action', text: 'Bo sits with you at the turn, marker still in hand, and charts a slope on the empty bench between you that isn’t there.' },
      { kind: 'say', text: '"I was beside you on both tees. When Voss holed the impossible one and the whole world went still — I felt the read CHANGE. Under my feet. Every green since has been pulling toward the same quiet centre."' },
      { kind: 'say', text: '"He calls it mercy. I read greens for a living; you can see why that reaches me. Everything, everywhere, coming to rest. I keep trying to prove the read wrong, and I keep agreeing with it a little more. Maybe there’s something to it."' },
      { kind: 'action', text: 'They roll an invisible ball dead straight along the bench, watch it die exactly where they knew it would, and go very quiet.' },
    ],
    // GS-story-heard-the-word: the Herald payoff — Bo read the still green as clear as you, and chose the broken ones.
    heardTheWord: [
      { kind: 'action', text: 'Bo is standing on the green you came to desecrate, marker in hand, reading a line that leads nowhere good.' },
      { kind: 'say', text: '"I felt the read change under my feet the same second you did. The one perfectly still green — no break, no wind, everything at rest. I read that line as clear as you ever could. Clearer, maybe."' },
      { kind: 'say', text: '"And I chose the broken greens. The living ones. A green that never breaks is a green nobody is left to play. I heard the word the same as you — so how, HOW could you side with them?"' },
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

const FALLBACK_SIDELINED: readonly DoubtLine[] = [
  { kind: 'action', text: 'Your friend isn’t in the field again — passed over twice now, watching from the ropes.' },
  { kind: 'say', text: '"Never quite good enough to pick, am I? …It’s fine. Forget it."' },
  { kind: 'action', text: 'A hooded figure has drifted to their shoulder, and they are, for once, listening instead of walking away.' },
];
const FALLBACK_TEMPTED: readonly DoubtLine[] = [
  { kind: 'action', text: 'Your partner in both majors finds you at the turn, unusually quiet.' },
  { kind: 'say', text: '"I stood on the tee beside you when the Coil spoke. I heard the word the same as you did. And… maybe there’s something to it. Maybe."' },
];

/** GS-story-midround-omen: the SIDELINED omen — the unpicked friend at the ropes ("never good enough") +
 *  a Coil NPC at their shoulder. The pre-Choice nine-hole-pause foreshadow when TWO DISTINCT partners were
 *  picked, so the betrayer is the one you never chose. */
export function betrayalSidelined(charId: string): readonly DoubtLine[] {
  return BETRAYAL_VOICE[charId]?.sidelined ?? FALLBACK_SIDELINED;
}
/** GS-story-midround-omen: the TEMPTED omen — the trusted friend you partnered BOTH times, admitting they
 *  heard the Coil's word beside you and "maybe there's something to it". The pre-Choice foreshadow when the
 *  SAME partner was picked twice, so the betrayer is the one you trusted most (the twist). */
export function betrayalTempted(charId: string): readonly DoubtLine[] {
  return BETRAYAL_VOICE[charId]?.tempted ?? FALLBACK_TEMPTED;
}

const FALLBACK_HEARD: readonly DoubtLine[] = [
  { kind: 'action', text: 'The friend you trusted most steps into your path, and there is no forgiveness in their face.' },
  { kind: 'say', text: '"I heard the word the same as you did — I was right there beside you. And I said NO. How could you side with them?"' },
];

/** GS-story-heard-the-word: the HERALD payoff of the tempted omen — the trusted-twice friend who heard the
 *  Coil's word beside you, RESISTED it, and now confronts you for turning: "I heard the word the same as
 *  you… how could you side with them?" In their own voice + Coil thread. Fires only on the Herald path when
 *  this friend was the tempted odd one out (so it pays off exactly the seed the mid-round omen planted). */
export function betrayalHeardTheWord(charId: string): readonly DoubtLine[] {
  return BETRAYAL_VOICE[charId]?.heardTheWord ?? FALLBACK_HEARD;
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
      v.distance.length >= 3 &&
      v.sidelined.length >= 3 &&
      v.tempted.length >= 2 &&
      v.heardTheWord.length >= 2
    );
  });
}

/** GS-story-defection-clubhouse: has the WARDEN-path betrayer already DEFECTED and walked off? True once
 *  "The Defection" interlude (`interlude-warden`) has played — from the Chapter-4 major on, the odd-one-out
 *  has gone into the mire, so they no longer stand in the clubhouse / aboard the ship (their hat is left
 *  behind) and instead face you, Coil-garbed, at the Ch.5 shrine. Reads the persisted flag directly to keep
 *  this module free of a `storyInterlude` import cycle (interlude imports this). */
export function betrayerHasDefected(story: StoryState): boolean {
  return story.seenStoryBeats['interlude-warden'] === true;
}

// ── The corrupted (Coil) costume for a defector (GS-story-betrayer / GS-story-coil-garb) ────────────────
//
// The switched-sides read has to land WITHOUT erasing who the friend was: they keep their own SHIRT COLOUR
// (their signature identity hue), their face, and their hair — you still recognise them across the tee — and
// the Coil is worn OVER the top as an open serpent robe + a raised cobra hood + a spiky serpent circlet
// (the "spiffy Coil hat"). That is a far stronger betrayal beat than the old flat violet reskin, which
// repainted the whole figure and made the defector a generic Coil silhouette.

/** Acid-green venom accent — the Coil's signature. */
export const COIL_ACCENT = '#7fe0a0';
/** The open robe / mantle a defector wears over their own outfit (deep Coil violet). */
export const COIL_ROBE = '#3a1a52';
/** The raised cobra hood behind the head (a shade darker than the robe). */
export const COIL_HOOD = '#241038';
/** Kept for back-compat / any legacy reference — the old flat Coil-violet shirt swap (no longer used by the
 *  costume, which now preserves the golfer's own shirt colour). */
export const COIL_SHIRT = '#2e1840';

/** The `coilGarb` payload `golferPreviewSVG` reads to drape a golfer in Coil robes + hood + circlet. */
export interface CoilGarb {
  robe: string;
  hood: string;
  accent: string;
}

/** `golferPreviewSVG` opts that draw a golfer as a Coil DEFECTOR (GS-story-coil-garb): their OWN shirt,
 *  skin and hair kept (so they still read as themselves), with an open serpent robe + cobra hood + serpent
 *  circlet layered over the top. */
export function corruptedLookOpts(
  character: Character,
): { skin: string; shirtBase: string; capColor: string; hair: Character['style']['hair']; coilGarb: CoilGarb } {
  return {
    skin: character.style.skin,
    shirtBase: character.style.shirt, // KEEP their identity colour — the robe frames it, never hides it
    capColor: character.style.cap,
    hair: character.style.hair,
    coilGarb: { robe: COIL_ROBE, hood: COIL_HOOD, accent: COIL_ACCENT },
  };
}
