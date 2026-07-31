/**
 * GS-shot-lag: CPU profile of a real watched shot in the BUILT game.
 *
 * Drives to a tee, starts the V8 sampling profiler, auto-finishes the hole (so the whole shot →
 * roll → putt sequence animates), then aggregates SELF time by function so the per-frame cost is
 * measured rather than guessed. Build unminified first for readable names:
 *   npx vite build --minify false
 */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const chromePath = process.env.CHROME_PATH;
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.html');
const CPU_THROTTLE = Number(process.env.THROTTLE || 1);

const browser = await chromium.launch({ executablePath: chromePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
if (CPU_THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });

await page.goto('file://' + dist + '?intro=0&seed=42', { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('app')?.getAttribute('data-booted') === '1', { timeout: 20000 });
const click = async (t) => {
  await page.locator('button', { hasText: t }).first().click();
  await page.waitForTimeout(300);
};
await page.locator('[data-action*="unending"]').first().click();
await page.waitForTimeout(400);
await click('as Feather');
await click('First Tee');
await click('Tee Off');
await page.waitForSelector('[data-playmode]', { timeout: 20000 });
await page.waitForTimeout(800);

// Frame-time tracker over the profiled window.
await page.evaluate(() => {
  window.__ft = [];
  let last = performance.now();
  const b = (t) => {
    window.__ft.push(t - last);
    last = t;
    requestAnimationFrame(b);
  };
  requestAnimationFrame(b);
});

await cdp.send('Profiler.start');
await page.locator('[title="Auto-finish this hole"]:not([disabled])').first().click().catch(() => {});
await page.waitForTimeout(6000);
const { profile } = await cdp.send('Profiler.stop');

const ft = await page.evaluate(() => {
  const f = window.__ft.slice().sort((a, b) => a - b);
  return { n: f.length, p50: f[(f.length / 2) | 0], p95: f[(f.length * 0.95) | 0], max: f[f.length - 1] };
});
console.log(
  `frames over the profiled window: n=${ft.n} p50=${ft.p50?.toFixed(1)}ms p95=${ft.p95?.toFixed(1)}ms max=${ft.max?.toFixed(1)}ms  (CPU throttle ${CPU_THROTTLE}x)`,
);

// Aggregate self time per node.
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const total = profile.samples.length;
for (const s of profile.samples) {
  const n = byId.get(s);
  if (!n) continue;
  const cf = n.callFrame;
  const key = `${cf.functionName || '(anon)'}  ${String(cf.url).split('/').pop()}:${cf.lineNumber}`;
  self.set(key, (self.get(key) || 0) + 1);
}
const durMs = (profile.endTime - profile.startTime) / 1000;
console.log(`\nprofile ${durMs.toFixed(0)}ms, ${total} samples — SELF time:\n`);
for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(`${((v / total) * 100).toFixed(1).padStart(5)}%  ${((v / total) * durMs).toFixed(0).padStart(5)}ms  ${k}`);
}

// Also aggregate TOTAL (inclusive) time for the top-level suspects by walking parents.
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const inclusive = new Map();
for (const s of profile.samples) {
  const seen = new Set();
  let id = s;
  while (id != null) {
    const n = byId.get(id);
    if (!n) break;
    const key = n.callFrame.functionName || '(anon)';
    if (!seen.has(key)) {
      inclusive.set(key, (inclusive.get(key) || 0) + 1);
      seen.add(key);
    }
    id = parent.get(id);
  }
}
console.log(`\nINCLUSIVE time (top 25):\n`);
for (const [k, v] of [...inclusive.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`${((v / total) * 100).toFixed(1).padStart(5)}%  ${((v / total) * durMs).toFixed(0).padStart(5)}ms  ${k}`);
}

await browser.close();
