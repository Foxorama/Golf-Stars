// One-off eyeball: render a few PUTT scenes (sloped green + the predicted break line) to a PNG so the
// GS-greens-3 putting UI can be verified. Mirrors gallery.mjs' vite-node + chromium machinery.
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';

const outPng = process.env.PUTT_OUT ?? join(tmpdir(), 'gs-putt.png');
const outHtml = join(tmpdir(), 'gs-putt.html');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
const { puttPathPreview, idealPuttAim, MANUAL_IDEAL_PACE, DEFAULT_PUTT_RANGE, pinOf } = await server.ssrLoadModule('/src/sim/round.ts');

let cells = '';
for (const [biome, label] of [['ice-ring', 'Frost (steep)'], ['verdant-station', 'Verdant'], ['crystal-spires', 'Crystal']]) {
  const holes = generateCourse(20260629, { holes: 12, distanceFromStart: 10, biome }).holes;
  for (const hole of holes.slice(0, 3)) {
    const pin = pinOf(hole);
    const slope = hole.greenSlope;
    const contour = hole.greenContour; // GS-green-contour: lobes fold into the read + the drawn line
    // A LONG putt (~16 yds) so both the break AND the GS-putt-depth read-fade past the putter range show.
    const len = 16;
    const ball = [pin[0] + (slope ? slope[1] : 0) * 9 - 1, pin[1] - len];
    const aim = idealPuttAim(ball, pin, slope, contour); // draw the Mole's read
    const path = puttPathPreview(ball, pin, slope, aim, MANUAL_IDEAL_PACE, contour);
    const dist = Math.hypot(pin[0] - ball[0], pin[1] - ball[1]);
    const readFrac = Math.min(1, DEFAULT_PUTT_RANGE / dist); // base putter: reads confidently only ~6.5y
    const mid = [(ball[0] + pin[0]) / 2, (ball[1] + pin[1]) / 2];
    const svg = renderHoleSVG(hole, {
      width: 260, height: 360, biome, ball,
      focus: mid, viewRadius: Math.max(9, dist * 0.62), focusBias: 0.5,
      up: [pin[0] - ball[0], pin[1] - ball[1]],
      puttPath: path,
      puttReadFrac: readFrac,
    });
    const mag = slope ? Math.hypot(slope[0], slope[1]).toFixed(2) : '0';
    cells += `<figure style="margin:0"><figcaption style="color:#ccd;font:600 11px system-ui;padding:3px 0">${label} · slope ${mag} · ${dist.toFixed(0)}y putt · read ${(readFrac * 100).toFixed(0)}%</figcaption>${svg}</figure>`;
  }
}
const html = `<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(3,260px);gap:8px;padding:12px">${cells}</body></html>`;
writeFileSync(outHtml, html);

const browser = await launchChromium({ args: ['--no-sandbox'], wrote: outHtml });

const page = await browser.newPage({ viewport: { width: 850, height: 1180 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
