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

  it('an equipped glove is worn on the grip hand', () => {
    const story = grantStoryGear(defaultStoryState(), 'gear:glove:power');
    const av = storyGearAvatar(story);
    expect(av.glove).toBeDefined();
    expect(av.glove!.shape).toBe('powerglove');
  });

  it('equipped shoes are worn on the feet', () => {
    const story = grantStoryGear(defaultStoryState(), 'gear:shoes:anchor');
    const av = storyGearAvatar(story);
    expect(av.shoes).toBeDefined();
    expect(av.shoes!.shape).toBe('boot');
    expect(av.shoes!.glow).toBeTruthy(); // the legendary void-anchor boots glow
  });

  it('an equipped shaft skins the wielded club', () => {
    const story = grantStoryGear(defaultStoryState(), 'gear:shaft:nova');
    const av = storyGearAvatar(story);
    expect(av.clubSkin).toBeDefined();
    expect(av.clubSkin!.shape).toBe('clubskin');
    expect(av.clubSkin!.glow).toBeTruthy(); // the legendary nova shaft glows
  });

  it('every worn slot (hat/bag/glove/shoes/shaft) carries a slot-appropriate avatar look (coverage)', () => {
    const SHAPES: Record<string, Set<string>> = {
      hat: new Set([
        'cap', 'bucket', 'visor', 'tophat', 'crown', 'helmet',
        'starburst', 'solarCrown', 'supernova', 'baggy', 'wingedHelm', 'tricorn',
      ]),
      bag: new Set(['staffbag']),
      glove: new Set(['glove', 'gauntlet', 'powerglove']),
      shoes: new Set(['shoe', 'boot', 'spikes']),
      shaft: new Set(['clubskin']),
    };
    for (const g of STORY_GEAR) {
      const allowed = SHAPES[g.slot];
      if (!allowed) continue; // the ball slot is effect-only (its cosmetic home is a flight trail)
      expect(g.avatar, `${g.id} should define an avatar look`).toBeDefined();
      expect(allowed.has(g.avatar!.shape), `${g.id} shape ${g.avatar!.shape}`).toBe(true);
    }
  });

  it('the effect-only ball slot carries no worn look', () => {
    for (const g of STORY_GEAR) {
      if (g.slot === 'ball') {
        expect(g.avatar, `${g.id} is effect-only and should not be worn`).toBeUndefined();
      }
    }
    // a Story ball resolves to no worn cosmetic
    const story = grantStoryGear(defaultStoryState(), 'gear:ball:comet');
    expect(storyGearAvatar(story)).toEqual({});
    expect(storyGearById('gear:ball:comet')).toBeDefined();
  });
});
