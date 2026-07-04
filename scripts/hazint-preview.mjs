// Eyeball hazard INTERNALS (rake lines, depth bands) up close — render a few hazard-heavy holes big.
import { createServer } from 'vite';
import { writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const outPng = process.env.OUT ?? join(tmpdir(), 'gs-hazint.png');
async function findChromium(){const base=process.env.PLAYWRIGHT_BROWSERS_PATH??'/opt/pw-browsers';const {readdirSync}=await import('node:fs');for(const d of readdirSync(base)){if(!d.startsWith('chromium-')||d.includes('headless'))continue;const bin=join(base,d,'chrome-linux','chrome');if(existsSync(bin))return bin;}return null;}
const server=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
const {generateCourse}=await server.ssrLoadModule('/src/sim/course/generate.ts');
const {renderHoleSVG}=await server.ssrLoadModule('/src/render/holeView.ts');
const cases=[
  ['verdant-station','crux','Verdant',['water','bunker']],
  ['dust-belt','vela','Desert',['bunker','waste','sand']],
  ['ember-world','scorpius','Inferno',['lava','lavariver']],
];
let cells='';
for(const [biome,themeId,label,want] of cases){
  let picked=null;
  for(let s=0;s<300 && !picked;s++){
    const holes=generateCourse(70000+s,{holes:8,distanceFromStart:12,biome}).holes;
    picked=holes.find(h=>h.par>=4 && want.filter(w=>h.hazards.some(z=>z.kind===w)).length>=1);
  }
  if(picked){cells+=`<figure style="margin:0"><figcaption style="color:#ccd;font:600 13px system-ui">${label}</figcaption>${renderHoleSVG(picked,{width:640,height:940,biome,themeId})}</figure>`;}
}
writeFileSync(join(tmpdir(),'gs-hazint.html'),`<!doctype html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(3,640px);gap:8px;padding:12px">${cells}`);
const {chromium}=await import('playwright-core');
const browser=await chromium.launch({executablePath:await findChromium(),args:['--no-sandbox']});
const page=await browser.newPage({deviceScaleFactor:2});
await page.goto('file://'+join(tmpdir(),'gs-hazint.html'));await page.waitForTimeout(300);
await (await page.$('body')).screenshot({path:outPng});
await browser.close();await server.close();console.log('wrote',outPng);
