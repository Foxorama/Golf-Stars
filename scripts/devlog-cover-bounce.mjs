// Cover image for the "a day on one bounce" devlog: the ball's OWN run-out, drawn by the game's own
// model, over the same seeded sky the store page and the launch cover use.
//
// WHY NOT A DRAWING OF SOME BOUNCING BALLS. The post is about the difference between measuring the
// model and measuring the picture, and it ends on a single number (`apexOverLenMin`, 0.12 -> 0.30)
// that decides whether a hop reads as a bounce or as a smear. So the cover is not an illustration OF
// that — it IS that: `planRunout` is called with a real driver landing and every ball on the card sits
// where `sampleRunout` puts it, at the drawn height the play view would give it. Change the constant
// and the cover changes. (`scripts/cover-shot.mjs` makes the same trade for the launch cover, which
// renders a real hole through `buildScene` rather than mocking one up.)
//
// IT IS THE GAME'S PICTURE, ENLARGED — not a re-tuned one. The geometry is computed at the play
// camera the game actually uses for a driver (`CAM_PX`), which is what decides `ballYd` and therefore
// which hops are PLANNED AT ALL (GS-runout-seen); the whole thing is then multiplied by one poster
// factor. So a hop the player would not see is not on the card either.
//
//   node scripts/devlog-cover-bounce.mjs           → assets/itch/devlog-cover-bounce.png
//   PROBE=1 node scripts/devlog-cover-bounce.mjs   → print the plan and exit (no browser)
//
// Deterministic: no rng anywhere in the run-out (contract 1 — per-shot variation is a hash of the
// shot's own geometry), so a re-run after an art change shows the same bounce.

import { createServer } from 'vite';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './chromium.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'assets', 'itch');
mkdirSync(outDir, { recursive: true });

const W = 1920;
const H = 1080;

const server = await createServer({
  root: repoRoot,
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const { planRunout, sampleRunout, DEFAULT_RUNOUT_FEEL } = await server.ssrLoadModule('/src/render/runout.ts');
const { ballRadiusPx, ballSVG, BALL_SKINS } = await server.ssrLoadModule('/src/render/ball.ts');
const { CLUBS } = await server.ssrLoadModule('/src/sim/clubs.ts');
const { flightProfileOf, arcApex, ARC_FEEL, arcShapeOf, arrivalAngleDeg, flightScaleFor, rollFractionFor } =
  await server.ssrLoadModule('/src/sim/flight.ts');
const { sampleCurvedFlight, flightDurationMs, flightGroundAt } = await server.ssrLoadModule('/src/render/trajectory.ts');

const F = DEFAULT_RUNOUT_FEEL;
// `heightExaggeration` lives in playView's BASE_FEEL, which is a DOM module and is not exported —
// so the measuring rigs carry it as a local constant. `scripts/runout-frames.ts` already does exactly
// this; matching its spelling rather than inventing a third answer is the point.
const HEIGHT_EXAGGERATION = 0.55;
// Drawn hop height = modelled apex x heightExaggeration x hopDrawBoost. The same product converts a
// drawn radius back into the yards of apex a ball covers, which is what `ballYd` means.
const HEIGHT_K = HEIGHT_EXAGGERATION * F.hopDrawBoost;
// A driver off a firm fairway: the club the play-test named first, and the row the fix was pinned
// against. NOTHING here is a hand-picked number — the shot is resolved through the same shipped
// functions `scripts/runout-frames.ts` measures with, and the probe below prints the hop count so it
// can be read straight off that rig's `D @1 firm` row. If the two ever disagree, the cover is lying
// about the game and this is the line that says so.
const CLUB = 'D';
const club = CLUBS.find((c) => c.id === CLUB);
const profile = flightProfileOf(CLUB);
const carry = club.carry * flightScaleFor(profile, club.carry);
const roll = carry * rollFractionFor(profile, club.carry);

// The camera the run-out is WATCHED at (GS-landing-camera): the shot camera for a drive, over the
// shipped landing zoom. It decides the drawn ball, therefore `ballYd`, therefore which hops are
// PLANNED AT ALL (GS-runout-seen) — so it has to be the game's, not the poster's.
const CAM_PX = (carry > 200 ? 1.6 : carry > 120 ? 3.0 : 5.0) / F.landingZoom;
const ballPx = ballRadiusPx(CAM_PX);
const ballYd = ballPx / (CAM_PX * HEIGHT_K);

// Arrival speed + descent angle off the DRAWN arc, exactly as playView.ts takes them.
const apex = arcApex(carry, club.carry, ARC_FEEL, profile);
const shape = arcShapeOf(CLUB);
const dur = flightDurationMs(apex);
const VEPS = 0.02;
const at = (u) => sampleCurvedFlight([0, 0], [0, carry], 0, flightGroundAt(u, undefined, profile.dragTaper), apex, shape);
const a = at(1 - VEPS).ground;
const b = at(1).ground;
const v0 = Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(1, VEPS * dur);

const plan = planRunout(
  { dist: roll, firm: 0.86, v0, carry, descentDeg: arrivalAngleDeg(apex, carry, shape), clubId: CLUB, vary: 0.5, ballYd },
  F,
);

if (process.env.PROBE) {
  const drawn = (h) => (h * CAM_PX * HEIGHT_K).toFixed(1);
  console.log(`ball ${ballPx.toFixed(2)}px  ballYd ${ballYd.toFixed(3)}  total ${plan.totalDist.toFixed(1)}yd / ${plan.totalMs}ms`);
  plan.hops.forEach((h, i) =>
    console.log(`  hop ${i + 1}  len ${h.dist.toFixed(2)}yd  apex ${h.apex.toFixed(3)}yd  drawn ${drawn(h.apex)}px  ratio ${(h.apex / h.dist * HEIGHT_K).toFixed(2)}`),
  );
  console.log(`  roll ${plan.rollDist.toFixed(2)}yd / ${plan.rollMs}ms`);
  await server.close();
  process.exit(0);
}

// ── the trace ────────────────────────────────────────────────────────────────────────────────────
// Walk the plan in time, exactly as the play view does, and keep (ground, height) in SCREEN px at
// the game's camera. The poster factor is applied once, at the end.
const STEPS = 900;
const pts = [];
for (let i = 0; i <= STEPS; i++) {
  const { s, h } = sampleRunout(plan, i / STEPS);
  pts.push([s * CAM_PX, h * CAM_PX * HEIGHT_K]);
}

const runPx = plan.totalDist * CAM_PX;
const peakPx = Math.max(...pts.map((p) => p[1]));

// Fill the card: the train runs across the lower half with the type above it.
const PAD_L = 150;
const PAD_R = 150;
const BASE_Y = 952; // the turf line — set so the first hop's apex clears the type block above it
const K = (W - PAD_L - PAD_R) / runPx;
const x = (px) => PAD_L + px * K;
const y = (py) => BASE_Y - py * K;

const R = ballPx * K;

// The balls: one at each touchdown and each apex, plus a few down the closing roll, so the card shows
// the SHAPE of the train — the thing the whole post is about — rather than an even sprinkle that hides
// the decay. `s` and `h` are both in COURSE YARDS; the px conversion happens once, at the draw.
//
// The tail then has to be THINNED. The train decays geometrically, so the last hops are shorter than
// the ball is wide and drawing every one of them stacks four balls into a heap — which is the same
// mistake in the opposite direction: the model is right and the picture is unreadable. A mark closer
// than `MIN_GAP` poster pixels to the last one drawn is dropped, apexes first.
const MIN_GAP_BALLS = 1.95;
const candidates = [];
{
  let s = 0;
  candidates.push({ s: 0, h: 0, keep: true }); // touchdown — the moment the shot lands, never dropped
  for (const hop of plan.hops) {
    candidates.push({ s: s + hop.dist / 2, h: hop.apex });
    s += hop.dist;
    candidates.push({ s, h: 0 });
  }
  for (let i = 1; i <= 3; i++) candidates.push({ s: s + (plan.rollDist * i) / 4, h: 0 });
  candidates.push({ s: plan.totalDist, h: 0, keep: true }); // the rest — where the ball actually stops
}

const marks = [];
{
  let lastX = -Infinity;
  const R0 = ballPx * ((W - 300) / (plan.totalDist * CAM_PX));
  for (const c of candidates) {
    const px = c.s * CAM_PX * ((W - 300) / (plan.totalDist * CAM_PX));
    if (!c.keep && px - lastX < R0 * MIN_GAP_BALLS) continue;
    marks.push(c);
    lastX = px;
  }
}

const skin = BALL_SKINS.classic;
const trail = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${x(px).toFixed(1)},${y(py).toFixed(1)}`).join('');

const balls = marks
  .map((m, i) => {
    const t = i / (marks.length - 1);
    // Fades in from the left so the eye reads left-to-right and the last ball is the solid one.
    const op = (0.34 + 0.66 * t).toFixed(2);
    const px = x(m.s * CAM_PX);
    const py = y(m.h * CAM_PX * HEIGHT_K);
    const shadow = `<ellipse cx="${px.toFixed(1)}" cy="${(BASE_Y + R * 0.5).toFixed(1)}" rx="${(R * 1.15).toFixed(1)}" ry="${(R * 0.34).toFixed(1)}" fill="rgba(0,0,0,.42)" opacity="${op}"/>`;
    return `<g opacity="${op}">${shadow}${ballSVG(px, py, R, skin)}</g>`;
  })
  .join('');

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <path d="${trail}" fill="none" stroke="rgba(95,212,90,.55)" stroke-width="4" stroke-linecap="round"/>
  ${balls}
</svg>`;

const skyPath = join(repoRoot, 'assets', 'itch', 'page-sky.png');
const skyURI = existsSync(skyPath)
  ? `data:image/png;base64,${readFileSync(skyPath).toString('base64')}`
  : null;
if (!skyURI) console.warn(`! ${skyPath} missing — run scripts/banner.mjs first; the cover falls back to flat space.`);

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body { margin:0; padding:0; }
  body { width:${W}px; height:${H}px; overflow:hidden; position:relative; background:#0b0d12
         ${skyURI ? `url("${skyURI}") center/cover no-repeat` : ''};
         font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
  /* The sky is seeded art, not a backdrop composed for this crop, so the type sits on its own wash. */
  .vig { position:absolute; inset:0; background:
     radial-gradient(120% 78% at 34% 22%, rgba(11,13,18,.90) 0%, rgba(11,13,18,.58) 46%, rgba(11,13,18,0) 80%); }
  /* The ground the ball is bouncing off. Kept to a lit horizon rather than a slab of turf: the
     subject is the train, and a green field under it turns the card into a screenshot of nothing. */
  .turf { position:absolute; left:0; right:0; top:${BASE_Y}px; height:${H - BASE_Y}px;
          background:linear-gradient(180deg, rgba(63,140,63,.42) 0%, rgba(20,44,22,.16) 40%, rgba(11,13,18,0) 100%); }
  .turf::before { content:''; position:absolute; left:0; right:0; top:0; height:2px;
          background:linear-gradient(90deg, rgba(95,212,90,0) 0%, rgba(95,212,90,.55) 18%, rgba(95,212,90,.55) 82%, rgba(95,212,90,0) 100%); }
  svg { position:absolute; inset:0; }
  /* The type has to clear the FIRST hop's apex, which is the tallest thing on the card and is placed
     by the model, not by taste — so the block is set from the top and kept short rather than centred. */
  .type { position:absolute; left:150px; top:74px; }
  .kicker { margin:0 0 22px; color:#5fd45a; font-size:26px; font-weight:700;
            letter-spacing:.24em; text-transform:uppercase; }
  h1 { margin:0; color:#ecffe9; font-size:74px; line-height:1.06; font-weight:800;
       letter-spacing:-.02em; text-shadow:0 6px 34px rgba(0,0,0,.7); }
  /* One line. The card is read at a few hundred pixels wide in an unfurl (the same rule the store
     cover's tagline follows), and a second line is the first thing that stops being legible. */
  .tag { margin:24px 0 0; color:#c8ccd4; font-size:31px; line-height:1.4; white-space:nowrap; }
</style></head><body>
  <div class="vig"></div>
  <div class="turf"></div>
  ${svg}
  <div class="type">
    <p class="kicker">The Far Carry · devlog</p>
    <h1>A day in the life of<br/>a ball that didn&rsquo;t bounce</h1>
    <p class="tag">Ten pull requests, two of them backwards, one number.</p>
  </div>
</body></html>`;

const browser = await launchChromium({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewportSize({ width: W, height: H });
await page.setContent(html, { waitUntil: 'load' });
const out = join(outDir, 'devlog-cover-bounce.png');
await page.screenshot({ path: out, type: 'png' });
await browser.close();
await server.close();

console.log(`✓ ${out}  ${W}x${H}`);
console.log(`  ${plan.hops.length} hops over ${plan.totalDist.toFixed(1)}yd, drawn peak ${(peakPx * K).toFixed(0)}px`);
