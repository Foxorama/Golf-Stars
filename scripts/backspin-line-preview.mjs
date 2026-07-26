// One-off eyeball: render a WEDGE approach onto a contoured green with the GS-backspin-line helper
// line (the predicted roll/check), across gear tiers, to a PNG. Mirrors putt-preview.mjs' machinery.
import { createServer } from 'vite';
import { writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outPng = process.env.SPIN_OUT ?? join(tmpdir(), 'gs-backspin-line.png');
const outHtml = join(tmpdir(), 'gs-backspin-line.html');
// Chromium CANDIDATES, best first (the gallery.mjs walk): full chromium per platform, then the
// headless shell (all a screenshot needs). Caller tries each in turn.
async function chromiumCandidates() {
  const { homedir } = await import('node:os');
  const bases = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    join(homedir(), 'AppData', 'Local', 'ms-playwright'),
    join(homedir(), 'Library', 'Caches', 'ms-playwright'),
    join(homedir(), '.cache', 'ms-playwright'),
  ].filter((b) => b && existsSync(b));
  const out = [];
  for (const base of bases) {
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium-') || d.includes('headless')) continue;
      for (const rel of [
        ['chrome-linux', 'chrome'],
        ['chrome-win64', 'chrome.exe'],
        ['chrome-win', 'chrome.exe'],
        ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
      ]) {
        const bin = join(base, d, ...rel);
        if (existsSync(bin)) out.push(bin);
      }
    }
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium_headless_shell-')) continue;
      for (const rel of [
        ['chrome-headless-shell-linux64', 'chrome-headless-shell'],
        ['chrome-headless-shell-win64', 'chrome-headless-shell.exe'],
        ['chrome-headless-shell-mac-x64', 'chrome-headless-shell'],
        ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell'],
      ]) {
        const bin = join(base, d, ...rel);
        if (existsSync(bin)) out.push(bin);
      }
    }
  }
  return out;
}
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const { generateCourse } = await server.ssrLoadModule('/src/sim/course/generate.ts');
const { renderHoleSVG } = await server.ssrLoadModule('/src/render/holeView.ts');
const { beginHole, previewShot, previewBackspin } = await server.ssrLoadModule('/src/sim/rpg/play.ts');
const { startingLoadout, loadoutFromPerks } = await server.ssrLoadModule('/src/sim/rpg/economy.ts');
const { dist } = await server.ssrLoadModule('/src/sim/course/contract.ts');

// A hole with a contoured green so the check curls.
let hole = generateCourse(1234).holes[0];
for (let s = 1; s < 40; s++) {
  const h = generateCourse(s).holes.find((h) => h.greenContour && h.greenContour.length);
  if (h) { hole = h; break; }
}
const G = hole.green;
const teeToG = [G[0] - hole.tee[0], G[1] - hole.tee[1]];
const L = Math.hypot(teeToG[0], teeToG[1]) || 1;
const u = [teeToG[0] / L, teeToG[1] / L];
// The ball ~40 yd short of the green centre, on the fairway — a spinning wedge that flies past + checks.
const play = { ...beginHole(hole), ball: [G[0] - u[0] * 40, G[1] - u[1] * 40], lie: 'fairway' };

const tiers = [
  ['base (short guide)', startingLoadout()],
  ['Spin Guide Card', loadoutFromPerks(['spin-guide'])],
  ['+ Fresh-Groove', loadoutFromPerks(['spin-guide', 'spin-milled'])],
  ['Trajectory Computer', loadoutFromPerks(['spin-computer', 'spin-milled'])],
];
let cells = '';
for (const [name, lo] of tiers) {
  const spray = previewShot(play, { clubId: '64', aim: 'attack', power: 1 }, lo);
  const preview = previewBackspin(play, spray, lo);
  const svg = renderHoleSVG(hole, {
    width: 300, height: 480,
    ball: play.ball, spray,
    spinPath: preview?.path, spinReadFrac: preview?.readFrac,
    biome: hole.biome, focus: play.ball, viewRadius: 32,
  });
  const rest = preview ? preview.path[preview.path.length - 1] : null;
  const check = rest ? dist(preview.landing, rest) : 0;
  cells += `<figure style="margin:0"><figcaption style="color:#ccd;font:600 11px system-ui;padding:3px 0">${name} · check ${check.toFixed(1)}y · read ${((preview?.readFrac ?? 1) * 100).toFixed(0)}%</figcaption>${svg}</figure>`;
}
const html = `<!doctype html><html><body style="margin:0;background:#0b0d12;display:grid;grid-template-columns:repeat(4,300px);gap:8px;padding:12px">${cells}</body></html>`;
writeFileSync(outHtml, html);
const candidates = await chromiumCandidates();
const { chromium } = await import('playwright-core');
let browser = null;
for (const chromePath of candidates) {
  try {
    browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
    break;
  } catch (e) {
    console.log('launch failed, trying next candidate:', chromePath, '—', String(e).split('\n')[0]);
  }
}
if (!browser) { console.log('no launchable chromium; wrote', outHtml); await server.close(); process.exit(0); }
const page = await browser.newPage({ viewport: { width: 1240, height: 520 }, deviceScaleFactor: 2 });
await page.goto('file://' + outHtml);
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
await server.close();
console.log('wrote', outPng);
