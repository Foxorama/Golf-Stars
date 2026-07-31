import { writeFileSync } from 'node:fs';

import { build } from 'esbuild';




const entry = `
import { golferPreviewSVG } from './src/render/apparelArt';
import { clubhouseLoungeHTML } from './src/render/clubhouseLounge';

const stageOutfits = [
  ['cap-classic','polo-classic','trousers-classic','Rookie'],
  [undefined,undefined,undefined,'Bare + signature cap'],
  ['helmet-astro','suit-space','pants-astro','Astronaut'],
  ['crown-supernova','suit-supernova','leggings-supernova','Supernova'],
  ['crown-solarflames','suit-solarflames','leggings-solarflames','Solar Flames'],
  ['crown-galaxy','suit-galaxy','leggings-galaxy','Punched Galaxy'],
  ['tophat-ace','tee-striped','knickers-ace','Gentleman mix'],
  ['bucket-safari','jersey-neon','shorts-safari','Shorts + jersey'],
  ['cap-baggy-green','jacket-green','pants-evergreen','Evergreen'],
];
const stages = stageOutfits.map(([h,s,p,l],i) =>
  '<div style="background:#1a2233;display:inline-block;padding:8px;margin:4px;text-align:center;">'
  + golferPreviewSVG(h,s,p,{skin:'#f0c49a',shirtBase:'#3f7fd0',capColor:'#d8a24a',uid:'st'+i,w:150,h:210,bagId:l==='Evergreen'?'bag-evergreen':undefined})
  + '<div style="font:12px sans-serif;color:#ccc;">'+l+'</div></div>').join('');
const small = golferPreviewSVG('tophat-ace','tee-striped','trousers-classic',{skin:'#e6b98a',shirtBase:'#c65a4a',capColor:'#ff6b4a',uid:'sm',w:66,h:88});
const golfers = [
  {id:'a',shortName:'Fade',capColor:'#d8a24a',hatId:'cap-classic',shirtId:'polo-classic',pantsId:'trousers-classic',shipId:'wagon-classic',skin:'#f0c49a',shirtBase:'#3f7fd0',hair:{style:'coils',color:'#1c1712'}},
  {id:'b',shortName:'Hook',capColor:'#5fd6ff',hatId:'crown-supernova',shirtId:'suit-supernova',pantsId:'leggings-supernova',shipId:'ufo-mothership',skin:'#c98a5a',shirtBase:'#9b6fd4',hair:{style:'sweep',color:'#14100c'}},
  {id:'c',shortName:'Draw',capColor:'#5fd45a',hatId:'helmet-astro',shirtId:'suit-space',pantsId:'pants-astro',shipId:'racer-nebula',skin:'#e6b98a',shirtBase:'#4fae8a',hair:{style:'crop',color:'#b8843f',facial:'stubble'}},
  {id:'d',shortName:'Punch',capColor:'#ff6b4a',hatId:undefined,shirtId:'tee-striped',pantsId:undefined,shipId:'moto-nitro',skin:'#a8683f',shirtBase:'#c65a4a',hair:{style:'tousled',color:'#2f2318'}},
];
document.body.innerHTML =
  '<h2 style="font-family:sans-serif;color:#eee">Stage figures (h=210)</h2>' +
  '<div style="display:flex;flex-wrap:wrap;">'+stages+'</div>' +
  '<h2 style="font-family:sans-serif;color:#eee">Lounge-size figure (h=88)</h2>' +
  '<div style="background:#1a2233;display:inline-block;padding:10px;">'+small+'</div>' +
  '<h2 style="font-family:sans-serif;color:#eee">Full lounge (visit 3)</h2>' +
  '<div style="max-width:680px;">'+clubhouseLoungeHTML(golfers, 3)+'</div>' +
  '<h2 style="font-family:sans-serif;color:#eee">Full lounge (visit 7 — reshuffled)</h2>' +
  '<div style="max-width:680px;">'+clubhouseLoungeHTML(golfers, 7)+'</div>' +
  '<h2 style="font-family:sans-serif;color:#eee">Marmot Bartender UNLOCKED — tip jar filling (4 balls)</h2>' +
  '<div style="max-width:680px;">'+clubhouseLoungeHTML(golfers, 3, true, 4)+'</div>' +
  '<h2 style="font-family:sans-serif;color:#eee">Tip jar FULL (6 = a half-dozen) — Marmot still tending bar</h2>' +
  '<div style="max-width:680px;">'+clubhouseLoungeHTML(golfers, 3, true, 6)+'</div>' +
  '<h2 style="font-family:sans-serif;color:#eee">Cashed out (7) — Marmot off playing the spaceport par-3, bar + jar empty</h2>' +
  '<div style="max-width:680px;">'+clubhouseLoungeHTML(golfers, 3, true, 7)+'</div>';
`;

const result = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'iife', write: false, platform: 'browser' });
const html = `<!doctype html><html><head><meta charset="utf8"></head><body style="margin:0;padding:16px;background:#0b0d12;"><script>${result.outputFiles[0].text}</script></body></html>`;
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';
const pngPath = process.env.CLUBHOUSE_PREVIEW_PNG ?? join(tmpdir(), 'clubhouse-preview.png');
// A failure here is LOUD (GS-preview-chromium): the old catch printed "(screenshot skipped)" and
// exited 0, so the rig reported success having drawn nothing.
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: pngPath, fullPage: true });
await browser.close();
console.log('wrote ' + pngPath);
