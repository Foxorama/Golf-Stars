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

describe('Story clubhouse golfer inspect/switch (GS-story-clubhouse)', () => {
  it('the picker opens a golfer overlay; Play as selects them and clears the overlay', () => {
    const picker = reduce(initState('seed'), { type: 'openStory' });
    expect(picker.screen).toBe('character');
    const inspecting = reduce(picker, { type: 'storyInspectGolfer', characterId: 'longshot-larry' });
    expect(inspecting.storyInspectId).toBe('longshot-larry');
    const closed = reduce(inspecting, { type: 'storyCloseInspect' });
    expect(closed.storyInspectId).toBeUndefined();
    // Play as → create the campaign, clear the overlay, land on the hub.
    const hub = reduce(inspecting, { type: 'selectCharacter', characterId: 'longshot-larry' });
    expect(hub.screen).toBe('story');
    expect(hub.storyInspectId).toBeUndefined();
    expect(hub.story?.characterId).toBe('longshot-larry');
  });

  it('from the prologue hub you can switch golfer (chapter 0 only)', () => {
    const story = defaultStoryState('feather-fade');
    const hub = { ...initState('seed', {}, undefined, story), screen: 'story' as const };
    const inspecting = reduce(hub, { type: 'storyInspectGolfer', characterId: 'backspin-bo' });
    expect(inspecting.storyInspectId).toBe('backspin-bo');
    const switched = reduce(inspecting, { type: 'storySwitchGolfer', characterId: 'backspin-bo' });
    expect(switched.story?.characterId).toBe('backspin-bo');
    expect(switched.storyInspectId).toBeUndefined();
    // Switching is blocked once the campaign is underway (chapter > 0).
    const midCampaign = { ...hub, story: { ...story, chapter: 2 } };
    const blocked = reduce(midCampaign, { type: 'storySwitchGolfer', characterId: 'backspin-bo' });
    expect(blocked.story?.characterId).toBe('feather-fade');
  });
});

describe('Story prologue round (GS-story-prologue)', () => {
  it('teeing off the Earth round from the hub → auto-play → resolves into the campaign (chapter 0 → 1)', () => {
    // Enter Story Mode, pick a golfer, land on the hub.
    const hub = reduce(reduce(initState('seed'), { type: 'openStory' }), {
      type: 'selectCharacter',
      characterId: 'longshot-larry',
    });
    expect(hub.screen).toBe('story');
    expect(hub.story?.chapter).toBe(0);

    // Tee off the prologue: build a marked Story round on the Earth course.
    const intro = reduce(hub, { type: 'storyPlayWorld', courseId: 'standrews-18' });
    expect(intro.screen).toBe('intro');
    expect(intro.run.storyRound).toBe(true);
    expect(intro.run.staticCourseId).toBe('standrews-18');
    expect(intro.run.loadout.characterId).toBe('longshot-larry');

    // Auto-play the whole round (watch) → it resolves back INTO the campaign, not the Star Tour boards.
    const done = reduce(intro, { type: 'play' });
    expect(done.screen).toBe('storyResult');
    expect(done.lastStoryRound?.wasPrologue).toBe(true);
    expect(done.lastStoryRound?.advancedChapter).toBe(true);
    expect(done.story?.chapter).toBe(1);
    expect(done.story?.clearedWorldIds).toContain('standrews-18');
    expect((done.story?.credits ?? 0)).toBeGreaterThanOrEqual(100);
    // A Story round never touches the main-save Star Tour record boards.
    expect(done.strokePlayBest).toEqual(hub.strokePlayBest);

    // Continue → back to the hub, recap cleared.
    const back = reduce(done, { type: 'storyRoundContinue' });
    expect(back.screen).toBe('story');
    expect(back.lastStoryRound).toBeUndefined();
    expect(back.story?.chapter).toBe(1);
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
