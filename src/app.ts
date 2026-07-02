/**
 * App entry — the interactive shell over the pure run reducer (`ui/game.ts`).
 *
 * Renders the current screen, wires button clicks to reducer actions, and persists the
 * save after each action. All game logic lives in the pure sim/reducer; this file is just
 * DOM + the canvas play view + localStorage glue.
 */

import { scoreName, playTotals, stablefordPoints } from './sim/score';
import { mountPlayView, type GolferLook, type PlayViewHandle } from './render/playView';
import { itemCardHTML, shotCardHTML } from './render/cards';
import { itemArtSVG, drawGolfBag } from './render/itemArt';
import { renderHoleSVG } from './render/holeView';
import { holeProjector, type ProjectOptions } from './render/project';
import { createWeather } from './render/weather';
import { shotView, previewShot, awaitingPutt, canPuttFringe } from './sim/rpg/play';
import { mountPuttMeter, type PuttMeterHandle } from './render/puttMeter';
import { drawCaddy, hasCaddyArt, CADDY_LABEL, CADDY_VOICE } from './render/caddyArt';
import { speakCaddy } from './render/speech';
import { journeyMapHTML, type StarmapChoice } from './render/starmap';
import { skyCoordForName } from './render/sky-coords';
import type { EventCategory } from './sim/rpg/events';
import { COURSE_EFFECTS, effectWindMult, effectCarryMult, effectPatchKind, routeDifficulty, routeEffect } from './sim/rpg/effects';
import type { PatchKind } from './sim/patches';
import { biomeCarryMult, pinOf, greenDepth, forcedCarry, DEFAULT_MANUAL_BAND, MANUAL_IDEAL_PACE, puttBreakYd, idealPuttAim, puttPathPreview } from './sim/round';
import { puttSkillOf } from './sim/rpg/economy';
import { lieInfo, roughLieOf } from './sim/shot';
import { archetypeFor, themeById } from './sim/course/themes';
import { zoneProfile, difficultyPips, shopPro, proMood, proLine, sectionEvents } from './sim/course/zones';
import { bearing, dist, type Hole, type Rarity, type Vec } from './sim/course/contract';
import { type ShotSpread, type PlayedHole } from './sim/round';
import { type SprayGeomInput } from './render/holeView';
import { rarCol } from './sim/rpg/loot';
import { ACE_CREDIT_BONUS, clubOfferNote, clubSetById, equippedGearTheme, isHybridType, isPuttingCaddy, itemCap, itemCost, maxPowerOf, namedCaddyOwned, ownedCount, REWARD_CLUB_TYPES, shopItem, usableBag } from './sim/rpg/economy';
import { CLUBS, clubById } from './sim/clubs';
import { FORMATS } from './sim/rpg/formats';
import { getCharacter, type Character } from './sim/rpg/characters';
import { ASCENSION_MAX, ascensionCutBonus, cashOutShards, currentBoss, effectiveCut, snapshotRun, teamDuelSetupForRun, type TeamDuelSetup } from './sim/rpg/run';
import { leaderboard, liveLeaderboard, runField, matchOpponentFor, livePosition } from './sim/rpg/league';
import { holeResult } from './sim/rpg/play';
import { arcSurvivorTarget } from './sim/rpg/competition';
import { getGolfer, getArchetype } from './sim/rpg/golfers';
import { isMatchplayBoss, isTeamDuelBoss } from './sim/rpg/formats';
import { matchScoreline, matchState, holeDuel, betterPlayedHole } from './sim/rpg/match';
import { canBuyShip, shipCatalogue, type Ship } from './sim/rpg/ships';
import { shipCardSVG, shipSVG } from './render/shipArt';
import { apparelById, apparelForSlot, canBuyApparel, equippedSet, type Apparel, type ApparelSlot } from './sim/rpg/apparel';
import { apparelCardSVG, golferPreviewSVG } from './render/apparelArt';
import { clubhouseLoungeHTML, type LoungeGolfer } from './render/clubhouseLounge';
import { cosmeticRarCol, isMythic } from './sim/rpg/cosmetics';
import { BAG_SETS, bagSet, bagSetUnlocked, bagTierRank, canBuyBagSet, bagUnlockForClearedAscension, type BagSet } from './sim/rpg/bag';
import {
  initState,
  reduce,
  rerollCost,
  shipForCharacter,
  hatForCharacter,
  shirtForCharacter,
  pantsForCharacter,
  type Action,
  type UiState,
} from './ui/game';
import { CHARACTERS } from './sim/rpg/characters';
import { loadSave, writeSave } from './save/storage';
import { defaultSave } from './save/schema';
import { mountIntro } from './render/introView';
import { sfx, resumeAudio } from './render/audio';
import { getSettings, toggleSetting, type Settings } from './settings';
import { HAPTICS, haptic } from './render/haptics';
import { showAceCelebration, showBirdCelebration, showVoyageVictory } from './render/celebrations';
import { golferSVG, proAvatarSVG, characterScreen, ordinal, competitorsCard, leaderboardHTML, opponentBadge } from './render/golferCards';

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

/** A fresh random seed for a new run (GS-fresh-start). The run stays fully deterministic FROM its
 *  seed — this only picks WHICH deterministic run you get, so every boot/new-run opens a different
 *  world + journey instead of the old fixed-1234 opener. `?seed=` pins it (repro/sharing/test hub);
 *  the sim itself never calls Math.random. */
function freshRunSeed(): number {
  return Math.floor(Math.random() * 1e9);
}

let state: UiState;
let view: PlayViewHandle | null = null;
/** The animated weather overlay over the aim/putt map (GS-journey-fx rework) — so the sky + air are
 *  alive while you line up, not only mid-flight. Torn down + remounted each render like `view`. */
let weatherOverlay: { destroy(): void } | null = null;

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
      ownedShips: save.ownedShips,
      ownedApparel: save.ownedApparel,
      shipByCharacter: save.shipByCharacter,
      hatByCharacter: save.hatByCharacter,
      shirtByCharacter: save.shirtByCharacter,
      pantsByCharacter: save.pantsByCharacter,
      bagTier: save.bagTier,
      unlockedClubsByCharacter: save.unlockedClubsByCharacter,
      clubhouseVisit: save.clubhouseVisit,
    };
    const seed = seedFromUrl() ?? freshRunSeed();
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
    writeSave(defaultSave());
  } catch {
    /* ignore */
  }
  try {
    state = initState(freshRunSeed(), {});
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
    version: 12,
    bestStableford: state.bestStableford,
    bestDistance: state.bestDistance,
    shards: state.shards,
    metaUpgrades: state.metaUpgrades,
    maxAscension: state.maxAscension,
    lifetimeAces: state.lifetimeAces,
    ownedShips: state.ownedShips,
    ownedApparel: state.ownedApparel,
    shipByCharacter: state.shipByCharacter,
    hatByCharacter: state.hatByCharacter,
    shirtByCharacter: state.shirtByCharacter,
    pantsByCharacter: state.pantsByCharacter,
    bagTier: state.bagTier,
    unlockedClubsByCharacter: state.unlockedClubsByCharacter,
    clubhouseVisit: state.clubhouseVisit,
    activeRun: state.run.status === 'active' ? snapshotRun(state.run) : undefined,
  });
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
  if (weatherOverlay) {
    weatherOverlay.destroy();
    weatherOverlay = null;
  }
  if (puttMeter) {
    puttMeter.destroy();
    puttMeter = null;
  }
  // A light UI tick on navigation presses (the stroke + purchase actions get their own richer cue).
  if (action.type !== 'shot' && action.type !== 'putt' && action.type !== 'buy' && action.type !== 'buyShip' && action.type !== 'buyApparel') {
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
    // Entering/leaving a character's Clubhouse resets the open slot picker to the resting stage.
    if (
      action.type === 'openClubhouse' ||
      action.type === 'closeClubhouse' ||
      action.type === 'clubhouseBackToHall' ||
      action.type === 'openClubhouseHall'
    ) {
      clubhouseSlot = null;
    }
    // Opening the Trade Market re-collapses every catalogue section so it lands compact (GS-market-accordion).
    if (action.type === 'openMarket') {
      collapsedMarketSections.clear();
      for (const id of MARKET_SECTION_IDS) collapsedMarketSections.add(id);
    }
    // Purchase chime (a real buy only — unaffordable cards aren't clickable).
    if (action.type === 'buy' || action.type === 'buyShip' || action.type === 'buyApparel') {
      sfx.reward();
      haptic(HAPTICS.tap);
    }
    // Big-beat cues on the cut transition: a bright arpeggio for making it, a fall for missing.
    // A WON voyage is the exception — its fanfare + haptic fire inside the victory takeover below, so it
    // never plays the "you failed" fall it used to share with a missed cut.
    const enteredGameover = state.screen === 'gameover' && prevScreen !== 'gameover';
    if (state.screen === 'result' && prevScreen !== 'result') {
      sfx.madeCut();
      haptic(HAPTICS.madeCut);
    } else if (enteredGameover && state.run.endedReason !== 'won') {
      sfx.missCut();
      haptic(HAPTICS.bad);
    }
    persist();
    render();
    // The voyage-victory takeover (GS-victory) overlays the settled gameover recap on a won run, then
    // dismisses back to it. A cosmetic side-effect (like the ace/bird celebrations) — no reducer/save touch.
    if (enteredGameover && state.run.endedReason === 'won') {
      showVoyageVictory(victoryInfo(), () => render());
    }
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
    <button class="gs-cog" data-open-settings="1" title="Settings" aria-label="Settings">⚙</button>
    <header style="border-left:4px solid #5fd45a;padding-left:10px;">
      <h1 style="margin:0;font-size:24px;">⛳ Golf Stars</h1>
      <p style="opacity:.75;font-size:13px;margin:.3em 0;">Voyage the galaxy. Make the cut. Travel deeper. — Best dist ${state.bestDistance}, best SF ${state.bestStableford}</p>
    </header>
    <div style="margin:.8em 0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);">✦ <b>${state.shards}</b> Star Shards</span>
      ${state.lifetimeAces > 0 ? `<span class="gs-chip" style="border-color:#3a3320;color:var(--gs-gold);" title="lifetime holes-in-one">⛳ <b>${state.lifetimeAces}</b> Ace${state.lifetimeAces === 1 ? '' : 's'}</span>` : ''}
      ${installButtonHTML()}
    </div>
    ${navTilesHTML()}
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

// --- Competition field & leaderboard (GS-100) --------------------------------

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
  // you can attack or protect accordingly (real matchplay: you can see the other ball). EXCEPT in a
  // BEST-BALL duel (GS-team-duel): there every hole result — yours, your partner's, the other side's —
  // is a hole-END reveal (the pair-cards screen), so mid-hole the HUD holds its tongue.
  const play = state.play;
  let target = '';
  if (play && !play.done && m.setup?.format !== 'bestball') {
    const bh = m.bossHoles[play.holeIndex];
    if (bh) {
      const rel = bh.record.strokes - play.hole.par;
      const relTxt = rel === 0 ? 'par' : rel > 0 ? `+${rel}` : `${rel}`;
      target = `<span style="font-size:10.5px;opacity:.85;">· ${opp?.shortName ?? 'Boss'} made <b>${bh.record.strokes}</b> (${relTxt})</span>`;
    }
  }
  const modeTag = state.match?.setup ? `<span style="font-size:10px;opacity:.6;">${teamFormatLabel(state.match.setup.format)}</span>` : '';
  return `<div style="display:flex;align-items:center;gap:8px;padding:4px 9px;border:1px solid ${col};border-radius:8px;background:#0d1016cc;flex-wrap:wrap;">
      <span style="font-size:11px;opacity:.7;">⚔ vs ${opp?.shortName ?? 'Boss'}</span>
      ${modeTag}
      <span style="font-size:13px;font-weight:800;color:${col};">${line}</span>
      <span style="font-size:10.5px;opacity:.6;">thru ${st.thru}/${state.course.holes.length}</span>
      ${target}
    </div>`;
}

/** The label for the current duel's mode (GS-team-duel) — the team format, or plain matchplay. */
function duelModeLabel(): string {
  const setup = state.match?.setup;
  return setup ? `${teamFormatLabel(setup.format)} duel` : 'Matchplay';
}

/** A line describing who carried the partner in a team duel (GS-team-duel), for the result screen. */
function teamDuelCaption(): string {
  const setup = state.match?.setup;
  if (!setup) return '';
  const partner = teamPartnerChar(setup);
  if (!partner) return '';
  const oppName = getGolfer(setup.opponentId)?.shortName ?? 'your rival';
  return setup.partnerSide === 'player'
    ? `<div style="font-size:11px;opacity:.7;margin-top:4px;">🤝 You played ${teamFormatLabel(setup.format)} with <b>${partner.name}</b> (you were the underdog).</div>`
    : `<div style="font-size:11px;opacity:.7;margin-top:4px;">🤝 ${oppName} played ${teamFormatLabel(setup.format)} with <b>${partner.name}</b> — you went solo as the favourite.</div>`;
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
        ${opponentBadge(m.bossId, duelModeLabel())}
        <div style="text-align:right;"><div style="font-size:18px;font-weight:900;color:${col};">${verdict}</div>
          <div style="font-size:13px;opacity:.85;">${matchScoreline(st)}</div></div>
      </div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:9px;">${cells}</div>
      <div style="font-size:11px;opacity:.6;margin-top:6px;">Hole-by-hole vs ${opp?.name ?? 'the leader'} — W win · L loss · ½ halved.</div>
      ${teamDuelCaption()}
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
  // In a player-side best-ball the counted score is the TEAM's (better of you + partner) — label it so.
  const youLbl = m.setup?.format === 'bestball' && m.setup.partnerSide === 'player' ? 'your side' : 'you';
  const lastLine = last
    ? `<div style="font-size:11.5px;opacity:.8;margin-top:6px;">This hole: ${youLbl} <b>${last.playerStrokes}</b> v <b>${last.bossStrokes}</b> ${opp?.shortName ?? 'Boss'} — ${last.winner === 'player' ? '<span style="color:#5fd45a;">won</span>' : last.winner === 'boss' ? '<span style="color:#ff6b6b;">lost</span>' : 'halved'}</div>`
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
        ${opponentBadge(m.bossId, duelModeLabel())}
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
  // Boss stop (GS-voyage): a louder note — and a team read (format + partner side) for a team duel.
  const boss = currentBoss(state.run);
  const duel = isTeamDuelBoss(boss) ? teamDuel() : undefined;
  const split = state.course.meta.split;

  // World identity (GS-19): the archetype's lore/profile, the per-stop theme name, difficulty.
  const themeId = c.meta.themeId;
  const zone = zoneProfile(archetypeFor(themeId, c.biome));
  const theme = themeId ? themeById(themeId) : undefined;
  const col = rarCol(c.rarity);
  const diffPips = difficultyPips(zone.difficulty);
  const rar = rarityFlavour(c.rarity);

  // Contextual notes (boss / split / route event) — only when they apply, kept compact and ABOVE
  // the CTA so a decision is never buried under the hole art.
  const notes: string[] = [];
  if (boss) {
    const tag = duel
      ? ` · ${teamFormatLabel(duel.format).toUpperCase()} DUEL`
      : isMatchplayBoss(boss)
      ? ' · MATCHPLAY'
      : '';
    // Team duel (GS-team-duel): say which side carries the partner (the underdog) + the rule.
    let teamNote = '';
    if (duel) {
      const partner = teamPartnerChar(duel);
      const youHavePartner = duel.partnerSide === 'player';
      const oppName = getGolfer(duel.opponentId)?.shortName ?? 'your rival';
      teamNote = partner
        ? `<div style="font-size:12px;margin-top:5px;color:${partner.style.cap};">🤝 ${
            youHavePartner
              ? `You're the underdog — <b>${partner.name}</b> joins your bag`
              : `You're the favourite — ${oppName} brings <b>${partner.name}</b> to even it up; you go it alone`
          } · <b>${teamFormatLabel(duel.format)}</b> (${teamFormatRule(duel.format)}).</div>`
        : '';
    }
    // Scouting line (GS-team-duel): the opponent's style read, so you know the matchup going in.
    const oppId = duel?.opponentId ?? (isMatchplayBoss(boss) ? currentOpponentId() : undefined);
    const scoutSub = oppId
      ? `${opponentScouting(oppId)}${duel?.homeEdge ? ' · ⚑ on home turf — plays sharper here' : ''}`
      : 'Your opponent — beat them hole by hole';
    notes.push(`<div style="margin-top:10px;padding:9px 11px;border:1px solid ${boss.final ? '#ffce54' : '#c0392b'};
        border-radius:9px;background:linear-gradient(180deg,#1a0e12,#120b10);">
       <div style="font-size:11px;letter-spacing:.12em;color:${boss.final ? '#ffce54' : '#ff6b6b'};">
         ${boss.final ? '★ FINAL BOSS' : '⚔ BOSS STOP'}${tag}</div>
       <b style="font-size:16px;">${boss.name}</b>
       <div style="font-size:12.5px;opacity:.85;margin-top:2px;">${boss.blurb}</div>
       ${teamNote}
       ${oppId ? `<div style="margin-top:8px;">${opponentBadge(oppId, scoutSub)}</div>` : ''}
     </div>`);
  }
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
    rainbow: rainbowActive(),
  });

  return `
    ${header()}
    <article class="gs-panel" style="border-color:${col}${rar.strong ? 'aa' : '66'};box-shadow:0 0 ${rar.glow}px ${col}${rar.strong ? '44' : '22'};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div style="min-width:0;">
          <div style="font-size:21px;font-weight:800;line-height:1.1;">${zone.name}</div>
          <div style="font-size:13px;color:var(--gs-accent);margin-top:2px;">${zone.signature}${theme ? ` · ${theme.name}` : ''}</div>
          <div style="font-size:12.5px;opacity:.7;margin-top:3px;">${c.meta.name} · ${c.holes.length} holes · par ${par} · 🌪 ${c.meta.wildness.toFixed(2)}</div>
          <div style="font-size:12px;margin-top:5px;color:${col};font-style:italic;opacity:.95;">${rar.glyph} ${rar.tagline}</div>
        </div>
        <div style="text-align:right;flex:0 0 auto;">
          <span style="${rar.strong ? `background:${col};color:#0b0d12;font-weight:800;` : `color:${col};`}border:1px solid ${col};border-radius:6px;padding:${rar.strong ? '2px 9px' : '1px 7px'};font-size:11px;text-transform:uppercase;letter-spacing:1px;">${rar.glyph} ${c.rarity}</span>
          <div style="font-size:10.5px;opacity:.65;margin-top:7px;letter-spacing:.06em;text-transform:uppercase;">Difficulty</div>
          <div style="font-size:15px;letter-spacing:1px;color:var(--gs-danger);">${diffPips}</div>
        </div>
      </div>
      ${notes.join('')}
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--gs-line-2);">
        <p style="font-size:14px;margin:0 0 10px;">${(() => {
          const winnable = !!(FORMATS[state.run.formatId] ?? FORMATS['flat']!).winnable;
          if (duel)
            return `⚔ Win the <b>${teamFormatLabel(duel.format)} duel</b> hole by hole — ${
              duel.partnerSide === 'player' ? 'your partner has your back' : 'you give up the partner advantage'
            }.`;
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
// Fringe/apron putt (GS-fringe-putt): when the ball is just off the green, putting with the pace
// meter is offered (and is the default) instead of an awkward full-swing chip — `selPutt` toggles
// between the putt meter and the normal shot gesture. Reset each new shot to the lie's natural choice.
let selPutt = false;
// Manual-putt lateral AIM (yards, + = right of the ball→cup line; GS-greens-3). The player nudges it
// with ◄/► to read the slope BREAK; a green-reading caddy (Mystic Mole) snaps it to the ideal line.
// `null` = not yet set this putt (seeded from the caddy/flat default on first render of a putt).
let selPuttAim: number | null = null;
let puttAimResolved = 0; // the aim (yd) shown this render — read by the commit handler so they match
let lastPuttKey = ''; // `${holeIndex}:${putts}` — resets the aim for each new putt
let decisionShotCount = -1; // shots taken when the current club selection was defaulted

/** The break-read row on the putt screen (GS-greens-3): the slope's break + ◄/► aim controls (or the
 *  caddy's read). `breakYd`/`aim` are signed (+ = right of the line); the player aims to cancel break. */
function puttAimRow(breakYd: number, aim: number, reads: boolean): string {
  const fmt = (y: number) => `${Math.abs(y).toFixed(1)}yd ${y >= 0 ? 'right' : 'left'}`;
  const brkTxt = Math.abs(breakYd) < 0.2 ? '—' : `breaks ${fmt(breakYd)}`;
  if (reads) {
    return `<div style="font-size:11.5px;opacity:.85;text-align:center;margin:1px 0;">🐀 <b>Mole reads:</b> aim ${Math.abs(aim) < 0.2 ? 'straight' : fmt(aim)} · <span style="opacity:.7;">${brkTxt}</span></div>`;
  }
  return `<div style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:11.5px;margin:1px 0;">
      <button class="gs-btn gs-mini" data-putt-aim="-1" title="Aim left">◄</button>
      <span style="min-width:120px;text-align:center;">Aim <b>${Math.abs(aim) < 0.2 ? 'straight' : fmt(aim)}</b><br><span style="opacity:.6;">slope ${brkTxt}</span></span>
      <button class="gs-btn gs-mini" data-putt-aim="1" title="Aim right">►</button>
    </div>`;
}
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
// The follow-cam radius (course yds) the decision map is CURRENTLY framed at — captured on every
// decision render and handed to the shot animation so the release→watch cut keeps the exact zoom
// the player was aiming at (the "zoom skip-jump on release" bug). null in whole-hole view (no
// follow radius to match) and before any decision has rendered (resume) — those fall back to the
// travel-framed reach.
let decisionRadius: number | null = null;
// Shop bag-inventory: the gear item the player tapped to inspect (its card shows for comparison with
// the shop stock). View-only module state (like selClubId) — no reducer/save state, reset on buy.
let inspectGearId: string | null = null;
// Trade Market accordion (GS-market-accordion): which catalogue sections the player has collapsed.
// View-only module state (like inspectGearId) — toggled via [data-toggle-section] + re-render, never
// persisted. Every section starts collapsed (re-seeded from MARKET_SECTION_IDS each time the market
// opens) so the catalogue lands compact and browsable; the player expands the racks they want.
const MARKET_SECTION_IDS = ['ships', 'hat', 'shirt', 'pants', 'bags'] as const;
const collapsedMarketSections = new Set<string>(MARKET_SECTION_IDS);
// Clubhouse editor (GS-clubhouse-stage): which slot picker is open — tap a body part or the garage on
// the character stage to reveal that slot's rack. View-only module state (like inspectGearId), toggled
// via [data-clubslot] + re-render, reset when the Clubhouse opens/closes. null = the resting stage.
type ClubSlot = ApparelSlot | 'ship';
let clubhouseSlot: ClubSlot | null = null;
// Travel screen (GS-journey-vertical): the route the player tapped on the star-chart to inspect — its
// info sheet (world + bet + confirm/cancel) opens over the map. View-only module state (like
// inspectGearId / settingsOpen): toggled via [data-route-inspect] + re-render, reset on leaving travel,
// zero reducer/save/rng impact. The reducer's existing { type:'route' } action still commits the jump.
let inspectRouteId: number | null = null;
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
  // Only the full-shot decision screen — not the green putt, nor a fringe putt the player chose.
  if (state.play.done || awaitingPutt(state.play) || (canPuttFringe(state.play) && selPutt)) return;
  const svg = app.querySelector<SVGSVGElement>('[data-map] svg');
  if (!svg) return;
  const play = state.play;
  const maxPower = maxPowerOf(state.run.loadout);
  const PULL_RANGE = 150; // px of downward drag for 100% power
  const AIM_SENS = 0.34; // degrees of aim nudge per px of horizontal drag
  const COMMIT = 0.06; // release below this power = cancel (a tap, or pulled back to zero)
  const ENGAGE_SLOP = 6; // px a single finger must move before a power charge engages (pinch window)
  const STALE_MS = 700; // a pending single finger older than this is treated as a dropped/stale gesture
  const pointers = new Map<number, { x: number; y: number }>();
  let startX = 0;
  let startY = 0;
  let startBearing = 0;
  let gestureStart = 0; // performance.now() when the current single-finger gesture began (staleness)
  let pending = false; // a single finger is down but the charge hasn't engaged yet (pinch window)
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
    pending = false;
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
    if (active) {
      applyDrag(e.clientX, e.clientY);
      return;
    }
    // A single finger is down but the charge hasn't committed yet: only ENGAGE once it has moved
    // past a small slop. That leaves a window for a SECOND finger to land first and be read as a
    // pinch — so two-finger zoom no longer trips the pull-to-shot (which used to fire on touch).
    if (pending && pointers.size === 1 && Math.hypot(e.clientX - startX, e.clientY - startY) > ENGAGE_SLOP) {
      pending = false;
      active = true;
      charging = true;
      applyDrag(e.clientX, e.clientY);
    }
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
    pending = false;
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
    const now = performance.now();
    // Clear pointers left by a gesture whose up/cancel never arrived (e.g. the screen slept mid-touch
    // and the OS dropped the release) — without this a leftover entry made the first fresh tap read as
    // a second finger → a spurious pinch. A LIVE gesture (active/pinch) keeps its pointers; a PENDING
    // first finger is only treated as stale once it's OLD, otherwise clearing here would drop it and
    // misread a genuine pinch's second finger as a fresh single-finger charge (never reaching size 2).
    if (!active && !pinch && (!pending || now - gestureStart > STALE_MS)) {
      pointers.clear();
      pending = false;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      startX = e.clientX;
      startY = e.clientY;
      // Seed the aim bearing from the current aim (the pin by default, or the last nudge).
      startBearing = selAimBearing ?? bearing(play.ball, pinOf(play.hole));
      // PENDING, not charging yet: the charge engages only once the finger drags past ENGAGE_SLOP
      // (see `move`), leaving room for a second finger to start a pinch first. The resting
      // full-swing cone stays up until then — a tap that never moves does nothing (no flicker).
      pending = true;
      active = false;
      lastNotch = 0;
      gestureStart = now;
      selPower = 0; // charge starts empty so a no-pull release reads as a cancel (no accidental shot)
      resumeAudio();
    } else if (pointers.size === 2) {
      pinch = { startDist: twoFingerDist(), startZoom: mapZoom };
      pending = false;
      active = false; // a second finger cancels any pending charge → pinch-zoom instead
      selPower = 1;
      charging = false;
      scheduleRender();
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
  const carryPen =
    info.carryMult < 0.99 ? `−${Math.round((1 - info.carryMult) * 100)}% carry`
    : info.carryMult > 1.01 ? `+${Math.round((info.carryMult - 1) * 100)}% carry` // hot/fast lies fly long
    : '';
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
// Ball sits LOW — near the bottom of the map, just above the floating bottom control panel — so
// nearly the whole frame is the shot AHEAD. At 0.72 the ball read too high and the top of a
// max-distance shot landed at ~4% from the top, tucked behind the top info-chip / at the very top
// edge, forcing a manual zoom-out on every full swing. Dropping it to 0.84 reclaims the wasted
// space that was showing terrain BEHIND the ball, so the full arc for the longest club lands at
// ~16% from the top — clear of the HUD and visible without zooming out. (The ball still clears the
// bottom panel, which floats over roughly the bottom ~10% of the map.)
const DMAP_BIAS = 0.84;
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
  if (kind === 'cetusdeep') return 'the star-ocean';
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
// Same one-shot guard for the eagle/albatross fly-over celebration (a non-ace −2 / −3 hole-out).
let birdCelebratedHole = -1;

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
/** Per-rarity course flavour (GS-rarity-style): a glyph, a one-line tagline, and how boldly to frame
 *  the stop — so common→legendary read as DISTINCT finds, not just a colour swap. */
function rarityFlavour(r: Rarity): { glyph: string; tagline: string; glow: number; strong: boolean } {
  switch (r) {
    case 'legendary':
      return { glyph: '✦', tagline: 'A legendary world — the galaxy rarely yields its like.', glow: 34, strong: true };
    case 'epic':
      return { glyph: '◆', tagline: 'An epic find — a world worth the voyage.', glow: 28, strong: true };
    case 'rare':
      return { glyph: '◈', tagline: 'A rare stop — richer rewards, sterner test.', glow: 22, strong: false };
    default:
      return { glyph: '○', tagline: 'A common world to find your rhythm.', glow: 18, strong: false };
  }
}

/** A short, fun label for a notable hole archetype (GS-shapes-2); '' for a plain straight/dogleg. */
function shapeLabel(shapeId?: string): string {
  if (!shapeId) return '';
  if (shapeId === 'drivable-par-4') return '🏌 Drivable';
  if (shapeId.includes('hairpin')) return '↩ Hairpin';
  if (shapeId.includes('cape')) return '🌊 Cape';
  if (shapeId.includes('double')) return '〰 Double dogleg';
  if (shapeId.startsWith('short-3')) return 'Short';
  if (shapeId.startsWith('long-3')) return 'Long';
  if (shapeId.startsWith('long-')) return 'Long';
  if (shapeId.startsWith('three-shot')) return '3-shot';
  if (shapeId.startsWith('reachable')) return 'Reachable';
  return '';
}

function mapTopInfo(v: ReturnType<typeof shotView>, opts: { shotNo: number; distLabel: string }): string {
  const play = state.play!;
  const len = Math.round(dist(play.hole.tee, play.hole.green));
  // Only the decision-relevant warning survives onto the play HUD (the full conditions list lives on
  // the zone splash): the void's armed lost-rough, which turns an offline miss into a lost ball.
  const lostRough = lieInfo(roughLieOf(play.hole)).penalty ? ' · <span style="color:var(--gs-warn);">🕳 lost rough</span>' : '';
  const boss = currentBoss(state.run);
  // Team duel (GS-team-duel): when YOU carry the partner, show them + the format on the HUD.
  const duel = isTeamDuelBoss(boss) ? teamDuel() : undefined;
  let scrambleLine = '';
  if (duel && duel.partnerSide === 'player') {
    const partner = teamPartnerChar(duel);
    if (partner) {
      const tail =
        duel.format === 'scramble'
          ? play.partnerKept
            ? ' · kept ✓'
            : play.shots.length
            ? ' · yours held'
            : ''
          : ' · reveal at the flag'; // best-ball: their parallel ball stays hidden until the hole ends
      scrambleLine = `<div class="gs-sub" style="color:${partner.style.cap};">🤝 <b>${partner.name}</b> · ${teamFormatLabel(duel.format)}${tail}</div>`;
    }
  }
  return `
    <div class="gs-hud gs-hud-top gs-glass">
      <div class="gs-stats">
        <span>⛳ <b>${play.holeIndex + 1}/${state.course.holes.length}</b></span>
        <span>Par <b>${play.hole.par}</b>·${len}y</span>
        ${shapeLabel(play.hole.shapeId) ? `<span style="color:var(--gs-info);">${shapeLabel(play.hole.shapeId)}</span>` : ''}
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
    // Full-bleed: the live shot canvas IS the screen. The play view draws the active caddy ITSELF in
    // the bottom-LEFT corner during flight — a guard caddy persistently (so its laser/boomerang
    // redirect originates from the figure), and any other hired caddy transiently while its effect
    // calls out. The framed GOLD badge ALSO floats bottom-RIGHT here (`gs-hud-watchcaddy`, clear of
    // that bottom-left corner figure + the top-left info chip) so the "premium hire" border reads the
    // whole shot, matching the aim-and-charge + putting screens. The badge is a portrait; the corner
    // figure is what the effects fire from.
    return `
      <div class="gs-shot gs-shot--full">
        <div class="gs-bigmap" id="play"></div>
        ${mapTopInfo(v, { shotNo: play.strokes, distLabel: '…watching…' })}
        <div class="gs-hud gs-hud-watchcaddy">${caddyBadgeHTML(caddyId())}</div>
      </div>`;
  }

  if (play.done) {
    const birdieOrBetter = !play.pickedUp && play.strokes <= par - 1;
    // The end-of-hole screen IS the leaderboard screen now: include the hole just finished (it isn't in
    // stopPlayed until `holeComplete`) and show the live arc standings so you track progress every hole.
    // On a matchplay boss stop the duel HUD is the relevant tracker, so the board is replaced by it.
    const raw = holeResult(play);
    // Team duel BEST-BALL (GS-team-duel), player's side: the partner's parallel ball resolved the
    // moment the hole finished (`withBestBallPartner`) — THIS screen is its reveal. Everything scored
    // below (duel, points, banner) uses the KEPT team ball, exactly what `holeComplete` will record.
    const tSetup = state.match?.setup;
    const partnerHole =
      tSetup?.partnerSide === 'player' && tSetup.format === 'bestball'
        ? state.match?.partnerHoles?.[play.holeIndex]
        : undefined;
    const kept = partnerHole ? betterPlayedHole(raw, partnerHole) : raw;
    const name = kept.pickedUp ? 'Picked up' : scoreName(par, kept.record.strokes);
    const playedSoFar = [...(state.stopPlayed ?? []), kept];
    const lastIsHoled = kept.holed && kept.shots.some((s) => s.holed);
    const stopPts = playTotals(playedSoFar.map((p) => p.record)).stableford;
    // The two big shot/putt vignette cards used to push the score + leaderboard off the bottom of the
    // screen — the actual point of the screen. They're scrapped for a compact banner that headlines the
    // ONLY numbers that matter here: this hole's score and the running points total, with the leaderboard
    // prominent right below it.
    const holePts = stablefordPoints(par, kept.record.strokes);
    const d = kept.pickedUp ? 99 : kept.record.strokes - par;
    const scoreCol = d < 0 ? '#5fd45a' : d === 0 ? 'var(--gs-ink)' : d === 1 ? '#ffce54' : '#ff6b6b';
    const isAce = play.holed && play.strokes === 1;
    // After the celebration overlay lifts, the end-of-hole screen confirms the ace reward in place.
    const aceNote = isAce
      ? `<div style="margin:0 0 -2px;max-width:460px;background:linear-gradient(180deg,#1c1708,#120f06);border:1px solid rgba(255,213,74,.4);border-radius:12px;padding:9px 14px;font-size:12.5px;color:var(--gs-gold);">⛳ <b>Hole-in-one!</b> +${ACE_CREDIT_BONUS} credits · Ace's Touch (+8% precision) earned for the run.</div>`
      : '';
    const scoreBanner = `
      <div style="display:flex;align-items:center;gap:14px;background:#0d1016;border:1px solid var(--gs-line);border-radius:12px;padding:12px 16px;max-width:460px;">
        <div style="text-align:center;min-width:48px;">
          <div style="font-size:34px;font-weight:800;line-height:1;color:${scoreCol};">${kept.pickedUp ? '—' : kept.record.strokes}</div>
          <div style="font-size:10px;opacity:.55;letter-spacing:.08em;margin-top:3px;">PAR ${par}</div>
        </div>
        <div style="flex:1 1 auto;min-width:0;">
          <div style="font-size:10.5px;opacity:.5;letter-spacing:.1em;">HOLE ${play.holeIndex + 1}${partnerHole ? ' · TEAM BALL' : ''}</div>
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
      ${partnerHole ? `<div style="margin:0 0 12px;">${bestBallRevealHTML(raw, partnerHole, par)}</div>` : ''}
      ${scoreBanner}
      <div style="margin:12px 0;max-width:460px;">${progress}</div>
      <div style="margin-top:8px;">${btn('Continue →', { type: 'holeComplete' }, { variant: 'primary' })}</div>`;
  }

  // Detect a NEW shot ONCE per shot, BEFORE the fringe-putt early-return below — so the per-shot
  // defaults (club/aim/power and the putt-vs-chip choice) AND `decisionShotCount` are committed even
  // when the putt screen is the first thing that renders for this shot. (Bug: landing near the green
  // defaults `selPutt` to the putter, so the putt screen returned early and never advanced
  // `decisionShotCount`; tapping "Chip instead" then re-tripped `newShot`, which snapped `selPutt`
  // straight back to the putter and re-disabled the chip gesture — you had to toggle putt→chip twice.)
  const newShot = play.shots.length !== decisionShotCount;
  if (newShot) {
    decisionShotCount = play.shots.length;
    selClubId = null;
    selAim = 'attack';
    selFreeTarget = null;
    selPower = 1; // seeded sensibly below once the club is known; full swing is the fallback
    selAimBearing = null; // re-seed the aim to the pin for the new shot
    selPutt = canPuttFringe(play); // just off the green → default to the putter (a Texas wedge)
    resetMapView();
  }

  // Manual putting — on the green, or a chosen fringe/apron "Texas wedge" (GS-fringe-putt): stroke
  // putts one at a time with the pace meter, instead of the awkward full-swing chip the apron forced.
  const fringePutt = canPuttFringe(play) && selPutt;
  if (awaitingPutt(play) || fringePutt) {
    // Frame the putt on the ball→cup line: centre the view on the MIDPOINT of the two and size it
    // to the putt length, so the cup and ball both sit on-screen with even margin — not the ball
    // dead-centre with the green (and a lot of dead rough) shoved to one edge.
    const puttPin = pinOf(play.hole);
    const puttMid: [number, number] = [
      (play.ball[0] + puttPin[0]) / 2,
      (play.ball[1] + puttPin[1]) / 2,
    ];
    // Putt BREAK (GS-greens-3): the slope curls the putt; the player aims HIGH to read it. A
    // green-reading caddy (Mystic Mole) snaps the aim to the ideal line for you; otherwise it starts
    // straight and you nudge ◄/► to find the read. The drawn dotted curve uses the SAME break model
    // as the resolver, so the line you see is the line the ball takes.
    // Reset the aim for each NEW putt (a fresh break to read), preserved across aim-nudge re-renders.
    const puttKey = `${play.holeIndex}:${play.putts}`;
    if (puttKey !== lastPuttKey) {
      selPuttAim = null;
      lastPuttKey = puttKey;
    }
    const slope = play.hole.greenSlope;
    const ideal = idealPuttAim(play.ball, puttPin, slope);
    const reads = !!state.run.loadout.greenRead;
    if (selPuttAim === null) selPuttAim = reads ? ideal : 0;
    const puttAim = reads ? ideal : selPuttAim;
    puttAimResolved = puttAim; // read by the commit handler so the struck aim matches the drawn line
    const breakYd = puttBreakYd(play.ball, puttPin, slope, MANUAL_IDEAL_PACE);
    const puttPath = puttPathPreview(play.ball, puttPin, slope, puttAim, MANUAL_IDEAL_PACE);
    const puttSvg = renderHoleSVG(play.hole, {
      // No flight tracers here (GS-tracer bug fix): on the tight green-zoom the prior shots' curved
      // Bézier flight lines projected across the tiny view, smearing tracer arcs "all over the green".
      // The putt screen is the ball↔cup line — the approach tracers belong to the whole-hole decision view.
      biome: holeBiome(play.hole), themeId: holeThemeId(play.hole),
      rainbow: rainbowActive(),
      tradeTents: tentsActive(),
      meteorScorch: scorchActive(),
      groundPatch: patchActive(),
      width: DMAP_W,
      height: DMAP_H,
      ball: play.ball,
      // Zoom in on the ball↔cup span (midpoint-centred) so both ends frame with even margin.
      focus: puttMid,
      viewRadius: Math.max(9, v.distToPin * 0.62),
      focusBias: 0.5,
      // Cup up-screen, ball below — the putt reads bottom-to-top (matches the pace meter).
      up: [puttPin[0] - play.ball[0], puttPin[1] - play.ball[1]],
      puttPath,
    });
    // Manual putt = a pace meter: stop the sweeping marker in the green MAKE band to sink it.
    // Tapping the meter OR the Putt button captures the pace. Full-bleed: the map fills the screen,
    // the meter + Putt float in a bottom panel.
    return `
      <div class="gs-shot gs-shot--full">
        <div class="gs-bigmap" data-weather="putt">${puttSvg}</div>
        ${mapTopInfo(v, { shotNo: play.strokes + play.putts + 1, distLabel: `<b>${v.distToPin}</b>y · putt <b>${play.putts + 1}</b>` })}
        <div class="gs-hud gs-hud-bottom">
          ${caddyBadgeHTML(puttCaddyId())}
          <div class="gs-hud-controls gs-glass">
            <p style="font-size:11px;opacity:.7;margin:0;line-height:1.35;">${fringePutt ? 'Putting from the fringe — ' : ''}Read the <b>break</b>, aim, then tap the meter in the green <b>MAKE</b> band.</p>
            ${puttAimRow(breakYd, puttAim, reads)}
            <div id="puttmeter"></div>
            <button class="gs-btn gs-btn--primary" data-putt-commit="1" style="margin:0;padding:11px;">⛳ Putt</button>
            ${fringePutt ? `<button class="gs-btn gs-btn--ghost" data-putt-toggle="0" style="margin:6px 0 0;padding:9px;">⛳→🏌 Chip instead</button>` : ''}
          </div>
        </div>
      </div>`;
  }

  // Decision screen: map with shots so far + ball marker, the aiming spray cone, and controls.
  // (The per-shot club/aim/power/putt defaults are seeded above, before the fringe-putt return.)
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
  // Seed the at-rest preview POWER on a NEW shot so the default cone lands AT the target rather than
  // always flying a full swing (bug fix): for a short chip the shortest club at full power overshoots
  // the green entirely, so the green/amber/red arc read "nowhere near where the ball lands". Scaling
  // the at-rest power to (distance-to-pin ÷ the club's full expected carry) puts the cone on the pin;
  // a normal approach (target past the club's reach) clamps the ratio to 1 — a full swing, as before.
  // The player still pulls to override; the gesture charges from 0 on press regardless.
  if (newShot && selClubId !== 'putter' && !selPutt) {
    const full = previewShot(play, { clubId: selClubId, aim: selAim, power: 1 }, state.run.loadout);
    if (full.expectedCarry > 1) {
      const want = dist(play.ball, pinOf(play.hole));
      selPower = Math.max(0.25, Math.min(1, want / full.expectedCarry));
    }
  }
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
  // Frame the map on the FULL-power PIN-AIM shot — NOT the live charge, and NOT the live drag
  // target either: carryHigh folds in the wind component ALONG the shot bearing, so framing on the
  // dragged target made viewRadius wobble with every pixel of aim slide. A sub-pixel projector
  // change re-projects the whole seeded scene (the decor-jitter-while-pulling bug); the camera
  // must hold perfectly still for the entire decision. Both the render and the gesture build the
  // projector from this same stable spread (projector-sync).
  const frameSpray = previewShot(play, { clubId: selClubId, aim: selAim, power: 1 }, state.run.loadout);
  const mapOpts = decisionView(play, frameSpray);
  // Remember the follow-cam radius the player is LOOKING AT — the shot animation starts at this
  // exact zoom so releasing the gesture never skip-jumps to a different framing (GS-power).
  decisionRadius = mapOpts.viewRadius ?? null;
  const svg = renderHoleSVG(play.hole, {
    shots: play.shots,
    shotColor: golferLook()?.cap, // GS-tracer: the player's shot tracer reads the chosen golfer's colour.
    // On a matchplay boss stop, overlay the boss's pre-played line for THIS hole so you see them on the
    // course (where they drove it, where they ended up) — feedback on their ball, not just a number.
    // Best-ball (GS-team-duel) hides it: the hole result is revealed at the end-of-hole cards, and the
    // boss's drawn path would spoil their score mid-hole.
    ghostShots:
      state.match && state.match.setup?.format !== 'bestball'
        ? state.match.bossHoles[play.holeIndex]?.shots
        : undefined,
    biome: holeBiome(play.hole), themeId: holeThemeId(play.hole),
    rainbow: rainbowActive(),
    tradeTents: tentsActive(),
    meteorScorch: scorchActive(),
      groundPatch: patchActive(),
    ball: play.ball,
    spray,
    fitSpray: frameSpray, // whole-map fit holds still while the live cone charges/aims
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
      ${canPuttFringe(play) ? `<button class="gs-btn gs-mini" data-putt-toggle="1" title="Putt from the fringe">⛳</button>` : ''}
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
      <div class="gs-bigmap" data-map="1" data-weather="decision">${svg}</div>
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
    ${state.scrambleChoice ? scrambleChoiceOverlay() : awaitingShotPopup ? shotPopupOverlay() : ''}`;
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

/**
 * The interactive SCRAMBLE ball-choice screen (GS-team-duel): both balls just hit from the same spot
 * are shown — on an inline map (player line + partner line) and as two info cards with lie + distance
 * to the pin — and the player CONFIRMS which to play on from. A real scramble decision: take the safe
 * one in the fairway, or the aggressive one nearer the pin.
 */
function scrambleChoiceOverlay(): string {
  const sc = state.scrambleChoice!;
  const duel = teamDuel();
  const partner = duel ? teamPartnerChar(duel) : undefined;
  const hole = sc.base.hole;
  // Both balls from the SAME spot: the player's line solid, the partner's muted (ghost) beneath.
  const map = renderHoleSVG(hole, {
    width: 320,
    height: 240,
    biome: holeBiome(hole),
    themeId: holeThemeId(hole),
    rainbow: rainbowActive(),
    tradeTents: tentsActive(),
    meteorScorch: scorchActive(),
      groundPatch: patchActive(),
    shots: [sc.player.log],
    ghostShots: [sc.partner.log],
  });
  const option = (label: string, ex: typeof sc.player, dist: number, pick: 'player' | 'partner', accent: string): string => `
    <div style="flex:1 1 150px;min-width:148px;display:flex;flex-direction:column;gap:7px;">
      <div style="font-size:12px;font-weight:800;color:${accent};text-align:center;">${label}</div>
      ${shotCardHTML(ex.log, { distToPin: ex.holed ? undefined : dist })}
      <button class="gs-btn gs-btn--primary gs-btn--block"
        data-action='${JSON.stringify({ type: 'chooseScrambleBall', pick })}'
        style="text-align:center;font-size:14px;padding:11px;">${ex.holed ? '🏁 Holed — take it' : 'Play this →'}</button>
    </div>`;
  return `
    <div style="position:fixed;inset:0;background:rgba(5,7,11,0.82);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px;overflow:auto;">
      <div style="display:flex;flex-direction:column;gap:11px;max-width:360px;width:100%;">
        <div style="text-align:center;">
          <div style="font-size:13px;font-weight:800;letter-spacing:.08em;color:#ffce54;">🤝 SCRAMBLE — CHOOSE YOUR BALL</div>
          <div style="font-size:11.5px;opacity:.75;margin-top:2px;">You and ${partner?.name ?? 'your partner'} both hit — play on from the better lie.</div>
        </div>
        <div style="border-radius:10px;overflow:hidden;border:1px solid var(--gs-line-2);line-height:0;align-self:center;">${map}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${option('Your ball', sc.player, sc.playerDistToPin, 'player', '#5fd45a')}
          ${option(`${partner?.name ?? 'Partner'}'s ball`, sc.partner, sc.partnerDistToPin, 'partner', partner?.style.cap ?? '#7aa2ff')}
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

// A short headline for a club chip — the bag ids ('D','5W','PW','60') already read well; only the
// long-form ids need a friendly cap.
function shortClubLabel(id: string): string {
  if (id === 'putter') return 'Putt';
  if (id === 'chip') return 'Chip';
  return id;
}

// The player's FULL bag inventory on the shop screen (GS-clubs-2): every club you carry shown with its
// rarity, plus every reward-club SLOT you don't yet carry greyed out — so you can see at a glance what
// is in the bag, what a shop club would replace, and which gaps a new club would fill. Pure render off
// the live loadout (no hook, no save state).
function bagInventoryHTML(): string {
  const loadout = state.run.loadout;
  const bag = loadout.bag;
  // Universe of club TYPES: everything you carry, plus every rewardable slot (so empty slots read as
  // greyed gaps). Larry never sees hybrids, so don't show empty hybrid slots he could never fill.
  const types = new Set<string>(bag.map((c) => c.id));
  for (const t of REWARD_CLUB_TYPES) {
    if (loadout.noHybrids && isHybridType(t)) continue;
    types.add(t);
  }
  // Club types for sale this stop, so an owned-or-empty slot can flag "available now".
  const offered = new Set<string>(
    (state.shopOffer ?? []).map((id) => shopItem(id)?.clubType).filter((t): t is string => !!t),
  );
  const carryOf = (t: string) => bag.find((c) => c.id === t)?.carry ?? clubById(t, CLUBS)?.carry ?? 0;
  const chips = [...types]
    .sort((a, b) => carryOf(b) - carryOf(a))
    .map((t) => {
      const owned = bag.find((c) => c.id === t);
      const base = clubById(t, CLUBS);
      const name = owned?.name ?? base?.name ?? t;
      const carry = carryOf(t);
      const rarity = owned?.rarity ?? 'common';
      const col = owned ? rarCol(rarity) : '#5a6172';
      const inShop = offered.has(t);
      // Owned tier label: a reward club shows its rarity, a starting club reads "stock"; an empty slot reads "empty".
      const tierLabel = owned ? (owned.set && owned.set !== 'starter' ? rarity : 'stock') : 'empty';
      return `<div title="${name} · ~${carry} yd${owned ? ` · ${rarity}` : ' · not in bag'}"
        style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;min-width:50px;
        padding:5px 7px;border:1.5px solid ${owned ? col : col + '66'};border-radius:9px;
        background:${owned ? col + '14' : '#ffffff05'};opacity:${owned ? 1 : 0.5};">
        <span style="font-size:12.5px;font-weight:800;letter-spacing:.02em;">${shortClubLabel(t)}</span>
        <span style="font-size:9.5px;opacity:.75;">${carry} yd</span>
        <span style="font-size:8px;text-transform:uppercase;letter-spacing:.06em;color:${col};">${inShop ? '🛒 ' : ''}${tierLabel}</span>
      </div>`;
    })
    .join('');
  // --- The gear/accessories line (GS-proshop-3): every non-club item you own — glove, ball, shoe,
  // shaft, putter, caddy, relic — sits ABOVE the clubs. Tap one to pop its card so you can compare it
  // with what's on sale. Owned ids, de-duped, in purchase order.
  const gearIds = [...new Set(loadout.perks)].filter((id) => {
    const it = shopItem(id);
    return !!it && !it.clubType; // clubs live in the row below
  });
  const gearChips = gearIds
    .map((id) => {
      const it = shopItem(id)!;
      const owned = ownedCount(state.run.loadout.perks, id);
      const col = rarCol(it.rarity);
      const sel = inspectGearId === id;
      const setTheme = it.clubSet ? clubSetById(it.clubSet)?.theme : undefined;
      const count = owned > 1 ? `<span style="font-size:9px;opacity:.8;">×${owned}</span>` : '';
      return `<div data-inspect="${id}" title="${it.name} — tap to compare"
        style="cursor:pointer;display:inline-flex;flex-direction:column;align-items:center;gap:2px;width:54px;
        padding:4px;border:1.5px solid ${sel ? col : col + '88'};border-radius:9px;background:${sel ? col + '22' : col + '10'};
        ${sel ? `box-shadow:0 0 8px ${col}66;` : ''}">
        <div style="width:100%;border-radius:6px;overflow:hidden;pointer-events:none;">${itemArtSVG(id, it.rarity, setTheme)}</div>
        <span style="font-size:8.5px;text-align:center;line-height:1.05;max-height:2.1em;overflow:hidden;">${it.name}</span>${count}
      </div>`;
    })
    .join('');
  const gearRow = gearIds.length
    ? `<div style="font-size:11px;font-weight:700;opacity:.8;margin:0 0 5px;">🧤 Your gear — tap to compare</div>
       <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px;">${gearChips}</div>`
    : '';
  // The inline inspect card for the tapped gear item (full card, for side-by-side comparison).
  let inspectCard = '';
  if (inspectGearId) {
    const it = shopItem(inspectGearId);
    if (it && gearIds.includes(inspectGearId)) {
      const owned = ownedCount(state.run.loadout.perks, inspectGearId);
      const setTheme = it.clubSet ? clubSetById(it.clubSet)?.theme : undefined;
      const card = itemCardHTML(
        { ...it, cost: itemCost(it, owned) },
        { owned: owned >= itemCap(it), count: owned, artSVG: itemArtSVG(it.id, it.rarity, setTheme) },
      );
      inspectCard = `<div style="display:flex;justify-content:center;margin:2px 0 9px;">${card}</div>`;
    }
  }
  return `
    <div style="margin:.2em 0 .9em;padding:9px 11px;border:1px solid var(--gs-line-2);border-radius:10px;background:#ffffff05;">
      ${gearRow}
      ${inspectCard}
      ${(() => {
        // A blinged golf-bag thumbnail beside the header once the default bag is upgraded (GS-bag-tiers).
        const bt = loadout.bagTier ?? 'common';
        const bs = bagSet(bt);
        const art = bt !== 'common' && bs ? `<div style="width:48px;flex:0 0 auto;border-radius:7px;overflow:hidden;">${drawGolfBag(bs.tint, bt)}</div>` : '';
        const label = bs ? `🎒 ${bs.name} — your bag` : '🎒 Your bag — equipped clubs &amp; empty slots';
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">${art}<div style="font-size:12px;font-weight:700;opacity:.85;">${label}</div></div>`;
      })()}
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${chips}</div>
      <div style="font-size:10px;opacity:.55;margin-top:7px;">Coloured = equipped (border shows rarity). Greyed = an empty slot a reward club could fill. 🛒 = on sale in this shop.</div>
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
      if (note.putt) return { text: '▲ UPGRADE · putt', tone: 'up' };
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
    const setTheme = it.clubSet ? clubSetById(it.clubSet)?.theme : undefined;
    const artSVG = itemArtSVG(it.id, it.rarity, setTheme);
    const card = itemCardHTML({ ...it, cost }, { owned: maxed, affordable: afford, count: owned, badge: clubBadge(it), artSVG });
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
    </div>
    ${bagInventoryHTML()}`;
}

/** A ship card (GS-garage) — the vector ship over a rarity-ringed panel, with name/set + a footer
 *  (cost in the market, or a SELECT / SELECTED state in the garage). Clickable when `action` given. */
function shipCardHTML(ship: Ship, footer: string, opts: { action?: Action; ring: string; dim?: boolean; glow?: boolean } = { ring: '#8aa0c0' }): string {
  const inner = `
    <div style="border:2px solid ${opts.ring};border-radius:12px;padding:8px 6px 6px;background:radial-gradient(circle at 50% 28%, ${opts.ring}22, #0b0d12);text-align:center;width:130px;${opts.dim ? 'opacity:.55;' : ''}${opts.glow ? `box-shadow:0 0 0 2px ${opts.ring}, 0 0 14px ${opts.ring}66;` : ''}">
      ${shipCardSVG(ship.id, 116, 60)}
      <div style="font-size:12.5px;font-weight:700;margin-top:2px;">${ship.name}</div>
      <div style="font-size:10px;opacity:.55;">${ship.set} · ${ship.rarity}</div>
      <div style="font-size:11px;margin-top:3px;color:${opts.ring};font-weight:700;">${footer}</div>
    </div>`;
  return opts.action
    ? `<div class="gs-clickcard" data-action='${JSON.stringify(opts.action)}' style="cursor:pointer;margin:5px;">${inner}</div>`
    : `<div style="margin:5px;">${inner}</div>`;
}

/** One collapsible Trade-Market section (GS-market-accordion): a tap-to-toggle header (icon · title ·
 *  owned/total count · chevron) over a card rack, so the long catalogue stays navigable as it grows.
 *  Collapse state is module-local (`collapsedMarketSections`) + re-rendered — same view-only pattern as
 *  `inspectGearId` (native <details> can't be used: render() replaces app.innerHTML on every buy, which
 *  would reset the open state). Sections start collapsed on open (see collapsedMarketSections). Every
 *  section shares this chrome so the catalogue reads consistently. */
function marketSection(
  id: string,
  icon: string,
  title: string,
  owned: number,
  total: number,
  blurb: string,
  rack: string,
): string {
  const collapsed = collapsedMarketSections.has(id);
  return `
    <section class="gs-acc${collapsed ? ' gs-acc--collapsed' : ''}">
      <button class="gs-acc__head" data-toggle-section="${id}" aria-expanded="${collapsed ? 'false' : 'true'}">
        <span class="gs-acc__icon" aria-hidden="true">${icon}</span>
        <span class="gs-acc__title">${title}</span>
        <span class="gs-acc__count">${owned}/${total}</span>
        <span class="gs-acc__chev" aria-hidden="true">▾</span>
      </button>
      <div class="gs-acc__body">
        ${blurb ? `<p class="gs-acc__blurb">${blurb}</p>` : ''}
        <div class="gs-acc__rack">${rack}</div>
      </div>
    </section>`;
}

/** The Trade Market (GS-clubhouse): spend Star Shards on cosmetic ships, clothing, and bag tiers. Buying
 *  grants GLOBAL ownership — you then outfit each golfer individually in the Clubhouse. The full browsable
 *  catalogue is split into uniform collapsible sections (GS-market-accordion) so it stays navigable. */
function tradeMarketScreen(): string {
  const ships = shipCatalogue();
  // Owned rides sink to the bottom of the rack (greyed out) so the buyable fleet reads first (stable
  // sort keeps rarity order within each group).
  const shipCards = ships
    .slice()
    .sort((a, b) => Number(state.ownedShips.includes(a.id)) - Number(state.ownedShips.includes(b.id)))
    .map((ship) => {
      const ring = cosmeticRarCol(ship.rarity);
      const owned = state.ownedShips.includes(ship.id);
      const afford = canBuyShip(ship, state.shards, state.ownedShips);
      let footer: string;
      let action: Action | undefined;
      if (owned) {
        footer = '✓ owned';
      } else if (afford) {
        footer = `✦ ${ship.cost}`;
        action = { type: 'buyShip', id: ship.id };
      } else {
        footer = `✦ ${ship.cost} — short`;
      }
      return shipCardHTML(ship, footer, { ring, dim: owned || !afford, glow: isMythic(ship.rarity) && !owned, action });
    })
    .join('');
  const shipsOwned = ships.filter((s) => state.ownedShips.includes(s.id)).length;

  // One uniform collapsible clothing rack per slot (hats / shirts / pants), each with its owned tally.
  const apparelSection = (slot: ApparelSlot, icon: string, title: string, blurb: string) => {
    const items = apparelForSlot(slot);
    const owned = items.filter((a) => state.ownedApparel.includes(a.id)).length;
    // Owned garments sink to the bottom (greyed) so the buyable rack reads first; stable sort keeps
    // rarity order within each group.
    const rack = items
      .slice()
      .sort((a, b) => Number(state.ownedApparel.includes(a.id)) - Number(state.ownedApparel.includes(b.id)))
      .map(marketApparelCardHTML)
      .join('');
    return marketSection(slot, icon, title, owned, items.length, blurb, rack);
  };

  return `
    <header style="border-left:4px solid #e08a2b;padding-left:10px;">
      <h1 style="margin:0;font-size:22px;">🚀 Trade Market</h1>
      <p style="opacity:.75;font-size:13px;margin:.3em 0;">Spend Star Shards on ships, clothing &amp; bag tiers. Cosmetic only — buy it here, then outfit each golfer in the <b>Clubhouse</b>. Tap a section to fold it away.</p>
    </header>
    <h2 style="font-size:16px;margin:.6em 0 .4em;">✦ ${state.shards} Star Shards</h2>
    ${marketSection(
      'ships',
      '🚀',
      'Ships',
      shipsOwned,
      ships.length,
      'The full fleet. The rarer the ride, the steeper the shard price — the Mothership is the grail.',
      shipCards,
    )}
    ${apparelSection('hat', '🎩', 'Hats', 'Caps &amp; crowns. Complete a matching set across all three slots for the full look.')}
    ${apparelSection('shirt', '👕', 'Shirts', 'Tops &amp; jackets to suit each golfer.')}
    ${apparelSection('pants', '👖', 'Pants', 'Trousers &amp; legwear to finish the outfit.')}
    ${bagSetSection()}
    <div style="margin-top:14px;text-align:center;">${btn('← Back to title', { type: 'closeMarket' }, { variant: 'ghost' })}</div>`;
}

/** The Clubhouse hall (GS-clubhouse / GS-clubhouse-lounge) — its own screen reached from the title's
 *  Clubhouse doorway. The four golfers loiter in a cosy bar + fireplace lounge wearing their own outfits;
 *  tap any of them to open their garage + wardrobe. They've shuffled to new spots since your last run. */
function clubhouseHallScreen(): string {
  const golfers: LoungeGolfer[] = CHARACTERS.map((ch) => ({
    id: ch.id,
    shortName: ch.shortName,
    capColor: ch.style.cap,
    hatId: hatForCharacter(state, ch.id),
    shirtId: shirtForCharacter(state, ch.id),
    pantsId: pantsForCharacter(state, ch.id),
    skin: ch.style.skin,
    shirtBase: ch.style.shirt,
  }));
  return `
    <header style="border-left:4px solid #d8a24a;padding-left:10px;">
      <h1 style="margin:0;font-size:22px;">🏠 The Clubhouse</h1>
      <p style="opacity:.75;font-size:13px;margin:.3em 0;">Your golfers are unwinding by the fire. Tap one to outfit them — their own ride, their own look head to toe. Buy gear at the <b>Trade Market</b>.</p>
    </header>
    <div style="margin:12px 0;">${clubhouseLoungeHTML(golfers, state.clubhouseVisit)}</div>
    <div style="text-align:center;">${btn('← Back to title', { type: 'closeClubhouseHall' }, { variant: 'ghost' })}</div>`;
}

/** The two big title-screen doorways (GS-nav): the Trade Market on the left, the Clubhouse on the
 *  right, each a fat themed button with its own painted scene behind the label. */
function navTilesHTML(): string {
  return `
    <div class="gs-navtiles">
      <button class="gs-navtile gs-navtile--market" data-action='${JSON.stringify({ type: 'openMarket' })}'>
        <span class="gs-navtile__art" aria-hidden="true">${marketTileArt()}</span>
        <span class="gs-navtile__cap">
          <span class="gs-navtile__title">🚀 Trade Market</span>
          <span class="gs-navtile__sub">Spend ✦ Shards on ships &amp; threads</span>
        </span>
      </button>
      <button class="gs-navtile gs-navtile--clubhouse" data-action='${JSON.stringify({ type: 'openClubhouseHall' })}'>
        <span class="gs-navtile__art" aria-hidden="true">${clubhouseTileArt()}</span>
        <span class="gs-navtile__cap">
          <span class="gs-navtile__title">🏠 Clubhouse</span>
          <span class="gs-navtile__sub">Outfit each of your golfers</span>
        </span>
      </button>
    </div>`;
}

/** Painted backdrop for the Trade Market tile: a cosmic bazaar — nebula sky, scattered stars, a couple
 *  of planets and a little rocket making a delivery. Hand-placed (no rng) so it stays byte-stable. */
function marketTileArt(): string {
  const stars = [
    [14, 18], [34, 40], [58, 22], [86, 52], [110, 30], [140, 16], [168, 46],
    [196, 26], [220, 58], [248, 20], [272, 44], [40, 70], [128, 64], [210, 12],
  ]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${1 + (i % 3) * 0.5}" fill="#ffffff" opacity="${0.45 + (i % 4) * 0.12}"/>`)
    .join('');
  return `<svg viewBox="0 0 300 120" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
    <defs>
      <radialGradient id="ntMkt" cx="32%" cy="30%" r="90%">
        <stop offset="0%" stop-color="#3a2350"/><stop offset="55%" stop-color="#1d1538"/><stop offset="100%" stop-color="#0c0a1c"/>
      </radialGradient>
    </defs>
    <rect width="300" height="120" fill="url(#ntMkt)"/>
    ${stars}
    <circle cx="232" cy="86" r="30" fill="#e08a2b" opacity="0.85"/>
    <circle cx="222" cy="78" r="30" fill="#f0b15e" opacity="0.6"/>
    <circle cx="60" cy="98" r="16" fill="#7a6bd8" opacity="0.8"/>
    <g transform="translate(120,52) rotate(20)">
      <path d="M0,-13 C7,-9 7,9 0,15 C-7,9 -7,-9 0,-13 Z" fill="#dfe6f2"/>
      <circle cx="0" cy="-2" r="3.4" fill="#9fd8e6"/>
      <path d="M-6,8 L-12,16 L-3,12 Z" fill="#ff6b6b"/>
      <path d="M6,8 L12,16 L3,12 Z" fill="#ff6b6b"/>
      <path d="M-2.6,15 L0,25 L2.6,15 Z" fill="#ffc454" opacity="0.9"/>
    </g>
  </svg>`;
}

/** Painted backdrop for the Clubhouse tile: a cosy clubhouse on the green under a dusk sky — building,
 *  lit windows, a pin flag on a rolling hill. Hand-placed (no rng) so it stays byte-stable. */
function clubhouseTileArt(): string {
  return `<svg viewBox="0 0 300 120" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
    <defs>
      <linearGradient id="ntSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#23304a"/><stop offset="60%" stop-color="#3a4d55"/><stop offset="100%" stop-color="#5a6e3a"/>
      </linearGradient>
      <linearGradient id="ntGrass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#5fb04a"/><stop offset="100%" stop-color="#2f7a33"/>
      </linearGradient>
    </defs>
    <rect width="300" height="120" fill="url(#ntSky)"/>
    <circle cx="248" cy="30" r="14" fill="#ffe6a6" opacity="0.85"/>
    <path d="M0,84 Q90,58 170,74 T300,70 V120 H0 Z" fill="url(#ntGrass)"/>
    <path d="M0,98 Q120,82 220,94 T300,92 V120 H0 Z" fill="#256a2a" opacity="0.7"/>
    <g transform="translate(58,52)">
      <rect x="0" y="14" width="78" height="40" fill="#6e4a2c"/>
      <rect x="0" y="14" width="78" height="40" fill="#00000022"/>
      <path d="M-8,16 L39,-8 L86,16 Z" fill="#8a3b2e"/>
      <rect x="33" y="34" width="16" height="20" fill="#3a2716"/>
      <rect x="10" y="24" width="13" height="11" fill="#ffd76b"/>
      <rect x="55" y="24" width="13" height="11" fill="#ffd76b"/>
    </g>
    <g transform="translate(214,40)">
      <rect x="0" y="0" width="2.5" height="44" fill="#d8d8d8"/>
      <path d="M2.5,0 L24,7 L2.5,14 Z" fill="#ff6b6b"/>
      <circle cx="1.2" cy="44" r="3.2" fill="#f4f4f4"/>
    </g>
  </svg>`;
}

/** A hangar-bay backdrop for the Clubhouse garage tile (GS-clubhouse-stage): a launch pad under an open
 *  star-bay, pillars + neon strips tinted by the parked ship's rarity, with the ship itself sat on the
 *  glowing pad. Deterministic (fixed star spots — the render layer bans Math.random). */
function clubhouseGarageArt(shipId: string | undefined, accent: string): string {
  const stars = [
    [58, 20], [92, 12], [130, 26], [168, 15], [206, 24], [240, 18],
    [74, 34], [150, 8], [190, 36], [116, 40],
  ]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 === 0 ? 1.4 : 0.9}" fill="#eaf2ff" opacity="${i % 2 ? 0.7 : 0.95}"/>`)
    .join('');
  const chevron = (y: number, o: number) =>
    `<path d="M132,${y} L150,${y + 6} L168,${y} L168,${y + 3} L150,${y + 9} L132,${y + 3} Z" fill="${accent}" opacity="${o}"/>`;
  return `<svg viewBox="0 0 300 130" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
    <defs>
      <linearGradient id="ghSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#080c1a"/><stop offset="100%" stop-color="#141d36"/></linearGradient>
      <radialGradient id="ghGlow" cx="50%" cy="88%" r="62%"><stop offset="0%" stop-color="${accent}" stop-opacity="0.4"/><stop offset="100%" stop-color="${accent}" stop-opacity="0"/></radialGradient>
      <linearGradient id="ghFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#28324f"/><stop offset="100%" stop-color="#0b0f1d"/></linearGradient>
    </defs>
    <rect width="300" height="130" fill="url(#ghSky)"/>
    ${stars}
    <path d="M34,4 Q150,-16 266,4 L266,60 L34,60 Z" fill="#0a0f22" opacity="0.55"/>
    <rect x="0" y="84" width="300" height="46" fill="url(#ghFloor)"/>
    <ellipse cx="150" cy="106" rx="104" ry="19" fill="url(#ghGlow)"/>
    <ellipse cx="150" cy="106" rx="74" ry="12.5" fill="none" stroke="${accent}" stroke-width="1.4" opacity="0.75" stroke-dasharray="6 6"/>
    ${chevron(112, 0.8)}${chevron(118, 0.4)}
    <rect x="14" y="4" width="11" height="118" fill="#18223c"/>
    <rect x="275" y="4" width="11" height="118" fill="#18223c"/>
    <rect x="25" y="10" width="3.4" height="104" rx="1.7" fill="${accent}" opacity="0.55"/>
    <rect x="271.6" y="10" width="3.4" height="104" rx="1.7" fill="${accent}" opacity="0.55"/>
    ${shipSVG(shipId, 150, 80, 2.2)}
  </svg>`;
}

/** The open slot-picker below the character stage (GS-clubhouse-stage): when a body part or the garage is
 *  tapped, this reveals just that slot's owned rack (equip toggles / owned fleet). null = a resting hint. */
function clubhousePicker(
  ch: Character,
  hatId: string | undefined,
  shirtId: string | undefined,
  pantsId: string | undefined,
  shipId: string | undefined,
): string {
  if (!clubhouseSlot) {
    return `<p class="gs-clubhint">Tap ${ch.shortName}'s hat, shirt, pants — or the garage — to change it.</p>`;
  }
  const meta: Record<ClubSlot, { icon: string; title: string }> = {
    hat: { icon: '🎩', title: `Hats for ${ch.shortName}` },
    shirt: { icon: '👕', title: `Shirts for ${ch.shortName}` },
    pants: { icon: '👖', title: `Pants for ${ch.shortName}` },
    ship: { icon: '🛸', title: `${ch.shortName}'s garage` },
  };
  const m = meta[clubhouseSlot];
  let body: string;
  if (clubhouseSlot === 'ship') {
    body = `<div class="gs-cpick__rack">${shipCatalogue()
      .filter((s) => state.ownedShips.includes(s.id))
      .map((ship) => {
        const flying = ship.id === shipId;
        return shipCardHTML(ship, flying ? '✓ FLYING' : 'Fly this', {
          ring: flying ? '#ffce54' : cosmeticRarCol(ship.rarity),
          glow: flying,
          action: flying ? undefined : { type: 'selectShip', id: ship.id },
        });
      })
      .join('')}</div>`;
  } else {
    const owned = apparelForSlot(clubhouseSlot).filter((a) => state.ownedApparel.includes(a.id));
    body = owned.length
      ? `<div class="gs-cpick__rack">${owned.map((a) => clubhouseApparelCardHTML(a, hatId, shirtId, pantsId)).join('')}</div>`
      : `<div class="gs-cpick__empty">No ${clubhouseSlot}s owned yet.<br>${btn('🚀 Buy some at the Trade Market', { type: 'openMarket' }, { variant: 'ghost' })}</div>`;
  }
  return `
    <section class="gs-cpick">
      <div class="gs-cpick__head">
        <span aria-hidden="true">${m.icon}</span>
        <span class="gs-cpick__title">${m.title}</span>
        <button class="gs-cpick__done" data-clubslot="${clubhouseSlot}">Done ✕</button>
      </div>
      ${body}
    </section>`;
}

/** One character's Clubhouse (GS-clubhouse / GS-clubhouse-stage): a big full-body avatar you outfit by
 *  TAPPING the body part you want to change (hat / shirt / pants) plus a garage bay below you tap to pick
 *  the ride. Each tap reveals just that slot's owned rack. Outfitting is PER character — nothing shared. */
function clubhouseScreen(): string {
  const ch = getCharacter(state.manageCharacterId);
  if (!ch) return titleScreen(); // safety: no character selected
  const hatId = hatForCharacter(state, ch.id);
  const shirtId = shirtForCharacter(state, ch.id);
  const pantsId = pantsForCharacter(state, ch.id);
  const shipId = shipForCharacter(state, ch.id);
  const preview = golferPreviewSVG(hatId, shirtId, pantsId, {
    skin: ch.style.skin,
    shirtBase: ch.style.shirt,
    w: 150,
    h: 210,
  });
  const setName = equippedSet(hatId, shirtId, pantsId);
  const setBadge = setName
    ? `<div class="gs-clubset">✦ ${setName} set complete!</div>`
    : '';
  const ship = shipCatalogue().find((s) => s.id === shipId);
  const shipAccent = ship ? cosmeticRarCol(ship.rarity) : '#8aa0c0';

  const nameOf = (id: string | undefined, fallback: string) => apparelById(id)?.name ?? fallback;
  // A tap zone over one body part: an invisible band with a floating "current item ✎" chip; the band
  // that owns the open picker glows. Tapping toggles that slot's rack open/closed.
  const zone = (slot: ApparelSlot, icon: string, label: string) => {
    const active = clubhouseSlot === slot ? ' gs-czone--active' : '';
    return `<button class="gs-czone gs-czone--${slot}${active}" data-clubslot="${slot}" aria-label="Change ${ch.shortName}'s ${slot}">
      <span class="gs-czone__chip">${icon} ${label} <span class="gs-czone__pen">✎</span></span>
    </button>`;
  };
  const shipActive = clubhouseSlot === 'ship' ? ' gs-garage--active' : '';

  return `
    <header style="border-left:4px solid ${ch.style.cap};padding-left:10px;">
      <h1 style="margin:0;font-size:22px;">🏠 ${ch.name}'s Clubhouse</h1>
      <p style="opacity:.75;font-size:13px;margin:.3em 0;">Tap ${ch.shortName} to restyle them, tap the garage to pick a ride.</p>
    </header>
    <div class="gs-cstage">
      <div class="gs-cstage__figure">${preview}</div>
      ${zone('hat', '🎩', nameOf(hatId, 'No hat'))}
      ${zone('shirt', '👕', nameOf(shirtId, 'Default shirt'))}
      ${zone('pants', '👖', nameOf(pantsId, 'Default pants'))}
    </div>
    ${setBadge}
    <button class="gs-garage${shipActive}" data-clubslot="ship" aria-label="Change ${ch.shortName}'s ride">
      <span class="gs-garage__art" aria-hidden="true">${clubhouseGarageArt(shipId, shipAccent)}</span>
      <span class="gs-garage__cap">
        <span>
          <span class="gs-garage__name">🛸 ${ship?.name ?? 'Ship'}</span>
          <span class="gs-garage__sub">${ship ? `${ship.set} · ${ship.rarity}` : ''}</span>
        </span>
        <span class="gs-garage__edit">Change ride ✎</span>
      </span>
    </button>
    ${clubhousePicker(ch, hatId, shirtId, pantsId, shipId)}
    <div style="margin-top:14px;text-align:center;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
      ${btn('🏠 Back to Clubhouse', { type: 'clubhouseBackToHall' }, { variant: 'ghost' })}
      ${btn('🚀 Buy more at Trade Market', { type: 'openMarket' }, { variant: 'ghost' })}
      ${btn('← Back to title', { type: 'closeClubhouse' }, { variant: 'ghost' })}
    </div>`;
}

/** A bag-set card (GS-bag-tiers): the blinged golf bag over a rarity panel, with a buy / owned /
 *  equipped / locked footer. Clickable only when it's a buyable, unlocked, affordable upgrade. */
function bagSetCardHTML(set: BagSet): string {
  const ring = rarCol(set.tier);
  const currentRank = bagTierRank(state.bagTier);
  const current = state.bagTier === set.tier;
  const owned = bagTierRank(set.tier) <= currentRank && currentRank > 0;
  const unlocked = bagSetUnlocked(set, state.maxAscension);
  const afford = canBuyBagSet(set, state.bagTier, state.maxAscension, state.shards);
  let footer: string;
  let action: Action | undefined;
  if (current) {
    footer = '✓ EQUIPPED';
  } else if (owned) {
    footer = '✓ owned';
  } else if (!unlocked) {
    footer = `🔒 Clear ${set.gateLabel}`;
  } else if (afford) {
    footer = `✦ ${set.cost}`;
    action = { type: 'buyBagTier', tier: set.tier };
  } else {
    footer = `✦ ${set.cost} — short`;
  }
  // Grey out anything that isn't the buyable frontier: locked gates, owned lower tiers, and
  // can't-affords all dim; only the equipped tier (highlighted) and buyable upgrades stay bright.
  const dim = !current && (!unlocked || owned || !afford);
  const inner = `
    <div title="${set.blurb}" style="border:2px solid ${current ? '#ffce54' : ring};border-radius:12px;padding:8px 6px 6px;background:radial-gradient(circle at 50% 28%, ${ring}22, #0b0d12);text-align:center;width:130px;${dim ? 'opacity:.55;' : ''}${current ? `box-shadow:0 0 0 2px #ffce54, 0 0 14px ${ring}66;` : ''}">
      ${drawGolfBag(set.tint, set.tier)}
      <div style="font-size:12.5px;font-weight:700;margin-top:3px;">${set.name}</div>
      <div style="font-size:10px;opacity:.55;text-transform:capitalize;">${set.tier} · clear ${set.gateLabel}</div>
      <div style="font-size:11px;margin-top:3px;color:${current ? '#ffce54' : ring};font-weight:700;">${footer}</div>
    </div>`;
  return action
    ? `<div class="gs-clickcard" data-action='${JSON.stringify(action)}' style="cursor:pointer;margin:4px;">${inner}</div>`
    : `<div style="margin:4px;">${inner}</div>`;
}

/** The Bag & Club Sets shop (GS-bag-tiers): permanent Star-Shard upgrades that lift EVERY golfer's
 *  starting bag to a higher loot rarity (better distance clubs + a steadier putter + blinged graphics),
 *  unlocked by CLEARING the Ascension gates. The won-bag also makes the Pro Shop skip lower-rarity clubs. */
function bagSetSection(): string {
  const current = bagSet(state.bagTier);
  const currentLabel = current ? `${current.name} (${state.bagTier})` : 'Starter bag (common)';
  const nextLocked = BAG_SETS.find((s) => !bagSetUnlocked(s, state.maxAscension) && bagTierRank(s.tier) > bagTierRank(state.bagTier));
  const hint = nextLocked
    ? `Clear Ascension <b>${nextLocked.gateLabel}</b> to unlock the ${nextLocked.name}.`
    : 'Every bag tier is unlocked — outfit the deepest run.';
  // "Owned" = every tier at or below the equipped one (the starter/common tier doesn't count).
  const currentRank = bagTierRank(state.bagTier);
  const owned = currentRank > 0 ? BAG_SETS.filter((s) => bagTierRank(s.tier) <= currentRank).length : 0;
  const blurb = `Permanent upgrades that re-outfit <b>every</b> golfer's starting bag in a higher rarity — longer woods, a steadier putter, and a blingier bag for the deep-Ascension grind. Buying one also stops the Pro Shop dangling clubs below your bag's rarity. Current: <b>${currentLabel}</b>. ${hint}`;
  return marketSection('bags', '🎒', 'Bag &amp; Club Sets', owned, BAG_SETS.length, blurb, BAG_SETS.map(bagSetCardHTML).join(''));
}

/** Shared apparel card chrome — the garment art over a rarity-ringed panel with a footer. */
function apparelCardChrome(item: Apparel, footer: string, opts: { ring: string; accent: string; action?: Action; dim?: boolean; glow?: boolean }): string {
  const inner = `
    <div style="border:2px solid ${opts.accent};border-radius:12px;padding:8px 6px 6px;background:radial-gradient(circle at 50% 30%, ${opts.ring}22, #0b0d12);text-align:center;width:130px;${opts.dim ? 'opacity:.5;' : ''}${opts.glow ? `box-shadow:0 0 0 2px ${opts.accent}, 0 0 14px ${opts.ring}88;` : ''}">
      ${apparelCardSVG(item.id, 104, 64)}
      <div style="font-size:12.5px;font-weight:700;margin-top:2px;">${item.name}</div>
      <div style="font-size:10px;opacity:.55;">${item.set} · ${item.rarity}</div>
      <div style="font-size:11px;margin-top:3px;color:${opts.accent};font-weight:700;">${footer}</div>
    </div>`;
  return opts.action
    ? `<div class="gs-clickcard" data-action='${JSON.stringify(opts.action)}' style="cursor:pointer;margin:4px;">${inner}</div>`
    : `<div style="margin:4px;">${inner}</div>`;
}

/** A Trade-Market clothing card (GS-clubhouse) — buy if unowned & affordable, else "owned" / "short". */
function marketApparelCardHTML(item: Apparel): string {
  const ring = cosmeticRarCol(item.rarity);
  const owned = state.ownedApparel.includes(item.id);
  const afford = canBuyApparel(item, state.shards, state.ownedApparel);
  let footer: string;
  let action: Action | undefined;
  if (owned) {
    footer = '✓ owned';
  } else if (afford) {
    footer = `✦ ${item.cost}`;
    action = { type: 'buyApparel', id: item.id };
  } else {
    footer = `✦ ${item.cost} — short`;
  }
  return apparelCardChrome(item, footer, { ring, accent: ring, action, dim: owned || !afford, glow: isMythic(item.rarity) && !owned });
}

/** A Clubhouse wardrobe card (GS-clubhouse) — an equip toggle for an OWNED garment on the managed
 *  golfer (worn → click to take off). Only ever rendered for owned pieces. */
function clubhouseApparelCardHTML(
  item: Apparel,
  hatId: string | undefined,
  shirtId: string | undefined,
  pantsId: string | undefined,
): string {
  const ring = cosmeticRarCol(item.rarity);
  const wornId = item.slot === 'hat' ? hatId : item.slot === 'shirt' ? shirtId : pantsId;
  const worn = wornId === item.id;
  const accent = worn ? '#ffce54' : ring;
  const footer = worn ? '✓ WEARING' : 'Wear this';
  return apparelCardChrome(item, footer, { ring, accent, action: { type: 'equipApparel', id: item.id }, glow: worn || isMythic(item.rarity) });
}

// The destination biome a lane flies into (GS-journey-biome) → a glyph + label + accent for the route
// card, so picking a jump reads as choosing a world, not an unrelated surprise on arrival.
const BIOME_BADGE: Record<string, { glyph: string; label: string; col: string }> = {
  verdant: { glyph: '🌳', label: 'Verdant', col: '#5fd45a' },
  desert: { glyph: '🏜️', label: 'Desert', col: '#e0b15a' },
  frost: { glyph: '❄️', label: 'Frost', col: '#7fd6e6' },
  inferno: { glyph: '🌋', label: 'Inferno', col: '#ff6b4a' },
  void: { glyph: '🌌', label: 'Void', col: '#9a7bd0' },
  crystal: { glyph: '💎', label: 'Crystal', col: '#9fe0f5' },
  tempest: { glyph: '🌪️', label: 'Tempest', col: '#c8b8ff' },
  fungal: { glyph: '🍄', label: 'Jungle', col: '#54dba0' },
  ocean: { glyph: '🌊', label: 'Ocean', col: '#5fd49e' },
  cetus: { glyph: '🐋', label: 'Cetus', col: '#5fd8dc' },
};

// The functional family of a route event → a short pill label + accent (distinct from the rarity ring).
const EVENT_CATEGORY: Record<EventCategory, { label: string; col: string }> = {
  calm: { label: 'SAFE', col: '#2bb673' },
  payout: { label: 'PAYOUT', col: '#ffce54' },
  toll: { label: 'GAMBLE', col: '#ff8b6b' },
  salvage: { label: 'SALVAGE', col: '#4fd0e0' },
};

// A small pill token (label + accent) — shared by the travel screen + the route-info sheet.
function travelChip(txt: string, col: string): string {
  return `<span style="display:inline-block;font-size:11.5px;font-weight:700;color:${col};border:1px solid ${col}66;border-radius:5px;padding:1px 7px;">${txt}</span>`;
}

/** The route-info sheet (GS-journey-vertical): tapping a branch planet on the star-chart opens this
 *  bottom-sheet with the FULL jump detail — the world you'll play (biome + difficulty + weather), the
 *  bet's levers, and a confirm/cancel. Confirm dispatches the existing { type:'route' } action; cancel
 *  closes it so you can inspect another lane. A view overlay (module state), not reducer state. */
function routeInfoOverlay(): string {
  const r = (state.routes ?? []).find((x) => x.id === inspectRouteId);
  if (!r) return '';
  const ev = r.event;
  const credits = state.run.credits;
  const ring = rarCol(ev.rarity);
  const accent = r.elite ? '#ffce54' : ring;
  const cat = EVENT_CATEGORY[ev.category];
  const b = BIOME_BADGE[r.theme.archetype] ?? { glyph: '🪐', label: r.theme.archetype, col: '#8aa0c0' };
  const dd = routeDifficulty(ev);
  const diff =
    dd <= -0.1 ? { t: 'Gentler course', c: '#2bb673' }
    : dd < 0.07 ? { t: 'Standard course', c: '#9fb0cf' }
    : dd < 0.16 ? { t: 'Tougher course', c: '#ffb04a' }
    : { t: 'Brutal course', c: '#ff6b4a' };
  const eff = COURSE_EFFECTS[routeEffect(ev)];

  // The lane's levers, each its own readable token.
  const tags: string[] = [];
  if (ev.creditMult !== 1) {
    const pct = Math.round((ev.creditMult - 1) * 100);
    tags.push(travelChip(`${pct > 0 ? '+' : ''}${pct}% credits`, pct >= 0 ? '#ffce54' : '#ff8b6b'));
  }
  if (ev.cutDelta !== 0) tags.push(travelChip(`cut ${ev.cutDelta > 0 ? '+' : ''}${ev.cutDelta}`, ev.cutDelta > 0 ? '#ff8b6b' : '#2bb673'));
  if (ev.creditToll) {
    const afford = credits >= ev.creditToll;
    tags.push(travelChip(`−${ev.creditToll} toll${afford ? '' : ' ⚠'}`, '#ff8b6b'));
  }
  if (ev.shardBonus) tags.push(travelChip(`✦ +${ev.shardBonus} shards`, '#4fd0e0'));
  // The weather's play hooks (GS-journey-variety wind; GS-journey-fx-2 carry + ground twists): the
  // sky is a real lever now — say EXACTLY what it does to your golf, computed from the same tables
  // the physics read so the card can never drift from the course.
  const windMult = effectWindMult(eff.id);
  if (windMult > 1) tags.push(travelChip(`💨 winds +${Math.round((windMult - 1) * 100)}%`, '#ff8b6b'));
  else if (windMult < 1) tags.push(travelChip(`🍃 still air −${Math.round((1 - windMult) * 100)}%`, '#2bb673'));
  const carryMult = effectCarryMult(eff.id);
  if (carryMult > 1) tags.push(travelChip(`🎈 shots fly +${Math.round((carryMult - 1) * 100)}%`, '#2bb673'));
  else if (carryMult < 1) tags.push(travelChip(`⚓ shots fly −${Math.round((1 - carryMult) * 100)}%`, '#ff8b6b'));
  tags.push(travelChip(`↗ +${r.distanceJump} distance`, '#9fb0cf'));

  const markers = [
    r.bossAhead ? `<span style="color:#ff8b6b;font-weight:700;">⚔ Boss ahead</span>` : '',
    r.elite ? `<span style="color:#ffce54;font-weight:700;">🔥 Harder path</span>` : '',
  ]
    .filter(Boolean)
    .join('&nbsp;·&nbsp;');

  const tollWarn =
    ev.creditToll && credits < ev.creditToll
      ? `<div style="font-size:12px;color:#ff8b6b;margin-top:6px;">⚠ You can't cover the ${ev.creditToll}-credit toll (you have ${credits}).</div>`
      : '';

  // The effect's GEOMETRIC play hook (tents / craters / turf patches) gets its own loud line — the
  // consequence you'll actually putt around, not just sky-dressing (GS-journey-fx-2).
  const playLine = eff.play
    ? `<div style="font-size:12.5px;margin:4px 0 0;color:#ffce54;font-weight:600;">🎯 ${eff.play}</div>`
    : '';
  const effLine =
    eff.id !== 'none'
      ? `<div style="font-size:13px;margin:8px 0 0;opacity:.9;">${eff.icon} <b>${eff.label}</b> · <span style="opacity:.75;">${eff.blurb}</span></div>${playLine}`
      : '';

  return `
    <div class="gs-sheet-backdrop" data-route="close">
      <div class="gs-sheet gs-routesheet" data-route="keep" style="--rs-accent:${accent};">
        <div class="gs-sheet-head">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <div style="flex:0 0 auto;width:52px;height:52px;border-radius:13px;background:radial-gradient(circle at 35% 30%, ${b.col}44, #0c1020);border:2px solid ${accent};display:flex;align-items:center;justify-content:center;font-size:28px;">${b.glyph}</div>
            <div style="min-width:0;">
              <div style="font-size:12px;font-weight:700;color:${b.col};line-height:1.1;">${b.label} world</div>
              <b style="font-size:19px;line-height:1.15;display:block;">${r.theme.name}</b>
            </div>
          </div>
          <button class="gs-mapbtn" data-route="close" title="Close">✕</button>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:2px 0 10px;">
          ${travelChip(ev.icon + ' ' + ev.label, accent)}
          ${travelChip(ev.rarity.toUpperCase(), ring)}
          ${travelChip(cat.label, cat.col)}
          ${travelChip(diff.t, diff.c)}
        </div>

        <div style="font-size:13.5px;opacity:.95;margin-bottom:4px;">${ev.desc}</div>
        <div style="font-size:12.5px;opacity:.6;font-style:italic;margin-bottom:6px;">${ev.lore}</div>
        ${effLine}

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">${tags.join('')}</div>
        ${markers ? `<div style="font-size:12.5px;margin-top:8px;">${markers}</div>` : ''}
        ${tollWarn}

        <div style="display:flex;gap:9px;margin-top:16px;">
          <button class="gs-btn gs-btn--block" data-route="close" style="flex:1 1 0;">Cancel</button>
          ${btn(`🚀 Jump to ${r.theme.name}`, { type: 'route', routeId: r.id }, { variant: 'primary', block: true, borderColor: accent })}
        </div>
      </div>
    </div>`;
}

function travelScreen(): string {
  const routeList = state.routes ?? [];
  const credits = state.run.credits;

  // The starmap (GS-routes, GS-journey-vertical): three tappable branch planets across the TOP → YOU →
  // the travelled trail winding DOWN to Earth at the bottom. Tapping a planet opens its info sheet.
  const zoneName = themeById(state.course.meta?.themeId ?? '')?.name ?? 'Deep Space';
  const choices: StarmapChoice[] = routeList.map((r) => ({
    id: r.id,
    label: r.event.label,
    icon: r.event.icon,
    rarity: r.event.rarity,
    distanceJump: r.distanceJump,
    // The world this lane flies into (GS-journey-biome) — so the map planet reads the biome you'll play.
    archetype: r.theme.archetype,
    worldName: r.theme.name,
    // The atmospheric effect this lane brings (GS-journey-fx) — previewed as a small planet badge.
    effectIcon: COURSE_EFFECTS[routeEffect(r.event)].icon,
    elite: r.elite,
    bossAhead: r.bossAhead,
  }));
  // The travelled trail: every cleared stop BEFORE the current one (which is YOU), oldest → newest,
  // labelled with its zone name AND its real-sky position (GS-galaxy-map) — so the journey plots a
  // true path through the constellations as it builds. Each node wears its world's biome glyph
  // (GS-journey-history) so a cleared step reads as the world you played.
  const trail = state.run.history.slice(0, -1).map((h) => {
    const name = themeById(h.themeId ?? '')?.name ?? 'Deep Space';
    const sky = skyCoordForName(name);
    const badge = BIOME_BADGE[archetypeFor(h.themeId, h.biome)];
    return { label: name, ra: sky?.ra, dec: sky?.dec, glyph: badge?.glyph, col: badge?.col };
  });
  const map = journeyMapHTML({
    seed: state.run.seed,
    stopIndex: state.run.stopIndex,
    distanceFromStart: state.run.distanceFromStart,
    currentLabel: zoneName,
    trail,
    choices,
    shipId: shipForCharacter(state, state.run.loadout.characterId),
  });

  // Push-your-luck cash-out (GS-bank): bank the run now to lock its credits in as permanent shards
  // (busting at the next cut would forfeit them). Shown with the exact shard payout so the "push or
  // bank" call is informed. Lives below the map (under Earth) — the secondary "quit while ahead" exit.
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
  const safeNote = routeList.some((r) => r.event.cutDelta <= 0)
    ? "There's a safer option here."
    : '<span style="color:#ff8b6b;">Out here, every lane is a gamble — or bank the run below.</span>';
  return `
    ${header()}
    <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:2px 0 3px;">
      <h2 style="font-size:18px;margin:0;letter-spacing:0.6px;background:linear-gradient(90deg,#ffce54,#7fd6e6);-webkit-background-clip:text;background-clip:text;color:transparent;">◆ CHOOSE YOUR JUMP</h2>
      <span style="flex:0 0 auto;font-size:11px;font-weight:700;color:#9fb0cf;border:1px solid var(--gs-line);border-radius:999px;padding:2px 9px;white-space:nowrap;">🛰 dist ${state.run.distanceFromStart}</span>
    </div>
    <p style="opacity:.75;font-size:13px;margin:0 0 10px;">Tap a glowing world up top to preview where you'll play &amp; its bet, then confirm the jump. Deeper jumps raise the cut. ${safeNote}</p>
    ${map}
    ${bankBtn}`;
}

/** Assemble the voyage-victory takeover's payload (GS-victory) from the finished run + the meta deltas
 *  `runEndUpdates` just banked. `lastClubUnlock` is set ONLY on a genuinely new Ascension clear (a higher
 *  `maxAscension`) — so its presence is the signal to hero the "new tier unlocked" banner. Presentation-
 *  only: resolves display strings + colours here, keeping `celebrations.ts` free of sim/loot imports. */
function victoryInfo(): Parameters<typeof showVoyageVictory>[0] {
  const r = state.run;
  const unlock = state.lastClubUnlock; // present ⇔ a NEW tier was cleared this run
  const isNewClear = unlock !== undefined;
  const bagUnlock = bagUnlockForClearedAscension(r.ascension);
  // A stable numeric confetti seed from the (number|string) run seed.
  const seedNum = Number.isFinite(Number(r.seed))
    ? Number(r.seed)
    : [...String(r.seed)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 0);
  return {
    golferName: getCharacter(r.loadout.characterId)?.shortName ?? 'Your golfer',
    ascension: r.ascension,
    tierUnlocked: isNewClear && r.ascension < ASCENSION_MAX ? r.ascension + 1 : undefined,
    atMaxAscension: r.ascension >= ASCENSION_MAX,
    club:
      unlock?.kind === 'club'
        ? { name: unlock.clubName, rarity: unlock.rarity, color: rarCol(unlock.rarity) }
        : undefined,
    consolationShards: unlock?.kind === 'shards' ? unlock.shards : undefined,
    bag: bagUnlock ? { name: bagUnlock.name, cost: bagUnlock.cost, color: rarCol(bagUnlock.tier) } : undefined,
    shardsEarned: state.lastRunShards ?? 0,
    shardsTotal: state.shards,
    seed: seedNum,
  };
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
  // A cleared Ascension gate (A2/A6/A11) unlocks a new default-bag tier in the Trade Market (GS-bag-tiers).
  const bagUnlock = won ? bagUnlockForClearedAscension(r.ascension) : undefined;
  const bagNotice = bagUnlock
    ? `<div style="margin:8px 0;padding:8px 11px;border-left:3px solid ${rarCol(bagUnlock.tier)};border-radius:8px;background:#ffffff08;display:flex;align-items:center;gap:9px;">
         <div style="width:56px;flex:0 0 auto;">${drawGolfBag(bagUnlock.tint, bagUnlock.tier)}</div>
         <div style="font-size:13px;"><b style="color:${rarCol(bagUnlock.tier)};">🎒 New bag unlocked!</b> Clearing ${bagUnlock.gateLabel} unlocks the <b>${bagUnlock.name}</b> at the Trade Market — upgrade <b>every</b> golfer's starting bag to ${bagUnlock.tier} for <b>✦ ${bagUnlock.cost}</b> Star Shards.</div>
       </div>`
    : '';
  // Ascension victory club unlock (GS-ascension-clubs): the played golfer permanently gains a new
  // starting club (or a Shard consolation if their bag is already full).
  const clubUnlock = state.lastClubUnlock;
  const golferName = getCharacter(r.loadout.characterId)?.shortName ?? 'your golfer';
  const clubNotice =
    won && clubUnlock
      ? clubUnlock.kind === 'club'
        ? `<div style="margin:8px 0;padding:8px 11px;border-left:3px solid ${rarCol(clubUnlock.rarity)};border-radius:8px;background:#ffffff08;">
             <span style="font-size:13px;"><b style="color:${rarCol(clubUnlock.rarity)};">⛳ New club unlocked!</b> <b>${golferName}</b> permanently adds a ${clubUnlock.rarity} <b>${clubUnlock.clubName}</b> to their starting bag — kept for every future run with them.</span>
           </div>`
        : `<div style="margin:8px 0;padding:8px 11px;border-left:3px solid var(--gs-gold);border-radius:8px;background:#ffffff08;">
             <span style="font-size:13px;"><b style="color:var(--gs-gold);">🎒 Bag complete!</b> <b>${golferName}</b> already carries every club, so your victory pays a bonus <b>✦ ${clubUnlock.shards}</b> Star Shards.</span>
           </div>`
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
    ${clubNotice}
    ${bagNotice}
    ${earned !== undefined ? `<p style="font-size:15px;color:#e08a2b;">✦ Earned <b>${earned}</b> Star Shards · ${state.shards} banked</p>` : ''}
    <p style="opacity:.8;">Best ever: distance <b>${state.bestDistance}</b>, Stableford <b>${state.bestStableford}</b>.</p>
    <div style="margin-top:8px;">
      ${btn('🚀 Trade Market', { type: 'openMarket' }, { variant: 'ghost' })}
      ${btn('🚀 New run', { type: 'restart', seed: freshRunSeed() }, { variant: 'primary' })}
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
/** The current stop's atmospheric course effect (GS-journey-fx), stamped on the course meta by the
 *  chosen route. Render-only flavour fed to both renderers. */
function currentEffect(): string | undefined {
  return state.course?.meta?.effect;
}

/** Rainbow Ball (GS-rainbow): whether the live loadout has armed Rainbow Road. Baked into the render
 *  options at the app boundary (like `lefty()`), so the renderer paints the rainbow ribbon + the sim's
 *  OOB-off-road rule (both keyed off the same loadout flag) stay in lock-step. */
function rainbowActive(): boolean {
  return !!state.run?.loadout?.rainbowRoad;
}

/** Trade-camp tents (GS-tents): whether the current stop's route armed the green's collidable tents.
 *  Baked into the render options (the ring is drawn in course space) — the sim's bounce is keyed off the
 *  SAME course effect (`playerHoleOpts`), so the graphic and the physics stay in lock-step. */
function tentsActive(): boolean {
  return currentEffect() === 'tradeMarket';
}

/** Meteor-strike scorch craters (GS-meteor-scorch): whether the current stop's route charred the turf.
 *  Baked into the render options exactly like the tents — the sim's lie conversion keys off the SAME
 *  course effect (`playerHoleOpts`), so the drawn craters and the physics stay in lock-step. */
function scorchActive(): boolean {
  return currentEffect() === 'meteorShower';
}

/** Effect ground patches (GS-journey-fx-2): which turf-patch family the current stop's route armed
 *  (comet stardust / frostfall ice / debris wreckage), or undefined. Baked into the render options
 *  exactly like the scorch craters — the sim's lie conversion keys off the SAME course effect. */
function patchActive(): PatchKind | undefined {
  return effectPatchKind(currentEffect());
}

/** The per-hole weather seed — shared by the play view + the aim/putt overlay so the sky reads
 *  identically across screens (a quiet hand-off from lining up to watching the shot). */
function weatherSeed(hole: Hole): number {
  return (Math.round(hole.tee[0] * 7 + hole.green[1] * 13 + hole.par * 101) >>> 0) ^ 0x51ed;
}

/**
 * Mount the animated, SCREEN-SPACE weather overlay over the aim/putt map (GS-journey-fx rework) so the
 * sky + air are alive while you line up — not just during ball flight (the in-flight view draws the
 * SAME weather from the shared module). `up` orients the wind to read true relative to the shot. A
 * transparent, pointer-events-none canvas so the pull-to-shot gesture passes straight through.
 */
function mountWeatherOverlay(el: HTMLElement, hole: Hole, up: Vec): void {
  const cw = Math.round(el.clientWidth || DMAP_W);
  const ch = Math.round(el.clientHeight || DMAP_H);
  if (cw < 2 || ch < 2) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = cw * dpr;
  cv.height = ch * dpr;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;border-radius:10px;';
  el.appendChild(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  // Wind screen-direction via a projector oriented the same way the map is (shot pointing up).
  const proj = holeProjector(hole, { width: cw, height: ch, focus: hole.tee, up, viewRadius: 80, focusBias: DMAP_BIAS });
  const rad = ((hole.wind?.dir ?? 0) * Math.PI) / 180;
  const a = proj.project(hole.tee);
  const b = proj.project([hole.tee[0] + Math.sin(rad), hole.tee[1] + Math.cos(rad)]);
  let wdx = b[0] - a[0];
  let wdy = b[1] - a[1];
  const wl = Math.hypot(wdx, wdy) || 1;
  // Star-mask (GS-rough-frame): this overlay sits on the SVG decision map, whose land now fills to
  // the OB frame — but the local projector above is only wind-orientation, NOT the map's exact fit,
  // so a projected land mask would lie. Land dominates the aim framing on every normal hole, so the
  // pinned twinkle stars are simply kept off the whole overlay there; a lost-rough hole or Rainbow
  // Road is mostly open deep, where the twinkle belongs (unmasked). Shooting star/meteors/ambient
  // air stay on either way — motion sells them as sky, not ground.
  const landDominant = !rainbowActive() && !(hole.biomeMods?.some((m) => m.kind === 'roughLie') ?? false);
  const overlayMask: Vec[][] = [
    [
      [0, 0],
      [cw, 0],
      [cw, ch],
      [0, ch],
    ],
  ];
  const w = createWeather({
    effect: currentEffect() ?? 'none',
    width: cw,
    height: ch,
    archetype: archetypeFor(holeThemeId(hole), holeBiome(hole) ?? ''),
    windSpd: hole.wind?.spd ?? 0,
    windDir: [wdx / wl, wdy / wl],
    seed: weatherSeed(hole),
    starMask: () => (landDominant ? overlayMask : null),
  });
  const reduced = getSettings().reducedMotion;
  let raf = 0;
  let live = true;
  const tick = (now: number): void => {
    if (!live || !cv.isConnected) return;
    ctx.clearRect(0, 0, cw, ch);
    w.draw(ctx, now);
    if (!reduced) raf = requestAnimationFrame(tick);
  };
  tick(performance.now());
  weatherOverlay = {
    destroy() {
      live = false;
      cancelAnimationFrame(raf);
      cv.remove();
    },
  };
}

/** The selected golfer's on-course look (GS-18), or undefined → the loader-crew cap cycle. A bought
 *  themed club set (GS-proshop-2) adds the `gear` glow so the golfer swings the club you bought. */
function golferLook(): GolferLook | undefined {
  const base = getCharacter(state.run.loadout.characterId)?.style;
  if (!base) return undefined;
  const gear = equippedGearTheme(state.run.loadout);
  // Layer the PLAYED character's equipped cosmetic hat/shirt (GS-clubhouse) over their base colours.
  const cid = state.run.loadout.characterId;
  const hat = apparelById(hatForCharacter(state, cid))?.look;
  const shirtStyle = apparelById(shirtForCharacter(state, cid))?.look;
  const pantsStyle = apparelById(pantsForCharacter(state, cid))?.look;
  return {
    ...base,
    ...(gear ? { gear: { theme: gear.theme, tint: gear.tint } } : {}),
    ...(hat ? { hat } : {}),
    ...(shirtStyle ? { shirtStyle } : {}),
    ...(pantsStyle ? { pantsStyle } : {}),
  };
}

/** The team-duel setup for the current stop (GS-team-duel) — prefers the live match state, else recompute. */
function teamDuel(): TeamDuelSetup | undefined {
  return state.match?.setup ?? teamDuelSetupForRun(state.run);
}

/** A friendly label for a team-duel format. */
function teamFormatLabel(fmt: 'bestball' | 'scramble'): string {
  return fmt === 'scramble' ? 'Scramble' : 'Best Ball';
}

/** A one-line rule reminder for a team-duel format. */
function teamFormatRule(fmt: 'bestball' | 'scramble'): string {
  return fmt === 'scramble'
    ? 'both hit every shot, play on from the better ball'
    : 'both play your own ball; the better hole score counts';
}

/** The partner Character for a side of the team duel (player or boss), from the setup. */
function teamPartnerChar(setup: TeamDuelSetup): Character | undefined {
  if (setup.partnerSide === 'player' && setup.playerPartnerId) return getCharacter(setup.playerPartnerId);
  if (setup.partnerSide === 'boss' && setup.bossPartnerId) return getCharacter(setup.bossPartnerId);
  return undefined;
}

/**
 * Best-ball end-of-hole REVEAL (GS-team-duel): the pair's two cards side by side — each ball's
 * strokes + score name — with the counting (better) one highlighted and badged. Ties keep the
 * player's ball (`betterPlayedHole` keeps the first). This is the moment the partner's hidden
 * parallel ball is shown, so the reveal lands with the hole, never mid-play.
 */
function bestBallRevealHTML(raw: PlayedHole, partnerHole: PlayedHole, par: number): string {
  const duel = teamDuel();
  const partner = duel ? teamPartnerChar(duel) : undefined;
  const youChar = getCharacter(state.run.loadout.characterId ?? '');
  const partnerKept = partnerHole.record.strokes < raw.record.strokes;
  const card = (label: string, h: PlayedHole, kept: boolean, accent: string): string => {
    const rel = h.record.strokes - par;
    const col = h.pickedUp ? '#ff6b6b' : rel < 0 ? '#5fd45a' : rel === 0 ? 'var(--gs-ink)' : rel === 1 ? '#ffce54' : '#ff6b6b';
    return `<div style="flex:1 1 0;min-width:0;text-align:center;padding:12px 8px 9px;border-radius:10px;position:relative;
        border:2px solid ${kept ? accent : 'var(--gs-line-2)'};background:${kept ? `${accent}1a` : '#0d1016'};
        ${kept ? `box-shadow:0 0 14px ${accent}55;` : 'opacity:.62;'}">
      ${kept ? `<div style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:${accent};color:#0b0d12;font-size:9px;font-weight:800;letter-spacing:.08em;border-radius:5px;padding:1px 7px;white-space:nowrap;">✓ COUNTS</div>` : ''}
      <div style="font-size:11px;font-weight:700;opacity:.85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</div>
      <div style="font-size:30px;font-weight:800;line-height:1.15;color:${col};">${h.pickedUp ? '—' : h.record.strokes}</div>
      <div style="font-size:11px;opacity:.75;">${h.pickedUp ? 'Picked up' : scoreName(par, h.record.strokes)}</div>
    </div>`;
  };
  return `<div style="max-width:460px;">
      <div style="display:flex;gap:10px;align-items:stretch;">
        ${card(`You · ${youChar?.name ?? 'Player'}`, raw, !partnerKept, youChar?.style.cap ?? '#5fd45a')}
        ${card(partner?.name ?? 'Partner', partnerHole, partnerKept, partner?.style.cap ?? '#7aa2ff')}
      </div>
      <div style="font-size:11px;opacity:.65;margin-top:8px;text-align:center;">🤝 Best ball — the better score is the team's for the hole.</div>
    </div>`;
}

/** A scouting note on the opponent — their style tagline (GS-team-duel / scouting line). */
function opponentScouting(id: string): string {
  const g = getGolfer(id);
  if (!g) return '';
  return getArchetype(g.archetypeId).tagline;
}

/** The hired named caddy's id (GS-caddy), or undefined — drawn in the play-view/putt-meter corner. */
function caddyId(): string | undefined {
  return namedCaddyOwned(state.run.loadout.perks);
}

/** Play a caddy's signature voice line + haptic when its effect fires in the play view (GS-caddy-
 *  voices) — wired to the play view's `onCaddyEffect`. Gated/guarded inside `speakCaddy`. */
function playCaddyVoice(id: string): void {
  const v = CADDY_VOICE[id as keyof typeof CADDY_VOICE];
  if (!v) return;
  speakCaddy(v.speech, v.lang, { rate: v.rate, pitch: v.pitch });
  haptic(HAPTICS.caddy);
}

/** Ball bonks a trade-camp tent (GS-tents): the canvas already pops an "Ow!"/"Watch it!" bubble — back
 *  it with a soft bonk sound, a haptic, and a spoken yelp (a startled trader). Pure feel; guarded. */
function playTentBonk(text: string): void {
  sfx.bonk();
  haptic(HAPTICS.tap);
  speakCaddy(text, 'en-GB', { rate: 1.1, pitch: 1.2 });
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
  if (weatherOverlay) {
    weatherOverlay.destroy();
    weatherOverlay = null;
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
      birdCelebratedHole = -1;
      decisionRadius = null;
      resetMapView();
    }
    animatingPlay = pendingAnimation(state.play);
  }

  // The route-info sheet is only meaningful on the travel screen; clear it the moment we leave so a
  // stale id (route ids repeat 1..3 each stop) can't auto-reopen a sheet on the next travel screen.
  if (state.screen !== 'travel') inspectRouteId = null;

  const body =
    state.screen === 'title'
      ? titleScreen()
      : state.screen === 'character'
      ? characterScreen(state.unlockedClubsByCharacter)
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
      : state.screen === 'trademarket'
      ? tradeMarketScreen()
      : state.screen === 'clubhouseHall'
      ? clubhouseHallScreen()
      : state.screen === 'clubhouse'
      ? clubhouseScreen()
      : gameoverScreen();

  // The interactive play screen (decision / watching / putting — but not the hole-complete card) is
  // full-bleed: the map fills the page, so drop the page frame's padding/max-width for it.
  const fullBleed = state.screen === 'playing' && !!state.play && !state.play.done;
  // The character-select roster wants a wider frame so all four golfers line up across one screen.
  const wide = state.screen === 'character';
  const routeSheet = state.screen === 'travel' && inspectRouteId != null ? routeInfoOverlay() : '';
  app.innerHTML = `<main class="gs-main${fullBleed ? ' gs-main--bleed' : ''}${wide ? ' gs-main--wide' : ''}">${body}</main>${settingsOpen ? settingsOverlay() : ''}${routeSheet}`;
  app.setAttribute('data-booted', '1'); // tell the boot watchdog the app painted

  // Wire actions.
  app.querySelectorAll<HTMLElement>('[data-action]').forEach((el) => {
    el.addEventListener('click', () => dispatch(JSON.parse(el.dataset.action!) as Action));
  });
  // Shop bag-inventory: tap an owned gear chip to pop its card (toggle), for comparison with the stock.
  app.querySelectorAll<HTMLElement>('[data-inspect]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.inspect!;
      inspectGearId = inspectGearId === id ? null : id;
      render();
    });
  });
  // Trade Market accordion: tap a section header to collapse/expand its card rack (view-only).
  app.querySelectorAll<HTMLElement>('[data-toggle-section]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.toggleSection!;
      if (collapsedMarketSections.has(id)) collapsedMarketSections.delete(id);
      else collapsedMarketSections.add(id);
      render();
    });
  });
  // Clubhouse stage: tap a body part or the garage to reveal that slot's picker (tap again to close).
  app.querySelectorAll<HTMLElement>('[data-clubslot]').forEach((el) => {
    el.addEventListener('click', () => {
      const slot = el.dataset.clubslot as ClubSlot;
      clubhouseSlot = clubhouseSlot === slot ? null : slot;
      sfx.click();
      haptic(HAPTICS.tap);
      render();
    });
  });
  // Travel star-chart: tap a branch planet to open its route-info sheet; tap the backdrop / close /
  // Cancel to dismiss it (the sheet's Confirm is a normal [data-action] route dispatch). getAttribute
  // (not dataset) so it works on SVG <g> nodes too.
  app.querySelectorAll<HTMLElement>('[data-route-inspect]').forEach((el) => {
    el.addEventListener('click', () => {
      inspectRouteId = Number(el.getAttribute('data-route-inspect'));
      sfx.click();
      haptic(HAPTICS.tap);
      render();
    });
  });
  app.querySelectorAll<HTMLElement>('[data-route]').forEach((el) => {
    el.addEventListener('click', (e) => {
      // The sheet card itself is data-route="keep" — clicks inside it must NOT close it.
      if (el.getAttribute('data-route') === 'keep') {
        e.stopPropagation();
        return;
      }
      inspectRouteId = null;
      render();
    });
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
  // ◄/► nudge the manual-putt AIM (GS-greens-3) to read the break, then re-render so the dotted
  // break line + readout track. Step in yards; held within a sensible window.
  app.querySelectorAll<HTMLElement>('[data-putt-aim]').forEach((el) => {
    el.addEventListener('click', () => {
      selPuttAim = Math.max(-12, Math.min(12, (selPuttAim ?? 0) + Number(el.dataset.puttAim) * 0.4));
      render();
    });
  });
  // Fringe/apron (GS-fringe-putt): toggle between the putt meter (⛳) and the normal chip gesture (🏌).
  app.querySelectorAll<HTMLElement>('[data-putt-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      selPutt = el.dataset.puttToggle === '1';
      render();
    });
  });

  // Mount the manual-putt pace meter when the ball is on the green awaiting a manual putt.
  if (state.screen === 'playing' && state.play && !animatingPlay && !state.play.done && (awaitingPutt(state.play) || (canPuttFringe(state.play) && selPutt))) {
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
        onCommit: (pace) => dispatch({ type: 'putt', control: { pace, aim: puttAimResolved } }),
      });
    }
  }

  // Animated weather over the aim/putt map (GS-journey-fx rework): the sky + air are alive while you
  // line up, drawn by the SAME shared module the in-flight view uses. Skipped while a shot animates
  // (the play view owns the canvas + draws its own weather then).
  if (state.screen === 'playing' && state.play && !animatingPlay) {
    const wEl = document.querySelector<HTMLElement>('[data-weather]');
    if (wEl) {
      const ball = state.play.ball;
      const pin = pinOf(state.play.hole);
      mountWeatherOverlay(wEl, state.play.hole, [pin[0] - ball[0], pin[1] - ball[1]]);
    }
  }

  // Draw the hired caddy into each framed gold badge on screen (the decision screen's bottom-left
  // figure, the putting screen's, and the watch screen's bottom-right portrait, GS-fullmap). The play
  // view draws its own corner guard while animating; these framed badges cover the aim-and-charge,
  // putting, and watch screens. Each badge canvas carries its caddy id in `data-caddy`, so this one
  // generic pass serves every screen. A one-shot draw per render (the idle bob updates whenever the
  // screen re-renders — live while charging), so no rAF.
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
        biome: holeBiome(hole), themeId: holeThemeId(hole), effect: currentEffect(),
        rainbow: rainbowActive(),
        tradeTents: tentsActive(),
        meteorScorch: scorchActive(),
        groundPatch: patchActive(),
        golferLook: golferLook(),
        caddyId: caddyId(),
        lefty: lefty(),
        onImpact: (kind, quality) => (kind === 'shot' ? sfx.swing(quality ?? 0.6) : sfx.putt()),
        onCaddyEffect: playCaddyVoice,
        onTentHit: playTentBonk,
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
        biome: holeBiome(play.hole), themeId: holeThemeId(play.hole), effect: currentEffect(),
        tradeTents: tentsActive(),
        meteorScorch: scorchActive(),
        groundPatch: patchActive(),
        golferLook: golferLook(),
        caddyId: caddyId(),
        lefty: lefty(),
        onCaddyEffect: playCaddyVoice,
        onTentHit: playTentBonk,
        focus,
        // Start the watch-cam at the EXACT zoom the decision map was framed at (the player was just
        // looking at it — release must not skip-jump), falling back to the travel-framed reach when
        // no decision preceded this animation (resume, auto-advance). The radius holds for the whole
        // animation; the follow-cam pans to keep up with the ball either way.
        viewRadius: animatingPlay.shots.length ? decisionRadius ?? decisionReach(travel) : 25,
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
          // A holed −2 / −3 that ISN'T an ace earns its own fly-over (GS-bird). Ace wins precedence
          // (a holed-out par-4 is technically an albatross, but a hole-in-one is the bigger moment).
          const relToPar = play.holed ? play.strokes - play.hole.par : 0;
          const birdKind: 'eagle' | 'albatross' | null =
            play.done && play.holed && !isAce
              ? relToPar <= -3 ? 'albatross' : relToPar === -2 ? 'eagle' : null
              : null;
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
          } else if (birdKind && birdCelebratedHole !== play.holeIndex) {
            birdCelebratedHole = play.holeIndex;
            popupTimer = window.setTimeout(() => {
              popupTimer = 0;
              showBirdCelebration(
                birdKind,
                { holeNo: play.holeIndex + 1, par: play.hole.par, club: lastShot?.club.name },
                () => render(),
              );
            }, feelMs.birdDelayMs ?? 380);
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
