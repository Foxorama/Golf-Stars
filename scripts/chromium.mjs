// THE one way this repo finds and launches Chromium (GS-browser-test-gate).
//
// `tests/chromium.ts` re-exports this file; the ~40 eyes-on rigs under `scripts/` import it directly.
// Before that there were SIXTY-FIVE copies of this lookup — one per rig, in at least eight different
// shapes, every one of them Linux-only (`chrome-linux/chrome` under a Playwright cache, no
// `CHROME_PATH`, no Windows, no macOS). That is the same second-description bug GS-browser-test-gate
// fixed for `tests/`, and it rotted the same way: the fix landed in one tree and not the other.
//
// It cost more here than it did there, because the rigs fail SOFT. A rig with no browser printed
// `no chromium, wrote /tmp/….html` and exited 0, so on the author's Windows machine EVERY eyes-on
// preview silently rendered nothing — while CLAUDE.md points at those rigs as the eyes-on check for
// exactly the art changes the pure-sim suite cannot see. A green exit code said the preview was
// fine; there was no preview. Hence `launchChromium`, which throws.
//
// This file is plain ESM, not TypeScript, so a `.mjs` rig can `import` it with no vite server and no
// build step. That is the whole reason the home is here and the shim is in `tests/` rather than the
// other way round: four rigs had already reached for `tests/chromium.ts` and had to spin up a vite
// server purely to load a 40-line lookup.

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Playwright cache roots, every platform's layout. A missing one is skipped, not an error. */
function cacheBases() {
  return [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers', // the cloud sandbox's pre-installed browser
    join(homedir(), '.cache', 'ms-playwright'), // Linux
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : undefined,
    join(homedir(), 'AppData', 'Local', 'ms-playwright'), // Windows
    join(homedir(), 'Library', 'Caches', 'ms-playwright'), // macOS
  ].filter((b) => b && existsSync(b));
}

/** Every binary under the cache dirs matching `prefix`, at any of `layouts`. */
function fromCache(prefix, layouts) {
  const out = [];
  for (const base of cacheBases()) {
    let dirs;
    try {
      dirs = readdirSync(base);
    } catch {
      continue; // raced, or unreadable
    }
    for (const d of dirs) {
      if (!d.startsWith(prefix)) continue;
      for (const rel of layouts) {
        const bin = join(base, d, ...rel);
        // ALWAYS check for the BINARY, never the directory: a `chromium-*` dir can exist without one
        // (a partial or revision-mismatched `playwright install`), and testing the directory made the
        // tests' `runIf` lie and hard-fail CI instead of skipping cleanly.
        if (existsSync(bin)) out.push(bin);
      }
    }
  }
  return out;
}

const FULL_LAYOUTS_LINUX = [['chrome-linux', 'chrome']];
const FULL_LAYOUTS_OTHER = [
  ['chrome-win64', 'chrome.exe'],
  ['chrome-win', 'chrome.exe'],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
];
const SHELL_LAYOUTS = [
  ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
  ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
  ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
  ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
];

/** Chrome and Edge are both Chromium; playwright-core drives either. */
const SYSTEM_BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

/**
 * Every launchable-LOOKING Chromium on this machine, best first.
 *
 * The ranking is deliberate, and the ORDER OF THE FIRST THREE RANKS IS LOAD-BEARING: `findChromium`
 * answers with rank 1, and it is what the browser test suite gates on. Anything new goes at the END
 * of the list unless you have measured what moving it does to `tests/`.
 *
 *   1. `CHROME_PATH` — the explicit override, and what CI can pin.
 *   2. A Playwright-managed full Chromium in the LINUX layout — that is what the CI runner is, so on
 *      CI this is the pinned browser and it wins.
 *   3. A system Chrome/Edge — ahead of the Windows/macOS Playwright downloads on purpose, see 4.
 *   4. A Playwright-managed full Chromium in the Windows/macOS layouts. Below the system browser
 *      because Windows' bundled Chromium download has been observed refusing to start at all ("the
 *      side-by-side configuration is incorrect") on a machine whose system Chrome runs fine — so a
 *      developer with a broken cached download still gets a browser rather than a hard failure.
 *   5. The headless SHELL. Last, and never what `findChromium` returns: it is a different binary that
 *      some of the tests' viewport and focus assertions do not behave identically under. It rasterises
 *      a page perfectly well, which is all any rig here needs, so it is a real last resort — and on
 *      the Windows box above it was the download that DID run.
 *
 * Existing on disk is not the same as launching (rank 4 is the standing proof), which is why this
 * returns a LIST and `launchChromium` tries them in turn.
 *
 * @returns {string[]}
 */
export function chromiumCandidates() {
  const out = [];
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) out.push(process.env.CHROME_PATH);
  out.push(...fromCache('chromium-', FULL_LAYOUTS_LINUX).filter((p) => !p.includes('headless')));
  out.push(...SYSTEM_BROWSERS.filter((p) => existsSync(p)));
  out.push(...fromCache('chromium-', FULL_LAYOUTS_OTHER).filter((p) => !p.includes('headless')));
  out.push(...fromCache('chromium_headless_shell-', SHELL_LAYOUTS));
  return [...new Set(out)];
}

/**
 * The best single candidate, or `null`.
 *
 * The browser tests use it as `it.runIf(chromePath)` so the suite still passes on a machine with no
 * browser at all — but READ THE SKIPPED COUNT: a jump in skips means the browser gate quietly stopped
 * running, not that the code got simpler. That is not a hypothetical. Fifty tests in `build.test.ts`
 * skipped everywhere, CI included, for months, and the tell — an unchanged skip count on two very
 * different machines — was visible the whole time.
 *
 * @returns {string | null}
 */
export function findChromium() {
  return chromiumCandidates()[0] ?? null;
}

/** @type {string | null} */
export const chromePath = findChromium();

/**
 * Launch Chromium, trying each candidate in turn, and THROW if none of them start.
 *
 * Throwing is the point. Every rig here used to swallow a missing browser and `process.exit(0)`, so
 * "the preview did not render" was indistinguishable from "the preview looked fine" — which is how
 * ~40 eyes-on rigs came to be silently dead on Windows without anyone noticing. A rig that cannot
 * show you the picture has failed at its only job and must say so with a non-zero exit.
 *
 * @param {import('playwright-core').LaunchOptions & { wrote?: string }} [opts]
 *   Standard playwright launch options. `wrote` is the path to any un-screenshotted fallback the rig
 *   has already written (usually an HTML page) — it is named in the failure so the run is not a total
 *   loss: you can open that file in whatever browser you do have.
 * @returns {Promise<import('playwright-core').Browser>}
 */
export async function launchChromium(opts = {}) {
  const { wrote, ...launch } = opts;
  const { chromium } = await import('playwright-core');
  const candidates = chromiumCandidates();
  const failures = [];
  for (const executablePath of candidates) {
    try {
      return await chromium.launch({ executablePath, ...launch });
    } catch (e) {
      failures.push(`  ${executablePath}\n    ${String(e).split('\n')[0]}`);
    }
  }
  throw new Error(
    [
      candidates.length
        ? `No Chromium would launch. Tried ${candidates.length}:`
        : 'No Chromium found on this machine.',
      ...failures,
      '',
      'Set CHROME_PATH to a Chrome/Edge binary, or run `npx playwright install chromium`.',
      wrote ? `\nThe un-screenshotted page was written to ${wrote} — open it in any browser.` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}
