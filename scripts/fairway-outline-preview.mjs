// Fairway SILHOUETTE close-up (GS-fairway-silhouette): hunt down the holes whose fairway is drawn from
// more than one polygon — a split-fairway alternate lane, a broken corridor's island segments, the
// green flare — and render them, so the ONE outline that traces the whole fairway system can be
// eyeballed. The whole-hole gallery buries these (a split lane is a few hundred square yards on a
// 400-yard map), which is exactly how a lane with no ink ring at all shipped.
//
//   node scripts/fairway-outline-preview.mjs             → the pick, map zoom + a lane close-up
//   OUT=/path/out.png node scripts/fairway-outline-preview.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-fairway-outline.png');
const outHtml = join(tmpdir(), 'gs-fairway-outline.html');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
const { pointInPoly } = await server.ssrLoadModule('/src/sim/course/contract.ts');

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

/** The fairway polys of a hole that share no vertex with any other — a genuinely separate island of
 *  cut grass (split lane / broken corridor segment), i.e. the ones an sps[0]-only ink line misses. */
function loosePolys(hole) {
  const fws = hole.features.filter((f) => f.kind === 'fairway').map((f) => f.poly);
  return fws.filter((p, i) => !p.some((v) => fws.some((o, j) => j !== i && pointInPoly(v, o))));
}
function centroid(poly) {
  return poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
}
function spanOf(poly) {
  let m = 0;
  for (const a of poly) for (const b of poly) m = Math.max(m, Math.hypot(a[0] - b[0], a[1] - b[1]));
  return m;
}

let cells = '';
let idx = 0;
for (const [biome, themeId, label] of worlds) {
  const found = [];
  for (let s = 0; s < 30 && found.length < 2; s++) {
    const course = generateCourse(880000 + s * 971 + idx * 13, { holes: 9, distanceFromStart: 18 + s * 4, biome });
    for (const hole of course.holes) {
      if (found.length >= 2) break;
      const loose = loosePolys(hole).filter((p) => p !== hole.features.find((f) => f.kind === 'fairway').poly);
      if (loose.length) found.push([hole, loose[0]]);
    }
  }
  for (const [hole, loose] of found) {
    const nFw = hole.features.filter((f) => f.kind === 'fairway').length;
    const map = renderHoleSVG(hole, { width: 240, height: 330, biome, themeId });
    const zoom = renderHoleSVG(hole, {
      width: 240,
      height: 330,
      biome,
      themeId,
      ball: hole.tee,
      focus: centroid(loose),
      viewRadius: Math.max(50, spanOf(loose) * 0.9),
      up: [hole.green[0] - hole.tee[0], hole.green[1] - hole.tee[1]],
    });
    const cap = `${label} · par ${hole.par} · ${nFw} fairway polys`;
    cells += `<figure style="margin:0"><figcaption style="color:#dde;font:600 11px system-ui;padding:3px 0">${cap}</figcaption>${map}</figure>`;
    cells += `<figure style="margin:0"><figcaption style="color:#9ad;font:600 11px system-ui;padding:3px 0">↑ loose poly close-up</figcaption>${zoom}</figure>`;
  }
  idx++;
}
const html = `<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(4,240px);gap:8px;padding:12px">${cells}</body></html>`;
writeFileSync(outHtml, html);




const browser = await launchChromium({ args: ['--no-sandbox'], wrote: outHtml });

const page = await browser.newPage({ viewport: { width: 1020, height: 1400 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
