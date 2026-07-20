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
  NAMED_STORY_CLUBS,
  storyRewardSetIds,
  resolveStoryClub,
  storyClubType,
  type StoryState,
} from '../src/sim/rpg/story';
import { DEFAULT_SHIP_ID } from '../src/sim/rpg/ships';
import { DEFAULT_CHARACTER_ID } from '../src/sim/rpg/characters';
import { COURSE_EFFECTS, EFFECT_PATCH, effectWindMult, effectCarryMult, type CourseEffectId } from '../src/sim/rpg/effects';

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

    it('recordWorldClear with recordBest=false banks credits + cleared but leaves worldBest (GS-story-quality D)', () => {
      let s = defaultStoryState();
      s = recordWorldClear(s, 'w1', { toPar: -2, strokes: 70, par: 72, seed: 'x' }, 200); // 18-hole best
      // a 9-hole quest round on the same world would post a lower toPar over a par-36 course — but must NOT
      // overwrite the stored 18-hole best; credits + cleared still apply.
      s = recordWorldClear(s, 'w1', { toPar: -6, strokes: 30, par: 36, seed: 'q' }, 120, false);
      expect(s.credits).toBe(320);
      expect(worldCleared(s, 'w1')).toBe(true);
      expect(s.worldBest['w1']?.toPar).toBe(-2); // unchanged — the 18-hole record stands
      expect(s.worldBest['w1']?.par).toBe(72);
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

    it('storyWorldEffect gives each world a varied, PURE-PHYSICS sky — calm early, stormy deep (GS-story-weather-variety)', () => {
      // Every world's sky is a valid CourseEffect, keyed to the WORLD (stable across revisits → records-safe).
      for (const w of STORY_WORLDS) {
        const e = storyWorldEffect(w.courseId) as CourseEffectId;
        expect(COURSE_EFFECTS[e], `${w.courseId} → ${e} is a real effect`).toBeTruthy();
        // PURE PHYSICS only — no ground-patch / tent effect that would alter the layout or fairness.
        expect(EFFECT_PATCH[e], `${e} scatters no ground patches`).toBeUndefined();
        expect(e).not.toBe('tradeMarket');
        expect(e).not.toBe('meteorShower');
      }
      // The Earth prologue (off-chart) plays clear skies.
      expect(storyWorldEffect(PROLOGUE_COURSE_ID)).toBe('none');
      // Deterministic (a world's sky never changes → its `worldBest` stays comparable).
      expect(storyWorldEffect('swamp-18')).toBe(storyWorldEffect('swamp-18'));

      const windOf = (id: string) => effectWindMult(storyWorldEffect(id));
      const carryOf = (id: string) => effectCarryMult(storyWorldEffect(id));
      const inChapter = (ch: number) => STORY_WORLDS.filter((w) => w.unlockChapter === ch);

      // (1) NEW-PLAYER FIX: every Chapter 1–2 world is CALM — wind at or below neutral, carry never dragged.
      for (const w of [...inChapter(1), ...inChapter(2)]) {
        expect(windOf(w.courseId), `${w.courseId} early wind ≤ 1`).toBeLessThanOrEqual(1);
        expect(carryOf(w.courseId), `${w.courseId} early carry ≥ 1`).toBeGreaterThanOrEqual(1);
      }
      // (2) VARIETY: the campaign is not a wind ladder — plenty of distinct skies, several with NO wind bump.
      const skies = new Set(STORY_WORLDS.map((w) => storyWorldEffect(w.courseId)));
      expect(skies.size).toBeGreaterThanOrEqual(6);
      const nonWind = STORY_WORLDS.filter((w) => windOf(w.courseId) <= 1);
      expect(nonWind.length).toBeGreaterThanOrEqual(6);
      // (3) DIFFICULTY RAMP: the deep worlds blow the wildest skies; the early ones the calmest.
      const maxWind = (ch: number) => Math.max(...inChapter(ch).map((w) => windOf(w.courseId)));
      expect(maxWind(5)).toBeGreaterThan(maxWind(1));
      expect(maxWind(5)).toBeGreaterThanOrEqual(maxWind(3));
      expect(maxWind(1)).toBeLessThanOrEqual(1); // the opening cluster never blows harder than neutral
      expect(storyWorldEffect('swamp-18')).toBe('ionStorm'); // the Ch.5 shrine still blows the wildest sky
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

    it('a Ch.5 caddy world charts EARLY (Ch.4) so its friend is gatherable in time, but stays a Ch.5 tournament (GS-story-gather-early)', () => {
      const derelict = storyWorldById('derelict-18')!; // Driver Dan waits here
      const swamp = storyWorldById('swamp-18')!; // Mystic Mole waits here
      // Both chart at Chapter 4 (a full chapter before the finale) — not Chapter 5.
      for (const w of [derelict, swamp]) {
        expect(storyWorldUnlocked(w, 3)).toBe(false); // still hidden through Ch.3 (pre-Choice)
        expect(storyWorldUnlocked(w, 4)).toBe(true); // charts at Ch.4 — time to recruit + quest
        expect(storyWorldUnlocked(w, 5)).toBe(true);
      }
      // …but their TOURNAMENT tier is UNCHANGED — still Chapter 5 (difficulty/weather/qualifier/payout read this).
      expect(storyWorldChapter('derelict-18')).toBe(5);
      expect(storyWorldChapter('swamp-18')).toBe(5);
      expect(storyWorldEffect('derelict-18')).toBe('ionStorm'); // still braves the wildest sky
      // cetus-18 (no caddy) is left alone — it still charts only at Chapter 5.
      const cetus = storyWorldById('cetus-18')!;
      expect(storyWorldUnlocked(cetus, 4)).toBe(false);
      expect(storyWorldUnlocked(cetus, 5)).toBe(true);
      // An ordinary world charts exactly at its unlock chapter (chartChapter defaults to unlockChapter).
      const desert = storyWorldById('desert-18')!;
      expect(desert.chartChapter).toBeUndefined();
      expect(storyWorldUnlocked(desert, 0)).toBe(false);
      expect(storyWorldUnlocked(desert, 1)).toBe(true);
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

    it('migrateStory backfills caddiedRoundIds and keeps only well-formed ids (GS-story-caddy-rep)', () => {
      expect(migrateStory({}).caddiedRoundIds).toEqual([]); // absent → empty (no reputation yet)
      expect(migrateStory({ caddiedRoundIds: ['driver-dan', 3, null, 'sandy-sandsaver'] }).caddiedRoundIds).toEqual([
        'driver-dan',
        'sandy-sandsaver',
      ]);
      expect(defaultStoryState().caddiedRoundIds).toEqual([]);
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

    it('migrateStory backfills qualifierResults and keeps only well-formed entries (GS-story-qualifiers)', () => {
      expect(migrateStory({}).qualifierResults).toEqual({});
      const kept = migrateStory({
        qualifierResults: { 'verdant2-18': { place: 3, field: 16 }, bad: { place: 'x' }, none: 5, 'no-field': { place: 2 } },
      });
      expect(kept.qualifierResults['verdant2-18']).toEqual({ place: 3, field: 16 });
      expect(kept.qualifierResults['no-field']).toEqual({ place: 2, field: 0 }); // field defaults when missing
      expect(kept.qualifierResults.bad).toBeUndefined(); // non-numeric place dropped
      expect(kept.qualifierResults.none).toBeUndefined(); // non-object dropped
    });
  });
});

describe('named quest-reward clubs (GS-story-quest-club)', () => {
  it('every ally-gift club carries its OWN name into the bag and is the SAME (legendary) tier — parity', () => {
    for (const [id, def] of Object.entries(NAMED_STORY_CLUBS)) {
      const club = resolveStoryClub(id);
      expect(club, `${id} resolves`).toBeTruthy();
      // the BAG shows the signature name, not the generic set name ("Solar Storm Sand Wedge")
      expect(club!.name).toBe(def.name);
      // parity: no ally's gift is a lower tier than another's
      expect(club!.rarity).toBe('legendary');
      // dedupe still keys off the base club TYPE
      expect(storyClubType(id)).toBe(def.base.split(':')[2]);
    }
  });

  it("the ally CLUB gifts are all equal tier (the reported parity bug)", () => {
    // GS-story-reward-variety: Dr Chipinski now gifts a healing BALL (gear), not a club, so parity is
    // checked across the caddy quests whose reward is still a club (Sandy's wedge vs Penelope's putter).
    expect(resolveStoryClub('quest:sandy')!.rarity).toBe(resolveStoryClub('quest:penelope')!.rarity);
    expect(resolveStoryClub('quest:sandy')!.name).toBe("Sand-Saver's Second");
    expect(resolveStoryClub('quest:penelope')!.name).toBe('The Star-Reader');
  });

  it('the Galewarden Irons is a matched SET of three irons (GS-story-quality) — single clubs grant just one', () => {
    const set = storyRewardSetIds('major:storm');
    expect(set).toEqual(['major:storm', 'major:storm:7i', 'major:storm:9i']);
    // each resolves to a distinct iron TYPE (5/7/9), all legendary
    const types = set.map((id) => storyClubType(id));
    expect(new Set(types)).toEqual(new Set(['5i', '7i', '9i']));
    for (const id of set) expect(resolveStoryClub(id)!.rarity).toBe('legendary');
    // a non-set reward grants only itself
    expect(storyRewardSetIds('major:emerald')).toEqual(['major:emerald']);
    expect(storyRewardSetIds('quest:sandy')).toEqual(['quest:sandy']);
  });
});
