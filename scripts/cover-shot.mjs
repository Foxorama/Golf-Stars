// Render ONE hole, on a named world, as a portrait picture for the devlog cover.
//
// WHY THIS IS NOT screenshots.mjs. That script drives the BUILT game and shoots whatever the real
// embed shows, which is the right rule for store screenshots and is exactly what makes it unable to
// shoot these two worlds: Cetus Deep and Void Garden never come up as a Voyage's FIRST stop (a seed
// sweep of 300 seeds lands only on verdant/ice/tidal/crystal/dust/scrap/spore), and the Star Tour
// courses that DO sit on them are reached by flying a chart, not by a deep link. So the cover's
// picture is rendered from the sim instead — same `generateCourse`, same `buildScene` behind
// `renderHoleSVG`, i.e. the game's own art, in the whole-hole map view the 🗺 button shows.
//
// It is a MAP, not a play screen, and that is the trade: no HUD, so the picture is quieter next to
// a wordmark, but it is also not a photograph of somebody playing. Both cover variants exist —
// COVER_SHOT in banner.mjs picks which one is used.
//
//   node scripts/cover-shot.mjs                  → both worlds into assets/itch/shots/
//   WORLD=cetus node scripts/cover-shot.mjs      → just that one
//
// Deterministic: pinned seed + pinned hole index, so a re-run after an art change shows the same
// hole (the same reason a seed IS the bug report). Pure dev tool — never writes into src/.

import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './chromium.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.SHOTS_OUT ?? join(repoRoot, 'assets', 'itch', 'shots');
mkdirSync(outDir, { recursive: true });

// aim.png's aspect, so either picture drops into the cover layout without moving anything.
const W = 1200;
const H = 1720;
const SEED = Number(process.env.COVER_SEED ?? 20260801);

// `hole` indexes the par-4+ holes of that course, picked by eye off a contact sheet of the first
// four. distance 22 over 48: the deep-stop holes of the same seed are the same routings with more
// rough, and the shallower one reads cleaner at cover size.
const WORLDS = {
  cetus: { biome: 'cetus-deep', themeId: 'cetus', dist: 22, hole: 1 }, // glowing reef islands, hairpin
  void: { biome: 'void-garden', themeId: 'pegasus', dist: 22, hole: 3 }, // violet dogleg in the deep
};

const want = process.env.WORLD ? [process.env.WORLD] : Object.keys(WORLDS);

const server = await createServer({
  root: repoRoot,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
// THE one way this repo finds AND launches Chromium (GS-browser-test-gate) — never a second copy.
// It THROWS when there is no browser rather than exiting 0, which is the whole point: this rig used
// to print "no chromium" and succeed, so a cover that never rendered looked like a cover that did.
const browser = await launchChromium({ args: ['--no-sandbox'] });

for (const name of want) {
  const spec = WORLDS[name];
  if (!spec) {
    console.error(`  ${name}: ⚠ unknown world (${Object.keys(WORLDS).join(', ')})`);
    continue;
  }
  const { biome, themeId, dist, hole: idx } = spec;
  const course = generateCourse(SEED, { holes: 18, distanceFromStart: dist, biome, compose: true });
  const hole = course.holes.filter((h) => h.par >= 4)[idx];
  const svg = renderHoleSVG(hole, { width: W / 2, height: H / 2, biome, themeId });
  const page = await browser.newPage({ viewport: { width: W / 2, height: H / 2 }, deviceScaleFactor: 2 });
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#0b0d12}
     svg{display:block}</style></head><body>${svg}</body></html>`,
    { waitUntil: 'load' },
  );
  const file = join(outDir, `cover-${name}.png`);
  writeFileSync(file, await page.screenshot());
  await page.close();
  console.log(`  cover-${name}.png  ${W}×${H}  ${biome} · par ${hole.par} · ${hole.shapeId ?? '?'}`);
}

await browser.close();
await server.close();
