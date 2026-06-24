/**
 * App entry — the thin render/orchestration layer over the pure sim.
 *
 * Plays the first hole of the current stop with the animated Canvas2D ball-flight view,
 * alongside the run/scorecard state. Everything interesting happens in `src/sim/`; this
 * file just wires pure state into the renderers. Interactive route/shop screens are GS-8.
 */

import { Rng } from './sim/rng';
import { holeYardage } from './sim/course/generate';
import { playCourse } from './sim/round';
import { playTotals, scoreName } from './sim/score';
import { mountPlayView } from './render/playView';
import { rarCol } from './sim/rpg/loot';
import { cutLine } from './sim/rpg/economy';
import { currentCourse, routeOptions, simulateRun, startRun } from './sim/rpg/run';

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
  const run = startRun(seed);
  const course = currentCourse(run);
  const hole = course.holes[0]!;

  const played = playCourse(course.holes, new Rng(`${course.seed}:play`));
  const holePlay = played[0]!;
  const totals = playTotals(played.map((p) => p.record));
  const cut = cutLine(run.distanceFromStart, course.holes.length);
  const passed = totals.stableford >= cut;
  const outcome = simulateRun(seed);
  const routes = routeOptions(run);
  const accent = rarCol(course.rarity);

  app.innerHTML = `
    <main style="font-family:system-ui,sans-serif;max-width:820px;margin:0 auto;padding:16px;color:#e8e8ea;background:#0b0d12;min-height:100vh;">
      <header style="display:flex;align-items:baseline;gap:12px;border-left:4px solid ${accent};padding-left:10px;">
        <h1 style="margin:0;font-size:22px;">⛳ Golf Stars</h1>
        <span style="opacity:.8;">${course.meta.name}</span>
        <span style="margin-left:auto;color:${accent};text-transform:uppercase;font-size:12px;letter-spacing:1px;">${course.rarity}</span>
      </header>
      <p style="opacity:.75;font-size:14px;">
        Stop ${run.stopIndex + 1} · Biome <b>${course.biome}</b> · Distance ${run.distanceFromStart}
        · Wildness ${course.meta.wildness.toFixed(2)} · Credits <b>${run.credits}</b>
      </p>
      <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
        <div>
          <div id="play" style="border:1px solid #222;border-radius:10px;overflow:hidden;width:360px;height:640px;"></div>
          <button id="replay" style="margin-top:8px;width:100%;padding:8px;border-radius:8px;border:1px solid #333;background:#1a1d26;color:#e8e8ea;font-size:14px;cursor:pointer;">↻ Replay hole 1</button>
        </div>
        <section style="flex:1 1 260px;min-width:260px;">
          <h2 style="font-size:16px;margin:.2em 0;">${course.holes.length}-hole course · Hole 1 (Par ${hole.par}, ${holeYardage(hole)} yds)</h2>
          <ul style="list-style:none;padding:0;line-height:1.8;font-size:15px;">
            <li>Hole 1: <b>${holePlay.record.strokes}</b> (${scoreName(hole.par, holePlay.record.strokes)})</li>
            <li>Course Stableford: <b>${totals.stableford}</b> vs cut <b>${cut}</b>
              — <b style="color:${passed ? '#5fd45a' : '#ff6b6b'}">${passed ? 'MADE THE CUT' : 'MISSED CUT'}</b></li>
            <li>Wind: <b>${hole.wind?.spd.toFixed(0) ?? 0} mph</b> @ ${hole.wind?.dir.toFixed(0) ?? 0}°</li>
          </ul>
          <h3 style="font-size:14px;margin:.6em 0 .2em;">Onward routes</h3>
          <ul style="list-style:none;padding:0;line-height:1.6;font-size:14px;opacity:.9;">
            ${routes.map((r) => `<li>↗ ${r.label} (+${r.distanceJump} distance)</li>`).join('')}
          </ul>
          <p style="opacity:.65;font-size:13px;margin-top:1em;">
            Auto-pilot reaches <b>stop ${outcome.run.stopIndex + 1}</b>, distance
            <b>${outcome.run.distanceFromStart}</b>. Reproducible — try <code>?seed=42</code>.
          </p>
        </section>
      </div>
    </main>
  `;

  const playEl = document.getElementById('play')!;
  const view = mountPlayView(playEl, hole, holePlay.shots, { biome: course.biome });
  document.getElementById('replay')!.addEventListener('click', () => view.replay());
}

boot();
