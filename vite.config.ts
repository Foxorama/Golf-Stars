/// <reference types="node" />
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Inline the entire bundle into a single self-contained index.html. GitHub Pages serving
// of separate hashed assets kept failing (404 / CDN index-asset skew / service-worker
// interception), white-screening the app. With no external asset there is nothing to
// 404 — one file, always served fresh by the no-cache HTML. `base` is irrelevant once
// everything is inlined, but keep it relative for safety.
const base = process.env.VITE_BASE ?? './';

export default defineConfig({
  base,
  // Down-level modern syntax (??, ?., object spread, …) so the bundle PARSES on older
  // module-capable engines (some mobile WebViews support ES modules but not 2020-era
  // syntax). Leaving it raw made the whole module fail to parse → blank page.
  build: { target: 'es2017' },
  plugins: [viteSingleFile()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
