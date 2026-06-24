import { describe, it, expect } from 'vitest';
import {
  SAVE_VERSION,
  defaultSave,
  exportSave,
  importSave,
  migrate,
  type SaveV1,
} from '../src/save/schema';

describe('save schema', () => {
  it('default save carries the current version (2)', () => {
    expect(SAVE_VERSION).toBe(2);
    expect(defaultSave().version).toBe(2);
  });

  it('round-trips a v2 save through export/import', () => {
    const save = {
      ...defaultSave(),
      credits: 250,
      bestStableford: 41,
      bestDistance: 9,
      activeRun: { seed: 7, stopIndex: 3, distanceFromStart: 9, credits: 250, perks: ['gyro'] },
    };
    const restored = importSave(exportSave(save));
    expect(restored).toMatchObject({
      version: 2,
      credits: 250,
      bestDistance: 9,
      activeRun: { seed: 7, perks: ['gyro'] },
    });
  });

  it('migrates a v1 blob forward to v2', () => {
    const v1: SaveV1 = {
      version: 1,
      runSeed: 99,
      distanceFromStart: 5,
      credits: 120,
      bestStableford: 30,
    };
    const v2 = migrate(v1);
    expect(v2.version).toBe(2);
    expect(v2.credits).toBe(120);
    expect(v2.bestStableford).toBe(30);
    expect(v2.bestDistance).toBe(5); // distanceFromStart folded into bestDistance
    expect(v2.activeRun).toMatchObject({ seed: 99, distanceFromStart: 5, perks: [] });
  });

  it('a v1 blob with no run migrates with no active run', () => {
    const v2 = migrate({ version: 1, distanceFromStart: 0, credits: 0, bestStableford: 0 });
    expect(v2.activeRun).toBeUndefined();
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
