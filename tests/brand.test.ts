import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GAME_TITLE, GAME_TITLE_UPPER, APP_VERSION } from '../src/brand';
import { BACKUP_KIND } from '../src/save/backup';
import { SAVE_KEY } from '../src/save/storage';
import { STORY_KEY } from '../src/save/storyStore';

/**
 * Product identity guards (GS-release-identity).
 *
 * A rename is the classic half-landed change: most surfaces move, one keeps shipping the old
 * name, and — far worse — somebody helpfully renames a PERSISTED IDENTIFIER along with the
 * label and orphans every save on every player's device. These tests pin both halves: the
 * name is single-sourced, and the identifiers are frozen.
 */

const src = (p: string): string => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('persisted identifiers survive a rename', () => {
  // THE load-bearing assertion in this file. `BACKUP_KIND` is stamped into every backup file
  // any player has ever exported; `parseBackup` recognises a file by it and rejects anything
  // else. Renaming it to match a new product name makes every existing backup unreadable
  // while every test that only round-trips NEW files stays green.
  it('BACKUP_KIND is frozen at its original value, whatever the product is called', () => {
    expect(BACKUP_KIND).toBe('golf-stars-backup');
  });

  // The save keys are the same class of promise: they address data already sitting in
  // localStorage on real devices. Asserted on the exported constants, not a source grep —
  // the constant IS the contract, and a grep would pass on a stale comment.
  it('the localStorage keys keep their gs_ namespace', () => {
    expect(SAVE_KEY).toBe('gs_save');
    expect(STORY_KEY).toBe('gs_story');
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
