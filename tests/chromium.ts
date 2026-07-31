/**
 * THE one way a browser test finds Chromium (GS-browser-test-gate).
 *
 * The lookup itself lives in `scripts/chromium.mjs` and this file is a re-export. It reads backwards
 * — the rule was written for `tests/` first — but the home has to be the plain-ESM file, because the
 * ~40 eyes-on rigs under `scripts/` are `.mjs` and cannot import TypeScript. They each carried their
 * own Linux-only copy of this lookup until they were folded in, which is the same bug in the same
 * shape as the one below, and four of them had already resorted to spinning up a whole vite server
 * just to `ssrLoadModule` this file. A seam a caller has to stand up a build tool to reach is a seam
 * the next caller will copy-paste around instead.
 *
 * WHY THERE IS ONE AT ALL: nine `*-browser`-style test files drive the BUILT artifact through
 * playwright-core, and they are the ONLY guard over DOM, CSS, layout, focus and everything else the
 * pure-sim suite is blind to. Each used to carry its own copy of the lookup, and the copies had
 * drifted into two different answers: five checked `CHROME_PATH`, four searched Linux-only Playwright
 * cache paths. On a Windows machine that meant 12 of those tests could be made to run and 50 could
 * not — while vitest cheerfully reported green, because a skipped test is not a failing one.
 *
 * That gap shipped a broken test to CI: it passed locally (skipped), failed there, and took five
 * CI-minutes to report something that reproduces in five seconds once a browser is actually found.
 *
 * `findChromium` answers with the single best candidate and is what `it.runIf(chromePath)` gates on;
 * `launchChromium` tries every candidate in turn and throws if none start. Prefer the latter anywhere
 * a missing browser should be loud — see the ordering note on `chromiumCandidates`.
 */
export { chromiumCandidates, findChromium, chromePath, launchChromium } from '../scripts/chromium.mjs';
