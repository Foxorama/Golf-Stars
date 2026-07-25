/**
 * Story-Tour GALAXY TOURNAMENTS (GS-story-tournament) — the campaign SPINE that turns world-clears into
 * chapter progression. Each chapter culminates in a Galaxy Tournament at a venue world: clear a couple of
 * the chapter's worlds to unlock it, then play the venue against a recurring RIVAL (Venoma "the Viper", the
 * Coil's prodigy — a scaled ghost). Beat the rival's total and you win a **Sigil** (a trophy), which
 * ADVANCES the chapter (unlocking the next cluster of worlds) and banks a signature prize. Collect all five
 * Sigils and they forge the key to the finale (`keyToOtherRealm` → `storyComplete`).
 *
 * This is the winnable TRUNK: one tournament per chapter over the current chapter-gated world list. The
 * bible's Warden/Herald alignment fork (chapters 4–6, two routes) is a later, richer replacement — the
 * framework here is route-agnostic (a row per chapter), so that pass swaps the rows without touching the
 * flow. PURE + DOM-free; screens + play plumbing live in the app/ui layers.
 *
 * Rival ghosts reuse the proven Asgard stroke-play model (`ghostHoleStrokes`/`golferForm`) — deterministic
 * from the round seed + pars + a per-tournament `rivalEdge` (gentle early, brutal at the serpent's shrine).
 */

import { ghostHoleStrokes, golferForm } from './competition';
import { CHARACTERS, getCharacter } from './characters';
import { otherGolferIds } from './storyCast';
import { betrayerId, heraldOpponentIds, heraldSeveredId, finaleMatchup, type FinaleMatchup, type FriendRivalVoice } from './storyBetrayal';
import {
  resolveStorySinglesMatch,
  resolveStory2v2Match,
  type OpposingPair,
  type StorySinglesMatchResult,
  type StoryMatchResult,
} from './storyTeams';
import {
  STORY_WORLDS,
  STORY_CHAPTER_COUNT,
  worldCleared,
  storyWorldById,
  type StoryState,
  type StoryWorld,
  type StoryAlignment,
} from './story';
import { qualifierEventsForChapter, qualifiedCount, QUALIFY_EVENTS_NEEDED } from './storyQualifiers';

/** The FORMAT a Sigil is played in (GS-story-team-format / GS-story-sigil-formats). Absent/`strokeplay` =
 *  the classic ghost stroke-play major. The five Sigils are DISTINCT formats, in chapter order:
 *  Scramble → Best-ball → Singles matchplay → (singles) Strokeplay → 2v2 Scramble matchplay. Resolution
 *  branches on this in `resolveStoryTournament`. */
export type StoryTournamentFormat = 'strokeplay' | 'scramble' | 'bestball' | 'matchplay' | 'scramble-match';

/** A chapter's Galaxy Tournament (content-as-data). */
export interface StoryTournament {
  /** The chapter this tournament closes (1..STORY_CHAPTER_COUNT). Winning it advances to `chapter + 1`. */
  chapter: number;
  /** GS-story-team-format: how this Sigil is played. Absent = classic ghost stroke-play (byte-identical). */
  format?: StoryTournamentFormat;
  /** GS-story-chapters: back-half tournaments (Ch.4–5) come in two ALIGNMENT variants (warden/herald);
   *  Ch.1–3 are the shared trunk (no alignment). `tournamentForChapter` picks the row for the path. */
  alignment?: StoryAlignment;
  /** The venue course id (one of the chapter's worlds). */
  venueId: string;
  name: string;
  host: string;
  /** The rival to beat for the Sigil — an id fed to the ghost model, and a display name. When
   *  `dynamicRival` is set these are the FALLBACK only (an unstarted campaign); resolve the real rival
   *  through `tournamentRival(t, story)` (GS-story-sigil-rivals). */
  rivalId: string;
  rivalName: string;
  /** GS-story-sigil-rivals: the back-half rivals are PEOPLE FROM YOUR OWN STORY, not fixed NPCs — who
   *  stands across the tee is derived from the betrayal arc (your team-Sigil partner picks + path):
   *    • `severed`  — Ch.4 Herald: the Warden friend sent to stop you at the Drowning Rite — the SAME
   *      friend the Severing interlude then cuts loose (rival ≡ the one you betray).
   *    • `betrayer` — Ch.5 Warden: the friend who turned on you, in corrupted Coil garb (the Coil
   *      leader Malachi/Voss at their shoulder — the matchup box shows the pair; the FEATURED rival is
   *      the traitor).
   *    • `heraldPair` — Ch.5 Herald: the two former friends who partnered you, come to end you (the
   *      featured rival is the first of them — the more personal face).
   *  Absent = the static row rival (the shared trunk + Ch.4 Warden). */
  dynamicRival?: 'severed' | 'betrayer' | 'heraldPair';
  /** How sharply the rival plays (per-hole stroke edge; scales up the deeper the chapter). */
  rivalEdge: number;
  /** LEGACY (GS-story-qualifiers): the old "clear this many worlds" gate. The tournament now opens after
   *  `QUALIFY_EVENTS_NEEDED` top-N qualifying-event finishes (`chapterQualifiersMet`); kept for save/row
   *  shape stability but no longer the gate. */
  unlockAfterClears: number;
  /** The trophy id awarded on a win (a "Sigil of the Game"). */
  sigilId: string;
  sigilName: string;
  /** The signature prize blurb. */
  prize: string;
  /** GS-story-tournament-reward: the NAMED reward-club id GRANTED into the bag on a first win (a `quest:`/
   *  `major:` id resolved through `NAMED_STORY_CLUBS`). The majors used to name a prize club in `prize` but
   *  never hand it over (the Emerald Invitational bug); this is the club that actually lands. Absent = none. */
  rewardClubId?: string;
  /** GS-story-route-rewards: a ship GRANTED on winning this major (the route's signature ride). Absent = none. */
  rewardShipId?: string;
  /** GS-story-reward-variety: a SHIP PART (`upg:<cat>:<var>`) GRANTED on winning this major — the Ch.5
   *  climax majors forge a capital weapon for the finale battle (the fifth Sigil literally forges the key).
   *  Absent = none. */
  rewardUpgradeId?: string;
  /** Host/rival flavour for the tournament lobby (lore-card style). */
  intro: string[];
}

// The five Sigils, in chapter order (the winnable trunk over the current chapter-gated worlds).
export const STORY_TOURNAMENTS: readonly StoryTournament[] = [
  {
    chapter: 1,
    format: 'scramble',
    venueId: 'verdant-18',
    name: 'The Emerald Invitational',
    host: 'Sir Aldous Greensward',
    rivalId: 'tour-birdie',
    rivalName: 'Birdie Bianchi',
    rivalEdge: 0.07,
    unlockAfterClears: 2,
    sigilId: 'sigil-emerald',
    sigilName: 'The Emerald Sigil',
    prize: 'The Verdant Wood — a reliable fairway wood, your first real reward.',
    rewardClubId: 'major:emerald',
    intro: [
      'The rookie major, hosted by Sir Aldous Greensward — genteel old-guard chair of the Galactic Tour, ' +
        'pompous and kind and utterly ignorant of the Game beneath his tournament. A warm twin-sun, and a ' +
        'gallery that still thinks this is just golf. It isn’t — but today you can pretend.',
      'It’s a TWO-BALL SCRAMBLE — pick one of your friends, share a ball, and take the best of every shot. ' +
        'A gentle way to learn a partner. Beat the field (the club champion Birdie Bianchi leads a pair) and ' +
        'your first Sigil of the Game is yours.',
      '🦜 "One Sigil in the Keystone, champion — one stone against the day the World-Eater wakes. It starts here. Play it true."',
    ],
  },
  {
    chapter: 2,
    format: 'bestball',
    venueId: 'inferno-18',
    name: 'The Forge Masters',
    host: 'Magnus Cinder',
    rivalId: 'venoma',
    rivalName: 'Venoma "the Viper" Krait',
    rivalEdge: 0.12,
    unlockAfterClears: 2,
    sigilId: 'sigil-ember',
    sigilName: 'The Ember Sigil',
    prize: 'The Forgefire Driver — reborn in the fire, longer than anything you own.',
    rewardClubId: 'major:ember',
    intro: [
      'The anvil-world of Orion, staged by Magnus Cinder — a bombastic pyromaniac promoter who’ll do ' +
        'anything for spectacle, and who took Coil money without ever knowing what he sold. Halfway ' +
        'through, an uninvited golfer strides onto the tee: Venoma "the Viper" Krait, the Coil’s prodigy, ' +
        'playing a ball that hisses as it flies.',
      'BEST-BALL this time — you and a friend each play your own ball, and the team keeps the better score ' +
        'on every hole. Pick the same partner or a new one. 🦜 "That’s the Coil, champion — a cult that ' +
        'wants the serpent awake. Beat the Viper’s pair. This is where it stops being a game."',
      'Two Sigils would lock the root deeper. The Coil knows it too — which is why the Viper came to take this one from you.',
    ],
  },
  {
    chapter: 3,
    format: 'matchplay',
    venueId: 'tempest-18',
    name: 'The Storm Championship',
    host: 'A shadow tournament — the Coil',
    // GS-story-apostate: the Storm is where the Apostate plays himself — not to win, but to SHOW you.
    // (All story rivals share the default ghost profile, so this is a name/edge change only — balance-neutral.)
    rivalId: 'voss',
    rivalName: 'Malachai "Sable" Voss',
    rivalEdge: 0.18,
    unlockAfterClears: 2,
    sigilId: 'sigil-storm',
    sigilName: 'The Storm Sigil',
    prize: 'The Galewarden Irons — a matched set (5·7·9) of control irons that read the wind true.',
    rewardClubId: 'major:storm',
    intro: [
      'The tour "postponed" it; the Coil runs a shadow tournament in the eye of the Dragon’s storm, and ' +
        'you crash it to take the Sigil before they can corrupt it. The rough itself seems to move.',
      'And he is here — the Apostate, Malachai Voss, the champion who fell. He will not try to beat you. ' +
        'He will try to make you understand. This one is just the two of you — SINGLES MATCHPLAY, hole by ' +
        'hole, the lower score takes the hole. Win more holes than he does across the gale and the Storm ' +
        'Sigil is yours.',
      'Three Sigils, and the Keystone is half-forged — but the sky is already fraying at the edges. When you walk off the eighteenth, the Coil will make you an offer. Win first. Choose after.',
    ],
  },
  // ── Chapter 4 — the routes diverge (The Choice was made after Chapter 3) ──
  {
    chapter: 4,
    alignment: 'warden',
    venueId: 'void2-18',
    name: 'The Abyssal Vigil',
    host: 'The Fairway Wardens',
    // GS-story-scorpius: the fourth Sigil used to pit you against Venoma a SECOND time (she also plays the
    // Ch.2 Forge) — a replay that read like a bug. The Coil, twice-failed with the Viper, now sends its
    // silent assassin: Scorpius, "the Silent Sting", the executioner for the second-to-last Sigil. The Viper
    // returns at the Ch.5 shrine, at the traitor's shoulder — so each Coil champion owns a distinct chapter.
    rivalId: 'scorpius',
    rivalName: 'Scorpius "the Silent Sting"',
    rivalEdge: 0.23,
    unlockAfterClears: 2,
    sigilId: 'sigil-abyssal',
    sigilName: 'The Abyssal Sigil',
    prize: 'The Radiant Warden Cruiser — a celestial ship, awarded to the victor.',
    rewardShipId: 'warden-cruiser',
    // GS-story-doubt: this intro used to dwell on Venoma's own fear ("saving Venoma") — the chapter's real
    // story is the betrayal brewing aboard YOUR ship, so the copy now carries the doubt thread instead.
    intro: [
      'Not a show — a vigil. At the edge of a black hole the Coil is trying to wake a lesser dreamer, and ' +
        'the Wardens play the Sagittarius Core to hold it down. This Sigil is strokeplay: no partner, no ' +
        'gallery, just your card against one other. And the card set against yours belongs to the Coil’s ' +
        'quietest weapon — Scorpius, "the Silent Sting", the hunter they send when gloating has failed.',
      'But the cold at your back is not the void, nor the hunter — it is the quiet on your own ship. ' +
        '{betrayer} has hardly spoken since the storm-world, and the Choice you made there is still being ' +
        'made, hole by hole, by everyone who followed you out here. The Coil’s favourite door is a doubting ' +
        'heart, and the Sting has already found which one aboard your ship stands ajar.',
      'Hold the vigil, outplay the Silent Sting, and take the Abyssal Sigil — and watch your friends, ' +
        'champion. The eye at the root is half-open now, and it is not only looking at you.',
    ],
  },
  {
    chapter: 4,
    alignment: 'herald',
    venueId: 'ocean-18',
    name: 'The Drowning Rite',
    host: 'Sister Ecdysis',
    // GS-story-sigil-rivals: the REAL rival is the friend the Order sends to stop you — resolved from your
    // partner picks via `tournamentRival` (the same friend the Severing then cuts loose). Fallback only.
    dynamicRival: 'severed',
    rivalId: 'warden-champion',
    rivalName: 'A Warden champion',
    rivalEdge: 0.23,
    unlockAfterClears: 2,
    sigilId: 'sigil-drowned',
    sigilName: 'The Drowned Sigil',
    prize: 'The Coil Wyrm-Ship — a corrupted serpent-hull, power with a price.',
    rewardShipId: 'wyrm-ship',
    intro: [
      'You wear the Coil’s mark now, and Sister Ecdysis — the Shedmaker, who forges the cult’s cursed ' +
        'relics from serpent-scale — presides over your rite. At the Eridanus Atolls you desecrate a ' +
        'Warden shrine to drown its wards — and the champion the Wardens send to stop you is {rival}, ' +
        'your own Earth tour-mate, who answered the Parrot’s call at your side. They came alone. They ' +
        'still believe you can be reached.',
      'They don’t hate you. That is worse. Drown {rival}’s round, and take the Drowned Sigil.',
      '🐦‍⬛ "Four Sigils, and the serpent exhales a little deeper. This is the drowning, Herald — the first world you take FOR the Long Rest instead of against it. And it is {rival} across the tee because it MUST be — a rite is only a rite if it costs. It should feel like a sin. That feeling is how you know it is working."',
    ],
  },
  // ── Chapter 5 — the fifth Sigil, per route (both forge the key) ──
  {
    chapter: 5,
    alignment: 'warden',
    format: 'scramble-match',
    venueId: 'swamp-18',
    name: 'The Serpent’s Vigil',
    host: 'The Fairway Wardens',
    // GS-story-sigil-rivals: the FEATURED rival is the friend who turned on you (corrupted Coil garb), with
    // the Coil leader Malachi/Voss at their shoulder — the matchup box shows the pair. Fallback only.
    dynamicRival: 'betrayer',
    rivalId: 'voss',
    rivalName: 'Malachai "Sable" Voss',
    rivalEdge: 0.29,
    unlockAfterClears: 2,
    sigilId: 'sigil-vigil',
    sigilName: 'The Serpent’s Seal',
    prize: 'The Star-Blessed Lance — clean starfire slung under your hull, forged for the last fight. The fifth Sigil forges the key to the finale.',
    rewardUpgradeId: 'upg:weapon:starlance',
    intro: [
      'The acid shrine of Hydra Mire, where the Coil means to complete their rite — and {rival}, the ' +
        'friend who turned on you, stands with them now in shed-scale robes, familiar and wrong all at ' +
        'once. Malachai Voss, the Apostate, is at their shoulder, wearing your grief like a trophy.',
      // GS-story-ambiguous-fate: no promised redemption — winning is for the Sigil; what winning leaves of
      // the friend is deliberately unknowable (the ending resolves where they went, not who they are now).
      // GS-story-sigil5-npc: you choose which loyal tour-mate shares your ball; the Coil sends its leader.
      'It’s a 2-vs-2 SCRAMBLE MATCHPLAY: you and a loyal friend SHARE a ball — the best of your every shot — ' +
        'against {rival} and the Apostate sharing theirs, hole by hole, the lower team score takes it. Win ' +
        'the match and the last Sigil is yours. As for {rival} — nobody can say how deep the whisper has ' +
        'gone, or what winning will leave standing on the far side of it.',
      'Five Sigils forge the Green Key — and above the mire the sky is already cracking. Win here and Ragnarök stops at the door; the key becomes a lock you carry down to the root to seal it forever.',
    ],
  },
  {
    chapter: 5,
    alignment: 'herald',
    format: 'scramble-match',
    venueId: 'derelict-18',
    name: 'The Ghost Harvest',
    host: 'The Coil',
    // GS-story-sigil-rivals: the opposing pair are the two friends who PARTNERED you (heraldOpponentIds);
    // the featured rival is the first of them. Fallback only.
    dynamicRival: 'heraldPair',
    rivalId: 'driver-dan',
    rivalName: 'Driver Dan',
    rivalEdge: 0.29,
    unlockAfterClears: 2,
    sigilId: 'sigil-ascension',
    sigilName: 'The Serpent’s Fang',
    prize: 'The Coil anoints you its Herald — and slings the Wyrm-Fang Cannon under your hull. The fifth Sigil forges the key to the finale.',
    rewardUpgradeId: 'upg:weapon:wyrmfang',
    intro: [
      'The Ghost Wreck, where the Coil harvests the dead — and {opponents}, the two friends who shared ' +
        'your ball and trusted you with their Sigils, have come together to stop you: heartbroken, ' +
        'unyielding, and still calling you by your name. A Coil champion takes your side; the old bonds ' +
        'line up across the tee.',
      'It’s a 2-vs-2 SCRAMBLE MATCHPLAY: you and a Coil champion SHARE a ball — the best of your every shot — ' +
        'against {opponents} sharing theirs, hole by hole, the lower team score takes it. ' +
        'Break them and the last Sigil is yours; the rite is complete.',
      '🐦‍⬛ "The fifth Sigil, Herald, and the Green Key is yours — not to lock the root, but to OPEN it. They sent the two who loved you best — the Wardens understand ceremony after all. Ragnarök has a hand on the door now, and that hand is yours. Take it. Let the tired universe rest."',
    ],
  },
];

/**
 * The tournament that closes a given chapter, for the player's PATH. Chapters 1–3 are the shared trunk
 * (no `alignment` on the row). Chapters 4–5 have two variants; the `alignment` selects the row (defaulting
 * to the Warden variant if the path somehow isn't set yet — by Chapter 4 The Choice has been made).
 */
export function tournamentForChapter(chapter: number, alignment?: StoryAlignment): StoryTournament | undefined {
  const shared = STORY_TOURNAMENTS.find((t) => t.chapter === chapter && !t.alignment);
  if (shared) return shared;
  const path = alignment ?? 'warden';
  return STORY_TOURNAMENTS.find((t) => t.chapter === chapter && t.alignment === path);
}

// ── The EFFECTIVE rival (GS-story-sigil-rivals) ────────────────────────────────────────────────────────

/** The resolved rival actually standing across the tee. `golferId` is set when the rival is one of the
 *  playable friends (draw their real figure, speak their betrayal voice); `corrupted` when they wear the
 *  Coil garb (the Warden-path defector); `voice` picks their dialogue context. */
export interface EffectiveRival {
  id: string;
  name: string;
  golferId?: string;
  corrupted?: boolean;
  voice?: FriendRivalVoice;
}

/** A friend's display short-name (falls back to the raw id). */
function friendName(id: string): string {
  return getCharacter(id)?.shortName ?? id;
}

/**
 * Resolve the rival for a Sigil from the player's OWN story (pure): the betrayal arc decides who stands
 * across the tee in the back half — the rival in the competition is always who you betrayed or who
 * betrayed you, never a stranger. Rows without `dynamicRival` (the trunk + Ch.4 Warden) return the static
 * rival unchanged, so an unstarted/legacy campaign is byte-identical.
 */
export function tournamentRival(t: StoryTournament, story?: StoryState): EffectiveRival {
  const fallback: EffectiveRival = { id: t.rivalId, name: t.rivalName };
  if (!t.dynamicRival || !story) return fallback;
  switch (t.dynamicRival) {
    case 'severed': {
      // Ch.4 Herald — the friend the Wardens send to stop you (and the one you then sever).
      const id = heraldSeveredId(story);
      return { id, name: friendName(id), golferId: id, voice: 'confront' };
    }
    case 'betrayer': {
      // Ch.5 Warden — the friend who fell to the Coil, in corrupted garb (Malachi/Voss at their shoulder).
      const id = betrayerId(story);
      return { id, name: friendName(id), golferId: id, corrupted: true, voice: 'corrupt' };
    }
    case 'heraldPair': {
      // Ch.5 Herald — the two former friends who partnered you; the first is the featured face. GS-story-
      // pair-voice: they speak as a PAIR (they share a ball against you), never the lone-champion `confront`
      // voice of the Ch.4 rite — a friend saying "they told me not to come alone, came alone anyway" while
      // their partner stands beside them was the player report.
      const [a] = heraldOpponentIds(story);
      return { id: a, name: friendName(a), golferId: a, voice: 'confrontPair' };
    }
  }
}

/**
 * The tournament's intro paragraphs with the story TOKENS resolved (pure): `{rival}` → the effective
 * rival's name, `{opponents}` → the Herald finale's opposing pair ("A & B"). Static rows pass through
 * untouched. Screens must read intros through this, never `t.intro` raw.
 */
export function tournamentIntroLines(t: StoryTournament, story?: StoryState): string[] {
  const rival = tournamentRival(t, story);
  const opponents = story
    ? heraldOpponentIds(story)
        .map((id) => friendName(id))
        .join(' & ')
    : 'your former friends';
  // GS-story-doubt: `{betrayer}` — the friend the betrayal arc says will turn (the Ch.4W intro foreshadows
  // them by name; the Ch.5W intro confronts them). Resolved from the SAME `betrayerId` seam as the beats.
  const betrayer = story ? friendName(betrayerId(story)) : 'a friend';
  return t.intro.map((p) => p.replaceAll('{rival}', rival.name).replaceAll('{opponents}', opponents).replaceAll('{betrayer}', betrayer));
}

/** All of a chapter's worlds (from the chapter-gated list). */
export function chapterWorlds(chapter: number): StoryWorld[] {
  return STORY_WORLDS.filter((w) => w.unlockChapter === chapter);
}

/** How many of a chapter's worlds the player has cleared. */
export function worldsClearedInChapter(story: StoryState, chapter: number): number {
  return chapterWorlds(chapter).filter((w) => worldCleared(story, w.courseId)).length;
}

/**
 * GS-story-qualifiers: a chapter's QUALIFYING EVENTS — its worlds MINUS the Sigil venue (which is played as
 * the major). The venue depends on the chosen path, so this resolves it via `tournamentForChapter`.
 * GS-story-world-variety: a chapter charts FOUR worlds now, so this returns THREE events — you still only
 * need `QUALIFY_EVENTS_NEEDED` (two) top-N finishes to unlock the Sigil, so the third is a choice of road.
 */
export function chapterQualifierEvents(chapter: number, alignment?: StoryAlignment): string[] {
  return qualifierEventsForChapter(chapter, tournamentForChapter(chapter, alignment)?.venueId);
}

/** How many of THIS chapter's qualifying events the player has qualified in (top-N finish). */
export function chapterQualifiersMet(story: StoryState, chapter: number): number {
  return qualifiedCount(story, chapterQualifierEvents(chapter, story.alignment));
}

/** Is this world a QUALIFYING EVENT for the player's path (a chapter world that isn't its Sigil venue)?
 *  Uses the world's OWN chapter, so it's stable regardless of the player's current chapter. */
export function isStoryQualifier(courseId: string, alignment?: StoryAlignment): boolean {
  const w = storyWorldById(courseId);
  if (!w) return false;
  return courseId !== tournamentForChapter(w.unlockChapter, alignment)?.venueId;
}

/**
 * Is this world a LIVE qualifying event for the player right now (GS-story-qualifier-chapter-gate)? — a
 * qualifier for their path (above) whose own chapter they have actually REACHED.
 *
 * The chapter half matters because a couple of Ch.5 worlds chart at Ch.4 (`chartChapter`, GS-story-gather-
 * early) so you can fly out and recruit their friend in time. Visiting one early is EXPLORATION: the round
 * banks a clear, and `resolveStoryRound` has always refused to record a qualifying finish for a chapter you
 * haven't reached. Arming the qualifier PLAN had no such gate, so an early visit played as a nine-hole
 * qualifying event that could never count — and then the same world came round AGAIN as a real qualifier for
 * its own chapter's Sigil, reading as "you already played this event, play it again". One predicate now
 * decides both, so a world is a qualifying event for exactly ONE Sigil, once you're in its chapter.
 */
export function isLiveStoryQualifier(story: StoryState, courseId: string): boolean {
  const w = storyWorldById(courseId);
  if (!w || w.unlockChapter > story.chapter) return false;
  return isStoryQualifier(courseId, story.alignment);
}

/** Has this tournament already been won (its Sigil banked)? */
export function tournamentWon(story: StoryState, t: StoryTournament): boolean {
  return story.trophyIds.includes(t.sigilId);
}

/** The tournament available RIGHT NOW — the current chapter's (for the chosen path), if unwon and enough
 *  worlds are cleared. */
export function currentTournament(story: StoryState): StoryTournament | undefined {
  const t = tournamentForChapter(story.chapter, story.alignment);
  if (!t || tournamentWon(story, t)) return undefined;
  // GS-story-qualifiers: the gate is now two QUALIFYING-EVENT top-N finishes (not just clearing two worlds).
  return chapterQualifiersMet(story, story.chapter) >= QUALIFY_EVENTS_NEEDED ? t : undefined;
}

/** Is a tournament ready to enter from the clubhouse? */
export function tournamentUnlocked(story: StoryState): boolean {
  return !!currentTournament(story);
}

/** The rival's ghost gross total over the venue's pars (deterministic from the round seed). Pass the
 *  resolved `rival` on a dynamic-rival Sigil (GS-story-sigil-rivals) so the ghost is the real opponent. */
export function rivalTotal(t: StoryTournament, seed: string, pars: readonly number[], rival?: EffectiveRival): number {
  return rivalTotalThrough(t, seed, pars, pars.length, rival);
}

/** The rival's ghost gross through the FIRST `upto` holes (deterministic; same per-hole draws as the full
 *  total, so a partial standing is consistent with the finish). Used by the halftime pop (GS-story-tournament-midpop). */
export function rivalTotalThrough(t: StoryTournament, seed: string, pars: readonly number[], upto: number, rival?: EffectiveRival): number {
  const rivalId = rival?.id ?? t.rivalId;
  const form = golferForm(rivalId, `${seed}:form`);
  const n = Math.max(0, Math.min(pars.length, upto));
  let total = 0;
  for (let i = 0; i < n; i++) total += ghostHoleStrokes(rivalId, `${seed}:${i}`, pars[i]!, form, t.rivalEdge);
  return total;
}

/** A competitor in the tournament FIELD (GS-story-tournament-field): the rival, your three friendly-rival
 *  golfers, and — folded in at resolve — you. `gross` is the total over the venue's pars. */
export interface FieldGolfer {
  id: string;
  name: string;
  gross: number;
  kind: 'rival' | 'friend' | 'player';
}

/** How sharply your three friends play (a MILD edge — they're beatable tour-mates, not the cult rival).
 *  Per-golfer variation comes from `golferForm`, so the three don't post identical cards. */
export const FRIEND_FIELD_EDGE = 0.05;

/** A friend's deterministic ghost gross over the pars (their own seeded form + the mild friend edge). */
function friendTotal(golferId: string, seed: string, pars: readonly number[]): number {
  const form = golferForm(golferId, `${seed}:friend:${golferId}`);
  let total = 0;
  for (let i = 0; i < pars.length; i++) total += ghostHoleStrokes(golferId, `${seed}:friend:${golferId}:${i}`, pars[i]!, form, FRIEND_FIELD_EDGE);
  return total;
}

/**
 * The tournament FIELD you compete against (GS-story-tournament-field, pure + deterministic): the recurring
 * RIVAL (the cult's champion / the club champion) plus your three FRIENDS — the other playable golfers, your
 * Earth tour-mates who answered the Parrot's call (the bible's "friendly leaderboard"). Does NOT include you;
 * the resolve folds in your real gross. Excludes the protagonist so a friend is never the golfer you're
 * playing. Ordered rival-first, then friends. The WIN condition is unchanged (you vs the rival for the
 * Sigil); this field is the DISPLAY (intro hype, mid-round standings, victory scoreboard).
 */
export function tournamentField(
  t: StoryTournament,
  seed: string,
  pars: readonly number[],
  protagonistId?: string,
  rival?: EffectiveRival,
): FieldGolfer[] {
  const rid = rival?.id ?? t.rivalId;
  const out: FieldGolfer[] = [
    { id: rid, name: rival?.name ?? t.rivalName, gross: rivalTotal(t, seed, pars, rival), kind: 'rival' },
  ];
  for (const c of CHARACTERS) {
    if (c.id === protagonistId) continue;
    // Don't duplicate a friend who is also this tournament's rival — on a dynamic-rival Sigil the rival IS
    // one of the playable friends (GS-story-sigil-rivals), so they must never also post a friend card.
    if (c.id === rid) continue;
    out.push({ id: c.id, name: c.shortName, gross: friendTotal(c.id, seed, pars), kind: 'friend' });
  }
  return out;
}

// ── Team majors (GS-story-partners): Sigils 1 (scramble) & 2 (best-ball) — you + a chosen friend vs pairs ──

/** Is this Sigil a TEAM major (you pick a partner and play a scramble / best-ball vs opposing pairs)? */
export function isTeamTournament(t: StoryTournament): boolean {
  return t.format === 'scramble' || t.format === 'bestball';
}

/** Is this Sigil a 1v1 SINGLES MATCHPLAY (Ch.3 — just you vs the rival, hole by hole, lower score wins)? */
export function isSinglesMatchTournament(t: StoryTournament): boolean {
  return t.format === 'matchplay';
}

/** Is this Sigil a 2v2 SCRAMBLE MATCHPLAY (Ch.5 finale — you + an ally share a ball vs an opposing pair)? */
export function isTeamMatchTournament(t: StoryTournament): boolean {
  return t.format === 'scramble-match';
}

// ── The LIVE match state of a matchplay Sigil (GS-story-sigil-live) ────────────────────────────────────

/** GS-story-betrayer: the Ch.5 finale ally's per-hole edge — a modest ~par help (NOT the team-major
 *  helper), so YOUR round decides the match. (Moved here from the reducer so the live HUD, the halftime
 *  pop, the close-out check and the final resolution all read ONE source.) */
export const FINALE_ALLY_EDGE = -0.1;
/** The 2v2 opponents play as a scramble PAIR — far stronger than a lone rival — so their per-golfer edge
 *  is scaled DOWN from the row's `rivalEdge`. */
export const FINALE_OPP_EDGE_SCALE = 0.5;

/** The live/final state of a MATCHPLAY Sigil (singles Ch.3 / 2v2 Ch.5), one shape for both. */
export interface SigilMatch {
  kind: 'singles' | 'team';
  res: StorySinglesMatchResult | StoryMatchResult;
  /** The featured rival (singles: the opponent; team: the lead opposing face). */
  rival: EffectiveRival;
  /** 2v2 only: the full finale matchup (ally + opposing pair). */
  matchup?: FinaleMatchup;
}

/**
 * The match state of a matchplay Sigil through the holes played so far (GS-story-sigil-live, pure).
 * Feeds the SAME resolvers the final resolution uses on the SAME streams, so the live HUD, the per-hole
 * reveal, the halftime pop, the mid-round close-out AND the finished recap always agree to the hole.
 * `undefined` for a non-matchplay Sigil. Pass every played hole's strokes in order.
 */
export function sigilMatchThrough(
  t: StoryTournament,
  story: StoryState | undefined,
  playerHoleStrokes: readonly number[],
  seed: string,
  pars: readonly number[],
  /** GS-story-sigil5-play: `teamPlayed` = the played strokes are already the TEAM's scramble score (the
   *  round was played with the interactive/auto scramble armed — ally ball hit + better kept per shot),
   *  so the resolver must NOT fold an ally ghost on top. Absent/false = the legacy ghost fold, so every
   *  pre-existing caller/save is byte-identical.
   *  GS-story-sigil5-npc: `chosenAllyId` = the player's finale partner pick (carried on
   *  `run.storyTournamentPartner`), so the live HUD, the reveal and the resolution all resolve the SAME
   *  chosen ally as the lobby. Absent ⇒ the deterministic default (loyal friend / excluded champion). */
  opts?: { teamPlayed?: boolean; chosenAllyId?: string },
): SigilMatch | undefined {
  const rival = tournamentRival(t, story);
  if (isSinglesMatchTournament(t)) {
    return { kind: 'singles', rival, res: resolveStorySinglesMatch(playerHoleStrokes, rival.id, t.rivalEdge, seed, pars) };
  }
  if (isTeamMatchTournament(t) && story) {
    const m = finaleMatchup(story, story.activeCaddyId, opts?.chosenAllyId);
    const res = resolveStory2v2Match(
      playerHoleStrokes,
      m.allyId,
      FINALE_ALLY_EDGE,
      m.oppIds,
      t.rivalEdge * FINALE_OPP_EDGE_SCALE,
      seed,
      pars,
      'scramble',
      opts?.teamPlayed === true,
    );
    return { kind: 'team', rival, res, matchup: m };
  }
  return undefined;
}

/** The partners you may pick for a team Sigil — your three friend golfers (id + short name). */
export function teamPartnerPool(story: StoryState): { id: string; name: string }[] {
  return otherGolferIds(story).map((id) => ({ id, name: getCharacter(id)?.shortName ?? id }));
}

/** The friend chosen for a team Sigil (from `run.storyTournamentPartner`), defaulting to your first
 *  tour-mate so a tee-off always has a partner even if the picker was skipped. */
export function teamPartnerOrDefault(story: StoryState, chosen?: string): string {
  const pool = otherGolferIds(story);
  return chosen && pool.includes(chosen) ? chosen : pool[0] ?? story.characterId;
}

/** Your partner's mild HELP edge in a team major (they're a friend on your side, not the cult rival). */
export const TEAM_PARTNER_EDGE = 0.05;

/** How sharply the rando also-ran pairs play (slightly UNDER the field — beatable filler). */
const RANDO_PAIR_EDGE = -0.06;

/** Low-tier "rando" pair ghosts — the team field's also-rans (flavour ids; the `edge` sets difficulty). */
const RANDO_PAIRS: readonly { id: string; name: string; golferIds: readonly [string, string] }[] = [
  { id: 'rando-a', name: 'The Weekend Pair', golferIds: ['tour-rook-a', 'tour-rook-b'] },
  { id: 'rando-b', name: 'The Journeymen', golferIds: ['tour-jour-a', 'tour-jour-b'] },
];

/** The rival's first name/handle for a pair label ("Venoma …" from 'Venoma "the Viper" Krait'). */
function rivalHandle(rivalName: string): string {
  return rivalName.split(' ')[0] ?? rivalName;
}

/**
 * The opposing PAIRS in a team Sigil (GS-story-partners): the RIVAL's pair (the chapter rival + a Coil
 * partner, the sharpest), two low-tier rando pairs, and the two NON-chosen friends as a pair — so whoever
 * you leave out still shows up across the tee (and, later, the one you never pick is the odd-one-out
 * betrayer). `partnerId` is your chosen partner; the field excludes them (they're with you).
 */
export function teamFieldPairs(t: StoryTournament, story: StoryState, partnerId: string): OpposingPair[] {
  const pairs: OpposingPair[] = [
    { id: 'rival', name: `${rivalHandle(t.rivalName)} & Fang`, golferIds: [t.rivalId, 'coil-acolyte'], edge: t.rivalEdge },
  ];
  for (const r of RANDO_PAIRS) pairs.push({ id: r.id, name: r.name, golferIds: r.golferIds, edge: RANDO_PAIR_EDGE });
  const nonChosen = otherGolferIds(story).filter((id) => id !== partnerId);
  if (nonChosen.length >= 2) {
    const names = nonChosen.map((id) => getCharacter(id)?.shortName ?? id);
    pairs.push({ id: 'friends', name: `${names[0]} & ${names[1]}`, golferIds: [nonChosen[0]!, nonChosen[1]!], edge: FRIEND_FIELD_EDGE });
  }
  return pairs;
}

/** The competitor IDENTITIES for the pre-round hype (GS-story-tournament-field) — the rival + your three
 *  friends, WITHOUT grosses (no course needed yet). Used by the tournament intro/lobby to show who's in the
 *  field before you tee off. */
export function tournamentCompetitors(
  t: StoryTournament,
  protagonistId?: string,
  rival?: EffectiveRival,
): { id: string; name: string; kind: 'rival' | 'friend' }[] {
  const rid = rival?.id ?? t.rivalId;
  const out: { id: string; name: string; kind: 'rival' | 'friend' }[] = [
    { id: rid, name: rival?.name ?? t.rivalName, kind: 'rival' },
  ];
  for (const c of CHARACTERS) {
    if (c.id === protagonistId || c.id === rid) continue;
    out.push({ id: c.id, name: c.shortName, kind: 'friend' });
  }
  return out;
}

/** The full FINISHED leaderboard: the field + you, sorted low gross first (ties keep the player ahead). A
 *  pure display helper for the victory scoreboard. `playerName`/`playerGross` are your real round. */
export function tournamentLeaderboard(
  field: readonly FieldGolfer[],
  playerName: string,
  playerGross: number,
): FieldGolfer[] {
  const rows: FieldGolfer[] = [...field, { id: '__player__', name: playerName, gross: playerGross, kind: 'player' }];
  return rows.sort((a, b) => a.gross - b.gross || (a.kind === 'player' ? -1 : b.kind === 'player' ? 1 : 0));
}

/**
 * GS-story-balance: the milestone CREDIT BONUS a Sigil win pays on TOP of the round pay (the FIRST win of
 * each Sigil only). Winning the majors is where the campaign's escalating spend (a grown bag, the finale
 * arsenal ~1300 cr) gets funded — five Sigils × this ≈ the finale floor — so the tournaments feel like the
 * paydays they should be, not just another ~200-cr round. Applied in `resolveStoryTournament`.
 */
export const SIGIL_WIN_BONUS = 250;

/**
 * Record a tournament WIN (pure): bank the Sigil (idempotent), advance the chapter (so the next cluster of
 * worlds unlocks), capped at `STORY_CHAPTER_COUNT`. Winning the fifth Sigil leaves `keyToOtherRealm` true →
 * `storyComplete` (the finale/ending layer reads that). Immutable.
 */
export function winTournament(story: StoryState, t: StoryTournament): StoryState {
  const trophyIds = story.trophyIds.includes(t.sigilId) ? story.trophyIds : [...story.trophyIds, t.sigilId];
  const chapter = Math.min(STORY_CHAPTER_COUNT, Math.max(story.chapter, t.chapter + 1));
  return { ...story, trophyIds, chapter };
}

/** How many Sigils are in hand. */
export function sigilCount(story: StoryState): number {
  return STORY_TOURNAMENTS.filter((t) => story.trophyIds.includes(t.sigilId)).length;
}
