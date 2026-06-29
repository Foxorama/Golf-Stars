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

describe('save schema', () => {
  it('default save carries the current version (6) with the starter fleet', () => {
    expect(SAVE_VERSION).toBe(6);
    const d = defaultSave();
    expect(d.version).toBe(6);
    expect(d.shards).toBe(0);
    expect(d.metaUpgrades).toEqual({});
    expect(d.maxAscension).toBe(0);
    expect(d.lifetimeAces).toBe(0);
    expect(d.ownedShips).toEqual([DEFAULT_SHIP_ID]);
    expect(d.selectedShip).toBe(DEFAULT_SHIP_ID);
    expect(d.marketSeed).toBe(0);
  });

  it('round-trips a v6 save through export/import (fleet + selection preserved)', () => {
    const save = {
      ...defaultSave(),
      bestStableford: 41,
      bestDistance: 9,
      shards: 120,
      lifetimeAces: 3,
      metaUpgrades: { 'vet-hands': 2, 'deep-pockets': 1 },
      ownedShips: [DEFAULT_SHIP_ID, 'wagon-gold'],
      selectedShip: 'wagon-gold',
      marketSeed: 4,
      activeRun: {
        seed: 7,
        stopIndex: 3,
        distanceFromStart: 9,
        credits: 250,
        perks: ['gyro', 'precision-chip', 'precision-chip'],
        meta: { 'vet-hands': 2 },
      },
    };
    const restored = importSave(exportSave(save));
    expect(restored).toMatchObject({
      version: 6,
      shards: 120,
      bestDistance: 9,
      maxAscension: 0,
      lifetimeAces: 3,
      ownedShips: [DEFAULT_SHIP_ID, 'wagon-gold'],
      selectedShip: 'wagon-gold',
      marketSeed: 4,
      metaUpgrades: { 'vet-hands': 2, 'deep-pockets': 1 },
      activeRun: { seed: 7, perks: ['gyro', 'precision-chip', 'precision-chip'], meta: { 'vet-hands': 2 } },
    });
  });

  it('migrates a v2 blob forward to v6 (drops dead credits, seeds meta + ascension + aces + fleet)', () => {
    const v2: SaveV2 = {
      version: 2,
      credits: 0,
      bestStableford: 30,
      bestDistance: 8,
      activeRun: { seed: 5, stopIndex: 2, distanceFromStart: 8, credits: 50, perks: ['gyro'] },
    };
    const s = migrate(v2);
    expect(s.version).toBe(6);
    expect(s.shards).toBe(0);
    expect(s.metaUpgrades).toEqual({});
    expect(s.maxAscension).toBe(0);
    expect(s.lifetimeAces).toBe(0);
    expect(s.ownedShips).toEqual([DEFAULT_SHIP_ID]);
    expect(s.selectedShip).toBe(DEFAULT_SHIP_ID);
    expect(s.bestDistance).toBe(8);
    expect(s.activeRun).toMatchObject({ seed: 5, perks: ['gyro'] });
    expect('credits' in s).toBe(false);
  });

  it('migrates a v3 blob forward to v6 (preserves shards + meta, seeds the fleet)', () => {
    const v3 = { version: 3 as const, bestStableford: 12, bestDistance: 14, shards: 88, metaUpgrades: { 'tour-bag': 3 } };
    const s = migrate(v3);
    expect(s.version).toBe(6);
    expect(s.maxAscension).toBe(0);
    expect(s.lifetimeAces).toBe(0);
    expect(s.shards).toBe(88);
    expect(s.metaUpgrades).toEqual({ 'tour-bag': 3 });
    expect(s.ownedShips).toEqual([DEFAULT_SHIP_ID]);
  });

  it('migrates a v5 blob forward to v6 (seeds the cosmetic fleet, preserves the rest)', () => {
    const v5 = {
      version: 5 as const,
      bestStableford: 22,
      bestDistance: 16,
      shards: 50,
      metaUpgrades: { 'tour-bag': 1 },
      maxAscension: 2,
      lifetimeAces: 4,
    };
    const s = migrate(v5);
    expect(s.version).toBe(6);
    expect(s.shards).toBe(50);
    expect(s.maxAscension).toBe(2);
    expect(s.lifetimeAces).toBe(4);
    expect(s.metaUpgrades).toEqual({ 'tour-bag': 1 });
    expect(s.ownedShips).toEqual([DEFAULT_SHIP_ID]);
    expect(s.selectedShip).toBe(DEFAULT_SHIP_ID);
    expect(s.marketSeed).toBe(0);
  });

  it('migrates a v1 blob all the way forward to v6', () => {
    const v1: SaveV1 = {
      version: 1,
      runSeed: 99,
      distanceFromStart: 5,
      credits: 120,
      bestStableford: 30,
    };
    const s = migrate(v1);
    expect(s.version).toBe(6);
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

  it('backfills a selectedShip the player does not own to the default', () => {
    const s = migrate({ ...defaultSave(), selectedShip: 'wagon-cosmic', ownedShips: [DEFAULT_SHIP_ID] });
    expect(s.selectedShip).toBe(DEFAULT_SHIP_ID); // not owned → reset to the default wagon
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
