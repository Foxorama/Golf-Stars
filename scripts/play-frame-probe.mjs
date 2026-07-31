/**
 * GS-decision-frame-carry measurement rig.
 *
 * Drives the BUILT game to a real aim screen at several viewports and reads, off the DOM:
 *   - the map container box, the top info chip and the bottom control panel (the clear band)
 *   - the aim overlay group's bbox (the spray cone + the drawn run-out line)
 * so "how far above the top chip does the shot's far end sit" is measured, not derived.
 *
 * Reports, per viewport: the overlay's top edge in container px, and its clearance under the chip.
 * Negative clearance = the far arc of the cone is drawn BEHIND the top HUD bar.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChromium } from './chromium.mjs';


const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.html');

// The viewports that matter: the composed phone, the small phone, the itch embed's default desktop
// frame, a 1366x768 laptop in fullscreen, and a big desktop.
const VIEWPORTS = [
  ['iPhone 14', 390, 844],
  ['small phone', 320, 568],
  ['itch embed', 820, 760],
  ['laptop 1366x768', 1366, 768],
  ['desktop 1920x1080', 1920, 1080],
];

// Holes to sample: shot 1 (driver off the tee) and after one shot (an approach club).
const browser = await launchChromium({ args: ['--no-sandbox'] });
const rows = [];
try {
  for (const [label, width, height] of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', {
      timeout: 15000,
    });
    const click = async (t) => {
      await page.locator('button', { hasText: t }).first().click();
      await page.waitForTimeout(320);
    };
    await click('The Voyage');
    await click('Voyage as Feather');
    await click('First Tee');
    await click('Tee Off');
    await page.waitForSelector('[data-playmode="aim"]', { timeout: 15000 });
    await page.waitForTimeout(500); // let the band measure + re-render settle

    for (const shot of [1, 2]) {
      if (shot === 2) {
        await page.locator('[data-swing]').first().click();
        await page.waitForSelector('[data-playmode="aim"]', { timeout: 20000 });
        await page.waitForTimeout(700);
      }
      const m = await page.evaluate(() => {
        const shotEl = document.querySelector('.gs-shot--full[data-playmode]');
        const map = shotEl?.querySelector('.gs-bigmap');
        const svg = map?.querySelector('svg');
        const chip = shotEl?.querySelector('.gs-hud-top');
        const panel = shotEl?.querySelector('.gs-hud-bottom');
        const overlay = document.getElementById('gs-shot-overlay');
        if (!shotEl || !map || !svg || !chip || !panel) return null;
        const host = map.getBoundingClientRect();
        const c = chip.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        const o = overlay?.getBoundingClientRect();
        const club = document.querySelector('.gs-hud-bagclub')?.textContent ?? '?';
        return {
          host: { w: Math.round(host.width), h: Math.round(host.height) },
          viewBox: svg.getAttribute('viewBox'),
          chipBottom: Math.round(c.bottom - host.top),
          panelTop: Math.round(p.top - host.top),
          overlayTop: o ? Math.round(o.top - host.top) : null,
          overlayBottom: o ? Math.round(o.bottom - host.top) : null,
          club: club.trim(),
        };
      });
      rows.push({ label, width, height, shot, ...m });
    }
    await page.close();
  }
} finally {
  await browser.close();
}

const pad = (s, n) => String(s).padEnd(n);
console.log(
  pad('viewport', 20) + pad('shot', 5) + pad('club', 6) + pad('map', 12) + pad('chipBot', 9) +
    pad('panelTop', 10) + pad('bias', 7) + pad('coneTop', 9) + 'clearance',
);
for (const r of rows) {
  const bias = Math.max(0.5, Math.min(0.84, (r.panelTop - 28) / r.host.h));
  const clear = r.overlayTop === null ? '—' : r.overlayTop - r.chipBottom;
  console.log(
    pad(r.label, 20) + pad(r.shot, 5) + pad(r.club, 6) + pad(`${r.host.w}x${r.host.h}`, 12) +
      pad(r.chipBottom, 9) + pad(r.panelTop, 10) + pad(bias.toFixed(3), 7) +
      pad(r.overlayTop ?? '—', 9) + clear,
  );
}
