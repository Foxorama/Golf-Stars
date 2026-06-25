/*
 * Regenerate the PWA app icons (public/icon-{192,512,180}.png) from a vector golf-ball-planet.
 * Renders an on-theme SVG (white dimpled sphere on the app's deep-space bg) to PNG via the
 * already-installed Playwright/Chromium — no asset to 404, no extra dependency, deterministic.
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

// Build a golf-ball-planet SVG: a shaded white sphere on the app's deep-space bg, with
// foreshortened dimples clipped to the sphere. On-theme for "space golf"; no asset to 404.
function ballSVG(size, { bleed = 0.72 } = {}) {
  const cx = size / 2, cy = size / 2;
  const R = (size * bleed) / 2;
  const dimples = [];
  // Hex-ish grid of dimples across the ball, faded + shrunk near the limb (foreshorten).
  const step = R / 4.2;
  for (let gy = -5; gy <= 5; gy++) {
    for (let gx = -5; gx <= 5; gx++) {
      const x = cx + gx * step + (gy % 2 ? step / 2 : 0);
      const y = cy + gy * step * 0.92;
      const dx = (x - cx) / R, dy = (y - cy) / R;
      const r2 = dx * dx + dy * dy;
      if (r2 > 0.86) continue; // inside the sphere only
      const fore = Math.sqrt(Math.max(0, 1 - r2)); // foreshorten toward the limb
      const rr = step * 0.34 * (0.5 + 0.5 * fore);
      const op = 0.10 + 0.16 * fore;
      dimples.push(
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" fill="#0b0d12" opacity="${op.toFixed(2)}"/>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0%" stop-color="#161a24"/>
      <stop offset="100%" stop-color="#0b0d12"/>
    </radialGradient>
    <radialGradient id="ball" cx="38%" cy="32%" r="72%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="55%" stop-color="#e8edf4"/>
      <stop offset="100%" stop-color="#9aa7bd"/>
    </radialGradient>
    <clipPath id="sphere"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#ball)"/>
  <g clip-path="url(#sphere)">${dimples.join('')}</g>
  <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="${Math.max(1, size / 256)}"/>
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
