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
import { CHARACTERS } from './characters';
import {
  STORY_WORLDS,
  STORY_CHAPTER_COUNT,
  worldCleared,
  type StoryState,
  type StoryWorld,
  type StoryAlignment,
} from './story';

/** A chapter's Galaxy Tournament (content-as-data). */
export interface StoryTournament {
  /** The chapter this tournament closes (1..STORY_CHAPTER_COUNT). Winning it advances to `chapter + 1`. */
  chapter: number;
  /** GS-story-chapters: back-half tournaments (Ch.4–5) come in two ALIGNMENT variants (warden/herald);
   *  Ch.1–3 are the shared trunk (no alignment). `tournamentForChapter` picks the row for the path. */
  alignment?: StoryAlignment;
  /** The venue course id (one of the chapter's worlds). */
  venueId: string;
  name: string;
  host: string;
  /** The rival to beat for the Sigil — an id fed to the ghost model, and a display name. */
  rivalId: string;
  rivalName: string;
  /** How sharply the rival plays (per-hole stroke edge; scales up the deeper the chapter). */
  rivalEdge: number;
  /** Clear this many of the chapter's worlds before the tournament opens. */
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
  /** Host/rival flavour for the tournament lobby (lore-card style). */
  intro: string[];
}

// The five Sigils, in chapter order (the winnable trunk over the current chapter-gated worlds).
export const STORY_TOURNAMENTS: readonly StoryTournament[] = [
  {
    chapter: 1,
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
      'Beat the club’s champion, Birdie Bianchi, over eighteen and your first Sigil of the Game is yours.',
      '🦜 "One Sigil in the Keystone, champion — one stone against the day the World-Eater wakes. It starts here. Play it true."',
    ],
  },
  {
    chapter: 2,
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
      '🦜 "That’s the Coil, champion — a cult that wants the serpent awake. Beat her. This is where it ' +
        'stops being a game."',
      'Two Sigils would lock the root deeper. The Coil knows it too — which is why the Viper came to take this one from you.',
    ],
  },
  {
    chapter: 3,
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
        'He will try to make you understand. Out-play him in the gale and the Storm Sigil is yours.',
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
    rivalId: 'venoma',
    rivalName: 'Venoma "the Viper" Krait',
    rivalEdge: 0.23,
    unlockAfterClears: 2,
    sigilId: 'sigil-abyssal',
    sigilName: 'The Abyssal Sigil',
    prize: 'The Radiant Warden Cruiser — a celestial ship, awarded to the victor.',
    rewardShipId: 'warden-cruiser',
    intro: [
      'Not a show — a vigil. At the edge of a black hole the Coil is trying to wake a lesser dreamer, and ' +
        'the Wardens play the Sagittarius Core to hold it down. Venoma hunts you openly now — but her ' +
        'taunts have cracks; she is afraid of what she serves.',
      'Hold the vigil, beat the Viper, and take the Abyssal Sigil.',
      'The eye at the root is half-open now. Every Sigil you set both locks the seal and forges the key that could break it — and only the fourth or fifth will tell which. Play like the dark is watching. It is.',
    ],
  },
  {
    chapter: 4,
    alignment: 'herald',
    venueId: 'ocean-18',
    name: 'The Drowning Rite',
    host: 'Sister Ecdysis',
    rivalId: 'penelope',
    rivalName: 'Penelope',
    rivalEdge: 0.23,
    unlockAfterClears: 2,
    sigilId: 'sigil-drowned',
    sigilName: 'The Drowned Sigil',
    prize: 'The Coil Wyrm-Ship — a corrupted serpent-hull, power with a price.',
    rewardShipId: 'wyrm-ship',
    intro: [
      'You wear the Coil’s mark now, and Sister Ecdysis — the Shedmaker, who forges the cult’s cursed ' +
        'relics from serpent-scale — presides over your rite. At the Eridanus Atolls you desecrate a ' +
        'Warden shrine to drown its wards — and the Warden sent to stop you is Penelope, who once read ' +
        'your putts. She does not recognise the golfer you have become.',
      'Play the rite, put your old friend to the sword, and take the Drowned Sigil.',
      '🐦‍⬛ "Four Sigils, and the serpent exhales a little deeper. This is the drowning, Herald — the first world you take FOR the Long Rest instead of against it. It should feel like a sin. That feeling is how you know it is working."',
    ],
  },
  // ── Chapter 5 — the fifth Sigil, per route (both forge the key) ──
  {
    chapter: 5,
    alignment: 'warden',
    venueId: 'swamp-18',
    name: 'The Serpent’s Vigil',
    host: 'The Fairway Wardens',
    rivalId: 'venoma',
    rivalName: 'Venoma "the Viper" Krait',
    rivalEdge: 0.29,
    unlockAfterClears: 2,
    sigilId: 'sigil-vigil',
    sigilName: 'The Serpent’s Seal',
    prize: 'The Star-Blessed Ball — clean and true. The fifth Sigil forges the key to the finale.',
    intro: [
      'The acid shrine of Hydra Mire, where the Coil means to complete their rite. You storm it to lock ' +
        'the last seal — and Venoma waits, the doubt in her finally cracking. Beat her here and you may ' +
        'yet win her back from the Coil.',
      'Play the shrine true, redeem the Viper, and take the last Sigil.',
      'Five Sigils forge the Green Key — and above the mire the sky is already cracking. Win here and Ragnarök stops at the door; the key becomes a lock you carry down to the root to seal it forever.',
    ],
  },
  {
    chapter: 5,
    alignment: 'herald',
    venueId: 'derelict-18',
    name: 'The Ghost Harvest',
    host: 'The Coil',
    rivalId: 'driver-dan',
    rivalName: 'Driver Dan',
    rivalEdge: 0.29,
    unlockAfterClears: 2,
    sigilId: 'sigil-ascension',
    sigilName: 'The Serpent’s Fang',
    prize: 'The Coil anoints you its Herald. The fifth Sigil forges the key to the finale.',
    intro: [
      'The Ghost Wreck, where the Coil harvests the dead — and the last Wardens who might stop you make ' +
        'their stand. Driver Dan, your first caddy, stands on the tee against you with everything he has ' +
        'left. There is no going back from what you do here.',
      'Crush the old man, complete the rite, and be anointed the Coil’s Herald.',
      '🐦‍⬛ "The fifth Sigil, Herald, and the Green Key is yours — not to lock the root, but to OPEN it. Ragnarök has a hand on the door now, and that hand is yours. Take it. Let the tired universe rest."',
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

/** All of a chapter's worlds (from the chapter-gated list). */
export function chapterWorlds(chapter: number): StoryWorld[] {
  return STORY_WORLDS.filter((w) => w.unlockChapter === chapter);
}

/** How many of a chapter's worlds the player has cleared. */
export function worldsClearedInChapter(story: StoryState, chapter: number): number {
  return chapterWorlds(chapter).filter((w) => worldCleared(story, w.courseId)).length;
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
  return worldsClearedInChapter(story, story.chapter) >= t.unlockAfterClears ? t : undefined;
}

/** Is a tournament ready to enter from the clubhouse? */
export function tournamentUnlocked(story: StoryState): boolean {
  return !!currentTournament(story);
}

/** The rival's ghost gross total over the venue's pars (deterministic from the round seed). */
export function rivalTotal(t: StoryTournament, seed: string, pars: readonly number[]): number {
  return rivalTotalThrough(t, seed, pars, pars.length);
}

/** The rival's ghost gross through the FIRST `upto` holes (deterministic; same per-hole draws as the full
 *  total, so a partial standing is consistent with the finish). Used by the halftime pop (GS-story-tournament-midpop). */
export function rivalTotalThrough(t: StoryTournament, seed: string, pars: readonly number[], upto: number): number {
  const form = golferForm(t.rivalId, `${seed}:form`);
  const n = Math.max(0, Math.min(pars.length, upto));
  let total = 0;
  for (let i = 0; i < n; i++) total += ghostHoleStrokes(t.rivalId, `${seed}:${i}`, pars[i]!, form, t.rivalEdge);
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
): FieldGolfer[] {
  const out: FieldGolfer[] = [
    { id: t.rivalId, name: t.rivalName, gross: rivalTotal(t, seed, pars), kind: 'rival' },
  ];
  for (const c of CHARACTERS) {
    if (c.id === protagonistId) continue;
    // Don't duplicate a friend who is also this tournament's named rival (rivals are cult NPCs, not the
    // playable four — but guard anyway so the board never lists someone twice).
    if (c.id === t.rivalId) continue;
    out.push({ id: c.id, name: c.shortName, gross: friendTotal(c.id, seed, pars), kind: 'friend' });
  }
  return out;
}

/** The competitor IDENTITIES for the pre-round hype (GS-story-tournament-field) — the rival + your three
 *  friends, WITHOUT grosses (no course needed yet). Used by the tournament intro/lobby to show who's in the
 *  field before you tee off. */
export function tournamentCompetitors(t: StoryTournament, protagonistId?: string): { id: string; name: string; kind: 'rival' | 'friend' }[] {
  const out: { id: string; name: string; kind: 'rival' | 'friend' }[] = [
    { id: t.rivalId, name: t.rivalName, kind: 'rival' },
  ];
  for (const c of CHARACTERS) {
    if (c.id === protagonistId || c.id === t.rivalId) continue;
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
