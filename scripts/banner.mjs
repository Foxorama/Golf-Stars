// Rasterise the store-page banner + embed backdrop for the itch.io project page.
//
// The banner REPLACES the page title on itch, so it has to carry the wordmark itself — and it is
// scaled to the page's content column, so it is drawn oversized and shrunk rather than sized to a
// spec itch does not publish. Transparent background: with the page theme set to the game's own
// `--gs-bg` (#0b0d12) there is no edge to line up and no colour to match.
//
// The type is the title screen's own `.gs-hero-title` treatment (index.html) scaled up — same face,
// same letter-spacing, same green/gold glow — so the store page and the first screen of the game
// are visibly one thing. Stars are seeded (mulberry32), never Math.random, so re-shooting the
// banner produces the identical image.
//
//   node scripts/banner.mjs        → assets/itch/banner.png + assets/itch/embed-bg.png
//   BANNER_OUT=/path/dir node ...  → writes there instead
//
// Pure dev tool — ships nothing, imports no game logic. Re-run after a wordmark or palette change.

import { createServer } from 'vite';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.BANNER_OUT ?? join(repoRoot, 'assets', 'itch');
mkdirSync(outDir, { recursive: true });

// THE one way this repo finds Chromium (GS-browser-test-gate) — a second copy of that lookup is
// the exact bug tests/chromium.ts exists to prevent. It is TypeScript, so it comes through vite.
const server = await createServer({
  root: repoRoot,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const { chromePath } = await server.ssrLoadModule('/tests/chromium.ts');
if (!chromePath) {
  await server.close();
  console.error('No launchable Chromium found. Set CHROME_PATH to a Chrome/Edge binary.');
  process.exit(1);
}

// The game's tokens, verbatim from index.html's :root — never re-picked by eye.
const INK = '#ecffe9'; // .gs-hero-title colour (a warmer white than --gs-ink)
const BG = '#0b0d12'; // --gs-bg
const GLOW_GREEN = 'rgba(95, 212, 90, .42)'; // --gs-accent
const GLOW_GOLD = 'rgba(255, 206, 84, .20)';

// Deliberately short. The banner sits ABOVE the playable embed, and every pixel of its height is
// pixels the game is pushed down the page — on a store page the embed is the thing worth showing
// above the fold. The tagline lives on the game's own title screen a few hundred pixels below, so
// repeating it here bought nothing but height.
const W = 1200;
const H = 240;

/** Seeded RNG — the sim's own generator, so the starfield is byte-stable across re-shoots. */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A scatter of stars, thinned out of the centre band so they never fight the wordmark for the eye.
const rng = mulberry32(20260729);
const stars = [];
for (let i = 0; i < 95; i++) {
  const x = rng() * W;
  const y = rng() * H;
  const centreBand = Math.abs(y - H * 0.5) < 58 && x > W * 0.12 && x < W * 0.88;
  if (centreBand && rng() < 0.86) continue;
  const r = 0.5 + rng() * 1.5;
  stars.push({ x, y, r, a: 0.2 + rng() * 0.6 });
}
// Faint constellation links — the intro cinematic's motif. AT MOST ONE LINK PER STAR, to its
// nearest unclaimed neighbour: linking every near pair (the obvious implementation) produces a
// dense triangulated mesh that reads as scribble, not as star figures. Sparse pairs and short
// chains are what look like a constellation.
const links = [];
const claimed = new Set();
for (let i = 0; i < stars.length; i++) {
  if (claimed.has(i) || rng() > 0.42) continue;
  let best = -1;
  let bestD = 26000; // (~160px)² — long enough to span a figure, short enough to stay legible
  for (let j = 0; j < stars.length; j++) {
    if (j === i || claimed.has(j)) continue;
    const dx = stars[i].x - stars[j].x;
    const dy = stars[i].y - stars[j].y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  if (best < 0) continue;
  claimed.add(i);
  claimed.add(best);
  links.push([stars[i], stars[best]]);
}

const starSVG = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"
     style="position:absolute;inset:0;">
  ${links
    .map(
      ([a, b]) =>
        `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#9fd8e6" stroke-width="0.6" opacity="0.16"/>`,
    )
    .join('')}
  ${stars
    .map(
      (s) =>
        `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r.toFixed(2)}" fill="#fff" opacity="${s.a.toFixed(2)}"/>`,
    )
    .join('')}
</svg>`;

const bannerHTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body { margin:0; padding:0; background:transparent; }
  .wrap {
    position:relative; width:${W}px; height:${H}px;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  /* .gs-hero-title, scaled from 34px to banner size — same colour, spacing and glow. */
  .title {
    position:relative; margin:0; font-size:96px; font-weight:700;
    letter-spacing:.045em; line-height:1.1; color:${INK};
    text-shadow: 0 0 60px ${GLOW_GREEN}, 0 0 122px ${GLOW_GOLD};
  }
  /* A DRAWN flag, not the ⛳ glyph: the emoji rasterises as a colour bitmap (red pennant on a
     green mound) that is off-palette and far heavier than the type beside it. This one is the
     game's own accent green, and it scales with the title. BOTH dimensions are set explicitly:
     a bare width:auto does not resolve the viewBox aspect on an inline SVG here, and the flag
     rendered as a lone pennant with the pole clipped away. */
  .flag { height:.88em; width:.605em; margin-right:.22em; vertical-align:-.13em;
          filter: drop-shadow(0 0 20px ${GLOW_GREEN}); }
</style></head><body>
  <div class="wrap">
    ${starSVG}
    <h1 class="title"><svg class="flag" viewBox="0 0 44 64" xmlns="http://www.w3.org/2000/svg"><rect x="12" y="4" width="3.4" height="55" rx="1.7" fill="${INK}" opacity="0.85" /><path d="M15.4 7 L41 16 L15.4 26 Z" fill="#5fd45a" /><circle cx="28" cy="55" r="4" fill="#fff" opacity="0.92" /></svg>The Far Carry</h1>
  </div>
</body></html>`;

const embedHTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body { margin:0; padding:0; }
  body { width:256px; height:256px; background:${BG}; }
</style></head><body></body></html>`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });

async function shoot(html, width, height, file, transparent) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.screenshot({ omitBackground: transparent });
  const path = join(outDir, file);
  writeFileSync(path, buf);
  await page.close();
  console.log(`${file}  ${width * 2}×${height * 2}  ${(buf.length / 1024).toFixed(0)} KB  →  ${path}`);
}

await shoot(bannerHTML, W, H, 'banner.png', true);
await shoot(embedHTML, 256, 256, 'embed-bg.png', false);
// Eyes-on only, never uploaded: the same banner composited over the page background it will sit
// on. A transparent PNG of pale text is unreadable in an image viewer, so judging the real thing
// means judging it on #0b0d12.
await shoot(bannerHTML.replace('background:transparent', `background:${BG}`), W, H, 'banner-preview.png', false);

await browser.close();
await server.close();
