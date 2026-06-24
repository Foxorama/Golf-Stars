import { describe, it, expect } from 'vitest';
import {
  SAVE_VERSION,
  defaultSave,
  exportSave,
  importSave,
  migrate,
} from '../src/save/schema';

describe('save schema', () => {
  it('default save carries the current version', () => {
    expect(defaultSave().version).toBe(SAVE_VERSION);
  });

  it('round-trips through export/import', () => {
    const save = { ...defaultSave(), credits: 250, bestStableford: 41, distanceFromStart: 3 };
    const restored = importSave(exportSave(save));
    expect(restored).toMatchObject({ credits: 250, bestStableford: 41, distanceFromStart: 3 });
  });

  it('migrates garbage / unknown versions to a clean default', () => {
    expect(migrate(null)).toEqual(defaultSave());
    expect(migrate('not json')).toEqual(defaultSave());
    expect(migrate({ version: 999 })).toEqual(defaultSave());
  });

  it('backfills missing fields on a partial v1 blob', () => {
    const restored = migrate({ version: 1, credits: 10 });
    expect(restored.credits).toBe(10);
    expect(restored.distanceFromStart).toBe(0);
    expect(restored.bestStableford).toBe(0);
  });

  it('importSave tolerates invalid JSON', () => {
    expect(importSave('{ not valid')).toEqual(defaultSave());
  });
});
