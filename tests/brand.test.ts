import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAME_TITLE, GAME_TITLE_UPPER, APP_VERSION } from '../src/brand';
import { BACKUP_KIND, LEGACY_BACKUP_KIND, buildBackup, parseBackup } from '../src/save/backup';
import { SAVE_KEY } from '../src/save/storage';
import { STORY_KEY } from '../src/save/storyStore';
import { SETTINGS_KEY } from '../src/settings';
import { legacyKeyFor } from '../src/save/legacyKeys';
import { emptyCampaignStore } from '../src/sim/rpg/storyRoster';
import { defaultSave } from '../src/save/schema';

/**
 * Product identity guards (GS-release-identity).
 *
 * A rename is the classic half-landed change: most surfaces move and one keeps shipping the old
 * name. The persisted names moved WITH the product here — once, pre-launch, while it was still
 * free — so these tests pin the harder half: the new spelling is canonical on WRITE, the old one
 * is still accepted on READ, and the service-worker cache prefix agrees across the three files
 * that each spell it out separately.
 */

const src = (p: string): string => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('persisted identifiers renamed forward, with the old spelling still readable', () => {
  it('the canonical keys are the fc_ namespace', () => {
    expect(SAVE_KEY).toBe('fc_save');
    expect(STORY_KEY).toBe('fc_story');
    expect(SETTINGS_KEY).toBe('fc_settings');
    expect(BACKUP_KIND).toBe('far-carry-backup');
  });

  it('legacyKeyFor maps every current key back to its pre-rename spelling', () => {
    expect(legacyKeyFor(SAVE_KEY)).toBe('gs_save');
    expect(legacyKeyFor(STORY_KEY)).toBe('gs_story');
    expect(legacyKeyFor(SETTINGS_KEY)).toBe('gs_settings');
    // A key outside the namespace is passed through untouched rather than mangled.
    expect(legacyKeyFor('unprefixed')).toBe('unprefixed');
  });

  // Every loader must consult the fallback, or a pre-rename device silently starts from scratch
  // while the save it had is still sitting in localStorage under the old key.
  it('every persisted-blob loader falls back to the legacy key', () => {
    for (const f of ['src/save/storage.ts', 'src/save/storyStore.ts', 'src/settings.ts', 'src/app/saveTransfer.ts']) {
      expect(src(f), `${f} must read through legacyKeyFor`).toContain('legacyKeyFor');
    }
  });

  // THE load-bearing assertion. A backup exported before the rename must still restore — the
  // marker is how `parseBackup` recognises a file at all, so dropping the old one turns every
  // pre-rename backup into "that file doesn't look like a save" while new-file round-trips stay green.
  it('imports a pre-rename backup bundle', () => {
    const legacy = JSON.parse(
      buildBackup({ save: defaultSave(), campaigns: emptyCampaignStore(), settings: null, exportedAt: '' }),
    ) as Record<string, unknown>;
    legacy.kind = LEGACY_BACKUP_KIND;

    const parsed = parseBackup(JSON.stringify(legacy));
    // Accepted on the way in, and re-stamped canonical on the way out — old input, new output.
    expect(parsed.kind).toBe(BACKUP_KIND);
  });

  it('a file carrying neither marker is still refused', () => {
    // No numeric `version` on purpose: that is how `parseBackup` recognises a legacy BARE save
    // (`exportSave` output), which is a third accepted shape and would swallow this fixture.
    expect(() => parseBackup(JSON.stringify({ kind: 'someone-elses-game', data: 1 }))).toThrow();
  });

  // The rename is one-way and one-time. A second entry here would mean it happened twice.
  it('legacyKeys.ts carries exactly one legacy namespace', () => {
    const matches = src('src/save/legacyKeys.ts').match(/^const \w+_PREFIX/gm) ?? [];
    expect(matches.length).toBe(2); // LEGACY_PREFIX + CURRENT_PREFIX, no more
  });
});

describe('the service-worker cache prefix agrees across all three files', () => {
  // These cannot share a constant: sw.js is standalone, and index.html's sweep runs before any
  // module. index.html DELETES every cache not carrying the prefix, so a disagreement makes the
  // page nuke its own offline snapshot on every boot — silently, and only when offline.
  const PREFIX = 'far-carry-';

  it('sw.js names and retires caches under the prefix', () => {
    const sw = src('public/sw.js');
    expect(sw).toContain(`var CACHE = '${PREFIX}'`);
    expect(sw).toContain(`k.indexOf('${PREFIX}') === 0`);
    expect(sw, 'the pre-rename prefix must be gone').not.toContain("'golf-stars-'");
  });

  it('the worker version is STAMPED from package.json, never hand-bumped (GS-sw-version)', () => {
    // The last hand-bumped constant in the repo, and the same failure mode `%GS_VERSION%` was
    // introduced to kill for the boot watchdog: forgetting it leaves returning offline players on the
    // PREVIOUS build's snapshot for one more boot — silent, and only visible offline.
    const sw = src('public/sw.js');
    expect(sw, 'the source must carry the placeholder, not a version').toContain("'fc-pwa-%GS_VERSION%'");
    expect(sw, 'a literal version means somebody has to remember to bump it').not.toMatch(
      /fc-pwa-\d+\.\d+\.\d+/,
    );

    // And the BUILT worker must actually carry the number — a placeholder that ships unsubstituted is
    // a cache name that never changes, which is the same bug with extra steps.
    const built = resolve(__dirname, '../dist/sw.js');
    if (!existsSync(built)) return; // dist is built by globalSetup; skip if a run has none
    const out = readFileSync(built, 'utf8');
    const version = (JSON.parse(src('package.json')) as { version: string }).version;
    expect(out).toContain(`'fc-pwa-${version}'`);
    expect(out, 'the placeholder shipped unsubstituted').not.toContain('%GS_VERSION%');
    expect(out, 'the built worker must still name the same cache prefix').toContain(`var CACHE = '${PREFIX}'`);
  });

  it("index.html's foreign-cache sweep spares exactly that prefix", () => {
    const html = src('index.html');
    expect(html).toContain(`k.indexOf('${PREFIX}') !== 0`);
    expect(html).not.toContain("k.indexOf('golf-stars-')");
  });
});

describe('the product name is single-sourced', () => {
  it('exposes a title, a wordmark form, and a version', () => {
    expect(GAME_TITLE.trim()).toBe(GAME_TITLE);
    expect(GAME_TITLE.length).toBeGreaterThan(0);
    expect(GAME_TITLE_UPPER).toBe(GAME_TITLE.toUpperCase());
    // Either a real semver from package.json, or the honest dev marker — never a silent blank.
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+(-\w+)?$/);
  });

  it('the shipped version tracks package.json', () => {
    const pkg = JSON.parse(src('package.json')) as { version: string };
    // Under vitest nothing has substituted `__APP_VERSION__`, so brand.ts reports the dev
    // marker. The build path is covered by the dist guard in build.test.ts; what matters here
    // is that package.json carries a real release version to be injected in the first place.
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.version).not.toBe('0.0.0');
  });

  // The surfaces that used to hold their own copy of the title. A literal creeping back into
  // any of them is how half a rename ships.
  it('no user-facing surface hard-codes a product name', () => {
    const surfaces = [
      'src/app/titleScreens.ts',
      'src/app/ctx.ts',
      'src/main.ts',
      'src/render/introView.ts',
      'src/save/backup.ts',
      'src/test/hub.ts',
    ];
    const offenders = surfaces.filter((f) => /Golf Stars|GOLF STARS/.test(src(f)));
    expect(offenders, `these still hard-code the old product name: ${offenders.join(', ')}`).toEqual([]);
  });

  it('the intro cinematic renders the wordmark from brand.ts, not a literal', () => {
    const intro = src('src/render/introView.ts');
    expect(intro).toContain('GAME_TITLE_UPPER');
    // The face must be fitted, or a longer title runs off both edges of the design frame:
    // `drawTitle` centres on DW/2 with no clamp of its own.
    expect(intro).toContain('fitTitlePx');
  });
});

describe('the build stamp reaches both entry points', () => {
  // The watchdog runs BEFORE any module and is the only diagnostic that survives a bundle
  // which fails to parse — so it cannot import brand.ts and needs its own injected copy.
  it('index.html carries the version placeholder, not a hand-bumped literal', () => {
    const html = src('index.html');
    expect(html).toContain('%GS_VERSION%');
    expect(html, 'the old hand-bumped build constant should be gone').not.toContain('inline-35');
  });

  it('vite.config.ts injects the version into both the bundle and the html', () => {
    const cfg = src('vite.config.ts');
    expect(cfg).toContain('__APP_VERSION__');
    expect(cfg).toContain('transformIndexHtml');
  });
});
