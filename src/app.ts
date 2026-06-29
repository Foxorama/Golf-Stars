/**
 * App entry — the interactive shell over the pure run reducer (`ui/game.ts`).
 *
 * Renders the current screen, wires button clicks to reducer actions, and persists the
 * save after each action. All game logic lives in the pure sim/reducer; this file is just
 * DOM + the canvas play view + localStorage glue.
 */

import { scoreName, playTotals, stablefordPoints } from './sim/score';
import { mountPlayView, type PlayViewHandle } from './render/playView';
import { itemCardHTML, shotCardHTML } from './render/cards';
import { renderHoleSVG } from './render/holeView';
import { type ProjectOptions } from './render/project';
import { shotView, previewShot, awaitingPutt } from './sim/rpg/play';
import { mountPuttMeter, type PuttMeterHandle } from './render/puttMeter';
import { drawCaddy, hasCaddyArt, caddyProjectile, CADDY_LABEL } from './render/caddyArt';
import { starmapSVG, type StarmapChoice } from './render/starmap';
import type { EventCategory } from './sim/rpg/events';
import { biomeCarryMult, pinOf, greenDepth, forcedCarry, DEFAULT_MANUAL_BAND } from './sim/round';
import { puttSkillOf } from './sim/rpg/economy';
import { lieInfo, roughLieOf } from './sim/shot';
import { archetypeFor, themeById, type BiomeArchetype } from './sim/course/themes';
import { zoneProfile, difficultyPips, shopPro, proMood, proLine, sectionEvents } from './sim/course/zones';
import { bearing, dist, type Hole } from './sim/course/contract';
import { type ShotSpread, type PlayedHole } from './sim/round';
import { type SprayGeomInput } from './render/holeView';
import { rarCol } from './sim/rpg/loot';
import { ACE_CREDIT_BONUS, clubOfferNote, isPuttingCaddy, itemCap, itemCost, maxPowerOf, namedCaddyOwned, ownedCount, shopItem, usableBag } from './sim/rpg/economy';
import { FORMATS } from './sim/rpg/formats';
import { CHARACTERS, getCharacter, scramblePartner as scramblePartnerChar, type Character, type GolferStyle, type GolferStats } from './sim/rpg/characters';
import { ASCENSION_MAX, ascensionCutBonus, cashOutShards, currentBoss, effectiveCut, snapshotRun } from './sim/rpg/run';
import { leaderboard, liveLeaderboard, runField, matchOpponentFor, livePosition, type Leaderboard } from './sim/rpg/league';
import { holeResult } from './sim/rpg/play';
import { PLAYER_ID, arcSurvivorTarget, type Field } from './sim/rpg/competition';
import { getGolfer, getArchetype } from './sim/rpg/golfers';
import { isMatchplayBoss } from './sim/rpg/formats';
import { matchScoreline, matchState, holeDuel } from './sim/rpg/match';
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
      lifetimeAces: save.lifetimeAces,
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
    writeSave({ version: 5, bestStableford: 0, bestDistance: 0, shards: 0, metaUpgrades: {}, maxAscension: 0, lifetimeAces: 0 });
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
    version: 5,
    bestStableford: state.bestStableford,
    bestDistance: state.bestDistance,
    shards: state.shards,
    metaUpgrades: state.metaUpgrades,
    maxAscension: state.maxAscension,
    lifetimeAces: state.lifetimeAces,
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
  ace: [18, 40, 18, 40, 18, 40, 30] as number[], // the biggest beat — a long celebratory roll
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
      ${state.lifetimeAces > 0 ? `<span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);" title="lifetime holes-in-one">⛳ <b>${state.lifetimeAces}</b> Ace${state.lifetimeAces === 1 ? '' : 's'}</span>` : ''}
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
 *  club) the on-course figure uses, so the card reads as "this is who you'll see swinging". A soft
 *  character-coloured aura disc sits behind the figure so the portrait pops on the dark card. */
function golferSVG(style: GolferStyle, w = 104, h = 132): string {
  const s = style.build;
  return `
    <svg viewBox="0 0 78 104" width="${w}" height="${h}" aria-hidden="true" style="display:block;overflow:visible;">
      <defs>
        <radialGradient id="ga-${style.cap.slice(1)}" cx="50%" cy="42%" r="58%">
          <stop offset="0%" stop-color="${style.cap}" stop-opacity="0.55"/>
          <stop offset="55%" stop-color="${style.cap}" stop-opacity="0.16"/>
          <stop offset="100%" stop-color="${style.cap}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="39" cy="44" rx="42" ry="46" fill="url(#ga-${style.cap.slice(1)})"/>
      <ellipse cx="39" cy="99" rx="${20 * s}" ry="4" fill="rgba(0,0,0,0.32)"/>
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

/** Per-archetype colour kit for the Pro Shop staff portrait (cap / shirt / aura / skin). */
const PRO_LOOK: Record<BiomeArchetype, { cap: string; shirt: string; aura: string; skin: string }> = {
  verdant: { cap: '#3fae5a', shirt: '#2e8b57', aura: '#5fd45a', skin: '#e7b894' },
  desert: { cap: '#d9a441', shirt: '#c2702e', aura: '#e8c06a', skin: '#d8a06a' },
  frost: { cap: '#7fd0e8', shirt: '#4a90c2', aura: '#bfe9f5', skin: '#e8c4a8' },
  inferno: { cap: '#e0622b', shirt: '#9b2d1f', aura: '#ff8a3b', skin: '#cf8f63' },
  void: { cap: '#9b6fd0', shirt: '#5b3da0', aura: '#b88aff', skin: '#cdb8e0' },
};

/** A compact inline-SVG bust of a world's club pro — assetless house style, tinted per archetype. */
function proAvatarSVG(archetype: BiomeArchetype, w = 72, h = 84): string {
  const c = PRO_LOOK[archetype];
  const id = archetype;
  return `
    <svg viewBox="0 0 72 84" width="${w}" height="${h}" aria-hidden="true" style="display:block;overflow:visible;">
      <defs>
        <radialGradient id="pa-${id}" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="${c.aura}" stop-opacity="0.5"/>
          <stop offset="60%" stop-color="${c.aura}" stop-opacity="0.14"/>
          <stop offset="100%" stop-color="${c.aura}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="36" cy="40" rx="34" ry="38" fill="url(#pa-${id})"/>
      <g stroke-linecap="round" stroke-linejoin="round">
        <!-- shoulders / polo -->
        <path d="M14 84 Q36 56 58 84 Z" fill="${c.shirt}"/>
        <path d="M33 60 L36 70 L39 60" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.6"/>
        <!-- collar -->
        <path d="M30 58 L36 64 L42 58" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2"/>
        <!-- neck -->
        <rect x="32" y="50" width="8" height="10" rx="3" fill="${c.skin}"/>
        <!-- head -->
        <circle cx="36" cy="40" r="13" fill="${c.skin}"/>
        <!-- shades -->
        <rect x="26" y="37" width="9" height="5" rx="2.2" fill="#1b1f2a"/>
        <rect x="37" y="37" width="9" height="5" rx="2.2" fill="#1b1f2a"/>
        <line x1="35" y1="39" x2="37" y2="39" stroke="#1b1f2a" stroke-width="1.4"/>
        <!-- smile -->
        <path d="M31 46 Q36 50 41 46" fill="none" stroke="#7a4a2a" stroke-width="1.6"/>
        <!-- cap -->
        <path d="M22 35 A14 14 0 0 1 50 35 Z" fill="${c.cap}"/>
        <path d="M22 35 Q14 36 12 39 L24 38 Z" fill="${c.cap}"/>
        <rect x="33" y="22" width="6" height="4" rx="2" fill="${c.cap}"/>
      </g>
    </svg>`;
}

/** The Pro Shop greeting block: the world's club pro + a pithy line on how the last section went. */
function proGreetingHTML(): string {
  const last = state.lastResult;
  if (!last) return '';
  const archetype = archetypeFor(last.themeId, last.biome);
  const pro = shopPro(archetype);
  const mood = proMood(last.stableford, last.cut);
  // React to the section's drama (an ace, a blow-up, a birdie blitz) over the generic grade.
  const events = sectionEvents(
    (state.played ?? []).map((p) => ({
      par: p.stat.par,
      strokes: p.stat.strokes,
      pickedUp: p.pickedUp,
      holed: p.holed,
    })),
  );
  const line = proLine(pro, mood, events, state.run.stopIndex);
  return `
    <div class="gs-panel" style="display:flex;gap:12px;align-items:center;margin:0 0 10px;">
      <div style="flex:0 0 auto;">${proAvatarSVG(archetype)}</div>
      <div style="flex:1 1 auto;min-width:0;">
        <div style="font-weight:600;font-size:14px;">${pro.name}</div>
        <div style="font-size:11px;opacity:.6;margin-bottom:6px;">${pro.title}</div>
        <div style="font-size:13px;font-style:italic;opacity:.92;">&ldquo;${line}&rdquo;</div>
      </div>
    </div>`;
}

/** A flashy 0–5 stat bar for the select card — `n` lit pips in the character colour over a dark rail,
 *  the fill width set as a CSS var so it can animate in on card reveal. */
function statBar(label: string, n: number, col: string): string {
  const pct = Math.max(0, Math.min(5, n)) / 5 * 100;
  return `
    <div class="gs-stat">
      <span class="gs-stat-l">${label}</span>
      <span class="gs-stat-rail"><span class="gs-stat-fill" style="--w:${pct}%;background:linear-gradient(90deg,${col},${col}cc);"></span></span>
    </div>`;
}

function characterScreen(): string {
  const statRows = (st: GolferStats, col: string): string =>
    statBar('PWR', st.power, col) + statBar('ACC', st.accuracy, col) + statBar('TCH', st.touch, col) + statBar('CON', st.consistency, col);

  const cards = CHARACTERS.map((ch, i) => {
    const cap = ch.style.cap;
    const pros = ch.pros.map((p) => `<li><span class="gs-pc-i" style="color:var(--gs-accent);">✓</span> <span style="color:var(--gs-ink);">${p}</span></li>`).join('');
    const cons = ch.cons.map((c) => `<li><span class="gs-pc-i" style="color:var(--gs-warn);">▲</span> <span style="color:var(--gs-dim);">${c}</span></li>`).join('');
    return `
      <button class="gs-charcard" data-action='${JSON.stringify({ type: 'selectCharacter', characterId: ch.id })}'
        style="--cc:${cap};animation-delay:${i * 70}ms;">
        <span class="gs-charcard-sheen" aria-hidden="true"></span>
        <div class="gs-charcard-top">
          <div class="gs-charcard-port">${golferSVG(ch.style, 96, 104)}</div>
          <div class="gs-charcard-id">
            <b class="gs-charcard-name" style="color:${cap};">${ch.name}</b>
            <div class="gs-charcard-org">${ch.origin} · ${ch.identity}</div>
          </div>
        </div>
        <p class="gs-charcard-blurb">${ch.blurb}</p>
        <div class="gs-charcard-stats">${statRows(ch.stats, cap)}</div>
        <ul class="gs-charcard-pc">${pros}${cons}</ul>
        <span class="gs-charcard-cta" style="--cc:${cap};">Voyage as ${ch.shortName} <span aria-hidden="true">→</span></span>
      </button>`;
  }).join('');
  return `
    <header style="border-left:4px solid #5fd45a;padding-left:10px;">
      <h1 style="margin:0;font-size:24px;">Choose your golfer</h1>
      <p style="opacity:.75;font-size:13px;margin:.3em 0;">Four wildly different swings. Each trades a clear strength for a clear quirk — pick who you'll voyage the galaxy as.</p>
    </header>
    <div class="gs-charwrap">${cards}</div>`;
}

/**
 * The "arrival at a new world" screen — ONE consolidated card (GS-ui-intro). It used to stack two
 * big visuals (a generic per-archetype hero banner AND a separate course/loot card) plus a bottom
 * action section, so the player had to scroll past ~600px of art to reach Play. Now a single panel
 * leads with identity + the cut + the CTAs (reachable without scrolling), then reveals the ACTUAL
 * first hole (the loot) + lore/hazards below. The generic zoneHero art was dropped as redundant —
 * the real generated hole is the more exciting, more informative visual and carries the theme too.
 */
// --- Competition field & leaderboard (GS-100) --------------------------------

/** 1 → "1st", 2 → "2nd", … */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
}

/** A short style/home tag for a competitor (their constellation, rival flag, or archetype label). */
function golferTag(id: string): string {
  if (id === PLAYER_ID) return 'You';
  const g = getGolfer(id);
  if (!g) return '';
  if (g.home) {
    const t = themeById(g.home);
    if (t) return t.name;
  }
  if (g.mirrorsCharacter) return 'Rival pro';
  return getArchetype(g.archetypeId).label;
}

/** The arc's field of 20 — shown on the starting-zone intro at the head of each arc. */
function competitorsCard(field: Field): string {
  const cells = field.golfers
    .map((g) => {
      const champ = g.tier === 'champion';
      const me = g.isPlayer;
      const border = me ? 'var(--gs-accent)' : champ ? '#ffce54' : 'var(--gs-line-2)';
      const tag = golferTag(g.id);
      return `<div style="flex:0 0 auto;width:78px;text-align:center;padding:6px 4px;border:1px solid ${border};border-radius:9px;background:${me ? '#1a2a22' : '#ffffff06'};">
        <div style="line-height:0;">${golferSVG(g.look, 38, 46)}</div>
        <div style="font-size:11px;font-weight:700;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${me ? 'You' : g.shortName}</div>
        <div style="font-size:9px;opacity:.62;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${champ ? '★ ' : ''}${tag}</div>
      </div>`;
    })
    .join('');
  return `
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--gs-line-2);">
      <div style="font-size:13px;font-weight:700;letter-spacing:.04em;">🏆 The field — ${field.golfers.length} golfers in this arc</div>
      <div style="font-size:11.5px;opacity:.65;margin:3px 0 9px;">Climb the leaderboard each stop; the boss round is a matchplay knockout that pairs the field best-vs-worst (#1 v last) — finish high and you draw a weaker opponent. Constellation champions (★) are dangerous in their home zone.</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${cells}</div>
    </div>`;
}

/** The leaderboard table for the result screen — cumulative arc total, this-stop score, cut line.
 *  `opts.live` renders the mid-stop board (used on the end-of-hole screen): the title reads THRU N and
 *  the per-stop cut divider is suppressed (a partial stop hasn't been scored against the cut yet). */
function leaderboardHTML(board: Leaderboard, opts: { live?: boolean } = {}): string {
  // Positional cut (GS-positional-cut): survival is your PLACE — the divider reads "top N advance" and is
  // drawn even live (the eliminations above it are real, frozen from prior stops). A Stableford board
  // (flat/ladder) reads "CUT · N pts" and is suppressed mid-stop (a partial stop isn't scored yet).
  const positional = board.mode === 'positional';
  const cutLabel = positional ? `top ${board.survivorTarget ?? board.cut} advance` : `CUT · ${board.cut} pts`;
  const showDivider = positional || !opts.live;
  let drewCut = false;
  const rows = board.standings
    .map((s) => {
      const me = s.isPlayer;
      // Draw the cut divider just before the first cut (eliminated) golfer.
      const divider =
        showDivider && !drewCut && s.cut
          ? ((drewCut = true),
            `<div style="display:flex;align-items:center;gap:8px;margin:3px 0;color:#ff6b6b;font-size:10.5px;letter-spacing:.1em;">
              <div style="flex:1;height:1px;background:#ff6b6b66;"></div>${cutLabel}<div style="flex:1;height:1px;background:#ff6b6b66;"></div></div>`)
          : '';
      const tag = golferTag(s.golferId);
      const stopTxt = s.stopScore !== undefined ? `<span style="opacity:.7;">+${s.stopScore}</span>` : '';
      const row = `<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:7px;${
        me ? 'background:#1a2a22;border:1px solid var(--gs-accent);' : 'border:1px solid transparent;'
      }${s.cut ? 'opacity:.5;' : ''}">
        <span style="width:20px;text-align:right;font-size:12px;opacity:.7;">${s.position}</span>
        <span style="width:9px;height:9px;border-radius:50%;background:${s.look.cap};flex:0 0 auto;"></span>
        <span style="flex:1 1 auto;min-width:0;font-size:12.5px;font-weight:${me ? 800 : 600};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${me ? 'You' : s.name}${s.tier === 'champion' ? ' <span style="color:#ffce54;">★</span>' : ''}
          <span style="font-size:10px;opacity:.5;"> · ${tag}</span>
        </span>
        <span style="font-size:11px;width:34px;text-align:right;">${stopTxt}</span>
        <span style="font-size:13px;font-weight:800;width:30px;text-align:right;">${s.total}</span>
      </div>`;
      return divider + row;
    })
    .join('');
  return `
    <div style="border:1px solid var(--gs-line);border-radius:10px;padding:8px;background:#0d1016;">
      <div style="display:flex;justify-content:space-between;font-size:10.5px;opacity:.55;letter-spacing:.08em;padding:0 8px 4px;">
        <span>ARC LEADERBOARD${board.thru ? ` · THRU ${board.thru}` : ''}</span><span>STOP · TOTAL</span>
      </div>
      ${rows}
    </div>`;
}

/** A compact LIVE arc-leaderboard chip for the play HUD — updates the moment a hole is finished. */
function liveLeaderChip(): string {
  if (state.match) return ''; // a matchplay stop shows its duel HUD instead
  const played = state.stopPlayed ?? [];
  const sf = playTotals(played.map((p) => p.record)).stableford;
  const lp = livePosition(state.run, played.length, sf);
  const col = lp.position <= 3 ? '#5fd45a' : lp.position <= lp.of / 2 ? '#ffce54' : '#ff6b6b';
  const gap = lp.gapToLead > 0 ? ` · ${lp.gapToLead} back` : ' · leading';
  return `<span title="Live arc leaderboard">🏆 <b style="color:${col};">${ordinal(lp.position)}</b>/${lp.of}${gap}</span>`;
}

/** The matchplay opponent id for the current boss stop (the leaderboard leader, with a fallback). */
function currentOpponentId(): string | undefined {
  if (state.match) return state.match.bossId;
  return matchOpponentFor(state.run) ?? runField(state.run).golfers.find((g) => !g.isPlayer)?.id;
}

/** A framed opponent badge (avatar + name + style) for a matchplay duel. */
function opponentBadge(id: string, sub: string): string {
  const g = getGolfer(id);
  if (!g) return '';
  const tag = g.home ? themeById(g.home)?.name ?? '' : getArchetype(g.archetypeId).label;
  return `<div style="display:flex;align-items:center;gap:10px;">
      <div style="line-height:0;border:2px solid #ffce54;border-radius:10px;background:#1a0e12;padding:2px;">${golferSVG(g.look, 44, 54)}</div>
      <div><div style="font-size:15px;font-weight:800;">${g.name}</div>
        <div style="font-size:11px;opacity:.7;">${g.tier === 'champion' ? '★ ' : ''}${tag}${sub ? ` · ${sub}` : ''}</div></div>
    </div>`;
}

/** The live matchplay HUD shown on the play screen — scoreline vs the opponent. */
function matchHud(): string {
  const m = state.match;
  if (!m) return '';
  const st = matchState(m.duels, state.course.holes.length);
  const opp = getGolfer(m.bossId);
  const line =
    st.thru === 0
      ? 'Tee it up'
      : st.holesUp > 0
      ? `You ${matchScoreline(st)}`
      : st.holesUp < 0
      ? `${opp?.shortName ?? 'Boss'} ${Math.abs(st.holesUp)} UP`
      : 'All square';
  const col = st.holesUp > 0 ? '#5fd45a' : st.holesUp < 0 ? '#ff6b6b' : '#ffce54';
  // The boss is pre-played, so on the current hole you know their target — show "they made N here" so
  // you can attack or protect accordingly (real matchplay: you can see the other ball).
  const play = state.play;
  let target = '';
  if (play && !play.done) {
    const bh = m.bossHoles[play.holeIndex];
    if (bh) {
      const rel = bh.record.strokes - play.hole.par;
      const relTxt = rel === 0 ? 'par' : rel > 0 ? `+${rel}` : `${rel}`;
      target = `<span style="font-size:10.5px;opacity:.85;">· ${opp?.shortName ?? 'Boss'} made <b>${bh.record.strokes}</b> (${relTxt})</span>`;
    }
  }
  return `<div style="display:flex;align-items:center;gap:8px;padding:4px 9px;border:1px solid ${col};border-radius:8px;background:#0d1016cc;flex-wrap:wrap;">
      <span style="font-size:11px;opacity:.7;">⚔ vs ${opp?.shortName ?? 'Boss'}</span>
      <span style="font-size:13px;font-weight:800;color:${col};">${line}</span>
      <span style="font-size:10.5px;opacity:.6;">thru ${st.thru}/${state.course.holes.length}</span>
      ${target}
    </div>`;
}

/** The matchplay duel result panel for the result screen (the hole-by-hole scoreline + verdict). */
function matchResultPanel(): string {
  const m = state.match;
  if (!m) return '';
  const st = matchState(m.duels, state.course.holes.length);
  const opp = getGolfer(m.bossId);
  const won = st.playerWon;
  const halved = st.halved;
  const verdict = won ? 'YOU WIN' : halved ? 'HALVED' : 'DEFEATED';
  const col = won ? '#5fd45a' : halved ? '#ffce54' : '#ff6b6b';
  const cells = m.duels
    .map((d) => {
      const c = d.winner === 'player' ? '#5fd45a' : d.winner === 'boss' ? '#ff6b6b' : '#6b7280';
      return `<span title="Hole ${d.holeIndex + 1}: you ${d.playerStrokes} v ${d.bossStrokes}" style="width:16px;height:16px;border-radius:3px;background:${c}33;border:1px solid ${c};font-size:9px;display:inline-flex;align-items:center;justify-content:center;color:${c};">${
        d.winner === 'player' ? 'W' : d.winner === 'boss' ? 'L' : '½'
      }</span>`;
    })
    .join('');
  return `<div style="border:1px solid ${col};border-radius:10px;padding:10px;background:linear-gradient(180deg,#160d12,#0d1016);margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        ${opponentBadge(m.bossId, 'Matchplay')}
        <div style="text-align:right;"><div style="font-size:18px;font-weight:900;color:${col};">${verdict}</div>
          <div style="font-size:13px;opacity:.85;">${matchScoreline(st)}</div></div>
      </div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:9px;">${cells}</div>
      <div style="font-size:11px;opacity:.6;margin-top:6px;">Hole-by-hole vs ${opp?.name ?? 'the leader'} — W win · L loss · ½ halved.</div>
    </div>`;
}

/** Live matchplay progress for the end-of-hole screen: the running scoreline + W/L/½ pips vs the boss,
 *  built from the holes finished so far against the boss's pre-played ball. */
function holeMatchProgressHTML(playedSoFar: PlayedHole[]): string {
  const m = state.match;
  if (!m) return '';
  const duels = playedSoFar.map((p, i) => holeDuel(i, state.course.holes[i]!.par, p, m.bossHoles[i]!));
  const st = matchState(duels, state.course.holes.length);
  const opp = getGolfer(m.bossId);
  const line =
    st.holesUp > 0 ? `You ${matchScoreline(st)}` : st.holesUp < 0 ? `${opp?.shortName ?? 'Boss'} ${Math.abs(st.holesUp)} UP` : 'All square';
  const col = st.holesUp > 0 ? '#5fd45a' : st.holesUp < 0 ? '#ff6b6b' : '#ffce54';
  const last = duels[duels.length - 1];
  const lastLine = last
    ? `<div style="font-size:11.5px;opacity:.8;margin-top:6px;">This hole: you <b>${last.playerStrokes}</b> v <b>${last.bossStrokes}</b> ${opp?.shortName ?? 'Boss'} — ${last.winner === 'player' ? '<span style="color:#5fd45a;">won</span>' : last.winner === 'boss' ? '<span style="color:#ff6b6b;">lost</span>' : 'halved'}</div>`
    : '';
  const cells = duels
    .map((d) => {
      const c = d.winner === 'player' ? '#5fd45a' : d.winner === 'boss' ? '#ff6b6b' : '#6b7280';
      return `<span title="Hole ${d.holeIndex + 1}: you ${d.playerStrokes} v ${d.bossStrokes}" style="width:18px;height:18px;border-radius:3px;background:${c}33;border:1px solid ${c};font-size:10px;display:inline-flex;align-items:center;justify-content:center;color:${c};">${
        d.winner === 'player' ? 'W' : d.winner === 'boss' ? 'L' : '½'
      }</span>`;
    })
    .join('');
  return `<div style="border:1px solid ${col};border-radius:10px;padding:10px;background:linear-gradient(180deg,#160d12,#0d1016);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        ${opponentBadge(m.bossId, 'Matchplay')}
        <div style="text-align:right;"><div style="font-size:17px;font-weight:900;color:${col};">${line}</div>
          <div style="font-size:11px;opacity:.7;">thru ${st.thru}/${state.course.holes.length}</div></div>
      </div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:9px;">${cells}</div>
      ${lastLine}
    </div>`;
}

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
         ${boss.final ? '★ FINAL BOSS' : '⚔ BOSS STOP'}${boss.partner ? ' · SCRAMBLE' : ''}${isMatchplayBoss(boss) ? ' · MATCHPLAY' : ''}</div>
       <b style="font-size:16px;">${boss.name}</b>
       <div style="font-size:12.5px;opacity:.85;margin-top:2px;">${boss.blurb}</div>
       ${partner ? `<div style="font-size:12px;margin-top:5px;color:${partner.style.cap};">🤝 Partner: <b>${partner.name}</b> — two balls a shot, the better one counts.</div>` : ''}
       ${
         isMatchplayBoss(boss) && currentOpponentId()
           ? `<div style="margin-top:8px;">${opponentBadge(currentOpponentId()!, 'Your opponent — beat them hole by hole')}</div>`
           : ''
       }
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
        <p style="font-size:14px;margin:0 0 10px;">${(() => {
          const winnable = !!(FORMATS[state.run.formatId] ?? FORMATS['flat']!).winnable;
          if (boss && isMatchplayBoss(boss)) return '⚔ Win the <b>matchplay knockout</b> to advance — the field pairs best-vs-worst, so your finish so far set your opponent.';
          if (boss) return `🎯 <b>${cut} pts</b> over ${c.holes.length} holes to beat the boss.`;
          if (winnable) {
            const target = arcSurvivorTarget(state.run.stopIndex, ascensionCutBonus(state.run.ascension));
            return `🏁 Finish in the <b>top ${target}</b> of the field over ${c.holes.length} holes to advance.`;
          }
          return `🎯 <b>${cut} pts</b> over ${c.holes.length} holes to make the cut and travel on.`;
        })()}${
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
      ${(() => {
        const board = leaderboard(state.run);
        return board.hasScores ? leaderboardHTML(board) : competitorsCard(runField(state.run));
      })()}
    </article>`;
}

// --- interactive playing screen ----------------------------------------------
let animatedShots = 0; // shots of the current hole already animated
let animHoleIndex = -1;
let animatedPutts = 0; // putts of the current hole already animated
let selClubId: string | null = null;
let selAim: 'attack' | 'safe' = 'attack';
let decisionShotCount = -1; // shots taken when the current club selection was defaulted
// Free-aim target (course-space) from the pull-to-power gesture; overrides attack/safe when set.
let selFreeTarget: [number, number] | null = null;
// Pull-to-power gesture (GS-power): the player presses the map and drags DOWN to charge power
// (1=full swing, dialable down to a soft tap and — with Overdrive — past 100%), sliding sideways to
// aim, then releases to fire. `selPower` is the live charge (1 at rest so the cone previews a full
// swing); `selAimBearing` is the aim line (deg), seeded to the pin each shot and nudged by the drag.
let selPower = 1;
let selAimBearing: number | null = null;
let charging = false; // true while a pull gesture is loading (suppresses the result-popup wiring race)
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

/** A free-aim target along an aim BEARING (deg, cw from up) at the club's powered reach. Only the
 *  BEARING feeds the shot physics now (power sets the carry), so the distance just places the on-screen
 *  target/cone sensibly. Pure. */
function targetFromBearing(
  play: NonNullable<UiState['play']>,
  clubCarry: number,
  bearingDeg: number,
  powerFrac: number,
): [number, number] {
  const R = Math.max(8, clubCarry * biomeCarryMult(play.hole) * powerFrac);
  const rad = (bearingDeg * Math.PI) / 180;
  return [play.ball[0] + Math.sin(rad) * R, play.ball[1] + Math.cos(rad) * R];
}

/** The selected club's nominal carry (for the aim-target reach), resolved from the lie-legal bag. */
function selectedClubCarry(play: NonNullable<UiState['play']>): number {
  const bag = usableBag(state.run.loadout.bag, play.lie, state.run.loadout.driverAnywhere ?? false);
  const c = bag.find((cl) => cl.id === selClubId) ?? bag[0]!;
  return c.carry;
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
 * Wire the unified PULL-TO-POWER shot gesture on the decision map (GS-power). One smooth action that
 * replaces the old aim-then-pull-the-button flow: press anywhere on the map, drag DOWN to charge
 * POWER (the spray cone grows from a soft tap toward the full-swing cone — `selPower`), slide
 * sideways to AIM (nudges the aim bearing — `selAimBearing`), then release to FIRE. Releasing with
 * power back near zero — a plain tap, or a charge pulled back up — CANCELS without a shot, so a stray
 * touch never fires. Two fingers PINCH-zoom the map (kept). Pointer-move/up listen on `window` so the
 * gesture survives the per-frame re-render that replaces the map element.
 *
 * Only the BEARING + power feed the sim; distance comes from club×power, so no projector/unproject is
 * needed (the old free-aim tap-the-point model is gone — you aim by sliding while you charge).
 */
function wireShotGesture(app: HTMLElement): void {
  if (state.screen !== 'playing' || !state.play || awaitingShotPopup) return;
  if (state.play.done || awaitingPutt(state.play)) return; // only the full-shot decision screen
  const svg = app.querySelector<SVGSVGElement>('[data-map] svg');
  if (!svg) return;
  const play = state.play;
  const maxPower = maxPowerOf(state.run.loadout);
  const PULL_RANGE = 150; // px of downward drag for 100% power
  const AIM_SENS = 0.34; // degrees of aim nudge per px of horizontal drag
  const COMMIT = 0.06; // release below this power = cancel (a tap, or pulled back to zero)
  const pointers = new Map<number, { x: number; y: number }>();
  let startX = 0;
  let startY = 0;
  let startBearing = 0;
  let active = false; // a single-finger charge is loading
  let pinch: { startDist: number; startZoom: number } | null = null;
  let lastNotch = 0;

  const twoFingerDist = (): number => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  // Apply a drag (client coords) → live power + aim bearing, and re-render so the cone + HUD track.
  const applyDrag = (x: number, y: number): void => {
    selPower = Math.max(0, Math.min(maxPower, (y - startY) / PULL_RANGE));
    selAimBearing = startBearing + (x - startX) * AIM_SENS;
    selFreeTarget = targetFromBearing(play, selectedClubCarry(play), selAimBearing, Math.max(selPower, 0.12));
    charging = true;
    // A ratcheting haptic as the power loads (every 20%).
    const notch = Math.floor(selPower * 5);
    if (notch !== lastNotch) {
      lastNotch = notch;
      haptic(6);
    }
    scheduleRender();
  };
  const detach = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    document.removeEventListener('visibilitychange', onHide);
  };
  // Belt-and-braces for a screen-sleep that drops the pointer events entirely: if the tab goes
  // hidden mid-charge, abandon the gesture so we come back to a clean slate (some browsers don't
  // fire pointercancel on background). Attached only while a gesture is live, removed in detach.
  const onHide = (): void => {
    if (document.visibilityState === 'hidden') cancel();
  };
  // Abandon the gesture WITHOUT firing — used by pointercancel and tab-hide. The browser fires
  // pointercancel when the screen sleeps / the touch is interrupted mid-charge; routing that to
  // `up` (which fires when selPower ≥ COMMIT) shot the ball off on its own — the "accidental tiny
  // power shot" on reopen. A cancel always resets and restores the resting full-swing cone.
  function cancel(): void {
    pointers.clear();
    pinch = null;
    active = false;
    charging = false;
    selPower = 1;
    detach();
    scheduleRender();
  }
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
    if (active) applyDrag(e.clientX, e.clientY);
  };
  function up(e: PointerEvent): void {
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null; // dropped below two fingers → end the pinch
      if (pointers.size === 0) {
        active = false;
        charging = false;
        detach();
      }
      return;
    }
    if (pointers.size > 0) return; // still a finger down — wait
    const fire = active && selPower >= COMMIT;
    const target = selFreeTarget ?? undefined;
    const power = selPower;
    active = false;
    charging = false;
    selPower = 1; // reset the preview baseline (a full-swing cone) for the next decision
    detach();
    if (fire) {
      haptic(HAPTICS.swing);
      dispatch({ type: 'shot', clubId: selClubId!, aim: selAim, target, power });
    } else {
      scheduleRender(); // cancelled — restore the resting full-swing cone
    }
  }
  svg.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    // Clear any stale pointers left by a gesture whose up/cancel never arrived (e.g. the screen
    // slept mid-touch and the OS dropped the release). Without this, a leftover entry made the
    // first fresh tap read as a second finger → a spurious pinch, so "the first tap doesn't
    // register". A genuine multi-touch keeps its pointers because `active`/`pinch` is set.
    if (!active && !pinch) pointers.clear();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      startX = e.clientX;
      startY = e.clientY;
      // Seed the aim bearing from the current aim (the pin by default, or the last nudge).
      startBearing = selAimBearing ?? bearing(play.ball, pinOf(play.hole));
      active = true;
      lastNotch = 0;
      selPower = 0; // charge starts empty so a no-pull release reads as a cancel (no accidental shot)
      charging = true;
      resumeAudio();
      scheduleRender();
    } else if (pointers.size === 2) {
      pinch = { startDist: twoFingerDist(), startZoom: mapZoom };
      active = false; // a second finger cancels the charge → pinch-zoom instead
      selPower = 1;
      charging = false;
    }
    // Same fn refs each time → addEventListener de-dupes, so multiple pointers don't stack handlers.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    document.addEventListener('visibilitychange', onHide);
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
const DMAP_H = 640;
// Ball sits low-ish so most of the frame is the shot AHEAD, but high enough to clear the floating
// bottom control panel on the full-bleed screen (the ball reads above the HUD, not behind it).
const DMAP_BIAS = 0.72;
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
  if (mapView === 'whole') return base; // whole-hole fit — see the green + full layout (tee→green up)
  const reach = decisionReach(spray.carryHigh) / mapZoom;
  const focus: [number, number] = [play.ball[0] + mapPan[0], play.ball[1] + mapPan[1]];
  // Reorient so the PIN is up-screen — keeps the contemplated shot pointing UP even when the ball
  // is long of the green (so the pull-to-aim gesture never feels backwards). Degenerate near the
  // hole falls back to tee→green inside the projector.
  const pin = pinOf(play.hole);
  const up: [number, number] = [pin[0] - play.ball[0], pin[1] - play.ball[1]];
  return { ...base, focus, viewRadius: reach, focusBias: DMAP_BIAS, up };
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

// The hole index whose ace has already been celebrated, so the full-screen overlay fires exactly
// once per hole-in-one (the play-view onDone can re-fire on a re-render). Reset per hole in render().
let aceCelebratedHole = -1;

/**
 * The hole-in-one celebration (GS-ace) — a full-screen takeover for the rarest, biggest moment in the
 * game. A cosmetic, assetless side-effect (like the loading intro + the play-view canvas): it mounts a
 * fixed overlay with a Canvas2D fireworks/confetti show, a huge "HOLE IN ONE!" headline, the reward it
 * earned, and a Continue button — then tears itself down and runs `onDismiss` (→ the normal end-of-hole
 * screen). Degrades safely: reduced-motion skips the rAF loop (a static burst), and the whole thing is
 * guarded so a cosmetic glitch can never strand the player on the hole.
 */
function showAceCelebration(
  info: { holeNo: number; total: number; par: number; club?: string; aceNo: number },
  onDismiss: () => void,
): void {
  try {
    sfx.ace();
    haptic(HAPTICS.ace);
  } catch {
    /* feel-only — never throw */
  }
  const reduced = getSettings().reducedMotion;
  const overlay = document.createElement('div');
  overlay.className = 'gs-ace';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Hole in one');

  let done = false;
  const cleanup = (): void => {
    if (done) return;
    done = true;
    const h = (canvas as unknown as { _raf?: number } | null)?._raf;
    if (h) cancelAnimationFrame(h);
    overlay.removeEventListener('click', onTap);
    window.removeEventListener('keydown', onKey);
    overlay.remove(); // detaches the canvas → the fireworks loop self-stops on the next frame
    try {
      onDismiss();
    } catch {
      /* the caller's render() guards itself */
    }
  };
  const onTap = (e: MouseEvent): void => {
    // Any tap on the backdrop (but not a drag-select) dismisses — the button does too.
    e.preventDefault();
    cleanup();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') cleanup();
  };

  const rewardLine = (icon: string, label: string, detail: string): string =>
    `<div class="gs-ace-reward"><span>${icon}</span><div><b>${label}</b><i>${detail}</i></div></div>`;
  const rewardLines = [
    rewardLine('💰', `+${ACE_CREDIT_BONUS} credits`, 'spend them at the next Pro Shop'),
    rewardLine('🎯', "Ace's Touch", '+8% precision for the rest of the run · stacks'),
    rewardLine('⛳', `Lifetime ace #${info.aceNo}`, 'a permanent record'),
  ].join('');

  overlay.innerHTML = `
    <canvas class="gs-ace-fx" aria-hidden="true"></canvas>
    <div class="gs-ace-card">
      <div class="gs-ace-emoji" aria-hidden="true">⛳</div>
      <div class="gs-ace-kicker">HOLE ${info.holeNo} · PAR ${info.par}</div>
      <h1 class="gs-ace-title">HOLE IN ONE!</h1>
      <div class="gs-ace-sub">Aced it${info.club ? ` with the ${info.club}` : ''} 🎉</div>
      <div class="gs-ace-rewards">${rewardLines}</div>
      <button class="gs-btn gs-btn--primary gs-ace-go" data-ace-continue="1">Continue →</button>
    </div>`;
  document.body.appendChild(overlay);

  // The Continue button (and any backdrop tap / key) dismisses.
  const goBtn = overlay.querySelector<HTMLButtonElement>('.gs-ace-go');
  goBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    cleanup();
  });
  overlay.addEventListener('click', onTap);
  window.addEventListener('keydown', onKey);

  // Fireworks + confetti on the canvas (skipped under reduced-motion — the card alone carries it).
  const canvas = overlay.querySelector<HTMLCanvasElement>('.gs-ace-fx');
  if (canvas && !reduced) {
    try {
      runAceFireworks(canvas, info.holeNo);
    } catch {
      /* a canvas fault must not strand the celebration */
    }
  }

  // A long auto-dismiss safety net so the player is never stuck if they look away (well past the show).
  window.setTimeout(() => cleanup(), reduced ? 4200 : 9000);
}

/** Deterministic, assetless fireworks + confetti for the ace overlay. Seeded so it's stable across
 *  reloads (no Math.random); particles are capped and the loop self-cancels on overlay teardown. */
function runAceFireworks(canvas: HTMLCanvasElement, seed: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const resize = (): void => {
    canvas.width = Math.round((window.innerWidth || 400) * dpr);
    canvas.height = Math.round((window.innerHeight || 800) * dpr);
  };
  resize();
  // mulberry32 — the house seeded rng (Math.random is banned for reproducible feel).
  let s = (seed * 0x9e3779b1 + 0x6d2b79f5) >>> 0;
  const rnd = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const W = (): number => canvas.width;
  const H = (): number => canvas.height;
  const COLS = ['#ffd54a', '#5fd45a', '#4fd0e0', '#ff6bd0', '#ff8a3c', '#ffffff'];
  type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; r: number; conf: boolean };
  const parts: P[] = [];
  const burstAt = (x: number, y: number): void => {
    const col = COLS[Math.floor(rnd() * COLS.length)]!;
    const n = 26 + Math.floor(rnd() * 16);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.3;
      const sp = (1.6 + rnd() * 2.6) * dpr;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0, max: 52 + rnd() * 34, col: rnd() < 0.25 ? '#ffffff' : col, r: (1.6 + rnd() * 2.2) * dpr, conf: false });
    }
  };
  const confetti = (): void => {
    const x = rnd() * W();
    parts.push({ x, y: -10 * dpr, vx: (rnd() - 0.5) * 1.2 * dpr, vy: (1.2 + rnd() * 1.6) * dpr, life: 0, max: 150 + rnd() * 80, col: COLS[Math.floor(rnd() * COLS.length)]!, r: (2 + rnd() * 2.4) * dpr, conf: true });
  };
  let frame = 0;
  const grav = 0.045 * dpr;
  const tick = (): void => {
    // The overlay was torn down (Continue / tap / safety timeout) → stop the loop, never draw into a
    // detached canvas (the orphaned-rAF hazard the codebase warns about).
    if (!canvas.isConnected) return;
    frame++;
    // Launch a few bursts early, then keep a gentle confetti rain going.
    if (frame < 90 && frame % 12 === 0) burstAt((0.2 + rnd() * 0.6) * W(), (0.2 + rnd() * 0.4) * H());
    if (frame % 4 === 0 && parts.length < 360) confetti();
    ctx.clearRect(0, 0, W(), H());
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]!;
      p.life++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += grav;
      if (!p.conf) p.vx *= 0.985;
      const k = 1 - p.life / p.max;
      if (k <= 0 || p.y > H() + 20 * dpr) {
        parts.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.4));
      ctx.fillStyle = p.col;
      if (p.conf) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 0.2 + p.x);
        ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    (canvas as unknown as { _raf?: number })._raf = requestAnimationFrame(tick);
  };
  (canvas as unknown as { _raf?: number })._raf = requestAnimationFrame(tick);
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

/** The floating top-left info chip for the full-bleed hole screen (GS-fullmap): hole #/total, par +
 *  length, the live distance, the running zone score on line 1; a thin lie · wind sub-line + the
 *  momentum pips below. Conditions are pared to what matters (an armed lost-rough warning + scramble);
 *  the verbose biome string moved off the play HUD. Translucent, non-intrusive, pass-through. */
function mapTopInfo(v: ReturnType<typeof shotView>, opts: { shotNo: number; distLabel: string }): string {
  const play = state.play!;
  const len = Math.round(dist(play.hole.tee, play.hole.green));
  // Only the decision-relevant warning survives onto the play HUD (the full conditions list lives on
  // the zone splash): the void's armed lost-rough, which turns an offline miss into a lost ball.
  const lostRough = lieInfo(roughLieOf(play.hole)).penalty ? ' · <span style="color:var(--gs-warn);">🕳 lost rough</span>' : '';
  const boss = currentBoss(state.run);
  const scrambleLine = boss?.partner === 'scramble'
    ? `<div class="gs-sub" style="color:${scramblePartner(state.run).style.cap};">🤝 <b>${scramblePartner(state.run).name}</b>${play.partnerKept ? ' · kept ✓' : play.shots.length ? ' · yours held' : ''}</div>`
    : '';
  return `
    <div class="gs-hud gs-hud-top gs-glass">
      <div class="gs-stats">
        <span>⛳ <b>${play.holeIndex + 1}/${state.course.holes.length}</b></span>
        <span>Par <b>${play.hole.par}</b>·${len}y</span>
        <span>${opts.distLabel}</span>
        ${zoneScoreChip()}
        ${liveLeaderChip()}
      </div>
      <div class="gs-sub">${lieChip(v.lie)} ${windDescription(play.hole)}${lostRough}</div>
      ${scrambleLine}
      ${state.match ? `<div style="margin-top:5px;">${matchHud()}</div>` : ''}
      ${holePips()}
    </div>`;
}

function playingBody(animating: boolean): string {
  const play = state.play!;
  const v = shotView(play, state.run.loadout);
  const bag = state.run.loadout.bag;
  const par = play.hole.par;

  if (animating) {
    // Full-bleed: the live shot canvas IS the screen (it draws the hired caddy itself), with just
    // the floating info chip on top.
    return `
      <div class="gs-shot gs-shot--full">
        <div class="gs-bigmap" id="play"></div>
        ${mapTopInfo(v, { shotNo: play.strokes, distLabel: '…watching…' })}
      </div>`;
  }

  if (play.done) {
    const name = play.pickedUp ? 'Picked up' : scoreName(par, play.strokes);
    const birdieOrBetter = !play.pickedUp && play.strokes <= par - 1;
    // The end-of-hole screen IS the leaderboard screen now: include the hole just finished (it isn't in
    // stopPlayed until `holeComplete`) and show the live arc standings so you track progress every hole.
    // On a matchplay boss stop the duel HUD is the relevant tracker, so the board is replaced by it.
    const playedSoFar = [...(state.stopPlayed ?? []), holeResult(play)];
    const lastIsHoled = play.holed && play.shots.some((s) => s.holed);
    const stopPts = playTotals(playedSoFar.map((p) => p.record)).stableford;
    // The two big shot/putt vignette cards used to push the score + leaderboard off the bottom of the
    // screen — the actual point of the screen. They're scrapped for a compact banner that headlines the
    // ONLY numbers that matter here: this hole's score and the running points total, with the leaderboard
    // prominent right below it.
    const holePts = stablefordPoints(par, play.pickedUp ? par + 6 : play.strokes);
    const d = play.pickedUp ? 99 : play.strokes - par;
    const scoreCol = d < 0 ? '#5fd45a' : d === 0 ? 'var(--gs-ink)' : d === 1 ? '#ffce54' : '#ff6b6b';
    const isAce = play.holed && play.strokes === 1;
    // After the celebration overlay lifts, the end-of-hole screen confirms the ace reward in place.
    const aceNote = isAce
      ? `<div style="margin:0 0 -2px;max-width:460px;background:linear-gradient(180deg,#1c1708,#120f06);border:1px solid rgba(255,213,74,.4);border-radius:12px;padding:9px 14px;font-size:12.5px;color:var(--gs-gold);">⛳ <b>Hole-in-one!</b> +${ACE_CREDIT_BONUS} credits · Ace's Touch (+8% precision) earned for the run.</div>`
      : '';
    const scoreBanner = `
      <div style="display:flex;align-items:center;gap:14px;background:#0d1016;border:1px solid var(--gs-line);border-radius:12px;padding:12px 16px;max-width:460px;">
        <div style="text-align:center;min-width:48px;">
          <div style="font-size:34px;font-weight:800;line-height:1;color:${scoreCol};">${play.pickedUp ? '—' : play.strokes}</div>
          <div style="font-size:10px;opacity:.55;letter-spacing:.08em;margin-top:3px;">PAR ${par}</div>
        </div>
        <div style="flex:1 1 auto;min-width:0;">
          <div style="font-size:10.5px;opacity:.5;letter-spacing:.1em;">HOLE ${play.holeIndex + 1}</div>
          <div style="font-size:18px;font-weight:800;">${name}${lastIsHoled ? ' 🎉' : ''}</div>
          <div style="font-size:12px;opacity:.7;margin-top:1px;">+${holePts} pt${holePts === 1 ? '' : 's'} this hole</div>
        </div>
        <div style="text-align:center;border-left:1px solid var(--gs-line-2);padding-left:14px;">
          <div style="font-size:28px;font-weight:800;line-height:1;color:var(--gs-accent);">${stopPts}</div>
          <div style="font-size:10px;opacity:.55;letter-spacing:.05em;margin-top:3px;">STOP PTS</div>
        </div>
      </div>`;
    const progress = state.match
      ? holeMatchProgressHTML(playedSoFar)
      : (() => {
          const board = liveLeaderboard(state.run, playedSoFar.length, stopPts);
          const me = board.standings.find((s) => s.isPlayer)!;
          const place = `<p style="font-size:13px;margin:.4em 0 .5em;">You're <b style="color:${me.position <= 3 ? '#5fd45a' : me.position <= board.standings.length / 2 ? '#ffce54' : '#ff6b6b'};">${ordinal(me.position)}</b> of ${board.standings.length} · ${board.thru} hole${board.thru === 1 ? '' : 's'} in.</p>`;
          return place + leaderboardHTML(board, { live: true });
        })();
    return `
      ${header()}
      <div style="position:relative;">${birdieOrBetter ? burst() : ''}</div>
      ${aceNote}
      ${scoreBanner}
      <div style="margin:12px 0;max-width:460px;">${progress}</div>
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
      // Cup up-screen, ball below — the putt reads bottom-to-top (matches the pace meter).
      up: [puttPin[0] - play.ball[0], puttPin[1] - play.ball[1]],
    });
    // Manual putt = a pace meter: stop the sweeping marker in the green MAKE band to sink it.
    // Tapping the meter OR the Putt button captures the pace. Full-bleed: the map fills the screen,
    // the meter + Putt float in a bottom panel.
    return `
      <div class="gs-shot gs-shot--full">
        <div class="gs-bigmap">${puttSvg}</div>
        ${mapTopInfo(v, { shotNo: play.strokes + play.putts + 1, distLabel: `<b>${v.distToPin}</b>y · putt <b>${play.putts + 1}</b>` })}
        <div class="gs-hud gs-hud-bottom">
          ${caddyBadgeHTML(puttCaddyId())}
          <div class="gs-hud-controls gs-glass">
            <p style="font-size:11px;opacity:.7;margin:0;line-height:1.35;">Tap the meter (or Putt) in the green <b>MAKE</b> band — too soft is short, too firm runs past.</p>
            <div id="puttmeter"></div>
            <button class="gs-btn gs-btn--primary" data-putt-commit="1" style="margin:0;padding:11px;">⛳ Putt</button>
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
    selPower = 1; // a full-swing cone previews by default until you pull
    selAimBearing = null; // re-seed the aim to the pin for the new shot
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
  const maxPower = maxPowerOf(state.run.loadout);
  // The gesture's aim/power feed the shot: a target along the (gesture-nudged) aim bearing, at the
  // live charge power. `selPower` is 1 at rest (a full-swing cone previews) and animates 0→pull as
  // you charge. The cone the player sees is this powered shot; releasing fires it (GS-power).
  const decision = { clubId: selClubId, aim: selAim, target: selFreeTarget ?? undefined, power: selPower };
  const spray = previewShot(play, decision, state.run.loadout);
  // Feel escape-hatch: window._gsSpray scales the green centre wedge live (A/B the cone geometry).
  const sprayGeom = (window as unknown as { _gsSpray?: SprayGeomInput })._gsSpray;
  // % of shots per zone — straight off the shot's asymmetric shape, so the legend reads exactly true.
  const sh = spray.shape;
  const pctRound = (x: number) => Math.round(x * 100);
  // Frame the map on the FULL-power shot (not the live charge) so the camera stays steady while the
  // cone grows/shrinks with power — the shot expands within a fixed view rather than zooming the world.
  // Both the render and the gesture build the projector from this same stable spread (projector-sync).
  const frameSpray = previewShot(play, { ...decision, power: 1 }, state.run.loadout);
  const mapOpts = decisionView(play, frameSpray);
  const svg = renderHoleSVG(play.hole, {
    shots: play.shots,
    // On a matchplay boss stop, overlay the boss's pre-played line for THIS hole so you see them on the
    // course (where they drove it, where they ended up) — feedback on their ball, not just a number.
    ghostShots: state.match ? state.match.bossHoles[play.holeIndex]?.shots : undefined,
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
  // Club row: ◄ name ► + (re-aim-at-pin when nudged) + (Sam's snap-to-suggested when hired).
  const clubRow = `<div class="gs-clubrow">
      ${cbtn('◄', -1)}
      <span class="gs-clubname">${usable.find((c) => c.id === selClubId)?.name ?? selClubId}</span>
      ${cbtn('►', 1)}
      ${selFreeTarget ? `<button class="gs-btn gs-mini" data-aimreset="1" title="Re-aim at the pin">🎯</button>` : ''}
      ${hasSuggest ? `<button class="gs-btn gs-mini${selClubId === suggested ? ' gs-btn--on' : ''}" data-suggest="1" title="Use the suggested club">🏌</button>` : ''}
    </div>`;
  // Power read-out: the bar fills as you pull DOWN on the map (the cone grows in step); past 100%
  // (with Overdrive) it glows orange as an overpowered shot.
  const powerPct = Math.round(selPower * 100);
  const over = selPower > 1.001;
  const powerCol = over ? '#ff8a3d' : selPower >= 0.66 ? '#5fd45a' : selPower >= 0.33 ? '#ffc454' : '#9fd8e6';
  const aimNote = selFreeTarget && selAimBearing != null && Math.abs(((selAimBearing - bearing(play.ball, pinOf(play.hole)) + 540) % 360) - 180) > 2 ? 'aim adjusted' : 'aim: pin';
  const powerHud = `<div class="gs-power">
      <div class="gs-powerbar"><span class="gs-powerfill" style="width:${Math.min(100, (selPower / maxPower) * 100).toFixed(0)}%;background:${powerCol};"></span>${maxPower > 1 ? `<span class="gs-power100" style="left:${(100 / maxPower).toFixed(0)}%;"></span>` : ''}</div>
      <div class="gs-powerlabel"><b style="color:${powerCol};">${over ? '⚡ ' : ''}Power ${powerPct}%</b> · ${aimNote} · <span style="opacity:.7;">${charging ? 'release to hit · pull back to cancel' : 'pull DOWN on the map'}</span></div>
    </div>`;
  // Condensed spray odds + carry range (the cone on the map carries the detail). Sam (if hired) adds a
  // compact green-depth + forced-carry read on its own line.
  let samRead = '';
  if (hasSuggest && play.lie !== 'green') {
    const gd = greenDepth(play.hole, play.ball);
    const fc = forcedCarry(play.hole, play.ball, pinOf(play.hole));
    const carryTxt = fc ? ` · <span style="color:var(--gs-warn);">⚠ carry <b>${fc.carry}</b> ${hazardLabel(fc.kind)}</span>` : '';
    samRead = `<div class="gs-legend-line" style="opacity:.9;">🎒 ${Math.round(gd.front)}·${Math.round(dist(play.ball, play.hole.green))}·${Math.round(gd.back)}y${carryTxt}</div>`;
  }
  const legend = `<div class="gs-legend-line">
      <span style="color:#5fd45a;">●</span> ${pctRound(sh.green)}% ·
      <span style="color:#ffc454;">●</span> ${pctRound(sh.hookL)}/${pctRound(sh.sliceR)}% ·
      <span style="color:#ff4c4c;">●</span> ${pctRound(sh.duckHookL)}/${pctRound(sh.shankR)}% ·
      <b>${Math.round(spray.carryLow)}–${Math.round(spray.carryHigh)}y</b>
    </div>`;
  // The hired caddy, framed in the bottom-left so it stands out (GS-fullmap). The figure is drawn to
  // the canvas in the render wiring. Absent when no caddy is hired.
  const caddyBadge = caddyBadgeHTML(caddyId());
  const autoFinish = `<button class="gs-roundbtn gs-glass" data-action='${JSON.stringify({ type: 'autoShotHole' })}' title="Auto-finish this hole">»</button>`;
  return `
    <div class="gs-shot gs-shot--full${lefty() ? ' gs-shot--lefty' : ''}">
      <div class="gs-bigmap" data-map="1">${svg}</div>
      ${mapCtrls}
      ${mapTopInfo(v, { shotNo: play.strokes + 1, distLabel: `<b>${v.distToPin}</b>y` })}
      <div class="gs-hud gs-hud-bottom">
        ${caddyBadge}
        <div class="gs-hud-controls gs-glass">
          ${clubRow}
          ${powerHud}
          ${legend}
          ${samRead}
        </div>
        ${autoFinish}
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
        ${row('leftHanded', 'Left-handed', 'Enables left handed mode')}
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
      <section style="flex:1 1 300px;min-width:280px;position:relative;">
        ${res.passed ? burst() : ''}
        <h2 style="font-size:16px;margin:.2em 0;color:${res.passed ? '#5fd45a' : '#ff6b6b'};">
          ${state.match ? (res.passed ? 'MATCH WON' : 'MATCH LOST') : res.passed ? 'MADE THE CUT' : 'MISSED CUT'}</h2>
        ${(() => {
          const board = leaderboard(state.run);
          const positional = board.mode === 'positional';
          const me = board.standings.find((s) => s.isPlayer);
          // For a positional voyage stop the Stableford cut isn't the survival bar (your PLACE is), so
          // don't show "vs cut N" — the standings + "you're Nth" line below carry survival.
          const cutTxt = state.match || positional ? '' : ` vs cut <b>${res.cut}</b>`;
          const summary = `<p style="font-size:14px;">Stableford <b>${res.stableford}</b>${cutTxt} · gross ${res.gross} · <b>+${res.creditsEarned}</b> credits</p>`;
          const through = positional
            ? board.survivorTarget
              ? ` · top ${board.survivorTarget} advance`
              : ''
            : ` · ${board.survivors} make it through`;
          const place = me ? `<p style="font-size:13px;margin:.2em 0 .6em;">You're <b>${ordinal(me.position)}</b> of ${board.standings.length}${through}.</p>` : '';
          return summary + (state.match ? matchResultPanel() : '') + place + leaderboardHTML(board);
        })()}
        <details style="margin-top:8px;"><summary style="cursor:pointer;font-size:12px;opacity:.7;">Scorecard</summary>${scorecard()}</details>
        <div style="margin-top:10px;">${btn(
          state.bossReward && state.bossReward.length ? '🏆 Claim your reward →' : 'Continue → shop',
          { type: 'continue' },
          { variant: 'primary' },
        )}</div>
      </section>
    </div>`;
}

/** The boss-reward screen (GS-talents): pick ONE of a few thematic spoils after beating a boss — a
 *  run TALENT or a permanent Star-Shard reward. Clicking a card claims it and continues to the shop. */
function bossRewardScreen(): string {
  const rewards = state.bossReward ?? [];
  const oppId = state.match?.bossId ?? currentOpponentId();
  const opp = oppId ? getGolfer(oppId) : undefined;
  const cards = rewards
    .map((r, i) => {
      const col = rarCol(r.rarity);
      const icon = r.kind === 'shards' ? '✦' : '🌟';
      return `<div class="gs-clickcard" data-action='${JSON.stringify({ type: 'pickBossReward', index: i })}'
          style="cursor:pointer;flex:1 1 200px;min-width:200px;max-width:280px;border:1px solid ${col};border-radius:12px;
          padding:14px;background:linear-gradient(180deg,${col}14,#0d1016);">
        <div style="font-size:26px;line-height:1;">${icon}</div>
        <div style="font-size:15px;font-weight:800;margin-top:8px;">${r.name}</div>
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:.1em;color:${col};margin-top:2px;">${
          r.kind === 'shards' ? 'Permanent reward' : 'Run talent'
        } · ${r.rarity}</div>
        <div style="font-size:12.5px;opacity:.85;margin-top:8px;line-height:1.4;">${r.desc}</div>
      </div>`;
    })
    .join('');
  return `
    ${header()}
    <section style="max-width:680px;position:relative;">
      ${burst()}
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        ${opp ? `<div style="line-height:0;border:2px solid #ffce54;border-radius:10px;background:#1a0e12;padding:2px;">${golferSVG(opp.look, 44, 54)}</div>` : ''}
        <div>
          <h2 style="font-size:20px;margin:.1em 0;color:#ffce54;">🏆 Victory Spoils</h2>
          <p style="font-size:13px;opacity:.8;margin:0;">You beat ${opp?.name ?? 'the boss'} — choose your reward. A <b>talent</b> powers up the rest of this run; <b>Star Shards</b> are permanent.</p>
        </div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px;">${cards}</div>
    </section>`;
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
    <h2 style="font-size:16px;">🏌 Pro Shop · ${credits} credits</h2>
    ${proGreetingHTML()}
    <p style="font-size:12px;opacity:.6;margin:.2em 0 .6em;">Click a card to buy. Stock rotates each stop — early stops stock cheap commons, deeper stops stock rare/epic power. Stackable upgrades cost more the more you own; rare clubs (▲ upgrades or ✚ new gap-fillers) and a rare caddy may turn up. Hire one caddy and the rest stay home.</p>
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

// The functional family of a route event → a short pill label + accent (distinct from the rarity ring).
const EVENT_CATEGORY: Record<EventCategory, { label: string; col: string }> = {
  calm: { label: 'SAFE', col: '#2bb673' },
  payout: { label: 'PAYOUT', col: '#ffce54' },
  toll: { label: 'GAMBLE', col: '#ff8b6b' },
  salvage: { label: 'SALVAGE', col: '#4fd0e0' },
};

function travelScreen(): string {
  const routeList = state.routes ?? [];
  const credits = state.run.credits;

  // The starmap (GS-routes): Earth → travelled trail → YOU → the three branch lanes ahead.
  const zoneName = themeById(state.course.meta?.themeId ?? '')?.name ?? 'Deep Space';
  const choices: StarmapChoice[] = routeList.map((r) => ({
    id: r.id,
    label: r.event.label,
    icon: r.event.icon,
    rarity: r.event.rarity,
    distanceJump: r.distanceJump,
    elite: r.elite,
    bossAhead: r.bossAhead,
  }));
  // The travelled trail: every cleared stop BEFORE the current one (which is YOU), oldest → newest,
  // labelled with its zone name — so the journey reads as Earth → stage 1 → … → YOU as it builds.
  const trail = state.run.history.slice(0, -1).map((h) => ({
    label: themeById(h.themeId ?? '')?.name ?? 'Deep Space',
  }));
  const map = starmapSVG({
    seed: state.run.seed,
    stopIndex: state.run.stopIndex,
    distanceFromStart: state.run.distanceFromStart,
    currentLabel: zoneName,
    trail,
    choices,
  });

  const chip = (txt: string, col: string) =>
    `<span style="display:inline-block;font-size:11px;font-weight:700;color:${col};border:1px solid ${col}66;border-radius:5px;padding:1px 6px;">${txt}</span>`;

  const routes = routeList
    .map((r) => {
      const ev = r.event;
      const cat = EVENT_CATEGORY[ev.category];
      // Effect chips — each lever is its own readable token (real trade-offs read at a glance).
      const tags: string[] = [];
      if (ev.creditMult !== 1) {
        const pct = Math.round((ev.creditMult - 1) * 100);
        tags.push(chip(`${pct > 0 ? '+' : ''}${pct}% credits`, pct >= 0 ? '#ffce54' : '#ff8b6b'));
      }
      if (ev.cutDelta !== 0) tags.push(chip(`cut ${ev.cutDelta > 0 ? '+' : ''}${ev.cutDelta}`, ev.cutDelta > 0 ? '#ff8b6b' : '#2bb673'));
      if (ev.creditToll) {
        const afford = credits >= ev.creditToll;
        tags.push(chip(`−${ev.creditToll} toll${afford ? '' : ' ⚠'}`, '#ff8b6b'));
      }
      if (ev.shardBonus) tags.push(chip(`✦ +${ev.shardBonus} shards`, '#4fd0e0'));

      const badges = [
        r.bossAhead ? `<span style="color:#ff8b6b;font-weight:700;">⚔ Boss ahead</span>` : '',
        r.elite ? `<span style="color:#ffce54;font-weight:700;">🔥 Harder path</span>` : '',
      ]
        .filter(Boolean)
        .join('&nbsp;·&nbsp;');

      const ring = rarCol(ev.rarity);
      // A whole route card is the click target (the shared btn() wraps an action handler).
      return btn(
        `<div style="display:flex;gap:12px;align-items:flex-start;text-align:left;">
           <div style="flex:0 0 auto;width:46px;height:46px;border-radius:11px;background:radial-gradient(circle at 35% 30%, ${ring}33, #0c1020);border:2px solid ${ring};display:flex;align-items:center;justify-content:center;font-size:24px;">${ev.icon}</div>
           <div style="flex:1 1 auto;min-width:0;">
             <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
               <b style="font-size:15px;">${ev.label}</b>
               ${chip(ev.rarity.toUpperCase(), ring)}
               ${chip(cat.label, cat.col)}
             </div>
             <div style="font-size:12px;opacity:.6;margin:2px 0 4px;">↗ ${r.label} · +${r.distanceJump} distance</div>
             <div style="font-size:13px;opacity:.9;margin-bottom:3px;">${ev.desc}</div>
             <div style="font-size:12px;opacity:.6;font-style:italic;margin-bottom:6px;">${ev.lore}</div>
             <div style="display:flex;gap:6px;flex-wrap:wrap;">${tags.join('')}</div>
             ${badges ? `<div style="font-size:12px;margin-top:6px;">${badges}</div>` : ''}
           </div>
         </div>`,
        { type: 'route', routeId: r.id },
        { borderColor: r.elite ? '#ffce54' : ring, block: true },
      );
    })
    .join('');

  // Push-your-luck cash-out (GS-bank): bank the run now to lock its credits in as permanent shards
  // (busting at the next cut would forfeit them). Shown with the exact shard payout so the "push or
  // bank" call is informed.
  const cashOut = cashOutShards(state.run);
  const banked =
    state.run.bonusShards > 0
      ? ` <span style="color:#4fd0e0;">(✦ ${state.run.bonusShards} salvage already banked)</span>`
      : '';
  const bankBtn =
    state.run.stopIndex > 0
      ? `<div style="margin-top:14px;border-top:1px solid var(--gs-line);padding-top:12px;">
           <p style="opacity:.7;font-size:13px;margin:0 0 6px;">…or quit while you're ahead — cash your <b>${credits}</b> credits into permanent shards. Push deeper and a missed cut forfeits them.${banked}</p>
           ${btn(`✦ Bank run & cash out${cashOut > 0 ? ` (+${cashOut} shards)` : ''}`, { type: 'bank' }, { variant: 'ghost', block: true })}
         </div>`
      : '';
  return `
    ${header()}
    <h2 style="font-size:16px;margin-bottom:8px;">Choose your jump</h2>
    <div style="margin-bottom:12px;">${map}</div>
    <p style="opacity:.75;font-size:14px;margin-top:0;">Every lane is a different bet — safe-but-poor, a payout gamble, a toll for an outsized return, or guaranteed salvage. Deeper jumps raise the cut.${
      routeList.some((r) => r.event.cutDelta <= 0)
        ? " There's a safer option here."
        : ' <span style="color:#ff8b6b;">Out here, every lane is a gamble — or bank the run.</span>'
    }</p>
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

/** The caddy to draw in the LIVE play view's corner (the ball-in-flight screen). Only a guard caddy
 *  has a flight-time role there — it fires the redirect laser/boomerang — so it's the only one shown;
 *  any other hired caddy is already on the decision screen's framed badge, and looming it over the
 *  flight just clutters the screen (the dead-space complaint). */
function flightCaddyId(): string | undefined {
  const id = caddyId();
  return caddyProjectile(id) ? id : undefined;
}

/** The caddy to show on the PUTTING screen — only a putting specialist (Penelope, Mystic Mole). A
 *  distance/guard caddy like Driver Dan has no role on the green, so it doesn't appear there. */
function puttCaddyId(): string | undefined {
  const id = caddyId();
  return isPuttingCaddy(id) ? id : undefined;
}

/** The framed gold caddy badge (the "cool outline") — shared by the decision and putting screens.
 *  The figure is drawn to the canvas in the render wiring (keyed off `data-caddy`). '' when none. */
function caddyBadgeHTML(id: string | undefined): string {
  return hasCaddyArt(id)
    ? `<div class="gs-caddybadge"><canvas class="gs-caddycv" width="128" height="120" data-caddy="${id}"></canvas><span class="gs-caddyname">${CADDY_LABEL[id]}</span></div>`
    : '';
}

/** Left-handed mode (GS-lefty) — the live player setting. The sim reads it off `loadout.lefty`
 *  (synced from this in `render`), the renderers take it as an option, the CSS keys a modifier. */
function lefty(): boolean {
  return getSettings().leftHanded;
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  // Tear down the previous canvas mounts BEFORE we wipe the DOM and (maybe) mount fresh ones.
  // render() replaces `app.innerHTML`, which detaches the old play-view / putt-meter canvases —
  // but their self-perpetuating rAF loops (playView re-requests every frame even after `done`,
  // see playView.ts) keep running forever unless `destroy()` is called. dispatch() destroys them,
  // but render() is invoked DIRECTLY all over (scheduleRender during the power-pull, the onDone
  // hold timers, popup-continue, the settings toggle) — so each shot used to leak one orphaned
  // 60fps loop drawing into a detached canvas, piling up until the power-pull and manual putting
  // went unusably laggy. Destroying here makes every re-render reclaim the prior mount; the
  // conditional blocks below re-mount fresh handles as the screen needs them.
  if (view) {
    view.destroy();
    view = null;
  }
  if (puttMeter) {
    puttMeter.destroy();
    puttMeter = null;
  }
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
      selPower = 1;
      selAimBearing = null;
      decisionShotCount = -1;
      awaitingShotPopup = false;
      aceCelebratedHole = -1;
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
      : state.screen === 'bossReward'
      ? bossRewardScreen()
      : state.screen === 'shop'
      ? shopScreen()
      : state.screen === 'travel'
      ? travelScreen()
      : state.screen === 'outpost'
      ? outpostScreen()
      : gameoverScreen();

  // The interactive play screen (decision / watching / putting — but not the hole-complete card) is
  // full-bleed: the map fills the page, so drop the page frame's padding/max-width for it.
  const fullBleed = state.screen === 'playing' && !!state.play && !state.play.done;
  // The character-select roster wants a wider frame so all four golfers line up across one screen.
  const wide = state.screen === 'character';
  app.innerHTML = `<main class="gs-main${fullBleed ? ' gs-main--bleed' : ''}${wide ? ' gs-main--wide' : ''}">${body}</main>${settingsOpen ? settingsOverlay() : ''}`;
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
  // Re-aim at the pin: clear the gesture's aim nudge so the next shot lines up on the flag again.
  app.querySelectorAll<HTMLElement>('[data-aimreset]').forEach((el) => {
    el.addEventListener('click', () => {
      selFreeTarget = null;
      selAimBearing = null;
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
  // Pull-to-power shot gesture: press the map, drag DOWN to charge power (the cone grows), slide to
  // aim, release to fire (GS-power). Pointer-move/up listen on window so the gesture survives the
  // per-frame re-render that replaces the map element.
  wireShotGesture(app);
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
        // The caddy now stands in the framed badge beside the meter (only a putting specialist), so
        // the meter itself draws no figure and uses its full width.
        onCommit: (pace) => dispatch({ type: 'putt', control: { pace } }),
      });
    }
  }

  // Draw the hired caddy into each framed gold badge on screen (the decision screen's bottom-left
  // figure and the putting screen's, GS-fullmap). The play view draws its own corner guard while
  // animating; these badges cover the aim-and-charge and putting screens. Each badge canvas carries
  // its caddy id in `data-caddy`, so this one generic pass serves every screen. A one-shot draw per
  // render (the idle bob updates whenever the screen re-renders — live while charging), so no rAF.
  document.querySelectorAll<HTMLCanvasElement>('canvas.gs-caddycv[data-caddy]').forEach((cv) => {
    const id = cv.dataset.caddy;
    if (!hasCaddyArt(id)) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    // The figure is authored ~64u tall; draw it scaled to fill the badge, feet near the bottom.
    // Mirror the portrait in left-handed mode (GS-lefty) so the caddy faces with the flipped cast.
    drawCaddy(ctx, id, cv.width / 2, cv.height - 8, cv.height * 0.92, performance.now(), lefty());
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
        biome: holeBiome(hole), themeId: holeThemeId(hole),
        golferLook: golferLook(),
        caddyId: flightCaddyId(),
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
      // Orient pin-up from the shot's origin (fixed for the whole animation so the world doesn't
      // spin mid-flight) — matches the decision map the player just aimed on (origin→pin up).
      const animPin = pinOf(play.hole);
      const animUp: [number, number] = [animPin[0] - focus[0], animPin[1] - focus[1]];
      const hadShots = animatingPlay.shots.length > 0;
      // Fill the WHOLE full-bleed map (the `.gs-bigmap` is absolute inset:0 = the viewport), so the
      // watch screen has no letterboxed dead space below the canvas. The canvas can't aspect-scale
      // via CSS like the SVG map can, so we size it to the container's real pixels and let the
      // follow-cam show a little more vertically; the corridor framing (width-limited on viewRadius)
      // still matches the decision map.
      const animW = Math.round(playEl.clientWidth || (window.innerWidth || 400));
      const animH = Math.round(playEl.clientHeight || (window.innerHeight || 800));
      view = mountPlayView(playEl, play.hole, animatingPlay.shots, animatingPlay.putts, {
        width: animW,
        height: animH,
        biome: holeBiome(play.hole), themeId: holeThemeId(play.hole),
        golferLook: golferLook(),
        caddyId: flightCaddyId(),
        lefty: lefty(),
        focus,
        viewRadius: animatingPlay.shots.length ? decisionReach(travel) : 25,
        focusBias: DMAP_BIAS,
        up: animUp,
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
          // The rarest shot in the game (GS-ace): the TEE shot holed out. Worth a full-screen takeover.
          const isAce = play.done && play.holed && play.strokes === 1;
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
          // — chipping/putting used to cut to the follow-up instantly. Cases:
          //  • a HOLE-IN-ONE → a brief beat for the ball to drop, then the celebration overlay (which
          //    runs onDismiss → render() to land on the normal end-of-hole screen);
          //  • non-terminal full shot → pop the rich shot-result card (auto-advances if Fast Shots is on);
          //  • terminal (holed/picked up/auto putt-out done) → a longer hold, then the done screen;
          //  • non-terminal putt(s) only (manual lag) → a brief hold, then back to the putt meter.
          const feelMs = (window as unknown as { _gsFeel?: Record<string, number> })._gsFeel ?? {};
          if (isAce && aceCelebratedHole !== play.holeIndex) {
            aceCelebratedHole = play.holeIndex;
            popupTimer = window.setTimeout(() => {
              popupTimer = 0;
              showAceCelebration(
                {
                  holeNo: play.holeIndex + 1,
                  total: state.course.holes.length,
                  par: play.hole.par,
                  club: lastShot?.club.name,
                  aceNo: state.lifetimeAces + 1, // this ace (counted into the save at stop scoring)
                },
                () => render(),
              );
            }, feelMs.aceDelayMs ?? 380);
          } else if (play.done) {
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
