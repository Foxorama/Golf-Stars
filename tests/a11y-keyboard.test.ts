import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findChromium as findChromiumShared } from './chromium';

/**
 * Keyboard play guards (GS-a11y-keyboard).
 *
 * The pull gesture was the ONLY way to aim or modulate power, and it is pointer-only — so a player
 * on a keyboard, a switch, or any assistive pointer alternative could reach the Swing button but was
 * locked to the seeded aim at the seeded power for the whole game. That is not a harder game, it is
 * a different and worse one.
 *
 * Two things need guarding: that keyboard and pointer resolve through the SAME code (contract 2's
 * spirit — one shot mechanic, not two), and that the per-render listener does not stack.
 */

const root = resolve(__dirname, '..');
const app = readFileSync(resolve(root, 'src/app.ts'), 'utf8');

describe('one shot mechanic, two input devices', () => {
  it('drag and keys both resolve through setAimPower', () => {
    expect(app).toMatch(/const setAimPower = \(bearingDeg: number, power: number\): void =>/);
    // The drag no longer computes the target itself — it delegates.
    const drag = app.slice(app.indexOf('const applyDrag ='), app.indexOf('const detach ='));
    expect(drag).toContain('setAimPower(');
    expect(drag, 'applyDrag still derives its own free target').not.toContain('selFreeTarget = targetFromBearing');
    // …and so do the arrow keys, for all four directions.
    const keys = app.slice(app.indexOf('const onPlayKey ='), app.indexOf('window.addEventListener(\'keydown\', onPlayKey)'));
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) expect(keys).toContain(k);
    expect((keys.match(/setAimPower\(/g) ?? []).length).toBe(4);
  });

  it('adds no second commit path — Enter/Space stay with the focused control', () => {
    // The Swing button is already tab-reachable and commits; a global Enter handler here would
    // double-fire with it.
    const keys = app.slice(app.indexOf('const onPlayKey ='), app.indexOf("window.addEventListener('keydown', onPlayKey)"));
    expect(keys).not.toMatch(/case 'Enter'/);
    expect(keys).not.toMatch(/case ' '/);
    expect(keys).not.toContain("type: 'shot'");
  });

  it('refuses to fight the browser, a text field, or a raised modal', () => {
    const keys = app.slice(app.indexOf('const onPlayKey ='), app.indexOf("window.addEventListener('keydown', onPlayKey)"));
    expect(keys).toMatch(/altKey \|\| e\.ctrlKey \|\| e\.metaKey/);
    expect(keys).toMatch(/INPUT\|TEXTAREA\|SELECT/);
    // The modal test is structural: applyOverlayFocus inerts the page behind a sheet.
    expect(keys).toContain("document.querySelector('#app > [inert]')");
    // Arrows would otherwise scroll the page.
    expect(keys).toContain('e.preventDefault()');
  });
});

/**
 * The putt aims on the arrows too (GS-a11y-putt-arrows).
 *
 * `wireShotGesture` early-returns on the putt, so the shot handler above is absent on a green — the
 * one stroke in the game with no pointer-free aim was the one where the read matters most. The fix
 * drives the EXISTING ◄/► buttons rather than reaching into `selPuttAim`, because that click handler
 * is where the per-putt step, the clamp, the tap acceleration and the surgical refresh are decided.
 */
describe('the putt aims on the arrows', () => {
  const keys = app.slice(app.indexOf('const onPuttKey ='), app.indexOf("window.addEventListener('keydown', onPuttKey)"));

  it('is wired, and only for the two aim directions', () => {
    expect(keys, 'the putt key handler is missing').not.toBe('');
    expect(keys).toContain('ArrowLeft');
    expect(keys).toContain('ArrowRight');
    // Up/down belong to the pace meter, which owns that axis and is already keyboard-operable. A
    // second meaning for those keys on a green would be worse than none.
    expect(keys).not.toContain('ArrowUp');
    expect(keys).not.toContain('ArrowDown');
  });

  it('drives the buttons instead of opening a second path into the aim', () => {
    expect(keys).toMatch(/\[data-putt-aim="\$\{dir\}"\]/);
    expect(keys).toContain('btn.click()');
    expect(keys, 'the key handler nudges selPuttAim itself — that is a second description of the aim')
      .not.toContain('selPuttAim');
    expect(keys, 'the key handler re-implements the clamp').not.toContain('puttAimMax');
    expect(keys, 'the key handler re-implements the step').not.toContain('puttAimStep');
  });

  it('does not compound the keyboard auto-repeat with the tap-streak acceleration', () => {
    // Both accelerate. Together they cross the whole clamp in a few hundred milliseconds, so a held
    // arrow resets the tap clock and each repeat lands as a single 1× step (what a held BUTTON does).
    expect(keys).toMatch(/if \(e\.repeat\) puttAimLastTapMs = 0;/);
  });

  it('refuses in the same places the shot handler refuses', () => {
    expect(keys).toMatch(/altKey \|\| e\.ctrlKey \|\| e\.metaKey/);
    expect(keys).toMatch(/INPUT\|TEXTAREA\|SELECT/);
    expect(keys).toContain("document.querySelector('#app > [inert]')");
    expect(keys).toContain('e.preventDefault()');
  });

  it('goes quiet when a caddy owns the line', () => {
    // A green-reading caddy renders the nudges disabled and WITHOUT the data attribute, so the
    // lookup misses and the arrows do nothing — the same silence the buttons have.
    expect(keys).toMatch(/if \(!btn\) return;/);
    const hud = readFileSync(resolve(root, 'src/app/playHud.ts'), 'utf8');
    const row = hud.slice(hud.indexOf('const nudge ='), hud.indexOf('return `<div class="gs-puttrow">'));
    expect(row).toMatch(/reads\s*\n?\s*\?\s*`<button class="gs-puttnudge" disabled/);
    expect(row, 'the disabled branch must not carry data-putt-aim').not.toMatch(/disabled[^`]*data-putt-aim/);
  });

  it('announces the binding to the players most likely to need it', () => {
    const hud = readFileSync(resolve(root, 'src/app/playHud.ts'), 'utf8');
    expect(hud).toMatch(/aria-keyshortcuts="\$\{dir < 0 \? 'ArrowLeft' : 'ArrowRight'\}"/);
  });
});

describe('the listener does not stack', () => {
  it('the previous render\'s listener is removed BEFORE any early return', () => {
    const fn = app.slice(app.indexOf('function wireShotGesture('), app.indexOf('function wireShotGesture(') + 700);
    const cleanupAt = fn.indexOf('playKeyCleanup?.()');
    const firstReturn = fn.indexOf('return;');
    expect(cleanupAt).toBeGreaterThan(-1);
    // The early returns are exactly the cases where the decision screen went away (a putt, a popup,
    // another screen) — a listener left bound there would keep nudging an off-screen aim.
    expect(cleanupAt).toBeLessThan(firstReturn);
  });

  it("the putt listener is torn down by render(), not by its own wiring block", () => {
    // The wiring block is skipped entirely on renders with no nudges in the DOM — which is most of
    // them — so a cleanup living inside it would never run on the render that leaves the green.
    const fn = app.slice(app.indexOf('function render(): void {'));
    const teardown = fn.indexOf('puttKeyCleanup?.()');
    const wiring = fn.indexOf("if (app.querySelector('[data-putt-aim]'))");
    expect(teardown).toBeGreaterThan(-1);
    expect(wiring).toBeGreaterThan(-1);
    expect(teardown, 'the teardown must run before the block that re-binds').toBeLessThan(wiring);
    expect(fn.slice(teardown, teardown + 120)).toContain('puttKeyCleanup = null');
  });
});

/**
 * The keyboard arrives ON the stroke (GS-a11y-stroke-focus).
 *
 * `render()` replaces `#app.innerHTML`, so after every shot focus fell back to `<body>` and the
 * keyboard player started again from the top of the page: Tab · Tab · Tab to 🏌 Swing on every shot,
 * five or six to reach ⛳ Putt on every putt, for eighteen holes. In a game that is entirely golf
 * strokes, the stroke has to be where the keyboard lands.
 *
 * Two halves: the DOM order stops putting the map furniture first, and the commit button is focused
 * as each decision mounts.
 */
describe('the stroke is the keyboard focus', () => {
  const frame = readFileSync(resolve(root, 'src/app/playFrame.ts'), 'utf8');
  const focus = readFileSync(resolve(root, 'src/app/focus.ts'), 'utf8');

  it('emits the nav column AFTER the controls, so 🗺 and ⚙ are not the first two tab stops', () => {
    const compose = frame.slice(frame.indexOf('export function playFrameHTML('));
    const nav = compose.indexOf('navColumnHTML(');
    const bottom = compose.indexOf('gs-hud-bottom');
    expect(nav).toBeGreaterThan(-1);
    expect(bottom).toBeGreaterThan(-1);
    expect(nav, 'the nav column is emitted before the play controls — it owns the tab order again')
      .toBeGreaterThan(bottom);
  });

  it('announces what the arrow keys do, from the state that owns them', () => {
    // The keys live on `window`, not on any control, and the aim cone is a picture — so without a
    // description they are invisible to exactly the players who need them.
    expect(frame).toContain('STROKE_KEYS_ID');
    expect(frame).toMatch(/commitHint: string/);
    // Both live commit buttons point at it; the disabled watch button has no keys to describe.
    const swing = app.slice(app.indexOf('const swingBtn ='), app.indexOf('const swingBtn =') + 400);
    expect(swing).toContain('aria-describedby="${STROKE_KEYS_ID}"');
    const putt = app.slice(app.indexOf('data-putt-commit="1"'), app.indexOf('data-putt-commit="1"') + 600);
    expect(putt).toContain('aria-describedby="${STROKE_KEYS_ID}"');
  });

  it('stands down for an overlay, a disabled commit, and a decision the player is already in', () => {
    const fn = focus.slice(focus.indexOf('export function focusPlayStroke('), focus.indexOf('/** Focus the sheet'));
    // A raised sheet owns the keyboard — applyOverlayFocus has just placed focus inside it.
    expect(fn).toContain('OVERLAY_SELECTOR');
    // Never onto a dead control: the watch states render the commit disabled, not absent.
    expect(fn).toContain(":not([disabled])");
    // Only on a NEW decision, or when a re-render knocked focus loose — never every render, which
    // would haul the player back from whatever control they deliberately tabbed to.
    expect(fn).toMatch(/if \(!isNew && !loose\) return;/);
    // A full-bleed fixed frame must not be scrolled to "reveal" a button already on screen.
    expect(fn).toContain('preventScroll: true');
  });

  it('runs after the overlay pass, and only for a live stroke decision', () => {
    const tail = app.slice(app.indexOf('  wireRoleButtonKeys(app);'));
    expect(tail.indexOf('applyOverlayFocus(app)')).toBeLessThan(tail.indexOf('focusPlayStroke('));
    const call = tail.slice(tail.indexOf('const strokePlay ='), tail.indexOf('focusPlayStroke(') + 260);
    for (const guard of ['animatingPlay', '.done']) {
      expect(call, `focusPlayStroke is not guarded on ${guard}`).toContain(guard);
    }
    // The key has to change per STROKE, or a hole's second shot re-uses the first's decision.
    expect(call).toMatch(/holeIndex.*shots\.length.*putts/s);
  });

  it('treats the shot card and the scramble choice as covering layers', () => {
    // They live inside <main>, so `applyOverlayFocus` (direct children of #app only) ignores them —
    // but focus must not land on a Swing button behind a card the player has to dismiss. The marker
    // is on the DOM, because the FLAG lies: `awaitingShotPopup` stays true through a putt render
    // that draws no popup, which is precisely how the putt shipped unfocused the first time.
    const overlays = readFileSync(resolve(root, 'src/app/overlays.ts'), 'utf8');
    const popup = overlays.slice(overlays.indexOf('export function shotPopupOverlay('));
    expect(popup).toContain('data-gs-overlay=');
    const scramble = overlays.slice(
      overlays.indexOf('export function scrambleChoiceOverlay('),
      overlays.indexOf('export function shotPopupOverlay('),
    );
    expect(scramble).toContain('data-gs-overlay=');
  });

  it('the pace meter is spoken but never tabbed', () => {
    const meter = readFileSync(resolve(root, 'src/render/puttMeter.ts'), 'utf8');
    // `role="button"` earned it a tab stop from wireRoleButtonKeys AND an Enter/Space binding that
    // synthesises a `click` — which this canvas does not listen for. A dead stop on every putt.
    expect(meter, 'the pace meter claims role=button again — that is a dead tab stop')
      .not.toMatch(/setAttribute\('role', 'button'\)/);
    expect(meter).toMatch(/setAttribute\('role', 'img'\)/);
    // Still announced, and the label has to say which control actually stops it.
    expect(meter).toMatch(/aria-label/);
    expect(meter).toMatch(/Putt button/);
  });
});

// --- real browser: arrows actually move the aim and the power ---------------------
const dist = resolve(root, 'dist/index.html');

const chromePath = findChromiumShared();

describe('arrow keys drive the shot (real browser)', () => {
  it.runIf(chromePath)(
    'ArrowDown lowers the power and ArrowLeft/Right swing the aim cone',
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
        // Title → Voyage → first golfer → first tee → tee off, onto the shot decision screen.
        await page.evaluate(() => document.querySelector<HTMLElement>('.gs-navtile')!.click());
        await page.waitForSelector('.gs-charcard');
        await page.evaluate(() => document.querySelector<HTMLElement>('.gs-charcard')!.click());
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('button')].find((b) => /First Tee/.test(b.textContent!))?.click(),
        );
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('button')].find((b) => /Tee Off/.test(b.textContent!))?.click(),
        );
        await page.waitForSelector('#gs-shot-overlay polygon');

        const power = () =>
          page.evaluate(() =>
            Number(document.querySelector('.gs-hud-controls')?.textContent?.match(/Power\s*(\d+)%/)?.[1] ?? -1),
          );
        const coneX = () =>
          page.evaluate(() =>
            parseFloat(document.querySelector('#gs-shot-overlay polygon')!.getAttribute('points')!.split(',')[0]!),
          );

        const p0 = await power();
        for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
        expect(await power(), 'ArrowDown did not lower the power').toBeLessThan(p0);

        const x0 = await coneX();
        await page.keyboard.press('ArrowRight');
        const x1 = await coneX();
        expect(x1, 'ArrowRight did not move the aim cone').not.toBeCloseTo(x0, 1);

        // …and one press must still be ONE step after further renders, or the per-render listener
        // is stacking and a single key press steps the aim N times.
        // Force a handful of full re-renders WITHOUT touching the aim or the power: the whole-hole /
        // follow-cam toggle, clicked in pairs so the camera ends where it started. (It used to be the
        // club cycler, which GS-hud-bag moved into the bag's picker sheet — and a sheet inerts the
        // page, which is exactly the state the key handler declines to act in.)
        await page.evaluate(async () => {
          for (let i = 0; i < 6; i++) {
            document.querySelector<HTMLElement>('[data-mapview="toggle"]')!.click();
            await new Promise((r) => setTimeout(r, 30));
          }
        });
        const a = await coneX();
        await page.keyboard.press('ArrowRight');
        const b = await coneX();
        const stepAfter = Math.abs(b - a);
        const stepBefore = Math.abs(x1 - x0);
        expect(stepAfter).toBeGreaterThan(0);
        expect(stepAfter, `one press moved ${stepAfter}px after renders vs ${stepBefore}px before — listener stacking`)
          .toBeLessThan(stepBefore * 3);
      } finally {
        await browser.close();
      }
    },
    120_000,
  );
});

describe('the stroke owns the keyboard (real browser)', () => {
  it.runIf(chromePath)(
    'focus lands on Swing at the tee and on Putt on the green, and the meter is not a tab stop',
    async () => {
      const { chromium } = await import('playwright-core');
      const browser = await chromium.launch({ executablePath: chromePath!, args: ['--no-sandbox'] });
      try {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        // Pinned seed: the walk below has to reach a GREEN, and an unpinned run is a different hole
        // every time. `kb1` tees off and is putting after two swings.
        await page.goto('file://' + dist + '?intro=0&seed=kb1', { waitUntil: 'load' });
        await page.waitForFunction(
          () => document.getElementById('app')?.getAttribute('data-booted') === '1',
          { timeout: 8000 },
        );
        await page.evaluate(() => document.querySelector<HTMLElement>('.gs-navtile')!.click());
        await page.waitForSelector('.gs-charcard');
        await page.evaluate(() => document.querySelector<HTMLElement>('.gs-charcard')!.click());
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('button')].find((b) => /First Tee/.test(b.textContent!))?.click(),
        );
        await page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>('button')].find((b) => /Tee Off/.test(b.textContent!))?.click(),
        );
        await page.waitForSelector('#gs-shot-overlay polygon');

        // The whole point: no tabbing at all. The decision mounts with the stroke already focused.
        expect(
          await page.evaluate(() => document.activeElement?.getAttribute('data-swing')),
          'the shot decision did not put focus on the Swing button',
        ).toBe('1');
        // …and a re-render that is NOT a new stroke leaves focus where the player put it. (Focus
        // first, then click: a scripted `.click()` does not focus, where a real mouse press does.)
        await page.evaluate(() => {
          const b = document.querySelector<HTMLElement>('[data-aimmode="1"]')!;
          b.focus();
          b.click();
        });
        await page.waitForTimeout(60);
        expect(
          await page.evaluate(() => document.activeElement?.getAttribute('data-aimmode')),
          'a same-stroke re-render dropped focus instead of restoring the control that was clicked',
        ).toBe('1');

        // Swing down to the green. Bounded, and it bails the moment the play screen goes away, so a
        // walkthrough that breaks fails loudly in seconds instead of grinding out the test timeout.
        const mode = () => page.evaluate(() => document.querySelector<HTMLElement>('.gs-shot')?.dataset.playmode ?? null);
        for (let i = 0; i < 8; i++) {
          const m = await mode();
          if (m === 'putt' || m === null) break;
          await page.evaluate(() => document.querySelector<HTMLElement>('[data-swing]')?.click());
          await page
            .waitForFunction(
              () =>
                !document.querySelector('.gs-shot') ||
                !!document.querySelector('.gs-shot[data-playmode="putt"]') ||
                (!!document.querySelector('[data-swing]') && !document.querySelector('.gs-shot[data-playmode="watch"]')),
              { timeout: 12_000 },
            )
            .catch(() => {});
          await page.waitForTimeout(700);
          await page.evaluate(() => document.querySelector<HTMLElement>('[data-popup-continue]')?.click());
          await page.waitForTimeout(300);
        }
        expect(await mode(), 'never reached a putt — the walkthrough is broken, not the focus rule').toBe('putt');

        const green = await page.evaluate(() => {
          const sel = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
          const order = [...document.querySelectorAll<HTMLElement>(sel)].filter(
            (e) => !e.hasAttribute('disabled') && e.offsetParent !== null && !e.closest('[inert]'),
          );
          const canvas = document.querySelector<HTMLElement>('#puttmeter canvas');
          return {
            focused: document.activeElement?.getAttribute('data-putt-commit'),
            meterRole: canvas?.getAttribute('role') ?? null,
            meterTabbable: !!canvas && order.includes(canvas),
            meterLabelled: !!canvas?.getAttribute('aria-label'),
            described: document.activeElement?.getAttribute('aria-describedby'),
            hint: document.getElementById('gs-stroke-keys')?.textContent ?? '',
          };
        });
        expect(green.focused, 'the putt decision did not put focus on the Putt button').toBe('1');
        expect(green.meterRole).toBe('img');
        expect(green.meterTabbable, 'the pace meter is still a tab stop it cannot honour').toBe(false);
        expect(green.meterLabelled, 'the pace meter is silent as well as unreachable').toBe(true);
        expect(green.described).toBe('gs-stroke-keys');
        expect(green.hint).toMatch(/arrow keys/i);

        // Enter on the focused control must actually play the stroke — the whole chain is pointless
        // if the button the keyboard lands on cannot be fired from the keyboard.
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);
        expect(await mode(), 'Enter on the focused Putt button did not strike the putt').not.toBe('putt');
      } finally {
        await browser.close();
      }
    },
    180_000,
  );
});
