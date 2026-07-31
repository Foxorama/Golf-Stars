// Shoot the itch.io store-page screenshots from the REAL game.
//
// EVERY SHOT IS THE REAL EMBED, UNRETOUCHED. The game is composed portrait (390x844) and the itch
// embed's default desktop viewport is 820x760 — landscape and short — so the play frame is capped to
// a ~395px portrait strip (GS-play-desktop-frame) with the rest of the width left over. That
// leftover used to be flat page background, which is why GS-embed-letterbox was logged and why the
// first cut of this script matted the portrait capture onto the store page's sky by hand.
//
// It no longer needs to: GS-space-sky (#682) put the seeded star tile on `body`, so the leftover IS
// dressed space, and it is the SAME sky as the store page background and the banner (GS-itch-page-sky).
// Compositing one on top would be a second description of a background the game already draws — and
// a screenshot that flatters the game by a hair. So the portrait moments are shot at 820x760, which
// is exactly what a desktop visitor gets when they press Run game.
//
// The battle is authored landscape and stays landscape (render/battleFrame.ts only turns the arena
// when the container is taller than wide), so it is shot at 1280x720.
//
//   node scripts/screenshots.mjs                → every shot into assets/itch/shots/
//   node scripts/screenshots.mjs aim putt       → only those
//   SHOTS_OUT=/path/dir node ...                → writes there instead
//   SHOTS_SEED=12345 node ...                   → a different round (default is pinned)
//
// Requires a build first (`npx vite build`) — it drives dist/index.html over file://, the same
// artifact the browser tests drive, so what it shoots is what ships rather than a dev server.
//
// Pure dev tool: ships nothing, imports no game logic, and never writes into src/.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.SHOTS_OUT ?? join(repoRoot, 'assets', 'itch', 'shots');
const dist = join(repoRoot, 'dist', 'index.html');

// Pinned, like the clips: the sim is deterministic from a seed, so a shot can be re-taken after an
// art change and still show the same hole (the same reason a seed IS the bug report).
const SEED = process.env.SHOTS_SEED ?? '20260730';

if (!existsSync(dist)) {
  console.error(`No build at ${dist}\nRun a build first:  npx vite build`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

// THE one way this repo finds Chromium (GS-browser-test-gate) — a second copy of that lookup is the
// exact bug tests/chromium.ts exists to prevent. It is TypeScript, so it comes through vite.
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

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });

/**
 * The itch embed's default desktop viewport — the shape a visitor actually sees the game in, and
 * therefore the shape every portrait moment is shot at. Must stay >= 660 tall or `data-gs-fit`
 * flips to `tight` and the HUD sheds detail (GS-a11y-tight-fit), which would be a screenshot of a
 * layout most visitors never see.
 */
const EMBED = { width: 820, height: 760 };
/** The battle is authored landscape; 16:9 is the shape it composes to. */
const WIDE = { width: 1280, height: 720 };
/** Retina: itch serves the file as-is and browsers downscale it cleanly. */
const SCALE = 2;

const url = (params) => 'file://' + dist + '?' + new URLSearchParams({ seed: SEED, ...params }).toString();

const booted = (page) =>
  page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 15000 });

/** Click the first button whose text matches — the tests' own idiom, resilient to markup moves. */
const clickText = async (page, re) => {
  await page.waitForFunction(
    (src) => [...document.querySelectorAll('button')].some((b) => new RegExp(src).test(b.textContent || '')),
    re.source,
    { timeout: 15000 },
  );
  await page.evaluate(
    (src) => [...document.querySelectorAll('button')].find((b) => new RegExp(src).test(b.textContent || ''))?.click(),
    re.source,
  );
};

const wait = (page, ms) => page.waitForTimeout(ms);

/** Shoot one moment. */
async function shoot(name, drive, { wide = false } = {}) {
  const ctx = await browser.newContext({ viewport: wide ? WIDE : EMBED, deviceScaleFactor: SCALE });
  const page = await ctx.newPage();
  const outPath = join(outDir, `${name}.png`);
  try {
    const note = (await drive(page)) ?? '';
    writeFileSync(outPath, await page.screenshot());
    const kb = (readFileSync(outPath).length / 1024).toFixed(0);
    console.log(`  ${name}.png  ${kb} KB${note ? `  · ${note}` : ''}`);
  } catch (e) {
    // Reported loudly: a screenshot of a stalled title screen is a valid PNG, and nobody opens six
    // files to find out which one never got where it was going.
    console.error(`  ${name}: ⚠ ${e.message}`);
  }
  await ctx.close();
}

// ── the moments ──────────────────────────────────────────────────────────────────────────────────

/** Common opening: boot past the intro, take the Voyage with the first golfer, reach the first tee. */
async function toFirstTee(page, { fastShots = true } = {}) {
  if (fastShots) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('fc_settings', JSON.stringify({ fastShots: true }));
      } catch {
        /* a denied store just means the result cards stay up — the drive still works */
      }
    });
  }
  await page.goto(url({ intro: '0' }), { waitUntil: 'load' });
  await booted(page);
  await page.evaluate(() => document.querySelector('.gs-navtile')?.click()); // The Voyage
  await page.waitForSelector('.gs-charcard', { timeout: 15000 });
  await page.evaluate(() => document.querySelector('.gs-charcard')?.click());
  await clickText(page, /First Tee/);
  await clickText(page, /Tee Off/);
  await page.waitForSelector('[data-swing]', { timeout: 15000 });
}

/** The signature shot: standing on the tee with the aim cone open across the hole. */
async function driveAim(page) {
  await toFirstTee(page);
  await wait(page, 2500); // let the camera settle and the cone finish drawing
  return 'tee, aim cone open';
}

/** The green: contours, break read, pace meter. Swing until a putt is on offer. */
async function drivePutt(page) {
  await toFirstTee(page);
  const live = () =>
    page.evaluate(() => {
      const el = (s) => document.querySelector(s);
      if (el('[data-putt-commit]') && !el('[data-putt-commit]').disabled) return 'putt';
      if (el('[data-swing]') && !el('[data-swing]').disabled) return 'swing';
      return null;
    });
  for (let i = 0; i < 12; i++) {
    const kind = await page
      .waitForFunction(
        () => {
          const el = (s) => document.querySelector(s);
          const p = el('[data-putt-commit]');
          const s = el('[data-swing]');
          return (p && !p.disabled) || (s && !s.disabled) ? true : null;
        },
        null,
        { timeout: 12000 },
      )
      .then(() => live())
      .catch(() => null);
    if (!kind) break;
    if (kind === 'putt') {
      await wait(page, 1800); // sit on the read — the break line and meter are the point
      return 'on the green, reading the putt';
    }
    await page.evaluate(() => document.querySelector('[data-swing]')?.click());
    await wait(page, 3500); // flight + run-out
  }
  return '⚠ never reached a putt';
}

/** The free-roam chart with the ship on it. Deep-linked (GS-screen-deeplink). */
async function driveStarMap(page) {
  await page.goto(url({ intro: '0', screen: 'startour' }), { waitUntil: 'load' });
  await booted(page);
  await wait(page, 1200);
  if (await page.evaluate(() => !!document.querySelector('.gs-charcard'))) {
    await page.evaluate(() => document.querySelector('.gs-charcard')?.click());
    await wait(page, 1500);
  }
  // Send the ship somewhere so the shot catches it mid-flight with its trail lit, not parked.
  // The chart keeps the portrait frame even here (GS-startour-frame), so a tap has to land INSIDE
  // that centred strip — a fraction of the full 820 width would click the page beside the game.
  await page.mouse.click(EMBED.width * 0.5 + 90, EMBED.height * 0.32);
  await wait(page, 2200);
  const onChart = await page.evaluate(() => !!document.querySelector('#gs-st-ship'));
  return onChart ? 'ship under way' : '⚠ no ship on the chart';
}

/** Character select — the roster, which is what says "RPG" before a word is read. */
async function driveRoster(page) {
  await page.goto(url({ intro: '0' }), { waitUntil: 'load' });
  await booted(page);
  await page.evaluate(() => document.querySelector('.gs-navtile')?.click());
  await page.waitForSelector('.gs-charcard', { timeout: 15000 });
  await wait(page, 1200); // card entrance animations
  return 'four golfers';
}

/** The Story Tour clubhouse: the cast, standing about, with the campaign furniture visible. */
async function driveClubhouse(page) {
  await page.goto(url({ intro: '0', screen: 'storybar' }), { waitUntil: 'load' });
  await booted(page);
  await wait(page, 2000);
  return 'story';
}

/**
 * The finale. `?screen=storyfinale` mounts the pre-fight BRIEFING (a page of text), so the drive has
 * to engage to reach the arena. Authored landscape, so it is shot landscape and skips the mat.
 */
async function driveBattle(page) {
  await page.goto(url({ intro: '0', screen: 'storyfinale' }), { waitUntil: 'load' });
  await booted(page);
  await page.waitForSelector('[data-story-finale-engage]', { timeout: 15000 });
  await page.evaluate(() => document.querySelector('[data-story-finale-engage]')?.click());
  // Past the 2.8s boss entrance (battleIntro.ts) and a few seconds into the assault, so the frame
  // catches projectiles in the air rather than an empty arena.
  await wait(page, 9000);
  const inArena = await page.evaluate(() => !!document.querySelector('canvas'));
  return inArena ? 'Jörmungandr, mid-assault' : '⚠ never reached the arena';
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────

const SHOTS = {
  aim: [driveAim, {}],
  putt: [drivePutt, {}],
  starmap: [driveStarMap, {}],
  roster: [driveRoster, {}],
  clubhouse: [driveClubhouse, {}],
  battle: [driveBattle, { wide: true }],
};

const want = process.argv.slice(2).filter((a) => a in SHOTS);
const chosen = want.length ? want : Object.keys(SHOTS);

console.log(`Shooting ${chosen.join(', ')} at seed ${SEED} → ${outDir}`);
for (const name of chosen) {
  const [drive, opts] = SHOTS[name];
  await shoot(name, drive, opts);
}

await browser.close();
await server.close();
