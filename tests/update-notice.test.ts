import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromePath } from './chromium';
import { defaultSave } from '../src/save/schema';

/**
 * The "what's new" card in a real browser (GS-update-notice).
 *
 * The pure half (`release-notes.test.ts`) proves the rule; this proves the card is actually raised,
 * named, sealed and stamped on the BUILT artifact, which is the only place the boot wiring, the focus
 * pass and the settings write meet. Four boots:
 *
 *   1. an UPGRADING device — a persisted save, no stamp — sees the card, and "Got it" stamps it away;
 *   2. a FRESH install sees nothing, and is stamped quietly so the next release is its first card;
 *   3. back (Escape) reads the card as "got it" and stamps too;
 *   4. a save this build cannot read keeps the card silent AND unstamped — the integrity alert owns
 *      that title screen.
 */

const dist = resolve(__dirname, '../dist/index.html');
const PHONE = { width: 390, height: 844 };
const VERSION = (JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8')) as { version: string })
  .version;

/** A save exactly as `writeSave` leaves it: a default plus the `savedAt` stamp every persisted save carries. */
const PLAYED = JSON.stringify({ ...defaultSave(), savedAt: '2026-08-02T20:26:05.000Z' });
const FROM_THE_FUTURE = JSON.stringify({ version: 9999, shards: 1 });

describe.runIf(chromePath)('the update notice (GS-update-notice)', () => {
  let browser: import('playwright-core').Browser;
  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  async function boot(seedSave: string | null) {
    const page = await browser.newPage({ viewport: PHONE });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    // Seed ONCE per tab: an init script runs on every navigation, and the reload below must find the
    // storage the first boot left, not a fresh seeding.
    await page.addInitScript((blob: string | null) => {
      try {
        if (sessionStorage.getItem('gs-test-seeded')) return;
        sessionStorage.setItem('gs-test-seeded', '1');
        localStorage.clear();
        if (blob) localStorage.setItem('fc_save', blob);
      } catch {
        /* storage denied is another feature's problem */
      }
    }, seedSave);
    await page.goto(`file://${dist}?intro=0&seed=42`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
      timeout: 15_000,
    });
    return { page, errors };
  }

  const seenVersion = (page: import('playwright-core').Page) =>
    page.evaluate(() => {
      const raw = localStorage.getItem('fc_settings');
      return raw ? ((JSON.parse(raw) as { seenVersion?: string }).seenVersion ?? '') : null;
    });

  it('an upgrading device sees the card, named and modal, and "Got it" stamps it away', async () => {
    const { page, errors } = await boot(PLAYED);
    try {
      const card = page.locator('.gs-whatsnew');
      expect(await card.count()).toBe(1);
      expect(await card.textContent()).toContain(`What's new in v${VERSION}`);
      expect(await card.textContent()).toContain('Aussie Trader');
      // A real dialog (GS-a11y-focus): the role sits on the SHEET (the backdrop is the dismiss
      // target), named off its own heading, with the app behind it sealed.
      expect(await card.getAttribute('role')).toBe('dialog');
      expect(await card.getAttribute('aria-label')).toContain(`What's new in v${VERSION}`);
      expect(await page.locator('main[inert]').count()).toBe(1);
      // Not stamped until read.
      expect(await seenVersion(page)).not.toBe(VERSION);

      await page.locator('.gs-whatsnew button').click();
      await page.waitForFunction(() => !document.querySelector('.gs-whatsnew'), { timeout: 5_000 });
      expect(await seenVersion(page)).toBe(VERSION);
      expect(await page.locator('main[inert]').count()).toBe(0);

      // And it does not come back.
      await page.reload({ waitUntil: 'load' });
      await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
        timeout: 15_000,
      });
      expect(await page.locator('.gs-whatsnew').count()).toBe(0);
      expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('a fresh install sees nothing and is stamped quietly', async () => {
    const { page, errors } = await boot(null);
    try {
      expect(await page.locator('.gs-whatsnew').count()).toBe(0);
      expect(await seenVersion(page)).toBe(VERSION);
      expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('back (Escape) reads the card as "got it"', async () => {
    const { page, errors } = await boot(PLAYED);
    try {
      expect(await page.locator('.gs-whatsnew').count()).toBe(1);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.gs-whatsnew'), { timeout: 5_000 });
      expect(await seenVersion(page)).toBe(VERSION);
      expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);

  it('a save this build cannot read keeps the card silent and unstamped', async () => {
    const { page, errors } = await boot(FROM_THE_FUTURE);
    try {
      expect(await page.locator('[role="alert"]').count()).toBeGreaterThan(0);
      expect(await page.locator('.gs-whatsnew').count()).toBe(0);
      expect(await seenVersion(page)).not.toBe(VERSION);
      expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
    } finally {
      await page.close();
    }
  }, 60_000);
});
