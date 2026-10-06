/**
 * What changed, told to the player ONCE per version (GS-update-notice).
 *
 * The game auto-updates underneath people — a PWA on the site, the itch embed, the shell — and until
 * now nothing said so: a player opened the app one day and the aim buttons had moved. Every release
 * has had a written account of itself (the bump PR's body), but that text lived on GitHub, which is
 * not where a player is standing. So the account is now a ROW here, and the first boot on a new
 * version shows every row the player has not yet seen, newest first.
 *
 * Three rules, all pure and all machine-checked (`tests/release-notes.test.ts`):
 *
 *  - **A VERSION THE PLAYER IS TOLD ABOUT HAS A NOTE.** The newest row's `version` must equal
 *    package.json's, so a bump without a note fails the suite. That is the direction that rots: the
 *    number moves in one file and the story stays on a PR nobody re-reads.
 *  - **A FRESH INSTALL IS NOT AN UPDATE.** With no progress on the device there is nothing to have
 *    changed FROM, so `notesSince` is silent and the app stamps the version quietly; the notice fires
 *    on the NEXT release. The signal is `save.savedAt` — every persisted save carries it and a
 *    default never does — not a second storage key.
 *  - **THE NOTES ARE A CATCH-UP, NOT A HEADLINE.** A device that skipped versions (the Capacitor shell
 *    never auto-updates) sees every row newer than the one it last saw. A device with progress but no
 *    stamp at all — everyone upgrading from before this feature — sees the whole table, which is short
 *    today and is exactly the list of things that changed on them.
 *
 * Copy is written for the player: what they will notice, in one line each, never a file name or a
 * GS-id. Bold `head` + plain `body` rather than markup, so nothing here is parsed.
 */

export interface ReleaseNoteItem {
  /** The bolded lead — what the player will notice. */
  head: string;
  /** One or two plain sentences on what it does for them. */
  body: string;
}

export interface ReleaseNote {
  /** The package.json version this row describes. */
  version: string;
  /** A short title in the release's own voice — the bump PR's title, lower-cased. */
  title: string;
  items: readonly ReleaseNoteItem[];
}

/**
 * NEWEST FIRST. Add a row at the TOP for every release, before bumping package.json — the suite
 * refuses a version with no row. Player voice: what changed for them, not how.
 */
export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '1.8.0',
    title: 'the driving range opens',
    items: [
      {
        head: '🎓 The Driving Range',
        body: 'A three-hole tutorial on the title screen, where the Destination teaser used to be. A coach stops you the first time each thing matters: the swing, your first putt, the first hole with water, and upgrades.',
      },
      {
        head: 'Every scoring format, one per hole',
        body: 'Stroke play on the first, Stableford on the second, and matchplay against Longshot Larry on the third.',
      },
      {
        head: 'Try upgrades before you buy them',
        body: 'The last hole is played with battered range balls that fly clean about one shot in ten. Fit Shank Guard or Anti-Hook Grip from the panel and watch the red go off the cone.',
      },
      {
        head: 'It costs nothing',
        body: 'The range pays no shards, posts no records and parks nothing. Leave or replay it any time.',
      },
      {
        head: 'Fixed: parked Story rounds',
        body: 'Starting a Voyage, Unending or Star Tour run no longer throws away a Story round you had parked mid-world.',
      },
    ],
  },
  {
    // 1.6.0 was bumped on main but never tagged, so every device is coming from 1.5.0 — this row
    // covers both.
    version: '1.7.0',
    title: 'an outfit that does not glow, and an aim that sees the trees',
    items: [
      {
        head: 'The Aussie Trader',
        body: 'A new mythic outfit in the Trade Market: fluro pink hi-vis over a dark tee, blue work trousers and a set of site ear defenders. The first kit in the rack that does not glow.',
      },
      {
        head: '🎯 Reset aim is always there',
        body: 'It is a permanent button on the play screen now, greyed when there is nothing to reset, and it restores your aim setting instead of pointing at the pin.',
      },
      {
        head: '🛟 Safe aim gets you out of the trees',
        body: 'When the lay-up would be knocked down by a canopy, it hunts a line back to playable ground instead of firing straight into the stand.',
      },
      {
        head: 'The default aim lays up short of a tree stand',
        body: 'And picks the club that gets there, rather than pre-arming a drive into the canopy.',
      },
      {
        head: 'This note',
        body: 'The first time you open a new version, the game now tells you what changed.',
      },
    ],
  },
];

/** `major.minor.patch` as numbers, or null for anything that is not a release version. A suffix
 *  (`0.0.0-dev`) is ignored, so the dev marker parses as 0.0.0 and is newer than nothing. */
export function parseVersion(v: string | undefined): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v ?? '');
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Semver-style ordering on the parsed triples: negative when `a` is older than `b`. */
export function compareVersions(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    const d = a[i]! - b[i]!;
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Is `current` newer than the version this device last saw? The ONE test both the card and the
 * quiet stamp read: no stamp (or an unreadable one) counts as older than anything, and the same
 * version — or a device that went BACKWARDS (a rollback, an older shell beside a newer site) — does
 * not. The stamp only ever moves FORWARD, so a rollback-then-upgrade is told about a version once.
 */
export function versionAdvanced(seen: string, current: string): boolean {
  const cur = parseVersion(current);
  if (!cur) return false;
  const floor = parseVersion(seen);
  return !floor || compareVersions(floor, cur) < 0;
}

/**
 * The rows to show on this boot, newest first — empty when there is nothing to say.
 *
 * @param seen        the version stamped at the last dismissal (`Settings.seenVersion`); `''` before
 *                    this feature existed on the device.
 * @param current     `APP_VERSION`.
 * @param hasProgress whether the device holds a persisted save — the fresh-install discriminator.
 */
export function notesSince(seen: string, current: string, hasProgress: boolean): readonly ReleaseNote[] {
  if (!versionAdvanced(seen, current)) return [];
  const cur = parseVersion(current)!;
  const floor = parseVersion(seen);
  // No stamp and nothing played: a first run, not an update. (No stamp WITH progress is the
  // pre-feature upgrade, and `floor` stays null so every row up to `current` qualifies.)
  if (!floor && !hasProgress) return [];
  return RELEASE_NOTES.filter((n) => {
    const v = parseVersion(n.version);
    if (!v) return false;
    return compareVersions(v, cur) <= 0 && (!floor || compareVersions(v, floor) > 0);
  });
}
