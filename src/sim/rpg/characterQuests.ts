/**
 * Story Tour — per-CHARACTER partner quests (GS-story-charquests). Your three friends aren't just an
 * aboard-ship cast and finale stakes — each carries a personal QUEST that opens once you SELECT them as a
 * partner in a team Sigil (Scramble Ch.1 / Best-ball Ch.2). Play a major at their side and they open up
 * about where they came from; claim their SIGNATURE club on their clubhouse talk card as thanks.
 *
 * Deliberately LIGHT (the round IS the team Sigil you just played together — no separate quest round, unlike
 * the caddy quests): partnering them is the task, the reward is the bond. Content-as-data — a new golfer's
 * quest is a ROW. Reuses `completedQuestIds` (a `charquest:<id>` marker) so there is NO save bump; the
 * reward club is owned + equipped through the shared club machinery.
 *
 * PURE + DOM-free. The friend talk card (`storyCastOverlay`) renders the offer/claim; the reducer applies it.
 */

import { equipStoryClub, storyRewardBaseId, NAMED_STORY_CLUBS, type StoryState } from './story';
import { CHARACTERS } from './characters';

/** One friend's personal quest (content-as-data). The "task" is having partnered them in a team Sigil. */
export interface CharacterQuest {
  charId: string;
  title: string;
  /** One-line hook shown on the offer. */
  hook: string;
  /** The friend's bond dialogue when they open up (a couple of in-voice lines). */
  bond: readonly string[];
  /** The signature reward-club id (`charquest:<charId>`, resolved via NAMED_STORY_CLUBS). */
  rewardClubId: string;
  rewardName: string;
}

/** The claimed-marker id kept in `completedQuestIds` (so it needs no new save field). */
export function characterQuestMarker(charId: string): string {
  return `charquest:${charId}`;
}

export const CHARACTER_QUESTS: Record<string, CharacterQuest> = {
  'feather-fade': {
    charId: 'feather-fade',
    title: 'The Trade Wind',
    hook: 'Feather wants to show you the line she learned on the Nairobi munis.',
    bond: [
      'You partnered me, so I’ll tell you the secret. Back home the wind never stops — so I stopped fighting it. I aim into the answer instead of the flag.',
      'Take this iron. I bent the face myself, years ago, to ride a crosswind. It only knows one shot, and it’s a true one. Like us, I hope.',
    ],
    rewardClubId: 'charquest:feather-fade',
    rewardName: NAMED_STORY_CLUBS['charquest:feather-fade']!.name,
  },
  'huang-woo-hook': {
    charId: 'huang-woo-hook',
    title: 'The Busan Roar',
    hook: 'Huang-Woo has been dying to tell you the 2 a.m. range story.',
    bond: [
      'You picked ME for the team! Okay, okay — the surgeon irons? Ten thousand balls under the Busan lights, alone, until the shaking stopped and the STAGE started.',
      'This one’s my scalpel. Point it at 165, dead flag, and it does not miss. Everything else about me is a firework — but this? This is precision, from me to you.',
    ],
    rewardClubId: 'charquest:huang-woo-hook',
    rewardName: NAMED_STORY_CLUBS['charquest:huang-woo-hook']!.name,
  },
  'longshot-larry': {
    charId: 'longshot-larry',
    title: 'The Perth Bomb',
    hook: 'Larry reckons you’ve earned the story of the ocean ball.',
    bond: [
      'Good on ya for picking me, mate. First day I met you I put one in the actual ocean and laughed. You laughed too. That’s when I knew.',
      'Here — a driving iron I flattened out to send it LOW and FOREVER. No brakes, no fear, straight past trouble. That’s the whole of me in one club. Go bomb it.',
    ],
    rewardClubId: 'charquest:longshot-larry',
    rewardName: NAMED_STORY_CLUBS['charquest:longshot-larry']!.name,
  },
  'backspin-bo': {
    charId: 'backspin-bo',
    title: 'The Portland Check',
    hook: 'Bo has a quiet thing to share about the rain.',
    bond: [
      'Thank you for the team. The Portland rain taught me patience — you can’t hurry a green, you can only agree with it. I stopped chasing distance and started listening.',
      'This wedge lands soft and asks the ball, kindly, to stay. It’s the quietest club I own. Carry a little of that quiet with you.',
    ],
    rewardClubId: 'charquest:backspin-bo',
    rewardName: NAMED_STORY_CLUBS['charquest:backspin-bo']!.name,
  },
};

/** The quest for a friend (any of the four playable golfers). */
export function characterQuest(charId: string): CharacterQuest | undefined {
  return CHARACTER_QUESTS[charId];
}

/** Did you PARTNER this friend in a team Sigil (Sigil 1 or 2)? — the trigger for their quest. */
export function partneredCharacter(story: StoryState, charId: string): boolean {
  return story.sigil1Partner === charId || story.sigil2Partner === charId;
}

/** Has this friend's signature club already been claimed? */
export function characterQuestClaimed(story: StoryState, charId: string): boolean {
  return story.completedQuestIds.includes(characterQuestMarker(charId));
}

/** Is this friend's quest currently offerable? — partnered, not the protagonist, has a quest, not claimed. */
export function characterQuestOfferable(story: StoryState, charId: string): boolean {
  return (
    charId !== story.characterId &&
    !!CHARACTER_QUESTS[charId] &&
    partneredCharacter(story, charId) &&
    !characterQuestClaimed(story, charId)
  );
}

/**
 * Claim a friend's signature club (pure). Grants + equips the reward club through the shared machinery and
 * records the claim in `completedQuestIds`. A no-op if it isn't offerable (so it can't double-grant).
 */
export function claimCharacterQuest(story: StoryState, charId: string): StoryState {
  if (!characterQuestOfferable(story, charId)) return story;
  const q = CHARACTER_QUESTS[charId]!;
  const owned = story.ownedClubIds.includes(q.rewardClubId)
    ? story
    : { ...story, ownedClubIds: [...story.ownedClubIds, q.rewardClubId] };
  const equipped = equipStoryClub(owned, q.rewardClubId);
  return { ...equipped, completedQuestIds: [...equipped.completedQuestIds, characterQuestMarker(charId)] };
}

/** Every playable golfer has a signature quest whose reward-club id resolves — a coverage invariant. */
export function everyGolferHasCharacterQuest(): boolean {
  return CHARACTERS.every((c) => {
    const q = CHARACTER_QUESTS[c.id];
    return !!q && q.rewardClubId === characterQuestMarker(c.id) && !!storyRewardBaseId(q.rewardClubId);
  });
}
