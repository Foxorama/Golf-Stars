/**
 * Save transfer (GS-save-transfer) — the portable backup FORMAT.
 *
 * What makes this worth guarding: import is the one destructive operation in the game. The failure
 * mode to design against is not "it crashed" but "it succeeded and silently replaced a real save
 * with an empty one" — which is exactly what `schema.ts`'s `importSave` does by contract (it
 * swallows and returns `defaultSave()`, correct for a boot path, catastrophic for an import). So the
 * central assertion here is that `parseBackup` REFUSES anything it can't trust.
 *
 * Pure format tests: `save/backup.ts` touches no localStorage and no DOM, so all of this runs in node.
 */

import { describe, it, expect } from 'vitest';
import { BACKUP_KIND, BackupError, buildBackup, describeBackup, parseBackup } from '../src/save/backup';
import { defaultSave, exportSave, SAVE_VERSION } from '../src/save/schema';
import { defaultStoryState } from '../src/sim/rpg/story';

const stamp = '2026-07-25T20:00:00.000Z';

const bundle = (over: Partial<Parameters<typeof buildBackup>[0]> = {}): string =>
  buildBackup({ save: defaultSave(), story: null, settings: null, exportedAt: stamp, ...over });

describe('backup format (GS-save-transfer)', () => {
  it('round-trips a save, a campaign and settings', () => {
    const save = { ...defaultSave(), shards: 4321, bestStableford: 37, maxAscension: 6 };
    const story = { ...defaultStoryState(), chapter: 3, credits: 900 };
    const json = bundle({ save, story, settings: { sound: false, aimMode: 'safe' } });

    const back = parseBackup(json);
    expect(back.kind).toBe(BACKUP_KIND);
    expect(back.exportedAt).toBe(stamp);
    expect(back.save.shards).toBe(4321);
    expect(back.save.bestStableford).toBe(37);
    expect(back.save.maxAscension).toBe(6);
    expect(back.story?.chapter).toBe(3);
    expect(back.story?.credits).toBe(900);
    expect(back.settings).toEqual({ sound: false, aimMode: 'safe' });
  });

  it('carries the Story Tour campaign — the whole reason a backup is a BUNDLE, not a save', () => {
    // Exporting `gs_save` alone would silently drop a player's entire campaign, which is precisely
    // the "worked, but lost half your stuff" failure a backup feature exists to prevent.
    const story = { ...defaultStoryState(), chapter: 4 };
    expect(parseBackup(bundle({ story })).story?.chapter).toBe(4);
    // And a bundle with NO campaign parses as an explicit null (⇒ the importer clears, not leaves).
    expect(parseBackup(bundle({ story: null })).story).toBeNull();
  });

  it('still reads a legacy BARE save file (what exportSave has always written)', () => {
    const legacy = exportSave({ ...defaultSave(), shards: 77 });
    const back = parseBackup(legacy);
    expect(back.save.shards).toBe(77);
    expect(back.story).toBeNull(); // honest: there was no campaign in the file
  });

  describe('refuses what it cannot trust — never a silent default save', () => {
    const rejects = (label: string, text: string) => {
      it(label, () => {
        expect(() => parseBackup(text)).toThrow(BackupError);
        // The message is shown to the player verbatim, so it has to actually say something.
        try {
          parseBackup(text);
        } catch (e) {
          expect((e as BackupError).message.length).toBeGreaterThan(20);
        }
      });
    };
    rejects('not JSON at all', 'this is not json {{{');
    rejects('truncated JSON', '{"kind":"golf-stars-backup","save":');
    rejects('a JSON array', '[1,2,3]');
    rejects('a bare string', '"hello"');
    rejects('an unrelated JSON object', JSON.stringify({ hello: 'world' }));
    rejects('a bundle with no save', JSON.stringify({ kind: BACKUP_KIND, version: 1, save: null }));
    rejects(
      'a bundle from a NEWER format version',
      JSON.stringify({ kind: BACKUP_KIND, version: 99, save: defaultSave() }),
    );

    it('does NOT quietly return an empty save for garbage (the whole point)', () => {
      // If this ever regresses to `importSave`'s swallow-and-default behaviour, a player importing a
      // wrong file would be told it worked and lose everything.
      let threw = false;
      try {
        parseBackup('{"not":"a save"}');
      } catch {
        threw = true;
      }
      expect(threw, 'garbage must throw, not resolve to a default save').toBe(true);
    });
  });

  it('migrates an OLD save version through the existing chain', () => {
    // A v1 blob is the oldest thing anyone could be holding; it must come out at the current schema.
    const v1 = JSON.stringify({ version: 1, bestStableford: 12, bestDistance: 300 });
    const back = parseBackup(v1);
    expect(back.save.version).toBe(SAVE_VERSION);
    expect(back.save.bestStableford).toBe(12);
  });

  it('summarises a backup for the confirm step', () => {
    const lines = describeBackup(
      parseBackup(bundle({ save: { ...defaultSave(), shards: 1500 }, story: { ...defaultStoryState(), chapter: 2 } })),
    );
    const all = lines.join(' ');
    expect(all).toContain('1,500');
    expect(all).toMatch(/chapter 2/);
    // A campaign-less file must SAY so, so a player spots an unexpectedly empty restore.
    expect(describeBackup(parseBackup(bundle())).join(' ')).toContain('No Story Tour');
  });

  it('is stable JSON a human can eyeball (pretty-printed, kind + version first)', () => {
    const json = bundle();
    expect(json).toContain('\n');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(Object.keys(parsed).slice(0, 3)).toEqual(['kind', 'version', 'exportedAt']);
  });
});
