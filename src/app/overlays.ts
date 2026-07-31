/**
 * The app shell's modal OVERLAYS — self-contained render functions that ride over the current
 * screen (settings sheet, the one-off Trade Market price notice, the scramble/mulligan/foresight
 * ball-choice card, the shot-result popup). Each is a pure `() => string` reading the live state;
 * whether it's shown (and the view flags that gate it) lives in app.ts's render()/playingBody().
 */

import { state } from './ctx';
import { exitPrompt, resumePromise } from '../ui/back';
import { teamDuel, teamPartnerChar } from './duelHud';
import { getCharacter } from '../sim/rpg/characters';
import { storyPartnerName } from '../sim/rpg/storyPartners';
import {
  holeBiome,
  holeThemeId,
  patchActive,
  rainbowActive,
  scorchActive,
  tentsActive,
} from './helpers';
import { renderHoleSVG } from '../render/holeView';
import { shotCardHTML } from '../render/cards';
import { pinOf } from '../sim/round';
import { dist } from '../sim/course/contract';
import { getSettings, clampUiScale, type Settings } from '../settings';
import { backupNudge, describeBackup, type Backup } from '../save/backup';
import { storageHealth } from '../save/durability';
import { faultExplanation, faultHeadline, faultRescue, saveIntegrity } from '../save/integrity';

/**
 * Save-transfer view state (GS-save-transfer) — an exported mutable view object, the documented
 * pattern for per-screen UI state (see `docs/decisions/ui-intro.md` → GS-app-split): app.ts's
 * handlers mutate the FIELDS and call `refreshSettings()`, because cross-module `let` reassignment
 * is illegal in ESM and a full `render()` would replay the sheet's slide-up as a flicker.
 *
 * `stage` drives the Save data section:
 *  - `idle`    — the two buttons
 *  - `confirm` — a file has been read and PARSED; its contents are summarised and the player has to
 *                say yes before anything is overwritten. This step is the safety: import replaces
 *                everything, so it must never happen on a single tap of a file picker.
 *  - `note`    — a transient result line (exported / copied / imported / refused), `message` set.
 */
export const saveView: { stage: 'idle' | 'confirm' | 'note'; pending: Backup | null; message: string; bad: boolean } = {
  stage: 'idle',
  pending: null,
  message: '',
  bad: false,
};

/**
 * What the browser is actually doing with the save (GS-save-durability) — three honest states, on
 * the one screen a player looking for save answers already opens.
 *
 * The middle state is the interesting one and the reason this is not just an error line: storage
 * that WORKS is still evictable (iOS Safari clears a browser site after 7 days idle; every browser
 * evicts under pressure), so "saving normally" is a weaker promise than players assume and it would
 * be dishonest to print a green tick and stop. Where the browser has granted persistence, it says so
 * plainly; where it hasn't, it names installing as the thing that usually earns it.
 */
function storageStatusHTML(): string {
  if (!storageHealth.writable) {
    return `<div class="gs-savenote gs-savenote--bad">⚠ This browser isn't letting the game save — nothing is being written. Export now to keep this session.</div>`;
  }
  if (storageHealth.persisted) {
    return `<div class="gs-setnote">✓ Saving normally, and this browser has agreed to <b>keep</b> your save rather than clear it to reclaim space.</div>`;
  }
  return `<div class="gs-setnote">✓ Saving normally — though a browser can still clear site data to reclaim space, or after a long time away. Installing the game usually earns it protected storage; an exported file always survives.</div>`;
}

/** The Save data section of the settings sheet. `localStorage` is the only copy of a save AND it is
 *  per-origin, so the website and the Android shell cannot see each other's progress — moving
 *  between them, or off a device before an uninstall, is what this is for. */
function saveDataSection(): string {
  if (saveView.stage === 'confirm' && saveView.pending) {
    const b = saveView.pending;
    const when = b.exportedAt ? new Date(b.exportedAt).toLocaleString() : 'unknown date';
    return `
        <div class="gs-setsec">💾 Save data</div>
        <div class="gs-savebox">
          <div class="gs-savebox-h">Replace your save with this file?</div>
          <div class="gs-setnote" style="margin:0 0 6px;">Saved ${when}</div>
          <ul class="gs-savelist">${describeBackup(b).map((l) => `<li>${l}</li>`).join('')}</ul>
          <div class="gs-savewarn">⚠ This overwrites everything on this device — shards, unlocks, and any Story Tour campaign. It cannot be undone.</div>
          <div class="gs-saverow">
            <button class="gs-btn gs-btn--ghost" data-save-transfer="cancel">Cancel</button>
            <button class="gs-btn gs-btn--primary" data-save-transfer="apply">Replace my save</button>
          </div>
        </div>`;
  }
  const note = saveView.stage === 'note' && saveView.message
    ? `<div class="gs-savenote${saveView.bad ? ' gs-savenote--bad' : ''}">${saveView.message}</div>`
    : '';
  // READ-ONLY because boot found data it couldn't read (GS-save-integrity). Export is REPLACED, not
  // merely disabled: it is built from `loadSave()`, which handed back an empty default, so the normal
  // button would write a file containing nothing and call it a backup. Import stays — it is the way
  // out, and `applyBackup` clears the fault before it writes.
  const fault = saveIntegrity.fault;
  if (fault) {
    return `
        <div class="gs-setsec">💾 Save data</div>
        <div class="gs-savenote gs-savenote--bad">⚠ ${faultHeadline(fault)} ${faultExplanation(fault)}</div>
        <div class="gs-setnote">${faultRescue(fault)}</div>
        <div class="gs-saverow">
          <button class="gs-btn gs-btn--ghost" data-save-transfer="rescue" style="flex:1;">⬇ Download the stored data as-is</button>
        </div>
        <div class="gs-saverow">
          <button class="gs-btn gs-btn--ghost" data-save-transfer="import" style="flex:1;">⬆ Import a backup and start saving again</button>
        </div>
        ${note}
        <input type="file" id="gs-save-file" accept="application/json,.json" hidden>`;
  }
  // GS-backup-nudge: how overdue a backup is, in RUNS. `null` = nothing worth saying (a save with no
  // finished run behind it, or one exported this run) — a warning that fires every time is wallpaper.
  const nudge = backupNudge({ clubhouseVisit: state.clubhouseVisit, lastExportRun: state.lastExportRun });
  return `
        <div class="gs-setsec">💾 Save data</div>
        <div class="gs-setnote">Your progress lives only on this device, and the website and the app store it separately. Export to move a save between them — or to keep a backup.</div>
        ${storageStatusHTML()}
        ${nudge ? `<div class="gs-savenote${nudge.urgent ? ' gs-savenote--bad' : ''}">${nudge.urgent ? '⚠ ' : ''}${nudge.text}</div>` : ''}
        <div class="gs-saverow">
          <button class="gs-btn gs-btn--ghost" data-save-transfer="export">⬇ Export save</button>
          <button class="gs-btn gs-btn--ghost" data-save-transfer="import">⬆ Import save</button>
        </div>
        <div class="gs-saverow">
          <button class="gs-btn gs-btn--ghost" data-save-transfer="copy" style="flex:1;">📋 Copy save to clipboard</button>
        </div>
        ${note}
        <input type="file" id="gs-save-file" accept="application/json,.json" hidden>`;
}

/** The three default-aim modes, as a SEGMENTED radio control (GS-default-aim): big real-button tap
 *  targets, so there's no fiddly native `<select>` to mis-tap (the old dropdown only opened on its
 *  text and near-misses landed on the adjacent "Return to title" row — a jarring accidental exit). */
const AIM_OPTS: readonly { id: Settings['aimMode']; icon: string; label: string; desc: string }[] = [
  { id: 'auto', icon: '◎', label: 'Auto', desc: 'Smart — down the fairway off the tee, at the flag on an approach.' },
  { id: 'attack', icon: '🚩', label: 'Attack', desc: 'Always aim straight at the flag.' },
  { id: 'safe', icon: '🛟', label: 'Safe', desc: 'Lay up to the fat of the fairway and green.' },
];

/** The on/off preference toggles, bundled into compact icon CHIPS (GS-settings-chips) laid out
 *  two-per-row so the whole Audio + Feel block takes a fraction of the height the old full-width
 *  toggle rows did. Each chip is a real on/off switch — icon + label + a mini switch, tinted green
 *  when on — with its longer description carried on `aria-label`/`title` for a11y & desktop hover. */
const TOGGLE_CHIPS: readonly { key: keyof Settings; icon: string; label: string; desc: string }[] = [
  { key: 'sound', icon: '🔊', label: 'Sound', desc: 'Chimes & contact cues (no downloads)' },
  { key: 'music', icon: '🎵', label: 'Music', desc: 'Ambient per-world themes' },
  { key: 'haptics', icon: '📳', label: 'Haptics', desc: 'Vibration feedback on supported phones' },
  { key: 'fastShots', icon: '⚡', label: 'Fast shots', desc: 'Skip the tap after each shot — roll straight on' },
  { key: 'leftHanded', icon: '🤚', label: 'Left-handed', desc: 'Swing and aim mirrored for lefties' },
  { key: 'reducedMotion', icon: '🌙', label: 'Reduced motion', desc: 'Calmer effects & celebrations' },
  { key: 'readableFont', icon: '🔤', label: 'Readable text', desc: 'A clearer typeface with roomier letter and word spacing' },
];

/** UI scale, as the same SEGMENTED control the aim modes use (GS-a11y-readable-text). A discrete
 *  ladder rather than a slider: each rung is checked to keep the play screen's commit row on
 *  screen, and it scales the 38px map buttons up past a 44px touch target on the way. */
const SCALE_OPTS: readonly { v: number; label: string; desc: string }[] = [
  { v: 1, label: 'Normal', desc: 'The ship default.' },
  { v: 1.15, label: 'Large', desc: 'Everything 15% bigger — text and buttons together.' },
  { v: 1.3, label: 'Larger', desc: '30% bigger. Roomy targets, less of the map.' },
  { v: 1.45, label: 'Largest', desc: '45% bigger. Maximum legibility; the map gets tight.' },
];

/**
 * The settings sheet's INNER content (everything inside `.gs-settings`), split out so an in-sheet
 * toggle / aim change can re-render it SURGICALLY (`refreshSettings` in app.ts) without re-mounting the
 * `.gs-sheet` element. Re-mounting replays the sheet's slide-up animation, which read as a flicker on
 * every tap of a toggle or aim button (GS-settings-flicker). The player-owned feel/control prefs are
 * grouped into sections (Audio / Feel / Aim assist), plus — anywhere but the title itself — a
 * clearly-separated "Return to title" footer (GS-settings-nav); an underway run is parked as a
 * resumable snapshot, never destroyed. Every interactive element carries a `data-*` hook whose app.ts
 * handler stops propagation, so a tap (or a near-miss) can never bubble to the backdrop and tear the
 * sheet down (the old native `<select>` mis-tap → accidental exit).
 */
export function settingsSheetInner(): string {
  const s = getSettings();
  const chip = (key: keyof Settings, icon: string, label: string, desc: string): string => {
    const on = s[key];
    return `<button class="gs-setchip${on ? ' gs-setchip--on' : ''}" data-setting="${key}" role="switch" aria-checked="${on}" aria-label="${label}: ${desc}" title="${desc}">
      <span class="gs-setchip-i" aria-hidden="true">${icon}</span>
      <span class="gs-setchip-t">${label}</span>
      <span class="gs-setchip-sw" aria-hidden="true"></span>
    </button>`;
  };
  const chips = (keys: (keyof Settings)[]): string =>
    TOGGLE_CHIPS.filter((c) => keys.includes(c.key)).map((c) => chip(c.key, c.icon, c.label, c.desc)).join('');
  const aimBtns = AIM_OPTS.map(
    (o) => `<button class="gs-seg${s.aimMode === o.id ? ' gs-seg--on' : ''}" data-selaim="${o.id}" role="radio" aria-checked="${s.aimMode === o.id}">
        <span class="gs-seg-i" aria-hidden="true">${o.icon}</span><span class="gs-seg-t">${o.label}</span>
      </button>`,
  ).join('');
  const activeAim = AIM_OPTS.find((o) => o.id === s.aimMode) ?? AIM_OPTS[0]!;
  const scale = clampUiScale(s.uiScale);
  const scaleBtns = SCALE_OPTS.map(
    (o) => `<button class="gs-seg${scale === o.v ? ' gs-seg--on' : ''}" data-selscale="${o.v}" role="radio" aria-checked="${scale === o.v}">
        <span class="gs-seg-i" aria-hidden="true" style="font-size:${Math.round(11 * o.v)}px;line-height:20px;">A</span><span class="gs-seg-t">${o.label}</span>
      </button>`,
  ).join('');
  const activeScale = SCALE_OPTS.find((o) => o.v === scale) ?? SCALE_OPTS[0]!;
  const midRun = state.run.status === 'active' && !!state.run.loadout.characterId;
  const homeFoot =
    state.screen === 'title'
      ? ''
      : `<div class="gs-setfoot">
          <button class="gs-setrow gs-setrow--nav" data-settings-home="1">
            <!-- GS-save-slots: EVERY exit says what leaving costs, in the same words — this footer is a
                 second way out of a round that used to promise only a vague "continue it any time",
                 while the back-button confirm beside it named the rule. Both read \`resumePromise\`. -->
            <span class="gs-setlabel"><b>🏠 Return to title</b><span>${midRun ? resumePromise(state) : 'Back to the main menu'}</span></span>
            <span style="font-size:16px;opacity:.6;" aria-hidden="true">→</span>
          </button>
        </div>`;
  return `
        <div class="gs-sheet-head"><b style="font-size:17px;">⚙ Settings</b>
          <button class="gs-mapbtn" data-settings="close" title="Close">✕</button></div>

        <div class="gs-setsec">Audio</div>
        <div class="gs-chipgrid">${chips(['sound', 'music'])}</div>

        <div class="gs-setsec">Feel</div>
        <div class="gs-chipgrid">${chips(['haptics', 'fastShots', 'leftHanded'])}</div>

        <div class="gs-setsec">♿ Accessibility</div>
        <div class="gs-chipgrid">${chips(['reducedMotion', 'readableFont'])}</div>
        <div class="gs-setnote">Text size — scales the buttons with it, so targets stay easy to hit.</div>
        <div class="gs-segctl" role="radiogroup" aria-label="Text and interface size">${scaleBtns}</div>
        <div class="gs-seghint">${activeScale.desc}</div>

        <div class="gs-setsec">🎯 Aim assist</div>
        <div class="gs-setnote">How every shot is pre-aimed. Change it mid-round with the ◎ button too.</div>
        <div class="gs-segctl" role="radiogroup" aria-label="Default aim mode">${aimBtns}</div>
        <div class="gs-seghint">${activeAim.desc}</div>

        ${saveDataSection()}

        ${homeFoot}
        <div class="gs-setdone">
          <button class="gs-btn gs-btn--primary" data-settings="close" style="padding:11px 30px;">Done</button>
        </div>`;
}

/** The full settings overlay: the dismissible backdrop + the sheet frame wrapping `settingsSheetInner`.
 *  The frame stays mounted across in-sheet updates so its slide-up animation plays once, on open. */
export function settingsOverlay(): string {
  return `
    <div class="gs-sheet-backdrop" data-settings="close">
      <div class="gs-sheet gs-settings" data-settings="keep">${settingsSheetInner()}</div>
    </div>`;
}

/**
 * The one-off Trade Market price-cut notice (GS-trade-rebalance) — shown once, over any screen, when
 * the save migration refunded shards for the 40% price drop. A single "Got it" close button dispatches
 * `dismissPriceNotice`, which clears the flag so it never returns. Reuses the settings sheet chrome.
 */
export function priceNoticeOverlay(): string {
  const refund = state.priceRefund ?? 0;
  return `
    <div class="gs-sheet-backdrop" style="align-items:center;">
      <div class="gs-sheet" style="max-width:380px;text-align:center;">
        <div style="font-size:34px;margin:2px 0 6px;">🛰️</div>
        <b style="font-size:19px;">Trade Market Update</b>
        <p style="margin:12px 0 6px;color:var(--gs-ink);line-height:1.5;">
          Every Trade Market price — ships, apparel, and club sets — has been cut by <b>40%</b>.
        </p>
        <p style="margin:6px 0 4px;line-height:1.5;">
          You've been refunded the difference on everything you already own:
        </p>
        <div style="font-size:24px;font-weight:800;color:var(--gs-gold, #e08a2b);margin:10px 0 4px;">
          ✦ +${refund.toLocaleString()} Star Shards
        </div>
        <div style="opacity:.7;font-size:13px;margin-bottom:14px;">added to your balance</div>
        <button class="gs-btn gs-btn--primary" data-action='${JSON.stringify({ type: 'dismissPriceNotice' })}' style="padding:11px 30px;">Got it</button>
      </div>
    </div>`;
}

/**
 * The LEAVE-THE-ROUND confirm (GS-android-back) — raised when back (Android hardware button, or
 * Escape) is pressed inside a run. Reuses the shared `.gs-sheet` chrome the price notice already
 * borrows rather than minting new screen classes, so there is no new global CSS to collide with.
 *
 * Copy comes from `exitPrompt` (ui/back.ts), not from here, so the wording is derived from the same
 * state as the decision and stays honest: leaving does NOT lose the run, it replays the stop.
 * "Keep playing" is the primary action — the safe choice should be the fat one under a thumb, since
 * back is easy to press by accident.
 *
 * NO tap-to-dismiss backdrop, deliberately: `[data-action]` handlers are bound per element with no
 * `stopPropagation`, so an action on the backdrop would ALSO fire on every click that bubbles out of
 * the card. Back/Escape and "Keep playing" are the dismiss paths.
 */
export function exitConfirmOverlay(): string {
  const { title, body, confirmLabel } = exitPrompt(state);
  return `
    <div class="gs-sheet-backdrop" style="align-items:center;">
      <div class="gs-sheet gs-exit" style="max-width:360px;text-align:center;">
        <div style="font-size:30px;margin:2px 0 6px;">⛳</div>
        <b style="font-size:18px;">${title}</b>
        <p style="margin:10px 0 16px;line-height:1.5;color:var(--gs-dim);">${body}</p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="gs-btn gs-btn--primary" data-action='${JSON.stringify({ type: 'cancelExit' })}'
            style="padding:11px 24px;">Keep playing</button>
          <button class="gs-btn gs-btn--ghost" data-action='${JSON.stringify({ type: 'toTitle' })}'
            style="padding:10px 24px;">${confirmLabel}</button>
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
export function scrambleChoiceOverlay(): string {
  const sc = state.scrambleChoice!;
  const duel = teamDuel();
  // The partner: a team-duel partner (boss stop), else the Story Sigil's chosen partner (GS-story-sigil-play),
  // so the card names your actual friend instead of a generic "partner".
  const partner = duel
    ? teamPartnerChar(duel)
    : state.run.storyTournamentPartner
    ? getCharacter(state.run.storyTournamentPartner)
    : undefined;
  // GS-story-sigil5-npc / GS-story-coil-partners: the partner on a story round is not always a playable
  // character — the Herald finale shares a ball with a Coil CHAMPION, and on the Coil path every paired
  // qualifying event is played beside a Coil agent. `storyPartnerName` resolves all three kinds.
  const partnerName =
    partner?.name ?? (state.run.storyTournamentPartner ? storyPartnerName(state.run.storyTournamentPartner) : undefined);
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
  // A fortune-teller MULLIGAN (GS-tent-interactions) and a Prognostic Parrot FORESIGHT (GS-caddy-parrot)
  // both reuse this "choose your ball" card, but both balls are the player's OWN swing — so each is
  // titled for its source and the two options read "A/B" rather than naming a partner.
  const isMulligan = !!sc.mulligan;
  const isPreview = !!sc.preview;
  const heading = isMulligan
    ? { title: '🔮 FORTUNE\'S MULLIGAN — PICK YOUR TEE SHOT', sub: 'The fortune teller gifted a second tee shot — keep whichever line you like best.' }
    : isPreview
    ? { title: '🦜 PROGNOSTIC PARROT — PICK YOUR SHOT', sub: 'The captain foresaw the shot & played it twice — keep whichever ball you like best.' }
    : { title: '🤝 SCRAMBLE — CHOOSE YOUR BALL', sub: `You and ${partnerName ?? 'your partner'} both hit — play on from the better lie.` };
  const labelA = isPreview ? 'Vision A' : isMulligan ? 'Tee shot A' : 'Your ball';
  const labelB = isPreview ? 'Vision B' : isMulligan ? 'Tee shot B' : `${partnerName ?? 'Partner'}'s ball`;
  return `
    <div data-gs-overlay="scramble" style="position:fixed;inset:0;background:rgba(5,7,11,0.82);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px;overflow:auto;">
      <div style="display:flex;flex-direction:column;gap:11px;max-width:360px;width:100%;">
        <div style="text-align:center;">
          <div style="font-size:13px;font-weight:800;letter-spacing:.08em;color:#ffce54;">${heading.title}</div>
          <div style="font-size:11.5px;opacity:.75;margin-top:2px;">${heading.sub}</div>
        </div>
        <div style="border-radius:10px;overflow:hidden;border:1px solid var(--gs-line-2);line-height:0;align-self:center;">${map}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          ${option(labelA, sc.player, sc.playerDistToPin, 'player', '#5fd45a')}
          ${option(labelB, sc.partner, sc.partnerDistToPin, 'partner', isPreview ? '#ffce54' : isMulligan ? '#c39bd3' : partner?.style.cap ?? '#7aa2ff')}
        </div>
      </div>
    </div>`;
}

/** Modal shot-result popup: the just-played shot's card + a Continue, shown after the shot has
 *  settled so each shot gets its own beat before the next decision.
 *
 *  `data-gs-overlay` marks it as a layer COVERING the screen (GS-a11y-stroke-focus). Both this and
 *  the scramble choice live inside `<main>`, so `applyOverlayFocus` still ignores them (it only
 *  backgrounds direct children of the app root, deliberately) — but `focusPlayStroke` has to stand
 *  down while either is up, and asking the DOM "is something covering the decision?" is one question
 *  with one answer. The JS flag is not that answer: `awaitingShotPopup` stays true through a render
 *  that draws no popup at all (the putt frame has no `after` slot), which is exactly how the putt
 *  went unfocused while the flag said a card was up. */
export function shotPopupOverlay(): string {
  const play = state.play!;
  const last = play.shots[play.shots.length - 1];
  if (!last) return '';
  const distToPin = last.holed ? undefined : Math.round(dist(play.ball, pinOf(play.hole)));
  // The whole backdrop is a dismiss target so a tap anywhere advances — one less precise tap
  // per shot on a phone. The card itself sits above it with the explicit Continue button.
  return `
    <div data-popup-continue="1" data-gs-overlay="shot-result" style="position:fixed;inset:0;background:rgba(5,7,11,0.72);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px;overflow:auto;cursor:pointer;">
      <div style="display:flex;flex-direction:column;align-items:stretch;gap:12px;max-width:300px;width:100%;">
        ${shotCardHTML(last, { distToPin })}
        <button class="gs-btn gs-btn--primary" data-popup-continue="1" style="text-align:center;font-size:16px;padding:12px;">Continue →</button>
      </div>
    </div>`;
}
