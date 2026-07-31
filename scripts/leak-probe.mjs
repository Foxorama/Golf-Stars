/**
 * Shot-lag leak probe (GS-shot-lag). Plays holes back-to-back in the BUILT game and samples, per
 * hole, what has ACCUMULATED:
 *   - CDP DOM counters (nodes / jsEventListeners / documents) — counts DETACHED-but-retained nodes
 *   - JS heap before AND after a forced GC (post-GC growth = a real leak, pre-GC = churn)
 *   - live rAF callbacks per second, bucketed by requesting call site
 *   - live intervals, WebAudio node creations, canvas/svg counts
 *   - frame times sampled DURING a shot/putt animation (where the lag is reported)
 *
 * Usage: node scripts/leak-probe.mjs   (HOLES=12 to go deeper; the browser comes from chromium.mjs)
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChromium } from './chromium.mjs';


const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.html');
const HOLES = Number(process.env.HOLES || 10);

const INSTRUMENT = () => {
  const g = {
    fires: 0,
    bySite: Object.create(null),
    liveIntervals: new Set(),
    frames: [],
    audioNodes: 0,
    audioByKind: Object.create(null),
    canvasesMade: 0,
    utterances: 0,
  };
  window.__gs = g;
  const site = () => {
    const s = (new Error().stack || '').split('\n');
    return s.slice(2, 4).map((l) => l.trim().replace(/^at /, '')).join(' <- ');
  };
  const rawRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function rafWrap(cb) {
    const s = site();
    return rawRAF((t) => {
      g.fires++;
      g.bySite[s] = (g.bySite[s] || 0) + 1;
      return cb(t);
    });
  };
  const rawSI = window.setInterval.bind(window);
  const rawCI = window.clearInterval.bind(window);
  window.setInterval = function (fn, ms, ...a) {
    const id = rawSI(fn, ms, ...a);
    g.liveIntervals.add(id);
    return id;
  };
  window.clearInterval = function (id) {
    g.liveIntervals.delete(id);
    return rawCI(id);
  };

  // WebAudio node census — an assetless synth that forgets to stop a node keeps it alive forever.
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    for (const m of Object.getOwnPropertyNames(AC.prototype).filter((n) => n.startsWith('create'))) {
      const raw = AC.prototype[m];
      if (typeof raw !== 'function') continue;
      AC.prototype[m] = function (...a) {
        g.audioNodes++;
        g.audioByKind[m] = (g.audioByKind[m] || 0) + 1;
        return raw.apply(this, a);
      };
    }
  }
  const rawCreate = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...rest) {
    if (String(tag).toLowerCase() === 'canvas') g.canvasesMade++;
    return rawCreate.call(this, tag, ...rest);
  };
  if (window.SpeechSynthesisUtterance) {
    const RawU = window.SpeechSynthesisUtterance;
    window.SpeechSynthesisUtterance = function (...a) {
      g.utterances++;
      return new RawU(...a);
    };
  }

  let last = performance.now();
  const beat = (t) => {
    g.frames.push(t - last);
    if (g.frames.length > 600) g.frames.shift();
    last = t;
    rawRAF(beat);
  };
  rawRAF(beat);
};

const browser = await launchChromium({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.enable');
await page.addInitScript(INSTRUMENT);
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
await page.waitForTimeout(600);

const counters = async () => {
  return await cdp.send('Memory.getDOMCounters');
};

// `performance.memory` is bucketed for fingerprinting reasons and reads as a suspiciously constant
// number; `Runtime.getHeapUsage` after a forced GC is the precise one, and post-GC growth is what
// distinguishes a real leak from ordinary churn.
const heapAfterGC = async () => {
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return +(usedSize / 1048576).toFixed(2);
};

const rows = [];
const sample = async (label) => {
  await page.evaluate(() => {
    window.__gs.fires = 0;
    window.__gs.bySite = Object.create(null);
    window.__gs.frames.length = 0;
  });
  await page.waitForTimeout(1000);
  const dom = await counters();
  const gcHeap = await heapAfterGC();
  const m = await page.evaluate(() => {
    const g = window.__gs;
    const f = g.frames.slice().sort((a, b) => a - b);
    return {
      fps: f.length,
      p95: +(f[Math.floor(f.length * 0.95)] ?? 0).toFixed(1),
      rafFires: g.fires,
      loops: Object.keys(g.bySite).length,
      top: Object.entries(g.bySite).sort((a, b) => b[1] - a[1]).slice(0, 5),
      intervals: g.liveIntervals.size,
      audioNodes: g.audioNodes,
      canvasesMade: g.canvasesMade,
      utterances: g.utterances,
      liveCanvas: document.getElementsByTagName('canvas').length,
      liveSvg: document.getElementsByTagName('svg').length,
      nodesInDoc: document.getElementsByTagName('*').length,
      screen: document.querySelector('[data-playmode]')?.getAttribute('data-playmode') ?? 'other',
    };
  });
  const row = { label, ...m, domNodes: dom.nodes, domListeners: dom.jsEventListeners, gcHeap };
  rows.push(row);
  console.log(
    `${label.padEnd(26)} | scr=${row.screen.padEnd(5)} fps=${String(row.fps).padStart(3)} p95=${String(row.p95).padStart(6)}ms | loops=${row.loops} raf/s=${String(row.rafFires).padStart(4)} | DOMnodes=${String(row.domNodes).padStart(6)} listeners=${String(row.domListeners).padStart(5)} | heapGC=${String(row.gcHeap).padStart(7)}MB | canvasMade=${row.canvasesMade} live=${row.liveCanvas} svg=${row.liveSvg} | audio=${row.audioNodes} utt=${row.utterances}`,
  );
  if (row.loops > 1) console.log('   loops:', JSON.stringify(row.top));
  return row;
};

// Sample frame times DURING an animation window (the reported lag site).
const sampleDuringAnim = async (label) => {
  await page.evaluate(() => {
    window.__gs.frames.length = 0;
  });
  await page.waitForTimeout(1400);
  const m = await page.evaluate(() => {
    const f = window.__gs.frames.slice().sort((a, b) => a - b);
    return {
      n: f.length,
      p50: +(f[Math.floor(f.length * 0.5)] ?? 0).toFixed(1),
      p95: +(f[Math.floor(f.length * 0.95)] ?? 0).toFixed(1),
      max: +(f[f.length - 1] ?? 0).toFixed(1),
    };
  });
  console.log(`   ANIM ${label}: frames=${m.n} p50=${m.p50}ms p95=${m.p95}ms max=${m.max}ms`);
  return m;
};

await sample('start (hole 1 aim)');

for (let h = 1; h <= HOLES; h++) {
  const auto = page.locator('[title="Auto-finish this hole"]:not([disabled])').first();
  if (await auto.count()) {
    await auto.click({ timeout: 4000 }).catch(() => {});
    await sampleDuringAnim(`hole ${h} playing out`);
  }
  // Advance until a fresh playable screen appears (clicking through recaps / travel / shop).
  const t0 = Date.now();
  let landed = false;
  while (Date.now() - t0 < 60000) {
    await page.waitForTimeout(350);
    const st = await page.evaluate(() => ({
      mode: document.querySelector('[data-playmode]')?.getAttribute('data-playmode') ?? null,
      autoOk: !!document.querySelector('[title="Auto-finish this hole"]:not([disabled])'),
    }));
    if (st.mode && st.autoOk) {
      landed = true;
      break;
    }
    const labels = ['Tee Off', 'Next hole', 'Continue', 'Play on', 'Onward', 'Jump', 'Travel', 'Next', 'Skip'];
    let clicked = false;
    for (const l of labels) {
      const b = page.locator(`button:not([disabled])`, { hasText: l }).first();
      if (await b.count()) {
        await b.click({ timeout: 1500 }).then(() => (clicked = true)).catch(() => {});
        if (clicked) break;
      }
    }
    if (!clicked) {
      const any = page.locator('[data-gs-overlay] button, [data-gs-overlay]').first();
      if (await any.count()) await any.click({ timeout: 1200 }).catch(() => {});
    }
  }
  await sample(`after hole ${h}${landed ? '' : ' (LOST)'}`);
  if (!landed) break;
}

console.log('\n--- growth ---');
const a = rows[0];
const z = rows[rows.length - 1];
console.log(`DOM nodes  ${a.domNodes} -> ${z.domNodes}   (+${z.domNodes - a.domNodes})`);
console.log(`listeners  ${a.domListeners} -> ${z.domListeners}   (+${z.domListeners - a.domListeners})`);
console.log(`heap (GC)  ${a.gcHeap} -> ${z.gcHeap} MB   (+${(z.gcHeap - a.gcHeap).toFixed(2)})`);
console.log(`canvases made ${a.canvasesMade} -> ${z.canvasesMade}`);
console.log(`audio nodes   ${a.audioNodes} -> ${z.audioNodes}`);

await browser.close();
