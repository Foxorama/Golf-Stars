// ─────────────────────────────────────────────────────────────────────────────
// TEST-HUB SYNC GUARD — Golf Stars adaptation (invariant #3 of TEST-HUB-STANDARD.md)
// ─────────────────────────────────────────────────────────────────────────────
//
// STATUS: TEMPLATE. Golf Stars does NOT have a test/demo hub yet (see IDEAS.md → "GS-15 —
// Test hub + sync-guard"). This file is the ready-to-wire guard for the day it gets one. It
// is deliberately named `*.template.mjs`, NOT `*.test.ts`, so vitest's `tests/**/*.test.ts`
// include pattern (vite.config.ts) never collects it — a guard that points at a hub that
// doesn't exist yet must not red the build. To ACTIVATE it once the hub lands:
//   1. Build the hub (a same-origin page that iframes the real `dist/index.html` and drives
//      it through the public hooks listed in HOOKS below).
//   2. Move this file to `tests/test-hub.test.ts` and swap the `export const tests` block at
//      the bottom for vitest's `describe/it` (this repo's runner — see any tests/*.test.ts).
//   3. Point `readHub()` at the hub file and fill each HOOK's `hub` token.
//   4. Tick I3/I3a in standards/TEST-HUB-STANDARD.md.
//
// Golf Stars is a BUILD/MODULE project (Vite + TypeScript), so the standard's stronger source
// of truth is available: instead of text-matching `src/app.ts`, you CAN `import` the app's hook
// surface and assert the hub against the imported object. Today the hooks are small and scattered
// (a `?seed=` parser and a `?intro=` parser in app.ts; three `window._gs*` feel flags across the
// render layer) rather than one registry, so this template keeps golf-finder's zero-dependency
// TEXT-MATCH style on the APP side — it parses the real source files as strings. If/when the hooks
// are centralised into a single exported registry (recommended), replace `readSrc()`/the `app`
// tokens with an import of that registry and assert against its keys — strictly more robust. The
// assertions (parity in BOTH directions) stay identical; only the source-of-truth extraction changes.
//
// What it proves (and why it's the S+/A divider): the hub never re-implements app logic, it only
// POKES the app through public hooks. That keeps the hub thin but lets it rot silently — rename a
// hook in the app and the hub button just does nothing, no error. This guard fails loudly the moment
// the two drift, naming exactly what to update. See standards/TEST-HUB-STANDARD.md.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ── tiny inline assert (drop these two lines and use vitest's expect once activated) ─────────
const ok      = (c, m) => { if (!c) throw new Error(m || 'expected truthy'); };
const deepEq  = (a, b, m) => { const A = JSON.stringify(a), B = JSON.stringify(b);
                               if (A !== B) throw new Error(`${m ? m + ': ' : ''}expected ${B}, got ${A}`); };

// ── #1: where the files live ─────────────────────────────────────────────────────────────────
// standards/ sits at the repo root, so `..` is the project root. The app hooks are NOT in one
// file, so read whichever source defines each one (see the `src` field on each HOOK row).
const ROOT     = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSrc  = (rel) => readFileSync(join(ROOT, rel), 'utf8');     // the shipped app source
const readHub  = () => readFileSync(join(ROOT, 'test.html'), 'utf8'); // FILL when the hub exists

// ── #2: the hook contract — what the hub drives and the app must still honour ─────────────────
// Each row: a label, the source FILE that defines the hook, the token the APP must still contain
// (its parser/definition), and the token the HUB must contain (where it emits/drives that hook).
// Both sides are guarded, so neither can drop a hook without the other noticing.
//
// These are Golf Stars' real hooks today:
//   • URL params (declarative, first-paint): ?seed=<n|string>, ?intro=1|0
//   • Live feel flags (window._gs*, default-on escape-hatches the hub flips with no reload)
// `hub` tokens are placeholders (TODO) until the hub is built — each is what a hub control that
// drives this hook would have to emit. Fill them in step 3 above.
const HOOKS = [
  // label              src (defines it)            app token (parsed/defined)   hub token (emitted/driven) — TODO
  { label: 'run seed',  src: 'src/app.ts',          app: "get('seed')",          hub: 'seed=' },
  { label: 'intro play', src: 'src/app.ts',         app: "get('intro')",         hub: 'intro=' },
  { label: 'flight feel', src: 'src/render/playView.ts',  app: '_gsFeel',         hub: '_gsFeel' },
  { label: 'intro feel',  src: 'src/render/introView.ts', app: '_gsIntro',        hub: '_gsIntro' },
  { label: 'spray tiers', src: 'src/app.ts',        app: '_gsSpray',             hub: '_gsSpray' },
  // When you add a hook: add its row here, add the hub control, and tick the I4 process in the standard.
];

// ── #3 (optional): an enumerated set that must match EXACTLY both ways ─────────────────────────
// Golf Stars defines a closed list of BIOMES (src/sim/course/biomes.ts). A hub biome-picker must
// surface every biome id and no extras. This block proves it both directions: add a biome row and
// it fails until the hub has a button for it — and vice-versa. Delete it if the hub never enumerates.
function appBiomeIds() {
  const src = readSrc('src/sim/course/biomes.ts');
  const ids = [...src.matchAll(/id:\s*'([a-z-]+)'/g)].map((m) => m[1]).sort();
  ok(ids.length, 'could not find any biome ids in src/sim/course/biomes.ts (did its shape change?)');
  return ids;
}
function hubBiomeIds() {
  // FILL: regex over the hub's biome-button/option list, e.g. `const BIOMES=['verdant-station', …];`
  const m = readHub().match(/const BIOMES\s*=\s*\[([\s\S]*?)\];/);
  ok(m, 'could not find the biome list in the hub');
  return [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]).sort();
}

// ── the assertions (these stay the same across projects) ─────────────────────────────────────
export const tests = {
  // Direction A: the app still honours every hook the hub sends. (Live today — reads real source.)
  'app still honours every hook the hub sends'() {
    for (const h of HOOKS)
      ok(readSrc(h.src).includes(h.app),
        `${h.src} no longer contains "${h.app}" (${h.label}) — the hub control that drives it is now dead; update both`);
  },

  // Direction B: the hub still actually emits/drives every hook it documents. (Needs the hub.)
  'hub still sends every hook it documents'() {
    const h = readHub();
    for (const hook of HOOKS)
      ok(h.includes(hook.hub),
        `hub no longer sends "${hook.hub}" (${hook.label}) — it claims to support this hook but doesn't`);
  },

  // Strongest invariant (if you kept #3): the biome set matches EXACTLY, both ways.
  'hub biome controls match the app biome set exactly'() {
    deepEq(hubBiomeIds(), appBiomeIds(),
      'hub biome keys vs app biome ids — add the new/removed biome on the other side');
  },
};
