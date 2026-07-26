import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { UI_SCALES, clampUiScale } from '../src/settings';

/**
 * Accessibility guards (GS-a11y-readable-text).
 *
 * The pure-sim suite is blind to CSS, and this feature is almost entirely CSS — so these assert on
 * the STYLESHEET TEXT plus the pure settings helpers. They exist to stop three specific regressions
 * that each shipped, or nearly shipped, before:
 *   1. a `font-family` that is not the token (the settings sheet rendered in Times New Roman for
 *      months because the stack lived on `.gs-main` and overlays are siblings of `<main>`),
 *   2. a raw `100vh`/`100dvh` sneaking back into a viewport-locked screen, which under root zoom
 *      hangs the play screen's commit row off the bottom of the phone,
 *   3. a canvas sizing its backing store off `devicePixelRatio` alone, which renders the play view
 *      soft on exactly the setting meant to make it legible.
 */

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
/** The stylesheet with `/* … *\/` comments blanked out — these rules are heavily commented, and a
 *  prose mention of `100dvh` explaining WHY it is banned must not read as a use of it. */
const css = html
  .slice(html.indexOf('<style>'), html.indexOf('</style>'))
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('reader type tokens', () => {
  it('declares the four reader tokens on :root', () => {
    for (const tok of ['--gs-font:', '--gs-uiscale:', '--gs-track:', '--gs-wordspace:']) {
      expect(css).toContain(tok);
    }
  });

  it('puts the family on <body>, not only .gs-main — overlays render OUTSIDE <main>', () => {
    // The body rule must carry the family, or every sheet/notice falls back to the UA serif.
    const bodyRule = css.slice(css.indexOf('\n      body {'), css.indexOf('\n      .gs-main {'));
    expect(bodyRule).toContain('font-family: var(--gs-font)');
    expect(bodyRule).toContain('letter-spacing: var(--gs-track)');
    expect(bodyRule).toContain('word-spacing: var(--gs-wordspace)');
  });

  it('never hard-codes a font family — every stack goes through --gs-font', () => {
    // A font stack is only allowed inside a `--gs-font` definition (the default and the readable
    // override, whose own fallback tail ends in system-ui). A stack anywhere else is one the
    // "Readable text" toggle cannot reach — which is exactly how the settings sheet ended up
    // rendering in Times New Roman. `font:` shorthands must name the token, never a family.
    const stackLines = css.split('\n').filter((l) => /system-ui|Segoe UI|Roboto|sans-serif/.test(l));
    const strays = stackLines.filter((l) => !/--gs-font:/.test(l) && !/^\s{19,}/.test(l));
    expect(strays, `font stacks outside --gs-font:\n${strays.join('\n')}`).toHaveLength(0);
    expect(css).toContain('--gs-font: system-ui');
    // And every `font:` shorthand resolves the family from the token.
    // `(?<![-\w])` so this matches the `font:` SHORTHAND and not the tail of `--gs-font:`.
    for (const m of css.match(/(?<![-\w])font:\s*[^;]+;/g) ?? []) {
      if (/\binherit\b/.test(m)) continue; // inherits the token from an ancestor — fine
      expect(m, `font shorthand without the token: ${m}`).toContain('var(--gs-font)');
    }
  });

  it('applies the root zoom and corrects every viewport-locked height for it', () => {
    expect(css).toMatch(/html\s*{[^}]*zoom:\s*var\(--gs-uiscale\)/);
    expect(css).toContain('--gs-vh: calc(100vh / var(--gs-uiscale))');
    expect(css).toContain('--gs-dvh: calc(100dvh / var(--gs-uiscale))');
    // …and no rule may use a raw viewport height any more: an uncorrected `100dvh` box inside a
    // zoomed root measures one screen of ZOOMED units and overhangs the display.
    const afterTokens = css.slice(css.indexOf('* { box-sizing'));
    expect(afterTokens).not.toMatch(/[^-]\b100dvh\b/);
    expect(afterTokens).not.toMatch(/[^-]\b100vh\b/);
  });

  it('ships NO font file and NO @font-face — the readable mode is spacing + system faces', () => {
    // A bundled webfont would be a third-party binary asset in a build that inlines everything
    // into one index.html; the letterform evidence does not justify it. See
    // docs/decisions/accessibility.md.
    expect(html).not.toContain('@font-face');
    expect(html).not.toMatch(/\.(woff2?|ttf|otf)\b/);
  });

  it('the readable mode buys the levers with evidence behind them', () => {
    const rule = css.slice(css.indexOf('.gs-readable {'), css.indexOf('.gs-readable {') + 900);
    // Spacing is the mechanism (Zorzi 2012 / Galliussi 2020), not the typeface.
    const track = /--gs-track:\s*\.?(\d*\.?\d+)em/.exec(rule);
    const word = /--gs-wordspace:\s*\.?(\d*\.?\d+)em/.exec(rule);
    expect(track).toBeTruthy();
    expect(word).toBeTruthy();
    const t = parseFloat(`0.${track![1]!.replace('0.', '')}`);
    const w = parseFloat(`0.${word![1]!.replace('0.', '')}`);
    expect(t).toBeGreaterThan(0);
    // The BDA asks word spacing to be at least ~3.5x the letter spacing.
    expect(w / t).toBeGreaterThanOrEqual(3);
    // Italics are the one letterform finding that replicates — and it is negative.
    expect(css).toMatch(/\.gs-readable (i|em)[^{]*{[^}]*font-style:\s*normal/);
    // Justified text is a documented barrier (WCAG 1.4.8).
    expect(css).toContain('text-align: left !important');
  });
});

describe('UI scale ladder', () => {
  it('starts at 1 so the default UI is untouched', () => {
    expect(UI_SCALES[0]).toBe(1);
    expect(clampUiScale(1)).toBe(1);
  });

  it('snaps any stored value onto the ladder, and survives garbage', () => {
    expect(UI_SCALES).toContain(clampUiScale(1.2));
    expect(clampUiScale(NaN)).toBe(1);
    expect(clampUiScale(Number.POSITIVE_INFINITY)).toBe(1);
    // A hand-edited blob can never strand the player at an unusable size.
    expect(clampUiScale(99)).toBe(Math.max(...UI_SCALES));
    expect(clampUiScale(-5)).toBe(1);
  });

  it('every rung is a real step up and the top rung lifts a 31px control past 44px', () => {
    for (let i = 1; i < UI_SCALES.length; i++) {
      expect(UI_SCALES[i]!).toBeGreaterThan(UI_SCALES[i - 1]!);
    }
    // The smallest play-screen control measured 31px; the top rung is what makes the whole
    // control set clear the 44px touch-target guidance.
    expect(31 * Math.max(...UI_SCALES)).toBeGreaterThanOrEqual(44);
  });
});

describe('canvas backing store', () => {
  it('no animated surface computes its own devicePixelRatio any more', () => {
    // Ten canvases each had `Math.min(2, window.devicePixelRatio || 1)`; under root zoom that
    // under-sizes the backing store and the play view renders soft. They all go through
    // canvasRatio(), which folds the zoom in.
    const files = [
      'src/app/playFx.ts', 'src/render/celebrations.ts', 'src/render/introView.ts',
      'src/render/playView.ts', 'src/render/puttMeter.ts', 'src/render/sigilCeremony.ts',
      'src/render/storyBattle.ts', 'src/render/storyEnding.ts', 'src/render/storyIntro.ts',
    ];
    for (const f of files) {
      const src = readFileSync(resolve(__dirname, '..', f), 'utf8');
      expect(src, `${f} still computes a bare devicePixelRatio`).not.toMatch(/Math\.min\(2,\s*window\.devicePixelRatio/);
      expect(src, `${f} does not use canvasRatio()`).toContain('canvasRatio()');
    }
  });
});
