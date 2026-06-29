import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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

  it('the watchdog captures import-time throws (the class that blanked real devices)', () => {
    // A throw during top-level module eval aborts the bundle before the entry's own
    // try/catch — so ONLY global handlers can see it. These three are mandatory:
    expect(html).toContain('window.onerror'); // gives source:line:col to locate the throw
    expect(html).toContain("addEventListener('error'");
    expect(html).toContain("addEventListener('unhandledrejection'");
    // And the captured error must survive: persisted to __gsErr, latched so the 5s
    // timeout can't overwrite the real cause with "(none captured)".
    expect(html).toContain('window.__gsErr');
    expect(html).toContain('errorShown'); // the no-clobber latch
  });
});

// --- real-browser smoke test (runs when a Chromium binary is available) ----------
// Returns a path ONLY if the actual chrome executable exists — a `chromium-*` cache dir
// can exist without the binary (a partial/mismatched `playwright install`, e.g. the local
// playwright-core's expected revision differs from what got downloaded). Checking the
// directory alone made `runIf` lie and the launch hard-fail in CI; verifying the binary
// lets the test SKIP cleanly when Chromium isn't genuinely installed, and run when it is.
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
      continue; // not this dir
    }
    for (const d of dirs) {
      const bin = `${base}/${d}/chrome-linux/chrome`;
      if (existsSync(bin)) return bin;
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

  // The regression that blanked real devices was an import-time throw the diagnostics
  // HID (no __gsErr, clobbered by the 5s timeout). This proves the watchdog now surfaces
  // that exact class: inject a throw at the top of the inlined module, and the page must
  // show a real boot error carrying the message — never blank, never "(none captured)".
  it.runIf(chromePath)(
    'surfaces an import-time module throw instead of blanking',
    async () => {
      const marker = 'INJECTED_IMPORT_THROW';
      // Inject right after the inlined module's opening tag, so it throws before any of
      // the bundle (or the entry's try/catch) can run — i.e. a true import-time fault.
      const injected = html.replace(
        /(<script type="module"[^>]*>)/,
        `$1throw new Error(${JSON.stringify(marker)});`,
      );
      expect(injected).not.toBe(html); // the replace actually matched
      const tmp = resolve(__dirname, '../dist/__inject.html');
      writeFileSync(tmp, injected);
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage();
        await page.goto('file://' + tmp, { waitUntil: 'load' });
        // Wait for the watchdog to paint the error (it shows immediately on onerror).
        await page.waitForFunction(
          (m) => (document.getElementById('app')?.textContent || '').includes(m),
          marker,
          { timeout: 8000 },
        );
        const text = (await page.textContent('#app')) || '';
        expect(text).toContain('boot error');
        expect(text).toContain(marker);
        expect(text).not.toContain('(none captured)');
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  // The play view is canvas/DOM code the headless sim never mounts, so a fault there (e.g. the
  // cineZoom temporal-dead-zone crash) sails past the unit suite while every interactive shot
  // throws — dispatch's catch → recover() then wipes the save and dumps you back on the format
  // picker. This drives ONE real shot end-to-end and asserts the play view mounts cleanly: no
  // page error, no recovered error (recover() always stamps window.__gsErr), and we did NOT get
  // bounced back to the title.
  it.runIf(chromePath)(
    'plays one interactive shot without crashing back to the title',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 8000 });
        const click = async (t: string) => {
          const b = page.locator('button', { hasText: t }).first();
          await b.click();
          await page.waitForTimeout(350);
        };
        await click('Start — The Voyage');
        await click('Voyage as Feather'); // character select
        await click('Play shot by shot'); // → the play screen
        await page.waitForTimeout(300);
        // Pull-to-shot gesture: press on the map, drag DOWN to charge power past the commit
        // threshold, release to fire.
        await page.mouse.move(207, 400);
        await page.mouse.down();
        for (let i = 1; i <= 10; i++) {
          await page.mouse.move(207, 400 + i * 18);
          await page.waitForTimeout(15);
        }
        await page.mouse.up();
        await page.waitForTimeout(1200);
        const recovered = await page.evaluate(() => (window as unknown as { __gsErr?: string }).__gsErr ?? null);
        const text = (await page.textContent('#app')) || '';
        expect(errors).toEqual([]);
        expect(recovered).toBeNull();
        expect(text).not.toContain('Start — The Voyage'); // not bounced back to the format picker
      } finally {
        await browser.close();
      }
    },
    60_000,
  );
});
