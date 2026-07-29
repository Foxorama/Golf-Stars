/**
 * Save transfer, in a real browser (GS-save-transfer) — the import path end to end.
 *
 * The format is unit-tested in `save-backup.test.ts`; what THIS covers is the part a pure test
 * cannot reach: that the settings sheet actually offers the controls, that picking a file shows the
 * confirm step rather than overwriting on the spot, and that confirming really does land the
 * imported save in `localStorage`. Import is the one destructive action in the game, so "the button
 * exists" is not enough — the whole two-step has to be exercised.
 *
 * Runs against the BUILT artifact, so it also proves the section survives the single-file inline
 * step. Skipped when no Chromium is available.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { defaultSave } from '../src/save/schema';
import { findChromium as findChromiumShared } from './chromium';

const dist = resolve(__dirname, '../dist/index.html');
const chromePath = findChromiumShared();

/** A backup file whose values are unmistakable, so we can prove it was the FILE that landed and not
 *  whatever the app happened to have.
 *
 * Built off `defaultSave()` at the CURRENT schema version on purpose — this is what a real export
 * looks like. An earlier draft of this fixture hand-rolled `version: 1`, and the summary came back
 * reading "0 Star Shards": correct behaviour, because v1 predates shards entirely and the migration
 * chain fills the default. Worth remembering when reading a restore that looks lossy — a genuinely
 * ancient save IS lossy, by definition of the fields not existing yet. */
const IMPORTED = {
  kind: 'golf-stars-backup',
  version: 1,
  exportedAt: '2026-07-25T20:00:00.000Z',
  save: { ...defaultSave(), bestStableford: 41, bestDistance: 1234, shards: 8675 },
  story: null,
  settings: null,
};

describe('save transfer in a browser (GS-save-transfer)', () => {
  it.runIf(chromePath)(
    'imports a backup file through the confirm step and lands it in localStorage',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
          timeout: 8000,
        });

        // Seed a DIFFERENT save so we can tell the import actually replaced something.
        await page.evaluate(() => {
          localStorage.setItem('fc_save', JSON.stringify({ version: 1, shards: 1, bestStableford: 2 }));
        });

        // Open settings from the cog that rides every screen.
        await page.locator('[data-open-settings]').first().click();
        await page.waitForSelector('.gs-settings', { timeout: 4000 });

        // The section is present, with both actions and the (hidden) picker.
        expect(await page.locator('[data-save-transfer="export"]').count()).toBe(1);
        expect(await page.locator('[data-save-transfer="import"]').count()).toBe(1);
        expect(await page.locator('#gs-save-file').count()).toBe(1);

        // Choosing a file must NOT write anything yet — it parses and asks.
        await page.setInputFiles('#gs-save-file', {
          name: 'golf-stars-save.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(IMPORTED)),
        });
        await page.waitForSelector('.gs-savebox', { timeout: 4000 });
        const summary = (await page.textContent('.gs-savebox')) ?? '';
        expect(summary, 'the confirm step must show what is in the file').toContain('8,675');
        expect(summary).toContain('No Story Tour');
        const beforeConfirm = await page.evaluate(() => localStorage.getItem('fc_save'));
        expect(
          JSON.parse(beforeConfirm!).shards,
          'nothing may be written before the player confirms',
        ).toBe(1);

        // Confirm → applied, then the app reloads to rebuild state from the restored blobs.
        await page.locator('[data-save-transfer="apply"]').click();
        await page.waitForFunction(
          () => JSON.parse(localStorage.getItem('fc_save') || '{}').shards === 8675,
          { timeout: 8000 },
        );
        await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
          timeout: 8000,
        });
        const after = JSON.parse((await page.evaluate(() => localStorage.getItem('fc_save')))!);
        expect(after.shards).toBe(8675);
        expect(after.bestStableford).toBe(41);
        expect(errors).toEqual([]);
      } finally {
        await browser.close();
      }
    },
    90_000,
  );

  it.runIf(chromePath)(
    'refuses a junk file with an explanation, and writes nothing',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
        await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
          timeout: 8000,
        });
        await page.evaluate(() => {
          localStorage.setItem('fc_save', JSON.stringify({ version: 1, shards: 555 }));
        });
        await page.locator('[data-open-settings]').first().click();
        await page.waitForSelector('.gs-settings', { timeout: 4000 });

        await page.setInputFiles('#gs-save-file', {
          name: 'holiday-photo.json',
          mimeType: 'application/json',
          buffer: Buffer.from('{"definitely":"not a save"}'),
        });
        await page.waitForSelector('.gs-savenote--bad', { timeout: 4000 });
        const msg = (await page.textContent('.gs-savenote--bad')) ?? '';
        expect(msg.length, 'the refusal must explain itself').toBeGreaterThan(20);
        // No confirm card, and the existing save is untouched — a bad file must never reach it.
        expect(await page.locator('.gs-savebox').count()).toBe(0);
        const still = JSON.parse((await page.evaluate(() => localStorage.getItem('fc_save')))!);
        expect(still.shards, 'a refused import must not touch the existing save').toBe(555);
      } finally {
        await browser.close();
      }
    },
    90_000,
  );
});
