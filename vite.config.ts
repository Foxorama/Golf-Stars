/// <reference types="node" />
import { defineConfig } from 'vitest/config';

// GitHub Pages serves from /<repo>/ — set base so built asset URLs resolve.
// Override with VITE_BASE for other hosts.
const base = process.env.VITE_BASE ?? '/golf-stars/';

export default defineConfig({
  base,
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
