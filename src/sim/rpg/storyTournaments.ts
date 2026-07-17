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
import {
  STORY_WORLDS,
  STORY_CHAPTER_COUNT,
  worldCleared,
  type StoryState,
  type StoryWorld,
} from './story';

/** A chapter's Galaxy Tournament (content-as-data). */
export interface StoryTournament {
  /** The chapter this tournament closes (1..STORY_CHAPTER_COUNT). Winning it advances to `chapter + 1`. */
  chapter: number;
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
  /** The signature prize blurb (the actual prize item is a later hook). */
  prize: string;
  /** Host/rival flavour for the tournament lobby (lore-card style). */
  intro: string[];
}

// The five Sigils, in chapter order (the winnable trunk over the current chapter-gated worlds).
export const STORY_TOURNAMENTS: readonly StoryTournament[] = [
  {
    chapter: 1,
    venueId: 'verdant-18',
    name: 'The Emerald Invitational',
    host: 'The Lyra Golf Club',
    rivalId: 'tour-birdie',
    rivalName: 'Birdie Bianchi',
    rivalEdge: 0.12,
    unlockAfterClears: 2,
    sigilId: 'sigil-emerald',
    sigilName: 'The Emerald Sigil',
    prize: 'The Verdant Wood — a reliable fairway wood, your first real reward.',
    intro: [
      'The rookie major. Green fairways, a warm twin-sun, and a gallery that still thinks this is just ' +
        'golf. It isn’t — but today you can pretend, and win your first Sigil of the Game.',
      'Beat the club’s champion, Birdie Bianchi, over eighteen and the Emerald Sigil is yours.',
    ],
  },
  {
    chapter: 2,
    venueId: 'inferno-18',
    name: 'The Forge Masters',
    host: 'Master Cinderwright',
    rivalId: 'venoma',
    rivalName: 'Venoma "the Viper" Krait',
    rivalEdge: 0.22,
    unlockAfterClears: 2,
    sigilId: 'sigil-ember',
    sigilName: 'The Ember Sigil',
    prize: 'The Forgefire Driver — reborn in the fire, longer than anything you own.',
    intro: [
      'The anvil-world of Orion. Halfway through, an uninvited golfer strides onto the tee: Venoma "the ' +
        'Viper" Krait, the Coil’s prodigy, playing a ball that hisses as it flies.',
      '🦜 "That’s the Coil, champion — a cult that wants the serpent awake. Beat her. This is where it ' +
        'stops being a game."',
    ],
  },
  {
    chapter: 3,
    venueId: 'tempest-18',
    name: 'The Storm Championship',
    host: 'A shadow tournament — the Coil',
    rivalId: 'venoma',
    rivalName: 'Venoma "the Viper" Krait',
    rivalEdge: 0.33,
    unlockAfterClears: 2,
    sigilId: 'sigil-storm',
    sigilName: 'The Storm Sigil',
    prize: 'The Galewarden Irons — control clubs that read the wind true.',
    intro: [
      'The tour "postponed" it; the Coil runs a shadow tournament in the eye of the Dragon’s storm, and ' +
        'you crash it to take the Sigil before they can corrupt it. The rough itself seems to move.',
      'Out-play Venoma in the gale and the Storm Sigil is yours — the third of five.',
    ],
  },
  {
    chapter: 4,
    venueId: 'void2-18',
    name: 'The Abyssal Vigil',
    host: 'The Fairway Wardens',
    rivalId: 'venoma',
    rivalName: 'Venoma "the Viper" Krait',
    rivalEdge: 0.42,
    unlockAfterClears: 2,
    sigilId: 'sigil-abyssal',
    sigilName: 'The Abyssal Sigil',
    prize: 'A radiant Warden cruiser and celestial gear await the victor.',
    intro: [
      'Not a show — a vigil. At the edge of a black hole the Coil is trying to wake a lesser dreamer, and ' +
        'the Wardens play the Sagittarius Core to hold it down. Venoma hunts you openly now — but her ' +
        'taunts have cracks; she is afraid of what she serves.',
      'Hold the vigil, beat the Viper, and take the Abyssal Sigil.',
    ],
  },
  {
    chapter: 5,
    venueId: 'swamp-18',
    name: 'The Serpent’s Seal',
    host: 'The Coil’s rite',
    rivalId: 'venoma',
    rivalName: 'Venoma "the Viper" Krait',
    rivalEdge: 0.5,
    unlockAfterClears: 2,
    sigilId: 'sigil-serpent',
    sigilName: 'The Serpent’s Seal',
    prize: 'The Star-Blessed Ball — clean, true, and the fifth Sigil forges the key to the finale.',
    intro: [
      'The acid shrine of Hydra Mire, where the Coil means to complete their rite. You storm it and play ' +
        'the shrine true to lock the last seal, Venoma across the tee one final time.',
      'Win here and all five Sigils are yours — and the key to the serpent’s root is forged.',
    ],
  },
];

/** The tournament that closes a given chapter, if any. */
export function tournamentForChapter(chapter: number): StoryTournament | undefined {
  return STORY_TOURNAMENTS.find((t) => t.chapter === chapter);
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

/** The tournament available RIGHT NOW — the current chapter's, if unwon and enough worlds are cleared. */
export function currentTournament(story: StoryState): StoryTournament | undefined {
  const t = tournamentForChapter(story.chapter);
  if (!t || tournamentWon(story, t)) return undefined;
  return worldsClearedInChapter(story, story.chapter) >= t.unlockAfterClears ? t : undefined;
}

/** Is a tournament ready to enter from the clubhouse? */
export function tournamentUnlocked(story: StoryState): boolean {
  return !!currentTournament(story);
}

/** The rival's ghost gross total over the venue's pars (deterministic from the round seed). */
export function rivalTotal(t: StoryTournament, seed: string, pars: readonly number[]): number {
  const form = golferForm(t.rivalId, `${seed}:form`);
  let total = 0;
  for (let i = 0; i < pars.length; i++) total += ghostHoleStrokes(t.rivalId, `${seed}:${i}`, pars[i]!, form, t.rivalEdge);
  return total;
}

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
