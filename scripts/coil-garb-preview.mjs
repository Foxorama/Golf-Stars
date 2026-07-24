// Throwaway preview: render each golfer normally + as a Coil defector (coilGarb), side by side, and
// screenshot to a PNG so the switched-sides costume can be eyeballed. Mirrors gallery.mjs's tooling.
import { createServer } from 'vite';
import { writeFileSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-coil-garb.png');
const outHtml = join(tmpdir(), 'gs-coil-garb.html');

async function chromium() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', join(homedir(), 'Library', 'Caches', 'ms-playwright')].filter(Boolean);
  for (const b of bases) {
    let entries = [];
    try { entries = readdirSync(b); } catch { continue; }
    for (const e of entries) {
      if (!/^chromium/.test(e)) continue;
      for (const p of [join(b, e, 'chrome-linux', 'chrome'), join(b, e, 'chrome-linux', 'headless_shell'), join(b, e, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')]) {
        try { readdirSync(join(p, '..')); return p; } catch { /* next */ }
      }
    }
  }
  return null;
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { golferPreviewSVG } = await server.ssrLoadModule('/src/render/apparelArt.ts');
const { CHARACTERS } = await server.ssrLoadModule('/src/sim/rpg/characters.ts');
const { corruptedLookOpts } = await server.ssrLoadModule('/src/sim/rpg/storyBetrayal.ts');

const cells = CHARACTERS.map((ch) => {
  const normal = golferPreviewSVG(undefined, undefined, undefined, { skin: ch.style.skin, shirtBase: ch.style.shirt, capColor: ch.style.cap, hair: ch.style.hair, uid: `n${ch.id.replace(/[^a-z0-9]/gi, '')}`, w: 110, h: 240 });
  const coil = golferPreviewSVG(undefined, undefined, undefined, { ...corruptedLookOpts(ch), uid: `c${ch.id.replace(/[^a-z0-9]/gi, '')}`, w: 110, h: 240 });
  return `<div class="cell"><div class="pair"><div>${normal}</div><div>${coil}</div></div><div class="lbl">${ch.shortName}</div></div>`;
}).join('');

const html = `<!doctype html><meta charset=utf8><style>
  body{margin:0;background:#0f1420;color:#cdd8ea;font:14px system-ui;padding:20px;}
  .grid{display:flex;flex-wrap:wrap;gap:20px;}
  .cell{background:#161a24;border:1px solid #2a3346;border-radius:12px;padding:12px;}
  .pair{display:flex;gap:8px;}
  .lbl{text-align:center;margin-top:8px;font-weight:700;}
</style><div class="grid">${cells}</div>`;
writeFileSync(outHtml, html);

const exe = await chromium();
if (!exe) { console.log('no chromium; wrote HTML to', outHtml); await server.close(); process.exit(0); }
const { chromium: pw } = await import('playwright-core');
const browser = await pw.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 720 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.waitForTimeout(300);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
