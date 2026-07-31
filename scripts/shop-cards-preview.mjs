/*
 * Eyes-on preview of the Pro Shop item cards (GS-proshop-3): renders EVERY shop item's real
 * itemCardHTML (with the real procedural itemArtSVG) into an HTML grid, screenshotted via the
 * installed Playwright/Chromium. Verifies equal sizing, unique imagery, epic/legendary glow, and
 * the new Power Glove. NOT a unit test — a visual check.
 *
 *   node scripts/shop-cards-preview.mjs
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { launchChromium } from './chromium.mjs';

// `/tmp` is not a path on Windows — it resolves to `C:\tmp`, which does not exist, so this rig died
// before it ever reached a browser. The rest of the rigs already use `tmpdir()`.
const entryPath = join(tmpdir(), 'gs-shop-entry.ts');
const outPng = join(tmpdir(), 'gs-shop-cards.png');

// Bundle a tiny entry that renders all cards to document.body.
const entry = `
import { SHOP_ITEMS, itemCost, itemCap, ownedCount, clubSetById } from './src/sim/rpg/economy';
import { itemCardHTML } from './src/render/cards';
import { itemArtSVG } from './src/render/itemArt';

const order = { common: 0, rare: 1, epic: 2, legendary: 3 };
const items = [...SHOP_ITEMS].sort((a, b) => order[a.rarity] - order[b.rarity]);
const cards = items.map((it) => {
  const setTheme = it.clubSet ? clubSetById(it.clubSet)?.theme : undefined;
  const art = itemArtSVG(it.id, it.rarity, setTheme);
  return '<div style="margin:6px">' + itemCardHTML({ ...it, cost: it.cost }, { artSVG: art, affordable: true }) + '</div>';
}).join('');
document.body.innerHTML =
  '<h2 style="font-family:sans-serif;color:#eee">Pro Shop cards — ' + items.length + ' items</h2>' +
  '<div style="display:flex;flex-wrap:wrap;align-items:flex-start;max-width:1400px">' + cards + '</div>';
`;
writeFileSync(entryPath, entry);

const result = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true,
  format: 'iife',
  write: false,
  platform: 'browser',
});
const js = result.outputFiles[0].text;

const html = `<!doctype html><html><head><meta charset="utf8"></head>
<body style="margin:0;padding:16px;background:#0b0d12;">
<script>${js}</script></body></html>`;

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
console.log('wrote', outPng);
