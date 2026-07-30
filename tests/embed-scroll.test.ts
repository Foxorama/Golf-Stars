import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isEmbedded } from '../src/app/viewportFit';
import { chromePath } from './chromium';

/**
 * IN AN EMBED, THE PAGE SCROLLS ITSELF (GS-embed-scroll).
 *
 * itch.io serves HTML5 games in an iframe with `scrolling="no"`, so the game's DOCUMENT cannot
 * scroll at all — a wheel over the game scrolls the STORE PAGE behind it. Reproduced in exactly
 * that setup: the Pro Shop is 1388px of content in an 860px frame, and 528px of it was
 * unreachable. The rack just ended. Shipyard, clubhouse and locker had the same hole.
 *
 * These cases drive a real `scrolling="no"` iframe, because that is the only place the bug exists:
 * every one of these screens scrolls perfectly in an ordinary tab, which is why it shipped.
 */

const dist = resolve(__dirname, '../dist/index.html');

/** A wrapper page that embeds the game the way itch does. */
function wrapperFile(screen: string): string {
  const file = join(tmpdir(), `gs-embed-${screen}.html`);
  writeFileSync(
    file,
    `<!doctype html><html><body style="margin:0;height:3000px">
       <div style="height:120px"></div>
       <iframe src="file://${dist}?intro=0&seed=42&screen=${screen}" width="600" height="860"
               frameborder="0" scrolling="no" style="display:block;margin:0 auto"></iframe>
       <div style="height:1200px"></div>
     </body></html>`,
  );
  return file;
}

describe('the embed predicate (pure)', () => {
  it('is exactly "somebody else is the top document"', () => {
    const top = {};
    expect(isEmbedded(top, top)).toBe(false);
    expect(isEmbedded({}, top)).toBe(true);
  });
});

describe.runIf(chromePath)('a screen taller than the frame stays reachable (GS-embed-scroll)', () => {
  let browser: import('playwright-core').Browser;

  beforeAll(async () => {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
  }, 60_000);
  afterAll(async () => { await browser?.close(); });

  /** Boot the game inside a `scrolling="no"` iframe and hand back its frame. */
  async function embedded(screen: string) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.goto(`file://${wrapperFile(screen)}`, { waitUntil: 'load' });
    const frame = page.frames().find((f) => f.url().includes('index.html'))!;
    await frame.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 20_000 });
    await page.waitForTimeout(700);
    return { page, frame };
  }

  it('scrolls the Pro Shop to its last row with the wheel', async () => {
    const { page, frame } = await embedded('shop');
    const box = await frame.evaluate(() => {
      const m = document.querySelector('.gs-main')!;
      return { embed: document.documentElement.hasAttribute('data-gs-embed'), sh: m.scrollHeight, ch: m.clientHeight };
    });
    expect(box.embed).toBe(true);
    // The case only means something if the rack really overflows the frame.
    expect(box.sh - box.ch).toBeGreaterThan(200);

    await page.mouse.move(600, 500);
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 200);
    await page.waitForTimeout(400);
    const top = await frame.evaluate(() => Math.round(document.querySelector('.gs-main')!.scrollTop));
    expect(top).toBeGreaterThanOrEqual(box.sh - box.ch - 2);
    await page.close();
  }, 90_000);

  it('does not chain the scroll out to the host page', async () => {
    // `overscroll-behavior-y: contain`. Without it, hitting the end of the rack hands the wheel to
    // the store page, which is what made it feel like nothing was happening at all.
    const { page, frame } = await embedded('shop');
    await page.mouse.move(600, 500);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 200);
    await page.waitForTimeout(400);
    const outer = await page.evaluate(() => Math.round(scrollY));
    const inner = await frame.evaluate(() => Math.round(document.querySelector('.gs-main')!.scrollTop));
    expect(inner).toBeGreaterThan(200); // it did scroll the game…
    expect(outer).toBe(0); // …and never the page behind it
    await page.close();
  }, 90_000);

  it('leaves the full-bleed play frame alone — it has nothing to scroll', async () => {
    // `--bleed` is excluded by name: it is already exactly one screen tall, and a scrollbar on the
    // play screen would be a bug, not a fix.
    const { page, frame } = await embedded('storyqualmatchlive');
    const r = await frame.evaluate(() => {
      const m = document.querySelector('.gs-main')!;
      return { bleed: m.className.includes('gs-main--bleed'), over: m.scrollHeight - m.clientHeight };
    });
    expect(r.bleed).toBe(true);
    expect(r.over).toBeLessThanOrEqual(2);
    await page.close();
  }, 90_000);

  it('leaves an ORDINARY tab scrolling its document, as it always did', async () => {
    // The flag is deliberately not applied everywhere: a self-scrolling page stops a mobile
    // browser's address bar collapsing, which costs real screen in a context that was never broken.
    const page = await browser.newPage({ viewport: { width: 600, height: 860 } });
    await page.goto(`file://${dist}?intro=0&seed=42&screen=shop`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 20_000 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      embed: document.documentElement.hasAttribute('data-gs-embed'),
      docScrolls: document.documentElement.scrollHeight > innerHeight + 2,
      mainScrolls: document.querySelector('.gs-main')!.scrollHeight - document.querySelector('.gs-main')!.clientHeight > 2,
    }));
    expect(r.embed).toBe(false);
    expect(r.docScrolls).toBe(true);
    expect(r.mainScrolls).toBe(false);
    await page.close();
  }, 60_000);
});
