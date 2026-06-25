/**
 * App entry — the interactive shell over the pure run reducer (`ui/game.ts`).
 *
 * Renders the current screen, wires button clicks to reducer actions, and persists the
 * save after each action. All game logic lives in the pure sim/reducer; this file is just
 * DOM + the canvas play view + localStorage glue.
 */

import { scoreName } from './sim/score';
import { mountPlayView, type PlayViewHandle } from './render/playView';
import { courseCardHTML, itemCardHTML } from './render/cards';
import { renderHoleSVG } from './render/holeView';
import { shotView } from './sim/rpg/play';
import { rarCol } from './sim/rpg/loot';
import { cutLine, SHOP_ITEMS } from './sim/rpg/economy';
import { FORMATS } from './sim/rpg/formats';
import { snapshotRun } from './sim/rpg/run';
import { initState, reduce, type Action, type UiState } from './ui/game';
import { loadSave, writeSave } from './save/storage';

// Breadcrumb: app.ts's module body reached top level (i.e. all imports above evaluated
// without throwing). If the watchdog ever reports a stage *before* this, the fault is in
// an imported module's top-level eval, not in app.ts.
(window as unknown as { __gsStage?: string }).__gsStage = 'app-top';

function seedFromUrl(): number | string | null {
  const q = new URLSearchParams(location.search).get('seed');
  if (q === null) return null;
  const n = Number(q);
  return Number.isFinite(n) && q.trim() !== '' ? n : q;
}

let state: UiState;
let view: PlayViewHandle | null = null;

/** Diagnostic breadcrumb the boot watchdog can read if the app never paints. */
function stage(s: string): void {
  (window as unknown as { __gsStage?: string }).__gsStage = s;
}

function boot(): void {
  try {
    stage('boot:start');
    const save = loadSave();
    stage('loaded');
    const meta = { bestStableford: save.bestStableford, bestDistance: save.bestDistance };
    const seed = seedFromUrl() ?? 1234;
    // Always land on the title screen; a saved run is offered as "Continue", never
    // auto-resumed — so the format choice is always reachable.
    state = initState(seed, meta, save.activeRun);
    stage('init');
    render();
    stage('rendered');
  } catch (err) {
    recover(err);
  }
}

/**
 * Last-resort guard: a stale/corrupt save or a render fault must never leave a blank
 * page. Clear the active run and fall back to a fresh title screen.
 */
function recover(err: unknown): void {
  console.error('Golf Stars recovered from an error:', err);
  (window as unknown as { __gsErr?: string }).__gsErr = String(
    (err && ((err as Error).stack || (err as Error).message)) || err,
  );
  stage('recover');
  try {
    writeSave({ version: 2, credits: 0, bestStableford: 0, bestDistance: 0 });
  } catch {
    /* ignore */
  }
  try {
    state = initState(1234, {});
    render();
  } catch {
    const app = document.getElementById('app');
    if (app) {
      app.innerHTML =
        '<main style="font-family:system-ui;color:#e8e8ea;background:#0b0d12;padding:24px;min-height:100vh;">⛳ Something went wrong and the save was reset. Refresh to start fresh.</main>';
    }
  }
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
  try {
    state = reduce(state, action);
    persist();
    render();
  } catch (err) {
    recover(err);
  }
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
        · Hcp <b>${r.loadout.handicap}</b> · Best dist ${state.bestDistance} · Best SF ${state.bestStableford}
      </span>
    </header>`;
}

function titleScreen(): string {
  const formats = Object.values(FORMATS)
    .map(
      (f) => `
      <div style="border:1px solid #2a2f3a;border-radius:10px;padding:12px;margin:8px 0;background:#11141b;">
        <div style="display:flex;align-items:baseline;gap:10px;">
          <b style="font-size:16px;">${f.name}</b>
          <span style="font-size:12px;opacity:.6;">${f.stops.map((s) => s.label).join(' → ')}${f.stops.length > 1 ? ' → …' : ' (repeats)'}</span>
        </div>
        <p style="font-size:13px;opacity:.8;margin:.4em 0;">${f.blurb}</p>
        ${btn(`Start — ${f.name}`, { type: 'start', format: f.id })}
      </div>`,
    )
    .join('');
  return `
    <header style="border-left:4px solid #5fd45a;padding-left:10px;">
      <h1 style="margin:0;font-size:24px;">⛳ Golf Stars</h1>
      <p style="opacity:.75;font-size:13px;margin:.3em 0;">Voyage the galaxy. Make the cut. Travel deeper. — Best dist ${state.bestDistance}, best SF ${state.bestStableford}</p>
    </header>
    ${
      state.resumable
        ? `<div style="margin:1em 0;padding:10px 12px;border:1px solid #2bb673;border-radius:10px;background:#11181400;">
             <b style="font-size:14px;">Run in progress</b> — stop ${state.resumable.stopIndex + 1}, distance ${state.resumable.distanceFromStart}, ${state.resumable.credits} credits.
             <div style="margin-top:6px;">${btn('▶ Continue run', { type: 'resume' })}</div>
           </div>`
        : ''
    }
    <h2 style="font-size:15px;margin-top:1em;">${state.resumable ? 'Or start a new run' : 'Choose a run format'}</h2>
    ${formats}`;
}

function introScreen(): string {
  const c = state.course;
  const cut = cutLine(c.meta.distanceFromStart, c.holes.length);
  return `
    ${header()}
    <p style="opacity:.8;">A new world rises from the void…</p>
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
      ${courseCardHTML(c, { thumbWidth: 300, thumbHeight: 380 })}
      <section style="flex:1 1 220px;">
        <p style="font-size:15px;">Make <b>${cut}</b> Stableford across the ${c.holes.length} holes to survive the cut and travel on.</p>
        ${btn('🏌 Play shot by shot', { type: 'playInteractive' })}
        ${btn('» Auto-play (watch)', { type: 'play' })}
      </section>
    </div>`;
}

// --- interactive playing screen ----------------------------------------------
let animatedShots = 0; // shots of the current hole already animated
let animHoleIndex = -1;
let puttsAnimated = false;
let selClubId: string | null = null;
let selAim: 'attack' | 'safe' = 'attack';

function pendingAnimation(play: NonNullable<UiState['play']>): { shots: typeof play.shots; putts: typeof play.puttLogs } | null {
  const newShots = play.shots.slice(animatedShots);
  const needPutts = play.done && !puttsAnimated && play.puttLogs.length > 0;
  if (newShots.length === 0 && !needPutts) return null;
  return { shots: newShots, putts: needPutts ? play.puttLogs : [] };
}

function playingBody(animating: boolean): string {
  const play = state.play!;
  const v = shotView(play, state.run.loadout);
  const bag = state.run.loadout.bag;
  const par = play.hole.par;
  const scoreLine = `Hole ${play.holeIndex + 1}/${state.course.holes.length} · Par ${par} · Strokes <b>${play.strokes}</b>`;

  if (animating) {
    return `
      ${header()}
      <p style="font-size:14px;opacity:.85;">${scoreLine}</p>
      <div id="play" style="border:1px solid #222;border-radius:10px;overflow:hidden;width:340px;height:520px;"></div>
      <p style="opacity:.6;font-size:12px;margin-top:6px;">…watching the shot…</p>`;
  }

  if (play.done) {
    const name = play.pickedUp ? 'Picked up' : scoreName(par, play.strokes);
    return `
      ${header()}
      <h2 style="font-size:17px;">Hole ${play.holeIndex + 1}: <b>${play.strokes}</b> — ${name}${play.holed && play.shots.some((s) => s.holed) ? ' 🎉' : ''}</h2>
      <div style="margin-top:8px;">${btn('Continue →', { type: 'holeComplete' })}</div>`;
  }

  // Decision screen: map with shots so far + ball marker, info, and controls.
  if (selClubId === null || !bag.some((c) => c.id === selClubId)) selClubId = v.attackClubId;
  const svg = renderHoleSVG(play.hole, { shots: play.shots, biome: state.course.biome, width: 320, height: 460, ball: play.ball });
  const cbtn = (label: string, dir: number) =>
    `<button data-cycle="${dir}" style="padding:9px 12px;border-radius:8px;border:1px solid #333;background:#1d212c;color:#e8e8ea;font-size:14px;cursor:pointer;">${label}</button>`;
  const clubButtons = `
    ${cbtn('◄', -1)}
    <b style="display:inline-block;min-width:6em;text-align:center;">${bag.find((c) => c.id === selClubId)?.name ?? selClubId}</b>
    ${cbtn('►', 1)}`;
  const aimButtons = `
    <button data-aim="attack" style="${aimBtnStyle(selAim === 'attack')}">🎯 Attack pin</button>
    <button data-aim="safe" style="${aimBtnStyle(selAim === 'safe')}">🛟 Play safe${v.blocked ? ' (line blocked!)' : ''}</button>`;
  return `
    ${header()}
    <p style="font-size:14px;opacity:.85;">${scoreLine} · ${v.distToPin} yds to pin · lie <b>${v.lie}</b> · wind ${v.wind?.spd.toFixed(0) ?? 0}mph · <span style="opacity:.6;">pick up at +4 (${par + 4})</span></p>
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
      <div style="border:1px solid #222;border-radius:10px;overflow:hidden;">${svg}</div>
      <section style="flex:1 1 240px;min-width:240px;">
        <h3 style="font-size:14px;margin:.3em 0;">Club</h3>
        <div style="display:flex;align-items:center;gap:6px;">${clubButtons}</div>
        <p style="font-size:12px;opacity:.6;margin:.3em 0;">Suggested: attack ${v.attackClubId} · safe ${v.safeClubId}</p>
        <h3 style="font-size:14px;margin:.6em 0 .3em;">Strategy</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${aimButtons}</div>
        <div style="margin-top:12px;">
          ${btn('🏌 Hit', { type: 'shot', clubId: selClubId!, aim: selAim })}
          ${btn('» Auto-finish hole', { type: 'autoShotHole' })}
        </div>
      </section>
    </div>`;
}

function aimBtnStyle(sel: boolean): string {
  return `padding:9px 12px;border-radius:8px;border:1px solid ${sel ? '#5fd45a' : '#333'};background:${sel ? '#16331f' : '#1d212c'};color:#e8e8ea;font-size:14px;cursor:pointer;margin:3px 4px 3px 0;`;
}

function scorecard(): string {
  if (!state.played) return '';
  const rows = state.played
    .map((p, i) => {
      const sel = i === state.viewHole;
      return `<tr style="cursor:pointer;${sel ? 'background:#1d212c;' : ''}" data-action='${JSON.stringify({ type: 'viewHole', hole: i })}'>
        <td style="padding:2px 8px;">${i + 1}</td><td>${p.record.par}</td>
        <td><b>${p.record.strokes}</b></td><td style="opacity:.8;">${p.pickedUp ? 'Picked up' : scoreName(p.record.par, p.record.strokes)}</td></tr>`;
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
    const card = itemCardHTML(it, { owned: have, affordable: afford });
    const buyable = !have && afford;
    // Wrap the card so the whole thing is the buy button when purchasable.
    return buyable
      ? `<div data-action='${JSON.stringify({ type: 'buy', id: it.id })}' style="cursor:pointer;margin:4px;">${card}</div>`
      : `<div style="margin:4px;">${card}</div>`;
  }).join('');
  return `
    ${header()}
    <h2 style="font-size:16px;">Outfitter · ${state.run.credits} credits</h2>
    <p style="font-size:12px;opacity:.6;margin:.2em 0 .6em;">Click a card to buy. Each perk once per run.</p>
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

  // The interactive playing screen interleaves animation with input, so it computes its
  // own body (controls vs "watching") based on whether shots are pending animation.
  let animatingPlay: ReturnType<typeof pendingAnimation> = null;
  if (state.screen === 'playing' && state.play) {
    if (state.play.holeIndex !== animHoleIndex) {
      animatedShots = 0;
      puttsAnimated = false;
      animHoleIndex = state.play.holeIndex;
      selClubId = null;
      selAim = 'attack';
    }
    animatingPlay = pendingAnimation(state.play);
  }

  const body =
    state.screen === 'title'
      ? titleScreen()
      : state.screen === 'intro'
      ? introScreen()
      : state.screen === 'playing'
      ? playingBody(animatingPlay !== null)
      : state.screen === 'result'
      ? resultScreen()
      : state.screen === 'shop'
      ? shopScreen()
      : state.screen === 'travel'
      ? travelScreen()
      : gameoverScreen();

  app.innerHTML = `<main style="font-family:system-ui,sans-serif;max-width:820px;margin:0 auto;padding:16px;color:#e8e8ea;background:#0b0d12;min-height:100vh;">${body}</main>`;
  app.setAttribute('data-booted', '1'); // tell the boot watchdog the app painted

  // Wire actions.
  app.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
    el.addEventListener('click', () => dispatch(JSON.parse(el.dataset.action!) as Action));
  });
  // Local (non-game) controls on the playing screen: club cycle + aim select.
  app.querySelectorAll<HTMLElement>('[data-cycle]').forEach((el) => {
    el.addEventListener('click', () => {
      const bag = state.run.loadout.bag;
      const i = bag.findIndex((c) => c.id === selClubId);
      const ni = Math.max(0, Math.min(bag.length - 1, (i < 0 ? 0 : i) + Number(el.dataset.cycle)));
      selClubId = bag[ni]!.id;
      render();
    });
  });
  app.querySelectorAll<HTMLElement>('[data-aim]').forEach((el) => {
    el.addEventListener('click', () => {
      selAim = el.dataset.aim === 'safe' ? 'safe' : 'attack';
      render();
    });
  });

  // Mount the animated play view on the result screen.
  if (state.screen === 'result' && state.played) {
    const playEl = document.getElementById('play');
    const holePlay = state.played[state.viewHole];
    const hole = state.course.holes[state.viewHole];
    if (playEl && holePlay && hole) {
      view = mountPlayView(playEl, hole, holePlay.shots, holePlay.putts, {
        width: 340,
        height: 520,
        biome: state.course.biome,
      });
    }
  }

  // Animate pending shots on the playing screen, then re-render for the next decision.
  if (state.screen === 'playing' && state.play && animatingPlay) {
    const playEl = document.getElementById('play');
    if (playEl) {
      const play = state.play;
      view = mountPlayView(playEl, play.hole, animatingPlay.shots, animatingPlay.putts, {
        width: 340,
        height: 520,
        biome: state.course.biome,
        onDone: () => {
          animatedShots = play.shots.length;
          if (play.done) puttsAnimated = true;
          render();
        },
      });
    } else {
      // No canvas to animate into — skip ahead so we never get stuck.
      animatedShots = state.play.shots.length;
      if (state.play.done) puttsAnimated = true;
    }
  }
}

/** Entry, called from main.ts inside try/catch so any boot fault is visible. */
export function start(): void {
  boot();
}
