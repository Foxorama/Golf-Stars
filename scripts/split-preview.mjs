// Quick STRUCTURAL preview of the split-fairway archetype (GS-split-fairway): finds several split
// holes and draws their raw feature polygons to one SVG so the two-route structure (primary corridor +
// alternate lane + central waste median) can be eyeballed. NOT the full art render (style.ts) — just
// the geometry, so a reviewer can see the split is real, separated, and fair.
//
//   node scripts/split-preview.mjs            → writes the SVG to the OS temp dir, prints the path
//   SPLIT_OUT=/path/out.svg node ...          → writes there instead

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const outSvg = process.env.SPLIT_OUT ?? join(tmpdir(), 'gs-split.svg');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { polylineDist } = await server.ssrLoadModule('/src/sim/course/contract.ts');

// Collect split holes across a couple of armed worlds.
const picks = [];
for (const biome of ['verdant-station', 'tempest-reach']) {
  for (let s = 0; s < 400 && picks.filter((p) => p.biome === biome).length < 4; s++) {
    const c = generateCourse(s + 500, { biome, holes: 9, wildness: 0.65, compose: true });
    for (const h of c.holes) {
      if (h.splitFairway && picks.filter((p) => p.biome === biome).length < 4) picks.push({ biome, seed: s + 500, h });
    }
  }
}

const CELL = 300;
const PAD = 16;
const cols = 4;
const rows = Math.ceil(picks.length / cols);

const COLOR = {
  fairway: '#5fb85f',
  green: '#2f8f4f',
  tee: '#7fd07f',
  waste: '#d9c48a',
  water: '#4a90d9',
  creek: '#4a90d9',
  bunker: '#e6d8a8',
};

function cell(p, ci) {
  const { h } = p;
  // Bounds over all feature/hazard points.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const eat = ([x, y]) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const f of [...h.features, ...h.hazards]) for (const pt of f.poly) eat(pt);
  const w = maxX - minX || 1, hgt = maxY - minY || 1;
  const scale = (CELL - 2 * PAD) / Math.max(w, hgt);
  const ox = (ci % cols) * CELL, oy = Math.floor(ci / cols) * CELL + 24;
  const proj = ([x, y]) => [ox + PAD + (x - minX) * scale, oy + PAD + (maxY - y) * scale]; // flip Y
  const polyStr = (poly) => poly.map(proj).map((q) => q.join(',')).join(' ');
  const half = Math.max(...(h.features.find((f) => f.kind === 'fairway')?.poly ?? []).map((pt) => polylineDist(pt, h.centreline)), 1);

  let s = `<rect x="${ox}" y="${oy - 24}" width="${CELL}" height="${CELL + 24}" fill="#10240f" stroke="#284">`;
  s += `</rect><text x="${ox + 8}" y="${oy - 8}" fill="#bfe" font-size="11" font-family="monospace">${p.biome.slice(0, 8)} #${p.seed} par${h.par}</text>`;
  // Draw fairway features: primary corridor darker outline, the ALTERNATE lane (reach > half+8) highlighted.
  const fairways = h.features.filter((f) => f.kind === 'fairway');
  fairways.forEach((f) => {
    const reach = Math.max(...f.poly.map((pt) => polylineDist(pt, h.centreline)));
    const isLane = reach > half + 8;
    s += `<polygon points="${polyStr(f.poly)}" fill="${isLane ? '#6fe08f' : COLOR.fairway}" fill-opacity="${isLane ? 0.9 : 0.7}" stroke="${isLane ? '#0f6' : '#194'}" stroke-width="${isLane ? 1.5 : 0.7}"/>`;
  });
  for (const f of h.features) if (f.kind === 'green' || f.kind === 'tee') s += `<polygon points="${polyStr(f.poly)}" fill="${COLOR[f.kind]}"/>`;
  for (const z of h.hazards) {
    const col = COLOR[z.kind] ?? '#886';
    const em = z.kind === 'waste';
    s += `<polygon points="${polyStr(z.poly)}" fill="${col}" fill-opacity="${em ? 0.95 : 0.55}" stroke="${em ? '#a80' : 'none'}" stroke-width="${em ? 1.2 : 0}"/>`;
  }
  // Centreline (the primary route the AI plays).
  s += `<polyline points="${h.centreline.map(proj).map((q) => q.join(',')).join(' ')}" fill="none" stroke="#fff" stroke-width="0.8" stroke-dasharray="3 3" opacity="0.7"/>`;
  return s;
}

const body = picks.map((p, i) => cell(p, i)).join('\n');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * CELL}" height="${rows * CELL + 24}" viewBox="0 0 ${cols * CELL} ${rows * CELL + 24}" font-family="sans-serif">
<rect width="100%" height="100%" fill="#08170a"/>
<text x="8" y="16" fill="#8fd" font-size="12">Split-fairway structure — bright lane = alternate route, tan = waste median, dashed = AI's primary line</text>
${body}
</svg>`;
writeFileSync(outSvg, svg);
console.log(`Wrote ${picks.length} split holes → ${outSvg}`);
await server.close();
