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
  it('default save carries the current version (10) with the starter fleet + empty wardrobe + per-character maps', () => {
    expect(SAVE_VERSION).toBe(10);
    const d = defaultSave();
    expect(d.version).toBe(10);
    expect(d.shards).toBe(0);
    expect(d.metaUpgrades).toEqual({});
    expect(d.maxAscension).toBe(0);
    expect(d.lifetimeAces).toBe(0);
    expect(d.ownedShips).toEqual([DEFAULT_SHIP_ID]);
    expect(d.ownedApparel).toEqual([]);
    expect(d.shipByCharacter).toEqual({});
    expect(d.hatByCharacter).toEqual({});
    expect(d.shirtByCharacter).toEqual({});
    expect(d.bagTier).toBe('common');
    expect(d.unlockedClubsByCharacter).toEqual({});
  });

  it('round-trips a v10 save through export/import (per-character ship + outfit + bag + club unlocks preserved)', () => {
    const save = {
      ...defaultSave(),
      bestStableford: 41,
      bestDistance: 9,
      shards: 120,
      lifetimeAces: 3,
      metaUpgrades: { 'vet-hands': 2, 'deep-pockets': 1 },
      ownedShips: [DEFAULT_SHIP_ID, 'wagon-gold', 'racer-redline'],
      ownedApparel: ['cap-classic', 'suit-space'],
      shipByCharacter: { 'feather-fade': 'wagon-gold', 'longshot-larry': 'racer-redline' },
      hatByCharacter: { 'feather-fade': 'cap-classic' },
      shirtByCharacter: { 'longshot-larry': 'suit-space' },
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
      version: 10,
      shards: 120,
      bestDistance: 9,
      maxAscension: 0,
      lifetimeAces: 3,
      ownedShips: [DEFAULT_SHIP_ID, 'wagon-gold', 'racer-redline'],
      ownedApparel: ['cap-classic', 'suit-space'],
      shipByCharacter: { 'feather-fade': 'wagon-gold', 'longshot-larry': 'racer-redline' },
      hatByCharacter: { 'feather-fade': 'cap-classic' },
      shirtByCharacter: { 'longshot-larry': 'suit-space' },
      bagTier: 'epic',
      unlockedClubsByCharacter: { 'feather-fade': ['7i', '3W'] },
      metaUpgrades: { 'vet-hands': 2, 'deep-pockets': 1 },
      activeRun: { seed: 7, perks: ['gyro', 'precision-chip', 'precision-chip'], meta: { 'vet-hands': 2 }, bagTier: 'epic' },
    });
  });

  it('migrates a v9 blob forward to v10 (seeds the old GLOBAL look onto every character, drops marketSeed)', () => {
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
    expect(s.version).toBe(10);
    expect(s.shards).toBe(95);
    expect(s.maxAscension).toBe(3);
    expect(s.bagTier).toBe('rare');
    expect(s.ownedApparel).toEqual(['cap-classic', 'suit-space']);
    expect(s.unlockedClubsByCharacter).toEqual({ 'backspin-bo': ['6i'] });
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

  it('migrates a v8 blob forward to v10 (preserves ships, seeds empty per-character maps)', () => {
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
    expect(s.version).toBe(10);
    expect(s.shards).toBe(95);
    expect(s.bagTier).toBe('rare');
    expect(s.ownedShips).toEqual([DEFAULT_SHIP_ID, 'wagon-gold']);
    expect(s.ownedApparel).toEqual(['cap-classic']);
    expect(s.shipByCharacter[CHARACTERS[0]!.id]).toBe('wagon-gold');
    expect(s.hatByCharacter[CHARACTERS[0]!.id]).toBe('cap-classic');
    expect(s.unlockedClubsByCharacter).toEqual({});
  });

  it('migrates a v6 blob forward to v10 (seeds an empty wardrobe + common bag, preserves the fleet)', () => {
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
    expect(s.version).toBe(10);
    expect(s.shards).toBe(70);
    expect(s.ownedShips).toEqual([DEFAULT_SHIP_ID, 'racer-redline']);
    expect(s.shipByCharacter[CHARACTERS[0]!.id]).toBe('racer-redline');
    expect(s.ownedApparel).toEqual([]);
    expect(s.hatByCharacter).toEqual({});
    expect(s.bagTier).toBe('common');
  });

  it('drops a per-character ship/garment the player does not own (defensive backfill)', () => {
    const s = migrate({
      ...defaultSave(),
      ownedShips: [DEFAULT_SHIP_ID],
      ownedApparel: ['polo-classic'],
      shipByCharacter: { 'feather-fade': 'wagon-cosmic' }, // not owned → dropped
      hatByCharacter: { 'feather-fade': 'tophat-ace' }, // not owned → dropped
      shirtByCharacter: { 'feather-fade': 'polo-classic' }, // owned → kept
    });
    expect(s.shipByCharacter).toEqual({}); // unowned ship dropped
    expect(s.hatByCharacter).toEqual({}); // unowned hat dropped
    expect(s.shirtByCharacter).toEqual({ 'feather-fade': 'polo-classic' });
  });

  it('migrates a v2 blob forward to v10 (drops dead credits, seeds meta + ascension + aces + fleet)', () => {
    const v2: SaveV2 = {
      version: 2,
      credits: 0,
      bestStableford: 30,
      bestDistance: 8,
      activeRun: { seed: 5, stopIndex: 2, distanceFromStart: 8, credits: 50, perks: ['gyro'] },
    };
    const s = migrate(v2);
    expect(s.version).toBe(10);
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

  it('migrates a v1 blob all the way forward to v10', () => {
    const v1: SaveV1 = {
      version: 1,
      runSeed: 99,
      distanceFromStart: 5,
      credits: 120,
      bestStableford: 30,
    };
    const s = migrate(v1);
    expect(s.version).toBe(10);
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
