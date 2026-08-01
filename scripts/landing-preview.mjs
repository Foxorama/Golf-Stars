// Eyes-on sheet for the LANDING (GS-landing-real): what the play view actually draws as a shot
// touches down — the ball, its shadow, and its height — stepped along the run-out for each club,
// each landing surface, and a few different shots with the same club.
//
// This draws through the SAME `planRunout` / `sampleRunout` / `drawBall` / `drawBallShadow` the game
// uses, at the same camera scales and with the same height exaggeration, so what you see here is what
// the play view puts on screen.
//   node scripts/landing-preview.mjs        (OUT=/path.png)
import { createServer } from 'vite';
import http from 'node:http';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';


const outPng = process.env.OUT ?? join(tmpdir(), 'gs-landing.png');

const W = 1500;
const H = 1180;
const html = `<!doctype html><meta charset="utf8">
<style>html,body{margin:0;background:#2f6f3a;font:12px system-ui,sans-serif;}canvas{display:block;}</style>
<body><canvas id="c" width="${W}" height="${H}"></canvas>
<script type="module">
  import { planRunout, sampleRunout, DEFAULT_RUNOUT_FEEL } from '/src/render/runout.ts';
  import { drawBall, drawBallShadow, ballRadiusPx, advanceRollPhase, BALL_SKINS } from '/src/render/ball.ts';
  import { CLUBS } from '/src/sim/clubs.ts';
  import { flightProfileOf, arcApex, ARC_FEEL, arcShapeOf, arrivalAngleDeg, rollFractionFor } from '/src/sim/flight.ts';
  import { sampleCurvedFlight, flightDurationMs, flightGroundAt } from '/src/render/trajectory.ts';

  const ctx = document.getElementById('c').getContext('2d');
  ctx.fillStyle = '#2f6f3a'; ctx.fillRect(0,0,${W},${H});
  const label = (t,x,y,sz=13,col='#eaf3ea') => { ctx.fillStyle=col; ctx.font=\`700 \${sz}px system-ui\`; ctx.fillText(t,x,y); };

  // What the play view measures off the drawn arc at touchdown.
  function arrival(club) {
    const pr = flightProfileOf(club.id);
    const apex = arcApex(club.carry, club.carry, ARC_FEEL, pr);
    const shape = arcShapeOf(club.id);
    const from=[0,0], land=[0,club.carry];
    const dur = flightDurationMs(apex);
    const a = sampleCurvedFlight(from,land,0,flightGroundAt(1-0.02, undefined, pr.dragTaper),apex,shape).ground;
    const b = sampleCurvedFlight(from,land,0,flightGroundAt(1, undefined, pr.dragTaper),apex,shape).ground;
    const v0 = Math.hypot(b[0]-a[0],b[1]-a[1]) / Math.max(1, 0.02*dur);
    return { v0, descentDeg: arrivalAngleDeg(apex, club.carry, shape), carry: club.carry };
  }

  const HEIGHT_EXAG = 0.55;   // playView's heightExaggeration
  const BOOST = DEFAULT_RUNOUT_FEEL.hopDrawBoost;
  // ONE camera for every row on the sheet, so the clubs are comparable — and it is the LANDING camera,
  // taken from the shipped constant rather than typed in (GS-landing-camera).
  //
  // ⚠️ This rig is why the bounce could be reported invisible while every sheet it points at looked
  // right. It used to draw at a hand-set 4.6 px/yd — the top of the shot-camera band — while the game
  // drew a driver's run-out at **1.6**, because the play camera is framed for the whole shot. The
  // preview was honest about the MODEL and silently wrong about the PICTURE, which is the one thing an
  // eyes-on rig exists to be right about. A camera is not a presentation choice here; it is half of
  // whether a bounce exists, so it comes from the same place the game gets it.
  const LANDING_CAM = 1.6 / DEFAULT_RUNOUT_FEEL.landingZoom;
  // How big the ball is DRAWN, in the run-out's own height units: the play view's own conversion run
  // backwards (GS-runout-seen). Passing it is what makes this sheet show the hops the GAME plans
  // rather than the ones the model would like to — a hop that cannot clear the ball is not planned.
  const ballYdAt = (pxPerYd) => ballRadiusPx(pxPerYd) / (pxPerYd * HEIGHT_EXAG * BOOST);

  /** Draw one run-out as the play view would: ball + shadow, stepped, at a given px-per-yard. */
  function strip(plan, x0, y0, pxPerYd, steps, skin = BALL_SKINS.classic) {
    const r = ballRadiusPx(pxPerYd);
    let phase = 0, prevX = null;
    for (let i = 0; i <= steps; i++) {
      const s = sampleRunout(plan, i/steps);
      const x = x0 + s.s * pxPerYd;
      const lift = s.h * pxPerYd * HEIGHT_EXAG * BOOST;
      drawBallShadow(ctx, x, y0, r, lift);
      drawBall(ctx, x, y0 - lift, r, { phase, dirX: 1, dirY: 0, skin });
      if (prevX !== null) phase = advanceRollPhase(phase, Math.abs(x - prevX), r);
      prevX = x;
    }
    // the ground line
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0 - 6, y0 + r*0.9); ctx.lineTo(x0 + plan.totalDist*pxPerYd + 10, y0 + r*0.9); ctx.stroke();
  }

  let y = 34;
  label('THE LANDING — ball + shadow + height, exactly as the play view draws it', 18, y, 16); y += 10;
  label('Every row at the LANDING camera (~4.7 px/yd — the shot camera pushed in) so the clubs are comparable.', 18, y+12, 11, '#cfe6cf');
  y += 40;

  const SHOW = ['D','3W','4H','3i','7i','PW','SW'];
  for (const id of SHOW) {
    const club = CLUBS.find(c => c.id === id);
    const pr = flightProfileOf(id);
    // The run is the SIM's, ASKED for — never re-derived off carryFrac, which has not been the whole
    // story since GS-runout-ladder gave the run its own lever. That stale form drew a driver running
    // 23yd where the game runs 38, i.e. the sheet was previewing a landing nobody gets.
    const frac = rollFractionFor(pr, club.carry);
    const run = pr.runFrac === undefined && pr.carryFrac >= 1 ? 2.5 : club.carry * frac;
    const ar = arrival(club);
    const plan = planRunout({ dist: run, firm: 0.85, v0: ar.v0, carry: ar.carry, descentDeg: ar.descentDeg, clubId: id, vary: 0.5, ballYd: ballYdAt(LANDING_CAM) });
    label(id + '  ' + ar.descentDeg.toFixed(0) + '\\u00b0 down', 18, y + 4, 12);
    label(plan.hops.length + ' hops \\u00b7 ' + plan.hops.map(h=>h.dist.toFixed(1)).join('/') + ' \\u00b7 roll ' + plan.rollDist.toFixed(0) + 'yd', 18, y + 20, 10, '#cfe6cf');
    strip(plan, 190, y, LANDING_CAM, 150);
    y += 74;
  }

  y += 14;
  label('THE SURFACE: the same driver, four landings (run + firmness both come from the sim/lie)', 18, y, 15); y += 30;
  const D = CLUBS.find(c=>c.id==='D'); const ad = arrival(D);
  for (const [lie, firm, run] of [['fairway',0.85,62],['rough',0.30,20],['bunker',0.12,5],['ice',1.0,90]]) {
    const plan = planRunout({ dist: run, firm, v0: ad.v0, carry: ad.carry, descentDeg: ad.descentDeg, clubId: 'D', vary: 0.5, ballYd: ballYdAt(LANDING_CAM) });
    label(lie, 18, y + 4, 12);
    label(plan.hops.length + ' hops \\u00b7 roll ' + plan.rollDist.toFixed(0) + 'yd', 18, y + 20, 10, '#cfe6cf');
    strip(plan, 190, y, LANDING_CAM, 150);
    y += 74;
  }

  y += 14;
  label('VARIANCE: four drives, same club, same surface — no two land alike (deterministic, zero rng)', 18, y, 15); y += 30;
  for (const v of [0.08, 0.36, 0.64, 0.92]) {
    const plan = planRunout({ dist: 62, firm: 0.85, v0: ad.v0, carry: ad.carry, descentDeg: ad.descentDeg, clubId: 'D', vary: v, ballYd: ballYdAt(LANDING_CAM) });
    label('vary ' + v.toFixed(2), 18, y + 4, 12);
    strip(plan, 190, y, LANDING_CAM, 150);
    y += 66;
  }
  window.__done = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

const srv = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
  vite.middlewares(req, res);
});
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;

const browser = await launchChromium({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__done === true', { timeout: 60000 });
await page.screenshot({ path: outPng });
await browser.close();
await vite.close();
srv.close();
console.log('wrote', outPng);
