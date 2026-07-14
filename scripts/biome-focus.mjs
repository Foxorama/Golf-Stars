// Focused per-biome hole-variety preview: render N whole-hole maps for one biome so shape/width/
// rough variety can be eyeballed after a biomes.ts identity change. Dev tool only.
//   BIOME=verdant-station THEME=crux node scripts/biome-focus.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';

const BIOME = process.env.BIOME ?? 'verdant-station';
const THEME = process.env.THEME ?? 'crux';
const outPng = process.env.OUT ?? join(tmpdir(), `gs-focus-${BIOME}.png`);
const outHtml = join(tmpdir(), `gs-focus-${BIOME}.html`);

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');

let cells = '';
// A spread of stops: shallow (calm) → deep (wild), several holes each.
for (const dist of [4, 14, 30, 60]) {
  const holes = generateCourse(20260714, { holes: 24, distanceFromStart: dist, biome: BIOME }).holes;
  const picks = holes.filter((h) => h.par >= 4).slice(0, 4);
  for (const hole of picks) {
    const map = renderHoleSVG(hole, { width: 240, height: 380, biome: BIOME, themeId: THEME });
    cells += `<figure style="margin:0"><figcaption style="color:#ccd;font:600 11px system-ui;padding:3px 0">d${dist} · par ${hole.par} · ${hole.widthId ?? '?'} · ${hole.shapeId ?? '?'}</figcaption>${map}</figure>`;
  }
}
const html = `<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(4,240px);gap:8px;padding:12px">${cells}</body></html>`;
writeFileSync(outHtml, html);

function chromiumCandidates() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', join(homedir(), '.cache', 'ms-playwright')].filter((b) => b && existsSync(b));
  const out = [];
  for (const base of bases) for (const d of readdirSync(base)) {
    if (!d.startsWith('chromium-') || d.includes('headless')) continue;
    const bin = join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(bin)) out.push(bin);
  }
  return out;
}
const { chromium } = await import('playwright-core');
let browser = null;
for (const p of chromiumCandidates()) { try { browser = await chromium.launch({ executablePath: p, args: ['--no-sandbox'] }); break; } catch {} }
if (!browser) { console.log('no chromium, wrote', outHtml); await server.close(); process.exit(0); }
const page = await browser.newPage({ viewport: { width: 1024, height: 1700 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
