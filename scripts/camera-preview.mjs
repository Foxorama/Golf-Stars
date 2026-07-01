// One-off eyeball: compare the decision-map framing at the OLD focusBias (0.72) vs the NEW (0.84)
// for a full driver off the tee, with the top info-chip HUD + bottom control panel drawn to scale so
// you can see whether the max-distance shot's landing clears the HUD without a manual zoom-out.
// Mirrors putt-preview.mjs' vite-node + chromium machinery.
import { createServer } from 'vite';
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outPng = process.env.CAM_OUT ?? join(tmpdir(), 'gs-camera.png');
const outHtml = join(tmpdir(), 'gs-camera.html');
async function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (!d.startsWith('chromium-') || d.includes('headless')) continue;
    const bin = join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(bin)) return bin;
  }
  return null;
}
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
const { pinOf } = await server.ssrLoadModule('/src/sim/round.ts');
const { previewShot } = await server.ssrLoadModule('/src/sim/rpg/play.ts');
const { startRun } = await server.ssrLoadModule('/src/sim/rpg/run.ts');

const DMAP_W = 360, DMAP_H = 640;
const decisionReach = (carryHigh) => Math.max(30, carryHigh * 0.36);

// A fresh run for a real loadout + a generated course; pick a long par-4/5 to drive.
const run = startRun(20260701);
const course = generateCourse(20260701, { holes: 12, distanceFromStart: 10, biome: 'verdant-station' });
const hole = course.holes.filter((h) => h.par >= 4).sort((a, b) => Math.hypot(b.green[0] - b.tee[0], b.green[1] - b.tee[1]) - Math.hypot(a.green[0] - a.tee[0], a.green[1] - a.tee[1]))[0] ?? course.holes[0];
const ball = hole.tee;
const pin = pinOf(hole);
const up = [pin[0] - ball[0], pin[1] - ball[1]];
// Full-power driver (the longest club) — the max-distance case the user cares about.
const driver = run.loadout.bag.reduce((a, c) => (c.carry > a.carry ? c : a));
const play = { hole, ball, lie: 'tee', shots: [], putts: [] };
const spray = previewShot(play, { clubId: driver.id, aim: 'attack', power: 1 }, run.loadout);
const reach = decisionReach(spray.carryHigh);

// Overlay the HUD chip (top) + control panel (bottom) at their real screen fractions so the framing
// is judged against what actually occludes the map. Fractions from index.html's full-bleed layout.
function overlay() {
  return `
    <div style="position:absolute;left:0;right:0;top:0;height:9%;background:rgba(10,13,19,.62);
      border-bottom:1px dashed #f5a;color:#fdd;font:600 9px system-ui;padding:3px 5px;box-sizing:border-box;">top info-chip HUD</div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:11%;background:rgba(10,13,19,.62);
      border-top:1px dashed #5cf;color:#dff;font:600 9px system-ui;padding:3px 5px;box-sizing:border-box;display:flex;align-items:flex-end;">bottom control panel</div>`;
}

let cells = '';
for (const [bias, label] of [[0.72, 'OLD focusBias 0.72'], [0.84, 'NEW focusBias 0.84']]) {
  const svg = renderHoleSVG(hole, {
    width: DMAP_W, height: DMAP_H, biome: 'verdant-station', ball, spray,
    focus: ball, viewRadius: reach, focusBias: bias, up,
  });
  cells += `<figure style="margin:0">
    <figcaption style="color:#ccd;font:600 12px system-ui;padding:4px 0">${label} · driver ${Math.round(spray.carryLow)}–${Math.round(spray.carryHigh)}y · reach ${Math.round(reach)}y</figcaption>
    <div style="position:relative;width:${DMAP_W}px;height:${DMAP_H}px;overflow:hidden;border-radius:10px;">${svg}${overlay()}</div>
  </figure>`;
}

const html = `<!doctype html><meta charset=utf8><body style="margin:0;background:#0b0d12;display:flex;gap:16px;padding:16px;">${cells}</body>`;
writeFileSync(outHtml, html);

const chromePath = await findChromium();
const { chromium: pw } = await import('playwright-core');
const browser = await pw.launch({ executablePath: chromePath ?? undefined, args: ['--no-sandbox'] });
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.waitForTimeout(300);
const el = await page.$('body');
await el.screenshot({ path: outPng });
await browser.close();
await server.close();
console.log('wrote', outPng);
