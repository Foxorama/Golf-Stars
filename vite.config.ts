/// <reference types="node" />
import { readFileSync } from 'node:fs';
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
