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
import { BACKUP_KIND, BACKUP_VERSION, BackupError, buildBackup, describeBackup, parseBackup } from '../src/save/backup';
import { defaultSave, exportSave, SAVE_VERSION } from '../src/save/schema';
import { defaultStoryState } from '../src/sim/rpg/story';
import { campaignCount, emptyCampaignStore, upsertCampaign, type CampaignStore } from '../src/sim/rpg/storyRoster';

const stamp = '2026-07-25T20:00:00.000Z';

/** A roster built from campaigns, the way the store would hold them. */
const roster = (...stories: ReturnType<typeof defaultStoryState>[]): CampaignStore =>
  stories.reduce((s, story) => upsertCampaign(s, story), emptyCampaignStore());

const bundle = (over: Partial<Parameters<typeof buildBackup>[0]> = {}): string =>
  buildBackup({ save: defaultSave(), campaigns: emptyCampaignStore(), settings: null, exportedAt: stamp, ...over });

describe('backup format (GS-save-transfer)', () => {
  it('round-trips a save, a campaign and settings', () => {
    const save = { ...defaultSave(), shards: 4321, bestStableford: 37, maxAscension: 6 };
    const story = { ...defaultStoryState(), chapter: 3, credits: 900 };
    const json = bundle({ save, campaigns: roster(story), settings: { sound: false, aimMode: 'safe' } });

    const back = parseBackup(json);
    expect(back.kind).toBe(BACKUP_KIND);
    expect(back.exportedAt).toBe(stamp);
    expect(back.save.shards).toBe(4321);
    expect(back.save.bestStableford).toBe(37);
    expect(back.save.maxAscension).toBe(6);
    expect(back.campaigns.campaigns[story.characterId]?.chapter).toBe(3);
    expect(back.campaigns.campaigns[story.characterId]?.credits).toBe(900);
    expect(back.settings).toEqual({ sound: false, aimMode: 'safe' });
  });

  it('carries the Story Tour campaign — the whole reason a backup is a BUNDLE, not a save', () => {
    // Exporting `gs_save` alone would silently drop a player's entire campaign, which is precisely
    // the "worked, but lost half your stuff" failure a backup feature exists to prevent.
    const story = { ...defaultStoryState(), chapter: 4 };
    expect(parseBackup(bundle({ campaigns: roster(story) })).campaigns.campaigns[story.characterId]?.chapter).toBe(4);
    // And a bundle with NO campaign parses as an empty roster (⇒ the importer clears, not leaves).
    expect(campaignCount(parseBackup(bundle()).campaigns)).toBe(0);
  });

  it('carries EVERY golfer’s campaign, not just the active one (GS-story-campaign-slots)', () => {
    // The roster is the reason this bump happened: a bundle that carried one campaign would silently
    // drop three of a four-golfer roster on any device transfer.
    const feather = { ...defaultStoryState('feather-fade'), chapter: 5, completed: true, credits: 4200 };
    const larry = { ...defaultStoryState('longshot-larry'), chapter: 2 };
    const bo = { ...defaultStoryState('backspin-bo'), chapter: 1 };
    const back = parseBackup(bundle({ campaigns: roster(feather, larry, bo) }));
    expect(campaignCount(back.campaigns)).toBe(3);
    expect(back.campaigns.campaigns['feather-fade']?.completed).toBe(true);
    expect(back.campaigns.campaigns['feather-fade']?.credits).toBe(4200);
    expect(back.campaigns.campaigns['longshot-larry']?.chapter).toBe(2);
    expect(back.campaigns.campaigns['backspin-bo']?.chapter).toBe(1);
  });

  it('reads a v1 bundle — every backup ever written still restores its campaign', () => {
    // The shape shipped before the roster: one campaign under `story`. It must land in the roster as a
    // one-slot entry, or upgrading the game would strand every backup file a player already holds.
    const legacy = JSON.stringify({
      kind: BACKUP_KIND,
      version: 1,
      exportedAt: stamp,
      save: defaultSave(),
      story: { ...defaultStoryState('huang-woo-hook'), chapter: 3, credits: 555, completed: true },
      settings: null,
    });
    const back = parseBackup(legacy);
    expect(campaignCount(back.campaigns)).toBe(1);
    expect(back.campaigns.campaigns['huang-woo-hook']?.chapter).toBe(3);
    expect(back.campaigns.campaigns['huang-woo-hook']?.credits).toBe(555);
    // A completed v1 campaign is still a champion after the upgrade — the Star Tour character survives.
    expect(back.campaigns.campaigns['huang-woo-hook']?.completed).toBe(true);
  });

  it('a v1 bundle with no campaign parses as an empty roster', () => {
    const legacy = JSON.stringify({ kind: BACKUP_KIND, version: 1, exportedAt: stamp, save: defaultSave(), story: null, settings: null });
    expect(campaignCount(parseBackup(legacy).campaigns)).toBe(0);
  });

  it('writes v2, so an OLDER build refuses the file loudly instead of misreading the roster', () => {
    // An old build checks `version > BACKUP_VERSION(1)` and throws its "made by a newer version"
    // message. That refusal is the feature: handed the roster through the old `story` field it would
    // instead have restored one mangled campaign and reported success.
    expect(BACKUP_VERSION).toBe(2);
    expect((JSON.parse(bundle()) as { version: number }).version).toBe(2);
  });

  it('still reads a legacy BARE save file (what exportSave has always written)', () => {
    const legacy = exportSave({ ...defaultSave(), shards: 77 });
    const back = parseBackup(legacy);
    expect(back.save.shards).toBe(77);
    expect(campaignCount(back.campaigns)).toBe(0); // honest: there was no campaign in the file
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
      parseBackup(bundle({ save: { ...defaultSave(), shards: 1500 }, campaigns: roster({ ...defaultStoryState(), chapter: 2 }) })),
    );
    const all = lines.join(' ');
    expect(all).toContain('1,500');
    expect(all).toMatch(/chapter 2/);
    // A campaign-less file must SAY so, so a player spots an unexpectedly empty restore.
    expect(describeBackup(parseBackup(bundle())).join(' ')).toContain('No Story Tour');
  });

  it('names every campaign in the summary, and marks champions (GS-story-campaign-slots)', () => {
    // Import REPLACES the whole roster, so the confirm step has to show what is about to go — a player
    // overwriting three campaigns with one must see that before they tap, not discover it after.
    const lines = describeBackup(
      parseBackup(
        bundle({
          campaigns: roster(
            { ...defaultStoryState('feather-fade'), chapter: 5, completed: true },
            { ...defaultStoryState('longshot-larry'), chapter: 2 },
          ),
        }),
      ),
    );
    const all = lines.join(' ');
    expect(all).toContain('2 Story Tour campaigns');
    expect(all).toMatch(/Feather/i);
    expect(all).toMatch(/Larry/i);
    expect(all).toMatch(/champion/i); // the completed one is flagged as a Star Tour character
    expect(all).toMatch(/chapter 2/);
  });

  it('is stable JSON a human can eyeball (pretty-printed, kind + version first)', () => {
    const json = bundle();
    expect(json).toContain('\n');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(Object.keys(parsed).slice(0, 3)).toEqual(['kind', 'version', 'exportedAt']);
  });
});
