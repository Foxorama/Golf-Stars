// Eyes-on preview for the finale battle (GS-story-battle-3). Mounts mountStoryBattle non-interactively
// (the autopilot flies + fires for itself) at several serpent-health fractions so every PHASE of the
// R-Type fight can be screenshotted — opening assault, ACID SPRAY (75%), +LIGHTNING (50%), +VOID (25%),
// the OVERWHELM (5%), the aim reveal and the climax — for BOTH paths.
//   node scripts/battle-preview.mjs      (OUTDIR=/path to choose the folder)
import { createServer } from 'vite';
import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchChromium } from './chromium.mjs';


const outDir = process.env.OUTDIR ?? join(tmpdir(), 'gs-battle');
mkdirSync(outDir, { recursive: true });



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

const browser = await launchChromium({ args: ['--no-sandbox'] });
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

// GS-story-battle-epic: every fight now OPENS on the 2.8s entrance (the boss looms out of the dark, names
// itself, roars, and the HUD wipes in behind the plate), so each assault-state wait carries `ENTRY` on top
// of the beat it is really waiting for. Keep the two apart — a bare number here is a silent 2.8s error.
const ENTRY = 2800;

// The ENTRANCE itself, beat by beat — the loom, the plate landing, the roar, the HUD wipe.
await shot('warden-0-entrance', {
  hpFrac: 1,
  shipId: 'hauler-barge',
  waits: [[700, 'loom'], [600, 'plate'], [700, 'roar'], [900, 'hud']],
});

// The Warden fight, phase by phase (hauler ship — a mid-fleet ride).
await shot('warden-1-open', { hpFrac: 1, shipId: 'hauler-barge', waits: [[ENTRY + 2400, '']] });
await shot('warden-2-acid', { hpFrac: 0.74, shipId: 'hauler-barge', waits: [[ENTRY + 3400, '']] });
await shot('warden-3-lightning', { hpFrac: 0.48, shipId: 'hauler-barge', waits: [[ENTRY + 3600, '']] });
await shot('warden-4-void', { hpFrac: 0.22, shipId: 'hauler-barge', waits: [[ENTRY + 3600, '']] });
// The overwhelm fires as soon as the autopilot's first volley lands below 5% (waits are DELTAS).
await shot('warden-5-overwhelm', { hpFrac: 0.055, shipId: 'hauler-barge', waits: [[ENTRY + 3300, ''], [3200, 'aim'], [1500, 'climax']] });
// The Herald fight (saucer) — a DIFFERENT boss (GS-story-warden-ark): the Warden Ark's flak, spinal
// lances and torpedoes, the hull taking visible damage, then the bared reactor core + the climax.
await shot('herald-0-entrance', { herald: true, hpFrac: 1, shipId: 'ufo-saucer', waits: [[1300, 'plate'], [1000, 'hud']] });
await shot('herald-1-open', { herald: true, hpFrac: 1, shipId: 'ufo-saucer', waits: [[ENTRY + 2600, '']] });
await shot('herald-2-flak', { herald: true, hpFrac: 0.74, shipId: 'ufo-saucer', waits: [[ENTRY + 3400, '']] });
await shot('herald-3-lance', { herald: true, hpFrac: 0.48, shipId: 'ufo-saucer', waits: [[ENTRY + 3600, '']] });
await shot('herald-4-torpedo', { herald: true, hpFrac: 0.22, shipId: 'ufo-saucer', waits: [[ENTRY + 3600, '']] });
await shot('herald-5-overwhelm', { herald: true, hpFrac: 0.055, shipId: 'ufo-saucer', waits: [[ENTRY + 3300, ''], [3200, 'aim'], [1500, 'climax']] });

// GS-story-battle-portrait: the same fight on a PHONE, where the arena turns 90° — the boss at the top,
// your ship at the bottom, and the HUD upright in the bands the turn opens up. Same states, so the two
// sets can be read side by side.
await page.setViewportSize({ width: 390, height: 844 });
await shot('portrait-0-entrance', {
  hpFrac: 1,
  shipId: 'hauler-barge',
  waits: [[700, 'loom'], [600, 'plate'], [700, 'roar'], [900, 'hud']],
});
await shot('portrait-1-open', { hpFrac: 1, shipId: 'hauler-barge', waits: [[ENTRY + 2400, '']] });
await shot('portrait-2-lightning', { hpFrac: 0.48, shipId: 'hauler-barge', waits: [[ENTRY + 3600, '']] });
await shot('portrait-3-void', { hpFrac: 0.22, shipId: 'hauler-barge', waits: [[ENTRY + 3600, '']] });
await shot('portrait-4-overwhelm', { hpFrac: 0.055, shipId: 'hauler-barge', waits: [[ENTRY + 3300, ''], [3200, 'aim'], [1500, 'climax']] });
await shot('portrait-5-herald', { herald: true, hpFrac: 0.48, shipId: 'ufo-saucer', waits: [[ENTRY + 3600, '']] });

// THE SHIP RAIL (GS-story-battle-arms) — the same fight moment flown by different hulls, so the armaments
// can be compared side by side: mount count, spacing, muzzle flash and trail motif all change with the
// silhouette. A muzzle flash lives ~150ms against an ~800ms autopilot cadence, so each hull is sampled in a
// BURST and the brightest frame is the one to look at — a single wait lands between shots most of the time.
const ARM_BURST = [[ENTRY + 1500, 'a']];
for (let i = 0; i < 8; i++) ARM_BURST.push([110, 'b' + i]);
for (const shipId of ['wagon-classic', 'ufo-mothership', 'racer-redline', 'hauler-barge', 'chopper-thunderbolt', 'comet-rider', 'infinity-ace', 'moto-nitro']) {
  await shot(`arms-${shipId}`, { hpFrac: 0.6, shipId, waits: ARM_BURST });
}

console.log('battle preview →', outDir);
await browser.close();
srv.close();
await vite.close();
process.exit(0);
