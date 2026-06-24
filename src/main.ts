/**
 * App entry — the thin render/orchestration layer over the pure sim.
 *
 * Shows the RPG meta-loop: the current stop's course + scorecard vs the cut line, the
 * run state (distance/credits), the onward routes, and where this seed's run ends under
 * a simple "buy nothing, take the first route" auto-pilot. Interactivity (clicking
 * routes / shopping) is a later UI task; everything here just reads pure sim state.
 */

import { Rng } from './sim/rng';
import { holeYardage } from './sim/course/generate';
import { playCourse } from './sim/round';
import { playTotals } from './sim/score';
import { renderHoleSVG } from './render/holeView';
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

  // Play the stop's course headlessly (deterministic).
  const played = playCourse(course.holes, new Rng(`${course.seed}:play`));
  const totals = playTotals(played.map((p) => p.record));
  const cut = cutLine(run.distanceFromStart, course.holes.length);
  const passed = totals.stableford >= cut;

  // Auto-pilot the rest of the run to show where this seed ends.
  const outcome = simulateRun(seed);
  const routes = routeOptions({ ...run });

  const accent = rarCol(course.rarity);
  const svg = renderHoleSVG(hole, { shots: played[0]!.shots, biome: course.biome });

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
        <div style="flex:0 0 auto;border-radius:10px;overflow:hidden;border:1px solid #222;">${svg}</div>
        <section style="flex:1 1 260px;min-width:260px;">
          <h2 style="font-size:16px;margin:.2em 0;">${course.holes.length}-hole course · Hole 1 (Par ${hole.par}, ${holeYardage(hole)} yds)</h2>
          <ul style="list-style:none;padding:0;line-height:1.8;font-size:15px;">
            <li>Stableford: <b>${totals.stableford}</b> pts vs cut <b>${cut}</b>
              — <b style="color:${passed ? '#5fd45a' : '#ff6b6b'}">${passed ? 'MADE THE CUT' : 'MISSED CUT'}</b></li>
            <li>Gross: <b>${totals.gross}</b> (to par ${totals.toPar >= 0 ? '+' : ''}${totals.toPar})</li>
            <li>Credits this stop: <b>${passed ? totals.stableford * 12 : 0}</b></li>
          </ul>
          <h3 style="font-size:14px;margin:.6em 0 .2em;">Onward routes</h3>
          <ul style="list-style:none;padding:0;line-height:1.6;font-size:14px;opacity:.9;">
            ${routes.map((r) => `<li>↗ ${r.label} (+${r.distanceJump} distance)</li>`).join('')}
          </ul>
          <p style="opacity:.65;font-size:13px;margin-top:1em;">
            Auto-pilot (no upgrades, first route) reaches
            <b>stop ${outcome.run.stopIndex + 1}</b>, distance <b>${outcome.run.distanceFromStart}</b>,
            then <b>${outcome.run.endedReason === 'cut' ? 'misses a cut' : 'banks'}</b>.
            Reproducible from the seed — try <code>?seed=42</code>.
          </p>
        </section>
      </div>
    </main>
  `;
}

boot();
