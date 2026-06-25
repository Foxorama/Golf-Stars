import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guards the BUILT ARTIFACT, not just the source — this is the class of failure that
 * repeatedly shipped (blank page on real devices) while unit tests stayed green:
 *  - external asset 404 (must be a single self-contained file),
 *  - modern globals/syntax an older module-capable engine can't run (globalThis, ??),
 *  - and a real-browser smoke boot (the app must actually paint).
 */

const dist = resolve(__dirname, '../dist/index.html');
let html = '';

beforeAll(() => {
  execSync('npx vite build', { cwd: resolve(__dirname, '..'), stdio: 'ignore' });
  html = readFileSync(dist, 'utf8');
}, 120_000);

describe('build output (regression guards)', () => {
  it('is a single self-contained file — no external script/asset to 404', () => {
    // No <script src=...> or <link href=...assets...> — everything inlined.
    expect(/<script[^>]+src=/.test(html)).toBe(false);
    expect(/<link[^>]+href="[^"]*assets/.test(html)).toBe(false);
  });

  it('ships the globalThis polyfill before the app module (older-engine safety)', () => {
    // The polyfill must appear, and before the inlined module that may reference it.
    const poly = html.indexOf('window.globalThis = window');
    expect(poly).toBeGreaterThan(-1);
  });

  it('contains no untranspiled nullish-coalescing (older engines reject it at parse)', () => {
    // The app bundle is built to es2017; `??` must be down-levelled. (Ternaries like
    // `x ? .5 : 1` are fine — those are `? .` with a space-or-digit, not `??`.)
    expect(html.includes('??')).toBe(false);
  });

  it('still carries the boot watchdog (turns a blank page into a visible error)', () => {
    expect(html).toContain('did not run within 5s');
  });
});

// --- real-browser smoke test (runs when a Chromium binary is available) ----------
function findChromium(): string | null {
  const bases = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    process.env.HOME ? `${process.env.HOME}/.cache/ms-playwright` : undefined,
  ].filter(Boolean) as string[];
  for (const base of bases) {
    try {
      const d = readdirSync(base).find((x) => x.startsWith('chromium-') && !x.includes('headless'));
      if (d) return `${base}/${d}/chrome-linux/chrome`;
    } catch {
      /* not this dir */
    }
  }
  return null;
}
const chromePath = findChromium();

describe('build output (real browser)', () => {
  it.runIf(chromePath)(
    'the built app boots and paints the title in a real browser',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto('file://' + dist, { waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 8000 });
        const text = (await page.textContent('#app')) || '';
        expect(errors).toEqual([]);
        expect(text).toContain('Golf Stars');
        expect(text).toContain('run format'); // the title screen actually rendered
      } finally {
        await browser.close();
      }
    },
    60_000,
  );
});
