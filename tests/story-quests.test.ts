import { describe, it, expect } from 'vitest';
import {
  STORY_QUESTS,
  questForCaddy,
  questWorld,
  questOfferable,
  acceptQuest,
  completeQuest,
  activeQuest,
  questDone,
} from '../src/sim/rpg/storyQuests';
import { STORY_CADDY_STOCK } from '../src/sim/rpg/storyCaddies';
import { defaultStoryState, resolveStoryClub } from '../src/sim/rpg/story';

function withCaddy(caddyId: string, over: Record<string, unknown> = {}) {
  return { ...defaultStoryState('feather-fade'), hiredCaddyIds: [caddyId], chapter: 5, ...over };
}

describe('Story ally side quests (GS-story-quests)', () => {
  it('every recruitable ally has a quest → their home world, with a resolvable unique reward club', () => {
    const caddies = new Set(Object.values(STORY_CADDY_STOCK));
    for (const caddyId of caddies) {
      const q = questForCaddy(caddyId);
      expect(q, `${caddyId} has a quest`).toBeDefined();
      expect(questWorld(q!), `${caddyId} quest world`).toBe(
        Object.keys(STORY_CADDY_STOCK).find((w) => STORY_CADDY_STOCK[w] === caddyId),
      );
      expect(q!.offer.length).toBeGreaterThan(0);
      expect(q!.complete.length).toBeGreaterThan(0);
      // the reward is a real, resolvable club
      expect(resolveStoryClub(q!.rewardClubId), `${q!.id} reward resolves`).toBeDefined();
    }
    // exactly one quest per ally, ids unique
    expect(new Set(STORY_QUESTS.map((q) => q.id)).size).toBe(STORY_QUESTS.length);
  });

  it('Driver Dan’s quest is the derelict, gated to chapter 3, granting his driver', () => {
    const dan = questForCaddy('driver-dan')!;
    expect(dan.minChapter).toBe(3);
    expect(questWorld(dan)).toBe('derelict-18'); // his old rig
    expect(dan.rewardClubId).toBe('quest:dan'); // GS-story-quest-club: a NAMED ally-gift club
  });

  it('offerable only when recruited, chapter reached, none active, and not already done', () => {
    const q = questForCaddy('driver-dan')!;
    // not recruited → no offer
    expect(questOfferable(defaultStoryState(), 'driver-dan')).toBe(false);
    // recruited but chapter too low
    expect(questOfferable(withCaddy('driver-dan', { chapter: 1 }), 'driver-dan')).toBe(false);
    // recruited + chapter reached → offerable
    const ready = withCaddy('driver-dan', { chapter: 3 });
    expect(questOfferable(ready, 'driver-dan')).toBe(true);
    // once another quest is active, no new offer
    const busy = { ...ready, activeQuestId: 'quest-sandy' };
    expect(questOfferable(busy, 'driver-dan')).toBe(false);
    // once done, no re-offer
    const done = { ...ready, completedQuestIds: [q.id] };
    expect(questOfferable(done, 'driver-dan')).toBe(false);
  });

  it('accept → active; complete → grants + equips the reward, records done, clears active', () => {
    const ready = withCaddy('driver-dan', { chapter: 3 });
    const accepted = acceptQuest(ready, 'quest-dan');
    expect(accepted.activeQuestId).toBe('quest-dan');
    expect(activeQuest(accepted)?.id).toBe('quest-dan');

    const done = completeQuest(accepted, 'quest-dan');
    expect(done.activeQuestId).toBeUndefined();
    expect(questDone(done, 'quest-dan')).toBe(true);
    // the reward club is owned AND in the equipped bag (the NAMED ally-gift id)
    expect(done.ownedClubIds).toContain('quest:dan');
    expect(done.equippedBagIds).toContain('quest:dan');

    // completing a non-active quest is a no-op
    expect(completeQuest(done, 'quest-dan')).toBe(done);
  });

  it('accept is a no-op when not offerable (wrong chapter, not recruited)', () => {
    const early = withCaddy('driver-dan', { chapter: 1 });
    expect(acceptQuest(early, 'quest-dan')).toBe(early);
  });
});
