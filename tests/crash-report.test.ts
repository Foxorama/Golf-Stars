import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCrashReport, crashKey } from '../src/crashReport';

/**
 * The crash report (GS-crash-diagnostics).
 *
 * The point of this feature is that a SEED beats a stack trace: the sim is deterministic, so the
 * seed replays the exact failing round, while a minified stack points into a 2MB single line.
 * These tests hold the report to that promise — the seed is present, it is prominent, the thing
 * stays pasteable, and it never carries the player's save.
 */

const read = (p: string): string => readFileSync(resolve(__dirname, '..', p), 'utf8');

/**
 * Source with comments stripped.
 *
 * These files EXPLAIN the rules they follow — "`Date.now()` stays out of this path", "never
 * contains the save" — so a naive grep for the banned token matches the prose forbidding it and
 * fails on a correct file. Assert against code, never against documentation of the code.
 */
const codeOf = (p: string): string =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const base = {
  version: '1.0.0',
  message: 'Cannot read properties of undefined',
};

describe('the report leads with what reproduces the bug', () => {
  it('carries the seed, course, mode and hole', () => {
    const out = buildCrashReport({
      ...base,
      run: { seed: 8675309, courseSeed: 42, mode: 'voyage', stop: 3, hole: 7 },
    });
    expect(out).toContain('seed 8675309');
    expect(out).toContain('course 42');
    expect(out).toContain('mode voyage');
    expect(out).toContain('hole 7');
  });

  // A maintainer who reads three lines and stops must still have the reproducible part.
  it('puts the seed above the stack trace', () => {
    const out = buildCrashReport({ ...base, run: { seed: 99 }, stack: 'at foo (x:1:1)' });
    expect(out.indexOf('seed 99')).toBeLessThan(out.indexOf('at foo'));
  });

  it('says so plainly when there is no run to reproduce', () => {
    expect(buildCrashReport(base)).toContain('no run in progress');
  });

  it('names the build, so a report can be tied to a release', () => {
    expect(buildCrashReport(base)).toContain('v1.0.0');
  });
});

describe('the report stays pasteable', () => {
  // An itch.io comment box is the target. A wall of minified frames is a report nobody sends.
  it('caps a runaway stack rather than emitting it whole', () => {
    const huge = Array.from({ length: 400 }, (_, i) => `    at frame${i} (index.html:1:${i * 977})`).join('\n');
    const out = buildCrashReport({ ...base, stack: huge });
    expect(out.length).toBeLessThanOrEqual(1400);
    expect(out).toContain('more frame');
  });

  it('caps a single absurdly long frame', () => {
    const out = buildCrashReport({ ...base, stack: `at x (index.html:1:${'9'.repeat(600)})` });
    expect(out.split('\n').every((l) => l.length <= 160)).toBe(true);
  });

  it('keeps a normal report short enough to read', () => {
    const out = buildCrashReport({
      ...base,
      run: { seed: 1, mode: 'voyage', hole: 4 },
      device: { ua: 'Mozilla/5.0 (iPhone)', viewport: '390×844' },
      stack: 'at a (i:1:1)\nat b (i:1:2)',
    });
    expect(out.split('\n').length).toBeLessThan(16);
  });
});

describe('the report carries no more than it needs', () => {
  it('reports the repeat count instead of repeating itself', () => {
    expect(buildCrashReport({ ...base, repeats: 60 })).toContain('60×');
    // A single occurrence should not be labelled at all — noise on the common case.
    expect(buildCrashReport({ ...base, repeats: 1 })).not.toContain('repeated');
  });

  it('omits a default UI scale but reports a changed one', () => {
    expect(buildCrashReport({ ...base, device: { uiScale: 1 } })).not.toContain('ui ');
    expect(buildCrashReport({ ...base, device: { uiScale: 1.3 } })).toContain('ui 1.3×');
  });

  // PRIVACY.md promises the report never contains the save. This is that promise, in code.
  it('has no way to include the save', () => {
    expect(codeOf('src/crashReport.ts')).not.toMatch(/loadSave|localStorage|gs_save|fc_save/);
  });

  // The module is pure so the report is reproducible in a test; a clock read here would also be a
  // banned `Date.now()` in a path that ought to be deterministic.
  it('reads no clock of its own', () => {
    expect(codeOf('src/crashReport.ts')).not.toMatch(/Date\.now\(\)|new Date\(\)/);
  });
});

describe('deduplication key', () => {
  // A rAF-loop fault throws ~60×/second with frames that differ run to run. Keying on the stack
  // would defeat the dedupe that stops 60 toasts a second.
  it('ignores the stack, so the same fault keys the same way', () => {
    expect(crashKey('boom', 'index.html:1:5')).toBe(crashKey('boom', 'index.html:1:5'));
    expect(crashKey('boom', 'index.html:1:5')).not.toBe(crashKey('boom', 'index.html:1:9'));
    expect(crashKey('boom')).not.toBe(crashKey('bang'));
  });
});

describe('the boot watchdog is left intact', () => {
  // `window.onerror` is a SINGLE slot owned by the watchdog in index.html — it is the only handler
  // that yields source:line:col for an import-time throw, the exact failure class it exists for.
  // Assigning our own would delete it. `addEventListener` stacks; assignment does not.
  it('diagnostics listens alongside rather than assigning window.onerror', () => {
    const src = codeOf('src/app/diagnostics.ts');
    expect(src).toContain("addEventListener('error'");
    expect(src).toContain("addEventListener('unhandledrejection'");
    expect(src, 'assigning window.onerror would clobber the boot watchdog').not.toMatch(/window\.onerror\s*=/);
  });

  it('the watchdog still owns window.onerror in index.html', () => {
    expect(read('index.html')).toContain('window.onerror');
  });
});
