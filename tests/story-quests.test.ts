import { describe, it, expect } from 'vitest';
import {
  STORY_QUESTS,
  questForCaddy,
  questWorld,
  questOfferable,
  questBeatPending,
  questBeatPendingReason,
  acceptQuest,
  completeQuest,
  activeQuest,
  questDone,
  heraldQuestHook,
} from '../src/sim/rpg/storyQuests';
import { STORY_CADDY_STOCK } from '../src/sim/rpg/storyCaddies';
import { HERALD_CADDY_IDS } from '../src/sim/rpg/storyHeraldCrew';
import { defaultStoryState } from '../src/sim/rpg/story';
import { grantStoryReward, rewardOwned } from '../src/sim/rpg/storyRewards';
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
      // GS-story-reward-variety: the reward (club / gear / ship part / ship) grants cleanly onto a fresh state
      const granted = grantStoryReward(defaultStoryState(), q!.reward);
      expect(rewardOwned(granted, q!.reward), `${q!.id} reward grants`).toBe(true);
      expect(q!.rewardName.length, `${q!.id} reward named`).toBeGreaterThan(0);
    }
    // exactly one quest per ally, ids unique
    expect(new Set(STORY_QUESTS.map((q) => q.id)).size).toBe(STORY_QUESTS.length);
  });

  it('Driver Dan’s quest is the derelict, gated to chapter 3, granting his rig’s salvaged engine (a ship part)', () => {
    const dan = questForCaddy('driver-dan')!;
    expect(dan.minChapter).toBe(3);
    expect(questWorld(dan)).toBe('derelict-18'); // his old rig
    // GS-story-reward-variety: Dan the old trucker hands over his rig's drive core, not a golf club
    expect(dan.reward).toEqual({ kind: 'upgrade', id: 'upg:engine:longhaul' });
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

  it('accept → active; complete → grants the reward, records done, clears active', () => {
    // Dan's reward is a SHIP PART (GS-story-reward-variety): it lands in the fleet, not the bag.
    const ready = withCaddy('driver-dan', { chapter: 3 });
    const accepted = acceptQuest(ready, 'quest-dan');
    expect(accepted.activeQuestId).toBe('quest-dan');
    expect(activeQuest(accepted)?.id).toBe('quest-dan');

    const done = completeQuest(accepted, 'quest-dan');
    expect(done.activeQuestId).toBeUndefined();
    expect(questDone(done, 'quest-dan')).toBe(true);
    // the ship part is owned into the fleet
    expect(done.ownedShipUpgradeIds).toContain('upg:engine:longhaul');

    // completing a non-active quest is a no-op
    expect(completeQuest(done, 'quest-dan')).toBe(done);
  });

  it('a CLUB-reward quest owns + equips its gift into the bag (Sandy → Sand-Saver’s Second)', () => {
    const ready = withCaddy('sandy-sandsaver', { chapter: 2 });
    const done = completeQuest(acceptQuest(ready, 'quest-sandy'), 'quest-sandy');
    expect(questDone(done, 'quest-sandy')).toBe(true);
    expect(done.ownedClubIds).toContain('quest:sandy');
    expect(done.equippedBagIds).toContain('quest:sandy');
  });

  it('a GEAR-reward quest owns + equips its relic into the locker slot (Mole → the Dowser’s Circlet)', () => {
    const ready = withCaddy('mystic-mole', { chapter: 4 });
    const done = completeQuest(acceptQuest(ready, 'quest-mole'), 'quest-mole');
    expect(questDone(done, 'quest-mole')).toBe(true);
    expect(done.ownedGearIds).toContain('gear:hat:dowser');
    expect(done.equippedGear.hat).toBe('gear:hat:dowser');
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

  it('GS-story-herald-quests: every Coil inner-circle caddy has a herald quest with a world + resolvable reward', () => {
    for (const coilId of HERALD_CADDY_IDS) {
      const q = questForCaddy(coilId);
      expect(q, `${coilId} has a quest`).toBeDefined();
      expect(q!.alignment, `${coilId} quest is herald-path`).toBe('herald');
      expect(questWorld(q!), `${coilId} quest names its own world`).toBeTruthy();
      expect(q!.offer.length).toBeGreaterThan(0);
      expect(q!.complete.length).toBeGreaterThan(0);
      const granted = grantStoryReward(defaultStoryState(), q!.reward);
      expect(rewardOwned(granted, q!.reward), `${q!.id} reward grants`).toBe(true);
    }
    // ids stay unique across the whole (Warden + Coil) quest table
    expect(new Set(STORY_QUESTS.map((q) => q.id)).size).toBe(STORY_QUESTS.length);
  });

  it('GS-story-herald-quests: a quest is offerable only on its OWN path (Coil ↔ herald, Warden ↔ light)', () => {
    // A Coil quest: offerable on the Herald path, never on the Warden/undecided path.
    const heraldReady = {
      ...defaultStoryState('feather-fade'),
      alignment: 'herald' as const,
      chapter: 4,
      hiredCaddyIds: ['coil-voss'],
      activeCaddyId: 'coil-voss',
      caddiedRoundIds: ['coil-voss'],
      clearedWorldIds: ['standrews-18'], // elsewhere from void2-18 (Voss's quest world)
    };
    expect(questOfferable(heraldReady, 'coil-voss')).toBe(true);
    // …but the same setup on the undecided/warden path never offers a Coil quest.
    expect(questOfferable({ ...heraldReady, alignment: undefined }, 'coil-voss')).toBe(false);
    // And a Warden caddy's quest is never offerable on the Herald path (they were betrayed).
    const wardenOnHerald = {
      ...defaultStoryState('feather-fade'),
      alignment: 'herald' as const,
      chapter: 3,
      hiredCaddyIds: ['driver-dan'],
      activeCaddyId: 'driver-dan',
      caddiedRoundIds: ['driver-dan'],
      clearedWorldIds: ['standrews-18'],
    };
    expect(questOfferable(wardenOnHerald, 'driver-dan')).toBe(false);
  });

  it('GS-story-herald-quests: the Severing hook reads only a WARDEN caddy quest, never a completed Coil one', () => {
    const base = { ...defaultStoryState('feather-fade'), alignment: 'herald' as const };
    // A Herald who finished a COIL quest but no Warden quest → the betrayal hook has nothing to pull on.
    expect(heraldQuestHook({ ...base, completedQuestIds: ['quest-coil-voss'] })).toBeUndefined();
    // A Herald who completed a Warden caddy quest pre-Choice → the hook names that ally + club.
    const hook = heraldQuestHook({ ...base, completedQuestIds: ['quest-sandy'] });
    expect(hook?.clubName).toBe(questForCaddy('sandy-sandsaver')!.rewardName);
    // A completed Coil quest listed FIRST is skipped in favour of the Warden CLUB one (GS-story-reward-
    // variety: the hook reads a club gift you still swing, so a gear/ship-part quest is skipped too — Sam's
    // Conviction is a club).
    const mixed = heraldQuestHook({ ...base, completedQuestIds: ['quest-coil-voss', 'quest-sam'] });
    expect(mixed?.clubName).toBe(questForCaddy('suggestible-sam')!.rewardName);
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

  it('GS-story-quest-soon-marker: the two held beats are told apart (bag round vs fly on)', () => {
    const world = questWorld(questForCaddy('driver-dan')!)!; // derelict-18
    // Just recruited — never on the bag. A crew-card hint only; the star map shows nothing (a friend you
    // have not played a round with has nothing to show you yet).
    expect(questBeatPendingReason(withCaddy('driver-dan', { chapter: 3, caddiedRoundIds: [] }), 'driver-dan')).toBe('caddy');
    // Carried the bag, but the only world cleared is their own home world → one flight away.
    expect(
      questBeatPendingReason(withCaddy('driver-dan', { chapter: 3, clearedWorldIds: [world] }), 'driver-dan'),
    ).toBe('elsewhere');
    // Ready to offer → no beat held at all.
    expect(questBeatPendingReason(withCaddy('driver-dan', { chapter: 3 }), 'driver-dan')).toBeUndefined();
  });
});
