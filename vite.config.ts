/// <reference types="node" />
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

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
  plugins: [viteSingleFile()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
