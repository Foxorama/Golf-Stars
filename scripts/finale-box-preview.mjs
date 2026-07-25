/*
 * GS-story-sigil5-npc / GS-story-sigil5-look — eyes-on preview of the Ch.5 finale MATCHUP BOX + partner
 * PICKER: the WARDEN lobby (you + a chosen loyal friend vs the betrayer + Malachi/Voss) and the HERALD
 * lobby (you + a chosen Coil champion — Malachi/Venoma/Scorpius — vs your two former friends). Imports the
 * REAL look functions (`corruptedLookOpts`/`championLookOpts`) so the colours never drift from the app.
 *
 *   node scripts/finale-box-preview.mjs   (OUT=/path/out.png to choose the file)
 */
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

function findChromium() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', `${homedir()}/.cache/ms-playwright`].filter(Boolean);
  for (const base of bases) {
    let dirs; try { dirs = readdirSync(base); } catch { continue; }
    for (const d of dirs) {
      if (d.startsWith('chromium-') && !d.includes('headless')) {
        const bin = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(bin)) return bin;
      }
      if (d.startsWith('chromium_headless_shell-')) {
        const bin = join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'); if (existsSync(bin)) return bin;
      }
    }
  }
  return null;
}

const entry = `
import { getCharacter } from './src/sim/rpg/characters';
import { golferPreviewSVG } from './src/render/apparelArt';
import { corruptedLookOpts, championLookOpts } from './src/sim/rpg/storyBetrayal';

function figFor(opts, uid){ return golferPreviewSVG(undefined,undefined,undefined,{...opts, uid, w:52, h:150}); }
function slotFig(inner){ return '<span class="gs-tourn-mfig">'+inner+'</span>'; }
function championFigureNew(id){ return slotFig(figFor(championLookOpts(id), 'ch'+id)); }
function friendFig(charId, corrupt, uid){
  const ch = getCharacter(charId);
  const opts = corrupt ? corruptedLookOpts(ch) : {skin:ch.style.skin, shirtBase:ch.style.shirt, capColor:ch.style.cap, hair:ch.style.hair};
  return slotFig(figFor(opts, uid));
}
function picker(label, options, chosen){
  const cards = options.map((o)=>{
    const on = o.id===chosen;
    return '<button class="gs-tourn-pp'+(on?' gs-tourn-pp--on':'')+'"><span class="gs-tourn-ppfig">'+o.fig+'</span><span class="gs-tourn-ppname">'+o.name+(on?' ✓':'')+'</span></button>';
  }).join('');
  return '<div class="gs-tourn-fieldbox"><div class="gs-tourn-fieldlabel">'+label+'</div><div class="gs-tourn-ppgrid" style="grid-template-columns:repeat('+Math.max(2,options.length)+',1fr)">'+cards+'</div></div>';
}

function box(label, youId, allyId, allyIsChampion, oppIds, betrayerId, oppLabel){
  const youFig = friendFig(youId,false,'y'+label);
  const allyFig = allyIsChampion ? championFigureNew(allyId) : friendFig(allyId,false,'a'+label);
  const oppFig = (id,i)=>{
    const isChampion = id==='venoma'||id==='voss'||id==='scorpius';
    if(isChampion) return championFigureNew(id);
    return friendFig(id, id===betrayerId, 'o'+label+i);
  };
  const nm = (id)=> (getCharacter(id)?.shortName ?? (id==='venoma'?'Venoma':id==='voss'?'Voss':id==='scorpius'?'Scorpius':id)).split(' ')[0];
  return '<div style="max-width:520px;margin:0 auto 20px"><div style="color:#9fb0c8;font:700 13px system-ui;padding:6px 2px">'+label+'</div>'+
    '<div class="gs-tourn-matchbox">'+
      '<div class="gs-tourn-mteam gs-tourn-mteam--you"><div class="gs-tourn-mlabel">Your team</div><div class="gs-tourn-mfigs">'+youFig+allyFig+'</div><div class="gs-tourn-mnames">You &amp; '+nm(allyId)+'</div></div>'+
      '<div class="gs-tourn-mvs">vs</div>'+
      '<div class="gs-tourn-mteam gs-tourn-mteam--them"><div class="gs-tourn-mlabel">'+oppLabel+'</div><div class="gs-tourn-mfigs">'+oppFig(oppIds[0],0)+oppFig(oppIds[1],1)+'</div><div class="gs-tourn-mnames">'+nm(oppIds[0])+' &amp; '+nm(oppIds[1])+'</div></div>'+
    '</div></div>';
}

const wardenPicker = picker('🤝 Choose the friend at your side — who shares your ball',
  [{id:'longshot-larry',name:'Larry',fig:friendFig('longshot-larry',false,'pkL')},{id:'backspin-bo',name:'Bo',fig:friendFig('backspin-bo',false,'pkB')}], 'longshot-larry');
const heraldPicker = picker('🐍 Choose your Coil champion — who shares your ball',
  [{id:'voss',name:'Malachai',fig:championFigureNew('voss')},{id:'venoma',name:'Venoma',fig:championFigureNew('venoma')},{id:'scorpius',name:'Scorpius',fig:championFigureNew('scorpius')}], 'voss');

document.body.innerHTML =
  '<div style="max-width:520px;margin:0 auto"><div style="color:#7fe0a0;font:800 13px system-ui;padding:6px 2px">WARDEN Ch.5 lobby — box + partner picker</div>' +
  box('', 'huang-woo-hook', 'longshot-larry', false, ['feather-fade','voss'], 'feather-fade', 'The traitor & the Apostate') + wardenPicker + '</div>' +
  '<div style="max-width:520px;margin:24px auto 0"><div style="color:#e6a6d6;font:800 13px system-ui;padding:6px 2px">HERALD Ch.5 lobby — box + champion picker</div>' +
  box('', 'huang-woo-hook', 'voss', true, ['feather-fade','longshot-larry'], null, 'Your former friends') + heraldPicker + '</div>';
`;

const TOURN_STYLE = `
  .gs-tourn-matchbox{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px;background:#0b0f18;border:1px solid #232b3b;border-radius:12px;padding:10px;}
  .gs-tourn-mteam{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 4px;border-radius:10px;}
  .gs-tourn-mteam--you{background:#122018;border:1px solid #2f6a44;}
  .gs-tourn-mteam--them{background:#1c1224;border:1px solid #5a2f56;}
  .gs-tourn-mlabel{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#8a97a8;text-align:center;}
  .gs-tourn-mteam--you .gs-tourn-mlabel{color:#7fe0a0;}
  .gs-tourn-mteam--them .gs-tourn-mlabel{color:#e6a6d6;}
  .gs-tourn-mfigs{display:flex;gap:2px;align-items:flex-end;justify-content:center;min-height:80px;}
  .gs-tourn-mfig{width:52px;filter:drop-shadow(0 4px 5px #0009);}
  .gs-tourn-mfig svg{width:100%;height:auto;display:block;}
  .gs-tourn-mfglyph{width:44px;height:80px;display:flex;align-items:center;justify-content:center;font-size:34px;}
  .gs-tourn-mport{width:58px;align-self:flex-end;filter:drop-shadow(0 3px 5px #000a);}
  .gs-tourn-mport svg{width:100%;height:auto;display:block;}
  .gs-tourn-mnames{font-size:12.5px;font-weight:800;color:#dbe4f0;white-space:nowrap;}
  .gs-tourn-mvs{font-size:13px;font-weight:900;color:#7c8aa0;font-style:italic;padding:0 2px;}
  .gs-tourn-fieldbox{background:#0b0f18;border:1px solid #232b3b;border-radius:12px;padding:10px 12px;margin-bottom:12px;}
  .gs-tourn-fieldlabel{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#7c8aa0;margin-bottom:7px;}
  .gs-tourn-ppgrid{display:grid;gap:8px;}
  .gs-tourn-pp{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px 6px;border-radius:12px;background:#0e1420;border:1px solid #283040;cursor:pointer;color:inherit;font:inherit;}
  .gs-tourn-pp--on{border-color:#2f6a44;background:#122018;box-shadow:inset 0 0 0 1px #2f6a4488,0 0 12px #2f6a4433;}
  .gs-tourn-ppfig{width:56px;height:auto;filter:drop-shadow(0 4px 5px #0009);}
  .gs-tourn-ppfig svg{width:100%;height:auto;display:block;}
  .gs-tourn-ppname{font-size:12px;font-weight:800;color:#c7d2e2;white-space:nowrap;}
  .gs-tourn-pp--on .gs-tourn-ppname{color:#9dffce;}
`;

const result = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, format: 'iife', write: false, platform: 'browser' });
const js = result.outputFiles[0].text;
const html = `<!doctype html><html><head><meta charset="utf8"><style>${TOURN_STYLE}</style></head><body style="margin:0;padding:24px;background:#0a0d12;"><script>${js}</script></body></html>`;
const outPng = process.env.OUT ?? join(tmpdir(), 'gs-finale-box.png');
const exe = findChromium();
if (!exe) { console.log('no chromium'); process.exit(0); }
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 620, height: 900 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
console.log('wrote', outPng);
