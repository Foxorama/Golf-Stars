// Eyes-on sheet for the golf BALL (GS-ball-art): every skin, at every size the camera can ask for,
// through a full rotation — so a change to the painter, the dimple field or a cover row can be
// judged instead of guessed at.
//   node scripts/ball-preview.mjs        (OUT=/path.png)
import { createServer } from 'vite';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const outPng = process.env.OUT ?? join(tmpdir(), 'gs-ball.png');

const html = `<!doctype html><meta charset="utf8">
<style>
  html,body{margin:0;background:#2f6f3a;font:12px system-ui,sans-serif;color:#eaf3ea;}
  canvas{display:block;}
</style>
<body><canvas id="c" width="1180" height="1180"></canvas>
<script type="module">
  import { BALL_SKINS, drawBall, drawBallShadow, ballRadiusPx, advanceRollPhase } from '/src/render/ball.ts';
  const ctx = document.getElementById('c').getContext('2d');
  ctx.fillStyle = '#2f6f3a'; ctx.fillRect(0,0,1180,1180);
  const label = (t, x, y, sz = 13) => { ctx.fillStyle = '#eaf3ea'; ctx.font = \`700 \${sz}px system-ui\`; ctx.fillText(t, x, y); };

  // ── ROW SET A: every skin, one full turn, at the chip/putt camera size ──────────────────
  const ids = Object.keys(BALL_SKINS);
  label('Every cover, one full turn (putt camera 17.1 px/yd)', 20, 26, 15);
  const rBig = ballRadiusPx(17.1);
  ids.forEach((id, row) => {
    const y = 60 + row * 62;
    label(id + '  r=' + rBig.toFixed(1), 20, y + 4, 12);
    for (let i = 0; i < 12; i++) {
      const phase = (i / 12) * Math.PI * 2;
      const x = 150 + i * 62;
      drawBallShadow(ctx, x, y + rBig * 0.9, rBig, 0);
      drawBall(ctx, x, y, rBig, { phase, dirX: 1, dirY: 0, skin: BALL_SKINS[id] });
    }
  });

  // ── ROW SET B: the size ladder — what each camera actually draws ────────────────────────
  const yB = 60 + ids.length * 62 + 24;
  label('Size ladder at the REAL cameras (0.5-5.7 shots, 7.6-35 putts). Floor 2.25px = the whole-hole dot.', 20, yB, 15);
  // The cameras the game actually uses, measured by playing a hole out at 390x844.
  const scales = [0.53, 1.83, 2.56, 3.41, 5.7, 7.56, 10.95, 17.1, 35];
  scales.forEach((s, i) => {
    const r = ballRadiusPx(s);
    const x = 90 + i * 122;
    const y = yB + 60;
    drawBallShadow(ctx, x, y + r + 3, r, 0);
    drawBall(ctx, x, y, r, { phase: 0.9, dirX: 1, dirY: 0, skin: BALL_SKINS.classic });
    label(s + ' px/yd', x - 26, y + 44, 11);
    label('r ' + r.toFixed(1), x - 20, y + 58, 11);
  });

  // ── ROW SET B2: against the markers the player judges it by ─────────────────────────────
  // "especially on greens, it's too big — compared to the hole/flag it's a beachball." Those markers
  // are FIXED-size (style.ts section 11: tee dot r5, pin base shadow r2.2, flagstick 14 units tall),
  // so this is the comparison the report is actually making. Sizes copied from there deliberately —
  // this sheet is for judging, not a second description anything reads.
  const yB2 = yB + 152;
  label('vs the fixed scene markers, at the putt camera — and at 4.4 (the size that was reported)', 20, yB2, 15);
  const pin = (x, y) => {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(x, y + 1, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 14); ctx.stroke();
    ctx.fillStyle = '#ff3b3b'; ctx.strokeStyle = '#7a1414'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 9, y - 11); ctx.lineTo(x, y - 8); ctx.closePath();
    ctx.fill(); ctx.stroke();
  };
  [[rBig, 'now  r ' + rBig.toFixed(2)], [4.4, 'was  r 4.40']].forEach(([rr, cap], i) => {
    const y = yB2 + 52;
    const x0 = 150 + i * 300;
    pin(x0, y);
    drawBallShadow(ctx, x0 + 34, y + rr * 0.9, rr, 0);
    drawBall(ctx, x0 + 34, y, rr, { phase: 0.9, dirX: 1, dirY: 0, skin: BALL_SKINS.classic });
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x0 + 90, y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    label(cap, x0 - 10, y + 30, 12);
    label('cup / ball / tee dot', x0 - 10, y + 44, 11);
  });

  // ── ROW SET C: the hop — the shadow is what makes height read ───────────────────────────
  const yC = yB2 + 130;
  label('A hop: ball + its ground shadow (the cue the old fixed 4x2px ellipse never gave)', 20, yC, 15);
  const r = ballRadiusPx(17.1);
  for (let i = 0; i <= 15; i++) {
    const t = i / 15;
    const lift = Math.sin(Math.PI * t) * 34;
    const x = 90 + i * 68;
    const gy = yC + 96;
    drawBallShadow(ctx, x, gy, r, lift);
    drawBall(ctx, x, gy - lift, r, { phase: t * 7, dirX: 1, dirY: 0, skin: BALL_SKINS.classic });
  }

  // ── ROW SET D: a real roll — phase advanced from screen displacement, decelerating to rest ──
  const yD = yC + 150;
  label('Roll driven by screen displacement, decelerating to rest — the turn dies with the ball', 20, yD, 15);
  let phase = 0, x = 70;
  let speed = 46;
  const gy2 = yD + 52;
  for (let i = 0; i < 17; i++) {
    drawBallShadow(ctx, x, gy2 + r * 0.9, r, 0);
    drawBall(ctx, x, gy2, r, { phase, dirX: 1, dirY: 0, skin: BALL_SKINS.classic });
    phase = advanceRollPhase(phase, speed, r);
    x += speed;
    speed *= 0.82;
  }
  window.__done = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
// The ONE Chromium lookup (tests/chromium.ts). This script used to carry its own Linux-only copy, so
// on Windows it found nothing and hard-failed — the exact second-description bug GS-browser-test-gate
// is about. It is TypeScript, so it comes through the vite server we already have.
const { chromePath } = await vite.ssrLoadModule('/tests/chromium.ts');
const srv = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
  vite.middlewares(req, res);
});
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;
if (!chromePath) throw new Error('no Chromium found — set CHROME_PATH (see tests/chromium.ts)');
const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1180, height: 1180 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__done === true', { timeout: 60000 });
await page.screenshot({ path: outPng });
await browser.close();
await vite.close();
srv.close();
console.log('wrote', outPng);
