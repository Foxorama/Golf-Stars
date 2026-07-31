// Green-SURROUND close-up (GS-green-apron-blend): render each world's green complex at the zoom the
// player actually studies it — the approach/chip camera — so the band between the putting surface and
// the ground it sits in can be judged on its own. The whole-hole gallery is too wide to see it and the
// putt camera is too tight; this frames the green plus roughly a green-radius of surround.
//
//   node scripts/green-apron-preview.mjs                → all worlds, two holes each
//   OUT=/path/out.png node scripts/green-apron-preview.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-green-apron.png');
const outHtml = join(tmpdir(), 'gs-green-apron.html');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
const { pinOf } = await server.ssrLoadModule('/src/sim/round.ts');

// Every grounded world (the ones whose green sits IN ground rather than floating over an abyss/deck),
// plus the two that model their edge differently, so a change can be checked not to disturb them.
const worlds = [
  ['verdant-station', 'crux', 'Verdant'],
  ['dust-belt', 'vela', 'Desert'],
  ['earth-links', 'lyra', 'Earth links'],
  ['ice-ring', 'cygnus', 'Frost'],
  ['ember-world', 'scorpius', 'Inferno'],
  ['crystal-spires', 'corona-borealis', 'Crystal'],
  ['tempest-reach', 'draco', 'Tempest'],
  ['spore-jungle', 'lacerta', 'Fungal'],
  ['tidal-archipelago', 'delphinus', 'Ocean'],
  ['toxic-mire', 'hydra', 'Swamp'],
  ['scrap-belt', 'antlia', 'Metal'],
  ['void-garden', 'lyra', 'Void'],
  ['cetus-deep', 'cetus', 'Cetus'],
  ['derelict-ship', 'orion', 'Derelict'],
];

function greenDiam(h) {
  const g = h.features.find((f) => f.kind === 'green');
  let m = 0;
  for (let i = 0; i < g.poly.length; i++)
    for (let j = i + 1; j < g.poly.length; j++) {
      const d = Math.hypot(g.poly[i][0] - g.poly[j][0], g.poly[i][1] - g.poly[j][1]);
      if (d > m) m = d;
    }
  return m;
}

let cells = '';
let idx = 0;
for (const [biome, themeId, label] of worlds) {
  for (const [n, seed] of [[0, 987001], [1, 4242077]]) {
    const holes = generateCourse(seed + idx * 13, { holes: 12, distanceFromStart: 34, biome }).holes.filter((h) => h.par >= 4);
    const hole = holes[(idx * 3 + n * 5) % holes.length] ?? holes[0];
    const diam = greenDiam(hole);
    const pin = pinOf(hole);
    const svg = renderHoleSVG(hole, {
      width: 280, height: 300, biome, themeId, ball: hole.tee,
      focus: hole.green, viewRadius: diam * 1.05,
      up: [pin[0] - hole.tee[0], pin[1] - hole.tee[1]],
    });
    cells += `<figure style="margin:0"><figcaption style="color:#dde;font:600 11px system-ui;padding:3px 0">${label} · par ${hole.par} · ${diam.toFixed(0)}yd</figcaption>${svg}</figure>`;
  }
  idx++;
}
const html = `<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(4,280px);gap:8px;padding:12px">${cells}</body></html>`;
writeFileSync(outHtml, html);




const browser = await launchChromium({ args: ['--no-sandbox'], wrote: outHtml });

const page = await browser.newPage({ viewport: { width: 1180, height: 1400 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
