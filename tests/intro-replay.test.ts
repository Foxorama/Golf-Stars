import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromePath } from './chromium';

/**
 * The opening cinematic can be replayed (GS-intro-replay).
 *
 * It only ever played once, unprompted, on a fresh session — so the people most likely to miss it
 * are the ones arriving through an embedded store page, where the game may autostart while the
 * visitor is still reading the description. A replay control is what makes "autoplay on load" a safe
 * setting to turn on: the cinematic stops being a one-shot the player can permanently miss.
 */

const root = resolve(__dirname, '..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');
const app = read('src/app.ts');
const title = read('src/app/titleScreens.ts');

/** Just one function's body — a slice to "the next export" swallows whatever was declared after it. */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const end = src.indexOf('\n}', start);
  return src.slice(start, end < 0 ? undefined : end + 2);
}

const replayFn = fnBody(title, 'replayIntroHTML');

describe('the control exists on the title', () => {
  it('renders unconditionally in the hero chips row', () => {
    expect(title).toContain('function replayIntroHTML()');
    expect(title).toContain('${replayIntroHTML()}');
    expect(title).toMatch(/data-replay-intro="1"/);
    // No `if (…) return ''` — unlike the install nudge, there is no state in which replaying the
    // intro is unavailable.
    expect(replayFn, 'the replay control has grown a condition').not.toMatch(/return '';/);
  });

  it('carries an accessible name that says what it does', () => {
    // "▶ Intro" alone is not a description of an action.
    expect(title).toMatch(/aria-label="Replay the opening cinematic"/);
  });

  it('is NOT gated on reduced motion', () => {
    // Deliberate. `shouldPlayIntro()` already stops the cinematic happening TO the player unasked,
    // which is what the setting is for; hiding a control the player must tap would instead mean a
    // reduced-motion player can never see the intro at all. The overlay ships its own Skip button.
    expect(replayFn).not.toMatch(/reducedMotion/);
  });
});

describe('the wiring', () => {
  const handler = app.slice(
    app.indexOf("app.querySelectorAll<HTMLElement>('[data-replay-intro]')"),
    app.indexOf("// PWA install nudge"),
  );

  it('calls mountIntro directly', () => {
    expect(handler).not.toBe('');
    expect(handler).toContain('mountIntro({})');
  });

  it('does not clear fc_introSeen', () => {
    // That flag gates the AUTOMATIC play. Clearing it would turn one deliberate replay into an
    // ambush on the next reload.
    expect(handler).not.toContain('fc_introSeen');
    expect(handler).not.toContain('removeItem');
  });

  it('survives a throwing cinematic rather than taking the title down with it', () => {
    // Same contract the boot path already keeps: the title is painted underneath, so losing the
    // intro is harmless and must never be fatal.
    expect(handler).toMatch(/try \{[\s\S]*mountIntro\(\{\}\);[\s\S]*\} catch \{/);
  });

  it('stops the click propagating', () => {
    expect(handler).toContain('e.stopPropagation()');
  });
});

// --- real browser: the button is there and actually raises the cinematic ------------
const dist = resolve(root, 'dist/index.html');

describe('replaying the intro (real browser)', () => {
  it.runIf(chromePath)(
    'tapping ▶ Intro mounts the cinematic overlay over a title that had already settled',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        // `?intro=0` skips the BOOT cinematic, which is exactly the state this feature is for: a
        // player who never saw it (or watched it play to an empty chair on a store page).
        await page.goto('file://' + dist + '?intro=0', { waitUntil: 'load' });
        await page.waitForFunction(
          () => document.getElementById('app')?.getAttribute('data-booted') === '1',
          { timeout: 8000 },
        );
        expect(await page.locator('[data-gs-intro]').count(), 'the boot intro was not skipped').toBe(0);

        await page.evaluate(() => document.querySelector<HTMLElement>('[data-replay-intro]')!.click());
        await page.waitForSelector('[data-gs-intro]', { timeout: 5000 });

        // The cinematic is a <body>-level takeover, so it must seal the app behind it — otherwise a
        // keyboard player tabs into a title screen they cannot see (GS-a11y-focus).
        expect(await page.evaluate(() => document.getElementById('app')?.hasAttribute('inert'))).toBe(true);

        // …and its own Skip must take it back down, releasing the app.
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('[data-gs-intro] button')]
            .find((b) => /Skip/.test(b.textContent!))!
            .click(),
        );
        await page.waitForFunction(() => !document.querySelector('[data-gs-intro]'), { timeout: 5000 });
        expect(await page.evaluate(() => document.getElementById('app')?.hasAttribute('inert'))).toBe(false);
      } finally {
        await browser.close();
      }
    },
    120_000,
  );
});
