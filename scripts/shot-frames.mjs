// FRAME-BY-FRAME instrumentation of a REAL shot in the REAL running game (GS-carry-roll-real).
//
// Re-implements NOTHING. It drives the built artifact in headless Chromium the way a player does
// (title -> character -> tee -> swing) and records where the game DRAWS the ball on every animation
// frame. The intercept is the ball's own paint signature: `drawBall` builds a radial gradient at
// `(x-0.38r, y-0.42r, 0.1r) -> (x, y, 1.08r)`, an outer/inner radius ratio of 10.8 that nothing else
// in the scene emits, so the probe recovers the ball's true screen position and radius with no debug
// hook at all (a new `window._gs*` flag would owe the test hub a control; this owes it nothing).
//
// WHAT THIS CAN AND CANNOT MEASURE — read before trusting a number:
//   * Screen displacement is `ball - camera`. The follow-cam rebuilds every frame, so a per-frame
//     screen speed is NOT the ball's ground speed and the hop's drawn HEIGHT cannot be separated from
//     the camera's pan. Do not read a carry/roll split or a bounce profile out of this. The authority
//     for those is the pure sim (`FLIGHT_PROFILES`) and `planRunout`, measured in node.
//   * What it DOES prove, and nothing else does: the real game boots with the current physics, plays a
//     shot end to end without a page error, keeps the ball on screen and inside its documented radius
//     band the whole way, never freezes mid-animation, and comes to rest instead of blinking out.
//
//   node scripts/shot-frames.mjs            (SEED=42 default; TRACK=1 to dump every frame)
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = resolve(__dirname, '../dist/index.html');
const SEED = process.env.SEED ?? '42';
const TRACK = !!process.env.TRACK;
// The documented drawn-ball bounds (GS-ball-art): floored at the legacy 3px, capped at 5.5 against
// the scene's own fixed markers.
const R_FLOOR = 3;
const R_CAP = 5.5;

function findChromium() {
  const bases = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/opt/pw-browsers',
    process.env.HOME ? join(process.env.HOME, '.cache', 'ms-playwright') : undefined,
  ].filter(Boolean);
  for (const base of bases) {
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base)) {
      if (!d.startsWith('chromium-') || d.includes('headless')) continue;
      const bin = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}

const chromePath = findChromium();
if (!chromePath) {
  console.error('no chromium found (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers)');
  process.exit(1);
}
if (!existsSync(dist)) {
  console.error('dist/index.html missing - run `npm run build` first');
  process.exit(1);
}

const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
let failures = 0;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // Install the intercept BEFORE any game code runs, so frame 1 is captured.
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype;
    const realGrad = proto.createRadialGradient;
    window.__frames = [];
    let cur = null;
    const rafReal = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) =>
      rafReal((t) => {
        cur = { t, balls: [] };
        window.__frames.push(cur);
        cb(t);
      });
    proto.createRadialGradient = function (x0, y0, r0, x1, y1, r1) {
      if (cur && r0 > 0 && Math.abs(r1 / r0 - 10.8) < 0.4) {
        const r = r1 / 1.08;
        if (Math.abs(x0 - (x1 - r * 0.38)) < 0.02 && Math.abs(y0 - (y1 - r * 0.42)) < 0.02) {
          cur.balls.push({ x: x1, y: y1, r });
        }
      }
      return realGrad.call(this, x0, y0, r0, x1, y1, r1);
    };
  });

  await page.goto('file://' + dist + '?intro=0&seed=' + SEED, { waitUntil: 'load' });
  const click = async (t) => {
    await page.locator('button', { hasText: t }).first().click();
    await page.waitForTimeout(140);
  };
  await click('The Voyage');
  await click('Voyage as Feather');
  await click('First Tee');
  await click('Tee Off');
  await page.waitForTimeout(300);

  // The club the smart default pre-arms (GS-default-aim) and the conditions it read it off.
  const hud = await page.evaluate(() => {
    const t = (document.querySelector('.gs-shot') || document.body).textContent || '';
    return t.replace(/\s+/g, ' ').trim();
  });
  const club = /([◄<]\s*)([A-Za-z0-9 ]+?)(\s*[►>])/.exec(hud);
  console.log(`seed=${SEED}`);
  console.log(`pre-armed club: ${club ? club[2].trim() : '(not found in HUD)'}`);
  console.log(`HUD: ${hud.slice(0, 200)}\n`);

  await page.evaluate(() => {
    window.__frames.length = 0;
  });
  await page.locator('[data-swing]').first().click();
  await page.waitForTimeout(6000);

  const data = await page.evaluate(() => ({
    frames: window.__frames.filter((f) => f.balls.length).map((f) => ({ t: f.t, ...f.balls[0] })),
    multi: window.__frames.filter((f) => f.balls.length > 1).length,
    vw: window.innerWidth,
    vh: window.innerHeight,
  }));

  const F = data.frames;
  if (F.length < 8) {
    console.error(`FAIL only ${F.length} ball frames captured - the intercept missed the ball`);
    process.exit(1);
  }

  const seg = [];
  for (let i = 1; i < F.length; i++) {
    const dt = F[i].t - F[i - 1].t;
    const ds = Math.hypot(F[i].x - F[i - 1].x, F[i].y - F[i - 1].y);
    seg.push({ i, t: F[i].t - F[0].t, dt, ds, x: F[i].x, y: F[i].y, r: F[i].r });
  }
  const durMs = F[F.length - 1].t - F[0].t;
  const rMin = Math.min(...F.map((f) => f.r));
  const rMax = Math.max(...F.map((f) => f.r));
  const offScreen = F.filter((f) => f.x < -2 || f.y < -2 || f.x > data.vw + 2 || f.y > data.vh + 2);
  // A freeze = a long run of frames where the drawn ball does not move at all WHILE IT IS IN PLAY.
  // Both ends are legitimately still and neither is a freeze: the shot opens on the swing WINDUP (the
  // ball sits at address until contact, `swingLeadMs`) and closes with the ball drawn at rest until
  // unmount (GS-landing-real). So bracket the search to (first moving frame, last moving frame).
  let firstMoving = seg.length;
  let lastMoving = 0;
  for (let i = 0; i < seg.length; i++) {
    if (seg[i].ds > 0.05) {
      firstMoving = Math.min(firstMoving, i);
      lastMoving = i;
    }
  }
  let worstStall = 0;
  let run = 0;
  for (let i = firstMoving; i < lastMoving; i++) {
    run = seg[i].ds <= 0.02 ? run + 1 : 0;
    worstStall = Math.max(worstStall, run);
  }
  const windup = firstMoving;
  const settled = seg.slice(lastMoving + 1).length;

  const check = (ok, label, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
    if (!ok) failures++;
  };

  console.log(
    `frames=${F.length}  duration=${durMs.toFixed(0)}ms  windup=${windup} frame(s)  in flight/run-out=${lastMoving - windup + 1}  at rest=${settled}\n`,
  );
  check(errors.length === 0, 'no page errors during the shot', errors.join(' | ') || 'clean');
  check(data.multi === 0, 'the ball is drawn exactly once per frame', `${data.multi} frame(s) drew it more than once`);
  check(offScreen.length === 0, 'the ball never leaves the viewport', `${offScreen.length} off-screen frame(s)`);
  check(rMin >= R_FLOOR - 1e-6 && rMax <= R_CAP + 1e-6, 'drawn radius stays in its documented band', `${rMin.toFixed(2)}–${rMax.toFixed(2)}px (floor ${R_FLOOR}, cap ${R_CAP})`);
  check(worstStall <= 3, 'no freeze while the ball is in play', `longest motionless run between contact and rest: ${worstStall} frame(s)`);
  check(windup > 0, 'the shot opens on a swing windup, ball at address', `${windup} frame(s) before contact`);
  check(settled > 0, 'the ball is still drawn at rest when the shot ends (it does not blink out)', `${settled} resting frame(s)`);
  check(durMs > 600, 'the shot animation is long enough to watch', `${durMs.toFixed(0)}ms`);

  if (TRACK) {
    console.log('\n--- per-frame drawn track (screen px; displacement is ball MINUS camera) ---');
    for (const s of seg) {
      console.log(
        `  ${String(s.i).padStart(3)} t=${s.t.toFixed(0).padStart(5)} dt=${s.dt.toFixed(0).padStart(3)} ds=${s.ds.toFixed(2).padStart(6)} x=${s.x.toFixed(1).padStart(6)} y=${s.y.toFixed(1).padStart(6)} r=${s.r.toFixed(2)}`,
      );
    }
  }
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
} finally {
  await browser.close();
}
process.exit(failures === 0 ? 0 : 1);
