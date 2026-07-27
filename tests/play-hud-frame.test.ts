/**
 * The ONE persistent play HUD frame (GS-hud-frame).
 *
 * The bug this guards is a LAYOUT bug, which the pure-sim suite is structurally blind to: before this
 * frame, each of the play screen's six view states built its own layout, so the map/zoom/settings
 * column existed while aiming and VANISHED on the watch and putt screens, the caddy badge came and
 * went, and the controls panel changed shape every state. Nothing threw; it was just miserable to
 * play. So this test measures the real thing in a real browser — mount the play screen, take a
 * swing, and assert the frame's five regions are all still there, in the same places, while the ball
 * is in the air.
 *
 * Runs against the BUILT artifact (like tests/build.test.ts) so it also proves the CSS survives the
 * single-file inline step. Skipped when no Chromium is available.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { playFrameHTML, type PlayFrameMode } from '../src/app/playFrame';

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

/** The frame's five fixed regions. Every play state must mount every one of them. */
const REGIONS = [
  '.gs-hud-top', // info bar
  '.gs-mapctrl', // nav column
  '.gs-hud-caddy', // the caddy's permanent slot
  '.gs-hud-controls', // controls panel
  '.gs-hud-actions', // action column (aim mode · auto-finish · the bag)
] as const;

describe('the persistent play HUD frame (GS-hud-frame)', () => {
  const APP = readFileSync(resolve(__dirname, '../src/app.ts'), 'utf8');

  it('every play state is built by the ONE frame builder, never a hand-rolled layout', () => {
    // Each state used to open its own `<div class="gs-shot gs-shot--full">`. That's exactly how the
    // six layouts drifted apart. The frame element now has a single origin (playFrame.ts), so a new
    // state can't quietly grow its own skeleton.
    expect(APP).not.toMatch(/class="gs-shot gs-shot--full/);
    expect(APP).toMatch(/playFrameHTML\(/);
    const frame = readFileSync(resolve(__dirname, '../src/app/playFrame.ts'), 'utf8');
    expect(frame).toMatch(/class="gs-shot gs-shot--full/);
    // The frame lives in the play screen's OWN class namespace (never another screen's — see the
    // #353 `.gs-hud` map-blur regression).
    for (const cls of ['gs-hud-caddy', 'gs-hud-actions', 'gs-hud-commit']) expect(frame).toContain(cls);
  });

  // The frame builder is a pure string function, so the structural half of the contract is cheap to
  // assert directly — no browser needed, and it covers states the browser test can't easily reach
  // (a hired caddy, an off-duty caddy on the green).
  const frameFor = (mode: PlayFrameMode, caddyId?: string, caddyOffDuty = false): string =>
    playFrameHTML({
      mode,
      map: '<div class="gs-bigmap"></div>',
      top: '<div class="gs-hud gs-hud-top gs-glass"></div>',
      rows: mode === 'putt' ? ['<div class="gs-clubrow"></div>'] : [],
      commit: '<button class="gs-btn gs-btn--primary">go</button>',
      caddyId,
      caddyOffDuty,
      nav: { whole: false, moved: false, viewDisabled: mode !== 'aim', settingsDisabled: mode === 'watch' },
      autoFinishDisabled: mode === 'watch',
      bag: { code: '7i', name: '7-Iron', clubs: 12, disabled: mode !== 'aim' },
      aim: { icon: '◎', label: 'Auto aim', on: false, disabled: mode !== 'aim' },
      lefty: false,
    });

  it('mounts all five regions in every one of the three play shapes', () => {
    for (const mode of ['aim', 'putt', 'watch'] as const) {
      const html = frameFor(mode, 'space-ducks');
      for (const sel of REGIONS) {
        expect(html, `${sel} missing in the ${mode} frame`).toContain(sel.slice(1));
      }
      expect(html, `the commit row is missing in the ${mode} frame`).toContain('gs-hud-commit');
      // The nav column always ships the SAME five buttons — a dead control greys out, it never goes.
      expect((html.match(/class="gs-mapbtn/g) ?? []).length, `${mode} nav column button count`).toBe(5);
    }
  });

  it('mounts the bag + aim-mode cells in every state, disabled where they cannot act (GS-hud-bag)', () => {
    for (const mode of ['aim', 'putt', 'watch'] as const) {
      const html = frameFor(mode, 'space-ducks');
      expect(html, `the bag is missing in the ${mode} frame`).toContain('data-clubpick="open"');
      expect(html, `the aim mode is missing in the ${mode} frame`).toContain('data-aimmode="1"');
      // The bag says WHICH club is in hand — the club name left the panel with the cycler, so this
      // face is now the only place the player reads it while aiming.
      expect(html).toContain('>7i<');
      expect(html).toContain('7-Iron');
    }
    // Off the aim state both are greyed, never gone — the GS-hud-frame rule.
    const watch = frameFor('watch', 'space-ducks');
    expect((watch.match(/disabled/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // The bag is the column's IN-FLOW anchor and everything else floats above it: the bar's height
    // is what the camera measures as the map's clear band (GS-play-hud-space), so a three-button
    // column in flow would hand back none of the screen this feature exists to recover.
    const aim = frameFor('aim', 'space-ducks');
    expect(aim.indexOf('gs-hud-actionstack')).toBeLessThan(aim.indexOf('gs-hud-bagbtn'));
  });

  it('the aim + watch panels carry nothing but their commit row (GS-hud-bag)', () => {
    // The club cycler, the power bar, the spray-odds legend and the carry range are gone from the
    // aim HUD — they restated the aim cone drawn on the map, in a block that cost a quarter of a
    // phone screen. The panel dissolves to the pill (`--slim`); only the putt keeps a real panel.
    for (const mode of ['aim', 'watch'] as const) {
      expect(frameFor(mode), `the ${mode} panel must be slim`).toContain('gs-hud-controls--slim');
    }
    expect(frameFor('putt'), 'the putt panel keeps its pace meter + break read').not.toContain(
      'gs-hud-controls--slim',
    );
    // …and the app must not have quietly rebuilt one: no club cycler on the shot screen.
    expect(APP).not.toMatch(/data-cycle=/);
  });

  it('reserves the caddy slot whether or not a caddy is on the bag', () => {
    const hired = frameFor('aim', 'space-ducks');
    expect(hired).toContain('gs-hud-caddy');
    expect(hired).toContain('gs-caddybadge');
    expect(hired).not.toContain('gs-hud-caddy--empty');

    const bare = frameFor('aim', undefined);
    expect(bare, 'the slot must still exist with no caddy hired').toContain('gs-hud-caddy--empty');

    // On the green a distance/guard caddy has no read — the badge DIMS, it does not vanish (that
    // was the old putt screen, whose left edge jumped every time the ball reached the green).
    const green = frameFor('putt', 'driver-dan', true);
    expect(green).toContain('gs-hud-caddy--off');
    expect(green).toContain('gs-caddybadge');
  });

  it.runIf(chromePath)(
    'keeps all five regions — and their positions — from aiming through the shot animation',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
        await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
          timeout: 8000,
        });
        const click = async (t: string) => {
          await page.locator('button', { hasText: t }).first().click();
          await page.waitForTimeout(350);
        };
        await click('The Voyage');
        await click('Voyage as Feather');
        await click('First Tee');
        await click('Tee Off');
        await page.waitForSelector('[data-playmode="aim"]', { timeout: 8000 });

        const boxes = () =>
          page.evaluate((sels) => {
            const out: Record<string, { x: number; y: number; w: number; h: number } | null> = {};
            for (const s of sels) {
              const el = document.querySelector(s);
              if (!el) {
                out[s] = null;
                continue;
              }
              const r = el.getBoundingClientRect();
              out[s] = { x: r.left, y: r.top, w: r.width, h: r.height };
            }
            return out;
          }, [...REGIONS, '.gs-hud-commit .gs-btn', '.gs-hud-actions .gs-roundbtn']);

        const aim = await boxes();
        for (const sel of REGIONS) expect(aim[sel], `${sel} missing while aiming`).not.toBeNull();
        // The commit row exists while aiming too (the tap-to-swing button) — this is the row that
        // used to be a putt-only control.
        expect(aim['.gs-hud-commit .gs-btn'], 'the commit button is missing while aiming').not.toBeNull();

        // Take the shot with the frame's own commit button (the pull gesture is untestable headlessly
        // and this button is the whole point of the fixed action row).
        await page.locator('[data-swing]').first().click();
        await page.waitForSelector('[data-playmode="watch"]', { timeout: 8000 });
        await page.waitForTimeout(220); // let the canvas mount + the frame settle

        const watch = await boxes();
        for (const sel of REGIONS) expect(watch[sel], `${sel} VANISHED while watching the shot`).not.toBeNull();

        // Same places, not just present. 2px of slack for sub-pixel layout only — this is the
        // "buttons must never move between states" contract.
        const near = (sel: string) => {
          const a = aim[sel]!;
          const b = watch[sel]!;
          expect(Math.abs(a.x - b.x), `${sel} moved ${Math.abs(a.x - b.x).toFixed(1)}px horizontally`).toBeLessThan(2);
          expect(Math.abs(a.y - b.y), `${sel} moved ${Math.abs(a.y - b.y).toFixed(1)}px vertically`).toBeLessThan(2);
        };
        near('.gs-mapctrl');
        near('.gs-hud-caddy');
        near('.gs-hud-commit .gs-btn');
        near('.gs-hud-actions .gs-roundbtn');
        // The panel is BOTTOM-anchored: its floor is the fixed edge (its top legitimately rises when
        // a state's rows are taller — a pace meter versus a power bar). The floor is what keeps the
        // commit row, caddy and auto-finish on one line in every state.
        const floor = (b: { y: number; h: number }) => b.y + b.h;
        expect(Math.abs(floor(aim['.gs-hud-controls']!) - floor(watch['.gs-hud-controls']!))).toBeLessThan(2);

        // Controls that can't act mid-flight are DISABLED, not removed.
        const disabled = await page.evaluate(() => ({
          nav: [...document.querySelectorAll('.gs-mapctrl button')].every((b) => (b as HTMLButtonElement).disabled),
          auto: (document.querySelector('.gs-hud-actions .gs-roundbtn') as HTMLButtonElement | null)?.disabled ?? null,
          commit: (document.querySelector('.gs-hud-commit .gs-btn') as HTMLButtonElement | null)?.disabled ?? null,
        }));
        expect(disabled.nav, 'the nav column must be greyed, not gone, mid-flight').toBe(true);
        expect(disabled.auto, 'auto-finish must be greyed, not gone, mid-flight').toBe(true);
        expect(disabled.commit, 'the commit button must be greyed, not gone, mid-flight').toBe(true);

        // No chrome may blanket the map (the #353 class of regression) — the frame's panel is a strip.
        expect(watch['.gs-hud-controls']!.h / 896).toBeLessThan(0.45);
        expect(watch['.gs-hud-top']!.h / 896).toBeLessThan(0.45);
      } finally {
        await browser.close();
      }
    },
    90_000,
  );

  it.runIf(chromePath)(
    'the caddy slot holds its box on a bag with no caddy hired',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
        await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
        await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
          timeout: 8000,
        });
        const click = async (t: string) => {
          await page.locator('button', { hasText: t }).first().click();
          await page.waitForTimeout(350);
        };
        await click('The Voyage');
        await click('Voyage as Feather');
        await click('First Tee');
        await click('Tee Off');
        await page.waitForSelector('[data-playmode="aim"]', { timeout: 8000 });
        // A fresh voyage hires no caddy, so this is the empty-slot case: the placeholder must still
        // reserve the badge's box, or the whole bottom bar shifts the moment one IS hired.
        const slot = await page.evaluate(() => {
          const el = document.querySelector('.gs-hud-caddy');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { w: r.width, h: r.height, empty: el.classList.contains('gs-hud-caddy--empty') };
        });
        expect(slot, 'the caddy slot must exist even with no caddy hired').not.toBeNull();
        expect(slot!.empty).toBe(true);
        expect(slot!.w).toBeGreaterThan(60);
        expect(slot!.h).toBeGreaterThan(40);
      } finally {
        await browser.close();
      }
    },
    60_000,
  );
});
