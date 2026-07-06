// Rasterise a fairway-WIDTH-archetype sheet (GS-fairway-width): one column per width profile
// (chute / neck / hourglass / wander / thin / broad / classic), several holes each, so the width
// grammar can be eyeballed after any `chooseWidthProfile` / corridor-profile change — does a chute
// read as a tight drive that opens out, does a neck really squeeze the approach, does an hourglass
// pinch the driving zone? Pure dev tool, same harness as `gallery.mjs` (real TS render layer via
// vite-node + pre-installed Chromium).
//
//   node scripts/width-preview.mjs           → writes the PNG to the OS temp dir, prints the path
//   WIDTH_OUT=/path/out.png node ...         → writes there instead

import { createServer } from 'vite';
import { writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outPng = process.env.WIDTH_OUT ?? join(tmpdir(), 'gs-width.png');
const outHtml = join(tmpdir(), 'gs-width.html');

async function chromiumCandidates() {
  const { readdirSync } = await import('node:fs');
  const { homedir } = await import('node:os');
  const bases = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    join(homedir(), 'AppData', 'Local', 'ms-playwright'),
    join(homedir(), 'Library', 'Caches', 'ms-playwright'),
    join(homedir(), '.cache', 'ms-playwright'),
  ].filter((b) => b && existsSync(b));
  const out = [];
  for (const base of bases) {
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium-') || d.includes('headless')) continue;
      for (const rel of [
        ['chrome-linux', 'chrome'],
        ['chrome-win64', 'chrome.exe'],
        ['chrome-win', 'chrome.exe'],
        ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
      ]) {
        const bin = join(base, d, ...rel);
        if (existsSync(bin)) out.push(bin);
      }
    }
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium_headless_shell-')) continue;
      for (const rel of [
        ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
        ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
        ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
        ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
      ]) {
        const bin = join(base, d, ...rel);
        if (existsSync(bin)) out.push(bin);
      }
    }
  }
  return out;
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');

// Hunt holes per archetype across seeds/wildness on a couple of readable worlds, plus the
// lost-rough ISLAND pool (GS-island-width) on the void/cetus deep stops (wildness ≥ 0.55 arms it).
const ARCHES = [
  'chute', 'neck', 'hourglass', 'wander', 'thin', 'broad', 'classic',
  'island', 'island-bays', 'island-flare', 'island-broadtee', 'island-broad',
];
const WANT = 3;
const found = Object.fromEntries(ARCHES.map((a) => [a, []]));
outer: for (let s = 0; s < 800; s++) {
  const island = s % 4 === 3;
  const biome = island ? (s % 8 === 3 ? 'void-garden' : 'cetus-deep') : s % 2 ? 'verdant-station' : 'dust-belt';
  const wild = island ? [0.6, 0.8, 1][s % 3] : [0.15, 0.45, 0.8][s % 3];
  const course = generateCourse(90000 + s, { biome, holes: 4, wildness: wild });
  for (const h of course.holes) {
    if (h.par < 4 && !['thin', 'broad', 'wander', 'classic', 'island'].includes(h.widthId)) continue;
    const bucket = found[h.widthId];
    if (bucket && bucket.length < WANT) bucket.push({ hole: h, biome, wild });
    if (ARCHES.every((a) => found[a].length >= WANT)) break outer;
  }
}

let cells = '';
for (const a of ARCHES) {
  for (const { hole, biome, wild } of found[a]) {
    const map = renderHoleSVG(hole, { width: 210, height: 340, biome });
    cells += `<figure style="margin:0"><figcaption style="color:#ccd;font:600 11px system-ui;padding:3px 0">${a} · par ${hole.par} · w${wild}</figcaption>${map}</figure>`;
  }
}
const html = `<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(${WANT},210px);gap:8px;padding:12px">${cells}</body></html>`;
writeFileSync(outHtml, html);

const candidates = await chromiumCandidates();
const { chromium } = await import('playwright-core');
let browser = null;
for (const chromePath of candidates) {
  try {
    browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
    break;
  } catch (e) {
    console.log('launch failed, trying next candidate:', chromePath, '—', String(e).split('\n')[0]);
  }
}
if (!browser) {
  console.log('No launchable Chromium — wrote HTML only:', outHtml);
  await server.close();
  process.exit(0);
}
const page = await browser.newPage({ viewport: { width: 700, height: 940 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
