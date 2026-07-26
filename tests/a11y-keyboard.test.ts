import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
});

// --- real browser: arrows actually move the aim and the power ---------------------
const dist = resolve(root, 'dist/index.html');
beforeAll(() => {
  execSync('npx vite build', { cwd: root, stdio: 'ignore' });
}, 180_000);

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
        await page.evaluate(() => {
          const btns = [...document.querySelectorAll<HTMLElement>('[data-cycle]')];
          for (let i = 0; i < 3; i++) btns.forEach((b) => b.click());
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
