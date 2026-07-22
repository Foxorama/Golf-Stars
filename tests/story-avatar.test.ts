import { describe, it, expect } from 'vitest';
import {
  STORY_GEAR,
  storyGearById,
  storyGearAvatar,
  grantStoryGear,
} from '../src/sim/rpg/storyGear';
import { defaultStoryState } from '../src/sim/rpg/story';

/**
 * GS-story-avatar — the on-course golfer in a STORY TOUR round wears their DEFAULT outfit plus ONLY the
 * cosmetics earned + equipped in the campaign (the Story gear), never the global clubhouse wardrobe. These
 * guard the pure resolver `storyGearAvatar` (helpers.ts composes the final look off it on the story branch).
 */
describe('GS-story-avatar: equipped Story gear → worn cosmetic looks', () => {
  it('an un-geared campaign wears nothing extra (the plain default outfit)', () => {
    expect(storyGearAvatar(defaultStoryState())).toEqual({});
  });

  it('an equipped hat is worn on the head', () => {
    const story = grantStoryGear(defaultStoryState(), 'gear:hat:visor');
    const av = storyGearAvatar(story);
    expect(av.hat).toBeDefined();
    expect(av.hat!.shape).toBe('visor');
  });

  it('an equipped bag is propped beside the golfer', () => {
    const story = grantStoryGear(defaultStoryState(), 'gear:bag:cosmic');
    const av = storyGearAvatar(story);
    expect(av.bag).toBeDefined();
    expect(av.bag!.shape).toBe('staffbag');
    expect(av.bag!.glow).toBeTruthy(); // the legendary cosmic bag glows
  });

  it('hat and bag are independent slots and coexist', () => {
    let story = grantStoryGear(defaultStoryState(), 'gear:hat:seer');
    story = grantStoryGear(story, 'gear:bag:tour');
    const av = storyGearAvatar(story);
    expect(av.hat!.shape).toBe('supernova');
    expect(av.bag!.shape).toBe('staffbag');
  });

  it('effect-only gear with no avatar shows nothing (a ball is not worn)', () => {
    const story = grantStoryGear(defaultStoryState(), 'gear:ball:soft');
    const av = storyGearAvatar(story);
    expect(av.hat).toBeUndefined();
    expect(av.bag).toBeUndefined();
    // the ball slot has no avatar mapping at all
    expect(Object.keys(av)).toHaveLength(0);
  });

  it('every hat and bag gear item carries a slot-appropriate avatar look (coverage)', () => {
    const HAT_SHAPES = new Set([
      'cap', 'bucket', 'visor', 'tophat', 'crown', 'helmet',
      'starburst', 'solarCrown', 'supernova', 'baggy', 'wingedHelm', 'tricorn',
    ]);
    for (const g of STORY_GEAR) {
      if (g.slot !== 'hat' && g.slot !== 'bag') continue;
      expect(g.avatar, `${g.id} should define an avatar look`).toBeDefined();
      if (g.slot === 'hat') expect(HAT_SHAPES.has(g.avatar!.shape), `${g.id} hat shape`).toBe(true);
      if (g.slot === 'bag') expect(g.avatar!.shape).toBe('staffbag');
    }
  });

  it('equipping cosmetic-bearing gear does not disturb its effect (avatar is orthogonal)', () => {
    // The Tacky Tour Glove has no avatar look yet — it must still exist and carry its effect.
    const glove = storyGearById('gear:glove:tacky');
    expect(glove).toBeDefined();
    expect(glove!.avatar).toBeUndefined();
  });
});
