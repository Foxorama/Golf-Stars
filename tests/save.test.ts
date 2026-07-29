import { describe, it, expect } from 'vitest';
import {
  SAVE_VERSION,
  defaultSave,
  exportSave,
  importSave,
  migrate,
  type SaveV1,
  type SaveV2,
} from '../src/save/schema';
import { DEFAULT_SHIP_ID } from '../src/sim/rpg/ships';
import { CHARACTERS } from '../src/sim/rpg/characters';

describe('save schema', () => {
  it('default save carries the current version (12) with the starter fleet + empty wardrobe + per-character maps', () => {
    expect(SAVE_VERSION).toBe(32);
    const d = defaultSave();
    expect(d.version).toBe(SAVE_VERSION);
    expect(d.golfBagByCharacter).toEqual({});
    expect(d.driverByCharacter).toEqual({});
    expect(d.endlessBestHoles).toBe(0);
    expect(d.shards).toBe(0);
    expect(d.metaUpgrades).toEqual({});
    expect(d.maxAscension).toBe(0);
    expect(d.maxAscensionByCharacter).toEqual({});
    expect(d.lifetimeAces).toBe(0);
    expect(d.ownedShips).toEqual([DEFAULT_SHIP_ID]);
    expect(d.ownedApparel).toEqual([]);
    expect(d.shipByCharacter).toEqual({});
    expect(d.hatByCharacter).toEqual({});
    expect(d.shirtByCharacter).toEqual({});
    expect(d.pantsByCharacter).toEqual({});
    expect(d.bagTier).toBe('common');
    expect(d.bagTierByCharacter).toEqual({});
    expect(d.unlockedClubsByCharacter).toEqual({});
    expect(d.clubhouseVisit).toBe(0);
    expect(d.marmotBartender).toBe(false);
    expect(d.marmotTips).toBe(0);
    expect(d.endlessRuns).toEqual([]);
    expect(d.reputationByCharacter).toEqual({});
    expect(d.seenLore).toEqual({}); // GS-lore: no story beats seen on a fresh save
    expect(d.starTourUnlocked).toBe(false); // GS-story-startour-unlock: earned by winning the Story finale
  });

  it('migrates a v27 blob forward to v28 (seeds an empty lore-progress set, preserves everything else)', () => {
    const v27 = {
      ...defaultSave(),
      version: 27 as const,
      shards: 41,
      clubhouseVisit: 9,
    } as unknown as Parameters<typeof migrate>[0];
    // Strip the v28-only field so the input is a genuine v27 shape.
    delete (v27 as Record<string, unknown>).seenLore;
    const s = migrate(v27);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.seenLore).toEqual({}); // no beats seen yet
    expect(s.shards).toBe(41);
    expect(s.clubhouseVisit).toBe(9);
  });

  it('migrates a v28 blob forward to v29 (pure version stamp — Star Tour resume fields are optional)', () => {
    const v28 = {
      ...defaultSave(),
      version: 28 as const,
      shards: 17,
      clubhouseVisit: 3,
    } as unknown as Parameters<typeof migrate>[0];
    const s = migrate(v28);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.shards).toBe(17);
    expect(s.clubhouseVisit).toBe(3);
  });

  it('migrates a v29 blob forward to v30 (seeds the permanent Star Tour unlock as not-yet-earned)', () => {
    const v29 = {
      ...defaultSave(),
      version: 29 as const,
      shards: 22,
    } as unknown as Parameters<typeof migrate>[0];
    delete (v29 as Record<string, unknown>).starTourUnlocked; // genuine pre-v30 shape
    const s = migrate(v29);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.starTourUnlocked).toBe(false); // GS-story-startour-unlock: earned by winning the finale
    expect(s.shards).toBe(22);
  });

  it('carries a stroke-play round\'s mid-round progress through the activeRun snapshot round-trip', () => {
    // A parked Star Tour round's hole + scorecard ride on the opaque activeRun snapshot, untouched by
    // migrate (GS-star-tour-resume), so a resume can continue from where it left off.
    const withProgress = {
      ...defaultSave(),
      activeRun: { seed: 7, formatId: 'strokeplay', stopIndex: 0, distanceFromStart: 0, credits: 20, perks: [], stopHoleIndex: 6, stopPlayed: [] },
    } as unknown as Parameters<typeof migrate>[0];
    const s = migrate(withProgress);
    expect(s.version).toBe(SAVE_VERSION);
    expect((s.activeRun as { stopHoleIndex?: number }).stopHoleIndex).toBe(6);
  });

  it('migrates a v20 blob forward to v21 (seeds empty caddy-faction reputation, preserves everything else)', () => {
    const v20 = {
      ...defaultSave(),
      version: 20 as const,
      shards: 33,
      marmotTips: 4,
      clubhouseVisit: 8,
    } as unknown as Parameters<typeof migrate>[0];
    // Strip the v21-only field so the input is a genuine v20 shape.
    delete (v20 as Record<string, unknown>).reputationByCharacter;
    const s = migrate(v20);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.reputationByCharacter).toEqual({}); // nobody has courted a faction yet
    expect(s.shards).toBe(33);
    expect(s.marmotTips).toBe(4);
    expect(s.clubhouseVisit).toBe(8);
  });

  it('migrates a v21 blob forward to v22 (seeds an empty per-character driver map, preserves everything else)', () => {
    const v21 = {
      ...defaultSave(),
      version: 21 as const,
      shards: 27,
      clubhouseVisit: 5,
      reputationByCharacter: { 'longshot-larry': { 'space-pirates': 1 } },
    } as unknown as Parameters<typeof migrate>[0];
    // Strip the v22-only field so the input is a genuine v21 shape.
    delete (v21 as Record<string, unknown>).driverByCharacter;
    const s = migrate(v21);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.driverByCharacter).toEqual({}); // nobody has earned a cosmetic driver yet
    expect(s.shards).toBe(27);
    expect(s.clubhouseVisit).toBe(5);
    // The v25→v26 pirate-faction merge folds the old `space-pirates` standing into `space-bandits`.
    expect(s.reputationByCharacter).toEqual({ 'longshot-larry': { 'space-bandits': 1 } });
  });

  it('migrates a v22 blob forward to v23 (seeds an empty per-golfer bag-tier map, preserves everything else)', () => {
    const v22 = {
      ...defaultSave(),
      version: 22 as const,
      shards: 41,
      bagTier: 'epic' as const,
      ownedApparel: ['thors-hammer'],
      driverByCharacter: { 'feather-fade': 'thors-hammer' },
    } as unknown as Parameters<typeof migrate>[0];
    // Strip the v23-only field so the input is a genuine v22 shape.
    delete (v22 as Record<string, unknown>).bagTierByCharacter;
    const s = migrate(v22);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.bagTierByCharacter).toEqual({}); // everyone follows the owned tier until they pick otherwise
    expect(s.bagTier).toBe('epic');
    // The v24→v25 Trade Market cut refunds 40% of the owned epic bag (old 2000 → +800). Thor's Hammer
    // is earned (cost 0) → no refund.
    expect(s.shards).toBe(41 + 800);
    expect(s.priceRefund).toBe(800);
    expect(s.driverByCharacter).toEqual({ 'feather-fade': 'thors-hammer' });
  });

  it('migrates a v23 blob forward to v24 (pure version stamp; a pre-history active run resumes empty)', () => {
    const v23 = {
      ...defaultSave(),
      version: 23 as const,
      shards: 33,
      activeRun: {
        seed: 7,
        formatId: 'voyage',
        stopIndex: 5,
        distanceFromStart: 30,
        credits: 120,
        perks: ['gyro'],
        // no `history` field → a genuine pre-v24 active run
      },
    } as unknown as Parameters<typeof migrate>[0];
    const s = migrate(v23);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.shards).toBe(33);
    // The history field is optional and absent here → resume treats it as an empty history (unchanged).
    expect((s.activeRun as { history?: unknown }).history).toBeUndefined();
  });

  it('migrates a v24 blob forward to v25 (refunds 40% of owned Trade Market items, stamps the notice)', () => {
    const v24 = {
      ...defaultSave(),
      version: 24 as const,
      shards: 100,
      // wagon-classic is free (skipped); racer-redline old 60 → +24; chopper-thunderbolt old 1250 → +500.
      ownedShips: [DEFAULT_SHIP_ID, 'racer-redline', 'chopper-thunderbolt'],
      // cap-classic old 15 → +6; thors-hammer is EARNED (cost 0) → skipped, never refunded.
      ownedApparel: ['cap-classic', 'thors-hammer'],
      // epic bag tier old 2000 → +800.
      bagTier: 'epic' as const,
    } as unknown as Parameters<typeof migrate>[0];
    delete (v24 as Record<string, unknown>).priceRefund;
    const s = migrate(v24);
    expect(s.version).toBe(SAVE_VERSION);
    const refund = 24 + 500 + 6 + 800; // = 1330
    expect(s.priceRefund).toBe(refund);
    expect(s.shards).toBe(100 + refund);
    // Ownership + bag tier are untouched by the refund.
    expect(s.ownedShips).toEqual([DEFAULT_SHIP_ID, 'racer-redline', 'chopper-thunderbolt']);
    expect(s.bagTier).toBe('epic');
  });

  it('migrates a v24 blob with nothing purchased → no refund, no notice (only the free starter wagon)', () => {
    const v24 = {
      ...defaultSave(),
      version: 24 as const,
      shards: 42,
      ownedShips: [DEFAULT_SHIP_ID],
      ownedApparel: [],
      bagTier: 'common' as const,
    } as unknown as Parameters<typeof migrate>[0];
    delete (v24 as Record<string, unknown>).priceRefund;
    const s = migrate(v24);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.priceRefund).toBeUndefined(); // nothing to refund → no notice
    expect(s.shards).toBe(42);
  });

  it('round-trips an active run’s finished-stop history through export/import (GS-voyage-field)', () => {
    const history = [
      { stopIndex: 0, distanceFromStart: 5, biome: 'meadow', rarity: 'common' as const, stableford: 24, gross: 30, cut: 8, passed: true, creditsEarned: 40, aces: 0 },
      { stopIndex: 1, distanceFromStart: 10, biome: 'dunes', rarity: 'rare' as const, stableford: 19, gross: 33, cut: 10, passed: true, creditsEarned: 55, aces: 1 },
    ];
    const save = {
      ...defaultSave(),
      activeRun: {
        seed: 7,
        formatId: 'voyage',
        stopIndex: 2,
        distanceFromStart: 10,
        credits: 200,
        perks: ['gyro'],
        history,
      },
    } as unknown as Parameters<typeof exportSave>[0];
    const restored = importSave(exportSave(save));
    expect((restored.activeRun as { history?: unknown }).history).toEqual(history);
  });

  it('drops a per-character driver the player does not own (defensive backfill)', () => {
    const s = migrate({
      ...defaultSave(),
      ownedApparel: ['thors-hammer'],
      driverByCharacter: { 'feather-fade': 'thors-hammer', 'huang-woo-hook': 'not-owned' },
    });
    expect(s.driverByCharacter).toEqual({ 'feather-fade': 'thors-hammer' });
  });

  it('preserves caddy-faction reputation through export/import', () => {
    const save = { ...defaultSave(), reputationByCharacter: { 'longshot-larry': { 'long-haul-truckers': 2, 'space-bandits': -3 } } };
    expect(importSave(exportSave(save)).reputationByCharacter).toEqual({
      'longshot-larry': { 'long-haul-truckers': 2, 'space-bandits': -3 },
    });
  });

  it('migrates a v25 blob forward to v26 (merges the two pirate factions into Space Bandits)', () => {
    const v25 = {
      ...defaultSave(),
      version: 25 as const,
      shards: 12,
      reputationByCharacter: {
        // A golfer who courted BOTH old pirate crews — the standings sum onto space-bandits.
        'longshot-larry': { 'space-pirates': 2, 'planet-pirates': -3, 'long-haul-truckers': 5 },
        // A golfer with only one pirate crew — folds straight across.
        'backspin-bo': { 'planet-pirates': 4 },
        // A golfer with no pirate standing — untouched.
        'feather-fade': { 'putters-guild': 1 },
      },
    } as unknown as Parameters<typeof migrate>[0];
    const s = migrate(v25);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.shards).toBe(12);
    expect(s.reputationByCharacter).toEqual({
      'longshot-larry': { 'space-bandits': -1, 'long-haul-truckers': 5 }, // 2 + (−3) = −1, no dead keys
      'backspin-bo': { 'space-bandits': 4 },
      'feather-fade': { 'putters-guild': 1 },
    });
  });

  it('migrates a v15 blob forward to v16 (seeds an empty endless-runs history, preserves everything else)', () => {
    const v15 = {
      ...defaultSave(),
      version: 15 as const,
      shards: 51,
      endlessBestHoles: 42,
      marmotBartender: true,
    } as unknown as Parameters<typeof migrate>[0];
    // Strip the v16-only field so the input is a genuine v15 shape.
    delete (v15 as Record<string, unknown>).endlessRuns;
    const s = migrate(v15);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.endlessRuns).toEqual([]); // no runs recorded yet — the history starts empty
    expect(s.shards).toBe(51);
    expect(s.endlessBestHoles).toBe(42);
    expect(s.marmotBartender).toBe(true);
  });

  it('round-trips endless run records through export/import', () => {
    const save = {
      ...defaultSave(),
      endlessRuns: [
        { characterId: 'feather-fade', tier: 'common' as const, holes: 37, gross: 160, par: 148, ascension: 0, seed: 7 },
        { characterId: 'longshot-larry', tier: 'epic' as const, holes: 12, gross: 55, par: 49, ascension: 0, seed: 9 },
      ],
    };
    const restored = importSave(exportSave(save));
    expect(restored.endlessRuns).toEqual(save.endlessRuns);
  });

  it('round-trips a v13 save through export/import (per-character ship + outfit + pants + bag + club unlocks + lounge visit preserved)', () => {
    const save = {
      ...defaultSave(),
      clubhouseVisit: 7,
      bestStableford: 41,
      bestDistance: 9,
      shards: 120,
      lifetimeAces: 3,
      metaUpgrades: { 'vet-hands': 2, 'deep-pockets': 1 },
      ownedShips: [DEFAULT_SHIP_ID, 'wagon-gold', 'racer-redline'],
      ownedApparel: ['cap-classic', 'suit-space', 'pants-astro'],
      shipByCharacter: { 'feather-fade': 'wagon-gold', 'longshot-larry': 'racer-redline' },
      hatByCharacter: { 'feather-fade': 'cap-classic' },
      shirtByCharacter: { 'longshot-larry': 'suit-space' },
      pantsByCharacter: { 'longshot-larry': 'pants-astro' },
      bagTier: 'epic' as const,
      unlockedClubsByCharacter: { 'feather-fade': ['7i', '3W'] },
      activeRun: {
        seed: 7,
        stopIndex: 3,
        distanceFromStart: 9,
        credits: 250,
        perks: ['gyro', 'precision-chip', 'precision-chip'],
        meta: { 'vet-hands': 2 },
        bagTier: 'epic' as const,
      },
    };
    const restored = importSave(exportSave(save));
    expect(restored).toMatchObject({
      version: SAVE_VERSION,
      clubhouseVisit: 7,
      shards: 120,
      bestDistance: 9,
      maxAscension: 0,
      lifetimeAces: 3,
      ownedShips: [DEFAULT_SHIP_ID, 'wagon-gold', 'racer-redline'],
      ownedApparel: ['cap-classic', 'suit-space', 'pants-astro'],
      shipByCharacter: { 'feather-fade': 'wagon-gold', 'longshot-larry': 'racer-redline' },
      hatByCharacter: { 'feather-fade': 'cap-classic' },
      shirtByCharacter: { 'longshot-larry': 'suit-space' },
      pantsByCharacter: { 'longshot-larry': 'pants-astro' },
      bagTier: 'epic',
      unlockedClubsByCharacter: { 'feather-fade': ['7i', '3W'] },
      metaUpgrades: { 'vet-hands': 2, 'deep-pockets': 1 },
      activeRun: { seed: 7, perks: ['gyro', 'precision-chip', 'precision-chip'], meta: { 'vet-hands': 2 }, bagTier: 'epic' },
    });
  });

  it('migrates a v12 blob forward to v13 (seeds endless progress at 0 + an empty bag map)', () => {
    const v12 = {
      version: 12 as const,
      bestStableford: 25,
      bestDistance: 12,
      shards: 77,
      metaUpgrades: {},
      maxAscension: 3,
      lifetimeAces: 1,
      ownedShips: [DEFAULT_SHIP_ID, 'racer-redline'],
      ownedApparel: ['cap-classic'],
      shipByCharacter: { 'feather-fade': 'racer-redline' },
      hatByCharacter: { 'feather-fade': 'cap-classic' },
      shirtByCharacter: {},
      pantsByCharacter: {},
      bagTier: 'rare' as const,
      unlockedClubsByCharacter: {},
      clubhouseVisit: 4,
    };
    const s = migrate(v12);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.endlessBestHoles).toBe(0);
    expect(s.golfBagByCharacter).toEqual({});
    // Everything else rides through untouched — bar the v24→v25 Trade Market refund: racer-redline
    // (old 60 → +24), cap-classic (old 15 → +6), rare bag (old 500 → +200) = +230.
    expect(s.clubhouseVisit).toBe(4);
    expect(s.shards).toBe(77 + 230);
    expect(s.bagTier).toBe('rare');
    expect(s.shipByCharacter).toEqual({ 'feather-fade': 'racer-redline' });
  });

  it('migrates a v13 blob forward to v14 (seeds an empty per-character Ascension ladder, preserves everything else)', () => {
    const v13 = {
      ...defaultSave(),
      version: 13 as const,
      maxAscension: 5,
      unlockedClubsByCharacter: { 'feather-fade': ['7i'] },
      clubhouseVisit: 6,
    } as unknown as Parameters<typeof migrate>[0];
    // Strip the v14-only field so the input is a genuine v13 shape.
    delete (v13 as Record<string, unknown>).maxAscensionByCharacter;
    const s = migrate(v13);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.maxAscensionByCharacter).toEqual({}); // nobody retroactively granted or locked out
    // Everything else rides through untouched.
    expect(s.maxAscension).toBe(5);
    expect(s.unlockedClubsByCharacter).toEqual({ 'feather-fade': ['7i'] });
    expect(s.clubhouseVisit).toBe(6);
  });

  it('migrates a v14 blob forward to v15 (starts the Marmot Bartender locked, preserves everything else)', () => {
    const v14 = {
      ...defaultSave(),
      version: 14 as const,
      shards: 42,
      clubhouseVisit: 3,
      maxAscensionByCharacter: { 'feather-fade': 2 },
    } as unknown as Parameters<typeof migrate>[0];
    // Strip the v15-only field so the input is a genuine v14 shape.
    delete (v14 as Record<string, unknown>).marmotBartender;
    const s = migrate(v14);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.marmotBartender).toBe(false); // earned in play, never granted retroactively
    expect(s.shards).toBe(42);
    expect(s.clubhouseVisit).toBe(3);
    expect(s.maxAscensionByCharacter).toEqual({ 'feather-fade': 2 });
  });

  it('preserves an earned Marmot Bartender through export/import', () => {
    const save = { ...defaultSave(), marmotBartender: true };
    expect(importSave(exportSave(save)).marmotBartender).toBe(true);
  });

  it('migrates a v19 blob forward to v20 (seeds an empty tip jar, preserves everything else)', () => {
    const v19 = {
      ...defaultSave(),
      version: 19 as const,
      shards: 61,
      marmotBartender: true,
      clubhouseVisit: 4,
    } as unknown as Parameters<typeof migrate>[0];
    // Strip the v20-only field so the input is a genuine v19 shape.
    delete (v19 as Record<string, unknown>).marmotTips;
    const s = migrate(v19);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.marmotTips).toBe(0); // the jar starts empty — the count is earned in play
    expect(s.marmotBartender).toBe(true);
    expect(s.shards).toBe(61);
    expect(s.clubhouseVisit).toBe(4);
  });

  it('preserves the Marmot tip-jar fill through export/import', () => {
    const save = { ...defaultSave(), marmotBartender: true, marmotTips: 6 };
    expect(importSave(exportSave(save)).marmotTips).toBe(6);
  });

  it('migrates a v11 blob forward to v13 (seeds the lounge visit counter at 0, preserves everything else)', () => {
    const v11 = {
      version: 11 as const,
      bestStableford: 22,
      bestDistance: 14,
      shards: 88,
      metaUpgrades: { 'tour-bag': 1 },
      maxAscension: 4,
      lifetimeAces: 2,
      ownedShips: [DEFAULT_SHIP_ID, 'wagon-gold'],
      ownedApparel: ['cap-classic', 'pants-astro'],
      shipByCharacter: { 'feather-fade': 'wagon-gold' },
      hatByCharacter: { 'feather-fade': 'cap-classic' },
      shirtByCharacter: {},
      pantsByCharacter: { 'feather-fade': 'pants-astro' },
      bagTier: 'rare' as const,
      unlockedClubsByCharacter: { 'feather-fade': ['7i'] },
    };
    const s = migrate(v11);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.clubhouseVisit).toBe(0);
    // Everything else rides through untouched — bar the v24→v25 Trade Market refund: wagon-gold
    // (old 140 → +56), cap-classic (+6) & pants-astro (old 280 → +112), rare bag (+200) = +374.
    expect(s.shards).toBe(88 + 374);
    expect(s.maxAscension).toBe(4);
    expect(s.bagTier).toBe('rare');
    expect(s.pantsByCharacter).toEqual({ 'feather-fade': 'pants-astro' });
    expect(s.unlockedClubsByCharacter).toEqual({ 'feather-fade': ['7i'] });
  });

  it('migrates a v10 blob forward to v13 (seeds an empty pants map, preserves ships/hats/shirts)', () => {
    const v10 = {
      version: 10 as const,
      bestStableford: 33,
      bestDistance: 17,
      shards: 140,
      metaUpgrades: {},
      maxAscension: 5,
      lifetimeAces: 4,
      ownedShips: [DEFAULT_SHIP_ID, 'wagon-gold'],
      ownedApparel: ['cap-classic', 'polo-classic'],
      shipByCharacter: { 'feather-fade': 'wagon-gold' },
      hatByCharacter: { 'feather-fade': 'cap-classic' },
      shirtByCharacter: { 'feather-fade': 'polo-classic' },
      bagTier: 'epic' as const,
      unlockedClubsByCharacter: { 'feather-fade': ['7i'] },
    };
    const s = migrate(v10);
    expect(s.version).toBe(SAVE_VERSION);
    // v24→v25 Trade Market refund: wagon-gold (old 140 → +56), cap-classic (+6) & polo-classic (+6),
    // epic bag (old 2000 → +800) = +868.
    expect(s.shards).toBe(140 + 868);
    expect(s.bagTier).toBe('epic');
    expect(s.ownedApparel).toEqual(['cap-classic', 'polo-classic']);
    // Existing per-character ship/hat/shirt are untouched; pants start empty (nothing equipped yet).
    expect(s.shipByCharacter).toEqual({ 'feather-fade': 'wagon-gold' });
    expect(s.hatByCharacter).toEqual({ 'feather-fade': 'cap-classic' });
    expect(s.shirtByCharacter).toEqual({ 'feather-fade': 'polo-classic' });
    expect(s.pantsByCharacter).toEqual({});
    expect(s.unlockedClubsByCharacter).toEqual({ 'feather-fade': ['7i'] });
  });

  it('migrates a v9 blob forward to v13 (seeds the old GLOBAL look onto every character, drops marketSeed)', () => {
    const v9 = {
      version: 9 as const,
      bestStableford: 25,
      bestDistance: 13,
      shards: 95,
      metaUpgrades: { 'tour-bag': 1 },
      maxAscension: 3,
      lifetimeAces: 1,
      ownedShips: [DEFAULT_SHIP_ID, 'wagon-gold'],
      selectedShip: 'wagon-gold',
      marketSeed: 2,
      ownedApparel: ['cap-classic', 'suit-space'],
      equippedHat: 'cap-classic',
      equippedShirt: 'suit-space',
      bagTier: 'rare' as const,
      unlockedClubsByCharacter: { 'backspin-bo': ['6i'] },
    };
    const s = migrate(v9);
    expect(s.version).toBe(SAVE_VERSION);
    // v24→v25 Trade Market refund: wagon-gold (+56), cap-classic (+6) & suit-space (old 280 → +112),
    // rare bag (+200) = +374.
    expect(s.shards).toBe(95 + 374);
    expect(s.maxAscension).toBe(3);
    expect(s.bagTier).toBe('rare');
    expect(s.ownedApparel).toEqual(['cap-classic', 'suit-space']);
    expect(s.unlockedClubsByCharacter).toEqual({ 'backspin-bo': ['6i'] });
    expect(s.pantsByCharacter).toEqual({}); // pants slot seeded empty
    expect('marketSeed' in s).toBe(false);
    expect('selectedShip' in s).toBe(false);
    // Every character inherits the old single global ship + hat + shirt.
    for (const ch of CHARACTERS) {
      expect(s.shipByCharacter[ch.id]).toBe('wagon-gold');
      expect(s.hatByCharacter[ch.id]).toBe('cap-classic');
      expect(s.shirtByCharacter[ch.id]).toBe('suit-space');
    }
  });

  it('a v9 blob on the default wagon seeds NO ship entries (the default needs no map entry)', () => {
    const v9 = { ...defaultSaveV9(), selectedShip: DEFAULT_SHIP_ID };
    const s = migrate(v9);
    expect(s.shipByCharacter).toEqual({});
  });

  it('migrates a v8 blob forward to v13 (preserves ships, seeds empty per-character maps)', () => {
    const v8 = {
      version: 8 as const,
      bestStableford: 25,
      bestDistance: 13,
      shards: 95,
      metaUpgrades: { 'tour-bag': 1 },
      maxAscension: 3,
      lifetimeAces: 1,
      ownedShips: [DEFAULT_SHIP_ID, 'wagon-gold'],
      selectedShip: 'wagon-gold',
      marketSeed: 2,
      ownedApparel: ['cap-classic'],
      equippedHat: 'cap-classic',
      bagTier: 'rare' as const,
    };
    const s = migrate(v8);
    expect(s.version).toBe(SAVE_VERSION);
    // v24→v25 Trade Market refund: wagon-gold (+56), cap-classic (+6), rare bag (+200) = +262.
    expect(s.shards).toBe(95 + 262);
    expect(s.bagTier).toBe('rare');
    expect(s.ownedShips).toEqual([DEFAULT_SHIP_ID, 'wagon-gold']);
    expect(s.ownedApparel).toEqual(['cap-classic']);
    expect(s.shipByCharacter[CHARACTERS[0]!.id]).toBe('wagon-gold');
    expect(s.hatByCharacter[CHARACTERS[0]!.id]).toBe('cap-classic');
    expect(s.pantsByCharacter).toEqual({});
    expect(s.unlockedClubsByCharacter).toEqual({});
  });

  it('migrates a v6 blob forward to v13 (seeds an empty wardrobe + common bag, preserves the fleet)', () => {
    const v6 = {
      version: 6 as const,
      bestStableford: 18,
      bestDistance: 11,
      shards: 70,
      metaUpgrades: { 'tour-bag': 2 },
      maxAscension: 1,
      lifetimeAces: 2,
      ownedShips: [DEFAULT_SHIP_ID, 'racer-redline'],
      selectedShip: 'racer-redline',
      marketSeed: 3,
    };
    const s = migrate(v6);
    expect(s.version).toBe(SAVE_VERSION);
    // v24→v25 Trade Market refund: racer-redline (old 60 → +24); no apparel, common bag = +24.
    expect(s.shards).toBe(70 + 24);
    expect(s.ownedShips).toEqual([DEFAULT_SHIP_ID, 'racer-redline']);
    expect(s.shipByCharacter[CHARACTERS[0]!.id]).toBe('racer-redline');
    expect(s.ownedApparel).toEqual([]);
    expect(s.hatByCharacter).toEqual({});
    expect(s.pantsByCharacter).toEqual({});
    expect(s.bagTier).toBe('common');
  });

  it('drops a per-character ship/garment the player does not own (defensive backfill)', () => {
    const s = migrate({
      ...defaultSave(),
      ownedShips: [DEFAULT_SHIP_ID],
      ownedApparel: ['polo-classic', 'trousers-tour'],
      shipByCharacter: { 'feather-fade': 'wagon-cosmic' }, // not owned → dropped
      hatByCharacter: { 'feather-fade': 'tophat-ace' }, // not owned → dropped
      shirtByCharacter: { 'feather-fade': 'polo-classic' }, // owned → kept
      pantsByCharacter: { 'feather-fade': 'trousers-tour', 'huang-woo-hook': 'knickers-ace' }, // mixed
    });
    expect(s.shipByCharacter).toEqual({}); // unowned ship dropped
    expect(s.hatByCharacter).toEqual({}); // unowned hat dropped
    expect(s.shirtByCharacter).toEqual({ 'feather-fade': 'polo-classic' });
    expect(s.pantsByCharacter).toEqual({ 'feather-fade': 'trousers-tour' }); // unowned pants dropped
  });

  it('migrates a v2 blob forward to v13 (drops dead credits, seeds meta + ascension + aces + fleet)', () => {
    const v2: SaveV2 = {
      version: 2,
      credits: 0,
      bestStableford: 30,
      bestDistance: 8,
      activeRun: { seed: 5, stopIndex: 2, distanceFromStart: 8, credits: 50, perks: ['gyro'] },
    };
    const s = migrate(v2);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.shards).toBe(0);
    expect(s.metaUpgrades).toEqual({});
    expect(s.maxAscension).toBe(0);
    expect(s.lifetimeAces).toBe(0);
    expect(s.ownedShips).toEqual([DEFAULT_SHIP_ID]);
    expect(s.shipByCharacter).toEqual({});
    expect(s.bestDistance).toBe(8);
    expect(s.activeRun).toMatchObject({ seed: 5, perks: ['gyro'] });
    expect('credits' in s).toBe(false);
  });

  it('migrates a v1 blob all the way forward to v13', () => {
    const v1: SaveV1 = {
      version: 1,
      runSeed: 99,
      distanceFromStart: 5,
      credits: 120,
      bestStableford: 30,
    };
    const s = migrate(v1);
    expect(s.version).toBe(SAVE_VERSION);
    expect(s.shards).toBe(0);
    expect(s.ownedShips).toEqual([DEFAULT_SHIP_ID]);
    expect(s.bestStableford).toBe(30);
    expect(s.bestDistance).toBe(5); // distanceFromStart folded into bestDistance
    expect(s.activeRun).toMatchObject({ seed: 99, distanceFromStart: 5, perks: [] });
  });

  it('a v1 blob with no run migrates with no active run', () => {
    const s = migrate({ version: 1, distanceFromStart: 0, credits: 0, bestStableford: 0 });
    expect(s.activeRun).toBeUndefined();
  });

  it('migrates garbage / unknown versions to a clean default', () => {
    expect(migrate(null)).toEqual(defaultSave());
    expect(migrate('not json')).toEqual(defaultSave());
    expect(migrate({ version: 999 })).toEqual(defaultSave());
  });

  it('importSave tolerates invalid JSON', () => {
    expect(importSave('{ not valid')).toEqual(defaultSave());
  });
});

/** A minimal valid v9 blob for migration tests. */
function defaultSaveV9() {
  return {
    version: 9 as const,
    bestStableford: 0,
    bestDistance: 0,
    shards: 0,
    metaUpgrades: {},
    maxAscension: 0,
    lifetimeAces: 0,
    ownedShips: [DEFAULT_SHIP_ID],
    selectedShip: DEFAULT_SHIP_ID,
    marketSeed: 0,
    ownedApparel: [],
    bagTier: 'common' as const,
    unlockedClubsByCharacter: {},
  };
}
