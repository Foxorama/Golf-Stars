// Eyes-on preview for the finale battle (GS-story-battle-3). Mounts mountStoryBattle non-interactively
// (the autopilot flies + fires for itself) at several serpent-health fractions so every PHASE of the
// R-Type fight can be screenshotted — opening assault, ACID SPRAY (75%), +LIGHTNING (50%), +VOID (25%),
// the OVERWHELM (5%), the aim reveal and the climax — for BOTH paths.
//   node scripts/battle-preview.mjs      (OUTDIR=/path to choose the folder)
import { createServer } from 'vite';
import http from 'node:http';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const outDir = process.env.OUTDIR ?? join(tmpdir(), 'gs-battle');
mkdirSync(outDir, { recursive: true });

function findChromium() {
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, process.env.HOME ? join(process.env.HOME, '.cache', 'ms-playwright') : undefined, '/opt/pw-browsers'].filter(Boolean);
  for (const base of bases) { if (!existsSync(base)) continue; for (const d of readdirSync(base)) { if (!d.startsWith('chromium-') || d.includes('headless')) continue; const bin = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(bin)) return bin; } }
  return null;
}

const html = `<!doctype html><meta charset="utf8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;background:#03040a;}</style>
<body>
<script type="module">
  import { mountStoryBattle } from '/src/render/storyBattle.ts';
  // A stocked arsenal (the real ids' styles/damage), hand-authored so the preview needs no StoryState.
  const LOADOUT = {
    weapons: [
      { id: 'upg:weapon:scatter', name: 'SCATTER', style: 'scatter', damage: 8, cooldownMs: 1400, color: '#ffd36b', color2: '#fff2c0' },
      { id: 'upg:weapon:railgun', name: 'RAILGUN', style: 'railgun', damage: 18, cooldownMs: 3000, color: '#ff6b5a', color2: '#fff2c0' },
      { id: 'upg:weapon:nova', name: 'NOVA', style: 'nova', damage: 34, cooldownMs: 6200, color: '#ffd76b', color2: '#4fe0b0' },
      { id: 'upg:weapon:starlance', name: 'LANCE', style: 'lance', damage: 34, cooldownMs: 5300, color: '#c8ecff', color2: '#ffffff' },
    ],
    shieldCells: 6,
    shipSpeed: 380,
  };
  window.__mount = (herald, hpFrac, shipId) => {
    window.__done = false;
    window.__handle?.destroy?.();
    window.__handle = mountStoryBattle({
      won: true,
      loadout: LOADOUT,
      shipId,
      interactive: false,
      herald,
      startHpFrac: hpFrac,
      onDone: () => { window.__done = true; },
    });
  };
  window.__ready = true;
</script></body>`;

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const srv = http.createServer((req, res) => { const path = req.url.split('?')[0]; if (path === '/' || path === '/index.html') { res.setHeader('content-type', 'text/html'); res.end(html); return; } vite.middlewares(req, res); });
await new Promise((ok) => srv.listen(0, ok));
const port = srv.address().port;
const exe = findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe, args: ['--no-sandbox'] } : {});
const page = await browser.newPage({ viewport: { width: 1100, height: 660 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction('window.__ready === true', { timeout: 60000 });

/** Mount a state, wait, screenshot, tear down. */
async function shot(name, { herald = false, hpFrac = 1, shipId, waits }) {
  await page.evaluate(({ h, f, s }) => window.__mount(h, f, s), { h: herald, f: hpFrac, s: shipId });
  for (const [ms, suffix] of waits) {
    await page.waitForTimeout(ms);
    await page.screenshot({ path: join(outDir, `${name}${suffix ? '-' + suffix : ''}.png`) });
  }
  await page.evaluate(() => window.__handle?.destroy?.());
}

// The Warden fight, phase by phase (hauler ship — a mid-fleet ride).
await shot('warden-1-open', { hpFrac: 1, shipId: 'hauler-barge', waits: [[2400, '']] });
await shot('warden-2-acid', { hpFrac: 0.74, shipId: 'hauler-barge', waits: [[3400, '']] });
await shot('warden-3-lightning', { hpFrac: 0.48, shipId: 'hauler-barge', waits: [[3600, '']] });
await shot('warden-4-void', { hpFrac: 0.22, shipId: 'hauler-barge', waits: [[3600, '']] });
// The overwhelm fires as soon as the autopilot's first volley lands below 5% (waits are DELTAS).
await shot('warden-5-overwhelm', { hpFrac: 0.055, shipId: 'hauler-barge', waits: [[3300, ''], [3200, 'aim'], [1500, 'climax']] });
// The Herald fight (saucer) — a DIFFERENT boss (GS-story-warden-ark): the Warden Ark's flak, spinal
// lances and torpedoes, the hull taking visible damage, then the bared reactor core + the climax.
await shot('herald-1-open', { herald: true, hpFrac: 1, shipId: 'ufo-saucer', waits: [[2600, '']] });
await shot('herald-2-flak', { herald: true, hpFrac: 0.74, shipId: 'ufo-saucer', waits: [[3400, '']] });
await shot('herald-3-lance', { herald: true, hpFrac: 0.48, shipId: 'ufo-saucer', waits: [[3600, '']] });
await shot('herald-4-torpedo', { herald: true, hpFrac: 0.22, shipId: 'ufo-saucer', waits: [[3600, '']] });
await shot('herald-5-overwhelm', { herald: true, hpFrac: 0.055, shipId: 'ufo-saucer', waits: [[3300, ''], [3200, 'aim'], [1500, 'climax']] });

// GS-story-battle-portrait: the same fight on a PHONE, where the arena turns 90° — the boss at the top,
// your ship at the bottom, and the HUD upright in the bands the turn opens up. Same states, so the two
// sets can be read side by side.
await page.setViewportSize({ width: 390, height: 844 });
await shot('portrait-1-open', { hpFrac: 1, shipId: 'hauler-barge', waits: [[2400, '']] });
await shot('portrait-2-lightning', { hpFrac: 0.48, shipId: 'hauler-barge', waits: [[3600, '']] });
await shot('portrait-3-void', { hpFrac: 0.22, shipId: 'hauler-barge', waits: [[3600, '']] });
await shot('portrait-4-overwhelm', { hpFrac: 0.055, shipId: 'hauler-barge', waits: [[3300, ''], [3200, 'aim'], [1500, 'climax']] });
await shot('portrait-5-herald', { herald: true, hpFrac: 0.48, shipId: 'ufo-saucer', waits: [[3600, '']] });

console.log('battle preview →', outDir);
await browser.close();
srv.close();
await vite.close();
process.exit(0);
