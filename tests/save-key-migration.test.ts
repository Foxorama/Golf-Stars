import { describe, it, expect, vi, afterEach } from 'vitest';
import { defaultSave } from '../src/save/schema';
import { emptyCampaignStore, upsertCampaign } from '../src/sim/rpg/storyRoster';
import { defaultStoryState } from '../src/sim/rpg/story';

/**
 * The pre-rename read path (GS-release-identity).
 *
 * The rename moved every persisted key from `gs_*` to `fc_*`. That is only safe because each
 * loader falls back to the old spelling — otherwise a device that played under the old name boots
 * to an empty save while its real one is still sitting in localStorage, untouched and invisible.
 * That is the worst possible shape of data loss: nothing is deleted, so nothing looks broken.
 *
 * These run against a STUBBED `localStorage` rather than a browser, deliberately. The behaviour is
 * a property of the loaders, not of any DOM, and a node test runs in CI on every push — the browser
 * pane cannot even reload a page to check it, and the Playwright tests skip on Windows.
 *
 * Each test re-imports its module under `vi.resetModules()` because these modules cache the parsed
 * blob at module scope; a shared instance would answer from the previous test's storage.
 */

/** A minimal in-memory `Storage`. `Map` rather than an object so keys like `length` are safe. */
function fakeStorage(seed: Record<string, string> = {}): Storage & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage & { map: Map<string, string> };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('a save written before the rename still loads', () => {
  it('reads the main save from the legacy key, and writes back to the current one', async () => {
    const legacy = { ...defaultSave(), shards: 8675, lifetimeAces: 3 };
    const store = fakeStorage({ gs_save: JSON.stringify(legacy) });
    vi.stubGlobal('localStorage', store);

    const { loadSave, writeSave, SAVE_KEY } = await import('../src/save/storage');

    // The fallback fired: the player's shards and aces came back, not a fresh default.
    const loaded = loadSave();
    expect(loaded.shards).toBe(8675);
    expect(loaded.lifetimeAces).toBe(3);

    // And the next write is canonical — the move completes itself on first save.
    writeSave(loaded);
    expect(SAVE_KEY).toBe('fc_save');
    expect(JSON.parse(store.map.get('fc_save')!).shards).toBe(8675);
  });

  it('prefers the current key when both exist (the legacy blob is stale by then)', async () => {
    const store = fakeStorage({
      gs_save: JSON.stringify({ ...defaultSave(), shards: 111 }),
      fc_save: JSON.stringify({ ...defaultSave(), shards: 999 }),
    });
    vi.stubGlobal('localStorage', store);

    const { loadSave } = await import('../src/save/storage');
    expect(loadSave().shards).toBe(999);
  });

  it('still returns a default save when neither key is present', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const { loadSave } = await import('../src/save/storage');
    expect(loadSave().shards).toBe(0);
  });
});

describe('a Story Tour campaign written before the rename still loads', () => {
  it('reads the roster from the legacy key', async () => {
    const roster = upsertCampaign(emptyCampaignStore(), defaultStoryState('feather'));
    const store = fakeStorage({ gs_story: JSON.stringify(roster) });
    vi.stubGlobal('localStorage', store);

    const { loadCampaignStore, STORY_KEY } = await import('../src/save/storyStore');
    expect(STORY_KEY).toBe('fc_story');
    expect(Object.keys(loadCampaignStore().campaigns)).toContain('feather');
  });

  it('writes the roster back under the current key', async () => {
    const store = fakeStorage({ gs_story: JSON.stringify(upsertCampaign(emptyCampaignStore(), defaultStoryState('feather'))) });
    vi.stubGlobal('localStorage', store);

    const { loadCampaignStore, writeCampaignStore } = await import('../src/save/storyStore');
    writeCampaignStore(loadCampaignStore());
    expect(store.map.has('fc_story')).toBe(true);
  });
});

describe('preferences written before the rename still load', () => {
  it('reads settings from the legacy key and merges them over the defaults', async () => {
    // Deliberately PARTIAL: a real old blob predates whatever fields were added since, and the
    // merge-over-defaults behaviour has to survive the key change too.
    const store = fakeStorage({ gs_settings: JSON.stringify({ sound: false, uiScale: 1.3 }) });
    vi.stubGlobal('localStorage', store);

    const { getSettings, SETTINGS_KEY } = await import('../src/settings');
    const s = getSettings();
    expect(SETTINGS_KEY).toBe('fc_settings');
    expect(s.sound).toBe(false); // came from the legacy blob
    expect(s.uiScale).toBe(1.3);
    expect(s.music).toBe(true); // filled in from defaults, not lost
  });

  it('writes preferences back under the current key', async () => {
    const store = fakeStorage({ gs_settings: JSON.stringify({ sound: false }) });
    vi.stubGlobal('localStorage', store);

    const { setSetting } = await import('../src/settings');
    setSetting('music', false);
    expect(store.map.has('fc_settings')).toBe(true);
    // The legacy blob is left where it is — reading is a fallback, not a destructive migration,
    // so a player who downgrades mid-transition still finds their old preferences intact.
    expect(store.map.has('gs_settings')).toBe(true);
  });
});
