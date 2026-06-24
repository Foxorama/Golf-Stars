/**
 * Shared surface palette for both renderers (SVG map + Canvas2D play view). Render-layer
 * concern only — the sim never sees colour. Open like the lie table: unknown fantasy
 * surfaces fall back to a tint.
 */

export const FILL: Record<string, string> = {
  rough: '#274d27',
  fairway: '#3f8c3f',
  green: '#5fd45a',
  tee: '#7a9a3a',
  bunker: '#e9d8a6',
  water: '#3f8fe0',
  waste: '#c2b280',
  lava: '#d2451e',
  void: '#160a26',
  ice: '#bfe6f0',
  crystal: '#9fd8e6',
};

/** Per-biome rough/background tint, keyed by biome id (sell the world). */
export const BIOME_ROUGH: Record<string, string> = {
  'verdant-station': '#274d27',
  'dust-belt': '#6b5230',
  'ice-ring': '#3a4a55',
  'ember-world': '#3a1410',
  'void-garden': '#120a22',
};

export function fillFor(kind: string): string {
  return FILL[kind] ?? '#6a4f8a'; // unknown fantasy surface → purple tint
}

export function roughFor(biome?: string): string {
  return (biome && BIOME_ROUGH[biome]) || FILL.rough!;
}
