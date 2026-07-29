import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * PRIVACY.md is a PROMISE, and this is what keeps it true (GS-license-privacy).
 *
 * The game's privacy position — nothing collected, nothing transmitted, everything on the
 * player's own device — is not a policy decision written once and filed away. It is a property of
 * the code, and it stays true only for as long as nobody adds a `fetch`, a beacon, or a quietly
 * undocumented storage key. A stale privacy policy is worse than none at all: it is a public
 * statement that has become false, which is exactly the kind of thing a player audits and a
 * storefront asks about.
 *
 * So these tests fail the build rather than let the document drift. Every one of them is
 * fixable in two ways — undo the change, or update PRIVACY.md to match — and the point is that
 * BOTH require somebody to notice.
 */

const root = resolve(__dirname, '..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');

/** Every `.ts` file under `src/`, so a new module can't slip past the sweep by being new. */
function sourceFiles(dir = 'src'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(resolve(root, dir))) {
    const rel = join(dir, entry);
    if (statSync(resolve(root, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (entry.endsWith('.ts')) out.push(rel);
  }
  return out;
}

const PRIVACY = read('PRIVACY.md');

describe('the game sends nothing', () => {
  // The load-bearing claim. If this ever fails, the fix is NOT to relax the test — it is to
  // decide whether the game is still allowed to say it collects nothing, and update PRIVACY.md.
  it('no source file makes a network request', () => {
    const banned = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new WebSocket|new EventSource/;
    const offenders = sourceFiles().filter((f) => banned.test(read(f)));
    expect(
      offenders,
      `these make network calls — PRIVACY.md says the game makes none: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('no source file reads cookies or geolocation', () => {
    const banned = /document\.cookie|navigator\.geolocation/;
    const offenders = sourceFiles().filter((f) => banned.test(read(f)));
    expect(offenders, `these touch cookies/geolocation: ${offenders.join(', ')}`).toEqual([]);
  });

  // Analytics arrive as a dependency long before they arrive as a `fetch`. Catching it here means
  // the conversation happens at `npm install` time, not after a release has shipped.
  it('ships no analytics, telemetry or error-reporting dependency', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const suspect = names.filter((n) =>
      /sentry|analytics|telemetry|bugsnag|rollbar|mixpanel|amplitude|posthog|gtag|ga4|segment|logrocket|datadog/i.test(n),
    );
    expect(suspect, `PRIVACY.md promises no analytics: ${suspect.join(', ')}`).toEqual([]);
  });
});

describe('PRIVACY.md describes what the code actually stores', () => {
  // The direction that matters. Anyone can add a storage key; this makes an UNDOCUMENTED one fail
  // the build, so the policy's table cannot silently fall behind the code.
  it('every persisted key in the source is documented', () => {
    const keys = new Set<string>();
    for (const f of sourceFiles()) {
      for (const m of read(f).matchAll(/'(fc_[A-Za-z][A-Za-z0-9]*)'/g)) keys.add(m[1]!);
    }
    expect(keys.size, 'expected to find the storage keys in src/').toBeGreaterThan(0);

    const undocumented = [...keys].filter((k) => !PRIVACY.includes(k));
    expect(
      undocumented,
      `these keys are stored on the player's device but not listed in PRIVACY.md: ${undocumented.join(', ')}`,
    ).toEqual([]);
  });

  // And the reverse, so the table can't list a key that was removed and quietly become fiction.
  it('every key the document lists still exists in the source', () => {
    const all = sourceFiles()
      .map(read)
      .join('\n');
    const documented = [...PRIVACY.matchAll(/`(fc_[A-Za-z][A-Za-z0-9]*)`/g)].map((m) => m[1]!);
    expect(documented.length, 'PRIVACY.md should list the storage keys').toBeGreaterThan(0);

    const stale = [...new Set(documented)].filter((k) => !all.includes(`'${k}'`));
    expect(stale, `PRIVACY.md documents keys the game no longer uses: ${stale.join(', ')}`).toEqual([]);
  });
});

describe('the licence and policy are present and attributed', () => {
  it('LICENSE names the copyright holder and reserves rights', () => {
    const licence = read('LICENSE');
    expect(licence).toContain('Vulpecula Games');
    expect(licence).toContain('All rights reserved');
  });

  it('PRIVACY.md carries a contact route and a last-updated date', () => {
    expect(PRIVACY).toMatch(/Last updated/i);
    expect(PRIVACY).toMatch(/@vulpecula\.games/);
    // A placeholder that shipped is the failure mode this catches.
    expect(PRIVACY).not.toMatch(/TODO|FIXME|XXX/);
  });
});
