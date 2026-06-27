import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * TEST-HUB SYNC GUARD — invariant #3 of standards/TEST-HUB-STANDARD.md, activated for Golf Stars.
 *
 * The hub (src/test/hub.ts → test.html) drives the real game through public hooks. That keeps it
 * thin but lets it rot silently: add or rename a hook in the app and the hub just doesn't expose
 * it — no error — until someone notices in a live demo. This guard fails loudly the moment the two
 * drift, naming exactly what to update.
 *
 * It is AUTO-DISCOVERING, not a hardcoded list: it scans the real app source for the two hook
 * dimensions and asserts the hub covers EXACTLY that set, both directions. So a brand-new feel
 * flag or URL param reds the build until the hub drives it — no manual hook list to keep in step.
 *   • live escape-hatch flags — `window._gsX` (single-underscore; the `__gs*` boot-watchdog
 *     internals are excluded). Added often per the escape-hatch rule, so this is the main guard.
 *   • declarative URL params — `new URLSearchParams(location.search).get('x')`.
 * Plus: the hub must IMPORT the sim's content tables (clubs/perks/meta/lies/formats) rather than
 * copy them, so those lists can't fork — new content appears in the hub automatically (I1/I3a).
 *
 * The portable, fill-in-the-blanks version lives at standards/test-hub-guard.template.mjs.
 */

const root = resolve(__dirname, '..');
const read = (rel: string): string => readFileSync(resolve(root, rel), 'utf8');

/** All app-source .ts files (everything under src/ EXCEPT the hub's own src/test/). */
function appTsFiles(dir = 'src'): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    const rel = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (rel === join('src', 'test')) continue; // the hub is not "the app"
      out.push(...appTsFiles(rel));
    } else if (ent.name.endsWith('.ts')) {
      out.push(rel);
    }
  }
  return out;
}
const APP_SRC = appTsFiles().map(read).join('\n');
const HUB_SRC = read('src/test/hub.ts');

const uniq = (xs: string[]): string[] => [...new Set(xs)].sort();
const matchAll = (src: string, re: RegExp): string[] => [...src.matchAll(re)].map((m) => m[1] ?? m[0]);

// ── hook discovery ───────────────────────────────────────────────────────────────────────────
// Live flags: `_gsX` NOT preceded by a word char (so `__gsErr`/`__gsStage` watchdog internals,
// whose `_gs` is preceded by `_`, are excluded). Whole token kept so app↔hub compare exactly.
const FLAG_RE = /(?<![\w$])_gs[A-Z][A-Za-z0-9]*/g;
// URL params: the app reads them as `new URLSearchParams(location.search).get('name')`.
const PARAM_RE = /URLSearchParams\(location\.search\)\.get\('([a-z]+)'\)/g;

const appFlags = uniq(matchAll(APP_SRC, FLAG_RE));
const hubFlags = uniq(matchAll(HUB_SRC, FLAG_RE));
const appParams = uniq(matchAll(APP_SRC, PARAM_RE));
// The hub composes the param URL with `p.set('name', …)`; that's where it drives each param.
const hubParams = uniq(matchAll(HUB_SRC, /\bset\('([a-z]+)'/g));

// Sim tables the hub MUST import (not copy) so its control lists share one source of truth (I3a).
const IMPORTED_TABLES = ['CLUBS', 'SHOP_ITEMS', 'META_UPGRADES', 'FORMATS', 'LIE_INFO', 'CHARACTERS'];

describe('test hub ↔ app hook parity (standards/TEST-HUB-STANDARD.md I3 — auto-discovered)', () => {
  it('found the known hooks (discovery regexes still match the app)', () => {
    // A canary: if a refactor changes how hooks are written, discovery would silently find none
    // and every parity check below would vacuously pass. Assert the known baseline is seen.
    expect(appFlags).toEqual(expect.arrayContaining(['_gsFeel', '_gsIntro', '_gsSpray']));
    expect(appParams).toEqual(expect.arrayContaining(['intro', 'seed']));
  });

  it('hub drives every live `window._gs*` flag the app exposes (and no dead ones)', () => {
    expect(hubFlags, `app feel-flags ${JSON.stringify(appFlags)} vs hub ${JSON.stringify(hubFlags)} — ` +
      `add a hub control for any new flag, or remove a dead one; they must match exactly`).toEqual(appFlags);
  });

  it('hub drives every declarative URL param the app reads (and no dead ones)', () => {
    expect(hubParams, `app URL params ${JSON.stringify(appParams)} vs hub ${JSON.stringify(hubParams)} — ` +
      `add a hub control (p.set('…')) for any new param, or remove a dead one`).toEqual(appParams);
  });

  it('hub derives its control lists from the sim tables (no re-implemented copy)', () => {
    for (const table of IMPORTED_TABLES) {
      expect(
        HUB_SRC.includes(table),
        `src/test/hub.ts no longer references ${table} — its option list may have drifted to a hardcoded copy (invariant I1/I3a)`,
      ).toBe(true);
    }
  });
});
