/*
 * Eyes-on preview of the new cosmetics (GS-cosmetics): the mythic UFO ship, every apparel card, and
 * a few golfer mannequin previews wearing sets. Screenshotted via the installed Playwright/Chromium.
 * NOT a unit test — a visual check.
 *
 *   node scripts/cosmetics-preview.mjs
 */
import { readdirSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

function findChromium() {
  const bases = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    `${homedir()}/AppData/Local/ms-playwright`,
  ].filter(Boolean);
  for (const base of bases) {
    let dirs;
    try { dirs = readdirSync(base).filter((x) => x.startsWith('chromium-') && !x.includes('headless')); }
    catch { continue; }
    for (const d of dirs) {
      for (const bin of [`${base}/${d}/chrome-linux/chrome`, `${base}/${d}/chrome-win/chrome.exe`, `${base}/${d}/chrome-win64/chrome.exe`]) {
        if (existsSync(bin)) return bin;
      }
    }
  }
  return null;
}

const entry = `
import { SHIPS } from './src/sim/rpg/ships';
import { shipCardSVG } from './src/render/shipArt';
import { APPAREL } from './src/sim/rpg/apparel';
import { apparelCardSVG, golferPreviewSVG } from './src/render/apparelArt';
import { cosmeticRarCol } from './src/sim/rpg/cosmetics';

const tile = (inner, label, col) =>
  '<div style="border:2px solid '+col+';border-radius:12px;padding:8px;margin:6px;text-align:center;background:radial-gradient(circle at 50% 30%,'+col+'22,#0b0d12);width:140px;">'+inner+'<div style="font-family:sans-serif;color:#eee;font-size:12px;margin-top:4px;">'+label+'</div></div>';

const ships = SHIPS.map((s) => tile(shipCardSVG(s.id, 130, 70), s.name+' · '+s.rarity, cosmeticRarCol(s.rarity))).join('');
const apparel = APPAREL.map((a) => tile(apparelCardSVG(a.id, 110, 70), a.name+' · '+a.rarity, cosmeticRarCol(a.rarity))).join('');
const sets = [
  ['helmet-astro','suit-space','pants-astro','Astronaut set'],
  ['crown-supernova','suit-supernova','leggings-supernova','Supernova (mythic)'],
  ['tophat-ace','tee-striped','knickers-ace','Mix & match'],
].map(([h,s,p,l]) => tile(golferPreviewSVG(h,s,p,{w:120,h:150}), l, '#ffce54')).join('');

document.body.innerHTML =
  '<h2 style="font-family:sans-serif;color:#eee">Ships (note the mythic Mothership UFO)</h2><div style="display:flex;flex-wrap:wrap;">'+ships+'</div>'+
  '<h2 style="font-family:sans-serif;color:#eee">Apparel cards</h2><div style="display:flex;flex-wrap:wrap;">'+apparel+'</div>'+
  '<h2 style="font-family:sans-serif;color:#eee">Golfer wearing sets</h2><div style="display:flex;flex-wrap:wrap;">'+sets+'</div>';
`;

import { writeFileSync } from 'node:fs';
const result = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true,
  format: 'iife',
  write: false,
  platform: 'browser',
});
const js = result.outputFiles[0].text;
const html = `<!doctype html><html><head><meta charset="utf8"></head><body style="margin:0;padding:16px;background:#0b0d12;"><script>${js}</script></body></html>`;
const htmlPath = join(tmpdir(), 'cosmetics-preview.html');
const pngPath = join(tmpdir(), 'cosmetics-preview.png');
writeFileSync(htmlPath, html);
console.log('wrote ' + htmlPath + ' — open it in a browser to eyeball the cosmetics');

// Try a headless screenshot too (skipped gracefully where the sandbox blocks a browser spawn).
try {
  const exe = findChromium();
  if (!exe) throw new Error('no chromium');
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: pngPath, fullPage: true });
  await browser.close();
  console.log('wrote ' + pngPath);
} catch (e) {
  console.log('(screenshot skipped — browser launch unavailable here: ' + e.message + ')');
}
