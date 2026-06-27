// Extract compact constellation figures (normalized star coords + lines) from the night-sky
// catalogue into a render-side TS table keyed by theme slug (GS-17e). Run: node scripts/gen-constellations.mjs
import fs from 'node:fs';
const cat = JSON.parse(fs.readFileSync(new URL('../data/night-sky-cards.json', import.meta.url), 'utf8'));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const r2 = (n) => Math.round(n * 1000) / 1000;

const out = {};
for (const c of cat.constellations) {
  const ras = c.stars.map((s) => s.raDeg);
  const decs = c.stars.map((s) => s.decDeg);
  // Unwrap RA if the figure straddles the 0/360 seam (max span heuristic).
  const span = Math.max(...ras) - Math.min(...ras);
  const ur = span > 180 ? ras.map((r) => (r < 180 ? r + 360 : r)) : ras;
  const minR = Math.min(...ur), maxR = Math.max(...ur);
  const minD = Math.min(...decs), maxD = Math.max(...decs);
  const w = maxR - minR || 1, h = maxD - minD || 1;
  // x: RA increases east→west visually; keep simple left→right. y: north (high dec) at top.
  const stars = c.stars.map((s, i) => ({
    x: r2((ur[i] - minR) / w),
    y: r2((maxD - s.decDeg) / h),
    m: s.mag,
  }));
  out[slug(c.name)] = { name: c.name, stars, lines: c.lines };
}

const ids = Object.keys(out);
const body = `/**
 * Constellation figures for the sky backdrop (GS-17e) — GENERATED from data/night-sky-cards.json
 * by scripts/gen-constellations.mjs. Each entry is the constellation's stars normalized into a
 * unit box (x,y in [0,1]; y is north-up) plus its stick-figure \`lines\` (index pairs into stars),
 * and per-star magnitude \`m\` (lower = brighter). Keyed by theme slug. DO NOT EDIT BY HAND.
 */

export interface FigureStar { x: number; y: number; m: number }
export interface ConstellationFigure { name: string; stars: FigureStar[]; lines: [number, number][] }

export const CONSTELLATION_FIGURES: Record<string, ConstellationFigure> = ${JSON.stringify(out, null, 2)};

export function constellationFigure(themeId: string): ConstellationFigure | undefined {
  return CONSTELLATION_FIGURES[themeId];
}
`;
fs.writeFileSync(new URL('../src/render/constellations.ts', import.meta.url), body);
console.log('wrote', ids.length, 'figures:', ids.join(', '));
