import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { globSync } from 'node:fs';

/**
 * Reduced-motion guards (GS-a11y-motion).
 *
 * The in-app "Reduced motion" toggle and the OS `prefers-reduced-motion` query are two different
 * questions, and the app was asking the wrong one in two ways at once: four full-screen cinematic
 * gates consulted the OS directly (so a player who ticked the box but had no OS preference still got
 * every cinematic), and the ~19 CSS media-query blocks could only ever see the OS. On top of that the
 * single most nauseogenic thing on the screen — the landing camera shake — had no gate at all.
 */

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');

describe('one source of truth for reduced motion', () => {
  it('only settings.ts may ask the OS directly — everything else asks the SETTING', () => {
    // The setting is SEEDED from the media query and is the player's own from then on, so it is
    // strictly more informed. A gate that re-consults the OS ignores a player who turned the toggle
    // ON (the bug), and one that only consults the OS ignores a player who turned it OFF.
    const files = globSync('src/**/*.ts', { cwd: root });
    const offenders: string[] = [];
    for (const f of files) {
      if (f.replace(/\\/g, '/').endsWith('src/settings.ts')) continue;
      const src = readFileSync(resolve(root, f), 'utf8');
      if (/matchMedia[^\n]*prefers-reduced-motion/.test(src)) offenders.push(f);
    }
    expect(offenders, `these read the OS instead of the setting:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('settings.ts exports the single reducedMotion() answer', () => {
    const src = readFileSync(resolve(root, 'src/settings.ts'), 'utf8');
    expect(src).toMatch(/export function reducedMotion\(\)/);
    // …and it must read the setting, not re-query the OS.
    const body = src.slice(src.indexOf('export function reducedMotion()'));
    expect(body.slice(0, 160)).toContain('getSettings().reducedMotion');
  });
});

describe('the setting reaches the stylesheet', () => {
  it('applyReaderSettings stamps .gs-reduced on the root', () => {
    const src = readFileSync(resolve(root, 'src/settings.ts'), 'utf8');
    expect(src).toContain("classList.toggle('gs-reduced'");
  });

  it('.gs-reduced collapses animation AND transition durations', () => {
    const i = css.indexOf('.gs-reduced *');
    expect(i, '.gs-reduced rule is missing').toBeGreaterThan(-1);
    const rule = css.slice(i, css.indexOf('}', i));
    expect(rule).toMatch(/animation-duration:\s*\.001ms\s*!important/);
    expect(rule).toMatch(/transition-duration:\s*\.001ms\s*!important/);
    expect(rule).toMatch(/animation-iteration-count:\s*1\s*!important/);
    // Duration, NOT `animation: none` — several entrance animations start at opacity 0 and would
    // never reach their end state if the animation were removed outright.
    expect(rule).not.toMatch(/animation:\s*none/);
  });

  it('covers pseudo-elements too — a lot of this app animates ::before/::after', () => {
    const i = css.indexOf('.gs-reduced *');
    const selector = css.slice(i, css.indexOf('{', i));
    expect(selector).toContain('::before');
    expect(selector).toContain('::after');
  });
});

describe('camera shake', () => {
  it('is amplitude-gated on the setting, not branched around', () => {
    const src = readFileSync(resolve(root, 'src/render/playView.ts'), 'utf8');
    // Gating the AMPLITUDE (not skipping the block) keeps the decay running, so every
    // `shake = Math.max(…)` call site downstream behaves identically — no second code path.
    expect(src).toMatch(/const shakeAmp = reducedMotion\(\) \? 0 : F\.shakeAmp/);
    expect(src).toMatch(/const amp = shakeAmp \* shake/);
    // The decay must still happen even when the amplitude is zero.
    const block = src.slice(src.indexOf('if (shake > 0) {'));
    expect(block.slice(0, 260)).toContain('shake = Math.max(0, shake - 0.06)');
  });
});
