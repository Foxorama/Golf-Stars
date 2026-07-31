// Record video clips of the real game for the store page, devlogs and social posts.
//
// itch.io does NOT host video and its description HTML is sanitised to an embed allowlist, so an
// mp4 of ours can only ever be LINKED from that page, never embedded in it. What the itch page can
// autoplay is an animated GIF in the screenshot rail — which is why the short clips here are worth
// converting and the intro is not (a 20-second cinematic makes a GIF that is enormous and looks
// worse than the game). Intro → a real video file somewhere; hole/starmap → GIFs on the page.
//
// Playwright records video itself (WebM), so this adds NO dependency. ffmpeg is used ONLY if it
// happens to be on PATH, to also emit an mp4 (and a GIF for the short clips) — it is a tool on the
// machine, never a project dependency, and its absence just means you keep the WebM.
//
//   node scripts/capture.mjs                 → all three clips into assets/clips/
//   node scripts/capture.mjs intro hole      → only those
//   CAPTURE_OUT=/path/dir node ...           → writes there instead
//   CAPTURE_SEED=12345 node ...              → a different round (default is pinned)
//
// Requires a build first (`npx vite build`) — it drives dist/index.html over file://, the same
// artifact the browser tests drive, so what it records is what ships rather than a dev server.
//
// Pure dev tool: ships nothing, imports no game logic, and never writes into src/.

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createServer } from 'vite';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.env.CAPTURE_OUT ?? join(repoRoot, 'assets', 'clips');
const dist = join(repoRoot, 'dist', 'index.html');

// A pinned seed so re-shooting a clip produces the SAME round — the whole sim is deterministic from
// one, which is the entire reason a clip can be re-recorded after an art change and still show the
// hole you chose to show (the same reason a seed IS the bug report, GS-crash-diagnostics).
const SEED = process.env.CAPTURE_SEED ?? '20260730';

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

/** Portrait, because the game is designed portrait-first and every screenshot on the page already is. */
const SIZE = { width: 390, height: 844 };

const url = (params) => 'file://' + dist + '?' + new URLSearchParams({ seed: SEED, ...params }).toString();

/**
 * Record one clip. Playwright writes the video when the CONTEXT closes, under a generated name — so
 * the file is found and renamed afterwards rather than named up front.
 */
async function record(name, drive) {
  const tmp = join(outDir, `.tmp-${name}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const ctx = await browser.newContext({ viewport: SIZE, recordVideo: { dir: tmp, size: SIZE } });
  const page = await ctx.newPage();
  let failed = null;
  let note = '';
  const started = Date.now();
  try {
    note = (await drive(page)) ?? '';
  } catch (e) {
    failed = e;
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  await ctx.close(); // flushes the video
  const produced = readdirSync(tmp).filter((f) => f.endsWith('.webm'))[0];
  if (!produced) {
    console.error(`  ${name}: no video produced${failed ? ` (${failed.message})` : ''}`);
    rmSync(tmp, { recursive: true, force: true });
    return null;
  }
  const finalPath = join(outDir, `${name}.webm`);
  rmSync(finalPath, { force: true });
  renameSync(join(tmp, produced), finalPath);
  rmSync(tmp, { recursive: true, force: true });
  const kb = (statSync(finalPath).size / 1024).toFixed(0);
  console.log(
    `  ${name}.webm  ~${secs}s  ${kb} KB${note ? `  · ${note}` : ''}` +
      (failed ? `  ⚠ drive ended early: ${failed.message}` : ''),
  );
  return finalPath;
}

const booted = (page) =>
  page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 15000 });

/** Click the first button whose text matches — the tests' own idiom, and resilient to markup moves. */
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

// ── the clips ────────────────────────────────────────────────────────────────────────────────────

/** The boot cinematic, start to finish. `?intro=1` FORCES it past the once-per-session gate. */
async function driveIntro(page) {
  await page.goto(url({ intro: '1' }), { waitUntil: 'load' });
  await page.waitForSelector('[data-gs-intro]', { timeout: 15000 });
  // Let it finish on its own — it removes itself through its single finish().
  await page.waitForFunction(() => !document.querySelector('[data-gs-intro]'), { timeout: 60000 });
  await wait(page, 1200); // hold on the title it hands off to
}

/**
 * A hole played tee → holed putt. Drives the REAL game rather than a scripted animation: take the
 * pre-armed club at the default aim (GS-default-aim picks a sensible line), commit, let it settle,
 * repeat — so what is recorded is a hole actually being played, and the seed makes it repeatable.
 */
async function driveHole(page) {
  // Fast Shots ON (a real player setting, `fc_settings` merges over defaults so a partial is fine).
  // Without it every shot stops on a result card waiting for a tap, which makes a clip of a hole
  // being played into a clip of a card being dismissed.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('fc_settings', JSON.stringify({ fastShots: true }));
    } catch {
      /* a denied store just means the popups stay — the clip still records */
    }
  });
  await page.goto(url({ intro: '0' }), { waitUntil: 'load' });
  await booted(page);
  await page.evaluate(() => document.querySelector('.gs-navtile')?.click()); // The Voyage
  await page.waitForSelector('.gs-charcard', { timeout: 15000 });
  await page.evaluate(() => document.querySelector('.gs-charcard')?.click());
  await clickText(page, /First Tee/);
  await clickText(page, /Tee Off/);
  await page.waitForSelector('[data-swing]', { timeout: 15000 });
  await wait(page, 1800); // sit on the aim cone a beat before the first swing — it is the good shot

  // Commit whatever the screen is offering, until the hole ends or the budget runs out. One loop for
  // swing / putt / the shot-result Continue, because from here the clip just needs the game to keep
  // moving; a per-state script would be a second description of the play flow.
  //
  // The sync is WAIT-FOR-THE-NEXT-CONTROL, never a fixed sleep. A shot spends seconds in the air and
  // in its run-out, and during all of it neither commit button exists — so the obvious "click, sleep,
  // stop when there is no button" loop stops on the FIRST shot, mid-flight, and reports a hole it
  // never played. That is what this loop did until the run report made it visible.
  const actionable = () => {
    const live = (el) => el && !el.disabled;
    const swing = document.querySelector('[data-swing]');
    const putt = document.querySelector('[data-putt-commit]');
    const cont = [...document.querySelectorAll('button')].find(
      (b) => /Continue|Next|Play on/i.test(b.textContent || '') && !b.disabled,
    );
    if (live(swing)) return 'swing';
    if (live(putt)) return 'putt';
    if (cont) return 'advance';
    return null;
  };
  let swings = 0;
  let putts = 0;
  for (let i = 0; i < 40; i++) {
    const kind = await page
      .waitForFunction(actionable, null, { timeout: 12000 })
      .then((h) => h.jsonValue())
      .catch(() => null);
    if (!kind) break; // nothing came back — the hole is over, or the game is somewhere else
    // Stop at the top of the NEXT hole rather than rolling on into a second one: once a putt has
    // dropped, a fresh swing button means we have teed off again.
    if (kind === 'swing' && putts > 0) break;
    await page.evaluate((k) => {
      const el =
        k === 'swing'
          ? document.querySelector('[data-swing]')
          : k === 'putt'
            ? document.querySelector('[data-putt-commit]')
            : [...document.querySelectorAll('button')].find((b) => /Continue|Next|Play on/i.test(b.textContent || ''));
      el?.click();
    }, kind);
    if (kind === 'swing') swings++;
    if (kind === 'putt') putts++;
    await wait(page, 500); // let the strike register before looking for the next control
  }
  await wait(page, 1500);
  // Reported, because a clip that recorded a stalled title screen is the same file size as a good
  // one — and nobody opens three videos to find out which. Zero swings means the drive never got a
  // club in its hands and the clip is worthless whatever it weighs.
  return `${swings} swing${swings === 1 ? '' : 's'}, ${putts} putt${putts === 1 ? '' : 's'}`;
}

/** The ship on the star chart. Deep-linked (GS-screen-deeplink) so it needs no run played first. */
async function driveStarMap(page) {
  await page.goto(url({ intro: '0', screen: 'startour' }), { waitUntil: 'load' });
  await booted(page);
  await wait(page, 1200);
  // Character select comes first on this flow; take the first golfer if the card grid is up.
  if (await page.evaluate(() => !!document.querySelector('.gs-charcard'))) {
    await page.evaluate(() => document.querySelector('.gs-charcard')?.click());
    await wait(page, 1500);
  }
  // Where the ship is, in chart coordinates. The map is SVG (hence: counting canvases told us
  // nothing), and the ship is one `<g id="gs-st-ship" transform="translate(x y)">`.
  const shipAt = () =>
    page.evaluate(() => {
      const m = document
        .querySelector('#gs-st-ship')
        ?.getAttribute('transform')
        ?.match(/translate\(([-\d.]+)[ ,]+([-\d.]+)\)/);
      return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
    });

  const from = await shipAt();
  // Send it somewhere: tap across the chart and let the chase-cam follow.
  const box = SIZE;
  await page.mouse.click(box.width * 0.72, box.height * 0.3);
  await wait(page, 4000);
  await page.mouse.click(box.width * 0.28, box.height * 0.62);
  await wait(page, 5000);
  const to = await shipAt();

  // Same reason the hole clip reports its swings: a chart with a motionless ship weighs the same as
  // one with a ship crossing it, and nobody opens the file to find out.
  if (!from || !to) return `⚠ no ship on the chart (${!from ? 'missing at start' : 'missing at end'})`;
  const moved = Math.hypot(to[0] - from[0], to[1] - from[1]).toFixed(0);
  return `ship flew ${moved} chart units${Number(moved) < 20 ? ' — ⚠ barely moved' : ''}`;
}

// ── run ──────────────────────────────────────────────────────────────────────────────────────────

const CLIPS = { intro: driveIntro, hole: driveHole, starmap: driveStarMap };

/**
 * The seconds of each recording worth turning into an autoplaying GIF, with optional per-clip
 * `width`/`fps` overrides. No entry ⇒ no GIF.
 *   hole    — the aim cone held, the swing, the ball's flight and where it comes down.
 *   starmap — the ship actually under way; it parks near the spaceport after about six seconds.
 *   intro   — the whole cinematic. It runs 13s, and MEASURED it converts to 3.6MB at the shared
 *             settings and ~2.8MB at 320px, so the old "the intro is far too long to be a GIF" note
 *             was wrong: it was written before the window + 128-colour palette work, back when the
 *             whole 18s recording was converted at 380px. It is a poor STORE-RAIL GIF (a cinematic
 *             shows nothing of what you do) and a good DEVLOG one, which is a different job.
 */
const GIF_WINDOW = {
  hole: { ss: 0.8, t: 5 },
  starmap: { ss: 0.5, t: 5 },
  intro: { ss: 0, t: 13, width: 320 },
};
const GIF_FPS = 10;
const GIF_WIDTH = 360;
const GIF_BUDGET_MB = 3.5;
const want = process.argv.slice(2).filter((a) => a in CLIPS);
const chosen = want.length ? want : Object.keys(CLIPS);

console.log(`Recording ${chosen.join(', ')} at seed ${SEED} → ${outDir}`);
const made = [];
for (const name of chosen) {
  const p = await record(name, CLIPS[name]);
  if (p) made.push([name, p]);
}

await browser.close();
await server.close();

// ── optional ffmpeg conversion ───────────────────────────────────────────────────────────────────

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
if (!hasFfmpeg) {
  console.log('\nffmpeg not on PATH — keeping the WebM files.');
  console.log('WebM uploads fine to Bluesky/GitHub; install ffmpeg if you want mp4/GIF as well.');
} else {
  for (const [name, src] of made) {
    const mp4 = resolve(outDir, `${name}.mp4`);
    // yuv420p + even dimensions: without both, the file plays in a browser and nowhere else.
    spawnSync(
      'ffmpeg',
      ['-y', '-i', src, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p', '-crf', '23', mp4],
      { stdio: 'ignore' },
    );
    console.log(`  ${name}.mp4`);
    // GIF only for the SHORT clips — the itch screenshot rail autoplays GIFs, and that is the one
    // place a clip can move on the store page. The intro is far too long to be one.
    //
    // A GIF IS A MOMENT, NOT A CLIP. Converting the whole recording produced a 14.6MB file: the
    // follow-cam means every pixel changes every frame, which is the worst case for inter-frame
    // compression, and most of those frames were the walk to the tee or a parked ship. So each clip
    // declares the WINDOW that is worth autoplaying, measured off its own contact sheet
    // (`ffmpeg -i x.webm -vf "fps=1,scale=160:-1,tile=5x4" sheet.png` — re-shoot it if a drive
    // changes, or the window silently slides onto the wrong seconds).
    if (GIF_WINDOW[name]) {
      const { ss, t, width = GIF_WIDTH, fps = GIF_FPS } = GIF_WINDOW[name];
      const gif = resolve(outDir, `${name}.gif`);
      const pal = resolve(outDir, `.pal-${name}.png`);
      // Measured on the hole clip at this window: 128 colours holds the turf gradients that the
      // default 216-colour web palette bands badly, while 360px wide keeps the HUD legible in the
      // rail. Together ~3.1MB. Dropping to 300px saves 0.9MB and is the fallback if itch complains.
      const chain = `fps=${fps},scale=${width}:-1:flags=lanczos`;
      spawnSync(
        'ffmpeg',
        ['-y', '-ss', String(ss), '-t', String(t), '-i', src, '-vf', `${chain},palettegen=max_colors=128:stats_mode=diff`, pal],
        { stdio: 'ignore' },
      );
      spawnSync(
        'ffmpeg',
        ['-y', '-ss', String(ss), '-t', String(t), '-i', src, '-i', pal,
         '-lavfi', `${chain}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5`, gif],
        { stdio: 'ignore' },
      );
      rmSync(pal, { force: true });
      // Reported against the budget, because a GIF that is too heavy still looks fine locally and
      // only misbehaves on somebody else's connection.
      const mb = statSync(gif).size / 1024 / 1024;
      console.log(`  ${name}.gif  ${mb.toFixed(1)} MB${mb > GIF_BUDGET_MB ? `  ⚠ over the ${GIF_BUDGET_MB}MB budget — shorten the window or drop GIF_WIDTH` : ''}`);
    }
  }
}

console.log(`\nDone → ${outDir}`);
