// Rasterise the store-page banner + page sky for the itch.io project page.
//
// The banner REPLACES the page title on itch, so it has to carry the wordmark itself — and it is
// scaled to the page's content column, so it is drawn oversized and shrunk rather than sized to a
// spec itch does not publish. Transparent background, so it composites onto whatever the page
// theme is painted with (the star tile below) rather than carrying an edge of its own.
//
// The type is the title screen's own `.gs-hero-title` treatment (index.html) scaled up — same face,
// same letter-spacing, same green/gold glow — so the store page and the first screen of the game
// are visibly one thing. Stars are seeded (mulberry32), never Math.random, so re-shooting the
// banner produces the identical image.
//
// THE STORE PAGE IS THREE SKIES AND THEY HAVE TO BE ONE (GS-itch-page-sky): the banner's, the
// page's, and the game's. The page's used to be a flat colour swatch, so the banner floated on
// nothing and the embed — a black game on a black page — had no edge to be seen against. See the
// tile block below for what fixes each half.
//
//   node scripts/banner.mjs        → assets/itch/*.png
//   BANNER_OUT=/path/dir node ...  → writes there instead
//
// UPLOADS, and the itch theme settings each one needs:
//   banner.png    → Banner.      Align: Center.
//   page-sky.png  → Background.  Align: Center, **Fixed: on**, Repeat: Both.
//                   `Fixed` is not cosmetic — it is what makes the nebulae possible at all. See
//                   the sky block below.
//   embed-bg.png  → Embed BG (or Background, if you would rather have stars WITHOUT the colour —
//                   it is the same sky with the washes left out). Colours: #11141b.
//
// Also writes four eyes-on previews that are never uploaded — banner-preview (the banner on its
// real background), seam-preview / sky-seam-preview (each tile repeated 2x2 with the joins ruled),
// and page-preview (the whole store page as itch assembles it, embed included).
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

// ── The page background: a SEAMLESS starfield tile (GS-itch-page-sky) ────────────────────────
// This used to be a flat 256px swatch of `--gs-bg` — a colour, not a picture. The banner above it
// has a starfield and the game inside it has a starfield, so the page between them was the only
// flat-black band on the whole store page: the banner had no sky to sit in and the embed had no
// edge, because a black game on a black page has nothing to be an edge against.
//
// Same visual language as the banner (same star radii, same alpha range, the same `#9fd8e6`
// constellation links at a lower opacity) so the two read as ONE sky rather than two starfields
// that happen to be adjacent. Star TINTS come from the star map's own `STAR_TINTS` weighting —
// mostly white, with the odd blue-white giant, warm sun and red one — so the page sky is the same
// sky the player flies through.
//
// TWO properties make it usable as a repeating background, and both are easy to get wrong:
//
//   * SEAMLESS. Every star and every link is emitted at all NINE (dx,dy) offsets of ±TILE, so a
//     star near an edge appears on the opposite edge too and the joins are invisible. The link
//     search uses TOROIDAL distance and draws along the WRAPPED delta — without that, two stars
//     that are neighbours ACROSS an edge are found as far-apart pairs and the tile gets a long
//     line ruled across its middle instead of a figure that continues into the next tile.
//   * NOT OBVIOUSLY REPEATED. A big tile and no large features. Density is deliberately below the
//     banner's (~1 star per 4200px² vs ~1 per 3000px²): the banner is a strip you look AT, this is
//     a field the page's body text sits ON, and alpha is capped for the same reason.
//
// THE PAGE SKY IS ONE STEP LIGHTER THAN THE GAME, AND THAT IS WHAT GIVES THE EMBED AN EDGE. The
// embed is an iframe: nothing on the store page can draw a border around it, and the game's own
// root is `--gs-bg`. So a page painted the same `--gs-bg` produces a black rectangle on black —
// the embed reads as a hole in the page rather than as a screen set into it. `PAGE_BG` is the
// app's own `--gs-bg-2` (#11141b, the card fill), so the relationship is one the game already
// uses rather than a colour picked by eye, and the embed becomes the darkest thing on the page:
// recessed, defined on all four sides, with no border to align or to look drawn on.
// COLOUR IS BOUGHT WITH `Fixed`, NOT WITH A BIGGER TILE. A nebula is a large soft feature, and a
// large soft feature is exactly what makes a repeating background read as wallpaper — so on a tile
// alone, subdued colour is not really available. itch's Background has a **Fixed** checkbox
// (`background-attachment: fixed`), which paints the image against the VIEWPORT rather than the
// document: one image, one screen, and the page scrolls over it. At 2560x1440 that covers a whole
// desktop viewport with a single copy, so `page-sky.png` can carry real nebulae with no repetition
// to see. It is still built SEAMLESS — nebulae wrapped exactly like the stars — so the ultrawide
// case, and anyone who leaves Repeat on, degrades to an invisible join instead of a hard edge.
const PAGE_BG = '#11141b'; // --gs-bg-2
// The star map's weighting (src/render/starTourMap.ts STAR_TINTS) — white dominates by repetition.
const STAR_TINTS = ['#ffffff', '#ffffff', '#ffffff', '#dbe6ff', '#bcd4ff', '#fff0cf', '#ffd8a8', '#ffc0b0'];
// The star map's own deep-space washes (starTourMap.ts nebulaClouds HUES), so the page sky is
// tinted by the same palette the chart is. Its stop alphas (0.30/0.14) are for a chart you look
// AT; these are dialled to roughly a third of that for a field the page's body text sits ON.
const NEB_HUES = [
  ['#3b6bd6', '#7f3bd6'], // blue → violet
  ['#2fa39a', '#1f5f8a'], // teal → deep blue
  ['#c23b8f', '#5a2a8a'], // magenta → purple
  ['#d67f3b', '#8a3a2a'], // amber → rust
  ['#3b8fd6', '#2a5a8a'], // sky blue
];

/**
 * One seamless sky. `nebulae` 0 gives the plain star tile; > 0 adds wrapped colour washes.
 * Every element is emitted at all nine (±w, ±h) offsets, so anything crossing an edge reappears
 * on the opposite one and the joins are invisible at any tile size.
 */
function skyHTML({ w, h, stars: starCount, nebulae = 0, seed, linkChance = 0.34, linkMaxD = 20000 }) {
  const rnd = mulberry32(seed);
  const wrapX = (d) => (d > w / 2 ? d - w : d < -w / 2 ? d + w : d);
  const wrapY = (d) => (d > h / 2 ? d - h : d < -h / 2 ? d + h : d);
  const OFF = [
    [-w, -h], [-w, 0], [-w, h],
    [0, -h], [0, 0], [0, h],
    [w, -h], [w, 0], [w, h],
  ];
  const tiled = (fn) => OFF.map(([dx, dy]) => fn(dx, dy)).join('');

  // Nebulae first, so stars sit ON the colour rather than under it.
  let defs = '';
  const clouds = [];
  for (let i = 0; i < nebulae; i++) {
    // Biased to the OUTER thirds: on a Fixed background the middle of the image is where itch's
    // ~1000px content column and the game embed sit, so colour there is colour nobody sees and
    // contrast the body text has to fight. Only a bias, never an exclusion — a hard-empty centre
    // band would stripe if the image ever does tile.
    const outer = rnd() < 0.72;
    const cx = outer ? (rnd() < 0.5 ? rnd() * 0.3 : 0.7 + rnd() * 0.3) * w : rnd() * w;
    const [a, b] = NEB_HUES[i % NEB_HUES.length];
    const id = `neb${i}`;
    defs += `<radialGradient id="${id}" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="${a}" stop-opacity="0.11"/>
      <stop offset="45%" stop-color="${b}" stop-opacity="0.055"/>
      <stop offset="100%" stop-color="${b}" stop-opacity="0"/>
    </radialGradient>`;
    clouds.push({
      cx, cy: rnd() * h,
      rx: (w * 0.16 + rnd() * w * 0.14).toFixed(0),
      ry: (h * 0.2 + rnd() * h * 0.18).toFixed(0),
      rot: (rnd() * 180).toFixed(0),
      id,
    });
  }

  const stars = [];
  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: rnd() * w, y: rnd() * h,
      r: 0.5 + rnd() * 1.4,
      a: 0.16 + rnd() * 0.42, // capped below the banner's .8 — body text reads over this
      t: STAR_TINTS[(rnd() * STAR_TINTS.length) | 0],
    });
  }
  // Nearest-neighbour links, at most one per star — the banner's rule, on a torus.
  const links = [];
  const claimed = new Set();
  for (let i = 0; i < stars.length; i++) {
    if (claimed.has(i) || rnd() > linkChance) continue;
    let best = -1;
    let bestD = linkMaxD;
    for (let j = 0; j < stars.length; j++) {
      if (j === i || claimed.has(j)) continue;
      const dx = wrapX(stars[i].x - stars[j].x);
      const dy = wrapY(stars[i].y - stars[j].y);
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = j; }
    }
    if (best < 0) continue;
    claimed.add(i);
    claimed.add(best);
    const s = stars[i];
    // The far end is placed by the WRAPPED delta, so it may sit outside the tile — the nine-fold
    // replication is what brings the continuation back in on the opposite edge.
    links.push([s, { x: s.x - wrapX(s.x - stars[best].x), y: s.y - wrapY(s.y - stars[best].y) }]);
  }

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body { margin:0; padding:0; }
  body { width:${w}px; height:${h}px; background:${PAGE_BG}; overflow:hidden; }
  svg { position:absolute; inset:0; }
</style></head><body><svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>${defs}</defs>
  ${tiled((dx, dy) =>
    clouds
      .map(
        (c) =>
          `<ellipse cx="${(c.cx + dx).toFixed(0)}" cy="${(c.cy + dy).toFixed(0)}" rx="${c.rx}" ry="${c.ry}" fill="url(#${c.id})" transform="rotate(${c.rot} ${(c.cx + dx).toFixed(0)} ${(c.cy + dy).toFixed(0)})"/>`,
      )
      .join(''),
  )}
  ${tiled((dx, dy) =>
    links
      .map(
        ([a, b]) =>
          `<line x1="${(a.x + dx).toFixed(1)}" y1="${(a.y + dy).toFixed(1)}" x2="${(b.x + dx).toFixed(1)}" y2="${(b.y + dy).toFixed(1)}" stroke="#9fd8e6" stroke-width="0.6" opacity="0.10"/>`,
      )
      .join(''),
  )}
  ${tiled((dx, dy) =>
    stars
      .map(
        (s) =>
          `<circle cx="${(s.x + dx).toFixed(1)}" cy="${(s.y + dy).toFixed(1)}" r="${s.r.toFixed(2)}" fill="${s.t}" opacity="${s.a.toFixed(2)}"/>`,
      )
      .join(''),
  )}
</svg></body></html>`;
}

const TILE = 1024;
// Density is deliberately below the banner's (~1 star per 4200px² vs ~1 per 3000px²): the banner
// is a strip you look AT, this is a field the page's body text sits ON. The panorama matches it.
const embedHTML = skyHTML({ w: TILE, h: TILE, stars: 250, seed: 20260731 });
// 1920x1080 covers the most common desktop viewport with a SINGLE copy under `Fixed`, and
// anything larger tiles into the wrap rather than hitting an edge. It stays PNG, and that is a
// measured decision, not a default: this content — smooth, dark, low-amplitude gradients — is
// JPEG's worst case. Encoded at 2560x1440, q92 came to 139 KB and q96 to 268 KB against the PNG's
// 1213 KB, and both showed obvious 8x8 blocking through the nebulae when the crop was brightened
// 3x (`mean abs err 0.51/255` sounds harmless and is not: the error is concentrated in exactly
// the smooth regions the colour lives in). Halving the pixel count instead costs nothing visible
// and lands at ~750 KB — the same order as the 311 KB banner already on the page, and a quarter
// of what the game embed itself weighs. The bulk is the gradients, not the stars: Chrome dithers
// a smooth gradient per-pixel to avoid banding, and that noise is what PNG cannot pack. Dropping
// to 1600x900 would save ~200 KB and cost exact 1080p coverage, which is not a good trade.
const SKY_W = 1920;
const SKY_H = 1080;
const skyPano = skyHTML({
  w: SKY_W, h: SKY_H,
  stars: Math.round((SKY_W * SKY_H) / 4200),
  nebulae: 7,
  seed: 20260801,
  linkMaxD: 26000,
});

// Eyes-on only, never uploaded: the tile repeated 2x2 with the seams marked, so a join that does
// not line up is obvious rather than something to squint at.
const seamHTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body { margin:0; padding:0; background:${PAGE_BG}; }
  .g { position:relative; width:${TILE}px; height:${TILE}px;
       background-image:url("__TILE__"); background-repeat:repeat; background-size:${TILE / 2}px ${TILE / 2}px; }
  .g::after { content:''; position:absolute; inset:0;
       background:linear-gradient(90deg, transparent calc(50% - 1px), #ff004455 50%, transparent calc(50% + 1px)),
                  linear-gradient(0deg, transparent calc(50% - 1px), #ff004455 50%, transparent calc(50% + 1px)); }
</style></head><body><div class="g"></div></body></html>`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });

// `dpr` is 2 for the banner (it is scaled DOWN by the page, so it wants the extra pixels) and 1
// for the tile: a repeating background is laid out at its INTRINSIC pixel size, so a 2x export
// would tile at 2048 CSS px and halve the star density itch actually shows.
async function shoot(html, width, height, file, transparent, dpr = 2, quality) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.screenshot(
    quality ? { type: 'jpeg', quality } : { omitBackground: transparent },
  );
  const path = join(outDir, file);
  writeFileSync(path, buf);
  await page.close();
  console.log(`${file}  ${width * dpr}×${height * dpr}  ${(buf.length / 1024).toFixed(0)} KB  →  ${path}`);
  return buf;
}

await shoot(bannerHTML, W, H, 'banner.png', true);
const tileBuf = await shoot(embedHTML, TILE, TILE, 'embed-bg.png', false, 1);
const skyBuf = await shoot(skyPano, SKY_W, SKY_H, 'page-sky.png', false, 1);
// Eyes-on only, never uploaded: the same banner composited over the page background it will sit
// on. A transparent PNG of pale text is unreadable in an image viewer, so judging the real thing
// means judging it on #0b0d12.
await shoot(bannerHTML.replace('background:transparent', `background:${PAGE_BG}`), W, H, 'banner-preview.png', false);

// Eyes-on only. Two checks that cannot be made by reading the tile on its own:
//   seam-preview  — the tile repeated 2x2 with the joins ruled in red. A wrap that does not line
//                   up shows as a star cut in half ON the red line.
//   page-preview  — the whole store page as itch will assemble it: banner, the tiled sky, and the
//                   600x860 embed sitting in it. The embed has no border of its own, so this is
//                   where you see whether the sky gives it an edge or swallows it.
const tileURI = `data:image/png;base64,${tileBuf.toString('base64')}`;
const skyURI = `data:image/png;base64,${skyBuf.toString('base64')}`;
await shoot(seamHTML.replace('__TILE__', tileURI), TILE, TILE, 'seam-preview.png', false, 1);
// The panorama's own seam check, at a size where a whole tile plus its wrap is visible — this is
// the one that matters, because a NEBULA that fails to wrap is a soft colour step nothing else
// would reveal, and it is much easier to get wrong than a star.
await shoot(
  seamHTML.replace('__TILE__', skyURI).replaceAll(`${TILE}px`, `${SKY_W / 2}px`).replace(`${SKY_W / 2}px ${SKY_W / 2}px`, `${SKY_W / 2}px ${SKY_H / 2}px`),
  SKY_W / 2, SKY_H / 2, 'sky-seam-preview.png', false, 1,
);

const EMBED_W = 600;
const EMBED_H = 860;
// The page preview uses the PANORAMA on `background-attachment: fixed` — itch's "Fixed" checkbox —
// because that is the combination being recommended, and a preview of a setting nobody will use is
// a preview of nothing.
const pageHTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body { margin:0; padding:0; background:${PAGE_BG}; }
  body { background-image:url("${skyURI}"); background-repeat:repeat; background-attachment:fixed;
         background-position:center;
         font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color:#c8ccd4; }
  .col { width:1000px; margin:0 auto; padding:0 0 40px; }
  .banner { display:block; width:100%; }
  .embed { width:${EMBED_W}px; height:${EMBED_H}px; margin:14px auto; background:${BG};
           display:flex; align-items:center; justify-content:center; color:#3a4150; font-size:13px;
           letter-spacing:.12em; }
  p { font-size:14px; line-height:1.6; margin:14px 0; }
  h2 { color:#5fd45a; font-size:19px; margin:26px 0 6px; }
</style></head><body>
  <div class="col">
    <img class="banner" src="__BANNER__"/>
    <div class="embed">[ 600 × 860 GAME EMBED ]</div>
    <h2>A whole galaxy of golf courses and competition</h2>
    <p>Fifteen worlds, each with its own physics and its own personality: links in the ice rings
       where the crosswind never rests, molten doglegs on the ember world, a derelict generation
       ship whose bulkheads your ball can carom off.</p>
    <p>Fly a galaxy of procedurally-generated golf courses, earn your bag, upgrade your ship, and
       find out what has been sleeping at the root of the World-Tree.</p>
  </div>
</body></html>`;
const bannerURI = `data:image/png;base64,${(await (async () => {
  const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await p.setContent(bannerHTML, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const b = await p.screenshot({ omitBackground: true });
  await p.close();
  return b;
})()).toString('base64')}`;
await shoot(pageHTML.replace('__BANNER__', bannerURI), 1200, 1400, 'page-preview.png', false, 1);

await browser.close();
await server.close();
