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

describe('save schema', () => {
  it('default save carries the current version (3)', () => {
    expect(SAVE_VERSION).toBe(3);
    const d = defaultSave();
    expect(d.version).toBe(3);
    expect(d.shards).toBe(0);
    expect(d.metaUpgrades).toEqual({});
  });

  it('round-trips a v3 save through export/import', () => {
    const save = {
      ...defaultSave(),
      bestStableford: 41,
      bestDistance: 9,
      shards: 120,
      metaUpgrades: { 'vet-hands': 2, 'deep-pockets': 1 },
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
      version: 3,
      shards: 120,
      bestDistance: 9,
      metaUpgrades: { 'vet-hands': 2, 'deep-pockets': 1 },
      activeRun: { seed: 7, perks: ['gyro', 'precision-chip', 'precision-chip'], meta: { 'vet-hands': 2 } },
    });
  });

  it('migrates a v2 blob forward to v3 (drops dead credits, seeds empty meta)', () => {
    const v2: SaveV2 = {
      version: 2,
      credits: 0,
      bestStableford: 30,
      bestDistance: 8,
      activeRun: { seed: 5, stopIndex: 2, distanceFromStart: 8, credits: 50, perks: ['gyro'] },
    };
    const v3 = migrate(v2);
    expect(v3.version).toBe(3);
    expect(v3.shards).toBe(0);
    expect(v3.metaUpgrades).toEqual({});
    expect(v3.bestDistance).toBe(8);
    expect(v3.activeRun).toMatchObject({ seed: 5, perks: ['gyro'] });
    expect('credits' in v3).toBe(false);
  });

  it('migrates a v1 blob all the way forward to v3', () => {
    const v1: SaveV1 = {
      version: 1,
      runSeed: 99,
      distanceFromStart: 5,
      credits: 120,
      bestStableford: 30,
    };
    const v3 = migrate(v1);
    expect(v3.version).toBe(3);
    expect(v3.shards).toBe(0);
    expect(v3.bestStableford).toBe(30);
    expect(v3.bestDistance).toBe(5); // distanceFromStart folded into bestDistance
    expect(v3.activeRun).toMatchObject({ seed: 99, distanceFromStart: 5, perks: [] });
  });

  it('a v1 blob with no run migrates with no active run', () => {
    const v3 = migrate({ version: 1, distanceFromStart: 0, credits: 0, bestStableford: 0 });
    expect(v3.activeRun).toBeUndefined();
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
