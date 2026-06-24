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
  plugins: [viteSingleFile()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
