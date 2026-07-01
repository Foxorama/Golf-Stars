import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

function findChromium() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', `${homedir()}/AppData/Local/ms-playwright`].filter(Boolean);
  for (const base of bases) {
    let dirs;
    try { dirs = readdirSync(base).filter((x) => x.startsWith('chromium-') && !x.includes('headless')); } catch { continue; }
    for (const d of dirs) for (const bin of [`${base}/${d}/chrome-linux/chrome`]) if (existsSync(bin)) return bin;
  }
  return null;
}

const entry = `
import { golferPreviewSVG } from './src/render/apparelArt';
import { clubhouseLoungeHTML } from './src/render/clubhouseLounge';

const stage = golferPreviewSVG('cap-classic','polo-classic','trousers-classic',{skin:'#f0c49a',shirtBase:'#3f7fd0',w:150,h:210});
const small = golferPreviewSVG('tophat-ace','tee-striped','trousers-classic',{skin:'#e6b98a',shirtBase:'#c65a4a',w:66,h:84});
const golfers = [
  {id:'a',shortName:'Fade',capColor:'#d8a24a',hatId:'cap-classic',shirtId:'polo-classic',pantsId:'trousers-classic',skin:'#f0c49a',shirtBase:'#3f7fd0'},
  {id:'b',shortName:'Hook',capColor:'#5fd6ff',hatId:'crown-supernova',shirtId:'suit-supernova',pantsId:'leggings-supernova',skin:'#c98a5a',shirtBase:'#9b6fd4'},
  {id:'c',shortName:'Draw',capColor:'#5fd45a',hatId:'helmet-astro',shirtId:'suit-space',pantsId:'pants-astro',skin:'#e6b98a',shirtBase:'#4fae8a'},
  {id:'d',shortName:'Punch',capColor:'#ff6b4a',hatId:'bucket-safari',shirtId:'tee-striped',pantsId:undefined,skin:'#a8683f',shirtBase:'#c65a4a'},
];
document.body.innerHTML =
  '<h2 style="font-family:sans-serif;color:#eee">Stage figure (h=210) — should have arms</h2>' +
  '<div style="background:#1a2233;display:inline-block;padding:10px;">'+stage+'</div>' +
  '<h2 style="font-family:sans-serif;color:#eee">Lounge-size figure (h=84)</h2>' +
  '<div style="background:#1a2233;display:inline-block;padding:10px;">'+small+'</div>' +
  '<h2 style="font-family:sans-serif;color:#eee">Full lounge</h2>' +
  '<div style="max-width:680px;">'+clubhouseLoungeHTML(golfers, 3)+'</div>';
`;

const result = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'iife', write: false, platform: 'browser' });
const html = `<!doctype html><html><head><meta charset="utf8"></head><body style="margin:0;padding:16px;background:#0b0d12;"><script>${result.outputFiles[0].text}</script></body></html>`;
const pngPath = '/tmp/claude-0/-home-user-Golf-Stars/c2e80cf9-b04d-5487-875c-7064000a2dda/scratchpad/clubhouse-preview.png';
try {
  const exe = findChromium();
  if (!exe) throw new Error('no chromium');
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: pngPath, fullPage: true });
  await browser.close();
  console.log('wrote ' + pngPath);
} catch (e) { console.log('(screenshot skipped: ' + e.message + ')'); }
