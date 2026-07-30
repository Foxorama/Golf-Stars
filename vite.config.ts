/// <reference types="node" />
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The shipped build number, single-sourced from package.json (GS-release-identity). It reaches
// the app two ways, because the app has two entry points that run at different times:
//   • `define` → `__APP_VERSION__`, read by `src/brand.ts` once the module bundle evaluates.
//   • `%GS_VERSION%` in index.html → the BOOT WATCHDOG, which runs *before* any module and is
//     the one diagnostic that survives a bundle that fails to parse. It cannot import.
// Read via fs rather than `import pkg from './package.json'` so the config stays a plain ESM
// module with no import-assertion syntax to trip over.
const pkgVersion = (
  JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
).version;

// Inline the entire bundle into a single self-contained index.html. GitHub Pages serving
// of separate hashed assets kept failing (404 / CDN index-asset skew / service-worker
// interception), white-screening the app. With no external asset there is nothing to
// 404 — one file, always served fresh by the no-cache HTML. `base` is irrelevant once
// everything is inlined, but keep it relative for safety.
const base = process.env.VITE_BASE ?? './';

// Two single-file pages live in dist/: the game (index.html) and the test/demo hub
// (test.html — see standards/TEST-HUB-STANDARD.md). vite-plugin-singlefile forces
// `inlineDynamicImports`, which Rollup forbids with multiple inputs, so the two CANNOT
// build in one pass — instead `npm run build` runs vite twice, gating the entry on
// VITE_HUB. The hub pass sets emptyOutDir:false so it APPENDS test.html beside the
// already-built game rather than wiping it.
const HUB = process.env.VITE_HUB === '1';

// Where the built worker lands, and the placeholder it carries (GS-sw-version). The token is spelled
// ONCE here and once in public/sw.js; `tests/brand.test.ts` asserts they still agree.
// `fileURLToPath`, never `URL.pathname` — on Windows the latter yields `/C:/…`, which `resolve`
// then treats as a rooted path and the worker is written to the wrong drive root.
const outDir = fileURLToPath(new URL('./dist/', import.meta.url));
const SW_VERSION_TOKEN = '%GS_VERSION%';

export default defineConfig({
  base,
  // Down-level modern syntax (??, ?., object spread, …) so the bundle PARSES on older
  // module-capable engines (some mobile WebViews support ES modules but not 2020-era
  // syntax). Leaving it raw made the whole module fail to parse → blank page.
  build: {
    target: 'es2017',
    emptyOutDir: !HUB, // hub pass appends to dist/, never wipes the game build
    rollupOptions: { input: HUB ? 'test.html' : 'index.html' },
  },
  define: { __APP_VERSION__: JSON.stringify(pkgVersion) },
  plugins: [
    viteSingleFile(),
    {
      // Stamp the build into index.html's boot watchdog. A placeholder rather than a hand-bumped
      // literal: the watchdog's whole job is proving WHICH html you actually loaded, and a
      // constant somebody has to remember to bump is a constant that eventually lies.
      name: 'gs-version-html',
      transformIndexHtml(html: string): string {
        return html.split('%GS_VERSION%').join(pkgVersion);
      },
    },
    {
      // …and into the SERVICE WORKER, for exactly the same reason (GS-sw-version).
      //
      // `public/sw.js` carried `var VERSION = 'fc-pwa-1.1.0'` under a `// bump per deploy` comment —
      // the last hand-bumped constant in the repo, and the same failure mode `%GS_VERSION%` was
      // introduced to kill for the watchdog. Forgetting it means returning offline players keep the
      // PREVIOUS build's snapshot one boot longer, which is silent, and only visible offline.
      //
      // It cannot use `define` (the worker is not part of the module graph) or `transformIndexHtml`
      // (it is not HTML), and it is copied verbatim out of `public/`. So the substitution happens on
      // the WRITTEN file, after the public dir has been copied.
      //
      // ⚠️ The cache PREFIX is deliberately not touched: it is one decision written in three files
      // that cannot share a constant (GS-release-identity, asserted by `tests/brand.test.ts`). Only
      // the version part is stamped, so the prefix stays a literal in all three places, agreeing.
      name: 'gs-version-sw',
      apply: 'build' as const,
      closeBundle(): void {
        const sw = resolve(outDir, 'sw.js');
        if (!existsSync(sw)) return; // the hub build emits no worker
        const src = readFileSync(sw, 'utf8');
        if (!src.includes(SW_VERSION_TOKEN)) {
          // Loud, not silent: a renamed placeholder would ship a worker whose version never moves,
          // and the whole point of this plugin is that nobody has to remember.
          throw new Error(`sw.js no longer contains ${SW_VERSION_TOKEN} — the build cannot stamp its version.`);
        }
        writeFileSync(sw, src.split(SW_VERSION_TOKEN).join(pkgVersion));
      },
    },
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // The browser tests drive dist/index.html. Build it ONCE here, in the main process, before any
    // worker starts — a per-file `vite build` deletes dist out from under a sibling file's
    // `page.goto` (emptyOutDir), which is a race that only fires sometimes. See tests/globalSetup.ts.
    globalSetup: ['tests/globalSetup.ts'],
  },
});
