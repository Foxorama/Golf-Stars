/**
 * App entry — the interactive shell over the pure run reducer (`ui/game.ts`).
 *
 * Renders the current screen, wires button clicks to reducer actions, and persists the
 * save after each action. All game logic lives in the pure sim/reducer; this file is just
 * DOM + the canvas play view + localStorage glue.
 */

import { scoreName, playTotals } from './sim/score';
import { mountPlayView, type PlayViewHandle } from './render/playView';
import { itemCardHTML, shotCardHTML, puttCardHTML } from './render/cards';
import { renderHoleSVG } from './render/holeView';
import { holeProjector, type ProjectOptions } from './render/project';
import { shotView, previewShot, awaitingPutt } from './sim/rpg/play';
import { mountPuttMeter, type PuttMeterHandle } from './render/puttMeter';
import { biomeCarryMult, pinOf, greenDepth, forcedCarry, DEFAULT_MANUAL_BAND } from './sim/round';
import { puttSkillOf } from './sim/rpg/economy';
import { lieInfo, roughLieOf } from './sim/shot';
import { biomeById } from './sim/course/biomes';
import { archetypeFor, themeById } from './sim/course/themes';
import { zoneProfile, difficultyPips } from './sim/course/zones';
import { bearing, dist, type Hole } from './sim/course/contract';
import { type ShotSpread } from './sim/round';
import { type SprayGeomInput } from './render/holeView';
import { rarCol } from './sim/rpg/loot';
import { clubOfferNote, itemCap, itemCost, namedCaddyOwned, ownedCount, shopItem, usableBag } from './sim/rpg/economy';
import { FORMATS } from './sim/rpg/formats';
import { CHARACTERS, getCharacter, scramblePartner as scramblePartnerChar, type Character, type GolferStyle } from './sim/rpg/characters';
import { ASCENSION_MAX, cashOutShards, currentBoss, effectiveCut, snapshotRun } from './sim/rpg/run';
import { META_UPGRADES, canBuyMeta, metaLevel, metaUpgradeCost } from './sim/rpg/meta';
import { initState, reduce, rerollCost, type Action, type UiState } from './ui/game';
import { loadSave, writeSave } from './save/storage';
import { mountIntro } from './render/introView';
import { sfx, resumeAudio } from './render/audio';
import { getSettings, toggleSetting, type Settings } from './settings';

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

/** Today's deterministic daily-challenge seed — same course for everyone on the same date. Reuses
 *  the string-seed support (no new URL param/hook). Date is read in the browser (not the sim). */
function dailySeed(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `daily-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function dailyLabel(): string {
  const d = new Date();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The captured PWA install prompt (beforeinstallprompt), if the browser offered one and the
 *  player hasn't installed/dismissed it. Surfaced as an "Install" button on the title. */
let deferredInstall: (Event & { prompt?: () => void }) | null = null;
function installDismissed(): boolean {
  try {
    return localStorage.getItem('gs_installNudge') === 'dismissed';
  } catch {
    return false;
  }
}
function installButtonHTML(): string {
  if (!deferredInstall || installDismissed()) return '';
  return `<button class="gs-btn gs-btn--ghost" data-install="1">⬇ Install app</button>`;
}

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
      maxAscension: save.maxAscension,
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
    writeSave({ version: 4, bestStableford: 0, bestDistance: 0, shards: 0, metaUpgrades: {}, maxAscension: 0 });
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
    version: 4,
    bestStableford: state.bestStableford,
    bestDistance: state.bestDistance,
    shards: state.shards,
    metaUpgrades: state.metaUpgrades,
    maxAscension: state.maxAscension,
    activeRun: state.run.status === 'active' ? snapshotRun(state.run) : undefined,
  });
}

/** Named haptic patterns — a small tactile vocabulary so the game is readable with sound off
 *  (how phones are actually used). Gated on the player's `haptics` setting; guarded + swallowed
 *  (vibration is absent on desktop/iOS Safari), so it's a pure no-op where unsupported. */
const HAPTICS = {
  tap: 8,
  swing: 16,
  putt: 10,
  good: [10, 30, 14] as number[], // pure contact / made putt
  bad: 40, // penalty / missed cut — one heavy buzz
  holeOut: [12, 28, 12, 28, 20] as number[],
  madeCut: [10, 40, 10, 40, 18] as number[],
};
function haptic(pattern: number | number[]): void {
  if (!getSettings().haptics) return;
  try {
    (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(pattern);
  } catch {
    /* unsupported — never let a feel-only effect throw */
  }
}

function dispatch(action: Action): void {
  // The first user gesture is our cue to resume the (browser-suspended) audio context.
  resumeAudio();
  // Tactile confirmation the moment a stroke is committed (swing a touch firmer than a putt).
  if (action.type === 'shot') haptic(HAPTICS.swing);
  else if (action.type === 'putt') haptic(HAPTICS.putt);
  if (view) {
    view.destroy();
    view = null;
  }
  if (puttMeter) {
    puttMeter.destroy();
    puttMeter = null;
  }
  // A light UI tick on navigation presses (the stroke + purchase actions get their own richer cue).
  if (action.type !== 'shot' && action.type !== 'putt' && action.type !== 'buy' && action.type !== 'buyUpgrade') {
    sfx.click();
  }
  // Any reducer action dismisses a pending shot popup and cancels its timer.
  awaitingShotPopup = false;
  if (popupTimer) {
    clearTimeout(popupTimer);
    popupTimer = 0;
  }
  try {
    const prevScreen = state.screen;
    state = reduce(state, action);
    // Purchase chime (a real buy only — unaffordable cards aren't clickable).
    if (action.type === 'buy' || action.type === 'buyUpgrade') {
      sfx.reward();
      haptic(HAPTICS.tap);
    }
    // Big-beat cues on the cut transition: a bright arpeggio for making it, a fall for missing.
    if (state.screen === 'result' && prevScreen !== 'result') {
      sfx.madeCut();
      haptic(HAPTICS.madeCut);
    } else if (state.screen === 'gameover' && prevScreen !== 'gameover') {
      sfx.missCut();
      haptic(HAPTICS.bad);
    }
    persist();
    render();
  } catch (err) {
    recover(err);
  }
}

type BtnVariant = 'primary' | 'ghost' | 'on';

const btn = (
  label: string,
  action: Action,
  opts: { disabled?: boolean; borderColor?: string; block?: boolean; variant?: BtnVariant } = {},
): string => {
  const cls = ['gs-btn'];
  if (opts.variant) cls.push(`gs-btn--${opts.variant}`);
  if (opts.block) cls.push('gs-btn--block');
  // A rarity/accent border (e.g. travel routes) overrides the class default and its hover tint.
  const style = opts.borderColor ? ` style="--btn-border:${opts.borderColor};--btn-hover:${opts.borderColor};"` : '';
  return `<button class="${cls.join(' ')}" data-action='${JSON.stringify(action)}'${opts.disabled ? ' disabled' : ''}${style}>${label}</button>`;
};

function header(): string {
  const r = state.run;
  const ch = getCharacter(r.loadout.characterId);
  const who = ch ? ` <span style="font-size:13px;color:${ch.style.cap};">· ${ch.name}</span>` : '';
  return `
    <header style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;border-left:4px solid ${rarCol(state.course.rarity)};border-radius:3px;padding:2px 0 10px 11px;margin-bottom:12px;border-bottom:1px solid var(--gs-line-2);">
      <h1 style="margin:0;font-size:22px;">⛳ Golf Stars</h1>${who}
      <span style="margin-left:auto;font-size:13px;color:var(--gs-dim);">
        Stop <b style="color:var(--gs-ink);">${r.stopIndex + 1}</b> · Dist <b style="color:var(--gs-ink);">${r.distanceFromStart}</b> · Credits <b style="color:var(--gs-warn);">${r.credits}</b>
        · Hcp <b style="color:var(--gs-ink);">${r.loadout.handicap}</b> · Best dist ${state.bestDistance} · Best SF ${state.bestStableford}
      </span>
    </header>`;
}

function titleScreen(): string {
  // Headline the winnable campaign (GS-voyage) first, then the endless roguelite formats.
  const formats = Object.values(FORMATS)
    .slice()
    .sort((a, b) => Number(!!b.winnable) - Number(!!a.winnable))
    .map(
      (f) => `
      <div class="gs-panel gs-format" ${f.winnable ? 'style="border-color:#ffce5466;"' : ''}>
        <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">
          <b style="font-size:16px;">${f.name}</b>
          ${f.winnable ? '<span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);font-size:10.5px;">★ CAMPAIGN · WINNABLE</span>' : ''}
          <span style="font-size:12px;opacity:.6;">${f.stops.map((s) => s.label).join(' → ')}${f.winnable ? '' : f.stops.length > 1 ? ' → …' : ' (repeats)'}</span>
        </div>
        <p style="font-size:13px;opacity:.8;margin:.4em 0;">${f.blurb}</p>
        ${
          f.winnable && state.maxAscension > 0
            ? `<div style="font-size:12px;opacity:.75;margin-bottom:5px;">⚔ Ascension — harder cut, leaner purse. Win to unlock the next tier (max unlocked: A${state.maxAscension}):</div>
               <div style="display:flex;gap:6px;flex-wrap:wrap;">${Array.from({ length: state.maxAscension + 1 }, (_, a) =>
                 btn(`A${a}`, { type: 'start', format: f.id, ascension: a }, { variant: a === 0 ? 'primary' : 'ghost' }),
               ).join('')}</div>`
            : btn(`Start — ${f.name}`, { type: 'start', format: f.id }, { variant: 'primary' })
        }
      </div>`,
    )
    .join('');
  return `
    <header style="border-left:4px solid #5fd45a;padding-left:10px;">
      <h1 style="margin:0;font-size:24px;">⛳ Golf Stars</h1>
      <p style="opacity:.75;font-size:13px;margin:.3em 0;">Voyage the galaxy. Make the cut. Travel deeper. — Best dist ${state.bestDistance}, best SF ${state.bestStableford}</p>
    </header>
    <div style="margin:.8em 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);">✦ <b>${state.shards}</b> Star Shards</span>
      ${btn('🛰 Outpost (permanent upgrades)', { type: 'openOutpost' }, { variant: 'ghost' })}
      <button class="gs-btn gs-btn--ghost" data-open-settings="1">⚙ Settings</button>
      ${installButtonHTML()}
    </div>
    <div style="margin:.2em 0 .6em;">
      ${btn(`🗓 Daily Challenge — ${dailyLabel()}`, { type: 'restart', seed: dailySeed() }, { variant: 'ghost' })}
      <span style="font-size:11.5px;opacity:.55;">same course for everyone today (a deterministic seed)</span>
    </div>
    ${
      state.resumable
        ? `<div class="gs-panel" style="border-color:#2bb673;background:linear-gradient(180deg,#10241a,#0e1a14);">
             <b style="font-size:14px;">Run in progress</b> — stop ${state.resumable.stopIndex + 1}, distance ${state.resumable.distanceFromStart}, ${state.resumable.credits} credits.
             <div style="margin-top:6px;">${btn('▶ Continue run', { type: 'resume' }, { variant: 'primary' })}</div>
           </div>`
        : ''
    }
    <h2 style="font-size:15px;margin-top:1em;">${state.resumable ? 'Or start a new run' : 'Choose a run format'}</h2>
    ${formats}`;
}

/** A compact inline-SVG of the play-view golfer silhouette, tinted to a character (GS-18). Static
 *  preview for the select card — same crew silhouette (legs, shirt torso, skin arms/head, cap +
 *  club) the on-course figure uses, so the card reads as "this is who you'll see swinging". */
function golferSVG(style: GolferStyle, w = 78, h = 104): string {
  const s = style.build;
  return `
    <svg viewBox="0 0 78 104" width="${w}" height="${h}" aria-hidden="true" style="display:block;">
      <ellipse cx="39" cy="99" rx="${20 * s}" ry="4" fill="rgba(0,0,0,0.28)"/>
      <g transform="translate(39,52) scale(${s}) translate(-39,-52)" stroke-linecap="round" stroke-linejoin="round">
        <!-- legs -->
        <path d="M39 64 L31 96 M39 64 L48 96" stroke="#2c3142" stroke-width="7" fill="none"/>
        <!-- club -->
        <path d="M44 40 L66 78" stroke="#d9dee8" stroke-width="2.4" fill="none"/>
        <circle cx="66" cy="78" r="2.6" fill="#aeb6c6"/>
        <!-- torso -->
        <path d="M39 64 L44 34" stroke="${style.shirt}" stroke-width="13" fill="none"/>
        <!-- arms -->
        <path d="M44 34 L52 50" stroke="${style.skin}" stroke-width="5" fill="none"/>
        <!-- head + cap -->
        <circle cx="46" cy="24" r="9" fill="${style.skin}"/>
        <path d="M37 23 A9 9 0 0 1 55 23 Z" fill="${style.cap}"/>
        <rect x="50" y="21" width="12" height="4" rx="1.5" fill="${style.cap}"/>
      </g>
    </svg>`;
}

function characterScreen(): string {
  const cards = CHARACTERS.map((ch) => {
    const pros = ch.pros.map((p) => `<li style="color:var(--gs-accent);">✓ <span style="color:var(--gs-ink);">${p}</span></li>`).join('');
    const cons = ch.cons.map((c) => `<li style="color:var(--gs-warn);">▲ <span style="color:var(--gs-dim);">${c}</span></li>`).join('');
    return `
      <div class="gs-panel gs-clickcard" style="display:flex;flex-direction:column;gap:8px;border-color:${ch.style.cap}55;">
        <div style="display:flex;gap:12px;align-items:center;">
          <div style="flex:0 0 auto;background:linear-gradient(180deg,#0e1118,#161b27);border-radius:10px;padding:4px 6px;">${golferSVG(ch.style)}</div>
          <div style="flex:1 1 auto;">
            <b style="font-size:16px;color:${ch.style.cap};">${ch.name}</b>
            <div style="font-size:11.5px;opacity:.7;margin-top:1px;">${ch.origin} · ${ch.identity}</div>
            <p style="font-size:12.5px;opacity:.85;margin:.4em 0 0;">${ch.blurb}</p>
          </div>
        </div>
        <ul style="list-style:none;padding:0;margin:0;font-size:12px;line-height:1.5;">${pros}${cons}</ul>
        ${btn(`Choose ${ch.name.split(' ')[0]}`, { type: 'selectCharacter', characterId: ch.id }, { variant: 'primary', block: true })}
      </div>`;
  }).join('');
  return `
    <header style="border-left:4px solid #5fd45a;padding-left:10px;">
      <h1 style="margin:0;font-size:22px;">Choose your golfer</h1>
      <p style="opacity:.75;font-size:13px;margin:.3em 0;">Each plays the galaxy differently — a clear strength, a clear quirk. Pick who you'll voyage as.</p>
    </header>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px;margin-top:1em;">
      ${cards}
    </div>`;
}

/**
 * The "arrival at a new world" screen — ONE consolidated card (GS-ui-intro). It used to stack two
 * big visuals (a generic per-archetype hero banner AND a separate course/loot card) plus a bottom
 * action section, so the player had to scroll past ~600px of art to reach Play. Now a single panel
 * leads with identity + the cut + the CTAs (reachable without scrolling), then reveals the ACTUAL
 * first hole (the loot) + lore/hazards below. The generic zoneHero art was dropped as redundant —
 * the real generated hole is the more exciting, more informative visual and carries the theme too.
 */
function introScreen(): string {
  const c = state.course;
  // The cut reflects any pending route event (GS-14), so the line is honest about the bar.
  const cut = effectiveCut(state.run, c.holes.length);
  const par = c.holes.reduce((s, h) => s + h.par, 0);
  const ev = state.run.pendingEvent;
  // Boss stop (GS-voyage): a louder note — and a co-op partner read for a scramble boss.
  const boss = currentBoss(state.run);
  const partner = boss?.partner ? scramblePartner(state.run) : undefined;
  const split = state.course.meta.split;

  // World identity (GS-19): the archetype's lore/profile, the per-stop theme name, difficulty.
  const themeId = c.meta.themeId;
  const zone = zoneProfile(archetypeFor(themeId, c.biome));
  const theme = themeId ? themeById(themeId) : undefined;
  const col = rarCol(c.rarity);
  const diffPips = difficultyPips(zone.difficulty);

  // Contextual notes (boss / split / route event) — only when they apply, kept compact and ABOVE
  // the CTA so a decision is never buried under the hole art.
  const notes: string[] = [];
  if (boss)
    notes.push(`<div style="margin-top:10px;padding:9px 11px;border:1px solid ${boss.final ? '#ffce54' : '#c0392b'};
        border-radius:9px;background:linear-gradient(180deg,#1a0e12,#120b10);">
       <div style="font-size:11px;letter-spacing:.12em;color:${boss.final ? '#ffce54' : '#ff6b6b'};">
         ${boss.final ? '★ FINAL BOSS' : '⚔ BOSS STOP'}${boss.partner ? ' · SCRAMBLE' : ''}</div>
       <b style="font-size:16px;">${boss.name}</b>
       <div style="font-size:12.5px;opacity:.85;margin-top:2px;">${boss.blurb}</div>
       ${partner ? `<div style="font-size:12px;margin-top:5px;color:${partner.style.cap};">🤝 Partner: <b>${partner.name}</b> — two balls a shot, the better one counts.</div>` : ''}
     </div>`);
  if (split)
    notes.push(`<div style="margin-top:8px;padding:7px 11px;border-left:3px solid #7aa2ff;border-radius:8px;background:#ffffff08;font-size:12.5px;">
       🌗 <b>Two worlds</b> — the first ${split.frontHoles} holes play one world, then you cross into another for the run home.</div>`);
  if (ev && ev.id !== 'open-space')
    notes.push(`<div style="margin-top:8px;padding:7px 11px;border-left:3px solid ${rarCol(ev.rarity)};border-radius:8px;background:#ffffff08;">
       <b style="font-size:13px;">${ev.label}</b>
       <div style="font-size:12.5px;opacity:.82;margin-top:1px;">${ev.desc}</div>
     </div>`);

  const thumb = renderHoleSVG(c.holes[0]!, {
    width: 300,
    height: 360,
    biome: holeBiome(c.holes[0]!),
    themeId: holeThemeId(c.holes[0]!),
  });

  return `
    ${header()}
    <article class="gs-panel" style="border-color:${col}66;box-shadow:0 0 18px ${col}22;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div style="min-width:0;">
          <div style="font-size:21px;font-weight:800;line-height:1.1;">${zone.name}</div>
          <div style="font-size:13px;color:var(--gs-accent);margin-top:2px;">${zone.signature}${theme ? ` · ${theme.name}` : ''}</div>
          <div style="font-size:12.5px;opacity:.7;margin-top:3px;">${c.meta.name} · ${c.holes.length} holes · par ${par} · 🌪 ${c.meta.wildness.toFixed(2)}</div>
        </div>
        <div style="text-align:right;flex:0 0 auto;">
          <span style="color:${col};border:1px solid ${col};border-radius:6px;padding:1px 7px;font-size:11px;text-transform:uppercase;letter-spacing:1px;">${c.rarity}</span>
          <div style="font-size:10.5px;opacity:.65;margin-top:7px;letter-spacing:.06em;text-transform:uppercase;">Difficulty</div>
          <div style="font-size:15px;letter-spacing:1px;color:var(--gs-danger);">${diffPips}</div>
        </div>
      </div>
      ${notes.join('')}
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--gs-line-2);">
        <p style="font-size:14px;margin:0 0 10px;">🎯 <b>${cut} pts</b> over ${c.holes.length} holes ${boss ? 'to beat the boss' : 'to make the cut and travel on'}.${
          state.run.ascension > 0 ? `<span style="color:#ffce54;"> · ⚔ Ascension A${state.run.ascension} (tougher cut, leaner purse)</span>` : ''
        }</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
          ${btn('🏌 Play shot by shot', { type: 'playInteractive' }, { variant: 'primary' })}
          ${btn('» Watch the AI play', { type: 'play' }, { variant: 'ghost' })}
        </div>
      </div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-top:14px;padding-top:14px;border-top:1px solid var(--gs-line-2);">
        <div style="flex:0 0 auto;border-radius:10px;overflow:hidden;border:1px solid var(--gs-line-2);line-height:0;">${thumb}</div>
        <div style="flex:1 1 240px;min-width:0;">
          <p style="font-size:12px;font-style:italic;opacity:.7;margin:0 0 6px;line-height:1.4;">${zone.inspiration}</p>
          <p style="font-size:13px;opacity:.92;margin:0 0 12px;line-height:1.4;">${zone.brief}</p>
          <div style="display:flex;gap:18px;flex-wrap:wrap;">
            ${traitList('Hazards', 'var(--gs-danger)', zone.hazards)}
            ${traitList('Benefits', 'var(--gs-accent)', zone.benefits)}
          </div>
        </div>
      </div>
    </article>`;
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
// Map navigation (local view state, reset per shot). `follow` zooms the camera onto the
// contemplated shot (the default); `whole` fits the ENTIRE hole so you can read the green and
// the full layout on a long hole. `mapZoom` (>1 = closer) and `mapPan` (a course-space offset
// added to the focus) let you zoom and drag the follow-cam around to look ahead. Drag pans the
// map UNLESS free-aim is active (then drag aims) — so "move the map around" is the default touch.
let mapView: 'follow' | 'whole' = 'follow';
let mapZoom = 1;
let mapPan: [number, number] = [0, 0];
// Shot-result popup: after a non-terminal shot settles, freeze on a result card + Continue
// before the next decision, so each shot gets its own beat. Module-level (a timed view
// effect, not reducer state — like animatedShots above).
let awaitingShotPopup = false;
let popupTimer = 0;
// The manual-putt pace meter (a time/DOM side-effect, like the play view) — mounted on the putt
// screen, torn down on any dispatch.
let puttMeter: PuttMeterHandle | null = null;

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
 * Wire pointer interaction on the decision map. Two gestures, disambiguated by mode:
 *  - FREE-AIM mode (the ✋ button is active, `selFreeTarget` set): tap/drag sets the aim target.
 *  - otherwise: drag PANS the map (moves the follow-cam's focus) so you can look ahead — "move the
 *    map around". A still tap does nothing.
 * Both reconstruct the EXACT decision-map projector via the shared `decisionView` helper so they
 * agree pixel-for-pixel with what's drawn. Pointer-move/up listen on `window` so a drag survives
 * the per-frame re-render that replaces the map element.
 */
function wireMapAiming(app: HTMLElement): void {
  if (state.screen !== 'playing' || !state.play || awaitingShotPopup) return;
  if (state.play.done || awaitingPutt(state.play)) return; // only the full-shot decision screen
  const svg = app.querySelector<SVGSVGElement>('[data-map] svg');
  if (!svg) return;
  // Reconstruct the projector the render used (same shape, frozen for the whole gesture so pan
  // math stays consistent even as the focus shifts mid-drag).
  const buildProj = () => {
    const spray = previewShot(
      state.play!,
      { clubId: selClubId!, aim: selAim, target: selFreeTarget ?? undefined },
      state.run.loadout,
    );
    return holeProjector(state.play!.hole, decisionView(state.play!, spray));
  };
  // Pointer → viewBox coords against the live SVG element.
  const toViewBox = (clientX: number, clientY: number): [number, number] | null => {
    const cur = document.querySelector<SVGSVGElement>('[data-map] svg');
    if (!cur) return null;
    const rect = cur.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return [((clientX - rect.left) / rect.width) * DMAP_W, ((clientY - rect.top) / rect.height) * DMAP_H];
  };

  // Gesture model, disambiguated by pointer count + movement (no mode toggle):
  //  • ONE finger, still (< slop) → TAP-aim at that point (tap-the-green-to-aim, the discoverable
  //    default); ONE finger, moved → PAN the follow-cam ("move the map around").
  //  • TWO fingers → PINCH-zoom the follow-cam (the universal map gesture), via mapZoom.
  const TAP_SLOP = 8; // px of movement below which a release counts as a tap, not a drag
  const pointers = new Map<number, { x: number; y: number }>();
  let panProj: ReturnType<typeof holeProjector> | null = null;
  let panStartCourse: [number, number] | null = null;
  let panStartOffset: [number, number] = [0, 0];
  let downX = 0;
  let downY = 0;
  let dragging = false;
  let pinch: { startDist: number; startZoom: number } | null = null;

  const aimTo = (clientX: number, clientY: number): void => {
    const vb = toViewBox(clientX, clientY);
    if (!vb || !state.play) return;
    const t = buildProj().unproject(vb[0], vb[1]);
    selFreeTarget = clampToReach(state.play, [t[0], t[1]]);
    scheduleRender();
  };
  const panTo = (clientX: number, clientY: number): void => {
    const vb = toViewBox(clientX, clientY);
    if (!vb || !panProj || !panStartCourse) return;
    // Drag the world under the finger: where the pointer started should stay under the pointer, so
    // the focus moves by (start − now) in course space. Frozen projector ⇒ a stable mapping.
    const now = panProj.unproject(vb[0], vb[1]);
    mapPan = [panStartOffset[0] + (panStartCourse[0] - now[0]), panStartOffset[1] + (panStartCourse[1] - now[1])];
    scheduleRender();
  };
  const twoFingerDist = (): number => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const move = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.preventDefault();
    if (pinch) {
      const d = twoFingerDist();
      if (d > 0 && pinch.startDist > 0) {
        mapZoom = Math.min(4, Math.max(0.4, pinch.startZoom * (d / pinch.startDist)));
        scheduleRender();
      }
      return;
    }
    if (!dragging && Math.hypot(e.clientX - downX, e.clientY - downY) > TAP_SLOP) {
      dragging = true; // crossed the slop → it's a drag (pan), not a tap
    }
    if (dragging && mapView !== 'whole') panTo(e.clientX, e.clientY);
  };
  const detach = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
  };
  function up(e: PointerEvent): void {
    pointers.delete(e.pointerId);
    if (pinch) {
      // Leaving a pinch: once below two fingers, end it and mark the gesture spent so the lingering
      // finger's release can't register a stray tap-aim.
      if (pointers.size < 2) {
        pinch = null;
        dragging = true;
      }
      if (pointers.size === 0) {
        dragging = false;
        detach();
      }
      return;
    }
    if (pointers.size === 0) {
      if (!dragging) aimTo(e.clientX, e.clientY); // a still single tap → aim there
      panProj = null;
      panStartCourse = null;
      dragging = false;
      detach();
    }
  }
  svg.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      downX = e.clientX;
      downY = e.clientY;
      dragging = false;
      // Freeze a projector at gesture start so pan math stays consistent across the per-frame
      // re-render that replaces the map element.
      const vb = toViewBox(e.clientX, e.clientY);
      panProj = buildProj();
      panStartCourse = vb ? (panProj.unproject(vb[0], vb[1]) as [number, number]) : null;
      panStartOffset = [mapPan[0], mapPan[1]];
    } else if (pointers.size === 2) {
      pinch = { startDist: twoFingerDist(), startZoom: mapZoom };
      dragging = true; // a second finger cancels any pending tap/pan
    }
    // Same fn refs each time → addEventListener de-dupes, so multiple pointers don't stack handlers.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

/**
 * The opt-in pull-back swing pad (GS-mux). Press the pad and drag DOWN to load a backswing; a power
 * meter + a number fill as you pull. Release past the commit threshold to swing (fires the SAME
 * action the Hit button would — club + aim define the shot, so the sim/determinism is untouched; the
 * pull is pure feel + a graded haptic). A short pull cancels. Pointer-move/up listen on `window` so
 * the gesture survives a re-render.
 */
function wireSwingPad(pad: HTMLElement): void {
  const MAX_PULL = 120; // px of drag for a full backswing
  const COMMIT = 0.18; // min power to count as a swing (a flick cancels)
  const fill = pad.querySelector<HTMLElement>('.gs-swingfill');
  const label = pad.querySelector<HTMLElement>('.gs-swinglabel');
  let active = false;
  let startY = 0;
  let power = 0;
  let lastNotch = 0;
  const setPower = (p: number): void => {
    power = Math.max(0, Math.min(1, p));
    if (fill) fill.style.height = `${(power * 100).toFixed(0)}%`;
    if (label) label.textContent = power < 0.02 ? '⬇ Pull back to swing' : `Power ${Math.round(power * 100)}%`;
    // A ratcheting haptic as the backswing loads.
    const notch = Math.floor(power * 5);
    if (notch !== lastNotch) {
      lastNotch = notch;
      haptic(6);
    }
  };
  const move = (e: PointerEvent): void => {
    if (!active) return;
    e.preventDefault();
    setPower((e.clientY - startY) / MAX_PULL); // drag DOWN = load
  };
  const up = (): void => {
    if (!active) return;
    active = false;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    const committed = power >= COMMIT;
    const action = committed ? (JSON.parse(pad.dataset.swing!) as Action) : null;
    setPower(0);
    if (action) {
      haptic(HAPTICS.swing);
      dispatch(action);
    }
  };
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    active = true;
    startY = e.clientY;
    lastNotch = 0;
    setPower(0);
    resumeAudio();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
}

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

/** The current lie as a prominent, colour-coded chip with its effect on the NEXT shot — so the
 *  player always knows what they're playing from and how it bites (carry penalty + spray), shown
 *  right where the shot decision is made. This is the lie-awareness the per-shot popup used to
 *  carry, moved to the moment it actually matters. */
function lieChip(lie: string): string {
  const info = lieInfo(lie);
  const label = info.label ?? lie;
  const carryPen = info.carryMult < 0.99 ? `−${Math.round((1 - info.carryMult) * 100)}% carry` : '';
  const spray = info.dispersionMult >= 1.55 ? 'very wild' : info.dispersionMult >= 1.25 ? 'wild' : info.dispersionMult > 1.05 ? 'loose' : '';
  const eff = [carryPen, spray].filter(Boolean).join(' · ');
  const trouble = !!info.penalty || info.carryMult <= 0.6 || info.dispersionMult >= 1.55;
  const caution = info.carryMult < 0.95 || info.dispersionMult > 1.15;
  const col = trouble ? '#ff6b6b' : caution ? '#ffc454' : '#5fd45a';
  const dot = trouble ? '🔴' : caution ? '🟠' : '🟢';
  return `<span class="gs-liechip" style="border-color:${col};color:${col};">${dot} <b style="color:var(--gs-ink);">${label}</b>${eff ? ` <span style="opacity:.85;">${eff}</span>` : ''}</span>`;
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
  // Per-hole warning when the void's lost-rough is actually ARMED here (deep stops): miss = lost ball.
  if (lieInfo(roughLieOf(hole)).penalty) parts.push('🕳 lost rough — miss the fairway = lost ball');
  return parts.join(' · ');
}

/** A list of zone traits (hazards/benefits), each an icon + line. */
function traitList(title: string, accent: string, traits: { icon: string; text: string }[]): string {
  const rows = traits
    .map(
      (t) =>
        `<li style="display:flex;gap:7px;align-items:flex-start;margin:3px 0;font-size:12.5px;line-height:1.3;">
           <span style="flex:0 0 auto;">${t.icon}</span><span style="opacity:.9;">${t.text}</span></li>`,
    )
    .join('');
  return `<div style="flex:1 1 0;min-width:140px;">
      <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${accent};font-weight:700;margin-bottom:2px;">${title}</div>
      <ul style="list-style:none;padding:0;margin:0;">${rows}</ul>
    </div>`;
}

// Decision/putt map geometry — portrait so the map fills the screen. The reach factor zooms the
// follow-cam in on the contemplated shot (smaller = tighter); the playable corridor fills the
// frame and the rough/OB legitimately stretch off-screen.
const DMAP_W = 360;
const DMAP_H = 600;
// Ball sits LOW in the tall portrait view so most of the frame is the shot AHEAD (a high bias
// kills the dead space behind the tee that a centred camera leaves).
const DMAP_BIAS = 0.8;
/** View radius (course yds) framing a shot of max-carry `carryHigh`. Tuned with DMAP_BIAS so the
 *  contemplated shot nearly fills the height and the corridor fills the width — the rough/OB
 *  stretch off-screen (the "zoom in, let the hole run off the edges" ask). */
function decisionReach(carryHigh: number): number {
  return Math.max(30, carryHigh * 0.36);
}

/** Reset the map view to the default follow-cam (called on a new shot / new hole). */
function resetMapView(): void {
  mapView = 'follow';
  mapZoom = 1;
  mapPan = [0, 0];
}

/** Whether the view has been moved off the default follow-cam (so we offer a Recenter button). */
function mapViewMoved(): boolean {
  return mapView !== 'follow' || mapZoom !== 1 || mapPan[0] !== 0 || mapPan[1] !== 0;
}

/**
 * The decision/aim map projector options, derived from the current map-nav state. SHARED by the
 * decision render AND `wireMapAiming`'s unproject so tap/drag aiming can never drift from what's
 * drawn (the projector-sync gotcha). `whole` mode fits the entire hole; `follow` zooms the camera
 * onto the contemplated shot, offset by `mapPan` and scaled by `mapZoom`.
 */
function decisionView(play: NonNullable<UiState['play']>, spray: ShotSpread): ProjectOptions {
  const base: ProjectOptions = { width: DMAP_W, height: DMAP_H };
  if (mapView === 'whole') return base; // whole-hole fit — see the green + full layout
  const reach = decisionReach(spray.carryHigh) / mapZoom;
  const focus: [number, number] = [play.ball[0] + mapPan[0], play.ball[1] + mapPan[1]];
  return { ...base, focus, viewRadius: reach, focusBias: DMAP_BIAS };
}

/** Running stop score vs the cut-to-beat, coloured by how the run is tracking:
 *  🟢 beating the cut · 🟠 within striking distance · 🔴 well short. */
/** Friendly name for a penalty surface in Sam's hazard read (the carry-to-clear callout). */
function hazardLabel(kind: string): string {
  if (kind === 'water') return 'the water';
  if (kind === 'lava' || kind === 'lavariver') return 'the lava';
  if (kind === 'void' || kind === 'voidrough') return 'the void';
  if (kind === 'frozenpond') return 'the pond';
  if (kind === 'creek') return 'the creek';
  return 'the hazard';
}

/** A one-shot, assetless sparkle burst (CSS only) for the big beats — made cut, a holed shot.
 *  Skipped under reduced-motion. Deterministic spark layout (no Math.random). Needs a
 *  position:relative ancestor; pointer-events:none so it never blocks a tap. */
function burst(): string {
  if (getSettings().reducedMotion) return '';
  const N = 16;
  const sparks = Array.from({ length: N }, (_, i) => {
    const ang = (i / N) * 360 + ((i * 37) % 30);
    const d = 64 + ((i * 53) % 90);
    const dx = Math.cos((ang * Math.PI) / 180) * d;
    const dy = Math.sin((ang * Math.PI) / 180) * d;
    const ch = ['✦', '⭐', '✧', '·'][i % 4];
    return `<span class="gs-spark" style="--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;animation-delay:${(i % 5) * 45}ms;">${ch}</span>`;
  }).join('');
  return `<div class="gs-burst" aria-hidden="true">${sparks}</div>`;
}

/** A momentum rail: one pip per hole in the stop, coloured by the score already made (eagle gold →
 *  blow-up red), the current hole ringed, upcoming holes dim — so the run's shape reads at a glance. */
function holePips(): string {
  const total = state.course.holes.length;
  const done = state.stopPlayed ?? [];
  const cur = state.play?.holeIndex ?? done.length;
  const pips = Array.from({ length: total }, (_, i) => {
    if (i < done.length) {
      const r = done[i]!.record;
      const rel = r.strokes - r.par;
      const col = done[i]!.pickedUp
        ? '#b3402f'
        : rel <= -2 ? '#ffd54a' : rel === -1 ? '#5fd45a' : rel === 0 ? '#9fd8e6' : rel === 1 ? '#ffc454' : '#ff6b6b';
      return `<span class="gs-pip" style="background:${col};" title="hole ${i + 1}: ${r.strokes} (par ${r.par})"></span>`;
    }
    return `<span class="gs-pip${i === cur ? ' gs-pip--cur' : ''}"></span>`;
  }).join('');
  return `<div class="gs-pips" aria-hidden="true">${pips}</div>`;
}

function zoneScoreChip(): string {
  const done = state.stopPlayed ?? [];
  const sf = playTotals(done.map((p) => p.record)).stableford;
  const cut = effectiveCut(state.run, state.course.holes.length);
  const gap = cut - sf;
  const col = gap <= 0 ? '#5fd45a' : gap <= Math.ceil(cut / 2) ? '#ffc454' : '#ff6b6b';
  return `<span class="gs-shotscore" style="color:${col};" title="stop Stableford vs the cut to make">${sf}/${cut} pts</span>`;
}

/** The compact top stat bar for the play screen (replaces the old per-hole briefing splash):
 *  hole #/total, par + hole length, the live distance, the running zone score, the shot number,
 *  plus a thin lie/wind/conditions sub-line. */
function playTopBar(v: ReturnType<typeof shotView>, opts: { shotNo: number; distLabel: string }): string {
  const play = state.play!;
  const len = Math.round(dist(play.hole.tee, play.hole.green));
  const cond = conditionsSummary(play.hole, holeBiome(play.hole));
  // Scramble (GS-scramble): a co-op boss — show the partner + whether the last shot kept their ball.
  const boss = currentBoss(state.run);
  const scrambleLine = boss?.partner === 'scramble'
    ? `<div class="gs-sub" style="color:${scramblePartner(state.run).style.cap};">🤝 Scramble with <b>${scramblePartner(state.run).name}</b>${play.partnerKept ? ' · kept their ball ✓' : play.shots.length ? ' · your ball held' : ''}</div>`
    : '';
  return `
    <div class="gs-topbar">
      <div class="gs-stats">
        <span>⛳ Hole <b>${play.holeIndex + 1}/${state.course.holes.length}</b></span>
        <span>Par <b>${play.hole.par}</b> · ${len}y</span>
        <span>${opts.distLabel}</span>
        <span>Shot <b>${opts.shotNo}</b></span>
        ${zoneScoreChip()}
      </div>
      <div class="gs-sub">${lieChip(v.lie)} · ${windDescription(play.hole)}${cond ? ` · ${cond}` : ''} · pick up at +4 (${play.hole.par + 4})</div>
      ${scrambleLine}
      ${holePips()}
    </div>`;
}

function playingBody(animating: boolean): string {
  const play = state.play!;
  const v = shotView(play, state.run.loadout);
  const bag = state.run.loadout.bag;
  const par = play.hole.par;

  if (animating) {
    return `
      <div class="gs-shot">
        ${playTopBar(v, { shotNo: play.strokes, distLabel: '…watching the shot…' })}
        <div class="gs-bigmap" id="play"></div>
      </div>`;
  }

  if (play.done) {
    const name = play.pickedUp ? 'Picked up' : scoreName(par, play.strokes);
    const lastCard = play.shots.length ? shotCardHTML(play.shots[play.shots.length - 1]!) : '';
    const puttCard = play.puttLogs.length
      ? puttCardHTML(play.puttLogs, { holed: play.holed, pickedUp: play.pickedUp })
      : '';
    const birdieOrBetter = !play.pickedUp && play.strokes <= par - 1;
    return `
      ${header()}
      <div style="position:relative;">${birdieOrBetter ? burst() : ''}</div>
      <h2 style="font-size:17px;">Hole ${play.holeIndex + 1}: <b>${play.strokes}</b> — ${name}${play.holed && play.shots.some((s) => s.holed) ? ' 🎉' : ''}</h2>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0;max-width:420px;">${lastCard}${puttCard}</div>
      <div style="margin-top:8px;">${btn('Continue →', { type: 'holeComplete' }, { variant: 'primary' })}</div>`;
  }

  // Manual putting on the green (auto-putt off): stroke putts one at a time.
  if (awaitingPutt(play)) {
    // Frame the putt on the ball→cup line: centre the view on the MIDPOINT of the two and size it
    // to the putt length, so the cup and ball both sit on-screen with even margin — not the ball
    // dead-centre with the green (and a lot of dead rough) shoved to one edge.
    const puttPin = pinOf(play.hole);
    const puttMid: [number, number] = [
      (play.ball[0] + puttPin[0]) / 2,
      (play.ball[1] + puttPin[1]) / 2,
    ];
    const puttSvg = renderHoleSVG(play.hole, {
      shots: play.shots,
      biome: holeBiome(play.hole), themeId: holeThemeId(play.hole),
      width: DMAP_W,
      height: DMAP_H,
      ball: play.ball,
      // Zoom in on the ball↔cup span (midpoint-centred) so both ends frame with even margin.
      focus: puttMid,
      viewRadius: Math.max(9, v.distToPin * 0.62),
      focusBias: 0.5,
    });
    // Manual putt = a pace meter: stop the sweeping marker in the green MAKE band to sink it.
    // Tapping the meter OR the Putt button captures the pace. The band widens with putter upgrades.
    const meterInstr =
      '<p style="font-size:11.5px;opacity:.6;margin:.1em 0 .4em;line-height:1.4;">Tap the meter (or Putt) when the marker is in the green <b>MAKE</b> band. Too soft leaves it short; too firm runs it past.</p>';
    return `
      <div class="gs-shot">
        ${playTopBar(v, { shotNo: play.strokes + play.putts + 1, distLabel: `<b>${v.distToPin}</b> yds to cup · putt <b>${play.putts + 1}</b>` })}
        <div class="gs-bigmap">${puttSvg}</div>
        <div class="gs-bottom">
          ${meterInstr}
          <div id="puttmeter" style="margin:2px 0;"></div>
          <div class="gs-hitbar">
            <button class="gs-btn gs-btn--primary" data-putt-commit="1">⛳ Putt</button>
          </div>
        </div>
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
    resetMapView();
  }
  // Only lie-legal clubs are selectable (driver tee-only unless the Driver Dan caddy unlocks it).
  const usable = usableBag(bag, play.lie, state.run.loadout.driverAnywhere ?? false);
  // The EXPLICIT suggestion affordances are a Suggestible Sam caddy perk (GS-caddy): the 🎯 snap-back
  // button, the legend's `suggested: …` readout, the 🎒 yardage read, and the confidence scoring edge
  // only appear with Sam. But the DEFAULT-selected club is the green-coverage pick for EVERYONE — its
  // whole job is to stop you flying the green, so handing the base flow the longest club (an overshoot
  // by default) was an overcorrection. Sam sells the precise read + confidence, not "don't overshoot".
  const hasSuggest = !!state.run.loadout.clubSuggest;
  const onGreenPutter = v.lie === 'green' && usable.some((c) => c.id === 'putter');
  // The green-coverage suggestion. Putter is the obvious green default for everyone — that's not a
  // "suggestion", just the only sensible flat-stick choice.
  const suggested = onGreenPutter ? 'putter' : v.attackClubId;
  // Default selection: putter on the green, else the green-coverage club (longest that still stops on
  // the green). You can still cycle/override; Sam just makes the suggestion explicit and snap-back-able.
  const defaultClubId = suggested;
  if (selClubId === null || !usable.some((c) => c.id === selClubId)) selClubId = defaultClubId;
  // A tapped/dragged free target overrides attack/safe; otherwise the aim choice picks the point.
  const decision = { clubId: selClubId, aim: selAim, target: selFreeTarget ?? undefined };
  const spray = previewShot(play, decision, state.run.loadout);
  // Feel escape-hatch: window._gsSpray scales the green centre wedge live (A/B the cone geometry).
  const sprayGeom = (window as unknown as { _gsSpray?: SprayGeomInput })._gsSpray;
  // % of shots per zone — straight off the shot's asymmetric shape, so the legend reads exactly true.
  const sh = spray.shape;
  const pctRound = (x: number) => Math.round(x * 100);
  // Zoom in and follow the ball: frame the CONTEMPLATED shot's reach (the spray's far arc), so a
  // short approach zooms right in and an unreachable green legitimately sits off-screen (#7). The
  // map-nav controls (overview/zoom/pan) drive the projector through the SHARED `decisionView`
  // helper so `wireMapAiming`'s unproject stays in lockstep with what's drawn.
  const mapOpts = decisionView(play, spray);
  const svg = renderHoleSVG(play.hole, {
    shots: play.shots,
    biome: holeBiome(play.hole), themeId: holeThemeId(play.hole),
    ball: play.ball,
    spray,
    sprayGeom,
    ...mapOpts,
  });
  // Map-nav overlay (floats ON the map so it needs no scrolling): overview/follow toggle, zoom
  // in/out, and a recenter that snaps back to the default follow-cam. Solves "can't see the green
  // / full hole on a long hole" (overview) and "move the map around" (zoom + drag-to-pan).
  const mapCtrls = `
    <div class="gs-mapctrl">
      <button class="gs-mapbtn${mapView === 'whole' ? ' gs-mapbtn--on' : ''}" data-mapview="toggle" title="${mapView === 'whole' ? 'Follow the ball' : 'See the whole hole'}">${mapView === 'whole' ? '🎯' : '🗺'}</button>
      <button class="gs-mapbtn" data-mapzoom="in" title="Zoom in"${mapView === 'whole' ? ' disabled' : ''}>＋</button>
      <button class="gs-mapbtn" data-mapzoom="out" title="Zoom out"${mapView === 'whole' ? ' disabled' : ''}>－</button>
      ${mapViewMoved() ? `<button class="gs-mapbtn" data-mapview="reset" title="Recenter on the ball">⌖</button>` : ''}
      <button class="gs-mapbtn" data-open-settings="1" title="Settings">⚙</button>
    </div>`;
  const cbtn = (label: string, dir: number) =>
    `<button class="gs-btn" data-cycle="${dir}" aria-label="cycle club ${dir > 0 ? 'up' : 'down'}">${label}</button>`;
  const clubButtons = `
    ${cbtn('◄', -1)}
    <b style="display:inline-block;min-width:6em;text-align:center;">${usable.find((c) => c.id === selClubId)?.name ?? selClubId}</b>
    ${cbtn('►', 1)}
    ${hasSuggest ? `<button class="gs-btn${selClubId === suggested ? ' gs-btn--on' : ''}" data-suggest="1" title="Use the suggested club">🎯 Suggested</button>` : ''}`;
  // One-row SEGMENTED aim control (was three wrapping buttons eating vertical space). The "line
  // blocked" state is a ⚠ glyph on Safe, not inline text that forces a wrap.
  const seg = (key: string, label: string, sel: boolean, title = ''): string =>
    `<button class="gs-segbtn${sel ? ' gs-segbtn--on' : ''}" data-aim="${key}"${title ? ` title="${title}"` : ''}>${label}</button>`;
  const aimButtons = `<div class="gs-seg">
    ${seg('attack', '🎯 Attack', selAim === 'attack' && !selFreeTarget)}
    ${seg('safe', `🛟 Safe${v.blocked ? ' ⚠' : ''}`, selAim === 'safe' && !selFreeTarget, v.blocked ? 'Direct line blocked — Safe lays up to the corridor' : 'Lay up to the fat of the green')}
    ${seg('free', `✋ Aim${selFreeTarget ? ' •' : ''}`, !!selFreeTarget, 'Tap the map to aim anywhere (drag the map to pan)')}
  </div>`;
  const hitAction: Action = { type: 'shot', clubId: selClubId!, aim: selAim, ...(selFreeTarget ? { target: selFreeTarget } : {}) };
  // Suggestible Sam's caddy read: precise front/middle/back green yardages + the carry to clear the
  // nearest forced hazard on the line to the pin. Pure info off the sim — only shown once Sam is hired.
  let samRead = '';
  if (hasSuggest && play.lie !== 'green') {
    const gd = greenDepth(play.hole, play.ball);
    const mid = Math.round(dist(play.ball, play.hole.green));
    const fc = forcedCarry(play.hole, play.ball, pinOf(play.hole));
    const carryTxt = fc
      ? ` · <span style="color:var(--gs-warn);">⚠ carry <b>${fc.carry}</b> to clear ${hazardLabel(fc.kind)}</span>`
      : '';
    samRead = `<p class="gs-legend" style="opacity:.9;">🎒 <b>Sam:</b> front <b>${Math.round(gd.front)}</b> · middle <b>${mid}</b> · back <b>${Math.round(gd.back)}</b> yds${carryTxt}</p>`;
  }
  return `
    <div class="gs-shot${lefty() ? ' gs-shot--lefty' : ''}">
      ${playTopBar(v, { shotNo: play.strokes + 1, distLabel: `<b>${v.distToPin}</b> yds to pin` })}
      <div class="gs-bigmap" data-map="1">${svg}${mapCtrls}</div>
      <div class="gs-bottom">
        <div class="gs-ctrlrow">${clubButtons}</div>
        ${samRead}
        <p class="gs-legend">
          <span style="color:#5fd45a;">▮</span> ${pctRound(sh.green)}% great ·
          <span style="color:#ffc454;">▮</span> ${pctRound(sh.hookL)}% hook / ${pctRound(sh.sliceR)}% slice ·
          <span style="color:#ff4c4c;">▮</span> ${pctRound(sh.duckHookL)}% duck-hook / ${pctRound(sh.shankR)}% shank ·
          carry <b>${Math.round(spray.carryLow)}–${Math.round(spray.carryHigh)} yds</b>
          <span style="opacity:.6;">${hasSuggest ? ` · suggested: attack ${v.attackClubId} · safe ${v.safeClubId}` : ''}${selFreeTarget ? ' · ✋ free aim' : ''}</span>
        </p>
        ${aimButtons}
        <div class="gs-hitbar">
          ${
            getSettings().swingGesture
              ? `<button class="gs-btn gs-btn--primary gs-swingpad" data-swing='${JSON.stringify(hitAction)}'>
                   <span class="gs-swingfill"></span>
                   <span class="gs-swinglabel">⬇ Pull back to swing</span>
                 </button>`
              : btn('🏌 Hit', hitAction, { variant: 'primary' })
          }
          ${btn('» Auto-finish hole', { type: 'autoShotHole' }, { variant: 'ghost' })}
        </div>
      </div>
    </div>
    ${awaitingShotPopup ? shotPopupOverlay() : ''}`;
}

// Settings sheet — a view overlay (not reducer state), toggled like the shot popup.
let settingsOpen = false;

/** The settings sheet: player-owned feel/control prefs (sound, haptics, fast shots, swing gesture,
 *  left-handed, reduced motion). Persisted to localStorage via the settings module. */
function settingsOverlay(): string {
  const s = getSettings();
  const row = (key: keyof Settings, label: string, desc: string): string => {
    const on = s[key];
    return `<button class="gs-setrow" data-setting="${key}">
      <span class="gs-setlabel"><b>${label}</b><span>${desc}</span></span>
      <span class="gs-toggle${on ? ' gs-toggle--on' : ''}" aria-hidden="true"><span class="gs-knob"></span></span>
    </button>`;
  };
  return `
    <div class="gs-sheet-backdrop" data-settings="close">
      <div class="gs-sheet" data-settings="keep">
        <div class="gs-sheet-head"><b style="font-size:17px;">⚙ Settings</b>
          <button class="gs-mapbtn" data-settings="close" title="Close">✕</button></div>
        ${row('sound', 'Sound', 'Chimes & contact cues (no downloads)')}
        ${row('haptics', 'Haptics', 'Vibration feedback on supported phones')}
        ${row('fastShots', 'Fast shots', 'Skip the tap after each shot — roll straight on')}
        ${row('swingGesture', 'Swing gesture', 'Pull back on the map & release to hit')}
        ${row('leftHanded', 'Left-handed', 'Mirror the bottom controls')}
        ${row('reducedMotion', 'Reduced motion', 'Calmer effects & celebrations')}
        <div style="text-align:center;margin-top:10px;">
          <button class="gs-btn gs-btn--primary" data-settings="close" style="padding:11px 26px;">Done</button>
        </div>
      </div>
    </div>`;
}

/** Modal shot-result popup: the just-played shot's card + a Continue, shown after the shot has
 *  settled so each shot gets its own beat before the next decision. */
function shotPopupOverlay(): string {
  const play = state.play!;
  const last = play.shots[play.shots.length - 1];
  if (!last) return '';
  const distToPin = last.holed ? undefined : Math.round(dist(play.ball, pinOf(play.hole)));
  // The whole backdrop is a dismiss target so a tap anywhere advances — one less precise tap
  // per shot on a phone. The card itself sits above it with the explicit Continue button.
  return `
    <div data-popup-continue="1" style="position:fixed;inset:0;background:rgba(5,7,11,0.72);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px;overflow:auto;cursor:pointer;">
      <div style="display:flex;flex-direction:column;align-items:stretch;gap:12px;max-width:300px;width:100%;">
        ${shotCardHTML(last, { distToPin })}
        <button class="gs-btn gs-btn--primary" data-popup-continue="1" style="text-align:center;font-size:16px;padding:12px;">Continue →</button>
      </div>
    </div>`;
}

function scorecard(): string {
  if (!state.played) return '';
  const rows = state.played
    .map((p, i) => {
      const sel = i === state.viewHole;
      return `<tr${sel ? ' style="background:#1d212c;"' : ''} data-action='${JSON.stringify({ type: 'viewHole', hole: i })}'>
        <td>${i + 1}</td><td>${p.record.par}</td>
        <td><b>${p.record.strokes}</b></td><td style="opacity:.8;">${p.pickedUp ? 'Picked up' : scoreName(p.record.par, p.record.strokes)}</td></tr>`;
    })
    .join('');
  return `<table class="gs-scorecard">
    <tr><th>#</th><th>Par</th><th>Score</th><th></th></tr>${rows}</table>`;
}

function resultScreen(): string {
  const res = state.lastResult!;
  return `
    ${header()}
    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
      <div>
        <div id="play" class="gs-replay" style="border:1px solid var(--gs-line);border-radius:var(--gs-r);overflow:hidden;box-shadow:var(--gs-shadow);"></div>
        <div style="margin-top:6px;">
          ${btn('↻ Replay', { type: 'viewHole', hole: state.viewHole }, { variant: 'ghost' })}
          <span style="font-size:12px;opacity:.6;">click a row to watch that hole</span>
        </div>
      </div>
      <section style="flex:1 1 240px;min-width:240px;position:relative;">
        ${res.passed ? burst() : ''}
        <h2 style="font-size:16px;margin:.2em 0;color:${res.passed ? '#5fd45a' : '#ff6b6b'};">
          ${res.passed ? 'MADE THE CUT' : 'MISSED CUT'}</h2>
        <p style="font-size:15px;">Stableford <b>${res.stableford}</b> vs cut <b>${res.cut}</b>
          · gross ${res.gross} · <b>+${res.creditsEarned}</b> credits</p>
        ${scorecard()}
        <div style="margin-top:10px;">${btn('Continue → shop', { type: 'continue' }, { variant: 'primary' })}</div>
      </section>
    </div>`;
}

function shopScreen(): string {
  const perks = state.run.loadout.perks;
  const credits = state.run.credits;
  const hasCaddy = !!namedCaddyOwned(perks);
  // A reward club (GS-clubs-2) shows whether it UPGRADES a club you carry or is a NEW club, and which
  // distance gap it fills — so the buy decision is legible at a glance.
  const clubBadge = (it: NonNullable<ReturnType<typeof shopItem>>): { text: string; tone?: 'up' | 'new' } | undefined => {
    if (!it.clubType) return undefined;
    const note = clubOfferNote(it, state.run.loadout);
    if (!note) return undefined;
    if (note.kind === 'upgrade') {
      return { text: note.gainYd ? `▲ UPGRADE · +${note.gainYd} yd` : '▲ UPGRADE', tone: 'up' };
    }
    const between =
      note.longerName && note.shorterName
        ? `${note.longerName}→${note.shorterName}`
        : note.longerName
        ? `under ${note.longerName}`
        : note.shorterName
        ? `over ${note.shorterName}`
        : '';
    return { text: `✚ NEW · ~${note.carry} yd${between ? ` (${between})` : ''}`, tone: 'new' };
  };
  const renderCard = (it: NonNullable<ReturnType<typeof shopItem>>): string => {
    const owned = ownedCount(perks, it.id);
    const maxed = owned >= itemCap(it);
    const cost = itemCost(it, owned);
    const afford = credits >= cost;
    const buyable = !maxed && afford;
    const card = itemCardHTML({ ...it, cost }, { owned: maxed, affordable: afford, count: owned, badge: clubBadge(it) });
    // Wrap the card so the whole thing is the buy button when purchasable.
    return buyable
      ? `<div class="gs-clickcard" data-action='${JSON.stringify({ type: 'buy', id: it.id })}' style="cursor:pointer;margin:4px;">${card}</div>`
      : `<div style="margin:4px;">${card}</div>`;
  };
  // The stock was fixed on shop entry (state.shopOffer); cost/stack state is live. Gear and reward
  // clubs (GS-clubs-2) share ONE 4-card rack — no separate row.
  const stock = (state.shopOffer ?? [])
    .map((id) => shopItem(id))
    .filter((it): it is NonNullable<typeof it> => !!it)
    // Once any named caddy is hired, the others vanish from the offer (you may keep only one).
    .filter((it) => it.caddy !== 'named' || !hasCaddy || ownedCount(perks, it.id) > 0)
    .map(renderCard)
    .join('');
  return `
    ${header()}
    <h2 style="font-size:16px;">Outfitter · ${credits} credits</h2>
    <p style="font-size:12px;opacity:.6;margin:.2em 0 .6em;">Click a card to buy. Stock rotates each stop — stackable upgrades cost more the more you own. Rare clubs (▲ upgrades or ✚ new gap-fillers) and a rare caddy may turn up; hire one caddy and the rest stay home.</p>
    <div style="display:flex;flex-wrap:wrap;">${stock}</div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      ${btn('Travel onward →', { type: 'leaveShop' }, { variant: 'primary' })}
      ${
        credits >= rerollCost(state.shopRerolls ?? 0)
          ? btn(`🎲 Reroll stock (${rerollCost(state.shopRerolls ?? 0)} cr)`, { type: 'rerollShop' }, { variant: 'ghost' })
          : `<span style="font-size:12px;opacity:.5;">🎲 Reroll needs ${rerollCost(state.shopRerolls ?? 0)} cr</span>`
      }
    </div>`;
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
      ? `<div class="gs-clickcard" data-action='${JSON.stringify({ type: 'buyUpgrade', id: u.id })}' style="cursor:pointer;margin:4px;">${card}${track}</div>`
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
    <div style="margin-top:12px;">${btn('← Back to title', { type: 'closeOutpost' }, { variant: 'ghost' })}</div>`;
}

function travelScreen(): string {
  const routes = (state.routes ?? [])
    .map((r) => {
      const ev = r.event;
      const credit =
        ev.creditMult !== 1 ? `${ev.creditMult > 1 ? '+' : ''}${Math.round((ev.creditMult - 1) * 100)}% credits` : '';
      const cut = ev.cutDelta !== 0 ? `cut ${ev.cutDelta > 0 ? '+' : ''}${ev.cutDelta}` : '';
      const tag = [credit, cut].filter(Boolean).join(' · ');
      // Boss-ahead preview + the harder-path (elite) flag (GS-voyage).
      const badges = [
        r.bossAhead ? `<span style="color:#ff8b6b;font-weight:600;">⚔ Boss ahead</span>` : '',
        r.elite ? `<span style="color:#ffce54;font-weight:600;">🔥 Harder path</span>` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      // A whole route card is the click target (the shared btn() wraps an action handler).
      return btn(
        `<div style="text-align:left;">
           <div style="font-size:15px;"><b>${ev.label}</b> <span style="opacity:.6;">· ↗ ${r.label} (+${r.distanceJump} distance)</span></div>
           <div style="font-size:13px;opacity:.82;margin:3px 0;">${ev.desc}</div>
           ${tag ? `<div style="font-size:12px;opacity:.7;">${tag}</div>` : ''}
           ${badges ? `<div style="font-size:12px;margin-top:3px;">${badges}</div>` : ''}
         </div>`,
        { type: 'route', routeId: r.id },
        { borderColor: r.elite ? '#ffce54' : rarCol(ev.rarity), block: true },
      );
    })
    .join('');
  // Push-your-luck cash-out (GS-bank): bank the run now to lock its credits in as permanent shards
  // (busting at the next cut would forfeit them). Shown with the exact shard payout so the "push or
  // bank" call is informed.
  const cashOut = cashOutShards(state.run);
  const bankBtn =
    state.run.stopIndex > 0
      ? `<div style="margin-top:14px;border-top:1px solid var(--gs-line);padding-top:12px;">
           <p style="opacity:.7;font-size:13px;margin:0 0 6px;">…or quit while you're ahead — cash your <b>${state.run.credits}</b> credits into permanent shards. Push deeper and a missed cut forfeits them.</p>
           ${btn(`✦ Bank run & cash out${cashOut > 0 ? ` (+${cashOut} shards)` : ''}`, { type: 'bank' }, { variant: 'ghost', block: true })}
         </div>`
      : '';
  return `
    ${header()}
    <h2 style="font-size:16px;">Choose your jump</h2>
    <p style="opacity:.75;font-size:14px;">Deeper jumps raise the cut and wildness; each lane's event tilts the risk and the payout. There's always a calm option.</p>
    <div>${routes}</div>
    ${bankBtn}`;
}

function gameoverScreen(): string {
  const r = state.run;
  const earned = state.lastRunShards;
  const banked = r.endedReason === 'banked';
  const won = r.endedReason === 'won';
  const heading = won
    ? `<h2 style="font-size:22px;color:#ffce54;">🏆 Voyage complete — you won the Galactic Major!</h2>`
    : banked
    ? `<h2 style="font-size:20px;color:#5fd45a;">Banked — you quit while ahead</h2>`
    : `<h2 style="font-size:20px;color:#ff6b6b;">Run over — stranded at the cut</h2>`;
  const unlock =
    won && r.ascension < ASCENSION_MAX
      ? `<p style="font-size:14px;color:#ffce54;">⚔ Ascension <b>A${r.ascension}</b> cleared — <b>A${r.ascension + 1}</b> unlocked. Start the next voyage tougher.</p>`
      : won && r.ascension >= ASCENSION_MAX
      ? `<p style="font-size:14px;color:#ffce54;">⚔ You cleared the TOP Ascension (A${r.ascension}). Legendary.</p>`
      : '';
  const reached =
    (won
      ? `<p style="font-size:15px;">You cleared all three arcs${r.ascension > 0 ? ` at Ascension A${r.ascension}` : ''} and cashed out <b>${r.credits}</b> credits with a champion's bonus.</p>`
      : `<p style="font-size:15px;">You reached <b>stop ${r.stopIndex + 1}</b>, distance <b>${r.distanceFromStart}</b>${banked ? `, and cashed out <b>${r.credits}</b> credits` : ''}.</p>`) +
    unlock;
  return `
    ${header()}
    ${heading}
    ${reached}
    ${earned !== undefined ? `<p style="font-size:15px;color:#e08a2b;">✦ Earned <b>${earned}</b> Star Shards · ${state.shards} banked</p>` : ''}
    <p style="opacity:.8;">Best ever: distance <b>${state.bestDistance}</b>, Stableford <b>${state.bestStableford}</b>.</p>
    <div style="margin-top:8px;">
      ${btn('🛰 Spend at the Outpost', { type: 'openOutpost' }, { variant: 'ghost' })}
      ${btn('🚀 New run', { type: 'restart', seed: Math.floor(Math.random() * 1e9) }, { variant: 'primary' })}
    </div>`;
}

/** Per-hole render keys (GS-variation): a split-biome stop's back holes carry their own biome/theme,
 *  so each hole renders + reads as its world; fall back to the course-level keys otherwise. */
function holeBiome(h: { biome?: string }): string {
  return h.biome ?? state.course.biome;
}
function holeThemeId(h: { themeId?: string }): string | undefined {
  return h.themeId ?? state.course.meta.themeId;
}

/** The selected golfer's on-course look (GS-18), or undefined → the loader-crew cap cycle. */
function golferLook(): GolferStyle | undefined {
  return getCharacter(state.run.loadout.characterId)?.style;
}

/** The co-op scramble partner golfer for the current boss stop (GS-scramble), if any. */
function scramblePartner(run: typeof state.run): Character {
  return scramblePartnerChar(run.seed, run.stopIndex, run.loadout.characterId);
}

/** The hired named caddy's id (GS-caddy), or undefined — drawn in the play-view/putt-meter corner. */
function caddyId(): string | undefined {
  return namedCaddyOwned(state.run.loadout.perks);
}

/** Left-handed mode (GS-lefty) — the live player setting. The sim reads it off `loadout.lefty`
 *  (synced from this in `render`), the renderers take it as an option, the CSS keys a modifier. */
function lefty(): boolean {
  return getSettings().leftHanded;
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  // Settings → sim bridge (GS-lefty): the pure sim can't read localStorage, so bake the live
  // left-handed setting onto the loadout here. render() runs after every dispatch and after the
  // settings toggle's direct render(), so `loadout.lefty` is always current before the next shot
  // reducer reads it — and it's NOT serialised (re-derived here on resume), so no save bump.
  if (state.run?.loadout) state.run.loadout.lefty = lefty();

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
      resetMapView();
    }
    animatingPlay = pendingAnimation(state.play);
  }

  const body =
    state.screen === 'title'
      ? titleScreen()
      : state.screen === 'character'
      ? characterScreen()
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

  app.innerHTML = `<main class="gs-main">${body}</main>${settingsOpen ? settingsOverlay() : ''}`;
  app.setAttribute('data-booted', '1'); // tell the boot watchdog the app painted

  // Wire actions.
  app.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
    el.addEventListener('click', () => dispatch(JSON.parse(el.dataset.action!) as Action));
  });
  // Local (non-game) controls on the playing screen: club cycle + aim select.
  app.querySelectorAll<HTMLElement>('[data-cycle]').forEach((el) => {
    el.addEventListener('click', () => {
      // Cycle through only the lie-legal clubs (driver tee-only unless the Driver Dan caddy unlocks it).
      const lie = state.play?.lie ?? 'tee';
      const bag = usableBag(state.run.loadout.bag, lie, state.run.loadout.driverAnywhere ?? false);
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
  // Map-nav: overview/follow toggle + recenter.
  app.querySelectorAll<HTMLElement>('[data-mapview]').forEach((el) => {
    el.addEventListener('click', () => {
      const a = el.dataset.mapview;
      if (a === 'reset') resetMapView();
      else mapView = mapView === 'whole' ? 'follow' : 'whole';
      render();
    });
  });
  // Map-nav: zoom the follow-cam in/out (no-op in whole-hole mode).
  app.querySelectorAll<HTMLElement>('[data-mapzoom]').forEach((el) => {
    el.addEventListener('click', () => {
      if (mapView === 'whole') return;
      const factor = el.dataset.mapzoom === 'in' ? 1.4 : 1 / 1.4;
      mapZoom = Math.min(4, Math.max(0.4, mapZoom * factor));
      render();
    });
  });
  // Tap/drag the map to aim (free-aim mode) or pan it (default). Pointer-move/up listen on window
  // so the drag survives the per-frame re-render (which replaces the map element).
  wireMapAiming(app);
  // Opt-in swing gesture: pull back on the pad and release to swing. The pull builds a power/
  // backswing meter (feel only — the shot is exactly the one club+aim define, so the sim is
  // untouched). A short pull cancels; a committed pull fires the same action the Hit button would.
  app.querySelectorAll<HTMLElement>('[data-swing]').forEach((el) => wireSwingPad(el));
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
  // PWA install nudge: fire the captured prompt, then forget it (one offer).
  app.querySelectorAll<HTMLElement>('[data-install]').forEach((el) => {
    el.addEventListener('click', () => {
      try {
        deferredInstall?.prompt?.();
      } catch {
        /* ignore */
      }
      deferredInstall = null;
      try {
        localStorage.setItem('gs_installNudge', 'dismissed');
      } catch {
        /* ignore */
      }
      render();
    });
  });
  // Settings sheet: open/close + toggle a preference (all view-only, persisted in localStorage).
  app.querySelectorAll<HTMLElement>('[data-open-settings]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      settingsOpen = true;
      render();
    });
  });
  app.querySelectorAll<HTMLElement>('[data-settings]').forEach((el) => {
    el.addEventListener('click', (e) => {
      const a = el.dataset.settings;
      if (a === 'keep') return; // clicks inside the sheet body don't close it
      e.stopPropagation();
      settingsOpen = false;
      render();
    });
  });
  app.querySelectorAll<HTMLElement>('[data-setting]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSetting(el.dataset.setting as keyof Settings);
      resumeAudio();
      sfx.click();
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
  // The "⛳ Putt" button commits the pace meter at the marker's current position (same as tapping it).
  app.querySelectorAll<HTMLElement>('[data-putt-commit]').forEach((el) => {
    el.addEventListener('click', () => puttMeter?.commit());
  });

  // Mount the manual-putt pace meter when the ball is on the green awaiting a manual putt.
  if (state.screen === 'playing' && state.play && !animatingPlay && awaitingPutt(state.play) && !state.play.done) {
    const meterEl = document.getElementById('puttmeter');
    if (meterEl) {
      const band = puttSkillOf(state.run.loadout).manualBand ?? DEFAULT_MANUAL_BAND;
      // Fit the meter to its container so it never overflows a narrow phone (it mounts at a
      // fixed px width); clamp so it stays usable on tiny and tablet-wide screens alike.
      const meterW = Math.max(240, Math.min(420, meterEl.clientWidth || 300));
      puttMeter = mountPuttMeter(meterEl, {
        width: meterW,
        band,
        caddyId: caddyId(),
        lefty: lefty(),
        onCommit: (pace) => dispatch({ type: 'putt', control: { pace } }),
      });
    }
  }

  // Mount the animated play view on the result screen.
  if (state.screen === 'result' && state.played) {
    const playEl = document.getElementById('play');
    const holePlay = state.played[state.viewHole];
    const hole = state.course.holes[state.viewHole];
    if (playEl && holePlay && hole) {
      view = mountPlayView(playEl, hole, holePlay.shots, holePlay.putts, {
        width: 340,
        height: 520,
        biome: holeBiome(hole), themeId: holeThemeId(hole),
        golferLook: golferLook(),
        caddyId: caddyId(),
        lefty: lefty(),
        onImpact: (kind, quality) => (kind === 'shot' ? sfx.swing(quality ?? 0.6) : sfx.putt()),
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
      // Size the canvas to fill the viewport (it can't aspect-scale via CSS like the SVG map can);
      // the watch screen has no bottom controls, so it can take most of the height. Keep the
      // portrait map aspect so the follow-cam framing matches the decision screen.
      const animH = Math.round((window.innerHeight || 800) * 0.72);
      const animW = Math.round(animH * (DMAP_W / DMAP_H));
      view = mountPlayView(playEl, play.hole, animatingPlay.shots, animatingPlay.putts, {
        width: animW,
        height: animH,
        biome: holeBiome(play.hole), themeId: holeThemeId(play.hole),
        golferLook: golferLook(),
        caddyId: caddyId(),
        lefty: lefty(),
        focus,
        viewRadius: animatingPlay.shots.length ? decisionReach(travel) : 25,
        focusBias: DMAP_BIAS,
        follow: true,
        onImpact: (kind, quality) => {
          // Contact cue — fires at the strike moment (the windup has already played).
          if (kind === 'shot') {
            sfx.swing(quality ?? 0.6);
            haptic((quality ?? 0) > 0.85 ? HAPTICS.good : HAPTICS.tap);
          } else {
            sfx.putt();
          }
        },
        onDone: () => {
          animatedShots = play.shots.length;
          animatedPutts = play.puttLogs.length;
          // Terminal cue: ball in the cup vs found a hazard, as the ball settles.
          const lastShot = play.shots[play.shots.length - 1];
          if (play.holed) {
            sfx.holeOut();
            haptic(HAPTICS.holeOut);
          } else if (lastShot?.penalty) {
            sfx.penalty();
            haptic(HAPTICS.bad);
          }
          // Hold a beat after the ball settles so the finish reads as finished before the next screen
          // — chipping/putting used to cut to the follow-up instantly. Three cases:
          //  • non-terminal full shot → pop the rich shot-result card (auto-advances if Fast Shots is on);
          //  • terminal (holed/picked up/auto putt-out done) → a longer hold, then the done screen;
          //  • non-terminal putt(s) only (manual lag) → a brief hold, then back to the putt meter.
          const feelMs = (window as unknown as { _gsFeel?: Record<string, number> })._gsFeel ?? {};
          if (play.done) {
            const hold = feelMs.resultHoldMs ?? 700;
            popupTimer = window.setTimeout(() => {
              popupTimer = 0;
              render();
            }, hold);
          } else if (hadShots) {
            const delay = feelMs.popupDelayMs ?? 320;
            // Fast Shots: skip the tap-to-continue and roll straight on after a short beat — the
            // new lie + its effect are highlighted on the next decision bar, so you stay informed
            // without the per-shot tap. Default off (the result card waits for a tap/dismiss).
            if (getSettings().fastShots) {
              popupTimer = window.setTimeout(() => {
                popupTimer = 0;
                render();
              }, (feelMs.fastAdvanceMs ?? 620));
            } else {
              popupTimer = window.setTimeout(() => {
                popupTimer = 0;
                awaitingShotPopup = true;
                render();
              }, delay);
            }
          } else {
            const hold = feelMs.puttHoldMs ?? 450;
            popupTimer = window.setTimeout(() => {
              popupTimer = 0;
              render();
            }, hold);
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
  // Capture the install prompt so the title can offer an "Install app" button (instead of the
  // browser's own mini-infobar). Re-render so the button appears once it's available.
  try {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstall = e as Event & { prompt?: () => void };
      if (state?.screen === 'title') render();
    });
  } catch {
    /* ignore — install nudge is a bonus */
  }
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
