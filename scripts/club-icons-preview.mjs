/*
 * Eyes-on preview of the per-family club icons (GS-club-icons): renders a driver / wood / hybrid /
 * iron / wedge / putter card for BOTH the gear-shaft path (itemArtSVG on real shop ids) and the
 * themed reward-club path, at every rarity tint, so the six silhouettes can be compared at a glance.
 *
 *   node scripts/club-icons-preview.mjs
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { launchChromium } from './chromium.mjs';

// `/tmp` is not a path on Windows — it resolves to `C:\tmp`, which does not exist, so this rig died
// before it ever reached a browser. The rest of the rigs already use `tmpdir()`.
const entryPath = join(tmpdir(), 'gs-club-entry.ts');
const outPng = join(tmpdir(), 'gs-club-icons.png');




const entry = `
import { itemArtSVG } from './src/render/itemArt';
import { clubItemId } from './src/sim/rpg/economy';

const rarities = ['common', 'rare', 'epic', 'legendary'];
// Gear-shaft items, one per family.
const shaftIds = [
  ['driver', 'distance-driver'],
  ['wood', 'distance-woods'],
  ['hybrid', 'distance-hybrids'],
  ['iron', 'distance-irons'],
];
// Reward clubs, one per family (theme 'tour' → planet look; type picks the head).
const rewardTypes = [['driver','D'],['wood','3W'],['hybrid','3H'],['iron','7i'],['wedge','SW'],['putter','putter']];

function cell(label, svg) {
  return '<div style="width:190px;margin:6px;font-family:sans-serif;color:#cdd3df;font-size:12px">' +
    '<div style="margin-bottom:3px">' + label + '</div>' + svg + '</div>';
}

let html = '<h2 style="font-family:sans-serif;color:#eee">Gear-shaft items by family (rarity tints)</h2><div style="display:flex;flex-wrap:wrap">';
for (const [fam, id] of shaftIds) {
  for (const r of rarities) html += cell(fam + ' · ' + r, itemArtSVG(id, r));
}
html += '</div><h2 style="font-family:sans-serif;color:#eee">Reward clubs by family (theme=planet)</h2><div style="display:flex;flex-wrap:wrap">';
for (const [fam, t] of rewardTypes) {
  for (const r of ['rare','epic','legendary']) html += cell(fam + ' · ' + r, itemArtSVG(clubItemId('tour', t), r, 'planet'));
}
html += '</div>';
document.body.innerHTML = html;
`;
writeFileSync(entryPath, entry);

const result = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'iife', write: false, platform: 'browser',
});
const js = result.outputFiles[0].text;
const html = `<!doctype html><html><head><meta charset="utf8"></head>
<body style="margin:0;padding:16px;background:#0b0d12;">
<script>${js}</script></body></html>`;


const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 900, height: 1400 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
console.log('wrote', outPng);
