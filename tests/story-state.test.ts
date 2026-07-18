import { describe, it, expect } from 'vitest';
import {
  STORY_VERSION,
  STORY_CHAPTER_COUNT,
  DEFAULT_STORY_BAG,
  defaultStoryState,
  migrateStory,
  storyBagClubs,
  worldUnlocked,
  worldCleared,
  hasTrophy,
  keyToOtherRealm,
  unlockWorlds,
  addCredits,
  recordWorldClear,
  defaultBagIsValid,
  completeStoryRound,
  storyRoundCredits,
  storyWorldChapter,
  storyWorldEffect,
  CHAPTER_CREDIT_STEP,
  REVISIT_CREDIT_MULT,
  PROLOGUE_COURSE_ID,
  STORY_WORLDS,
  storyWorldUnlocked,
  storyWorldById,
  storyComplete,
  type StoryState,
} from '../src/sim/rpg/story';
import { DEFAULT_SHIP_ID } from '../src/sim/rpg/ships';
import { DEFAULT_CHARACTER_ID } from '../src/sim/rpg/characters';

describe('story-state model (GS-story-save)', () => {
  it('a fresh campaign starts with the green bag, the station wagon, an empty purse, chapter 0', () => {
    const s = defaultStoryState('backspin-bo');
    expect(s.version).toBe(STORY_VERSION);
    expect(s.characterId).toBe('backspin-bo');
    expect(s.credits).toBe(0);
    expect(s.chapter).toBe(0);
    expect(s.equippedBagIds).toEqual([...DEFAULT_STORY_BAG]);
    expect(s.ownedClubIds).toEqual([...DEFAULT_STORY_BAG]);
    expect(s.ownedShipIds).toEqual([DEFAULT_SHIP_ID]);
    expect(s.equippedShipId).toBe(DEFAULT_SHIP_ID);
    expect(s.trophyIds).toEqual([]);
    expect(s.hiredCaddyIds).toEqual([]);
  });

  it('defaults to the canonical protagonist when none given', () => {
    expect(defaultStoryState().characterId).toBe(DEFAULT_CHARACTER_ID);
  });

  it('the default green bag is a valid subset of the club taxonomy and resolves to real clubs', () => {
    expect(defaultBagIsValid()).toBe(true);
    const clubs = storyBagClubs(defaultStoryState());
    expect(clubs).toHaveLength(DEFAULT_STORY_BAG.length);
    expect(clubs.map((c) => c.id)).toEqual([...DEFAULT_STORY_BAG]);
    expect(clubs.find((c) => c.id === 'putter')).toBeTruthy();
  });

  describe('migrateStory is defensive', () => {
    it('coerces garbage / null / partial blobs to a well-formed state', () => {
      expect(migrateStory(null).version).toBe(STORY_VERSION);
      expect(migrateStory(undefined).version).toBe(STORY_VERSION);
      expect(migrateStory(42).ownedShipIds).toEqual([DEFAULT_SHIP_ID]);
      expect(migrateStory('nope').equippedBagIds).toEqual([...DEFAULT_STORY_BAG]);
      const partial = migrateStory({ characterId: 'longshot-larry', credits: 500 });
      expect(partial.characterId).toBe('longshot-larry');
      expect(partial.credits).toBe(500);
      expect(partial.chapter).toBe(0);
    });

    it('round-trips a full state through JSON', () => {
      let s = defaultStoryState('feather-fade');
      s = addCredits(s, 1200);
      s = unlockWorlds(s, ['hydra-mire', 'orion-forge']);
      s = { ...s, trophyIds: ['t1'], hiredCaddyIds: ['prognostic-parrot'], activeCaddyId: 'prognostic-parrot' };
      s = recordWorldClear(s, 'hydra-mire', { toPar: -3, strokes: 69, par: 72, seed: 'abc' }, 300);
      const round = migrateStory(JSON.parse(JSON.stringify(s)));
      expect(round).toEqual(s);
    });

    it('clamps an out-of-range chapter and strips bad ids', () => {
      const s = migrateStory({ chapter: 99, unlockedWorldIds: ['a', 3, null, 'b'], trophyIds: 'nope' });
      expect(s.chapter).toBe(STORY_CHAPTER_COUNT);
      expect(s.unlockedWorldIds).toEqual(['a', 'b']);
      expect(s.trophyIds).toEqual([]);
    });

    it('always keeps the equipped ship in the owned list', () => {
      const s = migrateStory({ equippedShipId: 'racer-redline', ownedShipIds: ['racer-redline'] });
      expect(s.ownedShipIds).toContain(DEFAULT_SHIP_ID);
      expect(s.ownedShipIds).toContain('racer-redline');
    });
  });

  describe('progression helpers are immutable and correct', () => {
    it('unlockWorlds is idempotent and additive', () => {
      const s0 = defaultStoryState();
      const s1 = unlockWorlds(s0, ['w1', 'w2']);
      expect(worldUnlocked(s1, 'w1')).toBe(true);
      expect(s0.unlockedWorldIds).toEqual([]); // original untouched
      const s2 = unlockWorlds(s1, ['w2', 'w3']);
      expect(s2.unlockedWorldIds).toEqual(['w1', 'w2', 'w3']);
      expect(unlockWorlds(s2, ['w1'])).toBe(s2); // no change → same ref
    });

    it('addCredits floors at zero', () => {
      const s = addCredits(defaultStoryState(), 100);
      expect(s.credits).toBe(100);
      expect(addCredits(s, -1000).credits).toBe(0);
    });

    it('recordWorldClear marks cleared, pays, and keeps the better score', () => {
      let s = defaultStoryState();
      s = recordWorldClear(s, 'w1', { toPar: 2, strokes: 74, par: 72, seed: 'x' }, 200);
      expect(worldCleared(s, 'w1')).toBe(true);
      expect(s.credits).toBe(200);
      expect(s.worldBest['w1']?.toPar).toBe(2);
      // a better round replaces the stored best; credits still accrue
      s = recordWorldClear(s, 'w1', { toPar: -1, strokes: 71, par: 72, seed: 'y' }, 50);
      expect(s.credits).toBe(250);
      expect(s.worldBest['w1']?.toPar).toBe(-1);
      // a worse round keeps the stored best
      s = recordWorldClear(s, 'w1', { toPar: 5, strokes: 77, par: 72, seed: 'z' }, 10);
      expect(s.worldBest['w1']?.toPar).toBe(-1);
      expect(s.clearedWorldIds).toEqual(['w1']); // still just once
    });

    it('storyRoundCredits pays more under par and floors at 100', () => {
      expect(storyRoundCredits(0)).toBe(200);
      expect(storyRoundCredits(-4)).toBe(260);
      expect(storyRoundCredits(10)).toBe(100); // floored
    });

    it('storyRoundCredits scales by the WORLD difficulty tier and drops to a top-up on a revisit (GS-story-econ2)', () => {
      // An empty context is byte-for-byte the classic flat pay (no regression).
      expect(storyRoundCredits(0, {})).toBe(storyRoundCredits(0));
      expect(storyRoundCredits(-4, { chapter: 1 })).toBe(260);
      // A harder (later) world pays more: Ch.5 = ×(1 + 4·step).
      expect(storyRoundCredits(0, { chapter: 5 })).toBe(Math.round(200 * (1 + CHAPTER_CREDIT_STEP * 4)));
      expect(storyRoundCredits(0, { chapter: 3 })).toBeGreaterThan(storyRoundCredits(0, { chapter: 1 }));
      // A revisit pays only the top-up fraction (kills the grind-the-easiest-world loop).
      expect(storyRoundCredits(0, { chapter: 1, revisit: true })).toBe(Math.round(200 * REVISIT_CREDIT_MULT));
      expect(storyRoundCredits(0, { chapter: 5, revisit: true })).toBeLessThan(storyRoundCredits(0, { chapter: 5 }));
      // A hard first-clear beats an easy grind: Ch.5 first clear >> Ch.1 revisit — hard worlds are worth it.
      expect(storyRoundCredits(0, { chapter: 5 })).toBeGreaterThan(storyRoundCredits(-4, { chapter: 1, revisit: true }));
    });

    it('storyWorldChapter reads a world tier and falls back to 1 off the chart (GS-story-econ2)', () => {
      expect(storyWorldChapter('verdant-18')).toBe(1); // Ch.1 world
      expect(storyWorldChapter('swamp-18')).toBe(5); // Ch.5 shrine
      expect(storyWorldChapter(PROLOGUE_COURSE_ID)).toBe(1); // Earth prologue — off the chart
      expect(storyWorldChapter('not-a-world')).toBe(1);
    });

    it('storyWorldEffect stiffens the wind by world tier — deep worlds harder, not just longer (GS-story-worlddiff)', () => {
      // Ch.1 worlds + the Earth prologue play calm; the sky rises to the wildest storm by Ch.5.
      expect(storyWorldEffect('verdant-18')).toBe('none');
      expect(storyWorldEffect(PROLOGUE_COURSE_ID)).toBe('none');
      expect(storyWorldEffect('swamp-18')).toBe('ionStorm'); // Ch.5
      // Rising, and only ever from the PURE wind/carry set (no craters / lies / tents that would alter the
      // layout or fairness) — a fair, readable difficulty, records-safe.
      const PURE_WIND = new Set(['none', 'solarWind', 'solarStorm', 'dustStorm', 'ionStorm']);
      const tiers = STORY_WORLDS.map((w) => w.unlockChapter);
      const windOf = (e: string) => ({ none: 1, solarWind: 1.15, solarStorm: 1.2, dustStorm: 1.25, ionStorm: 1.35 }[e] ?? 1);
      let prevWind = 0;
      for (let ch = 1; ch <= 5; ch++) {
        const w = STORY_WORLDS.find((x) => x.unlockChapter === ch)!;
        const e = storyWorldEffect(w.courseId);
        expect(PURE_WIND.has(e), `${e} is a pure-wind effect`).toBe(true);
        expect(windOf(e)).toBeGreaterThanOrEqual(prevWind); // monotonically stiffer by tier
        prevWind = windOf(e);
      }
      expect(tiers.length).toBeGreaterThan(0);
    });

    it('completeStoryRound clears the world, pays, keeps best, and advances the prologue chapter', () => {
      const s0 = defaultStoryState('feather-fade');
      expect(s0.chapter).toBe(0);
      const { story, advancedChapter, wasPrologue } = completeStoryRound(
        s0,
        PROLOGUE_COURSE_ID,
        { toPar: -2, strokes: 70, par: 72, seed: 's' },
        storyRoundCredits(-2),
      );
      expect(wasPrologue).toBe(true);
      expect(advancedChapter).toBe(true);
      expect(story.chapter).toBe(1);
      expect(story.clearedWorldIds).toContain(PROLOGUE_COURSE_ID);
      expect(story.credits).toBe(230);
      expect(story.worldBest[PROLOGUE_COURSE_ID]?.toPar).toBe(-2);
    });

    it('completeStoryRound on a non-prologue world clears + pays but does NOT advance the chapter', () => {
      const s0 = { ...defaultStoryState(), chapter: 2 };
      const { story, advancedChapter, wasPrologue } = completeStoryRound(
        s0,
        'orion-forge',
        { toPar: 1, strokes: 73, par: 72, seed: 's' },
        200,
      );
      expect(wasPrologue).toBe(false);
      expect(advancedChapter).toBe(false);
      expect(story.chapter).toBe(2);
      expect(story.clearedWorldIds).toContain('orion-forge');
    });

    it('story worlds chart progressively by chapter (gentle → later)', () => {
      // Chapter 1 opens a starter cluster; chapter 5 opens the serpent's reaches.
      const atCh1 = STORY_WORLDS.filter((w) => storyWorldUnlocked(w, 1));
      const atCh5 = STORY_WORLDS.filter((w) => storyWorldUnlocked(w, 5));
      expect(atCh1.length).toBeGreaterThanOrEqual(2);
      expect(atCh1.length).toBeLessThan(atCh5.length);
      expect(atCh5.length).toBe(STORY_WORLDS.length);
      // Nothing is charted before the prologue (chapter 0).
      expect(STORY_WORLDS.filter((w) => storyWorldUnlocked(w, 0))).toHaveLength(0);
      // Chapter 1 includes the gentle opener, Hydra Mire waits until chapter 5.
      expect(atCh1.some((w) => w.courseId === 'verdant-18')).toBe(true);
      expect(storyWorldUnlocked(storyWorldById('swamp-18')!, 1)).toBe(false);
      expect(storyWorldUnlocked(storyWorldById('swamp-18')!, 5)).toBe(true);
    });

    it('the key to the other realm needs all five trophies', () => {
      const s: StoryState = { ...defaultStoryState(), trophyIds: ['a', 'b', 'c', 'd'] };
      expect(keyToOtherRealm(s)).toBe(false);
      expect(hasTrophy(s, 'a')).toBe(true);
      expect(keyToOtherRealm({ ...s, trophyIds: ['a', 'b', 'c', 'd', 'e'] })).toBe(true);
    });

    it('a fresh campaign is not complete; Star Tour unlocks only on FINALE completion', () => {
      const s = defaultStoryState();
      expect(s.completed).toBe(false);
      expect(storyComplete(s)).toBe(false);
      // only the explicit completion flag (the finale beaten) unlocks it
      expect(storyComplete({ ...s, completed: true })).toBe(true);
      // five Sigils forge the KEY (finale unlocked) but do NOT complete the campaign on their own
      expect(storyComplete({ ...s, trophyIds: ['a', 'b', 'c', 'd', 'e'] })).toBe(false);
    });

    it('migrateStory preserves and defaults the completed flag', () => {
      expect(migrateStory({}).completed).toBe(false);
      expect(migrateStory({ completed: true }).completed).toBe(true);
      expect(migrateStory({ completed: 'yes' }).completed).toBe(false); // only a real true counts
    });

    it('migrateStory preserves a valid alignment and drops junk (GS-story-chapters)', () => {
      expect(migrateStory({}).alignment).toBeUndefined(); // unchosen by default
      expect(migrateStory({ alignment: 'warden' }).alignment).toBe('warden');
      expect(migrateStory({ alignment: 'herald' }).alignment).toBe('herald');
      expect(migrateStory({ alignment: 'nonsense' }).alignment).toBeUndefined();
    });
  });
});
