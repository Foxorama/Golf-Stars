import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RELEASE_NOTES, notesSince, parseVersion, compareVersions, versionAdvanced } from '../src/ui/releaseNotes';
import { initState, reduce } from '../src/ui/game';
import { backIntent } from '../src/ui/back';

/**
 * The "what's new" card (GS-update-notice).
 *
 * What these mostly guard is the SILENCE and the SOURCE. Silence: a fresh install is told nothing
 * (there is nothing to have changed from), and a device already on this version is told nothing
 * twice. Source: the newest note is the running version — a package.json bump with no row fails
 * here, which is the direction that actually rots (the number moves; the story stays on a PR body).
 */

const src = (p: string): string => readFileSync(resolve(__dirname, '..', p), 'utf8');
const pkgVersion = (JSON.parse(src('package.json')) as { version: string }).version;
const newest = RELEASE_NOTES[0]!;

describe('the release-notes table', () => {
  it('is newest first, every row a real version, no version twice', () => {
    const seen = new Set<string>();
    let prev: [number, number, number] | null = null;
    for (const n of RELEASE_NOTES) {
      const v = parseVersion(n.version);
      expect(v, `row ${n.version} is not a release version`).not.toBeNull();
      expect(seen.has(n.version), `row ${n.version} appears twice`).toBe(false);
      seen.add(n.version);
      if (prev) expect(compareVersions(v!, prev), `row ${n.version} is out of order`).toBeLessThan(0);
      prev = v;
      expect(n.title.trim().length).toBeGreaterThan(0);
      expect(n.items.length, `row ${n.version} says nothing`).toBeGreaterThan(0);
      for (const it of n.items) {
        expect(it.head.trim().length).toBeGreaterThan(0);
        expect(it.body.trim().length).toBeGreaterThan(0);
        // Player voice: no file names, no feature ids. A note that says `runout.ts` or GS-foo is
        // written for the developer who already knows.
        expect(`${it.head} ${it.body}`).not.toMatch(/\bGS-[a-z]|\.ts\b|\.mjs\b/);
      }
    }
  });

  // THE load-bearing assertion. A version the player is told about has a note.
  it('the newest row IS the version in package.json', () => {
    expect(newest.version, 'bump package.json only after adding its row to RELEASE_NOTES').toBe(pkgVersion);
  });
});

describe('versionAdvanced', () => {
  it('no stamp, or an unreadable one, is older than anything', () => {
    expect(versionAdvanced('', '1.7.0')).toBe(true);
    expect(versionAdvanced('garbage', '1.7.0')).toBe(true);
  });
  it('same or newer stamp is not an advance', () => {
    expect(versionAdvanced('1.7.0', '1.7.0')).toBe(false);
    expect(versionAdvanced('1.8.0', '1.7.0')).toBe(false); // a rollback
  });
  it('a version that is not a release never advances', () => {
    expect(versionAdvanced('', 'dev')).toBe(false);
  });
  it('the dev marker parses as 0.0.0', () => {
    expect(parseVersion('0.0.0-dev')).toEqual([0, 0, 0]);
    expect(versionAdvanced('1.5.0', '0.0.0-dev')).toBe(false);
  });
});

describe('notesSince', () => {
  it('a fresh install is told nothing', () => {
    expect(notesSince('', newest.version, false)).toEqual([]);
  });

  it('a device with progress and no stamp is an upgrade, and is shown everything', () => {
    expect(notesSince('', newest.version, true)).toEqual(RELEASE_NOTES);
  });

  it('a device already on this version is told nothing, with or without progress', () => {
    expect(notesSince(newest.version, newest.version, true)).toEqual([]);
    expect(notesSince(newest.version, newest.version, false)).toEqual([]);
  });

  it('a rollback is told nothing', () => {
    expect(notesSince('99.0.0', newest.version, true)).toEqual([]);
  });

  it('shows only the rows newer than the stamp and no newer than the build', () => {
    // Synthetic: the table has one row today, so drive the rule with the stamp instead.
    const older = notesSince('0.0.1', newest.version, true);
    expect(older.map((n) => n.version)).toEqual(RELEASE_NOTES.map((n) => n.version));
    // A build OLDER than the newest row (a shell lagging the site) never shows that row.
    expect(notesSince('', '0.0.1', true)).toEqual([]);
  });
});

describe('the card in the reducer and the back policy', () => {
  const armed = () => ({ ...initState('notes-seed'), updateNotice: RELEASE_NOTES });

  it('dismissUpdateNotice clears it, and is a no-op when nothing is up', () => {
    const s = armed();
    const after = reduce(s, { type: 'dismissUpdateNotice' });
    expect(after.updateNotice).toBeUndefined();
    const bare = initState('notes-seed');
    expect(reduce(bare, { type: 'dismissUpdateNotice' })).toBe(bare);
  });

  it('back reads the card as "got it" — the same action, so the stamp has one source', () => {
    expect(backIntent(armed())).toEqual({ kind: 'dismiss', action: { type: 'dismissUpdateNotice' } });
  });

  it('the reducer never touches the stamp; only the app layer writes seenVersion', () => {
    // The stamp is a per-device fact, so it lives in Settings and is written from app.ts alone —
    // the quiet stamp at boot and the one on the dismiss action. A write anywhere else would be a
    // second description of "has this device read this version".
    // A pure reducer writes no setting at all; a renderer writes no stamp.
    expect(src('src/ui/game.ts')).not.toMatch(/setSetting\(|seenVersion\s*[:=]/);
    expect(src('src/app/overlays.ts')).not.toMatch(/setSetting\(\s*'seenVersion'/);
    const writes = src('src/app.ts').match(/setSetting\(\s*'seenVersion'/g) ?? [];
    expect(writes.length).toBe(2);
  });
});
