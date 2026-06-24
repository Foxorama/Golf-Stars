/**
 * App entry — the thin render/orchestration layer over the pure sim.
 *
 * Vertical slice: generate one course from a seed, draw the hole, play it headlessly,
 * and show the scorecard. Everything interesting happens in `src/sim/`; this file only
 * reads sim state and paints it.
 */

import { Rng } from './sim/rng';
import { generateCourse, holeYardage } from './sim/course/generate';
import { playHole } from './sim/round';
import { playTotals, scoreName } from './sim/score';
import { renderHoleSVG } from './render/holeView';
import { rarCol } from './sim/rpg/loot';

function seedFromUrl(): number | string {
  const q = new URLSearchParams(location.search).get('seed');
  if (q === null) return 1234;
  const n = Number(q);
  return Number.isFinite(n) && q.trim() !== '' ? n : q;
}

function boot(): void {
  const app = document.getElementById('app');
  if (!app) return;

  const seed = seedFromUrl();
  const course = generateCourse(seed);
  const hole = course.holes[0]!;

  // Play it headlessly with a generator forked off the same seed (reproducible).
  const playRng = new Rng(`${course.seed}:play`);
  const played = playHole(hole, playRng);
  const totals = playTotals([played.record]);

  const accent = rarCol(course.rarity);
  const svg = renderHoleSVG(hole, { shots: played.shots, biome: course.biome });

  app.innerHTML = `
    <main style="font-family:system-ui,sans-serif;max-width:760px;margin:0 auto;padding:16px;color:#e8e8ea;background:#0b0d12;min-height:100vh;">
      <header style="display:flex;align-items:baseline;gap:12px;border-left:4px solid ${accent};padding-left:10px;">
        <h1 style="margin:0;font-size:22px;">⛳ Golf Stars</h1>
        <span style="opacity:.8;">${course.meta.name}</span>
        <span style="margin-left:auto;color:${accent};text-transform:uppercase;font-size:12px;letter-spacing:1px;">${course.rarity}</span>
      </header>
      <p style="opacity:.75;font-size:14px;">
        Biome: <b>${course.biome}</b> · Seed: <code>${course.seed}</code> ·
        Wildness: ${course.meta.wildness.toFixed(2)}
      </p>
      <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
        <div style="flex:0 0 auto;border-radius:10px;overflow:hidden;border:1px solid #222;">${svg}</div>
        <section style="flex:1 1 220px;min-width:220px;">
          <h2 style="font-size:16px;margin:.2em 0;">Hole 1 — Par ${hole.par}</h2>
          <ul style="list-style:none;padding:0;line-height:1.8;font-size:15px;">
            <li>Yardage: <b>${holeYardage(hole)}</b> yds</li>
            <li>Wind: <b>${hole.wind?.spd.toFixed(0) ?? 0} mph</b> @ ${hole.wind?.dir.toFixed(0) ?? 0}°</li>
            <li>Strokes: <b>${played.record.strokes}</b> (${scoreName(hole.par, played.record.strokes)})</li>
            <li>Stableford: <b>${totals.stableford}</b> pts</li>
            <li>Putts: <b>${played.stat.putts}</b> · Penalties: <b>${played.stat.penalties}</b></li>
          </ul>
          <p style="opacity:.6;font-size:13px;">
            This run is fully reproducible from the seed. Try <code>?seed=42</code> in the URL.
          </p>
        </section>
      </div>
    </main>
  `;
}

boot();
