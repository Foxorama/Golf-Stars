import { describe, it, expect } from 'vitest';
import { initState, reduce } from '../src/ui/game';
import { DEFAULT_CHARACTER_ID } from '../src/sim/rpg/characters';
import { defaultStoryState } from '../src/sim/rpg/story';
import { hasStory, loadStory, writeStory, clearStory, exportStory, importStory } from '../src/save/storyStore';

describe('Story Mode entry flow (GS-story-save wiring)', () => {
  it('New campaign: title → openStory (no save) → pick golfer → hub with a fresh StoryState', () => {
    const s0 = initState('seed'); // no story loaded
    expect(s0.story).toBeUndefined();

    const picker = reduce(s0, { type: 'openStory' });
    expect(picker.screen).toBe('character');
    expect(picker.pendingStoryNew).toBe(true);
    expect(picker.story).toBeUndefined();

    const hub = reduce(picker, { type: 'selectCharacter', characterId: 'backspin-bo' });
    expect(hub.screen).toBe('story');
    expect(hub.pendingStoryNew).toBe(false);
    expect(hub.story?.characterId).toBe('backspin-bo');
    expect(hub.story?.chapter).toBe(0);
    // A story new-game must NOT build a run — the placeholder run is untouched (no golfer baked in).
    expect(hub.run.loadout.characterId).toBeFalsy();
  });

  it('Continue: with a loaded campaign, openStory goes straight to the hub (no golfer pick)', () => {
    const story = defaultStoryState('feather-fade');
    const s0 = initState('seed', {}, undefined, story);
    expect(s0.story?.characterId).toBe('feather-fade');

    const hub = reduce(s0, { type: 'openStory' });
    expect(hub.screen).toBe('story');
    expect(hub.pendingStoryNew).toBeFalsy();
    expect(hub.story).toBe(story);
  });

  it('exitStory returns to the title and keeps the campaign in state', () => {
    const story = defaultStoryState();
    const hub = { ...initState('seed', {}, undefined, story), screen: 'story' as const };
    const back = reduce(hub, { type: 'exitStory' });
    expect(back.screen).toBe('title');
    expect(back.story).toBe(story);
  });

  it('storyNewCampaign from the hub re-opens the golfer picker (overwrites only on completion)', () => {
    const story = defaultStoryState('feather-fade');
    const hub = { ...initState('seed', {}, undefined, story), screen: 'story' as const };
    const picker = reduce(hub, { type: 'storyNewCampaign' });
    expect(picker.screen).toBe('character');
    expect(picker.pendingStoryNew).toBe(true);
    // The old campaign is still present until a new golfer is picked.
    expect(picker.story?.characterId).toBe('feather-fade');
    const fresh = reduce(picker, { type: 'selectCharacter', characterId: 'longshot-larry' });
    expect(fresh.story?.characterId).toBe('longshot-larry');
  });

  it('defaults the protagonist select screen distinctly from the other modes (single golfer, story flag)', () => {
    const s0 = initState('seed');
    const picker = reduce(s0, { type: 'openStory' });
    // The wiring that makes the render show "Play as / Story Mode" keys off pendingStoryNew.
    expect(picker.pendingStoryNew).toBe(true);
    expect(picker.screen).toBe('character');
    // The default-golfer fallback still resolves to a real character.
    const hub = reduce(picker, { type: 'selectCharacter', characterId: DEFAULT_CHARACTER_ID });
    expect(hub.story?.characterId).toBe(DEFAULT_CHARACTER_ID);
  });
});

describe('storyStore persistence (GS-story-save wiring)', () => {
  it('degrades safely with no localStorage (Node): no-ops, never throws', () => {
    // In the node test env localStorage is undefined, so the store degrades to no-ops.
    expect(hasStory()).toBe(false);
    expect(loadStory()).toBeNull();
    expect(writeStory(defaultStoryState())).toBe(false);
    expect(() => clearStory()).not.toThrow();
  });

  it('export/import round-trips a campaign through JSON', () => {
    const story = { ...defaultStoryState('feather-fade'), credits: 750, chapter: 2, trophyIds: ['a', 'b'] };
    const json = exportStory(story);
    const back = importStory(json);
    expect(back).toEqual(story);
  });
});
