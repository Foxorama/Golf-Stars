import { describe, it, expect } from 'vitest';
import {
  STORY_QUESTS,
  questForCaddy,
  questWorld,
  questOfferable,
  questBeatPending,
  acceptQuest,
  completeQuest,
  activeQuest,
  questDone,
} from '../src/sim/rpg/storyQuests';
import { STORY_CADDY_STOCK } from '../src/sim/rpg/storyCaddies';
import { defaultStoryState, resolveStoryClub } from '../src/sim/rpg/story';
import { staticCourseSpec, regenerateStaticCourse } from '../src/sim/course/staticCourseSpecs';

function withCaddy(caddyId: string, over: Record<string, unknown> = {}) {
  // A world cleared ELSEWHERE (past the GS-story-quest-beat gate) AND a round carried with this caddy (past
  // the GS-story-caddy-rep gate) so the quest is offerable by default; the beat/rep tests override those to
  // exercise the "just recruited" holds.
  return {
    ...defaultStoryState('feather-fade'),
    hiredCaddyIds: [caddyId],
    activeCaddyId: caddyId,
    caddiedRoundIds: [caddyId],
    chapter: 5,
    clearedWorldIds: ['standrews-18'],
    ...over,
  };
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
    // GS-story-quality (GAP2): a Herald has turned on the Warden friends — their loyal quests are gone
    const herald = { ...ready, alignment: 'herald' as const };
    expect(questOfferable(herald, 'driver-dan')).toBe(false);
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

  it('GS-story-quest-9: every quest world builds a valid, distinct 9-hole quest layout', () => {
    for (const q of STORY_QUESTS) {
      const world = questWorld(q)!;
      const spec = staticCourseSpec(world)!;
      // regenerateStaticCourse re-validates fairness + throws on an unfair hole, so this proves each
      // venue can compose a fair NINE-hole quest round.
      const c = regenerateStaticCourse({ ...spec, seed: `${spec.seed}:quest`, opts: { ...spec.opts, holes: 9 } });
      expect(c.holes.length, `${world} quest holes`).toBe(9);
    }
  });

  it('GS-story-caddy-rep: holds the offer until you have carried the bag with this ally at least once', () => {
    // Recruited + chapter reached + cleared elsewhere, but NEVER caddied a round with Dan → no offer yet.
    const notYet = withCaddy('driver-dan', { chapter: 3, caddiedRoundIds: [] });
    expect(questOfferable(notYet, 'driver-dan')).toBe(false);
    expect(questBeatPending(notYet, 'driver-dan')).toBe(true); // "put them on the bag for a round first"
    expect(acceptQuest(notYet, 'quest-dan')).toBe(notYet); // can't accept before the reputation round
    // Carry the bag with Dan for a round → the reputation gate clears and the quest opens.
    const rapport = { ...notYet, caddiedRoundIds: ['driver-dan'] };
    expect(questOfferable(rapport, 'driver-dan')).toBe(true);
    expect(questBeatPending(rapport, 'driver-dan')).toBe(false);
    // A round carried with a DIFFERENT caddy does not build Dan's reputation.
    const someoneElse = { ...notYet, caddiedRoundIds: ['sandy-sandsaver'] };
    expect(questOfferable(someoneElse, 'driver-dan')).toBe(false);
  });

  it('GS-story-quest-beat: holds the offer until you have played on elsewhere', () => {
    const world = questWorld(questForCaddy('driver-dan')!)!; // derelict-18
    // recruited + chapter reached, but the ONLY world cleared is the ally's own home world → wait a beat
    const justRecruited = withCaddy('driver-dan', { chapter: 3, clearedWorldIds: [world] });
    expect(questOfferable(justRecruited, 'driver-dan')).toBe(false);
    expect(questBeatPending(justRecruited, 'driver-dan')).toBe(true);
    expect(acceptQuest(justRecruited, 'quest-dan')).toBe(justRecruited); // can't accept during the beat
    // fly on, clear somewhere else → the quest opens up (and the beat is no longer pending)
    const movedOn = { ...justRecruited, clearedWorldIds: [world, 'standrews-18'] };
    expect(questOfferable(movedOn, 'driver-dan')).toBe(true);
    expect(questBeatPending(movedOn, 'driver-dan')).toBe(false);
  });
});
