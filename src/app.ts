/**
 * App entry — the interactive shell over the pure run reducer (`ui/game.ts`).
 *
 * Renders the current screen, wires button clicks to reducer actions, and persists the
 * save after each action. All game logic lives in the pure sim/reducer; this file is just
 * DOM + the canvas play view + localStorage glue.
 */

import { scoreName } from './sim/score';
import { mountPlayView, type PlayViewHandle } from './render/playView';
import { courseCardHTML, itemCardHTML, shotCardHTML, puttCardHTML } from './render/cards';
import { renderHoleSVG } from './render/holeView';
import { holeProjector } from './render/project';
import { shotView, previewShot, awaitingPutt } from './sim/rpg/play';
import { biomeCarryMult, pinOf } from './sim/round';
import { biomeById } from './sim/course/biomes';
import { bearing, dist, type Hole } from './sim/course/contract';
import type { SprayTiers } from './render/holeView';
import { rarCol } from './sim/rpg/loot';
import { itemCap, itemCost, ownedCount, shopItem, usableBag } from './sim/rpg/economy';
import { FORMATS } from './sim/rpg/formats';
import { effectiveCut, snapshotRun } from './sim/rpg/run';
import { META_UPGRADES, canBuyMeta, metaLevel, metaUpgradeCost } from './sim/rpg/meta';
import { initState, reduce, type Action, type UiState } from './ui/game';
import { loadSave, writeSave } from './save/storage';
import { mountIntro } from './render/introView';

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
    const meta = {
      bestStableford: save.bestStableford,
      bestDistance: save.bestDistance,
      shards: save.shards,
      metaUpgrades: save.metaUpgrades,
    };
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
    writeSave({ version: 3, bestStableford: 0, bestDistance: 0, shards: 0, metaUpgrades: {} });
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
    version: 3,
    bestStableford: state.bestStableford,
    bestDistance: state.bestDistance,
    shards: state.shards,
    metaUpgrades: state.metaUpgrades,
    activeRun: state.run.status === 'active' ? snapshotRun(state.run) : undefined,
  });
}

function dispatch(action: Action): void {
  if (view) {
    view.destroy();
    view = null;
  }
  // Any reducer action dismisses a pending shot popup and cancels its timer.
  awaitingShotPopup = false;
  if (popupTimer) {
    clearTimeout(popupTimer);
    popupTimer = 0;
  }
  try {
    state = reduce(state, action);
    persist();
    render();
  } catch (err) {
    recover(err);
  }
}

const btn = (
  label: string,
  action: Action,
  opts: { disabled?: boolean; borderColor?: string; block?: boolean } = {},
): string =>
  `<button data-action='${JSON.stringify(action)}'${opts.disabled ? ' disabled' : ''}
     style="padding:9px 12px;border-radius:8px;border:1px solid ${opts.borderColor ?? '#333'};background:${opts.disabled ? '#15171d' : '#1d212c'};
     color:${opts.disabled ? '#666' : '#e8e8ea'};font-size:14px;cursor:${opts.disabled ? 'default' : 'pointer'};margin:3px 4px 3px 0;${
       opts.block ? 'display:block;width:100%;' : ''
     }">${label}</button>`;

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
    <div style="margin:.8em 0;display:flex;align-items:center;gap:10px;">
      <span style="font-size:14px;">✦ <b>${state.shards}</b> Star Shards</span>
      ${btn('🛰 Outpost (permanent upgrades)', { type: 'openOutpost' })}
    </div>
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
  // The cut reflects any pending route event (GS-14), so the banner is honest about the bar.
  const cut = effectiveCut(state.run, c.holes.length);
  const ev = state.run.pendingEvent;
  const evBanner =
    ev && ev.id !== 'open-space'
      ? `<div style="margin:.2em 0 .8em;padding:8px 11px;border-left:3px solid ${rarCol(ev.rarity)};
            border-radius:8px;background:#ffffff08;">
           <b style="font-size:14px;">${ev.label}</b>
           <div style="font-size:13px;opacity:.82;margin-top:2px;">${ev.desc}</div>
         </div>`
      : '';
  return `
    ${header()}
    <p style="opacity:.8;">A new world rises from the void…</p>
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
      ${courseCardHTML(c, { thumbWidth: 300, thumbHeight: 380 })}
      <section style="flex:1 1 220px;">
        ${evBanner}
        <p style="font-size:15px;">Stableford format: <b>${cut}pts</b> required across the ${c.holes.length} holes to make the cut and travel on.</p>
        ${btn('🏌 Play shot by shot', { type: 'playInteractive' })}
        ${btn('» Auto-play (watch)', { type: 'play' })}
      </section>
    </div>`;
}

// --- interactive playing screen ----------------------------------------------
let animatedShots = 0; // shots of the current hole already animated
let animHoleIndex = -1;
let animatedPutts = 0; // putts of the current hole already animated
let selClubId: string | null = null;
let selAim: 'attack' | 'safe' = 'attack';
let decisionShotCount = -1; // shots taken when the current club selection was defaulted
// Free-aim target (course-space) from tapping/dragging the map; overrides attack/safe when set.
let selFreeTarget: [number, number] | null = null;
// Shot-result popup: after a non-terminal shot settles, freeze on a result card + Continue
// before the next decision, so each shot gets its own beat. Module-level (a timed view
// effect, not reducer state — like animatedShots above).
let awaitingShotPopup = false;
let popupTimer = 0;

function pendingAnimation(play: NonNullable<UiState['play']>): { shots: typeof play.shots; putts: typeof play.puttLogs } | null {
  const newShots = play.shots.slice(animatedShots);
  const newPutts = play.puttLogs.slice(animatedPutts);
  if (newShots.length === 0 && newPutts.length === 0) return null;
  return { shots: newShots, putts: newPutts };
}

/** Clamp a free-aim target so you can never aim BEYOND your longest club's reach (#10). */
function clampToReach(play: NonNullable<UiState['play']>, target: [number, number]): [number, number] {
  const bag = state.run.loadout.bag;
  const maxReach = Math.max(...bag.filter((c) => c.id !== 'putter').map((c) => c.carry)) * biomeCarryMult(play.hole);
  const dx = target[0] - play.ball[0];
  const dy = target[1] - play.ball[1];
  const d = Math.hypot(dx, dy);
  if (d <= maxReach || d === 0) return [target[0], target[1]];
  return [play.ball[0] + (dx / d) * maxReach, play.ball[1] + (dy / d) * maxReach];
}

let renderScheduled = false;
/** rAF-throttle re-render so a fast drag doesn't rebuild the DOM faster than the screen refreshes. */
function scheduleRender(): void {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    render();
  });
}

/**
 * Wire tap/drag-to-aim on the decision map. The map SVG is the same size the projector rendered
 * (320×460 viewBox), so we reconstruct that exact projector and `unproject` the pointer into
 * course-space, clamped to the player's reach. Pointer-move/up listen on `window` so a drag
 * survives the per-frame re-render that replaces the map element.
 */
function wireMapAiming(app: HTMLElement): void {
  if (state.screen !== 'playing' || !state.play || state.holeSplash || awaitingShotPopup) return;
  if (state.play.done || awaitingPutt(state.play)) return; // only the full-shot decision screen
  const svg = app.querySelector<SVGSVGElement>('[data-map] svg');
  if (!svg) return;
  let dragging = false;
  const toTarget = (clientX: number, clientY: number): void => {
    const cur = document.querySelector<SVGSVGElement>('[data-map] svg');
    if (!cur || !state.play) return;
    const rect = cur.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const vbX = ((clientX - rect.left) / rect.width) * 320;
    const vbY = ((clientY - rect.top) / rect.height) * 460;
    // Reconstruct the EXACT decision-map projector (same params as the render), then unproject.
    const spray = previewShot(
      state.play,
      { clubId: selClubId!, aim: selAim, target: selFreeTarget ?? undefined },
      state.run.loadout,
    );
    const reach = Math.max(55, spray.carryHigh * 0.62);
    const proj = holeProjector(state.play.hole, { width: 320, height: 460, focus: state.play.ball, viewRadius: reach });
    const t = proj.unproject(vbX, vbY);
    selFreeTarget = clampToReach(state.play, [t[0], t[1]]);
    scheduleRender();
  };
  const move = (e: PointerEvent): void => {
    if (dragging) {
      e.preventDefault();
      toTarget(e.clientX, e.clientY);
    }
  };
  const up = (): void => {
    dragging = false;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  svg.addEventListener('pointerdown', (e) => {
    dragging = true;
    e.preventDefault();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    toTarget(e.clientX, e.clientY);
  });
}

const HAZARD_LABEL: Record<string, string> = {
  water: '💧 Water',
  bunker: '🏖 Bunker',
  lava: '🌋 Lava',
  void: '🕳 Void',
  trees: '🌲 Trees',
  waste: '🏜 Waste',
};

/** Plain-language wind read relative to the hole's play direction (up = toward the green). */
function windDescription(hole: Hole): string {
  const w = hole.wind;
  if (!w || w.spd < 1) return '🍃 Calm';
  const holeBearing = bearing(hole.tee, hole.green);
  const delta = ((w.dir - holeBearing + 540) % 360) - 180; // −180..180; 0 = tailwind (toward green)
  const along = Math.cos((delta * Math.PI) / 180);
  const kind = along > 0.4 ? 'tailwind' : along < -0.4 ? 'headwind' : 'crosswind';
  const arrow = `<span style="display:inline-block;transform:rotate(${delta.toFixed(0)}deg);">⬆</span>`;
  return `🌬 ${Math.round(w.spd)} mph ${kind} ${arrow}`;
}

/** Hazards in play on the hole, counted by kind (trees are a treeline, not counted). */
function hazardSummary(hole: Hole): string {
  const counts: Record<string, number> = {};
  for (const h of hole.hazards) counts[h.kind] = (counts[h.kind] ?? 0) + 1;
  const parts = Object.entries(counts).map(([kind, n]) =>
    kind === 'trees' ? HAZARD_LABEL[kind]! : `${n}× ${HAZARD_LABEL[kind] ?? kind}`,
  );
  return parts.length ? parts.join(' · ') : 'none in play';
}

/** Biome + special conditions (gravity, slick/true scatter surfaces) actually on this hole. */
function conditionsSummary(hole: Hole, biomeId: string): string {
  const parts: string[] = [];
  const biome = biomeById(biomeId);
  if (biome) parts.push(`🪐 ${biome.name}`);
  const cm = biomeCarryMult(hole);
  if (cm > 1.02) parts.push(`low gravity · carry ×${cm.toFixed(2)}`);
  else if (cm < 0.98) parts.push(`heavy air · carry ×${cm.toFixed(2)}`);
  const surfaces = new Set(hole.features.map((f) => f.kind));
  const SCAT: Record<string, string> = { ice: '❄ slick ice', crystal: '💎 true crystal', waste: '🏜 waste sand' };
  for (const [k, label] of Object.entries(SCAT)) if (surfaces.has(k)) parts.push(label);
  return parts.join(' · ');
}

/** Per-hole briefing splash: wind, hazards, special conditions + a layout map, then a Continue. */
function holeSplashBody(): string {
  const play = state.play!;
  const hole = play.hole;
  const len = Math.round(dist(hole.tee, hole.green));
  const map = renderHoleSVG(hole, { biome: state.course.biome, width: 320, height: 420 });
  const fact = (label: string, val: string): string =>
    `<div style="display:flex;justify-content:space-between;gap:14px;font-size:14px;padding:5px 0;border-bottom:1px solid #1c2029;">
       <span style="opacity:.6;">${label}</span><span style="font-weight:600;text-align:right;">${val}</span></div>`;
  return `
    ${header()}
    <h2 style="font-size:18px;margin:.3em 0;">Hole ${play.holeIndex + 1} of ${state.course.holes.length} · Par ${hole.par} · ~${len} yds</h2>
    <div class="gs-play">
      <div class="gs-map">${map}</div>
      <section class="gs-controls">
        ${fact('Wind', windDescription(hole))}
        ${fact('Hazards', hazardSummary(hole))}
        ${fact('Conditions', conditionsSummary(hole, state.course.biome))}
        <div class="gs-hitbar" style="margin-top:14px;">${btn('▶ Play the hole', { type: 'startHole' })}</div>
      </section>
    </div>`;
}

function playingBody(animating: boolean): string {
  const play = state.play!;
  const v = shotView(play, state.run.loadout);
  const bag = state.run.loadout.bag;
  const par = play.hole.par;
  const scoreLine = `Hole ${play.holeIndex + 1}/${state.course.holes.length} · Par ${par} · Strokes <b>${play.strokes}</b>`;

  // Per-hole briefing splash before the first shot (render-only; the reducer never blocks play).
  if (state.holeSplash && !animating) return holeSplashBody();

  if (animating) {
    return `
      ${header()}
      <p style="font-size:14px;opacity:.85;">${scoreLine}</p>
      <div id="play" style="border:1px solid #222;border-radius:10px;overflow:hidden;width:340px;height:520px;"></div>
      <p style="opacity:.6;font-size:12px;margin-top:6px;">…watching the shot…</p>`;
  }

  if (play.done) {
    const name = play.pickedUp ? 'Picked up' : scoreName(par, play.strokes);
    const lastCard = play.shots.length ? shotCardHTML(play.shots[play.shots.length - 1]!) : '';
    const puttCard = play.puttLogs.length
      ? puttCardHTML(play.puttLogs, { holed: play.holed, pickedUp: play.pickedUp })
      : '';
    return `
      ${header()}
      <h2 style="font-size:17px;">Hole ${play.holeIndex + 1}: <b>${play.strokes}</b> — ${name}${play.holed && play.shots.some((s) => s.holed) ? ' 🎉' : ''}</h2>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0;max-width:420px;">${lastCard}${puttCard}</div>
      <div style="margin-top:8px;">${btn('Continue →', { type: 'holeComplete' })}</div>`;
  }

  // Manual putting on the green (auto-putt off): stroke putts one at a time.
  if (awaitingPutt(play)) {
    const puttSvg = renderHoleSVG(play.hole, {
      shots: play.shots,
      biome: state.course.biome,
      width: 320,
      height: 460,
      ball: play.ball,
      // Zoom the green in for the putt — follow the ball, frame the cup.
      focus: play.ball,
      viewRadius: Math.max(18, v.distToPin * 1.8),
    });
    return `
      ${header()}
      <p style="font-size:14px;opacity:.85;">${scoreLine} · on the green · <b>${v.distToPin}</b> yds to the cup · putt <b>${play.putts + 1}</b></p>
      <div class="gs-play">
        <div class="gs-map" style="border:1px solid #222;border-radius:10px;overflow:hidden;">${puttSvg}</div>
        <section class="gs-controls">
          <div style="margin-bottom:10px;">${puttToggleBtn()}</div>
          <div class="gs-hitbar" style="margin-top:8px;">
            ${btn('⛳ Putt', { type: 'putt' })}
            ${btn('» Auto-finish putts', { type: 'autoShotHole' })}
          </div>
        </section>
      </div>`;
  }

  // Decision screen: map with shots so far + ball marker, the aiming spray cone, and controls.
  // Re-default the club to the suggestion on each NEW shot, so an approach doesn't stay
  // stuck on the driver. The player can still cycle/override within the shot.
  if (play.shots.length !== decisionShotCount) {
    decisionShotCount = play.shots.length;
    selClubId = null;
    selAim = 'attack';
    selFreeTarget = null;
  }
  // Only lie-legal clubs are selectable (driver hidden off the deck until unlocked).
  const usable = usableBag(bag, play.lie, state.run.loadout.driverDeck);
  const suggested = v.lie === 'green' && usable.some((c) => c.id === 'putter') ? 'putter' : v.attackClubId;
  if (selClubId === null || !usable.some((c) => c.id === selClubId)) selClubId = suggested;
  // A tapped/dragged free target overrides attack/safe; otherwise the aim choice picks the point.
  const decision = { clubId: selClubId, aim: selAim, target: selFreeTarget ?? undefined };
  const spray = previewShot(play, decision, state.run.loadout);
  // Feel escape-hatch: window._gsSpray lets the tier split be A/B'd live (e.g. 50/25/25).
  const sprayTiers = (window as unknown as { _gsSpray?: SprayTiers })._gsSpray;
  const tierPct = sprayTiers?.centralPct ?? 80;
  const sideePct = Math.round((100 - tierPct) / 2);
  // Zoom in and follow the ball: frame the CONTEMPLATED shot's reach (the spray's far arc), so a
  // short approach zooms right in and an unreachable green legitimately sits off-screen (#7). The
  // 0.62 factor maps the shot's max carry to ~the upper third of the view (see project.ts bias).
  const reach = Math.max(55, spray.carryHigh * 0.62);
  const svg = renderHoleSVG(play.hole, {
    shots: play.shots,
    biome: state.course.biome,
    width: 320,
    height: 460,
    ball: play.ball,
    spray,
    sprayTiers,
    focus: play.ball,
    viewRadius: reach,
  });
  const cbtn = (label: string, dir: number) =>
    `<button data-cycle="${dir}" style="padding:9px 12px;border-radius:8px;border:1px solid #333;background:#1d212c;color:#e8e8ea;font-size:14px;cursor:pointer;">${label}</button>`;
  const clubButtons = `
    ${cbtn('◄', -1)}
    <b style="display:inline-block;min-width:6em;text-align:center;">${usable.find((c) => c.id === selClubId)?.name ?? selClubId}</b>
    ${cbtn('►', 1)}
    <button data-suggest="1" title="Use the suggested club" style="padding:9px 10px;border-radius:8px;border:1px solid ${selClubId === suggested ? '#5fd45a' : '#333'};background:#1d212c;color:#e8e8ea;font-size:13px;cursor:pointer;">🎯 Suggested</button>`;
  const aimButtons = `
    <button data-aim="attack" style="${aimBtnStyle(selAim === 'attack' && !selFreeTarget)}">🎯 Attack pin</button>
    <button data-aim="safe" style="${aimBtnStyle(selAim === 'safe' && !selFreeTarget)}">🛟 Play safe${v.blocked ? ' (line blocked!)' : ''}</button>
    <button data-aim="free" style="${aimBtnStyle(!!selFreeTarget)}" title="Tap or drag the map to aim">✋ Free aim</button>`;
  const hitAction: Action = { type: 'shot', clubId: selClubId!, aim: selAim, ...(selFreeTarget ? { target: selFreeTarget } : {}) };
  return `
    ${header()}
    <p style="font-size:14px;opacity:.85;">${scoreLine} · ${v.distToPin} yds to pin · lie <b>${v.lie}</b> · wind ${v.wind?.spd.toFixed(0) ?? 0}mph · <span style="opacity:.6;">pick up at +4 (${par + 4})</span></p>
    <div class="gs-play">
      <div class="gs-map" data-map="1" style="border:1px solid #222;border-radius:10px;overflow:hidden;touch-action:none;">${svg}</div>
      <section class="gs-controls">
        <p style="font-size:11px;opacity:.55;margin:.1em 0 .4em;">Tap or drag the map to aim freely (within max distance).</p>
        <h3 style="font-size:14px;margin:.3em 0;">Club</h3>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${clubButtons}</div>
        <p style="font-size:12px;opacity:.6;margin:.3em 0;">Suggested: attack ${v.attackClubId} · safe ${v.safeClubId}${selFreeTarget ? ' · ✋ free aim' : ''}</p>
        <p style="font-size:12px;margin:.3em 0;line-height:1.5;">
          <span style="color:#5fd45a;">▮</span> ~${tierPct}% lands here · <span style="color:#ffc454;">▮</span> ${sideePct}% each side ·
          width <b>±${Math.round((sprayTiers?.edgeZ ?? 2.5) * spray.lateralSd)} yds</b> · carry <b>${Math.round(spray.carryLow)}–${Math.round(spray.carryHigh)} yds</b>
        </p>
        <h3 style="font-size:14px;margin:.6em 0 .3em;">Strategy</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${aimButtons}</div>
        <div style="margin-top:10px;">${puttToggleBtn()}</div>
        <div class="gs-hitbar" style="margin-top:12px;">
          ${btn('🏌 Hit', hitAction)}
          ${btn('» Auto-finish hole', { type: 'autoShotHole' })}
        </div>
      </section>
    </div>
    ${awaitingShotPopup ? shotPopupOverlay() : ''}`;
}

/** Modal shot-result popup: the just-played shot's card + a Continue, shown after the shot has
 *  settled so each shot gets its own beat before the next decision. */
function shotPopupOverlay(): string {
  const play = state.play!;
  const last = play.shots[play.shots.length - 1];
  if (!last) return '';
  return `
    <div style="position:fixed;inset:0;background:rgba(5,7,11,0.72);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px;">
      <div style="display:flex;flex-direction:column;align-items:stretch;gap:12px;max-width:300px;width:100%;">
        ${shotCardHTML(last)}
        <button data-popup-continue="1" style="padding:12px;border-radius:10px;border:1px solid #5fd45a;background:#16331f;color:#e8e8ea;font-size:16px;font-weight:600;cursor:pointer;">Continue →</button>
      </div>
    </div>`;
}

/** Auto-putt toggle button. Locked ON when the Auto-Caddie legendary is owned. */
function puttToggleBtn(): string {
  const locked = !!state.run.loadout.autoPutt;
  const on = state.autoPutt || locked;
  return btn(`⛳ Auto-putt: ${on ? 'ON' : 'OFF'}${locked ? ' (Caddie)' : ''}`, { type: 'toggleAutoPutt' }, { disabled: locked });
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
  const perks = state.run.loadout.perks;
  const credits = state.run.credits;
  // The stock was fixed on shop entry (state.shopOffer); cost/stack state is live.
  const items = (state.shopOffer ?? [])
    .map((id) => shopItem(id))
    .filter((it): it is NonNullable<typeof it> => !!it)
    .map((it) => {
      const owned = ownedCount(perks, it.id);
      const maxed = owned >= itemCap(it);
      const cost = itemCost(it, owned);
      const afford = credits >= cost;
      const buyable = !maxed && afford;
      const card = itemCardHTML({ ...it, cost }, { owned: maxed, affordable: afford, count: owned });
      // Wrap the card so the whole thing is the buy button when purchasable.
      return buyable
        ? `<div data-action='${JSON.stringify({ type: 'buy', id: it.id })}' style="cursor:pointer;margin:4px;">${card}</div>`
        : `<div style="margin:4px;">${card}</div>`;
    })
    .join('');
  return `
    ${header()}
    <h2 style="font-size:16px;">Outfitter · ${credits} credits</h2>
    <p style="font-size:12px;opacity:.6;margin:.2em 0 .6em;">Click a card to buy. Stock rotates each stop — stackable upgrades cost more the more you own.</p>
    <div style="display:flex;flex-wrap:wrap;">${items}</div>
    <div style="margin-top:12px;">${btn('Travel onward →', { type: 'leaveShop' })}</div>`;
}

function outpostScreen(): string {
  const cards = META_UPGRADES.map((u) => {
    const lvl = metaLevel(state.metaUpgrades, u.id);
    const maxed = lvl >= u.maxLevel;
    const cost = metaUpgradeCost(u, lvl);
    const buyable = canBuyMeta(u, lvl, state.shards);
    const card = itemCardHTML(
      { name: u.name, cost, desc: u.desc, rarity: u.rarity },
      { owned: maxed, affordable: state.shards >= cost, count: lvl },
    );
    // Show the level track and use shard pricing (the card's "c" reads as the shard cost).
    const track = `<div style="font-size:11px;opacity:.6;text-align:center;margin-top:-4px;">Lv ${lvl}/${u.maxLevel}${maxed ? '' : ` · ✦${cost}`}</div>`;
    return buyable
      ? `<div data-action='${JSON.stringify({ type: 'buyUpgrade', id: u.id })}' style="cursor:pointer;margin:4px;">${card}${track}</div>`
      : `<div style="margin:4px;">${card}${track}</div>`;
  }).join('');
  return `
    <header style="border-left:4px solid #e08a2b;padding-left:10px;">
      <h1 style="margin:0;font-size:22px;">🛰 Outpost</h1>
      <p style="opacity:.75;font-size:13px;margin:.3em 0;">Spend Star Shards on PERMANENT upgrades — they bake into the start of every future run.</p>
    </header>
    <h2 style="font-size:16px;margin:.6em 0 .2em;">✦ ${state.shards} Star Shards</h2>
    <p style="font-size:12px;opacity:.6;margin:.2em 0 .6em;">Click a card to buy the next level. Shards are earned by how far each run travels.</p>
    <div style="display:flex;flex-wrap:wrap;">${cards}</div>
    <div style="margin-top:12px;">${btn('← Back to title', { type: 'closeOutpost' })}</div>`;
}

function travelScreen(): string {
  const routes = (state.routes ?? [])
    .map((r) => {
      const ev = r.event;
      const credit =
        ev.creditMult !== 1 ? `${ev.creditMult > 1 ? '+' : ''}${Math.round((ev.creditMult - 1) * 100)}% credits` : '';
      const cut = ev.cutDelta !== 0 ? `cut ${ev.cutDelta > 0 ? '+' : ''}${ev.cutDelta}` : '';
      const tag = [credit, cut].filter(Boolean).join(' · ');
      // A whole route card is the click target (the shared btn() wraps an action handler).
      return btn(
        `<div style="text-align:left;">
           <div style="font-size:15px;"><b>${ev.label}</b> <span style="opacity:.6;">· ↗ ${r.label} (+${r.distanceJump} distance)</span></div>
           <div style="font-size:13px;opacity:.82;margin:3px 0;">${ev.desc}</div>
           ${tag ? `<div style="font-size:12px;opacity:.7;">${tag}</div>` : ''}
         </div>`,
        { type: 'route', routeId: r.id },
        { borderColor: rarCol(ev.rarity), block: true },
      );
    })
    .join('');
  return `
    ${header()}
    <h2 style="font-size:16px;">Choose your jump</h2>
    <p style="opacity:.75;font-size:14px;">Deeper jumps raise the cut and wildness; each lane's event tilts the risk and the payout. There's always a calm option.</p>
    <div>${routes}</div>`;
}

function gameoverScreen(): string {
  const r = state.run;
  const earned = state.lastRunShards;
  return `
    ${header()}
    <h2 style="font-size:20px;color:#ff6b6b;">Run over — stranded at the cut</h2>
    <p style="font-size:15px;">You reached <b>stop ${r.stopIndex + 1}</b>, distance <b>${r.distanceFromStart}</b>.</p>
    ${earned !== undefined ? `<p style="font-size:15px;color:#e08a2b;">✦ Earned <b>${earned}</b> Star Shards · ${state.shards} banked</p>` : ''}
    <p style="opacity:.8;">Best ever: distance <b>${state.bestDistance}</b>, Stableford <b>${state.bestStableford}</b>.</p>
    <div style="margin-top:8px;">
      ${btn('🛰 Spend at the Outpost', { type: 'openOutpost' })}
      ${btn('🚀 New run', { type: 'restart', seed: Math.floor(Math.random() * 1e9) })}
    </div>`;
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
      animatedPutts = 0;
      animHoleIndex = state.play.holeIndex;
      selClubId = null;
      selAim = 'attack';
      decisionShotCount = -1;
      awaitingShotPopup = false;
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
      : state.screen === 'outpost'
      ? outpostScreen()
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
      // Cycle through only the lie-legal clubs (the driver is hidden off the deck until unlocked).
      const lie = state.play?.lie ?? 'tee';
      const bag = usableBag(state.run.loadout.bag, lie, state.run.loadout.driverDeck);
      const i = bag.findIndex((c) => c.id === selClubId);
      const ni = Math.max(0, Math.min(bag.length - 1, (i < 0 ? 0 : i) + Number(el.dataset.cycle)));
      selClubId = bag[ni]!.id;
      render();
    });
  });
  app.querySelectorAll<HTMLElement>('[data-aim]').forEach((el) => {
    el.addEventListener('click', () => {
      const a = el.dataset.aim;
      if (a === 'free') {
        // Seed the free target at the pin (clamped to reach) so it's there to nudge/drag.
        if (state.play) selFreeTarget = clampToReach(state.play, pinOf(state.play.hole));
      } else {
        selAim = a === 'safe' ? 'safe' : 'attack';
        selFreeTarget = null; // an explicit aim choice cancels free aim
      }
      render();
    });
  });
  // Tap/drag the map to aim freely. Pointer-move/up listen on window so the drag survives the
  // per-frame re-render (which replaces the map element); the new element is re-queried each move.
  wireMapAiming(app);
  // "Use suggested" snaps the club back to the suggestion for this position.
  app.querySelectorAll<HTMLElement>('[data-suggest]').forEach((el) => {
    el.addEventListener('click', () => {
      if (!state.play) return;
      const sv = shotView(state.play, state.run.loadout);
      const onGreen = sv.lie === 'green' && state.run.loadout.bag.some((c) => c.id === 'putter');
      selClubId = onGreen ? 'putter' : sv.attackClubId;
      render();
    });
  });
  // Dismiss the shot-result popup → reveal the next decision (a local view control).
  app.querySelectorAll<HTMLElement>('[data-popup-continue]').forEach((el) => {
    el.addEventListener('click', () => {
      awaitingShotPopup = false;
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
      // Zoom + follow the ball in flight, framed to the actual shot travel so the camera keeps up
      // with the ball without clipping it (and matches the decision map's zoom level).
      const travel = Math.max(
        20,
        ...animatingPlay.shots.map((s) => Math.hypot(s.rest[0] - s.from[0], s.rest[1] - s.from[1])),
      );
      const focus = animatingPlay.shots[0]?.from ?? animatingPlay.putts[0]?.from ?? play.ball;
      const hadShots = animatingPlay.shots.length > 0;
      view = mountPlayView(playEl, play.hole, animatingPlay.shots, animatingPlay.putts, {
        width: 340,
        height: 520,
        biome: state.course.biome,
        focus,
        viewRadius: animatingPlay.shots.length ? Math.max(55, travel * 0.62) : 25,
        follow: true,
        onDone: () => {
          animatedShots = play.shots.length;
          animatedPutts = play.puttLogs.length;
          // After a non-terminal full shot, hold a beat (so the landing reads as finished) then
          // pop the shot-result card. A terminal shot falls through to the done screen, which is
          // itself the result card + Continue; pure putts skip the popup.
          if (hadShots && !play.done) {
            const delay = (window as unknown as { _gsFeel?: { popupDelayMs?: number } })._gsFeel?.popupDelayMs ?? 320;
            popupTimer = window.setTimeout(() => {
              popupTimer = 0;
              awaitingShotPopup = true;
              render();
            }, delay);
          } else {
            render();
          }
        },
      });
    } else {
      // No canvas to animate into — skip ahead so we never get stuck.
      animatedShots = state.play.shots.length;
      animatedPutts = state.play.puttLogs.length;
    }
  }
}

/**
 * Decide whether to play the loading-intro cinematic. It's cosmetic, so it degrades safely:
 * we boot the real title FIRST (so the page has genuinely painted), then overlay the intro
 * on top and remove it when it finishes/skips. Gated so it plays on a fresh session but not
 * on every in-session reload; `?intro=1` forces it, `?intro=0` (or reduced-motion) skips it.
 */
function shouldPlayIntro(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('intro');
    if (q === '1') return true;
    if (q === '0') return false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
    if (sessionStorage.getItem('gs_introSeen') === '1') return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Register the offline service worker (PWA). Guarded to http/https so it never fires under
 * the `file://` smoke test (where registration would reject), and fully swallowed so a SW
 * failure can never strand the boot — the app works identically with no worker. The worker
 * is network-first (see public/sw.js), so it adds offline play without risking a stale page.
 */
function registerServiceWorker(): void {
  try {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.protocol !== 'http:') return;
    // Relative URL → the worker scopes to our own subpath, never a sibling app on the origin.
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* offline support is a bonus; never surface or block on its failure */
      });
    });
  } catch {
    /* ignore */
  }
}

/** Entry, called from main.ts inside try/catch so any boot fault is visible. */
export function start(): void {
  boot();
  registerServiceWorker();
  if (!shouldPlayIntro()) return;
  try {
    sessionStorage.setItem('gs_introSeen', '1');
  } catch {
    /* ignore */
  }
  try {
    mountIntro({});
  } catch {
    /* the title is already painted underneath — losing the intro is harmless */
  }
}
