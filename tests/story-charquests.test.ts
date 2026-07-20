/**
 * GS-story-charquests — each friend's SIGNATURE quest, unlocked by PARTNERING them in a team Sigil.
 * Pure model + the reducer claim + the friend-card slot + heraldQuestHook robustness (shared list).
 */
import { describe, it, expect } from 'vitest';
import {
  CHARACTER_QUESTS,
  characterQuest,
  partneredCharacter,
  characterQuestOfferable,
  characterQuestClaimed,
  claimCharacterQuest,
  characterQuestMarker,
  everyGolferHasCharacterQuest,
} from '../src/sim/rpg/characterQuests';
import { defaultStoryState, storyBagClubs, type StoryState } from '../src/sim/rpg/story';
import { heraldQuestHook } from '../src/sim/rpg/storyQuests';
import { friendInspectOverlayHTML } from '../src/render/storyCastOverlay';
import { initState, reduce } from '../src/ui/game';
import { setState } from '../src/app/ctx';
import { storyLockerScreen } from '../src/app/storyLockerScreens';

const base = (over: Partial<StoryState> = {}): StoryState => ({ ...defaultStoryState('feather-fade'), ...over });

describe('GS-story-charquests — the model', () => {
  it('every playable golfer has a signature quest with a resolvable reward club', () => {
    expect(everyGolferHasCharacterQuest()).toBe(true);
    for (const id of Object.keys(CHARACTER_QUESTS)) {
      expect(characterQuest(id)!.rewardClubId).toBe(characterQuestMarker(id));
    }
  });

  it('partnering a friend in a Sigil opens their quest; the protagonist never has one', () => {
    const s = base({ sigil1Partner: 'longshot-larry' });
    expect(partneredCharacter(s, 'longshot-larry')).toBe(true);
    expect(characterQuestOfferable(s, 'longshot-larry')).toBe(true);
    // not partnered → not offerable yet
    expect(characterQuestOfferable(s, 'backspin-bo')).toBe(false);
    // the protagonist has no quest
    expect(characterQuestOfferable(s, 'feather-fade')).toBe(false);
  });

  it('claiming grants + equips the signature club and marks it done (idempotent)', () => {
    const s = base({ sigil2Partner: 'backspin-bo' });
    expect(characterQuestClaimed(s, 'backspin-bo')).toBe(false);
    const claimed = claimCharacterQuest(s, 'backspin-bo');
    expect(characterQuestClaimed(claimed, 'backspin-bo')).toBe(true);
    expect(claimed.ownedClubIds).toContain('charquest:backspin-bo');
    // it's in the bag now (a real, resolvable club)
    expect(storyBagClubs(claimed).some((c) => c.name.includes('Portland Check'))).toBe(true);
    // claiming again is a no-op (no double-grant)
    expect(claimCharacterQuest(claimed, 'backspin-bo')).toBe(claimed);
  });

  it('claiming an un-partnered friend is a no-op', () => {
    const s = base();
    expect(claimCharacterQuest(s, 'longshot-larry')).toBe(s);
  });
});

describe('GS-story-charquests — reducer + card', () => {
  it('the claimCharacterQuest action grants the club through the reducer', () => {
    const hub = reduce(reduce(initState('seed'), { type: 'openStory' }), { type: 'selectCharacter', characterId: 'feather-fade' });
    const s = { ...hub, story: { ...hub.story!, sigil1Partner: 'huang-woo-hook' } };
    const after = reduce(s, { type: 'claimCharacterQuest', charId: 'huang-woo-hook' });
    expect(after.story!.completedQuestIds).toContain('charquest:huang-woo-hook');
    expect(after.story!.ownedClubIds).toContain('charquest:huang-woo-hook');
  });

  it('the friend card shows the offer once partnered, then the claimed badge', () => {
    const partnered = base({ sigil1Partner: 'longshot-larry' });
    const offer = friendInspectOverlayHTML('longshot-larry', partnered, 0);
    expect(offer).toContain('claimCharacterQuest');
    expect(offer).toContain('Perth Bomb');
    const claimed = claimCharacterQuest(partnered, 'longshot-larry');
    const done = friendInspectOverlayHTML('longshot-larry', claimed, 0);
    expect(done).toContain('in your bag');
    expect(done).not.toContain('claimCharacterQuest');
  });

  it('a not-yet-partnered friend is nudged to partner them first', () => {
    const html = friendInspectOverlayHTML('backspin-bo', base(), 0);
    expect(html).toMatch(/partner/i);
  });

  it('tapping a claimed charquest club in the locker raises ITS card, not the green starter (bug fix)', () => {
    // A friend's signature club (`charquest:backspin-bo` → a Solar gap wedge) was mis-mapped by the locker
    // to `plain:GW`, so its chip inspected as the green starter card. It must now inspect as itself.
    const hub = reduce(reduce(initState('seed'), { type: 'openStory' }), { type: 'selectCharacter', characterId: 'feather-fade' });
    const partnered = { ...hub, story: { ...hub.story!, sigil2Partner: 'backspin-bo' } };
    const claimed = reduce(partnered, { type: 'claimCharacterQuest', charId: 'backspin-bo' });
    // The reducer must ACCEPT inspecting the raw charquest id (it was rejected as a dead tap before).
    const inspect = reduce(reduce(claimed, { type: 'openStoryLocker' }), {
      type: 'storyInspectItem',
      itemId: 'charquest:backspin-bo',
    });
    expect(inspect.storyItemInspectId).toBe('charquest:backspin-bo');
    // And the locker renders the signature card (name + ally-gift tag), NOT the green "Starter" card.
    setState(inspect);
    const html = storyLockerScreen();
    expect(html).toContain('Portland Check'); // the signature name
    expect(html).not.toContain('Starter · '); // never the plain green starter card
  });
});

describe('GS-story-charquests — heraldQuestHook ignores charquest markers', () => {
  it('finds the first CADDY quest even when a charquest marker is earlier in the list', () => {
    // GS-story-reward-variety: the hook reads the first CLUB-reward Warden quest (Dan now gives a ship
    // part, so it skips his marker) — Sandy's wedge is a club still swung in the bag.
    const s = base({
      alignment: 'herald',
      completedQuestIds: ['charquest:longshot-larry', 'quest-sandy'],
      equippedBagIds: ['quest:sandy'],
    });
    const hook = heraldQuestHook(s);
    expect(hook).toBeTruthy();
    expect(hook!.stillUsing).toBe(true);
  });
});
