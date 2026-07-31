// Quick visual check for Rainbow Road (GS-rainbow-polish + GS-rainbow-road-2): render a few holes as
// the static SVG map WITH rainbow road armed, applying the in-game `applyRainbowRoad` transform (wide
// road + no hazards) so the aurora sky, prismatic cliff pillars, aligned band grid and widened ribbon
// can be eyeballed exactly as the run shows them. Dev tool only — imports the real TS render layer.
//   node scripts/rainbow-preview.mjs   → writes SVGs (and PNGs if chromium is present) to the temp dir
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { ssrLoadModule } = server;
const { generateCourse } = await ssrLoadModule('/src/sim/course/generate.ts');
const { applyRainbowRoad } = await ssrLoadModule('/src/sim/rpg/rainbow.ts');
const { renderHoleSVG } = await ssrLoadModule('/src/render/holeView.ts');

const biomes = ['verdant', 'inferno', 'frost'];
const svgs = [];
for (const biome of biomes) {
  const raw = generateCourse(`rainbow-preview:${biome}`, { holes: 4, biome, wildness: 0.7 });
  const c = applyRainbowRoad(raw);
  for (const hi of [1, 2]) {
    const hole = c.holes[hi];
    const svg = renderHoleSVG(hole, { width: 380, height: 640, biome, rainbow: true });
    const p = join(tmpdir(), `gs-rainbow-${biome}-${hi}.svg`);
    writeFileSync(p, svg);
    svgs.push({ p, svg, name: `${biome}-${hi}` });
  }
}
await server.close();

// Rasterize to PNG with the pre-installed chromium so the result is directly viewable.
try {
  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 380 * 2 + 20, height: 640 * 3 + 40 } });
  const cells = svgs.map((s) => `<div style="display:inline-block">${s.svg}</div>`).join('');
  await page.setContent(`<body style="margin:0;background:#000;display:flex;flex-wrap:wrap;gap:10px;width:${380 * 2 + 20}px">${cells}</body>`);
  const out = join(tmpdir(), 'gs-rainbow-preview.png');
  await page.screenshot({ path: out, fullPage: true });
  await browser.close();
  console.log('PNG:', out);
} catch (e) {
  console.log('(no rasterize:', e.message, ')');
}
console.log(svgs.map((s) => s.p).join('\n'));
