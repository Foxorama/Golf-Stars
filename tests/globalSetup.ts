import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Build `dist/index.html` ONCE, before any test file runs.
 *
 * Eleven test files drive the BUILT artifact in a real browser, and four of them used to run
 * `npx vite build` in their own `beforeAll`. Vitest runs test files in parallel workers, and the
 * game build is `emptyOutDir: true` — so every one of those builds **deletes `dist/` out from under
 * whichever sibling file is mid-`page.goto`**. The failure is a bare
 * `net::ERR_FILE_NOT_FOUND at file:///…/dist/index.html`, it lands on a different test each time,
 * and it only fires when the timing lines up: CI ran the same commit twice and got one pass and one
 * failure. The seven files that read `dist` WITHOUT building it were relying on a sibling to have
 * built it first — which is the same race seen from the other side.
 *
 * `globalSetup` runs once in the main process before the workers start, which is the only place
 * this can be done safely. Test files now just read `dist/index.html`; none of them may build it.
 * `tests/build.test.ts` guards that rule.
 */
export default function setup(): void {
  const root = resolve(__dirname, '..');
  execSync('npx vite build', { cwd: root, stdio: 'ignore' });
  if (!existsSync(resolve(root, 'dist/index.html'))) {
    throw new Error('globalSetup: `vite build` produced no dist/index.html — the browser tests cannot run');
  }
}
