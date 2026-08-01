// EYES-ON: the CUP and the FLAGSTICK at the six cameras the game actually plays at (GS-cup-real).
//
// The hole is the one piece of art whose size is decided by two different exaggerations arguing —
// the sim's 1.2-yard catch radius on one side, the deliberately-oversized drawn ball on the other —
// and neither number tells you what it LOOKS like next to the green. So render it: fairway decide /
// fairway watch / chip decide / chip watch / green / green make, at the view radii those states
// frame at, with the ball where it would be.
//
//   node scripts/cup-preview.mjs            (writes a PNG to the temp dir; CUP_OUT=… to place it)
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outPng = process.env.CUP_OUT ?? join(tmpdir(), 'gs-cup.png');
const outHtml = join(tmpdir(), 'gs-cup.html');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
const { pinOf } = await server.ssrLoadModule('/src/sim/round.ts');
const { cupRadiusPx, ballRadiusPx } = await server.ssrLoadModule('/src/render/ball.ts');

// The DESIGN frame (GS-play-fullframe) — render at the size the game composes at, or the px/yd the
// panels are labelled with is not the px/yd the player's cup is drawn at.
const W = 360;
const H = 640;
// The play cameras, as the app frames them: a decision view is sized to the shot's reach, a putt to
// the ball↔cup span (app.ts `decisionReach` / `puttViewRadius`). `viewRadius` → px/yd is the
// projector's own `min((w-48)/2R, (h-48)/2R)`, so these are the scales the painter really sees.
const VIEWS = [
  ['Fairway decide', 150, 150],
  ['Fairway watch', 60, 60],
  ['Chip decide', 22, 22],
  ['Chip watch', 12, 12],
  ['Green (20yd putt)', 15, 20],
  ['Green make (3ft)', 5.5, 1],
];

let cells = '';
for (const [biome, label] of [['verdant-station', 'Verdant'], ['links-world', 'Links']]) {
  const hole = generateCourse(20260801, { holes: 6, distanceFromStart: 8, biome }).holes[2];
  const pin = pinOf(hole);
  for (const [name, radius, ballYd] of VIEWS) {
    const ball = [pin[0] + ballYd * 0.35, pin[1] - ballYd * 0.94];
    const mid = [(ball[0] + pin[0]) / 2, (ball[1] + pin[1]) / 2];
    const svg = renderHoleSVG(hole, {
      width: W, height: H, biome, ball,
      focus: mid, viewRadius: radius, focusBias: 0.5,
      up: [pin[0] - ball[0], pin[1] - ball[1]],
    });
    // Report the two radii in the same breath — the whole bug was them disagreeing about scale.
    const scale = Math.min((W - 48) / (2 * Math.max(10, radius)), (H - 48) / (2 * Math.max(10, radius)));
    const cup = cupRadiusPx(scale);
    const cap = `${label} · ${name}<br>${scale.toFixed(1)} px/yd · cup r${cup.toFixed(1)} (${((2 * cup) / scale).toFixed(2)}yd wide) · ball r${ballRadiusPx(scale).toFixed(1)}`;
    cells += `<figure style="margin:0"><figcaption style="color:#ccd;font:600 10px system-ui;padding:3px 0;line-height:1.35">${cap}</figcaption>${svg}</figure>`;
  }
}
const html = `<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(3,${W}px);gap:8px;padding:12px">${cells}</body></html>`;
writeFileSync(outHtml, html);

const browser = await launchChromium({ args: ['--no-sandbox'], wrote: outHtml });
const page = await browser.newPage({ viewport: { width: 1140, height: 1420 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
