// Quick visual check for the Rainbow Road polish (GS-rainbow-polish): render a few holes as the
// static SVG map WITH rainbow road armed, so the aurora sky + layered rainbow-cliff ribbon + shaded
// bands can be eyeballed. Dev tool only — imports the real TS render layer via vite-node.
//   node scripts/rainbow-preview.mjs   → writes SVGs to the OS temp dir, prints the paths
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { ssrLoadModule } = server;
const { generateCourse } = await ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await ssrLoadModule('/src/render/holeView.ts');

const biomes = ['verdant', 'inferno', 'frost'];
const paths = [];
for (const biome of biomes) {
  const c = generateCourse(`rainbow-preview:${biome}`, { holes: 4, biome, wildness: 0.7 });
  const hole = c.holes[1];
  const svg = renderHoleSVG(hole, { width: 380, height: 640, biome, rainbow: true });
  const p = join(tmpdir(), `gs-rainbow-${biome}.svg`);
  writeFileSync(p, svg);
  paths.push(p);
}
await server.close();
console.log(paths.join('\n'));
