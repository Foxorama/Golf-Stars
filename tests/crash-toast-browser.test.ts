/**
 * The crash toast in a real browser (GS-crash-diagnostics).
 *
 * `tests/crash-report.test.ts` covers the report TEXT, which is pure. This covers the half that
 * only exists in a DOM: that a post-boot fault actually surfaces something the player can see and
 * act on, that it doesn't take over the screen, and — the one that would silently ruin the
 * feature — that a fault firing every frame produces ONE toast rather than sixty a second.
 *
 * Drives the BUILT artifact, like `tests/club-picker.test.ts`. Skipped with no Chromium.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from 'playwright-core';

const dist = resolve(__dirname, '../dist/index.html');
const chromePath = (() => {
  for (const p of [
    process.env.CHROME_PATH,
    '/opt/pw-browsers/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
  ]) {
    if (p && existsSync(p)) return p;
  }
  return null;
})();

/** Boot the built game to the title screen. A crash on the title is the simplest case to drive,
 *  and the toast is mounted outside `#app` so it behaves identically on every screen. */
async function boot(browser: import('playwright-core').Browser): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
    timeout: 10_000,
  });
  return page;
}

/** Throw from inside the page, the way a real fault arrives — an uncaught error on the window. */
async function throwInPage(page: Page, message: string, times = 1): Promise<void> {
  await page.evaluate(
    ({ message, times }) => {
      for (let i = 0; i < times; i++) {
        window.dispatchEvent(
          new ErrorEvent('error', {
            message,
            filename: 'index.html',
            lineno: 1,
            colno: 284412,
            error: new Error(message),
          }),
        );
      }
    },
    { message, times },
  );
  await page.waitForTimeout(150);
}

describe('the crash toast (GS-crash-diagnostics)', () => {
  it.runIf(chromePath)(
    'surfaces a post-boot fault without taking the screen away',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await boot(browser);
        // Nothing before anything goes wrong — the host must not occupy the screen while idle.
        expect(await page.locator('.gs-crash__bar').count()).toBe(0);

        await throwInPage(page, 'BOOM_TEST_FAULT');

        expect(await page.locator('.gs-crash__bar').count()).toBe(1);
        expect(await page.textContent('.gs-crash__bar')).toContain('Something went wrong');
        // The game is still there. A non-fatal glitch must never end a run.
        expect(await page.textContent('#app')).toContain('Choose your game');
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  it.runIf(chromePath)(
    'shows ONE toast for a fault that fires every frame',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await boot(browser);
        // A fault inside a rAF loop arrives ~60×/second. Without dedupe the toast rebuilds itself
        // faster than it can be tapped, and the feature is worse than useless.
        await throwInPage(page, 'REPEATING_FAULT', 60);
        expect(await page.locator('.gs-crash__bar').count()).toBe(1);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  it.runIf(chromePath)(
    'copies a report carrying the build and the seed, and can be dismissed',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const context = browser.contexts()[0] ?? (await browser.newContext());
        await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
        const page = await boot(browser);
        await throwInPage(page, 'COPYABLE_FAULT');

        await page.locator('.gs-crash__btn', { hasText: 'Copy details' }).click();
        await page.waitForTimeout(200);

        // Either route is a pass: the clipboard when it's permitted, the manual textarea when the
        // browser refuses. What must never happen is a button that silently does nothing.
        const report = await page.evaluate(async () => {
          const box = document.querySelector('.gs-crash__text') as HTMLTextAreaElement | null;
          if (box) return box.value;
          try {
            return await navigator.clipboard.readText();
          } catch {
            return '';
          }
        });
        expect(report).toContain('The Far Carry v');
        expect(report).toContain('COPYABLE_FAULT');
        expect(report, 'the seed is the whole point of this report').toMatch(/seed |no run in progress/);
        expect(report, 'the save must never ride along').not.toContain('metaUpgrades');

        await page.locator('.gs-crash__btn--x').click();
        await page.waitForTimeout(150);
        expect(await page.locator('.gs-crash__bar').count()).toBe(0);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );
});
