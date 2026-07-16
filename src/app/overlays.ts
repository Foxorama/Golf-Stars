/**
 * The app shell's modal OVERLAYS — self-contained render functions that ride over the current
 * screen (settings sheet, the one-off Trade Market price notice, the scramble/mulligan/foresight
 * ball-choice card, the shot-result popup). Each is a pure `() => string` reading the live state;
 * whether it's shown (and the view flags that gate it) lives in app.ts's render()/playingBody().
 */

import { state } from './ctx';
import { teamDuel, teamPartnerChar } from './duelHud';
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
import { getSettings, type Settings } from '../settings';

/** The three default-aim modes, as a SEGMENTED radio control (GS-default-aim): big real-button tap
 *  targets, so there's no fiddly native `<select>` to mis-tap (the old dropdown only opened on its
 *  text and near-misses landed on the adjacent "Return to title" row — a jarring accidental exit). */
const AIM_OPTS: readonly { id: Settings['aimMode']; icon: string; label: string; desc: string }[] = [
  { id: 'auto', icon: '◎', label: 'Auto', desc: 'Smart — down the fairway off the tee, at the flag on an approach.' },
  { id: 'attack', icon: '🚩', label: 'Attack', desc: 'Always aim straight at the flag.' },
  { id: 'safe', icon: '🛟', label: 'Safe', desc: 'Lay up to the fat of the fairway and green.' },
];

/**
 * The settings sheet: player-owned feel/control prefs grouped into sections (Audio / Feel / Aim assist),
 * plus — anywhere but the title itself — a clearly-separated "Return to title" footer (GS-settings-nav).
 * An underway run is parked as a resumable snapshot, never destroyed. Every interactive element carries
 * a `data-*` hook whose app.ts handler stops propagation, so a tap (or a near-miss) can never bubble to
 * the backdrop and tear the sheet down (the old native `<select>` mis-tap → accidental exit).
 */
export function settingsOverlay(): string {
  const s = getSettings();
  const row = (key: keyof Settings, label: string, desc: string): string => {
    const on = s[key];
    return `<button class="gs-setrow" data-setting="${key}" role="switch" aria-checked="${on}">
      <span class="gs-setlabel"><b>${label}</b><span>${desc}</span></span>
      <span class="gs-toggle${on ? ' gs-toggle--on' : ''}" aria-hidden="true"><span class="gs-knob"></span></span>
    </button>`;
  };
  const aimBtns = AIM_OPTS.map(
    (o) => `<button class="gs-seg${s.aimMode === o.id ? ' gs-seg--on' : ''}" data-selaim="${o.id}" role="radio" aria-checked="${s.aimMode === o.id}">
        <span class="gs-seg-i" aria-hidden="true">${o.icon}</span><span class="gs-seg-t">${o.label}</span>
      </button>`,
  ).join('');
  const activeAim = AIM_OPTS.find((o) => o.id === s.aimMode) ?? AIM_OPTS[0]!;
  const midRun = state.run.status === 'active' && !!state.run.loadout.characterId;
  const homeFoot =
    state.screen === 'title'
      ? ''
      : `<div class="gs-setfoot">
          <button class="gs-setrow gs-setrow--nav" data-settings-home="1">
            <span class="gs-setlabel"><b>🏠 Return to title</b><span>${midRun ? 'Your run is saved — continue it any time' : 'Back to the main menu'}</span></span>
            <span style="font-size:16px;opacity:.6;" aria-hidden="true">→</span>
          </button>
        </div>`;
  return `
    <div class="gs-sheet-backdrop" data-settings="close">
      <div class="gs-sheet gs-settings" data-settings="keep">
        <div class="gs-sheet-head"><b style="font-size:17px;">⚙ Settings</b>
          <button class="gs-mapbtn" data-settings="close" title="Close">✕</button></div>

        <div class="gs-setsec">Audio</div>
        ${row('sound', 'Sound', 'Chimes & contact cues (no downloads)')}
        ${row('music', 'Music', 'Ambient world themes — a different mood per world')}

        <div class="gs-setsec">Feel</div>
        ${row('haptics', 'Haptics', 'Vibration feedback on supported phones')}
        ${row('fastShots', 'Fast shots', 'Skip the tap after each shot — roll straight on')}
        ${row('leftHanded', 'Left-handed', 'Swing and aim mirrored for lefties')}
        ${row('reducedMotion', 'Reduced motion', 'Calmer effects & celebrations')}

        <div class="gs-setsec">🎯 Aim assist</div>
        <div class="gs-setnote">How every shot is pre-aimed. Change it mid-round with the ◎ button too.</div>
        <div class="gs-segctl" role="radiogroup" aria-label="Default aim mode">${aimBtns}</div>
        <div class="gs-seghint">${activeAim.desc}</div>

        ${homeFoot}
        <div class="gs-setdone">
          <button class="gs-btn gs-btn--primary" data-settings="close" style="padding:11px 30px;">Done</button>
        </div>
      </div>
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
 * The interactive SCRAMBLE ball-choice screen (GS-team-duel): both balls just hit from the same spot
 * are shown — on an inline map (player line + partner line) and as two info cards with lie + distance
 * to the pin — and the player CONFIRMS which to play on from. A real scramble decision: take the safe
 * one in the fairway, or the aggressive one nearer the pin.
 */
export function scrambleChoiceOverlay(): string {
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
  // A fortune-teller MULLIGAN (GS-tent-interactions) and a Prognostic Parrot FORESIGHT (GS-caddy-parrot)
  // both reuse this "choose your ball" card, but both balls are the player's OWN swing — so each is
  // titled for its source and the two options read "A/B" rather than naming a partner.
  const isMulligan = !!sc.mulligan;
  const isPreview = !!sc.preview;
  const heading = isMulligan
    ? { title: '🔮 FORTUNE\'S MULLIGAN — PICK YOUR TEE SHOT', sub: 'The fortune teller gifted a second tee shot — keep whichever line you like best.' }
    : isPreview
    ? { title: '🦜 PROGNOSTIC PARROT — PICK YOUR SHOT', sub: 'The captain foresaw the shot & played it twice — keep whichever ball you like best.' }
    : { title: '🤝 SCRAMBLE — CHOOSE YOUR BALL', sub: `You and ${partner?.name ?? 'your partner'} both hit — play on from the better lie.` };
  const labelA = isPreview ? 'Vision A' : isMulligan ? 'Tee shot A' : 'Your ball';
  const labelB = isPreview ? 'Vision B' : isMulligan ? 'Tee shot B' : `${partner?.name ?? 'Partner'}'s ball`;
  return `
    <div style="position:fixed;inset:0;background:rgba(5,7,11,0.82);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px;overflow:auto;">
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
 *  settled so each shot gets its own beat before the next decision. */
export function shotPopupOverlay(): string {
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
