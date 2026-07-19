/**
 * Story Tour — your three friends, the aboard-ship CAST (GS-story-cast).
 *
 * Story Mode is single-protagonist, but "gather your friends" was always the pitch: the OTHER three
 * playable golfers are your Earth tour-mates who answered the Parrot's call. This module is the single
 * shared seam for "the roster minus the protagonist" (replacing the three ad-hoc `CHARACTERS.filter(...)`
 * computations in `storyInterlude`, `storyTournaments`, `competition`) PLUS their interactable dialogue —
 * they now stand in the clubhouse + travel aboard the ship, tappable like the Parrot.
 *
 * PURE + DOM-free (no window, no rng): vitest exercises the whole cast model headlessly. The dialogue is
 * CONTENT-AS-DATA (a per-character `CastProfile`) that ADAPTS to campaign state (chapter band + alignment),
 * so a friend's banter tracks the story. Later betrayal chunks (GS-story-betrayer) extend this with
 * partner/betrayer awareness — the profiles here are authored to leave room for that (each carries a
 * distinct first-person voice, so a betrayal line reads in-character).
 *
 * First-person voice throughout: a friend speaks as themselves, so their pronouns never need inflecting in
 * the copy (the UI refers to them by name). Keep it that way when extending — it's the misgendering-proof
 * default the constitution asks for.
 */

import { CHARACTERS, type Character } from './characters';
import type { StoryState } from './story';

/** The three non-protagonist playable golfers, in stable roster order. */
export function otherGolfers(story: StoryState): Character[] {
  return CHARACTERS.filter((c) => c.id !== story.characterId);
}
/** Their ids, stable roster order. */
export function otherGolferIds(story: StoryState): string[] {
  return otherGolfers(story).map((c) => c.id);
}
/** Is this id one of the three non-protagonist playable golfers (a "friend" in the cast)? */
export function isOtherGolfer(story: StoryState, id: string): boolean {
  return id !== story.characterId && CHARACTERS.some((c) => c.id === id);
}
/** Look up a cast character by id (any of the four playable golfers). */
export function castCharacter(id: string): Character | undefined {
  return CHARACTERS.find((c) => c.id === id);
}

/** The chapter BAND a friend's mood tracks: the bright rookie run (1), the Coil creeping in (2–3), and
 *  the fork's aftermath (4–5). Chapter 0 (prologue) reads as band 1. */
function chapterBand(chapter: number): 1 | 2 | 3 {
  if (chapter <= 1) return 1;
  if (chapter <= 3) return 2;
  return 3;
}

/**
 * A friend's authored voice. `tagline` is who they are on your tour (shown under their name); `bond` is a
 * warm line about your friendship; `banter` is their always-available personality pool; `warm`/`wary` are
 * the fork-aware pools — `warm` when you stayed a Warden (they rally to you), `wary` on the Herald path
 * (they can feel you slipping, before they leave). Each pool is first-person and in-voice.
 */
interface CastProfile {
  tagline: string;
  bond: string;
  banter: readonly string[];
  /** Mid-run unease as the Coil surfaces (band 2–3, before The Choice). */
  unease: readonly string[];
  /** Post-Choice, you stayed a Warden — they stand with you. */
  warm: readonly string[];
  /** Post-Choice, you turned Herald — they can feel it, and it frightens them. */
  wary: readonly string[];
}

const CAST: Record<string, CastProfile> = {
  'feather-fade': {
    tagline: 'Your steadiest friend — the calm hand on tour.',
    bond: "We came up together on the Nairobi munis. I still aim two yards right and let the wind do the rest — old habit, good habit.",
    banter: [
      "A fade isn't a weakness, it's a conversation with the wind. Most people just don't listen.",
      "You bomb it, I place it. Between us we've got a whole golfer.",
      "I don't need the pin to move. I need my breathing to slow down. Same thing, really.",
      "Back home they said a girl couldn't out-think this game. I let the scorecard argue for me.",
      "Watch the flag, not the ball. The flag never lies about the wind.",
    ],
    unease: [
      "Something's off in the galleries lately. Those hooded ones don't clap — they just... count.",
      "I keep my head down and my tempo slow. But even I felt the rough MOVE on the Forge. That's not golf.",
    ],
    warm: [
      "Whatever's out there, you aim true and I'll read the wind. That's the whole plan and it's a good one.",
      "The others are scared. I'm not — I've seen you hole out when it mattered. Keep the ball moving.",
    ],
    wary: [
      "You're aiming at flags I can't see anymore. I don't like where you're pointing, and I'm saying so as a friend.",
      "There's a stillness coming off you that wasn't there on Earth. Please tell me I'm imagining the cold.",
    ],
  },
  'huang-woo-hook': {
    tagline: 'Your loudest friend — heart the size of Busan.',
    bond: "You, me, and a bucket of range balls at 2 a.m. in Busan — that's where this all started. I hit the surgeon irons; the driver I just point at the horizon and pray.",
    banter: [
      "My irons are a scalpel. My driver is a firework. You never know which show you're getting!",
      "A snap-hook off the tee is just a draw with FEELINGS, okay?",
      "I play for the gallery. If nobody gasps, did the shot even happen?",
      "Nine iron from 165, dead flag, zero nerves. Give me the driver and suddenly I'm a poet — messy, but sincere.",
      "Win or lose, we get noodles after. That part isn't negotiable.",
    ],
    unease: [
      "The crowd used to cheer. Now half of them wear those cowls and just... hum. It gets in your backswing.",
      "I made a birdie on Draco and NOBODY reacted. That scared me more than the storm did.",
    ],
    warm: [
      "You want a hype man for the end of the universe? I have been training my whole life for this.",
      "We finish this together and I am getting the biggest trophy PHOTO you have ever seen.",
    ],
    wary: [
      "Hey. Hey. Look at me. Where'd my friend go? You're smiling like the Crow smiles now and I hate it.",
      "I'll still get noodles with you. But you have to come back first. Come back, okay?",
    ],
  },
  'longshot-larry': {
    tagline: 'Your wildest friend — all send, no brakes.',
    bond: "Perth to the stars, mate. I met you the day I lost a ball into the actual ocean and laughed about it. Grip it and rip it — the fairway's a suggestion.",
    banter: [
      "Accuracy's for people who can't hit it far enough to not need it. That's my whole philosophy.",
      "Every hole's a par 4 if you're brave enough. Sometimes a par 7. Depends.",
      "I've been in more bunkers than most caddies. I'm basically a geologist.",
      "You want position golf? Wrong friend. I only know one gear and it's WIDE OPEN.",
      "Lost another one into the void. Reckon it's still going. Good for it.",
    ],
    unease: [
      "Reckon I've stopped laughing at the weird stuff. Those cult blokes gave me the willies on the Forge.",
      "I bomb it into the rough and it feels like the rough bombs back now. Not natural, that.",
    ],
    warm: [
      "Point me at the serpent and I'll send one straight down its throat. Farthest drive of me life, guaranteed.",
      "You're the brains, I'm the cannon. Let's go save everything, eh?",
    ],
    wary: [
      "Mate. You've gone quiet. YOU. That's how I know something's proper wrong.",
      "I'll follow you into any bunker on any world. But not into that. Don't make me choose.",
    ],
  },
  'backspin-bo': {
    tagline: 'Your wisest friend — the still centre of the tour.',
    bond: "Portland rain taught me patience; the greens taught me the rest. Land it, let it check, let it settle. The ball always tells you the truth if you wait.",
    banter: [
      "Backspin is just asking the ball, kindly, to change its mind. It usually agrees.",
      "I don't chase distance. Distance is loud. Control is quiet, and quiet wins on Sunday.",
      "Every green is a sentence. The pin is the period. I just read it out loud.",
      "You can't fight a putt. You can only agree with it a little more gracefully.",
      "I'm short off the tee and I've made peace with it. Peace is underrated in this game.",
    ],
    unease: [
      "The greens have started reading WRONG. Not harder — wrong, like the world forgot how it's shaped.",
      "There's a hunger under the mire worlds. I can feel it through my feet on the putting surface. It wants everything to stop.",
    ],
    warm: [
      "Whatever the serpent is, it wants stillness. So we keep the ball moving. That's the whole prayer.",
      "You carry the fire. I'll carry the calm. Between us, we hold the line.",
    ],
    wary: [
      "You've gone still in a way that isn't peace. I know the difference. That stillness is the serpent's, not yours.",
      "I read greens for a living. I'm reading YOU now, and the line breaks somewhere dark. Come back before it does.",
    ],
  },
};

/** A friend's role-tagline for their talk card / plate. */
export function castTagline(id: string): string {
  return CAST[id]?.tagline ?? 'One of your tour-mates.';
}

/**
 * The full rotating banter pool for a friend, ADAPTED to campaign state (immutable, deterministic). Leads
 * with a state-appropriate GREETING (the bond line early, then chapter-band unease, then a fork-aware
 * warm/wary line), followed by their personality banter — so tapping "Another ›" cycles a coherent set that
 * tracks the story. Always non-empty. `alignment` post-Choice picks warm (Warden) vs wary (Herald).
 */
export function castLines(story: StoryState, id: string): string[] {
  const p = CAST[id];
  if (!p) return ['...'];
  const band = chapterBand(story.chapter);
  const lead: string[] = [p.bond];
  if (band >= 2) lead.push(...p.unease);
  if (story.alignment === 'warden') lead.push(...p.warm);
  else if (story.alignment === 'herald') lead.push(...p.wary);
  return [...lead, ...p.banter];
}

/** The banter line at a tap index (wraps). The 0th tap shows the state-appropriate greeting. */
export function castLineAt(story: StoryState, id: string, i: number): string {
  const lines = castLines(story, id);
  return lines[((i % lines.length) + lines.length) % lines.length]!;
}

/** Every playable golfer has an authored cast profile — a cheap coverage invariant for tests. */
export function everyGolferHasCastProfile(): boolean {
  return CHARACTERS.every((c) => !!CAST[c.id]);
}
