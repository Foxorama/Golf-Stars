/*
 * Regenerate the PWA app icons (public/icon-{192,512,180}.png) from a vector CONSTELLATION
 * golf ball. Renders an on-theme SVG (glowing star nodes + faint constellation lines tracing a
 * golf ball's dimple lattice, on the app's deep-space bg) to PNG via the already-installed
 * Playwright/Chromium — no asset to 404, no extra dependency, deterministic. On-theme for
 * "golf amongst the stars" and consistent with the intro's star-traced wordmark.
 *
 *   node scripts/genicons.mjs public
 */
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Find the installed Chromium binary the same way tests/build.test.ts does.
function findChromium() {
  const bases = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    process.env.HOME ? `${process.env.HOME}/.cache/ms-playwright` : undefined,
  ].filter(Boolean);
  for (const base of bases) {
    let dirs;
    try { dirs = readdirSync(base).filter((x) => x.startsWith('chromium-') && !x.includes('headless')); }
    catch { continue; }
    for (const d of dirs) {
      const bin = `${base}/${d}/chrome-linux/chrome`;
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}

// Deterministic seeded RNG (mulberry32) so the background starfield is byte-stable across runs —
// same discipline as the render layer (never Math.random for anything drawn).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A glowing star node: a soft warm-white halo sprite (radial gradient) + a bright core. Matches the
// intro wordmark's "heroes glow harder" look; heroes get a fatter halo.
function star(x, y, r, hero = false) {
  const g = r * (hero ? 5.2 : 3.0);
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${g.toFixed(1)}" fill="url(#glow)"/>` +
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#ffffff"/>`;
}

// Build the CONSTELLATION golf-ball SVG: glowing star nodes tracing a golf ball's dimple lattice
// (12 stars round the circumference + a 6-star inner ring + spokes), faint linking lines, all on a
// deep-space bg with a seeded faint starfield. On-theme for "golf amongst the stars".
function ballSVG(size) {
  const cx = size / 2, cy = size / 2;
  const R = size * 0.30;          // constellation radius (leaves a safe margin for masked icons)
  const hr = R * 0.42;            // inner ring radius
  const sw = Math.max(1, size / 200); // base scale unit (stroke + star size)
  const N = 12, HN = 6;

  // outer ring (the ball's circumference) + inner hex ring (the dimple-pattern hint)
  const ring = [], hex = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    ring.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
  }
  for (let i = 0; i < HN; i++) {
    const a = (i / HN) * Math.PI * 2 - Math.PI / 2;
    hex.push([cx + Math.cos(a) * hr, cy + Math.sin(a) * hr]);
  }

  const line = (p, q, op) =>
    `<line x1="${p[0].toFixed(1)}" y1="${p[1].toFixed(1)}" x2="${q[0].toFixed(1)}" y2="${q[1].toFixed(1)}" stroke="#bcd0ff" stroke-opacity="${op}" stroke-width="${sw.toFixed(2)}"/>`;
  const lines = [];
  for (let i = 0; i < N; i++) lines.push(line(ring[i], ring[(i + 1) % N], 0.32));        // circumference
  for (let i = 0; i < HN; i++) lines.push(line(hex[i], hex[(i + 1) % HN], 0.32));        // inner ring
  for (let i = 0; i < HN; i++) lines.push(line(hex[i], ring[i * 2], 0.28));              // spokes

  // faint background starfield (seeded, stable)
  const rng = mulberry32(0x90105 + size);
  const field = [];
  for (let i = 0; i < 60; i++) {
    const x = rng() * size, y = rng() * size, rad = 0.4 + rng() * 1.2, op = 0.12 + rng() * 0.42;
    field.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}" fill="#cdd7ea" opacity="${op.toFixed(2)}"/>`);
  }

  const ringStars = ring.map((p, i) => star(p[0], p[1], sw * 2.2, i % 3 === 0)).join('');
  const hexStars = hex.map((p) => star(p[0], p[1], sw * 1.7)).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="80%">
      <stop offset="0%" stop-color="#161a24"/>
      <stop offset="60%" stop-color="#0e1118"/>
      <stop offset="100%" stop-color="#0b0d12"/>
    </radialGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff8e6" stop-opacity="0.95"/>
      <stop offset="35%" stop-color="#ffe9b0" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#ffe9b0" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  ${field.join('')}
  ${lines.join('')}
  ${ringStars}${hexStars}
</svg>`;
}

const chrome = findChromium();
if (!chrome) { console.error('No Chromium found'); process.exit(1); }
const { chromium } = await import('playwright-core');
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: chrome, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
try {
  const page = await browser.newPage();
  const sizes = [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-180.png', 180], // apple-touch
  ];
  for (const [name, size] of sizes) {
    const svg = ballSVG(size);
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;padding:0;">${svg}</body></html>`,
      { waitUntil: 'load' },
    );
    const el = await page.$('svg');
    const buf = await el.screenshot({ omitBackground: false });
    writeFileSync(resolve(out, name), buf);
    console.log('wrote', name, size + 'x' + size, buf.length + 'b');
  }
} finally {
  await browser.close();
}
