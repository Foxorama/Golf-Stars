/**
 * The Story-Tour CAMPAIGN ROSTER (GS-story-campaign-slots) — one campaign per golfer.
 *
 * What makes this worth guarding: `fc_story` used to hold ONE `StoryState`, and this change turns it
 * into a container. Every player upgrading the game is holding the old shape. So the assertion this
 * file exists for is the very first one below — **a pre-roster campaign is adopted, never dropped** —
 * and the rest of it defends the ways a container can quietly lose a slot: an upsert that rebuilds the
 * map from stale memory, a pointer left dangling at a deleted campaign, a key that disagrees with the
 * campaign it indexes.
 *
 * Pure: `storyRoster.ts` touches no localStorage and no DOM, so all of this runs in node.
 */

import { describe, it, expect } from 'vitest';
import {
  CAMPAIGN_STORE_VERSION,
  activeCampaign,
  campaignCount,
  campaignFor,
  campaignList,
  campaignOverwriteWarning,
  championCampaigns,
  deleteCampaign,
  emptyCampaignStore,
  hasChampion,
  isChampion,
  migrateCampaignStore,
  setActiveCampaign,
  upsertCampaign,
} from '../src/sim/rpg/storyRoster';
import { STORY_VERSION, defaultStoryState, type StoryState } from '../src/sim/rpg/story';
import { DEFAULT_SHIP_ID } from '../src/sim/rpg/ships';

/** A campaign with real, distinctive progress in every field a player would hate to lose. */
function richCampaign(characterId = 'feather-fade'): StoryState {
  return {
    ...defaultStoryState(characterId),
    credits: 3175,
    chapter: 5,
    unlockedWorldIds: ['verdant-18', 'inferno-18', 'swamp-18'],
    clearedWorldIds: ['verdant-18', 'inferno-18'],
    worldBest: { 'verdant-18': { toPar: -4, strokes: 68, par: 72, seed: 'abc' } },
    ownedClubIds: ['D', 'putter', 'club:solar:5i', 'quest:sandy'],
    equippedBagIds: ['D', 'putter', 'quest:sandy'],
    // The starter is always owned (`migrateStory` guarantees it), so name it explicitly rather than
    // letting the migration prepend it and make the round-trip comparison lopsided.
    ownedShipIds: [DEFAULT_SHIP_ID, 'wyrm-ship'],
    equippedShipId: 'wyrm-ship',
    ownedShipUpgradeIds: ['upg:weapon:nova', 'upg:engine:ion', 'upg:shield:aegis'],
    ownedGearIds: ['gear:glove:solar'],
    equippedGear: { glove: 'gear:glove:solar' },
    hiredCaddyIds: ['driver-dan', 'penelope-putter'],
    activeCaddyId: 'driver-dan',
    trophyIds: ['t1', 't2', 't3', 't4', 't5'],
    seenStoryBeats: { 'interlude-warden': true },
    completed: true,
    alignment: 'herald',
    sigil1Partner: 'longshot-larry',
    sigil2Partner: 'backspin-bo',
    completedQuestIds: ['quest:sandy'],
    caddiedRoundIds: ['driver-dan'],
    qualifierResults: { 'verdant-18': { place: 2, field: 12 } },
    campaignSeed: 'c12345',
    qualifierPartners: { 'verdant-18': 'longshot-larry' },
  };
}

describe('legacy adoption — nobody loses the campaign they already have', () => {
  it('adopts a pre-roster bare StoryState as a one-slot roster', () => {
    // THE line this file exists for. Every player upgrading the game has this shape in `fc_story`.
    const legacy = richCampaign('huang-woo-hook');
    const store = migrateCampaignStore(legacy);
    expect(campaignCount(store)).toBe(1);
    expect(store.campaigns['huang-woo-hook']).toBeTruthy();
    expect(store.activeId).toBe('huang-woo-hook'); // and it is what "Continue" resumes
  });

  it('preserves EVERY field of an adopted campaign', () => {
    const legacy = richCampaign();
    const adopted = migrateCampaignStore(legacy).campaigns['feather-fade']!;
    // Compare against what `migrateStory` makes of it — the roster must add nothing and drop nothing.
    expect(adopted).toEqual({ ...legacy, version: STORY_VERSION });
    // Spot-check the ones that would hurt most, so a regression names itself in the failure output.
    expect(adopted.credits).toBe(3175);
    expect(adopted.trophyIds).toHaveLength(5);
    expect(adopted.equippedBagIds).toEqual(['D', 'putter', 'quest:sandy']);
    expect(adopted.ownedShipUpgradeIds).toHaveLength(3);
    expect(adopted.equippedShipId).toBe('wyrm-ship');
    expect(adopted.alignment).toBe('herald');
    expect(adopted.completed).toBe(true);
  });

  it('an adopted COMPLETED campaign is still a Star Tour champion', () => {
    // The upgrade must not cost anyone the character they earned in free-roam.
    const store = migrateCampaignStore(richCampaign('backspin-bo'));
    expect(hasChampion(store)).toBe(true);
    expect(isChampion(store, 'backspin-bo')).toBe(true);
    expect(championCampaigns(store).map((c) => c.characterId)).toEqual(['backspin-bo']);
  });

  it('adopts an OLD-version bare campaign through the story migration', () => {
    // A v6 blob (pre-`campaignSeed`) still upgrades — the roster defers to `migrateStory` for the
    // campaign's own version chain rather than re-implementing it.
    const v6 = { ...richCampaign('longshot-larry'), version: 6, campaignSeed: undefined };
    const adopted = migrateCampaignStore(v6).campaigns['longshot-larry']!;
    expect(adopted.version).toBe(STORY_VERSION);
    expect(adopted.chapter).toBe(5);
    expect(adopted.credits).toBe(3175);
  });
});

describe('roster shape', () => {
  it('round-trips a multi-golfer roster through JSON', () => {
    const store = upsertCampaign(upsertCampaign(emptyCampaignStore(), richCampaign()), defaultStoryState('longshot-larry'));
    const back = migrateCampaignStore(JSON.parse(JSON.stringify(store)));
    expect(campaignCount(back)).toBe(2);
    expect(back.campaigns['feather-fade']?.credits).toBe(3175);
    expect(back.campaigns['longshot-larry']?.chapter).toBe(0);
  });

  it('re-keys a slot whose key disagrees with its campaign (the campaign is the truth)', () => {
    const store = migrateCampaignStore({
      version: CAMPAIGN_STORE_VERSION,
      campaigns: { 'some-stale-key': richCampaign('feather-fade') },
    });
    expect(campaignFor(store, 'feather-fade')?.credits).toBe(3175);
    expect(campaignFor(store, 'some-stale-key')).toBeNull();
  });

  it('lists campaigns in a STABLE order regardless of insertion order', () => {
    const a = upsertCampaign(upsertCampaign(emptyCampaignStore(), defaultStoryState('backspin-bo')), defaultStoryState('feather-fade'));
    const b = upsertCampaign(upsertCampaign(emptyCampaignStore(), defaultStoryState('feather-fade')), defaultStoryState('backspin-bo'));
    expect(campaignList(a).map((c) => c.characterId)).toEqual(campaignList(b).map((c) => c.characterId));
  });

  describe('never throws on junk — a corrupt blob must not brick the game', () => {
    for (const [label, raw] of [
      ['null', null],
      ['undefined', undefined],
      ['a string', 'hello'],
      ['a number', 42],
      ['an array', [1, 2, 3]],
      ['an empty object', {}],
      ['campaigns: not an object', { campaigns: 'nope' }],
      ['campaigns: an array', { campaigns: [1, 2] }],
      ['a slot holding junk', { campaigns: { 'feather-fade': 'nope' } }],
      ['a campaign with no characterId', { campaigns: { x: { version: 7, credits: 5 } } }],
    ] as const) {
      it(label, () => {
        expect(() => migrateCampaignStore(raw)).not.toThrow();
        const store = migrateCampaignStore(raw);
        expect(store.version).toBe(CAMPAIGN_STORE_VERSION);
        expect(typeof store.campaigns).toBe('object');
      });
    }

    it('drops only the unreadable slot, keeping its neighbours', () => {
      // Losing one corrupt campaign is a bad day; losing the other three because of it is the failure
      // this whole feature is meant to prevent.
      const store = migrateCampaignStore({
        version: CAMPAIGN_STORE_VERSION,
        campaigns: { 'feather-fade': richCampaign(), broken: null, alsoBroken: 'nope' },
      });
      expect(campaignCount(store)).toBe(1);
      expect(campaignFor(store, 'feather-fade')?.credits).toBe(3175);
    });
  });
});

describe('slot isolation — one golfer’s campaign can never touch another’s', () => {
  it('upsert replaces only its own slot', () => {
    const feather = richCampaign();
    let store = upsertCampaign(emptyCampaignStore(), feather);
    store = upsertCampaign(store, defaultStoryState('longshot-larry'));
    // Larry starts over from scratch — Feather is untouched, champion and all.
    store = upsertCampaign(store, { ...defaultStoryState('longshot-larry'), chapter: 0 });
    expect(campaignFor(store, 'feather-fade')).toEqual(feather);
    expect(isChampion(store, 'feather-fade')).toBe(true);
    expect(campaignFor(store, 'longshot-larry')?.chapter).toBe(0);
  });

  it('upsert does NOT move the active pointer', () => {
    // Star Tour persists the champion it free-roams as after every action. If that moved the pointer,
    // free-roaming as Feather would silently hijack the "Continue" of a campaign you left mid-chapter.
    let store = setActiveCampaign(upsertCampaign(emptyCampaignStore(), defaultStoryState('longshot-larry')), 'longshot-larry');
    store = upsertCampaign(store, richCampaign('feather-fade'));
    expect(store.activeId).toBe('longshot-larry');
    expect(activeCampaign(store)?.characterId).toBe('longshot-larry');
  });

  it('setActiveCampaign moves it, and ignores a golfer with no campaign', () => {
    let store = upsertCampaign(emptyCampaignStore(), defaultStoryState('feather-fade'));
    store = setActiveCampaign(store, 'feather-fade');
    expect(store.activeId).toBe('feather-fade');
    store = setActiveCampaign(store, 'nobody-here');
    expect(store.activeId).toBe('feather-fade'); // a stale id can never orphan the roster
  });

  it('ignores an upsert of a campaign with no protagonist', () => {
    const store = upsertCampaign(emptyCampaignStore(), { ...defaultStoryState(), characterId: '' });
    expect(campaignCount(store)).toBe(0);
  });
});

describe('activeCampaign — what "Continue" resumes', () => {
  it('is the only campaign when there is exactly one, pointer or not', () => {
    const store = upsertCampaign(emptyCampaignStore(), richCampaign());
    expect(store.activeId).toBeUndefined();
    expect(activeCampaign(store)?.characterId).toBe('feather-fade');
  });

  it('falls back to a real campaign with several present and no pointer — never null', () => {
    // A boot path must always have an answer: returning null here would show a player who owns two
    // campaigns "Begin a new campaign" and no way back to either of them.
    const store = upsertCampaign(upsertCampaign(emptyCampaignStore(), defaultStoryState('feather-fade')), defaultStoryState('longshot-larry'));
    expect(activeCampaign(store)).not.toBeNull();
    expect(campaignFor(store, activeCampaign(store)!.characterId)).toBeTruthy();
  });

  it('an explicitly set pointer always wins over the fallback', () => {
    let store = upsertCampaign(upsertCampaign(emptyCampaignStore(), defaultStoryState('backspin-bo')), richCampaign('longshot-larry'));
    store = setActiveCampaign(store, 'longshot-larry');
    expect(activeCampaign(store)?.characterId).toBe('longshot-larry');
  });

  it('is null on an empty roster', () => {
    expect(activeCampaign(emptyCampaignStore())).toBeNull();
  });

  it('falls back rather than resolving a dangling pointer', () => {
    const store = { ...upsertCampaign(emptyCampaignStore(), richCampaign()), activeId: 'gone-golfer' };
    expect(activeCampaign(store)?.characterId).toBe('feather-fade');
    // …and a persisted dangling pointer is dropped on load rather than kept around to confuse later.
    expect(migrateCampaignStore(store).activeId).toBeUndefined();
  });
});

describe('delete', () => {
  it('removes a slot and clears a pointer that aimed at it', () => {
    let store = upsertCampaign(upsertCampaign(emptyCampaignStore(), richCampaign()), defaultStoryState('longshot-larry'));
    store = setActiveCampaign(store, 'feather-fade');
    store = deleteCampaign(store, 'feather-fade');
    expect(campaignFor(store, 'feather-fade')).toBeNull();
    expect(store.activeId).toBeUndefined();
    expect(campaignFor(store, 'longshot-larry')).toBeTruthy(); // the neighbour survives
  });

  it('keeps a pointer aimed elsewhere, and no-ops on a golfer with no campaign', () => {
    let store = upsertCampaign(upsertCampaign(emptyCampaignStore(), richCampaign()), defaultStoryState('longshot-larry'));
    store = setActiveCampaign(store, 'longshot-larry');
    store = deleteCampaign(store, 'feather-fade');
    expect(store.activeId).toBe('longshot-larry');
    expect(deleteCampaign(store, 'nobody-here')).toBe(store);
  });
});

describe('champions — the Star Tour roster', () => {
  it('lists only COMPLETED campaigns', () => {
    let store = upsertCampaign(emptyCampaignStore(), richCampaign('feather-fade')); // completed
    store = upsertCampaign(store, { ...defaultStoryState('longshot-larry'), chapter: 3 }); // mid-campaign
    store = upsertCampaign(store, { ...defaultStoryState('backspin-bo'), chapter: 5, completed: true });
    expect(championCampaigns(store).map((c) => c.characterId)).toEqual(['backspin-bo', 'feather-fade']);
    expect(isChampion(store, 'longshot-larry')).toBe(false);
    expect(hasChampion(store)).toBe(true);
  });

  it('a champion carries the loadout they finished with', () => {
    // This is what Star Tour free-roams as, so the fields it reads must survive the roster intact.
    const champ = championCampaigns(upsertCampaign(emptyCampaignStore(), richCampaign()))[0]!;
    expect(champ.equippedBagIds).toEqual(['D', 'putter', 'quest:sandy']);
    expect(champ.equippedGear).toEqual({ glove: 'gear:glove:solar' });
    expect(champ.activeCaddyId).toBe('driver-dan');
    expect(champ.equippedShipId).toBe('wyrm-ship');
    expect(champ.ownedShipUpgradeIds).toHaveLength(3); // the finale replay's arsenal
    expect(champ.alignment).toBe('herald'); // …and which boss it fights
  });

  it('no champions on an empty or all-unfinished roster', () => {
    expect(hasChampion(emptyCampaignStore())).toBe(false);
    expect(hasChampion(upsertCampaign(emptyCampaignStore(), defaultStoryState('feather-fade')))).toBe(false);
  });
});

describe('overwrite warning — the player is told before anything is destroyed', () => {
  it('is null for a golfer with no campaign (starting one costs nothing)', () => {
    const store = upsertCampaign(emptyCampaignStore(), richCampaign());
    expect(campaignOverwriteWarning(store, 'longshot-larry')).toBeNull();
  });

  it('flags a mid-campaign overwrite, without calling it a champion', () => {
    const store = upsertCampaign(emptyCampaignStore(), { ...defaultStoryState('longshot-larry'), chapter: 3 });
    const w = campaignOverwriteWarning(store, 'longshot-larry')!;
    expect(w.champion).toBe(false);
    expect(w.chapter).toBe(3);
  });

  it('flags a COMPLETED overwrite as costing the Star Tour champion too', () => {
    // The severe case: replacing this campaign also replaces that golfer's free-roam character.
    const store = upsertCampaign(emptyCampaignStore(), richCampaign());
    const w = campaignOverwriteWarning(store, 'feather-fade')!;
    expect(w.champion).toBe(true);
    expect(w.existing.credits).toBe(3175);
  });

  it('agrees with what an upsert actually does', () => {
    // The warning must describe the real consequence — a screen that says "this replaces a champion"
    // while the write leaves it alone (or vice versa) is worse than no warning at all.
    const store = upsertCampaign(emptyCampaignStore(), richCampaign());
    const warned = campaignOverwriteWarning(store, 'feather-fade');
    const after = upsertCampaign(store, defaultStoryState('feather-fade'));
    expect(warned).not.toBeNull();
    expect(isChampion(after, 'feather-fade')).toBe(false); // the champion did indeed go
    expect(campaignFor(after, 'feather-fade')?.chapter).toBe(0);
  });
});
