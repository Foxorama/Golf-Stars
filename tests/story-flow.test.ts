import { describe, it, expect } from 'vitest';
import { initState, reduce } from '../src/ui/game';
import { DEFAULT_CHARACTER_ID } from '../src/sim/rpg/characters';
import { defaultStoryState, REVISIT_CREDIT_MULT } from '../src/sim/rpg/story';
import { questOfferable, questBeatPending } from '../src/sim/rpg/storyQuests';
import { effectWindMult } from '../src/sim/rpg/effects';
import { playerHoleOpts } from '../src/sim/rpg/run';
import { hasStory, loadStory, writeStory, clearStory, exportStory, importStory } from '../src/save/storyStore';
import { storyWorldServicesHTML, storyRecapServicesHTML, storyServiceBackLabel } from '../src/app/storyServices';
import { tournamentForChapter } from '../src/sim/rpg/storyTournaments';
import { worldHasShop } from '../src/sim/rpg/storyShop';
import { worldIsShipVendor } from '../src/sim/rpg/storyShips';
import type { StoryState } from '../src/sim/rpg/story';
import type { UiState } from '../src/ui/gameState';

/** Dismiss any arrival lore beat(s) so a test can reach the intro — the GS-story-early-beats pass gave the
 *  trunk chapters real arrival dialogue, so "tee off" no longer always lands straight on the intro. */
function pastLore(s: UiState): UiState {
  while (s.screen === 'lore') s = reduce(s, { type: 'dismissLore' });
  return s;
}

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

  it('Continue re-presents The Choice if it was skipped (chapter ≥ 4, no path) (GS-story-quality A)', () => {
    // Won Ch.3 (chapter advanced to 4 + persisted) but quit before dismissing The Choice → alignment unset.
    const skipped = { ...defaultStoryState('feather-fade'), chapter: 4, trophyIds: ['a', 'b', 'c'] };
    const resumed = reduce(initState('seed', {}, undefined, skipped), { type: 'openStory' });
    expect(resumed.screen).toBe('storyChoice');
    // choosing there lands in the hub with the path locked in
    const chosen = reduce(resumed, { type: 'chooseAlignment', alignment: 'herald' });
    expect(chosen.screen).toBe('story');
    expect(chosen.story?.alignment).toBe('herald');
    // a campaign that HAS a path resumes straight to the hub (no spurious re-present)
    const ok = { ...defaultStoryState('feather-fade'), chapter: 4, alignment: 'warden' as const };
    expect(reduce(initState('seed', {}, undefined, ok), { type: 'openStory' }).screen).toBe('story');
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

describe('Story star map (GS-story-map)', () => {
  it('opens the galaxy chart (the Star Tour screen) from the clubhouse and back', () => {
    const story = { ...defaultStoryState('feather-fade'), chapter: 1 };
    const hub = { ...initState('seed', {}, undefined, story), screen: 'story' as const };
    // The star-map navigator REUSES the Star Tour screen (app.ts flags it story-mode).
    const map = reduce(hub, { type: 'openStoryMap' });
    expect(map.screen).toBe('starTour');
    const back = reduce(map, { type: 'exitStoryMap' });
    expect(back.screen).toBe('story');
    expect(back.story).toBe(story);
  });

  it('teeing off a charted world from the map builds a Story round on that course', () => {
    const story = { ...defaultStoryState('feather-fade'), chapter: 1 };
    const map = { ...initState('seed', {}, undefined, story), screen: 'starTour' as const };
    // GS-story-early-beats: the first Chapter-1 arrival opens on the Parrot's true-line lesson.
    const intro = pastLore(reduce(map, { type: 'storyPlayWorld', courseId: 'verdant-18' }));
    expect(intro.screen).toBe('intro');
    expect(intro.run.storyRound).toBe(true);
    expect(intro.run.staticCourseId).toBe('verdant-18');
  });
});

describe('Parrot Bar (GS-story-parrot-bar)', () => {
  function spaceHub(chapter = 2) {
    const story = { ...defaultStoryState('feather-fade'), chapter };
    return { ...initState('seed', {}, undefined, story), screen: 'story' as const };
  }

  it('opens the Crow\'s Nest from the clubhouse (chatter starts on the greeting) and back', () => {
    const hub = spaceHub();
    const bar = reduce(hub, { type: 'openStoryBar' });
    expect(bar.screen).toBe('storyBar');
    expect(bar.storyBarTalk).toBe(0);
    const back = reduce(bar, { type: 'exitStoryBar' });
    expect(back.screen).toBe('story');
    expect(back.storyBarTalk).toBeUndefined();
    expect(back.story).toBe(hub.story); // purely cosmetic — the campaign is untouched
  });

  it('tapping the Parrot advances the chatter counter (no story write)', () => {
    const bar = reduce(spaceHub(), { type: 'openStoryBar' });
    const t1 = reduce(bar, { type: 'parrotBarNext' });
    expect(t1.storyBarTalk).toBe(1);
    const t2 = reduce(t1, { type: 'parrotBarNext' });
    expect(t2.storyBarTalk).toBe(2);
    expect(t2.story).toBe(bar.story);
  });

  it('the bar actions are no-ops off their screens', () => {
    const hub = spaceHub();
    expect(reduce(hub, { type: 'parrotBarNext' })).toBe(hub); // not at the bar
    const bar = reduce(hub, { type: 'openStoryBar' });
    expect(reduce(bar, { type: 'openStoryBar' })).toBe(bar); // already at the bar (screen guard)
  });

  it('the first Chapter-1 visit answers the "meet me at the bar" briefing (GS-story-prologue-beats)', () => {
    // Chapter 1, briefing unanswered → the visit records it (persisted; the clubhouse ❗ pull retires).
    const hub1 = spaceHub(1);
    expect(hub1.story!.seenStoryBeats['story-bar-briefing']).toBeUndefined();
    const bar = reduce(hub1, { type: 'openStoryBar' });
    expect(bar.story!.seenStoryBeats['story-bar-briefing']).toBe(true);
    // a second visit is idempotent (no re-write — same story object)
    const again = reduce({ ...bar, screen: 'story' as const }, { type: 'openStoryBar' });
    expect(again.story).toBe(bar.story);
    // past Chapter 1 the briefing beat never writes (the greeting has moved on)
    const hub2 = spaceHub(2);
    expect(reduce(hub2, { type: 'openStoryBar' }).story).toBe(hub2.story);
  });
});

describe('Story dialogue beats (GS-story-beats)', () => {
  it('teeing off a Chapter-2 story round diverts the intro to the Coil beat, then dismiss continues', () => {
    const story = { ...defaultStoryState('feather-fade'), chapter: 2 };
    const map = { ...initState('seed', {}, undefined, story), screen: 'starTour' as const };
    const lore = reduce(map, { type: 'storyPlayWorld', courseId: 'verdant-18' });
    expect(lore.screen).toBe('lore');
    expect(lore.pendingLoreId).toBe('story-coil-named');
    // The run was still built underneath — dismiss lands on the intro, ready to tee off.
    const after = reduce(lore, { type: 'dismissLore' });
    expect(after.screen).toBe('intro');
    expect(after.run.storyRound).toBe(true);
    // The generic lore machinery records the one-off in `seenLore` (across all runs/modes).
    expect(after.seenLore['story-coil-named']).toBe(true);
  });

  it('the Chapter-4 Warden qualifiers run the DOUBT thread (vow → the betrayer\'s strange question), Herald keeps Venoma (GS-story-doubt)', () => {
    const warden = { ...defaultStoryState('feather-fade'), chapter: 4, alignment: 'warden' as const };
    const mapW = { ...initState('seed', {}, undefined, warden), screen: 'starTour' as const };
    // First Warden arrival after The Choice: the Parrot's vow — naming who has gone quiet.
    const vow = reduce(mapW, { type: 'storyPlayWorld', courseId: 'verdant-18' });
    expect(vow.pendingLoreId).toBe('story-warden-vow');
    // Next arrival: the betrayer's OWN strange question, in their voice (no picks → the fallback odd-one-out).
    const after = reduce(vow, { type: 'dismissLore' });
    const doubt = reduce({ ...after, screen: 'starTour' as const }, { type: 'storyPlayWorld', courseId: 'verdant-18' });
    expect(doubt.pendingLoreId).toMatch(/^story-doubt-/);

    const herald = { ...defaultStoryState('feather-fade'), chapter: 4, alignment: 'herald' as const };
    const mapH = { ...initState('seed', {}, undefined, herald), screen: 'starTour' as const };
    expect(reduce(mapH, { type: 'storyPlayWorld', courseId: 'verdant-18' }).pendingLoreId).toBe('story-venoma-herald');
  });

  it('a Chapter-1 story round opens on the Parrot\'s true-line lesson, then tees off clean (GS-story-early-beats)', () => {
    const story = { ...defaultStoryState('feather-fade'), chapter: 1 };
    const map = { ...initState('seed', {}, undefined, story), screen: 'starTour' as const };
    const beat = reduce(map, { type: 'storyPlayWorld', courseId: 'verdant-18' });
    expect(beat.screen).toBe('lore');
    expect(beat.pendingLoreId).toBe('story-true-line');
    // Once taught, the next Chapter-1 arrival is clean (the omen waits at the Sigil tee-off).
    const after = reduce(beat, { type: 'dismissLore' });
    expect(after.screen).toBe('intro');
    const again = reduce({ ...after, screen: 'starTour' as const }, { type: 'storyPlayWorld', courseId: 'verdant-18' });
    expect(again.screen).toBe('intro');
    expect(again.pendingLoreId).toBeUndefined();
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

describe('Story Pro Shop flow (GS-story-econ)', () => {
  // A campaign at Chapter 1 that has cleared verdant-18 (so its rack is shoppable), on the star map.
  function shoppableMap() {
    const story = {
      ...defaultStoryState('feather-fade'),
      chapter: 1,
      credits: 1000,
      clearedWorldIds: ['standrews-18', 'verdant-18'],
    };
    return { ...initState('seed', {}, undefined, story), screen: 'starTour' as const };
  }

  it('opens a cleared world’s Pro Shop from the map, and closes back to the map', () => {
    const map = shoppableMap();
    const shop = reduce(map, { type: 'openStoryShop', worldId: 'verdant-18' });
    expect(shop.screen).toBe('storyShop');
    expect(shop.storyShopWorldId).toBe('verdant-18');
    const back = reduce(shop, { type: 'exitStoryShop' });
    expect(back.screen).toBe('starTour');
  });

  it('refuses the shop for a world that is not cleared', () => {
    const map = shoppableMap();
    const nope = reduce(map, { type: 'openStoryShop', worldId: 'desert-18' }); // not cleared
    expect(nope.screen).toBe('starTour'); // unchanged
    expect(nope.storyShopWorldId).toBeUndefined();
  });

  it('inspect → buy: spends credits, grows the bag, and closes the card', () => {
    const shop = reduce(shoppableMap(), { type: 'openStoryShop', worldId: 'verdant-18' });
    const inspect = reduce(shop, { type: 'storyInspectItem', itemId: 'club:tour:3W' });
    expect(inspect.storyItemInspectId).toBe('club:tour:3W');

    const bagBefore = shop.story!.equippedBagIds.length;
    const bought = reduce(inspect, { type: 'storyBuyItem', itemId: 'club:tour:3W' });
    expect(bought.story!.credits).toBe(1000 - 180);
    expect(bought.story!.ownedClubIds).toContain('club:tour:3W');
    expect(bought.story!.equippedBagIds.length).toBe(bagBefore + 1); // 3W is a new type
    expect(bought.storyItemInspectId).toBeUndefined(); // card closes on buy

    const closed = reduce(inspect, { type: 'storyCloseItem' });
    expect(closed.storyItemInspectId).toBeUndefined();
  });

  it('the campaign green bag actually tees off into a Story round', () => {
    const shop = reduce(shoppableMap(), { type: 'openStoryShop', worldId: 'verdant-18' });
    const bought = reduce(reduce(shop, { type: 'storyInspectItem', itemId: 'club:tour:3W' }), {
      type: 'storyBuyItem',
      itemId: 'club:tour:3W',
    });
    // Replay verdant-18 from the shop → the round's bag is the campaign's grown green bag (not the
    // golfer's normal common bag), so the bought Planet 3-Wood is in play.
    const intro = pastLore(reduce(bought, { type: 'storyPlayWorld', courseId: 'verdant-18' }));
    expect(intro.screen).toBe('intro');
    expect(intro.run.loadout.bag.some((c) => c.name === 'Planet 3-Wood')).toBe(true);
    // the lean green start: far fewer than a full 14-club common bag
    expect(intro.run.loadout.bag.length).toBeLessThanOrEqual(11);
  });

  it('buying GEAR equips it and folds its effect into the next Story round (GS-story-gear)', () => {
    const shop = reduce(shoppableMap(), { type: 'openStoryShop', worldId: 'verdant-18' });
    // verdant-18's rack carries the Tacky Tour Glove (dispersion ×0.93).
    const inspect = reduce(shop, { type: 'storyInspectItem', itemId: 'gear:glove:tacky' });
    expect(inspect.storyItemInspectId).toBe('gear:glove:tacky');
    const bought = reduce(inspect, { type: 'storyBuyItem', itemId: 'gear:glove:tacky' });
    expect(bought.story!.ownedGearIds).toContain('gear:glove:tacky');
    expect(bought.story!.equippedGear.glove).toBe('gear:glove:tacky');
    expect(bought.storyItemInspectId).toBeUndefined();

    // Tee off → the glove's tighter-dispersion effect is folded onto the round loadout: the geared
    // round's dispersion is exactly 0.93× the un-geared round's.
    const geared = reduce(bought, { type: 'storyPlayWorld', courseId: 'verdant-18' });
    const ungeared = reduce(shop, { type: 'storyPlayWorld', courseId: 'verdant-18' });
    expect(geared.run.loadout.dispersionMult).toBeCloseTo(ungeared.run.loadout.dispersionMult * 0.93, 5);
  });
});

describe('Story qualifying events (GS-story-qualifiers)', () => {
  it('playing a chapter world (not the venue) resolves as a qualifier: a field, a placement, a record', () => {
    const story = { ...defaultStoryState('feather-fade'), chapter: 1 };
    const map = { ...initState('qual-seed', {}, undefined, story), screen: 'starTour' as const };
    // verdant2-18 is a Chapter-1 world and NOT the Emerald venue (verdant-18) → a qualifying event.
    const intro = pastLore(reduce(map, { type: 'storyPlayWorld', courseId: 'verdant2-18' }));
    expect(intro.screen).toBe('intro'); // the Ch.1 arrival beat (if any) dismissed — the round itself is plain
    const done = reduce(intro, { type: 'play' });
    expect(done.screen).toBe('storyResult');
    const q = done.lastStoryRound!.qualifier!;
    expect(q).toBeTruthy();
    expect(q.chapter).toBe(1);
    expect(q.need).toBe(10);
    expect(q.fieldSize).toBe(16);
    expect(q.neededCount).toBe(2);
    expect(q.place).toBeGreaterThanOrEqual(1);
    expect(q.place).toBeLessThanOrEqual(q.fieldSize);
    expect(q.leaderboard.length).toBe(16); // 15 ghosts + you
    expect(q.leaderboard.filter((g) => g.kind === 'player')).toHaveLength(1);
    // the finish is recorded on the campaign for the gate
    expect(done.story!.qualifierResults['verdant2-18']!.place).toBe(q.place);
    expect(q.qualified).toBe(q.place <= q.need);
  });

  it('the Sigil VENUE itself is NOT a qualifier (it is played as the major)', () => {
    const story = { ...defaultStoryState('feather-fade'), chapter: 1 };
    const map = { ...initState('venue-seed', {}, undefined, story), screen: 'starTour' as const };
    const done = reduce(pastLore(reduce(map, { type: 'storyPlayWorld', courseId: 'verdant-18' })), { type: 'play' });
    expect(done.lastStoryRound!.qualifier).toBeUndefined();
  });

  it('a Ch.5 caddy world is chartable at Ch.4 — visited early it is a PLAIN clear (not a Ch.5 qualifier), and its friend recruits in time (GS-story-gather-early)', () => {
    // A Warden in Chapter 4 (post-Choice) flies out to the derelict — Driver Dan's world, a Ch.5 tournament —
    // to gather him a full chapter before the finale.
    const story = { ...defaultStoryState('feather-fade'), chapter: 4, alignment: 'warden' as const, credits: 2000, clearedWorldIds: ['standrews-18'] };
    const map = { ...initState('gather-seed', {}, undefined, story), screen: 'starTour' as const };
    let intro = reduce(map, { type: 'storyPlayWorld', courseId: 'derelict-18' });
    if (intro.screen === 'lore') intro = reduce(intro, { type: 'dismissLore' }); // a deep-world arrival beat may fire
    const played = reduce(intro, { type: 'play' });
    // Visiting it BEFORE reaching its chapter is a plain exploration clear — no out-of-chapter qualifier board.
    expect(played.lastStoryRound!.qualifier).toBeUndefined();
    expect(played.run.staticEffect).toBe('spaceJunk'); // but it still plays under its Chapter-5 sky (wreckage patches)
    expect(played.story!.clearedWorldIds).toContain('derelict-18');
    // Recruit Dan from the world-clear recap — with room left to do his quest before the final battle.
    const hired = reduce(played, { type: 'hireStoryCaddy', worldId: 'derelict-18', caddyId: 'driver-dan' });
    expect(hired.story!.hiredCaddyIds).toContain('driver-dan');
    expect(hired.story!.activeCaddyId).toBe('driver-dan');
  });
});

describe('Story shop/vendor ACCESS — per-world, never a clubhouse buy-anything (GS-story-shop-access)', () => {
  // A campaign that just cleared a world, sitting on the world-clear recap.
  function afterClear(courseId: string, extraCleared: string[] = []) {
    const story = {
      ...defaultStoryState('feather-fade'),
      chapter: 2,
      credits: 3000,
      clearedWorldIds: ['standrews-18', courseId, ...extraCleared],
    };
    return {
      ...initState('seed', {}, undefined, story),
      screen: 'storyResult' as const,
      lastStoryRound: { courseId, toPar: -2, strokes: 70, par: 72, credits: 200, advancedChapter: false, wasPrologue: false },
    };
  }

  it('the Pro Shop opens from the world-clear RECAP and returns to the STAR MAP (GS-story-shop-routing)', () => {
    // The first-time (post-clear) Pro Shop used to dump you back at the clubhouse; now it flies you on to
    // the star map, matching the revisit Pro Shop.
    const recap = afterClear('verdant-18');
    const shop = reduce(recap, { type: 'openStoryShop', worldId: 'verdant-18' });
    expect(shop.screen).toBe('storyShop');
    expect(shop.storyShopWorldId).toBe('verdant-18');
    expect(shop.storyShopReturn).toBe('starTour');
    expect(reduce(shop, { type: 'exitStoryShop' }).screen).toBe('starTour');
  });

  it('the Pro Shop is NOT reachable from the clubhouse (a per-world shop keeps the galaxy big)', () => {
    const hub = { ...afterClear('verdant-18'), screen: 'story' as const };
    expect(reduce(hub, { type: 'openStoryShop', worldId: 'verdant-18' }).screen).toBe('story'); // no-op
  });

  it('a vendor shipyard routes like the Pro Shop beside it — out to the STAR MAP from the recap too', () => {
    // GS-story-venue-services: it used to return to the CLUBHOUSE from the recap while the Pro Shop button
    // right above it flew to the chart, so on the handful of vendor worlds the recap's two services landed
    // in two different places.
    const recap = afterClear('desert-18'); // desert-18 is the Ch.1 ship vendor
    const yard = reduce(recap, { type: 'openStoryShipyard', worldId: 'desert-18' });
    expect(yard.screen).toBe('storyShipyard');
    expect(yard.storyShipyardWorldId).toBe('desert-18');
    expect(yard.storyShipyardReturn).toBe('starTour');
    expect(reduce(yard, { type: 'exitStoryShipyard' }).screen).toBe('starTour');
    // and the shop at the same world agrees
    expect(reduce(recap, { type: 'openStoryShop', worldId: 'desert-18' }).storyShopReturn).toBe('starTour');
  });

  it('opening a vendor shipyard refuses a non-vendor world and an uncleared world', () => {
    const recap = afterClear('verdant-18'); // verdant is a Pro-Shop world, NOT a ship vendor
    expect(reduce(recap, { type: 'openStoryShipyard', worldId: 'verdant-18' }).screen).toBe('storyResult'); // no-op
    // desert-18 IS a vendor, but this campaign hasn't cleared it → still refused.
    expect(reduce(recap, { type: 'openStoryShipyard', worldId: 'desert-18' }).screen).toBe('storyResult'); // no-op
  });

  it('the clubhouse opens the HANGAR (equip-only, no vendor world) and returns to the clubhouse', () => {
    const hub = { ...afterClear('desert-18'), screen: 'story' as const };
    const hangar = reduce(hub, { type: 'openStoryShipyard' }); // no worldId → hangar
    expect(hangar.screen).toBe('storyShipyard');
    expect(hangar.storyShipyardWorldId).toBeUndefined();
    expect(reduce(hangar, { type: 'exitStoryShipyard' }).screen).toBe('story');
  });

  // ── GS-story-venue-services: the SIGIL recap keeps you at the venue ──────────────────────────────
  describe('the Sigil recap offers the venue’s services (GS-story-venue-services)', () => {
    /** A campaign sitting on the just-finished major's recap. The venue is cleared win OR lose — the
     *  resolver banks it through `recordWorldClear` either way. */
    function sigilRecap(venueId: string, won: boolean, extra: Partial<StoryState> = {}): UiState {
      const story: StoryState = {
        ...defaultStoryState('feather-fade'),
        chapter: 3,
        credits: 4000,
        clearedWorldIds: ['standrews-18', venueId],
        ...extra,
      };
      return {
        ...initState('seed', {}, undefined, story),
        screen: 'storyTournamentResult' as const,
        lastStoryTournament: {
          chapter: 2,
          name: 'The Ember Open',
          venueId,
          sigilName: 'The Ember Sigil',
          prize: '',
          rivalName: 'Venoma',
          playerGross: won ? 70 : 74,
          rivalGross: 72,
          won,
          finalSigil: false,
        },
      };
    }

    it('the Pro Shop opens from the recap and hands you BACK to it (the beat chain still has to run)', () => {
      // inferno-18 (Orion Forge) is the Chapter-2 Sigil venue: a Pro Shop AND Dr Chipinski wait there.
      for (const won of [true, false]) {
        const recap = sigilRecap('inferno-18', won);
        const shop = reduce(recap, { type: 'openStoryShop', worldId: 'inferno-18' });
        expect(shop.screen).toBe('storyShop');
        expect(shop.storyShopWorldId).toBe('inferno-18');
        // A DETOUR, not a route: exiting returns to the recap so the ceremony / The Choice / the
        // aftermath / the interlude are never skipped.
        expect(shop.storyShopReturn).toBe('storyTournamentResult');
        const back = reduce(shop, { type: 'exitStoryShop' });
        expect(back.screen).toBe('storyTournamentResult');
        expect(back.lastStoryTournament?.venueId).toBe('inferno-18');
        // …and the continuation is intact from there.
        expect(reduce(back, { type: 'storyTournamentContinue' }).screen).toBe('story');
      }
    });

    it('a vendor Sigil venue opens its shipyard from the recap, back to the recap', () => {
      const recap = sigilRecap('void2-18', true); // Sagittarius Core — a Ch.4 venue AND a ship vendor
      const yard = reduce(recap, { type: 'openStoryShipyard', worldId: 'void2-18' });
      expect(yard.screen).toBe('storyShipyard');
      expect(yard.storyShipyardReturn).toBe('storyTournamentResult');
      expect(reduce(yard, { type: 'exitStoryShipyard' }).screen).toBe('storyTournamentResult');
    });

    it('the friend who waits at a Sigil venue can be recruited from the recap', () => {
      const recap = sigilRecap('inferno-18', true);
      const hired = reduce(recap, { type: 'hireStoryCaddy', worldId: 'inferno-18', caddyId: 'dr-chipinski' });
      expect(hired.story!.hiredCaddyIds).toContain('dr-chipinski');
      expect(hired.screen).toBe('storyTournamentResult'); // recruiting doesn't leave the recap
    });

    it('the recap footer offers exactly what the world stocks — and refuses what it does not', () => {
      const recap = sigilRecap('inferno-18', true);
      const html = storyRecapServicesHTML(recap.story, 'inferno-18');
      expect(html).toContain('openStoryShop');
      expect(html).toContain('dr-chipinski');
      expect(html).not.toContain('openStoryShipyard'); // Orion Forge sells no ships
      // …and the reducer agrees: a shipyard dispatch at a non-vendor venue is a no-op.
      expect(reduce(recap, { type: 'openStoryShipyard', worldId: 'inferno-18' }).screen).toBe('storyTournamentResult');
      // An UNCLEARED world is refused from the recap too (the guard is the same everywhere).
      expect(reduce(recap, { type: 'openStoryShop', worldId: 'crystal-18' }).screen).toBe('storyTournamentResult');
    });

    it('the detour is a DETOUR — it can’t tee off past the major’s beat chain', () => {
      const recap = sigilRecap('inferno-18', true);
      const shop = reduce(recap, { type: 'openStoryShop', worldId: 'inferno-18' });
      // "Play this world again" would strand the ceremony / The Choice / the aftermath / the interlude.
      expect(reduce(shop, { type: 'storyPlayWorld', courseId: 'inferno-18' })).toBe(shop);
      // …while the same button off the normal star-map shop route still works.
      const mapShop = { ...shop, storyShopReturn: 'starTour' as const };
      expect(reduce(mapShop, { type: 'storyPlayWorld', courseId: 'inferno-18' }).screen).not.toBe('storyShop');
    });

    it('a service screen’s back button NAMES where it lands', () => {
      // The label reads the stored return screen, so it can never promise the chart and deliver the
      // clubhouse (which is exactly what the vendor shipyard used to do off the world-clear recap).
      expect(storyServiceBackLabel('starTour')).toMatch(/star chart/i);
      expect(storyServiceBackLabel('storyTournamentResult')).toMatch(/result/i);
      expect(storyServiceBackLabel('story')).toMatch(/clubhouse/i);
      expect(storyServiceBackLabel(undefined)).toMatch(/star chart/i); // the exit's own fallback
    });

    it('every Sigil venue in the game actually stocks something to spend on', () => {
      // The whole point of the fix: a major is always played somewhere that sells you the next upgrade.
      for (const chapter of [1, 2, 3, 4, 5]) {
        for (const alignment of [undefined, 'warden', 'herald'] as const) {
          const t = tournamentForChapter(chapter, alignment);
          if (!t) continue;
          expect(worldHasShop(t.venueId) || worldIsShipVendor(t.venueId)).toBe(true);
        }
      }
    });
  });

  it('cross-nav (GS-story-shop-crossnav): shop ↔ shipyard ↔ caddy at the same world, loop-free', () => {
    // desert-18 (Vela Dunes) hosts a Pro Shop, a ship vendor, AND Sandy the Sand-Saver — all three.
    const recap = afterClear('desert-18');
    const shop = reduce(recap, { type: 'openStoryShop', worldId: 'desert-18' });
    expect(shop.screen).toBe('storyShop');
    // from the shop, jump to the shipyard...
    const yardFromShop = reduce(shop, { type: 'openStoryShipyard', worldId: 'desert-18' });
    expect(yardFromShop.screen).toBe('storyShipyard');
    expect(yardFromShop.storyShipyardWorldId).toBe('desert-18');
    // ...and from the shipyard back to the shop
    const shopFromYard = reduce(yardFromShop, { type: 'openStoryShop', worldId: 'desert-18' });
    expect(shopFromYard.screen).toBe('storyShop');
    // exiting either cross-linked service returns to the STAR MAP (loop-free — no service back-stack)
    expect(reduce(shopFromYard, { type: 'exitStoryShop' }).screen).toBe('starTour');
    expect(reduce(yardFromShop, { type: 'exitStoryShipyard' }).screen).toBe('starTour');
    // the caddy can be recruited from the shop AND from the shipyard, not just the recap/map
    expect(reduce(shop, { type: 'hireStoryCaddy', worldId: 'desert-18', caddyId: 'sandy-sandsaver' }).story!.hiredCaddyIds).toContain('sandy-sandsaver');
    expect(reduce(yardFromShop, { type: 'hireStoryCaddy', worldId: 'desert-18', caddyId: 'sandy-sandsaver' }).story!.hiredCaddyIds).toContain('sandy-sandsaver');
    // the services fragment offers the OTHER two services (not the one you're in)
    const inShop = storyWorldServicesHTML(shop.story!, 'desert-18', 'shop');
    expect(inShop).toContain('openStoryShipyard');
    expect(inShop).toContain('sandy-sandsaver');
    expect(inShop).not.toContain('openStoryShop'); // don't link back to itself
    const inYard = storyWorldServicesHTML(shop.story!, 'desert-18', 'shipyard');
    expect(inYard).toContain('openStoryShop');
    expect(inYard).not.toContain('openStoryShipyard');
  });

  it('a friend is recruited at their world (recap), chosen active in the locker, and rides into the round', () => {
    // Vela Dunes / desert-18 is where Sandy the Sand-Saver waits.
    const recap = { ...afterClear('desert-18'), story: { ...defaultStoryState('feather-fade'), chapter: 2, credits: 2000, clearedWorldIds: ['standrews-18', 'desert-18'] } };
    const hired = reduce(recap, { type: 'hireStoryCaddy', worldId: 'desert-18', caddyId: 'sandy-sandsaver' });
    expect(hired.story!.hiredCaddyIds).toContain('sandy-sandsaver');
    expect(hired.story!.activeCaddyId).toBe('sandy-sandsaver'); // first hire carries the bag
    // Can't recruit the wrong friend at this world, and can't recruit from the clubhouse.
    expect(reduce(recap, { type: 'hireStoryCaddy', worldId: 'desert-18', caddyId: 'driver-dan' }).story!.hiredCaddyIds).not.toContain('driver-dan');
    expect(reduce({ ...hired, screen: 'story' as const }, { type: 'hireStoryCaddy', worldId: 'desert-18', caddyId: 'driver-dan' })).toEqual({ ...hired, screen: 'story' });

    // Choose active in the locker.
    const locker = reduce({ ...hired, screen: 'story' as const }, { type: 'openStoryLocker' });
    expect(locker.screen).toBe('storyLocker');
    const benched = reduce(locker, { type: 'setStoryCaddy' });
    expect(benched.story!.activeCaddyId).toBeUndefined();
    const reactivated = reduce(benched, { type: 'setStoryCaddy', caddyId: 'sandy-sandsaver' });
    expect(reactivated.story!.activeCaddyId).toBe('sandy-sandsaver');

    // Tee off a world → the active caddy's perk is folded into the round loadout (auto ≡ interactive).
    const intro = reduce({ ...reactivated, screen: 'story' as const }, { type: 'storyPlayWorld', courseId: 'desert-18' });
    expect(intro.run.loadout.perks).toContain('sandy-sandsaver');
  });

  it('a deep world plays under a stormy sky with real teeth and still resolves (GS-weather-depth)', () => {
    const story = { ...defaultStoryState('feather-fade'), chapter: 5, credits: 500, clearedWorldIds: ['standrews-18'] };
    const hub = { ...initState('wind-seed', {}, undefined, story), screen: 'story' as const };
    // A Ch.1 world plays a CALM sky (no wind bump — the new-player fix); the Storm chapter's own
    // Draco Gale blows the wildest lightning, and the Hydra Mire rains ACID (a ground-patch sky).
    const early = reduce(hub, { type: 'storyPlayWorld', courseId: 'verdant-18' });
    expect(early.run.staticEffect).toBe('moonlight'); // calm, atmospheric — not a gale
    expect(effectWindMult(early.run.staticEffect)).toBeLessThanOrEqual(1);
    const gale = reduce(hub, { type: 'storyPlayWorld', courseId: 'tempest-18' });
    expect(gale.run.staticEffect).toBe('ionStorm'); // Draco Gale IS the tempest
    const intro = reduce(hub, { type: 'storyPlayWorld', courseId: 'swamp-18' });
    expect(intro.run.staticEffect).toBe('acidRain');
    expect(intro.course.meta.effect).toBe('acidRain'); // stamped so the render/HUD show the downpour
    // The acid-rain sky arms its ground patches for the HEADLESS sim exactly as the interactive
    // driver does (auto ≡ interactive, GS-weather-depth playerHoleOpts fix).
    expect(playerHoleOpts(intro.run).groundPatch).toBe('acid');
    // The weather is real course data, and the auto round still finishes cleanly.
    const done = reduce(intro, { type: 'play' });
    expect(done.screen).toBe('storyResult');
    expect(Number.isFinite(done.lastStoryRound!.strokes)).toBe(true);
  });
});

describe('Story locker flow (GS-story-locker)', () => {
  // A Chapter-1 campaign at the spaceport clubhouse, holding a bought Planet 5-Wood + a gear glove.
  function lockerReady() {
    const story = {
      ...defaultStoryState('feather-fade'),
      chapter: 1,
      credits: 1000,
      ownedClubIds: [...defaultStoryState().ownedClubIds, 'club:tour:5W'],
      equippedBagIds: defaultStoryState().equippedBagIds.map((id) => (id === '5W' ? 'club:tour:5W' : id)),
      ownedGearIds: ['gear:glove:tacky', 'gear:glove:vice'],
      equippedGear: { glove: 'gear:glove:vice' as string },
    };
    return { ...initState('seed', {}, undefined, story), screen: 'story' as const };
  }

  it('opens the locker from the clubhouse and back', () => {
    const hub = lockerReady();
    const locker = reduce(hub, { type: 'openStoryLocker' });
    expect(locker.screen).toBe('storyLocker');
    const back = reduce(locker, { type: 'exitStoryLocker' });
    expect(back.screen).toBe('story');
  });

  it('benches and re-equips a club', () => {
    const locker = reduce(lockerReady(), { type: 'openStoryLocker' });
    const benched = reduce(locker, { type: 'storyUnequipClub', clubId: 'club:tour:5W' });
    expect(benched.story!.equippedBagIds).not.toContain('club:tour:5W');
    expect(benched.story!.ownedClubIds).toContain('club:tour:5W'); // still owned
    const reeq = reduce(benched, { type: 'storyEquipClub', clubId: 'club:tour:5W' });
    expect(reeq.story!.equippedBagIds).toContain('club:tour:5W');
  });

  it('swaps and removes gear in a slot', () => {
    const locker = reduce(lockerReady(), { type: 'openStoryLocker' });
    expect(locker.story!.equippedGear.glove).toBe('gear:glove:vice');
    const swapped = reduce(locker, { type: 'storyEquipGear', gearId: 'gear:glove:tacky' });
    expect(swapped.story!.equippedGear.glove).toBe('gear:glove:tacky');
    const bare = reduce(swapped, { type: 'storyUnequipGear', slot: 'glove' });
    expect(bare.story!.equippedGear.glove).toBeUndefined();
  });

  it('inspect works on the locker screen (read-only lore card)', () => {
    const locker = reduce(lockerReady(), { type: 'openStoryLocker' });
    const inspect = reduce(locker, { type: 'storyInspectItem', itemId: 'gear:glove:vice' });
    expect(inspect.storyItemInspectId).toBe('gear:glove:vice');
    const closed = reduce(inspect, { type: 'storyCloseItem' });
    expect(closed.storyItemInspectId).toBeUndefined();
  });
});

describe('Story shipyard flow (GS-story-ships)', () => {
  function shipyardReady() {
    const story = { ...defaultStoryState('feather-fade'), chapter: 1, credits: 2000, clearedWorldIds: ['standrews-18'] };
    return { ...initState('seed', {}, undefined, story), screen: 'story' as const };
  }

  it('opens the shipyard, buys + flies a ship, and back', () => {
    const hub = shipyardReady();
    const yard = reduce(hub, { type: 'openStoryShipyard' });
    expect(yard.screen).toBe('storyShipyard');
    const bought = reduce(yard, { type: 'storyBuyShip', shipId: 'hauler-barge' });
    expect(bought.story!.ownedShipIds).toContain('hauler-barge');
    expect(bought.story!.equippedShipId).toBe('hauler-barge');
    expect(bought.story!.credits).toBe(2000 - 480);
    const back = reduce(bought, { type: 'exitStoryShipyard' });
    expect(back.screen).toBe('story');
  });

  it('a bought ship\'s credit bonus multiplies the next world clear\'s payout', () => {
    // Buy the +25% hauler, then clear a world; the payout is 1.25× the base.
    const yard = reduce(shipyardReady(), { type: 'openStoryShipyard' });
    const bought = reduce(yard, { type: 'storyBuyShip', shipId: 'hauler-barge' });
    const hub = reduce(bought, { type: 'exitStoryShipyard' });
    const creditsBefore = hub.story!.credits;
    // tee off + auto-play a charted world (chapter 1 opens verdant-18)
    const intro = pastLore(reduce({ ...hub, screen: 'story' as const }, { type: 'storyPlayWorld', courseId: 'verdant-18' }));
    const done = reduce(intro, { type: 'play' });
    const earned = done.story!.credits - creditsBefore;
    // base payout for the round × 1.25 (rounded) — always ≥ the floored base (100) × 1.25
    expect(done.lastStoryRound!.credits).toBe(earned);
    expect(earned).toBeGreaterThanOrEqual(Math.round(100 * 1.25));
  });

  it('a revisit of a cleared world pays only the reduced top-up (GS-story-econ2)', () => {
    // Same seed + same bag → the same auto-played round; the only difference is whether the world was
    // already cleared, so the credit ratio isolates the revisit top-up wiring in resolveStoryRound.
    const base = { ...defaultStoryState('feather-fade'), chapter: 1, credits: 0, clearedWorldIds: ['standrews-18'] };
    const firstState = { ...initState('econ-seed', {}, undefined, base), screen: 'story' as const };
    const first = reduce(pastLore(reduce(firstState, { type: 'storyPlayWorld', courseId: 'verdant-18' })), { type: 'play' });
    const firstEarned = first.lastStoryRound!.credits;

    const revState = {
      ...initState('econ-seed', {}, undefined, { ...base, clearedWorldIds: ['standrews-18', 'verdant-18'] }),
      screen: 'story' as const,
    };
    const revisit = reduce(pastLore(reduce(revState, { type: 'storyPlayWorld', courseId: 'verdant-18' })), { type: 'play' });
    expect(revisit.lastStoryRound!.credits).toBeLessThan(firstEarned);
    expect(revisit.lastStoryRound!.credits / firstEarned).toBeCloseTo(REVISIT_CREDIT_MULT, 1);
  });

  it('buys a ship upgrade → combat rating rises + an engine bonus stacks onto the ship\'s (GS-story-ship-upgrades)', () => {
    const yard = reduce(shipyardReady(), { type: 'openStoryShipyard' });
    // inspect + buy a weapon (combat rating) and an engine (credit bonus)
    const w = reduce(reduce(yard, { type: 'storyInspectItem', itemId: 'upg:weapon:scatter' }), { type: 'storyBuyUpgrade', upgradeId: 'upg:weapon:scatter' });
    expect(w.story!.ownedShipUpgradeIds).toContain('upg:weapon:scatter');
    expect(w.storyItemInspectId).toBeUndefined();
    const e = reduce(w, { type: 'storyBuyUpgrade', upgradeId: 'upg:engine:ion' });
    expect(e.story!.ownedShipUpgradeIds).toContain('upg:engine:ion');

    // now buy the +25% hauler too and clear a world: payout = base × 1.25 (ship) × 1.05 (ion engine)
    const withShip = reduce(e, { type: 'storyBuyShip', shipId: 'hauler-barge' });
    const hub = reduce(withShip, { type: 'exitStoryShipyard' });
    const before = hub.story!.credits;
    const done = reduce(pastLore(reduce({ ...hub, screen: 'story' as const }, { type: 'storyPlayWorld', courseId: 'verdant-18' })), { type: 'play' });
    const earned = done.story!.credits - before;
    expect(earned).toBeGreaterThanOrEqual(Math.round(100 * 1.25 * 1.05));
  });

  it('cannot BUY ship upgrades from the ship interior — only at a vendor shipyard (GS-story-quality)', () => {
    const aboard = { ...shipyardReady(), screen: 'shipInterior' as const, shipRoom: 'weapons' as const };
    const tried = reduce(aboard, { type: 'storyBuyUpgrade', upgradeId: 'upg:weapon:scatter' });
    expect(tried).toBe(aboard); // no purchase aboard your own ship
    // but the vendor shipyard still sells it
    const yard = reduce(shipyardReady(), { type: 'openStoryShipyard' });
    const bought = reduce(yard, { type: 'storyBuyUpgrade', upgradeId: 'upg:weapon:scatter' });
    expect(bought.story!.ownedShipUpgradeIds).toContain('upg:weapon:scatter');
  });
});

describe('Story tournament flow (GS-story-tournament)', () => {
  // A Chapter-1 campaign that has cleared two Chapter-1 worlds → the tournament is unlocked.
  function tournamentReady() {
    const story = {
      ...defaultStoryState('feather-fade'),
      chapter: 1,
      clearedWorldIds: ['standrews-18', 'verdant-18', 'verdant2-18', 'desert-18'],
      // GS-story-qualifiers: unlock the Emerald major by QUALIFYING (top-N) in the two Chapter-1 events.
      qualifierResults: { 'verdant2-18': { place: 1, field: 16 }, 'desert-18': { place: 4, field: 16 } },
    };
    return { ...initState('seed', {}, undefined, story), screen: 'story' as const };
  }

  it('opens the tournament lobby only when unlocked, and tees off a marked tournament round', () => {
    // Not unlocked (no chapter worlds cleared) → no-op.
    const locked = { ...initState('seed', {}, undefined, { ...defaultStoryState(), chapter: 1 }), screen: 'story' as const };
    expect(reduce(locked, { type: 'openStoryTournament' }).screen).toBe('story');

    const hub = tournamentReady();
    const lobby = reduce(hub, { type: 'openStoryTournament' });
    expect(lobby.screen).toBe('storyTournament');
    // GS-story-ragnarok: the Emerald Sigil match opens with the Parrot's opening-stakes beat — dismiss it.
    const beat = reduce(lobby, { type: 'storyPlayTournament' });
    expect(beat.screen).toBe('lore');
    expect(beat.pendingLoreId).toBe('story-omen-emerald');
    const intro = reduce(beat, { type: 'dismissLore' });
    expect(intro.screen).toBe('intro');
    expect(intro.run.storyTournament).toBe(1);
    expect(intro.run.storyRound).toBe(true);
    expect(intro.run.staticCourseId).toBe('verdant-18'); // the Chapter 1 venue
  });

  it('playing the tournament resolves vs the rival and, on a win, banks the Sigil + advances the chapter', () => {
    const lobby = reduce(tournamentReady(), { type: 'openStoryTournament' });
    // GS-story-ragnarok: dismiss the Emerald opening beat before teeing off.
    const intro = reduce(reduce(lobby, { type: 'storyPlayTournament' }), { type: 'dismissLore' });
    const done = reduce(intro, { type: 'play' });
    expect(done.screen).toBe('storyTournamentResult');
    const r = done.lastStoryTournament!;
    expect(r.chapter).toBe(1);
    // the recap is internally consistent: won iff the player's gross beat the rival's
    expect(r.won).toBe(r.playerGross <= r.rivalGross);
    // GS-story-tournament-field: the recap carries the full "all competitors" leaderboard (rival + three
    // friends + you), sorted low-gross-first with exactly one player row.
    expect(r.leaderboard!.length).toBe(5);
    expect(r.leaderboard!.filter((g) => g.kind === 'player')).toHaveLength(1);
    for (let i = 1; i < r.leaderboard!.length; i++) {
      expect(r.leaderboard![i]!.gross).toBeGreaterThanOrEqual(r.leaderboard![i - 1]!.gross);
    }
    if (r.won) {
      expect(done.story!.trophyIds).toContain('sigil-emerald');
      expect(done.story!.chapter).toBe(2); // advanced
    } else {
      expect(done.story!.trophyIds).not.toContain('sigil-emerald');
      expect(done.story!.chapter).toBe(1); // unchanged — retry
    }
    // continue → back to the clubhouse, recap cleared
    const back = reduce(done, { type: 'storyTournamentContinue' });
    expect(back.screen).toBe('story');
    expect(back.lastStoryTournament).toBeUndefined();
  });

  it('a Story tournament never touches the main-save Star Tour boards', () => {
    const hub = tournamentReady();
    const round = reduce(reduce(hub, { type: 'openStoryTournament' }), { type: 'storyPlayTournament' });
    const done = reduce(reduce(round, { type: 'dismissLore' }), { type: 'play' });
    expect(done.strokePlayBest).toEqual(hub.strokePlayBest);
  });

  it('the interactive tournament pops the halftime rival beat after hole 9, then plays on (GS-story-tournament-midpop)', () => {
    const lobby = reduce(tournamentReady(), { type: 'openStoryTournament' });
    // GS-story-ragnarok: dismiss the Emerald opening beat before teeing off.
    const intro = reduce(reduce(lobby, { type: 'storyPlayTournament' }), { type: 'dismissLore' });
    let s = reduce(intro, { type: 'playInteractive' });
    expect(s.screen).toBe('playing');
    // play the front nine, hole by hole (the interactive path — where the pop lives).
    let guard = 0;
    let popped = false;
    while (s.screen === 'playing' && guard++ < 40) {
      while (s.play && !s.play.done && guard++ < 400) s = reduce(s, { type: 'autoShotHole' });
      s = reduce(s, { type: 'holeComplete' });
      if (s.screen === 'storyTournamentPop') { popped = true; break; }
    }
    expect(popped).toBe(true);
    // the pop carries the standings through nine + a brag/curse flag consistent with them.
    const p = s.storyTournamentMidPop!;
    expect(p.rivalName).toBeTruthy();
    expect(p.brag).toBe(p.rivalThru < p.playerThru);
    // "play on" resumes at the back nine (hole index 9) and the pop clears.
    const on = reduce(s, { type: 'tournamentPopContinue' });
    expect(on.screen).toBe('playing');
    expect(on.storyTournamentMidPop).toBeUndefined();
    expect(on.play!.holeIndex).toBe(9);
    // and the round still finishes to a tournament result (pop fires exactly once — no second pop).
    guard = 0;
    let s2 = on;
    while (s2.screen === 'playing' && guard++ < 40) {
      while (s2.play && !s2.play.done && guard++ < 400) s2 = reduce(s2, { type: 'autoShotHole' });
      s2 = reduce(s2, { type: 'holeComplete' });
    }
    expect(s2.screen).toBe('storyTournamentResult');
  });
});

describe('The Choice + alignment fork (GS-story-chapters)', () => {
  it('winning Chapter 3 diverts to The Choice, and picking a path forks the back-half tournament', () => {
    // A campaign that just won the Storm Sigil (Chapter 3 → advanced to 4), path unchosen, on the recap.
    const story = {
      ...defaultStoryState('feather-fade'),
      chapter: 4,
      trophyIds: ['sigil-emerald', 'sigil-ember', 'sigil-storm'],
    };
    const recap = {
      ...initState('seed', {}, undefined, story),
      screen: 'storyTournamentResult' as const,
      lastStoryTournament: { chapter: 3, name: 'The Storm Championship', venueId: 'tempest-18', sigilName: 'The Storm Sigil', prize: '', rivalName: 'Venoma', playerGross: 70, rivalGross: 72, won: true, finalSigil: false },
    };
    // Continue from the Ch.3 recap → The Choice (not the clubhouse), because the path is unchosen.
    const choice = reduce(recap, { type: 'storyTournamentContinue' });
    expect(choice.screen).toBe('storyChoice');

    // Choose Herald → alignment set, land on the clubhouse.
    const herald = reduce(choice, { type: 'chooseAlignment', alignment: 'herald' });
    expect(herald.story!.alignment).toBe('herald');
    expect(herald.screen).toBe('story');

    // Now qualified in two Chapter-4 events → the tournament is the HERALD variant (The Drowning Rite / ocean).
    // For Herald the venue is ocean-18, so the qualifiers are void2-18 + crystal2-18 (Ch.4 top is 4).
    const armed = {
      ...herald,
      story: {
        ...herald.story!,
        clearedWorldIds: [...herald.story!.clearedWorldIds, 'void2-18', 'crystal2-18'],
        qualifierResults: { 'void2-18': { place: 1, field: 12 }, 'crystal2-18': { place: 2, field: 12 } },
      },
      screen: 'story' as const,
    };
    const lobby = reduce(armed, { type: 'openStoryTournament' });
    expect(lobby.screen).toBe('storyTournament');
    const intro = reduce(lobby, { type: 'storyPlayTournament' });
    expect(intro.run.staticCourseId).toBe('ocean-18'); // the Herald venue (Warden would be void2-18)
  });

  it('winning the Warden Chapter-4 major grants + flies the Radiant Warden Cruiser (GS-story-route-rewards)', () => {
    const story = {
      ...defaultStoryState('feather-fade'),
      chapter: 4,
      alignment: 'warden' as const,
      trophyIds: ['sigil-emerald', 'sigil-ember', 'sigil-storm'],
      clearedWorldIds: ['standrews-18', 'ocean-18', 'crystal2-18'],
      // GS-story-qualifiers: for Warden the venue is void2-18, so the qualifiers are ocean-18 + crystal2-18.
      qualifierResults: { 'ocean-18': { place: 1, field: 12 }, 'crystal2-18': { place: 2, field: 12 } },
      // arm up so the Warden Ch4 rival (Scorpius the Silent Sting, edge 0.23) is beatable by the auto round
      ownedClubIds: [...defaultStoryState().ownedClubIds, 'club:solar:D', 'club:solar:3W', 'club:masters:2H'],
      equippedBagIds: defaultStoryState().equippedBagIds.map((id) => (id === 'D' ? 'club:solar:D' : id)),
    };
    const hub = { ...initState('seed', {}, undefined, story), screen: 'story' as const };
    // GS-story-beat-venue: the vigil tee-off fires the beats that belong to THIS tee — the Silent Sting up
    // close, then (chained on dismiss) the chapter's Ragnarök omen. The doubt thread's eve-of-the-vigil
    // drift belongs to the road, so it never turns up at the major.
    let round = reduce(reduce(hub, { type: 'openStoryTournament' }), { type: 'storyPlayTournament' });
    expect(round.screen).toBe('lore');
    expect(round.pendingLoreId).toBe('story-scorpius-warden');
    const chained = reduce(round, { type: 'dismissLore' });
    expect(chained.screen).toBe('lore'); // the omen chains onto the same arrival rather than being stranded
    expect(chained.pendingLoreId).toBe('story-omen-abyss-warden');
    round = pastLore(round);
    const done = reduce(round, { type: 'play' });
    expect(done.screen).toBe('storyTournamentResult');
    // The ship is granted iff the major was won — gate the assertion on the actual outcome.
    if (done.lastStoryTournament!.won) {
      expect(done.story!.ownedShipIds).toContain('warden-cruiser');
      expect(done.story!.equippedShipId).toBe('warden-cruiser');
    } else {
      expect(done.story!.ownedShipIds).not.toContain('warden-cruiser');
    }
  });

  it('winning the Chapter-4 major reaches the emotional interlude, which pays out once (GS-story-midchapter)', () => {
    // A Herald who just won the Drowning Rite (Ch.4) recap, interlude unseen.
    const story = {
      ...defaultStoryState('feather-fade'),
      chapter: 5,
      alignment: 'herald' as const,
      credits: 500,
      trophyIds: ['sigil-emerald', 'sigil-ember', 'sigil-storm', 'sigil-drowned'],
    };
    const recap = {
      ...initState('seed', {}, undefined, story),
      screen: 'storyTournamentResult' as const,
      // GS-story-sigil-rivals: the Drowning Rite rival is the severed FRIEND (here: Woo, the first tour-mate).
      lastStoryTournament: { chapter: 4, name: 'The Drowning Rite', venueId: 'ocean-18', sigilName: 'The Drowned Sigil', prize: '', rivalName: 'Woo', playerGross: 70, rivalGross: 72, won: true, finalSigil: false },
    };
    const interlude = reduce(recap, { type: 'storyTournamentContinue' });
    expect(interlude.screen).toBe('storyInterlude');
    const done = reduce(interlude, { type: 'storyInterludeContinue' });
    expect(done.screen).toBe('story');
    expect(done.story!.credits).toBe(500 + 600); // the Coil's blood-money
    expect(done.story!.seenStoryBeats['interlude-herald']).toBe(true);

    // it fires exactly once: a later Ch.4-recap continue (seen) goes straight to the clubhouse
    const recap2 = { ...done, screen: 'storyTournamentResult' as const, lastStoryTournament: { ...recap.lastStoryTournament } };
    expect(reduce(recap2, { type: 'storyTournamentContinue' }).screen).toBe('story');
  });

  it('chooseAlignment is a no-op off the choice screen / once chosen', () => {
    const chosen = { ...initState('seed', {}, undefined, { ...defaultStoryState(), alignment: 'warden' as const }), screen: 'storyChoice' as const };
    expect(reduce(chosen, { type: 'chooseAlignment', alignment: 'herald' }).story!.alignment).toBe('warden'); // already chosen
  });
});

describe('Story finale flow (GS-story-yggdrasil)', () => {
  const FIVE = ['sigil-emerald', 'sigil-ember', 'sigil-storm', 'sigil-abyssal', 'sigil-serpent'];
  // A key-forged campaign, fully armed so the finale is winnable.
  function armedKey(win: boolean) {
    const owned = win
      ? ['upg:weapon:scatter', 'upg:weapon:railgun', 'upg:engine:ion', 'upg:shield:deflector', 'upg:shield:aegis']
      : [];
    const story = { ...defaultStoryState('feather-fade'), chapter: 5, trophyIds: [...FIVE], ownedShipUpgradeIds: owned };
    return { ...initState('seed', {}, undefined, story), screen: 'story' as const };
  }

  it('opens the finale only with the key forged, and gates engaging behind arming', () => {
    // no Sigils → no-op
    const noKey = { ...initState('seed', {}, undefined, defaultStoryState()), screen: 'story' as const };
    expect(reduce(noKey, { type: 'openStoryFinale' }).screen).toBe('story');

    // key forged but unarmed → briefing opens, engaging loses (not complete), returns to clubhouse
    const unarmed = reduce(armedKey(false), { type: 'openStoryFinale' });
    expect(unarmed.screen).toBe('storyFinale');
    const lost = reduce(unarmed, { type: 'engageStoryFinale' });
    expect(lost.screen).toBe('storyFinaleResult');
    expect(lost.lastStoryFinale!.won).toBe(false);
    expect(lost.story!.completed).toBe(false);
    const backLose = reduce(lost, { type: 'storyFinaleContinue' });
    expect(backLose.screen).toBe('story'); // a loss → back to the clubhouse for a rematch
  });

  it('an armed ship beats Jörmungandr → campaign complete → victory returns to the title', () => {
    const briefing = reduce(armedKey(true), { type: 'openStoryFinale' });
    const won = reduce(briefing, { type: 'engageStoryFinale' });
    expect(won.screen).toBe('storyFinaleResult');
    expect(won.lastStoryFinale!.won).toBe(true);
    expect(won.story!.completed).toBe(true);
    const back = reduce(won, { type: 'storyFinaleContinue' });
    expect(back.screen).toBe('title'); // a win → roll credits to the title (Star Tour now unlocked)
    expect(back.story!.completed).toBe(true);
    expect(back.starTourUnlocked).toBe(true); // GS-story-startour-unlock: the permanent main-save flag is set
  });

  it('the Star Tour unlock is PERMANENT — a new campaign never relocks it (GS-story-startour-unlock)', () => {
    // Win the finale: the permanent main-save flag is set alongside the campaign's `completed`.
    const won = reduce(reduce(armedKey(true), { type: 'openStoryFinale' }), { type: 'engageStoryFinale' });
    expect(won.starTourUnlocked).toBe(true);

    // Begin a FRESH campaign — the new StoryState resets `completed` to false, but the flag survives.
    const picking = { ...won, screen: 'character' as const, pendingStoryNew: true };
    const fresh = reduce(picking, { type: 'selectCharacter', characterId: 'longshot-larry' });
    expect(fresh.story!.completed).toBe(false); // the new campaign is not complete…
    expect(fresh.starTourUnlocked).toBe(true); // …but Star Tour stays unlocked (permanent).
  });

  it('a returning player mid-completed-campaign backfills the unlock at boot (GS-story-startour-unlock)', () => {
    // An old save (flag absent) whose live campaign is already complete: initState seeds the flag true so
    // the reward isn't lost, and it persists from there.
    const done = { ...defaultStoryState('feather-fade'), completed: true };
    const boot = initState('seed', {}, undefined, done);
    expect(boot.starTourUnlocked).toBe(true);
  });

  it('the interactive finisher STRIKE colours a win but never decides it (GS-story-finisher)', () => {
    const briefing = reduce(armedKey(true), { type: 'openStoryFinale' });
    // A clean strike vs a graze — both WIN (the arm-up gates already decided that); the quality is recorded.
    const clean = reduce(briefing, { type: 'engageStoryFinale', strike: 'clean' });
    expect(clean.lastStoryFinale!.won).toBe(true);
    expect(clean.lastStoryFinale!.strike).toBe('clean');
    expect(clean.story!.completed).toBe(true);
    const graze = reduce(briefing, { type: 'engageStoryFinale', strike: 'graze' });
    expect(graze.lastStoryFinale!.won).toBe(true); // a graze still wins an armed ship
    expect(graze.lastStoryFinale!.strike).toBe('graze');
    expect(graze.story!.completed).toBe(true);
    // A default (no strike passed, e.g. reduced-motion skip) is a clean win.
    expect(reduce(briefing, { type: 'engageStoryFinale' }).lastStoryFinale!.strike).toBe('clean');
    // An UNARMED engage can't be rescued by a "clean" strike — the gates still lose it, no strike recorded.
    const lost = reduce(reduce(armedKey(false), { type: 'openStoryFinale' }), { type: 'engageStoryFinale', strike: 'clean' });
    expect(lost.lastStoryFinale!.won).toBe(false);
    expect(lost.lastStoryFinale!.strike).toBeUndefined();
  });

  // GS-story-battle-2: the live fight has real stakes — an ARMED ship that loses it is REPELLED (a
  // costless setback, re-engage), and a gate-lost ship can never battle-win (clamped, no soft-lock lie).
  it('an armed ship can LOSE the live fight — repelled, costless, and the finale re-opens', () => {
    const briefing = reduce(armedKey(true), { type: 'openStoryFinale' });
    const repelled = reduce(briefing, { type: 'engageStoryFinale', strike: 'clean', outcome: 'lost' });
    expect(repelled.screen).toBe('storyFinaleResult');
    expect(repelled.lastStoryFinale!.won).toBe(false);
    expect(repelled.lastStoryFinale!.failReason).toBe('repelled');
    expect(repelled.lastStoryFinale!.strike).toBeUndefined();
    expect(repelled.story!.completed).toBe(false); // NOT complete — the campaign is saved at the root
    // back to the clubhouse; the finale re-opens (nothing lost, nothing to re-buy)
    const back = reduce(repelled, { type: 'storyFinaleContinue' });
    expect(back.screen).toBe('story');
    expect(reduce(back, { type: 'openStoryFinale' }).screen).toBe('storyFinale');
    // an explicit battle WIN on an armed ship resolves exactly like the default
    const won = reduce(briefing, { type: 'engageStoryFinale', strike: 'graze', outcome: 'won' });
    expect(won.lastStoryFinale!.won).toBe(true);
    expect(won.story!.completed).toBe(true);
    // a GATE-lost ship can never battle-win — the verdict stays the gates (and its reason, not 'repelled')
    const cheat = reduce(reduce(armedKey(false), { type: 'openStoryFinale' }), { type: 'engageStoryFinale', outcome: 'won' });
    expect(cheat.lastStoryFinale!.won).toBe(false);
    expect(cheat.lastStoryFinale!.failReason).toBe('firepower');
    expect(cheat.story!.completed).toBe(false);
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

describe('Ally side quests (GS-story-quests)', () => {
  it('accept → play the quest world → recap → claim the unique reward into the bag', () => {
    // Driver Dan recruited, chapter 3, a round already carried WITH him (past the GS-story-caddy-rep gate),
    // and a world cleared ELSEWHERE (past the beat gate) → his quest (the derelict) is offerable.
    const story = { ...defaultStoryState('feather-fade'), chapter: 3, hiredCaddyIds: ['driver-dan'], activeCaddyId: 'driver-dan', caddiedRoundIds: ['driver-dan'], clearedWorldIds: ['standrews-18'] };
    const hub = { ...initState('quest-seed', {}, undefined, story), screen: 'story' as const };

    // accept it from the ally card → active
    const accepted = reduce(hub, { type: 'acceptStoryQuest', questId: 'quest-dan' });
    expect(accepted.story?.activeQuestId).toBe('quest-dan');

    // play it → the ally's OFFER beat plays first (GS-story-quest-offer-beat), then tees off Dan's home world
    // (the derelict), marked as the quest. A Ch.3 derelict arrival may fire a lore beat too (withLoreGate).
    let intro = reduce(accepted, { type: 'playStoryQuest' });
    expect(intro.screen).toBe('storyQuestOffer');
    intro = reduce(intro, { type: 'storyQuestOfferContinue' });
    if (intro.screen === 'lore') intro = reduce(intro, { type: 'dismissLore' });
    expect(intro.screen).toBe('intro');
    expect(intro.run.staticCourseId).toBe('derelict-18');
    expect(intro.run.storyQuest).toBe('quest-dan');
    // GS-story-quest-9: a quest is a shorter NINE-hole round (not the world's full 18).
    expect(intro.course.holes.length).toBe(9);

    // play the round → the quest recap carries the quest id
    const done = reduce(intro, { type: 'play' });
    expect(done.screen).toBe('storyResult');
    expect(done.lastStoryRound?.questId).toBe('quest-dan');

    // claim → the reward is granted, the quest is done, back to the clubhouse
    const claimed = reduce(done, { type: 'completeStoryQuest' });
    expect(claimed.screen).toBe('story');
    expect(claimed.story?.completedQuestIds).toContain('quest-dan');
    expect(claimed.story?.activeQuestId).toBeUndefined();
    // GS-story-reward-variety: Dan the old trucker gifts his rig's salvaged ENGINE (a ship part), granted
    // into the fleet, not a club into the bag.
    expect(claimed.story?.ownedShipUpgradeIds).toContain('upg:engine:longhaul');
  });

  it('GS-story-herald-quests: a Coil caddy offers a quest on the dark path, accepted + teed off at its world', () => {
    // Herald path, chapter 4, Venoma on the bag with a round already carried (rep), cleared elsewhere.
    const story = {
      ...defaultStoryState('feather-fade'),
      alignment: 'herald' as const,
      chapter: 4,
      hiredCaddyIds: ['coil-venoma', 'coil-voss'],
      activeCaddyId: 'coil-venoma',
      caddiedRoundIds: ['coil-venoma'],
      clearedWorldIds: ['standrews-18'], // elsewhere from swamp-18 (Venoma's quest world)
    };
    expect(questOfferable(story, 'coil-venoma')).toBe(true);
    const hub = { ...initState('herald-quest-seed', {}, undefined, story), screen: 'story' as const };

    // accept it from the Coil agent's card → active
    const accepted = reduce(hub, { type: 'acceptStoryQuest', questId: 'quest-coil-venoma' });
    expect(accepted.story?.activeQuestId).toBe('quest-coil-venoma');

    // play it → the ally's OFFER beat plays first, then tees off Venoma's quest world (the Mire), marked as
    // the quest (a lore beat may fire after the pitch too).
    let intro = reduce(accepted, { type: 'playStoryQuest' });
    expect(intro.screen).toBe('storyQuestOffer');
    intro = reduce(intro, { type: 'storyQuestOfferContinue' });
    if (intro.screen === 'lore') intro = reduce(intro, { type: 'dismissLore' });
    expect(intro.screen).toBe('intro');
    expect(intro.run.staticCourseId).toBe('swamp-18');
    expect(intro.run.storyQuest).toBe('quest-coil-venoma');
    // the Coil caddy's effect rides into the round loadout (Venoma folds wind resistance) — auto ≡ interactive
    expect(intro.run.loadout.windResist ?? 0).toBeGreaterThanOrEqual(0.15);
  });

  it('a quest cannot be accepted before its chapter, and only one runs at a time', () => {
    const early = { ...initState('s', {}, undefined, { ...defaultStoryState('feather-fade'), chapter: 1, hiredCaddyIds: ['driver-dan'] }), screen: 'story' as const };
    expect(reduce(early, { type: 'acceptStoryQuest', questId: 'quest-dan' }).story?.activeQuestId).toBeUndefined();
  });

  it('GS-story-caddy-rep: a quest opens only AFTER a round is carried with that caddy on the bag', () => {
    // Sandy recruited + active, chapter 2, and a world cleared elsewhere — but no round carried with her yet.
    const story = {
      ...defaultStoryState('feather-fade'),
      chapter: 2,
      hiredCaddyIds: ['sandy-sandsaver'],
      activeCaddyId: 'sandy-sandsaver',
      clearedWorldIds: ['standrews-18'],
    };
    expect(questOfferable(story, 'sandy-sandsaver')).toBe(false); // reputation not yet earned
    expect(questBeatPending(story, 'sandy-sandsaver')).toBe(true); // "put them on the bag for a round first"

    // Play a world round with Sandy on the bag → the reducer records the caddy round…
    const map = { ...initState('rep-seed', {}, undefined, story), screen: 'starTour' as const };
    let intro = reduce(map, { type: 'storyPlayWorld', courseId: 'verdant-18' });
    if (intro.screen === 'lore') intro = reduce(intro, { type: 'dismissLore' }); // an arrival beat may fire
    const played = reduce(intro, { type: 'play' });
    expect(played.story!.caddiedRoundIds).toContain('sandy-sandsaver');
    // …and now her quest opens up.
    expect(questOfferable(played.story!, 'sandy-sandsaver')).toBe(true);
  });
});

describe('Story star-map navigation (GS-story-map-nav)', () => {
  it('accepts + tees off an ally quest STRAIGHT from the star-map world dossier', () => {
    // Sandy's quest is offerable (recruited, carried a round, flown on) at Chapter 2.
    const story = {
      ...defaultStoryState('feather-fade'),
      chapter: 2,
      hiredCaddyIds: ['sandy-sandsaver'],
      activeCaddyId: 'sandy-sandsaver',
      caddiedRoundIds: ['sandy-sandsaver'],
      clearedWorldIds: ['standrews-18', 'verdant-18'],
    };
    expect(questOfferable(story, 'sandy-sandsaver')).toBe(true);
    const map = { ...initState('nav-seed', {}, undefined, story), screen: 'starTour' as const };
    // Tap "Accept & play" on the desert-18 dossier — accepts the quest AND builds its round in one action.
    const res = reduce(map, { type: 'storyStartQuest', courseId: 'desert-18' });
    expect(res.story!.activeQuestId).toBe('quest-sandy');
    expect(res.run.storyRound).toBe(true);
    expect(res.run.storyQuest).toBe('quest-sandy');
    expect(res.run.staticCourseId).toBe('desert-18');
    // GS-story-quest-offer-beat: the star-map path shows the ally's PITCH first (it used to skip it entirely),
    // then continues to the round intro (a lore beat may fire after).
    expect(res.screen).toBe('storyQuestOffer');
    expect(res.pendingQuestOffer!.questId).toBe('quest-sandy');
    let intro = reduce(res, { type: 'storyQuestOfferContinue' });
    if (intro.screen === 'lore') intro = reduce(intro, { type: 'dismissLore' });
    expect(intro.screen).toBe('intro');
  });

  it('storyStartQuest is a no-op for a world with no offerable/active quest', () => {
    const story = { ...defaultStoryState('feather-fade'), chapter: 1, clearedWorldIds: ['standrews-18'] };
    const map = { ...initState('nav-seed', {}, undefined, story), screen: 'starTour' as const };
    const res = reduce(map, { type: 'storyStartQuest', courseId: 'verdant-18' });
    expect(res).toBe(map); // unchanged (no quest plays here yet)
  });

  it('enters the Sigil tournament DIRECTLY from the star map, and backing out returns to the map', () => {
    // Chapter 1, qualified in both events → the Emerald Invitational is unlocked.
    const story = {
      ...defaultStoryState('feather-fade'),
      chapter: 1,
      clearedWorldIds: ['standrews-18'],
      qualifierResults: { 'verdant2-18': { place: 1, field: 16 }, 'desert-18': { place: 1, field: 16 } },
    };
    const map = { ...initState('nav-seed', {}, undefined, story), screen: 'starTour' as const };
    const lobby = reduce(map, { type: 'openStoryTournament' });
    expect(lobby.screen).toBe('storyTournament');
    expect(lobby.storyTournamentReturn).toBe('starTour');
    // Backing out returns to the star map (not the clubhouse).
    const back = reduce(lobby, { type: 'exitStoryTournament' });
    expect(back.screen).toBe('starTour');

    // From the clubhouse the lobby still returns to the clubhouse (byte-identical behaviour).
    const fromHub = reduce({ ...map, screen: 'story' as const }, { type: 'openStoryTournament' });
    expect(fromHub.storyTournamentReturn).toBe('story');
    expect(reduce(fromHub, { type: 'exitStoryTournament' }).screen).toBe('story');
  });

  it('openStoryTournament from the star map is refused when no tournament is unlocked', () => {
    const story = { ...defaultStoryState('feather-fade'), chapter: 1, clearedWorldIds: ['standrews-18'] };
    const map = { ...initState('nav-seed', {}, undefined, story), screen: 'starTour' as const };
    expect(reduce(map, { type: 'openStoryTournament' })).toBe(map);
  });
});
