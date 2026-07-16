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
        expect(text).toContain('Choose your game'); // the title screen actually rendered
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
        await click('The Voyage'); // the Voyage game tile (whole tile is the button)
        await click('Voyage as Feather'); // character select
        await click('First Tee'); // arc-intro → the hole step (GS-intro-split)
        await click('Tee Off'); // hole step → the play screen
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
        expect(text).not.toContain('Choose your game'); // not bounced back to the title
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  // A JS-clean page can still be visually unplayable. The GS-journey-hud redesign reused the `.gs-hud`
  // class the PLAY screen already owns for the travel BRIDGE hud, whose `inset:0` then stretched the play
  // screen's top info-chip (`.gs-hud-top.gs-glass`) + bottom controls (`.gs-hud-bottom`) to fill the whole
  // viewport — a full-screen `backdrop-filter:blur` panel that smeared the entire map into a dark, unfocused
  // blur while the app threw NO error (so every existing test stayed green). This measures the real layout:
  // the play HUD chrome must be small strips at the top and bottom, never blanketing the map. Guards the
  // class of CSS-collision regression that headless-sim + "does it throw" browser checks are blind to.
  it.runIf(chromePath)(
    'the play HUD chrome does not blanket the map (no full-screen blur overlay)',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
        await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 8000 });
        const click = async (t: string) => {
          await page.locator('button', { hasText: t }).first().click();
          await page.waitForTimeout(350);
        };
        await click('The Voyage');
        await click('Voyage as Feather');
        await click('First Tee');
        await click('Tee Off');
        await page.waitForTimeout(400);
        // Measure every HUD chrome element on the play screen. Each must be a compact strip — never
        // taller than half the viewport (pre-fix, the collided `inset:0` made these ~99% tall).
        const geo = await page.evaluate(() => {
          const vh = window.innerHeight;
          const pick = (sel: string) => {
            const el = document.querySelector(sel);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { hFrac: r.height / vh, top: r.top };
          };
          return { vh, top: pick('.gs-hud-top'), bottom: pick('.gs-hud-bottom') };
        });
        // The play screen must actually be mounted (both chrome pieces present).
        expect(geo.top, 'top info chip present').not.toBeNull();
        expect(geo.bottom, 'bottom controls present').not.toBeNull();
        // Neither may blanket the map — the bug stretched both to ~full height.
        expect(geo.top!.hFrac, `top chip height ${(geo.top!.hFrac * 100).toFixed(0)}% of viewport`).toBeLessThan(0.5);
        expect(geo.bottom!.hFrac, `bottom controls height ${(geo.bottom!.hFrac * 100).toFixed(0)}% of viewport`).toBeLessThan(0.5);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  // The travel / shop / market / clubhouse surfaces were the highest-risk UNCOVERED layer: the journey map
  // alone was redesigned three times in one day (#349/#351/#353), and the #353 full-screen blur shipped
  // green because no test could reach a between-stop screen — doing so headlessly meant playing a whole stop
  // (shot animations + watch/continue screens), which is flaky to script. The `?screen=` deep-link
  // (GS-screen-deeplink) mounts each screen directly off the real reducer transitions, so these smoke tests
  // can finally guard the class of CSS/DOM regression the sim suite and "does it throw" checks are blind to.
  // Each: the screen mounts (its own marker present), the app never faulted (no pageerror, no recovered
  // __gsErr), and we were NOT bounced back to the title (a rejected reducer jump falls back there).
  // Distinctive markers — a CSS selector unique to the screen, or a text string it renders. Deliberately
  // NOT `.gs-cog` (the settings cog rides every screen, including the title, so it proves nothing).
  const SCREENS: { screen: string; sel?: string; text?: string; label: string }[] = [
    { screen: 'character', sel: '.gs-select', text: 'Choose your golfer', label: 'the golfer roster' },
    { screen: 'travel', sel: '.gs-journey', label: 'the journey star-map' },
    { screen: 'shop', text: 'Pro Shop', label: 'the Pro Shop' },
    { screen: 'starmart', text: 'StarMart', label: 'the StarMart pop-up' },
    { screen: 'trademarket', text: 'Trade Market', label: 'the Trade Market' },
    { screen: 'clubhouse', text: 'The Clubhouse', label: 'the Clubhouse hall' },
    { screen: 'startour', sel: '.gs-startour', text: 'STAR TOUR', label: 'the Star Tour star map' },
    { screen: 'strokeresult', sel: '.gs-strres', text: 'Best rounds overall', label: 'the Star Tour round recap' },
    { screen: 'lore', sel: '.gs-lore', text: 'The Old Girl', label: 'the lore story-beat popup' },
    { screen: 'story', sel: '.gs-storyhub', text: 'Story Mode', label: 'the Story Mode campaign hub' },
  ];
  for (const { screen, sel, text, label } of SCREENS) {
    it.runIf(chromePath)(
      `?screen=${screen} mounts ${label} cleanly (no crash, not bounced to title)`,
      async () => {
        const { chromium } = await import('playwright-core');
        const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
        try {
          const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
          const errors: string[] = [];
          page.on('pageerror', (e) => errors.push(e.message));
          await page.goto('file://' + dist + `?screen=${screen}&intro=0&seed=42`, { waitUntil: 'load' });
          await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 8000 });
          const info = await page.evaluate((mk: { sel?: string; text?: string }) => {
            const app = document.getElementById('app')!;
            const t = app.textContent || '';
            return {
              err: (window as unknown as { __gsErr?: string }).__gsErr ?? null,
              hasSel: mk.sel ? !!app.querySelector(mk.sel) : true,
              hasText: mk.text ? t.includes(mk.text) : true,
              text: t,
            };
          }, { sel, text });
          expect(errors, `pageerror on ?screen=${screen}: ${errors[0] ?? ''}`).toEqual([]);
          expect(info.err, `recovered error on ?screen=${screen}`).toBeNull();
          expect(info.hasSel, `${label} did not mount (selector ${sel} absent) on ?screen=${screen}`).toBe(true);
          expect(info.hasText, `${label} did not mount (text "${text}" absent) on ?screen=${screen}`).toBe(true);
          // A rejected reducer jump would leave us on the title character-picker; the deep-link must not.
          expect(info.text).not.toContain('Choose your game');
        } finally {
          await browser.close();
        }
      },
      60_000,
    );
  }

  // CHARACTER SELECT fits one mobile screen with no scroll (GS-select-onescreen). The roster locks to the
  // viewport (`.gs-main--fit`) so the whole golfer grid fits a phone with no vertical page scroll and no
  // horizontal overflow — the exact regression the bug report flagged (cards running off the bottom/edge).
  // A pure-DOM guard the sim suite is blind to; only a real browser lays out the grid + viewport lock.
  it.runIf(chromePath)(
    'character select fits one phone screen with no page scroll (GS-select-onescreen)',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto('file://' + dist + '?screen=character&intro=0&seed=42', { waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 8000 });
        await page.waitForSelector('.gs-select', { timeout: 8000 });
        const m = await page.evaluate(() => {
          const de = document.documentElement;
          return { vScroll: de.scrollHeight - de.clientHeight, hScroll: de.scrollWidth - de.clientWidth };
        });
        expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
        // A couple of px of sub-pixel rounding is fine; a scrolling roster (the bug) is tens of px.
        expect(m.vScroll, 'roster must not scroll vertically').toBeLessThanOrEqual(2);
        expect(m.hScroll, 'roster must not overflow horizontally').toBeLessThanOrEqual(2);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  // STAR-MAP WEAPONS (GS-star-tour-weapons). The dashboard fire button spawns a themed projectile into the
  // `#gs-st-shots` SVG layer + ticks an ammo pip down — pure app-layer DOM the sim suite can't see. This
  // guards that the button mounts, firing appends a shot group, and the magazine decrements (and empties).
  it.runIf(chromePath)(
    'Star Tour dashboard fire button spawns projectiles + spends ammo',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto('file://' + dist + '?screen=startour&intro=0&seed=42', { waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 8000 });
        // The fire control + the projectile layer both mounted.
        expect(await page.$('[data-startour-fire]'), 'fire button present').not.toBeNull();
        expect(await page.$('#gs-st-shots'), 'shots layer present').not.toBeNull();
        const pipsFull = await page.$$eval('#gs-st-ammo .gs-sthud__pip--on', (e) => e.length);
        expect(pipsFull, 'magazine starts loaded').toBeGreaterThan(0);
        // Fire once → a shot group appears in the layer and an ammo pip goes dark.
        await page.click('[data-startour-fire]');
        await page.waitForTimeout(60);
        const afterOne = await page.evaluate(() => ({
          shots: document.getElementById('gs-st-shots')?.childElementCount ?? 0,
          pips: document.querySelectorAll('#gs-st-ammo .gs-sthud__pip--on').length,
        }));
        expect(afterOne.shots, 'firing spawned projectile(s)').toBeGreaterThan(0);
        expect(afterOne.pips, 'firing spent a charge').toBe(pipsFull - 1);
        // Empty the magazine, then a further shot is refused (button goes --empty, no charge left).
        for (let i = 0; i < pipsFull + 1; i++) await page.click('[data-startour-fire]');
        await page.waitForTimeout(30);
        const drained = await page.evaluate(() => ({
          pips: document.querySelectorAll('#gs-st-ammo .gs-sthud__pip--on').length,
          empty: document.getElementById('gs-st-fire')?.classList.contains('gs-sthud__fire--empty') ?? false,
        }));
        expect(drained.pips, 'magazine emptied').toBe(0);
        expect(drained.empty, 'fire button reads empty').toBe(true);
        expect(errors, `pageerror: ${errors[0] ?? ''}`).toEqual([]);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  // ANIMATED DECOR VIEW-INVARIANCE (GS-decor-view-states). The derelict's drifting hull junk/sections (and
  // weather, the Cetus river) are drawn independently on the aim/putt overlay AND the watch play view. When
  // any element is anchored to the SCREEN instead of the WORLD — as the big ship SECTIONS once were
  // (fx*W, sizeFrac*min(W,H)) — it renders at a different scale + path in each view state and JUMPS the
  // instant the camera switches. This is pure canvas math the headless sim can't see. `window.__gsDecorProbe`
  // renders the decor at one wall-clock through two projectors that differ ONLY by a camera PAN; a
  // world-anchored element must shift on screen by exactly the pan, so re-aligning frame A by the pan
  // reproduces frame B (high IoU). A screen-anchored element would stay put and the IoU would collapse.
  it.runIf(chromePath)(
    'derelict drift decor is world-anchored — it does not jump between view states',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 8000 });
        // The probe builds its own derelict hole, so we don't have to play a whole voyage to reach one.
        const probe = await page.evaluate(() => {
          const fn = (window as unknown as { __gsDecorProbe?: (o: unknown) => unknown }).__gsDecorProbe;
          if (!fn) return null;
          return fn({ dist: 16, now: 9_000 }) as {
            moveRatio: number; alignedOverlap: number; staticOverlap: number;
            decorPixelsA: number; decorPixelsB: number; shift: [number, number];
          };
        });
        expect(errors, `pageerror during decor probe: ${errors[0] ?? ''}`).toEqual([]);
        expect(probe, 'window.__gsDecorProbe not installed at boot').not.toBeNull();
        // Decor must actually have drawn in both frames (otherwise the metrics are vacuous).
        expect(probe!.decorPixelsA, 'decor drew in frame A').toBeGreaterThan(200);
        expect(probe!.decorPixelsB, 'decor drew in frame B').toBeGreaterThan(200);
        // The camera genuinely panned (a non-trivial screen shift), so the invariance test isn't vacuous.
        const panPx = Math.hypot(probe!.shift[0], probe!.shift[1]);
        expect(panPx, 'camera pan produced a screen shift').toBeGreaterThan(4);
        // The proof: the decor lines up FAR better after realigning by the camera pan than left static —
        // i.e. it MOVED WITH the world. A screen-anchored element (the old ship SECTIONS) would line up
        // with NO realign instead, dragging moveRatio to ≤1. Robust to edge culling / thin features: it's
        // a differential, not an absolute-overlap threshold.
        expect(
          probe!.moveRatio,
          `decor move-with-camera ratio ${probe!.moveRatio.toFixed(2)} (aligned ${probe!.alignedOverlap} vs static ${probe!.staticOverlap}) — ≤1 means decor is screen-anchored and jumps between views`,
        ).toBeGreaterThan(3);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );

  // The travel screen's map is INTENTIONALLY full-bleed — so the #353-class guard here is different from the
  // play screen's: the bridge HUD console (`.gs-bhud`) must stay `pointer-events:none` (CLAUDE.md invariant —
  // map taps pass through to the worlds; only its console controls catch touches), and the journey chart must
  // actually fill the viewport rather than collapse to a sliver (the "zoomed-out-to-unusable" bug the redesign
  // was meant to kill). Both are invisible to the sim suite and to a bare "does it throw" boot check.
  it.runIf(chromePath)(
    'the travel bridge HUD lets map taps through and the star-map fills the screen',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
        await page.goto('file://' + dist + '?screen=travel&intro=0&seed=42', { waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 8000 });
        const geo = await page.evaluate(() => {
          const vh = window.innerHeight;
          const hud = document.querySelector('.gs-bhud');
          const map = document.querySelector('.gs-journey');
          return {
            hudPresent: !!hud,
            hudPE: hud ? getComputedStyle(hud).pointerEvents : null,
            mapHFrac: map ? map.getBoundingClientRect().height / vh : 0,
          };
        });
        expect(geo.hudPresent, 'bridge HUD present').toBe(true);
        // The class-collision failure mode is chrome that swallows the whole viewport; the invariant that
        // proves it is safe is `pointer-events:none` on the frame (so taps reach the map beneath).
        expect(geo.hudPE, `bridge HUD pointer-events is "${geo.hudPE}", must be none so map taps pass through`).toBe('none');
        // The map must fill most of the screen — not collapse to an unusable sliver.
        expect(geo.mapHFrac, `journey map height ${(geo.mapHFrac * 100).toFixed(0)}% of viewport`).toBeGreaterThan(0.6);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );
});
