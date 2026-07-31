// Throwaway preview (GS-story-champion-cosmetics): render the two CHAMPION outfits — Warden Vigil and
// Coil Shroud — as full worn figures beside the golfer's plain look, plus each piece's wardrobe CARD, so
// the six new garments can be eyeballed at both sizes. The wardrobe card and the worn figure come off the
// SAME `apparelArt.ts` painters, so a drift between "what you buy" and "what you wear" shows up here.
// Mirrors coil-garb-preview.mjs's tooling.  OUT=<path> node scripts/champion-outfit-preview.mjs
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-champion-outfits.png');
const outHtml = join(tmpdir(), 'gs-champion-outfits.html');



const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { golferPreviewSVG, apparelCardSVG } = await server.ssrLoadModule('/src/render/apparelArt.ts');
const { CHARACTERS } = await server.ssrLoadModule('/src/sim/rpg/characters.ts');
const { CHAMPION_COSMETICS } = await server.ssrLoadModule('/src/sim/rpg/storyChampionCosmetics.ts');
const { apparelById } = await server.ssrLoadModule('/src/sim/rpg/apparel.ts');

const uid = (s) => s.replace(/[^a-z0-9]/gi, '');

// One block per path: the wardrobe cards, then every golfer wearing the full set beside their plain look.
const blocks = Object.entries(CHAMPION_COSMETICS).map(([path, set]) => {
  const [hatId, shirtId, pantsId] = set.apparelIds;
  const cards = set.apparelIds.map((id) => {
    const item = apparelById(id);
    return `<div class="card">${apparelCardSVG(id, 128, 96)}<div class="cname">${item.name}</div><div class="cslot">${item.slot}</div></div>`;
  }).join('');
  const figures = CHARACTERS.map((ch) => {
    const base = { skin: ch.style.skin, shirtBase: ch.style.shirt, capColor: ch.style.cap, hair: ch.style.hair, w: 110, h: 240 };
    const plain = golferPreviewSVG(undefined, undefined, undefined, { ...base, uid: `p${path}${uid(ch.id)}` });
    const worn = golferPreviewSVG(hatId, shirtId, pantsId, { ...base, uid: `w${path}${uid(ch.id)}` });
    return `<div class="cell"><div class="pair"><div>${plain}</div><div>${worn}</div></div><div class="lbl">${ch.shortName}</div></div>`;
  }).join('');
  return `<h2>${set.title} — <span class="setname">${set.setName}</span></h2>
    <div class="grid cards">${cards}</div>
    <div class="grid">${figures}</div>`;
}).join('');

const html = `<!doctype html><meta charset=utf8><style>
  body{margin:0;background:#0f1420;color:#cdd8ea;font:14px system-ui;padding:20px;}
  h2{margin:26px 0 10px;font-size:18px;}
  .setname{opacity:.7;font-weight:400;}
  .grid{display:flex;flex-wrap:wrap;gap:20px;}
  .cards{margin-bottom:18px;}
  .cell,.card{background:#161a24;border:1px solid #2a3346;border-radius:12px;padding:12px;}
  .pair{display:flex;gap:8px;}
  .lbl,.cname{text-align:center;margin-top:8px;font-weight:700;}
  .cslot{text-align:center;font-size:12px;opacity:.6;}
</style>${blocks}`;
writeFileSync(outHtml, html);




const browser = await launchChromium({ args: ['--no-sandbox'], wrote: outHtml });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.waitForTimeout(300);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
