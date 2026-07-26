import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Keyboard + focus guards (GS-a11y-focus).
 *
 * The pure-sim suite is blind to the DOM, so these drive the BUILT artifact in a real browser —
 * the only place `inert`, `:focus-visible` and `document.activeElement` mean anything. They pin the
 * four behaviours that were missing entirely:
 *   1. an open overlay is a `role="dialog"` with `aria-modal` and a name;
 *   2. focus moves INTO it on open and back to the opener on close;
 *   3. everything behind it is unreachable by Tab (6 buttons used to stay reachable);
 *   4. a non-native `role="button"` is focusable and fires on Enter/Space.
 * Plus a source-level guard that no `:focus-visible` rule leaves a control with no ring at all.
 */

const dist = resolve(__dirname, '../dist/index.html');

function findChromium(): string | null {
  const bases = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    process.env.HOME ? `${process.env.HOME}/.cache/ms-playwright` : undefined,
  ].filter(Boolean) as string[];
  for (const base of bases) {
    let dirs: string[];
    try {
      dirs = readdirSync(base).filter((x) => x.startsWith('chromium-') && !x.includes('headless'));
    } catch {
      continue;
    }
    for (const d of dirs) {
      const bin = `${base}/${d}/chrome-linux/chrome`;
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}
const chromePath = findChromium();

describe('overlay focus + dialog semantics (real browser)', () => {
  it.runIf(chromePath)(
    'the settings sheet is a named modal, takes focus, seals the page behind it, and gives focus back',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        // `?intro=0`: the boot cinematic is a <body>-level takeover that now (correctly) marks
        // #app `inert` while it plays, so a test that clicks into the app has to skip it — and a
        // test that DOESN'T skip it is silently racing the animation either way.
        await page.goto('file://' + dist + '?intro=0', { waitUntil: 'load' });
        await page.waitForFunction(
          () => document.getElementById('app')?.getAttribute('data-booted') === '1',
          { timeout: 8000 },
        );

        const opened = await page.evaluate(() => {
          const cog = document.querySelector<HTMLElement>('.gs-cog')!;
          cog.focus();
          cog.click();
          const sheet = document.querySelector<HTMLElement>('.gs-settings')!;
          const focusables = [...document.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          )];
          return {
            role: sheet.getAttribute('role'),
            modal: sheet.getAttribute('aria-modal'),
            label: sheet.getAttribute('aria-label'),
            focusInside: sheet.contains(document.activeElement),
            // Anything focusable outside the sheet must be sealed off by an inert ancestor.
            reachableBehind: focusables.filter(
              (e) => !sheet.contains(e) && !e.closest('[inert]') && e.offsetParent !== null,
            ).length,
          };
        });

        expect(opened.role).toBe('dialog');
        expect(opened.modal).toBe('true');
        // A real name, and NOT one polluted by the head's ✕ close button.
        expect(opened.label).toBeTruthy();
        expect(opened.label).not.toContain('✕');
        expect(opened.focusInside).toBe(true);
        expect(opened.reachableBehind).toBe(0);

        // Flipping a switch must not throw focus back to the top of the sheet — the sheet
        // re-renders its own innerHTML on every toggle (GS-settings-flicker).
        const kept = await page.evaluate(() => {
          const chip = document.querySelector<HTMLElement>('.gs-settings [data-setting="haptics"]')!;
          chip.focus();
          chip.click();
          return (document.activeElement as HTMLElement | null)?.dataset?.setting ?? null;
        });
        expect(kept).toBe('haptics');

        // Closing hands focus back to the control that opened it.
        const closed = await page.evaluate(() => {
          const done = [...document.querySelectorAll<HTMLElement>('[data-settings="close"]')].pop()!;
          done.click();
          return {
            gone: !document.querySelector('.gs-settings'),
            onCog: document.activeElement?.classList?.contains('gs-cog') ?? false,
            anyInertLeft: !!document.querySelector('#app > [inert]'),
          };
        });
        expect(closed.gone).toBe(true);
        expect(closed.onCog).toBe(true);
        expect(closed.anyInertLeft).toBe(false);
      } finally {
        await browser.close();
      }
    },
    120_000,
  );

  it.runIf(chromePath)(
    'a non-native role="button" is tab-reachable and fires on Enter',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        // `?intro=0`: the boot cinematic is a <body>-level takeover that now (correctly) marks
        // #app `inert` while it plays, so a test that clicks into the app has to skip it — and a
        // test that DOESN'T skip it is silently racing the animation either way.
        await page.goto('file://' + dist + '?intro=0', { waitUntil: 'load' });
        await page.waitForFunction(
          () => document.getElementById('app')?.getAttribute('data-booted') === '1',
          { timeout: 8000 },
        );
        // Into character select, where the golfer-card lore portrait is a <span role="button">
        // nested in the card — it had no tabindex and no key handler, so it was mouse-only.
        await page.evaluate(() => document.querySelector<HTMLElement>('.gs-navtile')!.click());
        await page.waitForSelector('.gs-charcard-port');

        const wired = await page.evaluate(() => {
          const p = document.querySelector<HTMLElement>('.gs-charcard-port')!;
          return { tabIndex: p.tabIndex, role: p.getAttribute('role'), label: p.getAttribute('aria-label') };
        });
        expect(wired.tabIndex).toBe(0);
        expect(wired.role).toBe('button');
        expect(wired.label).toBeTruthy();

        // Enter must open the dossier — and must NOT also activate the enclosing card (which
        // would start a run instead).
        await page.evaluate(() => document.querySelector<HTMLElement>('.gs-charcard-port')!.focus());
        await page.keyboard.press('Enter');
        const after = await page.evaluate(() => ({
          loreOpen: !!document.querySelector('[class*="charlore"]'),
          stillOnSelect: !!document.querySelector('.gs-charcard'),
        }));
        expect(after.loreOpen).toBe(true);
        expect(after.stillOnSelect).toBe(true);
      } finally {
        await browser.close();
      }
    },
    120_000,
  );
});

describe('focus rings (source guard)', () => {
  it('no :focus-visible rule leaves a control with no visible indicator', () => {
    // The pattern that shipped: `X:hover, X:focus-visible { outline: none; transform: … }` — a
    // keyboard user's only cue was a 2px lift, and the `outline:none` outranked the global ring on
    // specificity. Every file that suppresses an outline in a :focus-visible rule must also carry a
    // rule that puts one back.
    const files = [
      'index.html',
      'src/app/shipInteriorScreens.ts',
      'src/app/storyTournamentScreens.ts',
      'src/render/clubhouseLounge.ts',
      'src/render/storyClubhouse.ts',
      'src/render/storySpaceport.ts',
    ];
    for (const f of files) {
      const src = readFileSync(resolve(__dirname, '..', f), 'utf8');
      const suppresses = /:focus-visible[^{]*\{[^}]*outline\s*:\s*none/.test(src);
      if (!suppresses) continue;
      const restores = /:focus-visible[^{]*\{[^}]*outline\s*:\s*\d+px\s+solid/.test(src);
      // `.gs-czone` is the sanctioned exception: it suppresses the outline and draws its ring on a
      // ::before pseudo-element instead, which IS a visible indicator.
      const pseudoRing = /:focus-visible::before\s*\{[^}]*border-color/.test(src);
      expect(restores || pseudoRing, `${f} suppresses a focus ring without restoring one`).toBe(true);
    }
  });

  it('index.html declares a default focus ring for controls with no bespoke rule', () => {
    const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
    // A bare `:focus-visible` selector — specificity (0,1,0), so it is a FLOOR that every
    // `.thing:focus-visible` rule still overrides.
    expect(html).toMatch(/\n\s*:focus-visible\s*\{[^}]*outline:\s*2px solid/);
  });
});
