/**
 * READ-ONLY MODE, IN A REAL BROWSER (GS-save-integrity).
 *
 * The rule is unit-tested in `save-integrity.test.ts` against a fake Storage. What THIS covers is
 * everything a pure test cannot see, which is the entire player-facing half: that a device holding an
 * unreadable save still BOOTS and paints a playable title screen, that the alert is actually on it,
 * that the Save data section swaps the export button for the rescue download (a normal export would
 * hand over a file containing the empty default — worse than offering nothing), and — the assertion
 * the whole feature exists for — that the stored bytes are still byte-for-byte intact after a boot
 * that used to overwrite them.
 *
 * Seeds `localStorage` with `addInitScript`, so the blob is in place BEFORE the app's first read.
 * That is the real sequence: the fault is discovered at boot, not injected afterwards.
 *
 * Runs against the BUILT artifact, so it also proves the section survives the single-file inline step.
 * Skipped when no Chromium is available.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { defaultSave, exportSave, SAVE_VERSION } from '../src/save/schema';
import { findChromium as findChromiumShared } from './chromium';

const dist = resolve(__dirname, '../dist/index.html');
const chromePath = findChromiumShared();

/** A save from a build that doesn't exist yet — the Capacitor-shell case, and the reason this feature
 *  exists: the shell never auto-updates and is its own origin, so export→import between two builds is
 *  the DOCUMENTED workflow and was a data-loss path the moment they differed by a schema version. */
const FROM_THE_FUTURE = JSON.stringify({
  version: SAVE_VERSION + 1,
  shards: 99_999,
  bestStableford: 250,
  aFieldThisBuildHasNeverHeardOf: true,
});

/** Another game's blob under our key — itch serves every HTML5 game from one shared CDN origin. */
const SOMEBODY_ELSES = JSON.stringify({ playerName: 'Zoe', level: 12, inventory: ['sword', 'rope'] });

async function boot(seed: string | null) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (seed !== null) {
    await page.addInitScript((blob: string) => {
      try {
        localStorage.setItem('fc_save', blob);
      } catch {
        /* a browser denying storage is a different feature's problem (GS-save-durability) */
      }
    }, seed);
  }
  await page.goto('file://' + dist + '?intro=0', { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
    timeout: 8000,
  });
  return { browser, page, errors };
}

describe('a save this build cannot read (GS-save-integrity)', () => {
  it.runIf(chromePath)(
    'boots playable, warns on the title, and leaves a NEWER save byte-for-byte alone',
    async () => {
      const { browser, page, errors } = await boot(FROM_THE_FUTURE);
      try {
        const text = (await page.textContent('#app')) || '';
        // Still a working title screen — the game is playable, it just isn't writing.
        expect(text).toContain('Choose your game');
        // The alert, and it names the real cause + the fix.
        const alert = await page.locator('[role="alert"]', { hasText: 'newer version' }).first();
        expect(await alert.count()).toBeGreaterThan(0);
        expect(await alert.textContent()).toMatch(/update/i);

        // THE ASSERTION THIS FEATURE EXISTS FOR. Boot read the blob, fell back to a default, and
        // rendered a whole title screen; before this change the next persist wrote that default over
        // the real save. The bytes must be exactly as seeded.
        const stored = await page.evaluate(() => localStorage.getItem('fc_save'));
        expect(stored, 'boot modified a save it could not read').toBe(FROM_THE_FUTURE);
        expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  it.runIf(chromePath)(
    "leaves another game's blob alone and blames the shared storage, not the player",
    async () => {
      const { browser, page, errors } = await boot(SOMEBODY_ELSES);
      try {
        const alert = await page.locator('[role="alert"]').first();
        const txt = (await alert.textContent()) || '';
        expect(txt).toMatch(/wasn't written by|another game|itch/i);
        expect(await page.evaluate(() => localStorage.getItem('fc_save'))).toBe(SOMEBODY_ELSES);
        expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  it.runIf(chromePath)(
    'offers the raw rescue download instead of an export that would write an empty file',
    async () => {
      const { browser, page, errors } = await boot(FROM_THE_FUTURE);
      try {
        await page.locator('[data-open-settings]').first().click();
        await page.waitForSelector('.gs-settings', { timeout: 4000 });
        const sheet = (await page.textContent('.gs-settings')) || '';

        // The rescue is offered...
        expect(await page.locator('[data-save-transfer="rescue"]').count()).toBe(1);
        // ...and the normal export is GONE, not merely disabled: it is built from the empty default
        // that boot fell back to, so tapping it would produce a file the player would trust.
        expect(await page.locator('[data-save-transfer="export"]').count()).toBe(0);
        expect(await page.locator('[data-save-transfer="copy"]').count()).toBe(0);
        // Import stays — it is the way out, and `applyBackup` clears the fault before writing.
        expect(await page.locator('[data-save-transfer="import"]').count()).toBe(1);
        expect(sheet).toMatch(/stored data/i);
        // GS-settings-more: and all of that is INLINE. A read-only save is news the player has to act
        // on, not a service they went looking for, so it is never folded behind the Save data tile —
        // which is dropped entirely rather than sitting there leading somewhere the block already is.
        expect(await page.locator('[data-setpanel="save"]').count()).toBe(0);
        expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  it.runIf(chromePath)(
    'a readable save boots with no alert and the normal Save data controls',
    async () => {
      // The control. Everything above must be invisible to a player whose save is fine — this is the
      // test that fails if the feature starts crying wolf.
      const good = exportSave({ ...defaultSave(), shards: 777 });
      const { browser, page, errors } = await boot(good);
      try {
        const alerts = await page.locator('[role="alert"]').count();
        expect(alerts, 'a healthy save raised an alert').toBe(0);

        await page.locator('[data-open-settings]').first().click();
        await page.waitForSelector('.gs-settings', { timeout: 4000 });
        // A healthy save shows nothing at all in the sheet itself — the controls live one tap in,
        // behind the Save data tile (GS-settings-more).
        expect(await page.locator('[data-save-transfer="rescue"]').count()).toBe(0);
        await page.locator('[data-setpanel="save"]').click();
        await page.waitForSelector('[data-save-transfer="export"]', { timeout: 4000 });
        expect(await page.locator('[data-save-transfer="export"]').count()).toBe(1);
        expect(await page.locator('[data-save-transfer="rescue"]').count()).toBe(0);
        expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  it.runIf(chromePath)(
    'an empty device is not a fault — a new player can still save',
    async () => {
      const { browser, page, errors } = await boot(null);
      try {
        expect(await page.locator('[role="alert"]').count()).toBe(0);
        expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );
});
