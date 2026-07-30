import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { defaultSave, exportSave, migrate, readSave, SAVE_VERSION, type Save } from '../src/save/schema';
import { loadSave, writeSave, unreadableSaveText, SAVE_KEY } from '../src/save/storage';
import {
  loadCampaignStore,
  writeCampaignStore,
  writeStory,
  clearStory,
  invalidateCampaignCache,
  STORY_KEY,
} from '../src/save/storyStore';
import {
  saveIntegrity,
  readOnly,
  recordFault,
  clearFault,
  resetIntegrityForTests,
  faultHeadline,
  faultExplanation,
  faultRescue,
  type SaveFault,
} from '../src/save/integrity';
import { buildBackup, parseBackup, BackupError, BACKUP_VERSION } from '../src/save/backup';
import { campaignStoreTooNew, emptyCampaignStore, CAMPAIGN_STORE_VERSION } from '../src/sim/rpg/storyRoster';
import { defaultStoryState, STORY_VERSION } from '../src/sim/rpg/story';

/**
 * THIS BUILD NEVER OVERWRITES DATA IT COULD NOT FULLY READ (GS-save-integrity).
 *
 * `migrate()` answered every unreadable blob with `defaultSave()`, so a caller could not tell "there
 * was nothing here" from "there is something here and I don't understand it" — and the next ordinary
 * persist laid the empty default over the real save. Three blobs died that way: one from a newer
 * build (the Capacitor shell never auto-updates, and export→import between two builds is the
 * DOCUMENTED workflow), one belonging to another game on itch's shared CDN origin, and one truncated
 * mid-write.
 *
 * The most important test in this file is the FIRST one. `readSave` was carved out of `migrate`'s
 * body, and a refactor of that function that quietly changed one input's outcome is a save-losing bug
 * wearing a tidy-up's clothes — so `migrate` is pinned against every shape of input rather than
 * trusted to have been "just moved".
 */

/** A localStorage stand-in — the pattern from `save-durability.test.ts`. */
function fakeStorage(seed: Record<string, string> = {}): Storage {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const g = {
  set localStorage(v: unknown) {
    vi.stubGlobal('localStorage', v);
  },
};

beforeEach(() => {
  resetIntegrityForTests();
  invalidateCampaignCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetIntegrityForTests();
  invalidateCampaignCache();
});

/** A real, current, migrated save — the "everything is fine" input. */
const goodSave = (): Save => ({ ...defaultSave(), shards: 4321, bestStableford: 77 });

describe('migrate() behaves EXACTLY as it did before readSave was carved out of it', () => {
  // Every shape the old body could be handed. Each must still produce a playable save, and each
  // must still produce a DEFAULT for the inputs that used to fall through — the refactor is only
  // safe if this list is unchanged in behaviour.
  const fallsBackToDefault: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a string', 'nope'],
    ['an array', [1, 2, 3]],
    ['an empty object', {}],
    ['an object with no version', { shards: 10 }],
    ['a version that is not a number', { version: 'thirty-three' }],
    ['a NaN version', { version: Number.NaN }],
    ['a version of 0', { version: 0 }],
    ['a negative version', { version: -1 }],
    ['a fractional version', { version: 32.5 }],
    ['a version from the future', { version: SAVE_VERSION + 1 }],
    ['a version far in the future', { version: 9999 }],
  ];

  for (const [label, input] of fallsBackToDefault) {
    it(`still returns a fresh default for ${label}`, () => {
      const got = migrate(input);
      // Compared field-by-field against a genuine default: `savedAt` is the only field a default can
      // carry from an input, and none of these inputs has one.
      expect(got).toEqual(defaultSave());
    });
  }

  it('still migrates a current save through unchanged', () => {
    const save = goodSave();
    expect(migrate(JSON.parse(exportSave(save)))).toEqual(save);
  });

  it('still walks the whole chain from v1', () => {
    const got = migrate({ version: 1, bestStableford: 12, bestDistance: 3 });
    expect(got.version).toBe(SAVE_VERSION);
    expect(got.bestStableford).toBe(12);
  });
});

describe('readSave says WHICH of the three things went wrong', () => {
  it('reads a current save', () => {
    const read = readSave(JSON.parse(exportSave(goodSave())));
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.save.shards).toBe(4321);
  });

  it('calls a later version "newer", and reports the version it found', () => {
    const read = readSave({ version: SAVE_VERSION + 1, shards: 999 });
    expect(read).toEqual({ ok: false, why: 'newer', found: SAVE_VERSION + 1 });
  });

  it('calls a blob with no schema version "foreign" — the itch shared-bucket case', () => {
    // Another game's `fc_save`: perfectly good JSON, nothing to do with us.
    const read = readSave({ playerName: 'Zoe', level: 4, inventory: ['sword'] });
    expect(read).toEqual({ ok: false, why: 'foreign' });
  });

  it('calls a version it has no path for "foreign", not "newer"', () => {
    // 0 is not from the future — it is not one of ours at all.
    expect(readSave({ version: 0 })).toEqual({ ok: false, why: 'foreign' });
  });

  it('never reports ok for anything migrate would have defaulted', () => {
    for (const input of [null, [], {}, { version: 0 }, { version: SAVE_VERSION + 1 }]) {
      expect(readSave(input).ok, JSON.stringify(input)).toBe(false);
    }
  });
});

describe('boot refuses to overwrite a save it could not read', () => {
  it('loads a good save and stays writable', () => {
    g.localStorage = fakeStorage({ [SAVE_KEY]: exportSave(goodSave()) });
    expect(loadSave().shards).toBe(4321);
    expect(readOnly()).toBe(false);
    expect(writeSave(defaultSave())).toBe(true);
  });

  it('an EMPTY store is not a fault — a new player must be able to save', () => {
    g.localStorage = fakeStorage();
    expect(loadSave()).toEqual(defaultSave());
    expect(readOnly(), 'nothing stored is not the same as unreadable').toBe(false);
    expect(writeSave(defaultSave())).toBe(true);
  });

  it('a NEWER save goes read-only and is left byte-for-byte alone', () => {
    const theirs = JSON.stringify({ version: SAVE_VERSION + 1, shards: 50_000, futureField: true });
    const s = fakeStorage({ [SAVE_KEY]: theirs });
    g.localStorage = s;

    expect(loadSave()).toEqual(defaultSave()); // playable
    expect(readOnly()).toBe(true);
    expect(saveIntegrity.fault).toEqual({ why: 'newer', blob: 'save', found: SAVE_VERSION + 1 });

    // The write that used to destroy it.
    expect(writeSave({ ...defaultSave(), shards: 0 })).toBe(false);
    expect(s.getItem(SAVE_KEY), 'the stored save was modified').toBe(theirs);
  });

  it("a FOREIGN blob is left alone too — it is somebody else's data", () => {
    const theirs = JSON.stringify({ playerName: 'Zoe', level: 4 });
    const s = fakeStorage({ [SAVE_KEY]: theirs });
    g.localStorage = s;

    loadSave();
    expect(saveIntegrity.fault?.why).toBe('foreign');
    expect(writeSave(defaultSave())).toBe(false);
    expect(s.getItem(SAVE_KEY)).toBe(theirs);
  });

  it('CORRUPT bytes are kept, not replaced', () => {
    const truncated = '{"version":33,"shards":120,"ownedShi';
    const s = fakeStorage({ [SAVE_KEY]: truncated });
    g.localStorage = s;

    loadSave();
    expect(saveIntegrity.fault?.why).toBe('corrupt');
    expect(writeSave(defaultSave())).toBe(false);
    expect(s.getItem(SAVE_KEY)).toBe(truncated);
  });

  it('hands the exact stored bytes to the rescue download, and nothing when there is no fault', () => {
    const theirs = JSON.stringify({ version: SAVE_VERSION + 3, shards: 1 });
    g.localStorage = fakeStorage({ [SAVE_KEY]: theirs });
    loadSave();
    expect(unreadableSaveText()).toBe(theirs);

    resetIntegrityForTests();
    g.localStorage = fakeStorage({ [SAVE_KEY]: exportSave(goodSave()) });
    loadSave();
    expect(unreadableSaveText(), 'a save that loaded fine has nothing to rescue').toBeNull();
  });
});

describe('campaigns get the same protection, in the direction they actually fail', () => {
  it('spots a campaign from a newer build', () => {
    const roster = {
      version: CAMPAIGN_STORE_VERSION,
      campaigns: { 'feather-fade': { ...defaultStoryState('feather-fade'), version: STORY_VERSION + 1 } },
    };
    expect(campaignStoreTooNew(roster)).toBe(STORY_VERSION + 1);
  });

  it('spots a newer ENVELOPE', () => {
    expect(campaignStoreTooNew({ version: CAMPAIGN_STORE_VERSION + 1, campaigns: {} })).toBe(
      CAMPAIGN_STORE_VERSION + 1,
    );
  });

  it('spots a newer PRE-ROSTER bare campaign', () => {
    expect(campaignStoreTooNew({ ...defaultStoryState('larry-lob'), version: STORY_VERSION + 1 })).toBe(
      STORY_VERSION + 1,
    );
  });

  it('passes everything this build understands', () => {
    expect(campaignStoreTooNew({ version: CAMPAIGN_STORE_VERSION, campaigns: {} })).toBeNull();
    expect(campaignStoreTooNew(defaultStoryState('bo-bounce'))).toBeNull();
    expect(campaignStoreTooNew(null)).toBeNull();
    // An OLDER campaign is not a fault — that is what the migration is for.
    expect(campaignStoreTooNew({ version: 1, campaigns: { a: { version: 1, characterId: 'a' } } })).toBeNull();
  });

  it('a newer campaign is NOT silently truncated back over itself', () => {
    // The slow puncture: `migrateStory` is field-by-field and never reads `version`, so it would keep
    // the fields this build knows, drop the rest, and the write-after-every-action would persist that.
    const theirs = JSON.stringify({
      version: CAMPAIGN_STORE_VERSION,
      campaigns: { 'feather-fade': { ...defaultStoryState('feather-fade'), version: STORY_VERSION + 1, chapter: 4 } },
    });
    const s = fakeStorage({ [STORY_KEY]: theirs });
    g.localStorage = s;

    expect(loadCampaignStore()).toEqual(emptyCampaignStore());
    expect(saveIntegrity.fault).toEqual({ why: 'newer', blob: 'story', found: STORY_VERSION + 1 });

    expect(writeStory(defaultStoryState('feather-fade'))).toBe(false);
    expect(writeCampaignStore(emptyCampaignStore())).toBe(false);
    clearStory();
    expect(s.getItem(STORY_KEY), 'the stored campaigns were modified').toBe(theirs);
  });

  it('a readable roster still loads and writes normally', () => {
    const s = fakeStorage();
    g.localStorage = s;
    expect(writeStory(defaultStoryState('woo-wedge'))).toBe(true);
    expect(Object.keys(loadCampaignStore().campaigns)).toEqual(['woo-wedge']);
    expect(readOnly()).toBe(false);
  });
});

describe('an import refuses rather than reporting success over nothing', () => {
  it('throws on a bundle whose INNER SAVE is from a newer build', () => {
    // The hole: `BACKUP_VERSION` tracks the CONTAINER (v1 held save v27 through v32), so a future
    // save version arrives inside a perfectly valid current bundle. `migrate()` returned a default
    // without throwing, so the old guard never fired and the import wiped a real save while the UI
    // said it had worked.
    const bundle = JSON.stringify({
      kind: 'far-carry-backup',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      save: { version: SAVE_VERSION + 1, shards: 12_345 },
      campaigns: emptyCampaignStore(),
    });
    expect(() => parseBackup(bundle)).toThrow(BackupError);
    expect(() => parseBackup(bundle)).toThrow(/newer version/i);
  });

  it('throws on a bundle whose CAMPAIGNS are from a newer build', () => {
    const bundle = JSON.stringify({
      kind: 'far-carry-backup',
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      save: goodSave(),
      campaigns: {
        version: CAMPAIGN_STORE_VERSION,
        campaigns: { 'larry-lob': { ...defaultStoryState('larry-lob'), version: STORY_VERSION + 1 } },
      },
    });
    expect(() => parseBackup(bundle)).toThrow(/newer version/i);
  });

  it('throws on a bare save from a newer build', () => {
    expect(() => parseBackup(JSON.stringify({ version: SAVE_VERSION + 1, shards: 1 }))).toThrow(BackupError);
  });

  it('still accepts every backup this build can actually read', () => {
    const json = buildBackup({
      save: goodSave(),
      campaigns: emptyCampaignStore(),
      settings: { sound: false },
      exportedAt: '2026-07-30T00:00:00.000Z',
    });
    const b = parseBackup(json);
    expect(b.save.shards).toBe(4321);
    expect(b.settings).toEqual({ sound: false });
  });

  it('still accepts a legacy bare save', () => {
    expect(parseBackup(exportSave(goodSave())).save.shards).toBe(4321);
  });
});

describe('the fault is cleared only by the one write that is allowed to proceed', () => {
  it('clearFault re-opens writing', () => {
    g.localStorage = fakeStorage({ [SAVE_KEY]: JSON.stringify({ version: SAVE_VERSION + 1 }) });
    loadSave();
    expect(writeSave(defaultSave())).toBe(false);
    clearFault();
    expect(writeSave(defaultSave())).toBe(true);
  });

  it('the FIRST fault wins, so the player gets one message rather than a queue', () => {
    recordFault({ why: 'newer', blob: 'save', found: 99 }, 'a');
    recordFault({ why: 'corrupt', blob: 'story' }, 'b');
    expect(saveIntegrity.fault).toEqual({ why: 'newer', blob: 'save', found: 99 });
    expect(saveIntegrity.raw).toBe('a');
  });
});

describe('the copy names the real cause, and both surfaces read the same builders', () => {
  const faults: SaveFault[] = [
    { why: 'newer', blob: 'save', found: 99 },
    { why: 'foreign', blob: 'save' },
    { why: 'corrupt', blob: 'save' },
    { why: 'newer', blob: 'story', found: 99 },
    { why: 'foreign', blob: 'story' },
    { why: 'corrupt', blob: 'story' },
  ];

  for (const fault of faults) {
    it(`says something specific and non-empty for ${fault.why}/${fault.blob}`, () => {
      for (const line of [faultHeadline(fault), faultExplanation(fault), faultRescue(fault)]) {
        expect(line.length).toBeGreaterThan(20);
        expect(line).not.toMatch(/undefined|NaN|\[object/);
      }
    });
  }

  it('never tells the player their save is gone — it is not, that is the point', () => {
    for (const fault of faults) {
      const all = `${faultHeadline(fault)} ${faultExplanation(fault)} ${faultRescue(fault)}`;
      expect(all, `"${all}"`).not.toMatch(/\blost\b|\bdeleted\b|\bgone\b|\berased\b/i);
    }
  });

  it('the "newer" copy tells the player the fix is to update', () => {
    expect(faultExplanation({ why: 'newer', blob: 'save', found: 34 })).toMatch(/update/i);
  });

  it('the "foreign" copy names the shared-storage cause rather than blaming the player', () => {
    expect(faultExplanation({ why: 'foreign', blob: 'save' })).toMatch(/itch|another game/i);
  });

  it('every arm promises the game has stopped saving, because it has', () => {
    for (const fault of faults) {
      expect(faultExplanation(fault)).toMatch(/stopped saving/i);
    }
  });
});
