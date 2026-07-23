import { createServer } from 'vite';
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

function chromiumCandidates() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', join(homedir(), '.cache', 'ms-playwright')].filter((b) => b && existsSync(b));
  const out = [];
  for (const base of bases) {
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium-') || d.includes('headless')) continue;
      const bin = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(bin)) out.push(bin);
    }
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium_headless_shell-')) continue;
      const bin = join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
      if (existsSync(bin)) out.push(bin);
    }
  }
  return out;
}

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-scorpius.png');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { scorpiusPortraitSVG, venomaPortraitSVG, vossPortraitSVG } = await server.ssrLoadModule('/src/render/loreArt.ts');

const cell = (label, svg) =>
  `<figure style="margin:0;background:#0a0d10;border:1px solid #223;border-radius:12px;padding:8px"><figcaption style="color:#9fb0c8;font:700 12px system-ui;padding:4px 0 8px">${label}</figcaption><div style="width:300px">${svg}</div></figure>`;

const html = `<!doctype html><html><body style="margin:0;background:#05070a;display:flex;gap:12px;padding:16px">
${cell('Scorpius (new)', scorpiusPortraitSVG())}
${cell('Venoma', venomaPortraitSVG())}
${cell('Voss', vossPortraitSVG())}
</body></html>`;
const outHtml = join(tmpdir(), 'gs-scorpius.html');
writeFileSync(outHtml, html);

const { chromium } = await import('playwright-core');
let browser = null;
for (const p of chromiumCandidates()) {
  try { browser = await chromium.launch({ executablePath: p, args: ['--no-sandbox'] }); break; } catch {}
}
if (!browser) { console.log('No chromium — HTML at', outHtml); await server.close(); process.exit(0); }
const page = await browser.newPage({ viewport: { width: 980, height: 420 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.waitForTimeout(200);
await page.screenshot({ path: outPng });
await browser.close();
await server.close();
console.log('wrote', outPng);
