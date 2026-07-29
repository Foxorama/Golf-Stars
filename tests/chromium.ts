import { existsSync, readdirSync } from 'node:fs';

/**
 * THE one way a browser test finds Chromium (GS-browser-test-gate).
 *
 * Nine `*-browser`-style test files drive the BUILT artifact through playwright-core, and they are
 * the ONLY guard over DOM, CSS, layout, focus and anything else the pure-sim suite is blind to.
 * Each one used to carry its own copy of this lookup, and the copies had drifted into two different
 * answers: five checked `CHROME_PATH`, four searched Linux-only Playwright cache paths. On a
 * Windows machine that meant 12 of those tests could be made to run and 50 could not — while
 * vitest cheerfully reported green, because a skipped test is not a failing one.
 *
 * That gap shipped a broken test to CI: it passed locally (skipped), failed there, and took five
 * CI-minutes to report something that reproduces in five seconds once a browser is actually found.
 * A second description of "where is Chromium" is exactly the class of bug this codebase keeps
 * paying for elsewhere, so there is now one.
 *
 * Order is deliberate: an explicit override, then the CI-installed browser, then whatever the
 * developer already has. Every candidate is checked for the ACTUAL BINARY, never a directory — a
 * `chromium-*` cache dir can exist without one (a partial or revision-mismatched
 * `playwright install`), and testing the directory made `runIf` lie and the launch hard-fail in CI
 * rather than skip cleanly.
 */
export function findChromium(): string | null {
  // 1. Explicit override — the escape hatch for an unusual install, and what CI can pin.
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;

  // 2. A Playwright-managed browser (how CI gets one). Linux layout: that is what the runner is.
  const bases = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    process.env.HOME ? `${process.env.HOME}/.cache/ms-playwright` : undefined,
  ].filter(Boolean) as string[];
  for (const base of bases) {
    let dirs: string[];
    try {
      // `!headless` — the headless shell is a different binary that some of these tests' viewport
      // and focus assertions do not behave identically under.
      dirs = readdirSync(base).filter((x) => x.startsWith('chromium-') && !x.includes('headless'));
    } catch {
      continue; // not this dir
    }
    for (const d of dirs) {
      const bin = `${base}/${d}/chrome-linux/chrome`;
      if (existsSync(bin)) return bin;
    }
  }

  // 3. A system browser. Windows' bundled Chromium refuses to launch here ("side-by-side
  //    configuration is incorrect"), so without this a developer on Windows has NO browser gate at
  //    all and has to know to set an env var — which is precisely how the gap went unnoticed.
  //    Chrome and Edge are both Chromium; playwright-core drives either.
  for (const p of [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]) {
    if (existsSync(p)) return p;
  }

  return null;
}

/**
 * The resolved path, or `null`. Test files use it as `it.runIf(chromePath)` so the suite still
 * passes on a machine with no browser at all — but READ THE SKIPPED COUNT: a jump in skips means
 * the browser gate quietly stopped running, not that the code got simpler.
 */
export const chromePath = findChromium();
