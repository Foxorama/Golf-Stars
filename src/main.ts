/**
 * App entry — the interactive shell over the pure run reducer (`ui/game.ts`).
 *
 * Renders the current screen, wires button clicks to reducer actions, and persists the
 * save after each action. All game logic lives in the pure sim/reducer; this file is just
 * DOM + the canvas play view + localStorage glue.
 */

import { scoreName } from './sim/score';
import { renderHoleSVG } from './render/holeView';
import { mountPlayView, type PlayViewHandle } from './render/playView';
import { rarCol } from './sim/rpg/loot';
import { cutLine, SHOP_ITEMS } from './sim/rpg/economy';
import { snapshotRun, resumeRun } from './sim/rpg/run';
import { initState, reduce, type Action, type UiState } from './ui/game';
import { loadSave, writeSave } from './save/storage';

function seedFromUrl(): number | string | null {
  const q = new URLSearchParams(location.search).get('seed');
  if (q === null) return null;
  const n = Number(q);
  return Number.isFinite(n) && q.trim() !== '' ? n : q;
}

let state: UiState;
let view: PlayViewHandle | null = null;

function boot(): void {
  const save = loadSave();
  const meta = { bestStableford: save.bestStableford, bestDistance: save.bestDistance };
  const urlSeed = seedFromUrl();
  if (urlSeed !== null) {
    state = initState(urlSeed, meta);
  } else if (save.activeRun) {
    state = initState(resumeRun(save.activeRun), meta);
  } else {
    state = initState(1234, meta);
  }
  render();
}

function persist(): void {
  writeSave({
    version: 2,
    credits: 0,
    bestStableford: state.bestStableford,
    bestDistance: state.bestDistance,
    activeRun: state.run.status === 'active' ? snapshotRun(state.run) : undefined,
  });
}

function dispatch(action: Action): void {
  if (view) {
    view.destroy();
    view = null;
  }
  state = reduce(state, action);
  persist();
  render();
}

const btn = (label: string, action: Action, opts: { disabled?: boolean } = {}): string =>
  `<button data-action='${JSON.stringify(action)}'${opts.disabled ? ' disabled' : ''}
     style="padding:9px 12px;border-radius:8px;border:1px solid #333;background:${opts.disabled ? '#15171d' : '#1d212c'};
     color:${opts.disabled ? '#666' : '#e8e8ea'};font-size:14px;cursor:${opts.disabled ? 'default' : 'pointer'};margin:3px 4px 3px 0;">${label}</button>`;

function header(): string {
  const r = state.run;
  return `
    <header style="display:flex;align-items:baseline;gap:12px;border-left:4px solid ${rarCol(state.course.rarity)};padding-left:10px;">
      <h1 style="margin:0;font-size:22px;">⛳ Golf Stars</h1>
      <span style="margin-left:auto;font-size:13px;opacity:.8;">
        Stop ${r.stopIndex + 1} · Dist ${r.distanceFromStart} · Credits <b>${r.credits}</b>
        · Best dist ${state.bestDistance} · Best SF ${state.bestStableford}
      </span>
    </header>`;
}

function introScreen(): string {
  const c = state.course;
  const cut = cutLine(c.meta.distanceFromStart, c.holes.length);
  const par = c.holes.reduce((s, h) => s + h.par, 0);
  const preview = renderHoleSVG(c.holes[0]!, { width: 320, height: 460, biome: c.biome });
  return `
    ${header()}
    <p style="opacity:.8;">Arrived at <b>${c.meta.name}</b> — <span style="color:${rarCol(c.rarity)};text-transform:uppercase;">${c.rarity}</span>
      · biome <b>${c.biome}</b> · wildness ${c.meta.wildness.toFixed(2)}</p>
    <div style="display:flex;gap:20px;flex-wrap:wrap;">
      <div style="border:1px solid #222;border-radius:10px;overflow:hidden;">${preview}</div>
      <section style="flex:1 1 240px;">
        <p style="font-size:15px;">${c.holes.length} holes · Par ${par} · make <b>${cut}</b> Stableford to survive the cut.</p>
        ${btn('▶ Play this stop', { type: 'play' })}
      </section>
    </div>`;
}

function scorecard(): string {
  if (!state.played) return '';
  const rows = state.played
    .map((p, i) => {
      const sel = i === state.viewHole;
      return `<tr style="cursor:pointer;${sel ? 'background:#1d212c;' : ''}" data-action='${JSON.stringify({ type: 'viewHole', hole: i })}'>
        <td style="padding:2px 8px;">${i + 1}</td><td>${p.record.par}</td>
        <td><b>${p.record.strokes}</b></td><td style="opacity:.8;">${scoreName(p.record.par, p.record.strokes)}</td></tr>`;
    })
    .join('');
  return `<table style="border-collapse:collapse;font-size:13px;width:100%;">
    <tr style="opacity:.6;text-align:left;"><th style="padding:2px 8px;">#</th><th>Par</th><th>Score</th><th></th></tr>${rows}</table>`;
}

function resultScreen(): string {
  const res = state.lastResult!;
  return `
    ${header()}
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
      <div>
        <div id="play" style="border:1px solid #222;border-radius:10px;overflow:hidden;width:340px;height:520px;"></div>
        <div style="margin-top:6px;">
          ${btn('↻ Replay', { type: 'viewHole', hole: state.viewHole })}
          <span style="font-size:12px;opacity:.6;">click a row to watch that hole</span>
        </div>
      </div>
      <section style="flex:1 1 240px;min-width:240px;">
        <h2 style="font-size:16px;margin:.2em 0;color:${res.passed ? '#5fd45a' : '#ff6b6b'};">
          ${res.passed ? 'MADE THE CUT' : 'MISSED CUT'}</h2>
        <p style="font-size:15px;">Stableford <b>${res.stableford}</b> vs cut <b>${res.cut}</b>
          · gross ${res.gross} · <b>+${res.creditsEarned}</b> credits</p>
        ${scorecard()}
        <div style="margin-top:10px;">${btn('Continue → shop', { type: 'continue' })}</div>
      </section>
    </div>`;
}

function shopScreen(): string {
  const owned = new Set(state.run.loadout.perks);
  const items = SHOP_ITEMS.map((it) => {
    const have = owned.has(it.id);
    const afford = state.run.credits >= it.cost;
    const label = `${it.name} — ${it.cost}c<br><span style="font-size:12px;opacity:.7;">${it.desc}${have ? ' (owned)' : ''}</span>`;
    return btn(label, { type: 'buy', id: it.id }, { disabled: have || !afford });
  }).join('');
  return `
    ${header()}
    <h2 style="font-size:16px;">Outfitter · ${state.run.credits} credits</h2>
    <div style="display:flex;flex-wrap:wrap;">${items}</div>
    <div style="margin-top:12px;">${btn('Travel onward →', { type: 'leaveShop' })}</div>`;
}

function travelScreen(): string {
  const routes = (state.routes ?? [])
    .map((r) => btn(`↗ ${r.label} (+${r.distanceJump} distance)`, { type: 'route', routeId: r.id }))
    .join('');
  return `
    ${header()}
    <h2 style="font-size:16px;">Choose your jump</h2>
    <p style="opacity:.75;font-size:14px;">Deeper jumps mean a higher cut and wilder courses.</p>
    <div>${routes}</div>`;
}

function gameoverScreen(): string {
  const r = state.run;
  return `
    ${header()}
    <h2 style="font-size:20px;color:#ff6b6b;">Run over — stranded at the cut</h2>
    <p style="font-size:15px;">You reached <b>stop ${r.stopIndex + 1}</b>, distance <b>${r.distanceFromStart}</b>.</p>
    <p style="opacity:.8;">Best ever: distance <b>${state.bestDistance}</b>, Stableford <b>${state.bestStableford}</b>.</p>
    ${btn('🚀 New run', { type: 'restart', seed: Math.floor(Math.random() * 1e9) })}`;
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  const body =
    state.screen === 'intro'
      ? introScreen()
      : state.screen === 'result'
        ? resultScreen()
        : state.screen === 'shop'
          ? shopScreen()
          : state.screen === 'travel'
            ? travelScreen()
            : gameoverScreen();

  app.innerHTML = `<main style="font-family:system-ui,sans-serif;max-width:820px;margin:0 auto;padding:16px;color:#e8e8ea;background:#0b0d12;min-height:100vh;">${body}</main>`;

  // Wire actions.
  app.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
    el.addEventListener('click', () => dispatch(JSON.parse(el.dataset.action!) as Action));
  });

  // Mount the animated play view on the result screen.
  if (state.screen === 'result' && state.played) {
    const playEl = document.getElementById('play');
    const holePlay = state.played[state.viewHole];
    const hole = state.course.holes[state.viewHole];
    if (playEl && holePlay && hole) {
      view = mountPlayView(playEl, hole, holePlay.shots, {
        width: 340,
        height: 520,
        biome: state.course.biome,
      });
    }
  }
}

boot();
