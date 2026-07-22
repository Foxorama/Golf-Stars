/*
 * Eyes-on preview of the STORY TOUR worn cosmetics (GS-story-avatar): the on-course canvas golfer
 * (`drawGolfer`) wearing each equippable Story-gear hat / bag / glove / shoe, plus a couple of full
 * kits. NOT a unit test — a visual check of the canvas art the SVG previews can't show.
 *
 *   node scripts/story-avatar-preview.mjs
 */
import { readdirSync, existsSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright-core';

function findChromium() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', `${homedir()}/AppData/Local/ms-playwright`].filter(Boolean);
  for (const base of bases) {
    let dirs;
    try { dirs = readdirSync(base).filter((x) => x.startsWith('chromium-') && !x.includes('headless')); } catch { continue; }
    for (const d of dirs) {
      for (const bin of [`${base}/${d}/chrome-linux/chrome`, `${base}/${d}/chrome-win/chrome.exe`, `${base}/${d}/chrome-win64/chrome.exe`]) {
        if (existsSync(bin)) return bin;
      }
    }
  }
  return null;
}

const entry = `
import { drawGolfer } from './src/render/golferArt';
import { STORY_GEAR } from './src/sim/rpg/storyGear';

const BASE = { cap: '#19b2a6', shirt: '#138f86', skin: '#6b4a32', build: 1 };
const SLOT_KEY = { hat: 'hat', bag: 'bag', glove: 'glove', shoes: 'shoes', shaft: 'clubSkin' };

function tile(look, label, poses) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:inline-block;text-align:center;margin:5px;background:#0b0d12;border:1px solid #2a3550;border-radius:10px;padding:6px;';
  const row = document.createElement('div');
  for (const [swing, follow] of poses) {
    const cv = document.createElement('canvas');
    cv.width = 150; cv.height = 190;
    const ctx = cv.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 190);
    g.addColorStop(0, '#0f2a44'); g.addColorStop(1, '#123c22');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 150, 190);
    ctx.fillStyle = '#1c4a2c'; ctx.fillRect(0, 152, 150, 40);
    drawGolfer(ctx, 82, 152, 118, swing, follow, 1, look, false);
    row.appendChild(cv);
  }
  wrap.appendChild(row);
  const cap = document.createElement('div');
  cap.style.cssText = 'font-family:sans-serif;color:#eee;font-size:11px;margin-top:3px;';
  cap.textContent = label;
  wrap.appendChild(cap);
  return wrap;
}

const POSES = [[0, 0], [0.72, 0]]; // address + mid-downswing (glove tracks the hands)

function section(title) {
  const h = document.createElement('h2');
  h.style.cssText = 'font-family:sans-serif;color:#9fd;margin:14px 6px 2px;';
  h.textContent = title;
  document.body.appendChild(h);
}

section('Default (no Story gear) vs a full kit');
const row0 = document.createElement('div'); row0.style.display = 'flex'; row0.style.flexWrap = 'wrap';
row0.appendChild(tile({ ...BASE }, 'DEFAULT — no gear', POSES));
const kitA = { ...BASE };
for (const id of ['gear:hat:oracle', 'gear:glove:power', 'gear:shoes:anchor', 'gear:bag:cosmic', 'gear:shaft:nova']) {
  const it = STORY_GEAR.find((g) => g.id === id); if (it?.avatar) kitA[SLOT_KEY[it.slot]] = it.avatar;
}
row0.appendChild(tile(kitA, 'Full legendary kit', POSES));
const kitB = { ...BASE };
for (const id of ['gear:hat:cowl', 'gear:glove:shed', 'gear:shoes:coil', 'gear:bag:lucky']) {
  const it = STORY_GEAR.find((g) => g.id === id); if (it?.avatar) kitB[SLOT_KEY[it.slot]] = it.avatar;
}
row0.appendChild(tile(kitB, 'Herald cursed kit', POSES));
document.body.appendChild(row0);

for (const slot of ['hat', 'glove', 'shoes', 'bag', 'shaft']) {
  section(slot.toUpperCase());
  const row = document.createElement('div'); row.style.display = 'flex'; row.style.flexWrap = 'wrap';
  for (const g of STORY_GEAR) {
    if (g.slot !== slot || !g.avatar) continue;
    row.appendChild(tile({ ...BASE, [SLOT_KEY[slot]]: g.avatar }, g.name + ' · ' + g.rarity, POSES));
  }
  document.body.appendChild(row);
}

// BALL TRACERS — a sample flight arc per equipped ball, mirroring playView's flight-trail render.
section('BALL TRACER (sample flight arc)');
const trow = document.createElement('div'); trow.style.display = 'flex'; trow.style.flexWrap = 'wrap';
function tracerArc(look, label) {
  const cv = document.createElement('canvas');
  cv.width = 230; cv.height = 130;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 130);
  g.addColorStop(0, '#0a1830'); g.addColorStop(1, '#0d2a18');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 230, 130);
  ctx.fillStyle = '#1c4a2c'; ctx.fillRect(0, 112, 230, 18);
  const pts = [];
  for (let t = 0; t <= 1.001; t += 0.025) pts.push([16 + t * 198, 112 - Math.sin(t * Math.PI) * 84]);
  const comet = look.shape === 'comet';
  const fiery = look.shape === 'ember' || look.shape === 'spark';
  const trace = () => { ctx.beginPath(); pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]))); };
  ctx.save();
  ctx.lineCap = 'round';
  if (look.glow || comet) { ctx.globalAlpha = 0.24; ctx.strokeStyle = look.glow || look.color; ctx.lineWidth = comet ? 6.5 : 5; trace(); ctx.stroke(); }
  ctx.globalAlpha = 0.85; ctx.strokeStyle = look.color; ctx.lineWidth = comet ? 2.8 : 2; trace(); ctx.stroke();
  if (fiery) { ctx.fillStyle = look.accent || look.color; for (let i = 0; i < pts.length; i += 2) { ctx.globalAlpha = 0.5; const p = pts[i]; ctx.beginPath(); ctx.arc(p[0], p[1], look.shape === 'ember' ? 1.6 : 1.1, 0, Math.PI * 2); ctx.fill(); } }
  ctx.restore();
  const end = pts[pts.length - 1];
  if (look.glow) { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = look.glow; ctx.beginPath(); ctx.arc(end[0], end[1], 5.4, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(end[0], end[1], 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:inline-block;text-align:center;margin:5px;background:#0b0d12;border:1px solid #2a3550;border-radius:10px;padding:6px;';
  wrap.appendChild(cv);
  const cap = document.createElement('div');
  cap.style.cssText = 'font-family:sans-serif;color:#eee;font-size:11px;margin-top:3px;';
  cap.textContent = label;
  wrap.appendChild(cap);
  return wrap;
}
for (const b of STORY_GEAR) {
  if (b.slot !== 'ball' || !b.avatar) continue;
  trow.appendChild(tracerArc(b.avatar, b.name + ' · ' + b.rarity));
}
document.body.appendChild(trow);
`;

const result = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'iife', write: false, platform: 'browser',
});
const js = result.outputFiles[0].text;
const html = `<!doctype html><html><head><meta charset="utf8"></head><body style="margin:0;padding:16px;background:#0b0d12;"><script>${js}</script></body></html>`;
const htmlPath = join(tmpdir(), 'story-avatar-preview.html');
const pngPath = join(tmpdir(), 'story-avatar-preview.png');
writeFileSync(htmlPath, html);
console.log('wrote ' + htmlPath);

try {
  const exe = findChromium();
  if (!exe) throw new Error('no chromium');
  const browser = await chromium.launch({ executablePath: exe });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: pngPath, fullPage: true });
  await browser.close();
  console.log('wrote ' + pngPath);
} catch (e) {
  console.log('(screenshot skipped — browser launch unavailable here: ' + e.message + ')');
}
