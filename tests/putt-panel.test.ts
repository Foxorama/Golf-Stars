/**
 * The PUTT panel's chrome (GS-putt-panel).
 *
 * GS-hud-bag and GS-hud-compass rebuilt the shot screen and the top bar, and left the putt panel
 * wearing the chrome of the screen they replaced — the club cycler's `.gs-clubrow` slabs around a
 * sentence, and three lines of prose re-teaching the controls on every putt. This suite guards the
 * repaint, and the two rules that make it safe:
 *
 *  - it is a REPAINT, not a balance change. The pace meter's sweep period, its pace mapping and the
 *    make band are excluded from feel passes by CLAUDE.md's contract 4 — a wider band or a slower
 *    sweep has to go through the death-spiral harness, not ship under a styling banner.
 *  - every class the panel emits has a rule, in the play screen's own namespace (the #353
 *    `.gs-hud` map-blur regression was one screen reusing another's class name).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { puttAimLabel, puttAimRow, puttBreakLine } from '../src/app/playHud';
import { setState } from '../src/app/ctx';
import type { UiState } from '../src/ui/gameState';

const root = resolve(__dirname, '..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');
const html = read('index.html');
const css = html
  .slice(html.indexOf('<style>'), html.indexOf('</style>'))
  .replace(/\/\*[\s\S]*?\*\//g, '');
/** Source with `//` line comments and `/* … *\/` blocks blanked out — these files are heavily
 *  commented, and a comment QUOTING the prose row this pass deleted must not read as the row. */
const decomment = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const APP = decomment(read('src/app.ts'));
const METER_RAW = read('src/render/puttMeter.ts');
const METER = decomment(METER_RAW);

describe('the putt panel wears the play frame’s own chrome', () => {
  it('prints the aim as an instrument POD, not a sentence', () => {
    // The cluster's one shape for every number: a value element and a caption element, never an
    // inline "Aim straight" label (GS-hud-compass).
    expect(puttAimLabel(0, 0)).toBe('<b>Straight</b><span>your aim</span>');
    expect(puttAimLabel(2, -1.4)).toContain('<b>1.4yd left</b>');
    expect(puttAimLabel(2, -1.4)).not.toMatch(/Aim <b>/);
  });

  it('keeps the surgical refresh contract: one span, one id, replaced in place', () => {
    // An aim nudge swaps ONLY this span (app.ts puttAimRefresh) — a full render() would remount the
    // pace meter and reset its sweep mid-putt.
    const row = puttAimRow(2, 0.6, false);
    expect(row.match(/id="puttaimlabel"/g)).toHaveLength(1);
    expect(row).toContain(`<span class="gs-puttread" id="puttaimlabel">${puttAimLabel(2, 0.6)}</span>`);
    expect(APP).toContain('label.innerHTML = puttAimLabel(');
  });

  it('keeps both nudges mounted — disabled for a caddy read, never removed', () => {
    const manual = puttAimRow(2, 0.6, false);
    expect(manual).toContain('data-putt-aim="-1"');
    expect(manual).toContain('data-putt-aim="1"');
    // The caddy branch asks the live loadout who read the line, so it needs a state to ask.
    setState({ run: { loadout: { perks: ['mystic-mole'] } } } as unknown as UiState);
    const read2 = puttAimRow(2, 0.6, true);
    // GS-hud-frame: nothing is removed, only disabled — the row must not change shape when a
    // green-reading caddy owns the line.
    expect(read2.match(/gs-puttnudge/g)).toHaveLength(2);
    expect(read2).toContain('disabled');
    expect(read2).not.toContain('data-putt-aim');
    // …and it still says who found it (GS-story-caddy-read).
    expect(read2).toContain('Mole reads');
  });

  it('every nudge that can act carries an accessible name', () => {
    // The glyphs are ◄/►, which is nothing to a screen reader (GS-a11y-announce).
    for (const m of puttAimRow(2, 0.6, false, false, true).match(/<button[^>]*data-putt-[^>]*>/g) ?? []) {
      expect(m, `unnamed control: ${m}`).toContain('aria-label=');
    }
  });

  it('the panel states the READ and stops re-teaching the controls', () => {
    // The instruction moved onto the meter ("TAP TO STOP"), where the tap happens.
    const rows = APP.slice(APP.indexOf('mode: \'putt\''), APP.indexOf('mode: \'putt\'') + 3000);
    expect(rows).not.toContain('tap the meter in the green');
    expect(rows).toContain('gs-puttnote');
    expect(METER_RAW).toContain('TAP TO STOP');
    // The break is the thing the map draws but does not number — it stays.
    expect(puttBreakLine(-1.9)).toContain('breaks 1.9yd left');
    expect(rows).toContain('puttBreakLine(');
  });

  it('every class the panel emits has a rule, in the play screen’s namespace', () => {
    for (const cls of ['gs-puttrow', 'gs-puttnudge', 'gs-puttread', 'gs-puttmeter', 'gs-puttnote']) {
      expect(css, `${cls} has no rule`).toContain(`.${cls}`);
    }
    // The club cycler's chrome went with the club cycler (GS-hud-bag) — no orphan rules, no
    // orphan emitters.
    for (const dead of ['.gs-clubrow', '.gs-clubname', '.gs-legend-line']) {
      expect(css, `${dead} is a rule nothing emits any more`).not.toContain(dead);
    }
    const src = ['src/app/playHud.ts', 'src/app.ts', 'src/app/playFrame.ts'].map(read).join('\n');
    expect(src).not.toMatch(/class="[^"]*gs-clubrow/);
  });

  it('the nudge clears a 44px touch target before the UI scale lifts it', () => {
    const rule = css.slice(css.indexOf('.gs-puttnudge {'), css.indexOf('.gs-puttnudge:hover'));
    expect(rule).toMatch(/min-height:\s*44px/);
  });
});

describe('the repaint changed no putting BALANCE', () => {
  it('the meter still reads its band, sweep and pace scale from the sim', () => {
    // A styling pass may not quietly widen the make band or slow the sweep — those are contract-4
    // balance levers and belong to the death-spiral harness.
    expect(METER).toContain("import { MANUAL_IDEAL_PACE, MANUAL_PACE_MAX } from '../sim/round'");
    expect(METER).toContain('const period = opts.periodMs ?? 1250;');
    expect(METER).toMatch(/padX \+ \(p \/ MANUAL_PACE_MAX\) \* barW/);
    // The band is the caller's, unscaled — app.ts derives it from the putter skill + distance.
    expect(METER).toContain('MANUAL_IDEAL_PACE - opts.band');
    expect(METER).toContain('MANUAL_IDEAL_PACE + opts.band');
    expect(METER).not.toMatch(/opts\.band\s*\*/);
  });

  it('the captured pace is still read live and frozen after', () => {
    expect(METER).toContain('frozenPace = currentPace(performance.now());');
    expect(METER).toContain('opts.onCommit(frozenPace);');
  });
});

describe('the meter is reachable by the reader settings', () => {
  it('takes its type from --gs-font instead of naming a family', () => {
    // A canvas is invisible to the stylesheet, so the Readable-text toggle can only reach these
    // labels if the meter resolves the token itself (GS-a11y-readable-text).
    expect(METER).toContain("token(container, '--gs-font'");
    expect(METER).toMatch(/ctx\.font = `700 \$\{size\}px \$\{font\}`/);
    // The only literal stack in the file is the fallback for a document with no CSSOM.
    expect(METER.match(/system-ui/g) ?? []).toHaveLength(1);
  });

  it('takes its palette from the app’s tokens', () => {
    for (const tok of ['--gs-accent', '--gs-ink', '--gs-dim']) expect(METER).toContain(tok);
  });

  it('names itself for a screen reader — it is not decoration', () => {
    // …but it is not a CONTROL either (GS-a11y-stroke-focus). It claimed `role="button"`, which
    // earned it a tab stop and an Enter/Space binding from `wireRoleButtonKeys` that synthesises a
    // `click` — an event this canvas never listens for. ⛳ Putt is the control that stops the sweep;
    // the meter is the picture of it, so it is `role="img"`: announced, never tabbed.
    expect(METER).toContain("canvas.setAttribute('role', 'img')");
    expect(METER).toContain('aria-label');
  });
});
