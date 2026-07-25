/**
 * Safe-area handling on the full-bleed play screen (GS-play-safearea).
 *
 * The bug this guards: `.gs-shot--full .gs-bigmap` is `inset: 0` — it deliberately covers the whole
 * viewport, system UI included — so anything positioned against its edges is painted UNDER the status
 * bar. On a Pixel 9a that made the map/zoom/settings column physically untappable (the OS takes the
 * touches) and dropped the flight label on top of the clock.
 *
 * Two halves, two mechanisms, both easy to regress:
 *   - the DOM column is fixed in CSS with `env(safe-area-inset-*)`, SCOPED to `--full`;
 *   - the canvas label can't use CSS at all (a canvas is one opaque box to CSS) so it measures.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeAreaInsets, resetSafeAreaCache } from '../src/render/safeArea';

const INDEX = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

describe('safeAreaInsets() — node purity', () => {
  it('returns zeros without a DOM instead of throwing', () => {
    // The render layer must import clean in node (same rule the audio modules follow). A draw loop
    // calling this on a headless run should degrade to "no notch", never explode.
    resetSafeAreaCache();
    expect(safeAreaInsets()).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('is stable across repeated calls (it is read once per animation frame)', () => {
    resetSafeAreaCache();
    const a = safeAreaInsets();
    const b = safeAreaInsets();
    expect(b).toEqual(a);
  });
});

describe('the full-bleed play screen reserves the system UI', () => {
  it('insets the map/zoom/settings column, which is what made it untappable', () => {
    const rule = INDEX.match(/\.gs-shot--full \.gs-mapctrl \{[^}]*\}/);
    expect(rule, '.gs-shot--full .gs-mapctrl rule is missing').toBeTruthy();
    expect(rule![0]).toMatch(/top:\s*calc\(8px \+ env\(safe-area-inset-top\)\)/);
    expect(rule![0]).toMatch(/right:\s*calc\(8px \+ env\(safe-area-inset-right\)\)/);
  });

  it('scopes that inset to --full so the non-full-bleed map does NOT double-count', () => {
    // Outside full-bleed the map sits inside `.gs-main`, which already pads by the same insets.
    // An unscoped `.gs-mapctrl { top: calc(8px + env(...)) }` would add them twice and shove the
    // column down into the map. Assert the base rule stays inset-free.
    const base = INDEX.match(/\n\s*\.gs-mapctrl \{[^}]*\}/);
    expect(base, 'base .gs-mapctrl rule is missing').toBeTruthy();
    expect(base![0]).not.toMatch(/safe-area-inset/);
  });

  it('keeps .gs-hud-top inset too (the sibling that was already correct)', () => {
    const rule = INDEX.match(/\.gs-hud-top \{[^}]*\}/);
    expect(rule).toBeTruthy();
    expect(rule![0]).toMatch(/env\(safe-area-inset-top\)/);
  });
});

describe('the canvas flight label clears the status bar', () => {
  const SRC = readFileSync(join(__dirname, '..', 'src', 'render', 'playView.ts'), 'utf8');

  it('offsets drawHUD by the measured inset rather than a hardcoded corner', () => {
    const fn = SRC.match(/function drawHUD\(text: string\): void \{[\s\S]*?\n  \}/);
    expect(fn, 'drawHUD not found').toBeTruthy();
    const body = fn![0];
    // It must consult the measurement...
    expect(body).toMatch(/safeAreaInsets\(\)/);
    // ...and must not go back to painting at the raw canvas corner.
    expect(body).not.toMatch(/fillRect\(8,\s*8,/);
    expect(body).not.toMatch(/fillText\(text,\s*16,\s*24\)/);
  });
});
