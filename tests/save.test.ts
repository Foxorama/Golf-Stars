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
  it('default save carries the current version (4)', () => {
    expect(SAVE_VERSION).toBe(4);
    const d = defaultSave();
    expect(d.version).toBe(4);
    expect(d.shards).toBe(0);
    expect(d.metaUpgrades).toEqual({});
    expect(d.maxAscension).toBe(0);
  });

  it('round-trips a v4 save through export/import', () => {
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
      version: 4,
      shards: 120,
      bestDistance: 9,
      maxAscension: 0,
      metaUpgrades: { 'vet-hands': 2, 'deep-pockets': 1 },
      activeRun: { seed: 7, perks: ['gyro', 'precision-chip', 'precision-chip'], meta: { 'vet-hands': 2 } },
    });
  });

  it('migrates a v2 blob forward to v4 (drops dead credits, seeds empty meta + ascension)', () => {
    const v2: SaveV2 = {
      version: 2,
      credits: 0,
      bestStableford: 30,
      bestDistance: 8,
      activeRun: { seed: 5, stopIndex: 2, distanceFromStart: 8, credits: 50, perks: ['gyro'] },
    };
    const v4 = migrate(v2);
    expect(v4.version).toBe(4);
    expect(v4.shards).toBe(0);
    expect(v4.metaUpgrades).toEqual({});
    expect(v4.maxAscension).toBe(0);
    expect(v4.bestDistance).toBe(8);
    expect(v4.activeRun).toMatchObject({ seed: 5, perks: ['gyro'] });
    expect('credits' in v4).toBe(false);
  });

  it('migrates a v3 blob forward to v4 (seeds maxAscension, preserves meta)', () => {
    const v3 = { version: 3 as const, bestStableford: 12, bestDistance: 14, shards: 88, metaUpgrades: { 'tour-bag': 3 } };
    const v4 = migrate(v3);
    expect(v4.version).toBe(4);
    expect(v4.maxAscension).toBe(0);
    expect(v4.shards).toBe(88);
    expect(v4.metaUpgrades).toEqual({ 'tour-bag': 3 });
  });

  it('migrates a v1 blob all the way forward to v4', () => {
    const v1: SaveV1 = {
      version: 1,
      runSeed: 99,
      distanceFromStart: 5,
      credits: 120,
      bestStableford: 30,
    };
    const v4 = migrate(v1);
    expect(v4.version).toBe(4);
    expect(v4.shards).toBe(0);
    expect(v4.maxAscension).toBe(0);
    expect(v4.bestStableford).toBe(30);
    expect(v4.bestDistance).toBe(5); // distanceFromStart folded into bestDistance
    expect(v4.activeRun).toMatchObject({ seed: 99, distanceFromStart: 5, perks: [] });
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
