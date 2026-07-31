// Large single-hole previews so the GS-egg easter eggs + GS-rough-cover-2 tufts read at size. Writes
// one PNG per (biome,hole) into a dir so the full-res detail survives (no multi-tile downsample).
import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outDir = process.env.EGG_DIR ?? join(tmpdir(), 'gs-eggs');
mkdirSync(outDir, { recursive: true });



const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');

const cases = [
  { biome: 'tidal-archipelago', label: 'ocean' },
  { biome: 'ice-ring', label: 'frost' },
  { biome: 'verdant-station', label: 'verdant' },
  { biome: 'ember-world', label: 'inferno' },
  { biome: 'tempest-reach', label: 'tempest' },
  { biome: 'crystal-spires', label: 'crystal' },
];



const browser = await launchChromium({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 960, height: 1480 }, deviceScaleFactor: 2 });

for (const c of cases) {
  const holes = generateCourse(20260627, { holes: 24, distanceFromStart: 10, biome: c.biome }).holes;
  const hole = holes.filter((h) => h.par >= 4)[1];
  const map = renderHoleSVG(hole, { width: 920, height: 1440, biome: c.biome });
  const html = `<!doctype html><html><body style="margin:0;background:#0b0d12">${map}</body></html>`;
  const f = join(outDir, `${c.label}.html`);
  writeFileSync(f, html);
  await page.goto('file://' + f);
  await page.screenshot({ path: join(outDir, `${c.label}.png`) });
  console.log('wrote', join(outDir, `${c.label}.png`));
}
await browser.close();
await server.close();
