/// <reference types="node" />
import { defineConfig } from 'vitest/config';

// Relative base so built asset URLs resolve no matter what path the app is served
// from — GitHub Pages serves project sites at /<Repo>/ and is CASE-SENSITIVE, so a
// hardcoded '/golf-stars/' breaks under the canonical '/Golf-Stars/'. './' sidesteps it
// (single-page app, no client-side router). Override with VITE_BASE for other hosts.
const base = process.env.VITE_BASE ?? './';

export default defineConfig({
  base,
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
